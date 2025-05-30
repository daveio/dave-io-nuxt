import { createError, getHeader, getMethod, setResponseHeader } from "h3"
import { checkRateLimit, getRateLimitInfo, isApiError } from "~/server/utils/response"

// Error categorization for better logging and monitoring
enum ErrorCategory {
  RATE_LIMIT = "rate_limit",
  AUTH = "auth",
  VALIDATION = "validation",
  SERVICE = "service",
  INTERNAL = "internal",
  SECURITY = "security"
}

interface ErrorContext {
  requestId: string
  timestamp: string
  ip: string
  userAgent: string
  method: string
  url: string
  cfRay?: string
  country?: string
}

// Rate limiting for error responses to prevent abuse
const ERROR_RATE_LIMITS = new Map<string, { count: number; lastReset: number }>()
const ERROR_WINDOW_MS = 60000 // 1 minute
const MAX_ERRORS_PER_WINDOW = 10

function checkErrorRateLimit(ip: string): boolean {
  const now = Date.now()
  const key = `error:${ip}`
  const current = ERROR_RATE_LIMITS.get(key)

  if (!current || now - current.lastReset > ERROR_WINDOW_MS) {
    ERROR_RATE_LIMITS.set(key, { count: 1, lastReset: now })
    return true
  }

  if (current.count >= MAX_ERRORS_PER_WINDOW) {
    return false
  }

  current.count++
  return true
}

function categorizeError(error: unknown, _context: ErrorContext): ErrorCategory {
  if (isApiError(error)) {
    const statusCode = error.statusCode
    if (statusCode === 429) return ErrorCategory.RATE_LIMIT
    if (statusCode === 401 || statusCode === 403) return ErrorCategory.AUTH
    if (statusCode >= 400 && statusCode < 500) return ErrorCategory.VALIDATION
    if (statusCode >= 500) return ErrorCategory.INTERNAL
  }

  return ErrorCategory.INTERNAL
}

function logError(error: unknown, category: ErrorCategory, context: ErrorContext) {
  const logEntry = {
    level: "error",
    category,
    message: error instanceof Error ? error.message : String(error),
    context,
    timestamp: context.timestamp
  }

  // In production, this would integrate with monitoring services
  console.error("[ERROR:%s]", category.toUpperCase(), JSON.stringify(logEntry, null, 2))
}

export default defineEventHandler(async (event) => {
  // Apply to both API and redirect routes
  const url = event.node.req.url
  if (!url?.startsWith("/api/") && !url?.startsWith("/go/")) {
    return
  }

  try {
    const method = getMethod(event)
    const userAgent = getHeader(event, "user-agent") || "unknown"
    const ip = getHeader(event, "cf-connecting-ip") || getHeader(event, "x-forwarded-for") || "unknown"
    const cfRay = getHeader(event, "cf-ray") || "unknown"
    const cfCountry = getHeader(event, "cf-ipcountry") || "unknown"
    const requestId = cfRay || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create error context for potential use later
    const errorContext: ErrorContext = {
      requestId,
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      method,
      url,
      cfRay,
      country: cfCountry
    }

    // Apply rate limiting only to API routes (not redirects)
    if (url.startsWith("/api/")) {
      const env = event.context.cloudflare?.env as { DATA?: KVNamespace }

      if (!env?.DATA) {
        throw createError({
          statusCode: 503,
          statusMessage: "Service Unavailable",
          data: {
            success: false,
            error: "Rate limiting service not available",
            timestamp: new Date().toISOString()
          }
        })
      }

      const rateLimitKey = `${ip}:${method}:${url}`
      const rateLimit = await checkRateLimit(rateLimitKey, env.DATA, 100, 60000)
      if (!rateLimit.allowed) {
        throw createError({
          statusCode: 429,
          statusMessage: "Too Many Requests",
          data: {
            success: false,
            error: "Rate limit exceeded",
            meta: { retry_after: 60 },
            timestamp: new Date().toISOString()
          }
        })
      }

      const rateLimitInfo = await getRateLimitInfo(rateLimitKey, env?.DATA, 100, 60000)

      // Add API-specific headers
      setHeaders(event, {
        "X-API-Version": "1.0.0",
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": rateLimitInfo.remaining.toString(),
        "X-RateLimit-Reset": Math.floor(rateLimitInfo.resetTime / 1000).toString()
      })
    }

    // Add request logging for both API and redirect routes
    console.log(
      `[${new Date().toISOString()}] ${method} ${url} - IP: ${ip} - Country: ${cfCountry} - Ray: ${cfRay} - UA: ${userAgent}`
    )

    // Add security headers for all routes
    setHeaders(event, {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "0", // Modern browsers don't need this, can cause issues
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Worker-Environment": "cloudflare",
      "X-Request-ID": requestId
    })

    // Remove sensitive headers
    setResponseHeader(event, "X-Powered-By", "")
    setResponseHeader(event, "Server", "")

    // Store error context for use in error handling
    event.context.errorContext = errorContext
  } catch (error: unknown) {
    const errorContext = (event.context.errorContext as ErrorContext) || {
      requestId: "unknown",
      timestamp: new Date().toISOString(),
      ip: "unknown",
      userAgent: "unknown",
      method: "unknown",
      url: url || "unknown"
    }

    const category = categorizeError(error, errorContext)
    logError(error, category, errorContext)

    // Check error rate limiting
    if (!checkErrorRateLimit(errorContext.ip)) {
      throw createError({
        statusCode: 429,
        statusMessage: "Too Many Errors",
        data: {
          success: false,
          error: "Error rate limit exceeded",
          requestId: errorContext.requestId,
          timestamp: errorContext.timestamp
        }
      })
    }

    // Re-throw rate limit errors with enhanced context
    if (isApiError(error) && error.statusCode === 429) {
      const enhancedError = createError({
        statusCode: 429,
        // biome-ignore lint/suspicious/noExplicitAny: Error object structure varies and needs dynamic property access
        statusMessage: (error as any).statusMessage || "Too Many Requests",
        data: {
          // biome-ignore lint/suspicious/noExplicitAny: Error data structure is dynamic
          ...(error as any).data,
          requestId: errorContext.requestId,
          category: ErrorCategory.RATE_LIMIT
        }
      })
      throw enhancedError
    }

    // Sanitize error details for production
    const isProduction = process.env.NODE_ENV === "production"
    const errorMessage = isProduction
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Unknown error"

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: {
        success: false,
        error: errorMessage,
        requestId: errorContext.requestId,
        category,
        timestamp: errorContext.timestamp
      }
    })
  }
})
