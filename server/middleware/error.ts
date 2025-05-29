import { createError, getHeader, getMethod, setResponseHeader } from "h3"
import { checkRateLimit, getRateLimitInfo, isApiError } from "~/server/utils/response"

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

    // Apply rate limiting only to API routes (not redirects)
    if (url.startsWith("/api/")) {
      const env = event.context.cloudflare?.env as { DATA?: KVNamespace }
      const rateLimitKey = `${ip}:${method}:${url}`

      const rateLimit = await checkRateLimit(rateLimitKey, env?.DATA, 100, 60000)
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
      "X-Worker-Environment": "cloudflare"
    })

    // Remove sensitive headers
    setResponseHeader(event, "X-Powered-By", "")
    setResponseHeader(event, "Server", "")
  } catch (error: unknown) {
    console.error("Middleware error:", error)

    // Re-throw rate limit errors
    if (isApiError(error) && error.statusCode === 429) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: {
        success: false,
        error: "Middleware processing failed",
        timestamp: new Date().toISOString()
      }
    })
  }
})
