import type { ApiErrorResponse, ApiSuccessResponse } from "./schemas"

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  meta?: {
    total?: number
    page?: number
    per_page?: number
    total_pages?: number
    request_id?: string
  }
  timestamp: string
}

export function createApiResponse<T>(data?: T, message?: string, meta?: ApiResponse<T>["meta"]): ApiSuccessResponse {
  const response: ApiSuccessResponse = {
    success: true,
    timestamp: new Date().toISOString()
  }

  if (data !== undefined) {
    response.data = data
  }

  if (message) {
    response.message = message
  }

  if (meta) {
    response.meta = meta
  }

  return response
}

export function createApiError(statusCode: number, message: string, details?: unknown): never {
  throw createError({
    statusCode,
    statusMessage: message,
    data: {
      success: false,
      error: message,
      details: process.env.NODE_ENV === "development" ? details : undefined,
      meta: {
        request_id: generateRequestId()
      },
      timestamp: new Date().toISOString()
    } as ApiErrorResponse
  })
}

export function validateInput(
  input: unknown,
  schema: Record<
    string,
    { required?: boolean; type?: "string" | "number" | "boolean" | "object"; maxLength?: number; pattern?: RegExp }
  >
): boolean {
  // Basic validation - in production, use a proper validation library like Zod
  if (!input || typeof input !== "object") {
    return false
  }

  const inputObj = input as Record<string, unknown>
  for (const [key, rules] of Object.entries(schema)) {
    const value = inputObj[key]
    if (rules.required && (value === undefined || value === null || value === "")) {
      return false
    }
    if (value && rules.type) {
      const valueType = typeof value
      if (valueType !== rules.type) {
        return false
      }
    }
    if (value && rules.maxLength && typeof value === "string" && value.length > rules.maxLength) {
      return false
    }
    if (value && rules.pattern && typeof value === "string" && !rules.pattern.test(value)) {
      return false
    }
  }

  return true
}

export function sanitizeInput(input: unknown): string {
  let stringValue: string
  const seen = new WeakSet()

  if (input === null) {
    stringValue = "null"
  } else if (input === undefined) {
    stringValue = "undefined"
  } else if (typeof input === "string") {
    stringValue = input
  } else if (typeof input === "number" || typeof input === "boolean") {
    stringValue = String(input)
  } else if (typeof input === "object") {
    try {
      stringValue = JSON.stringify(input)
    } catch {
      // Handle circular references
      try {
        stringValue = JSON.stringify(input, (_key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular]"
            }
            seen.add(value)
          }
          return value
        })
      } catch {
        stringValue = "[Object]"
      }
    }
  } else {
    stringValue = String(input)
  }

  // Sanitize HTML characters
  const sanitized = stringValue
    .replace(/[<>"'&]/g, (char) => {
      switch (char) {
        case "<":
          return "&lt;"
        case ">":
          return "&gt;"
        case '"':
          return "&quot;"
        case "'":
          return "&#x27;"
        case "&":
          return "&amp;"
        default:
          return char
      }
    })
    .trim()

  // Truncate if too long
  if (sanitized.length > 1000) {
    return `${sanitized.slice(0, 997)}...`
  }

  return sanitized
}

// KV-based rate limiting (requires KV storage)
export async function checkRateLimit(
  identifier: string,
  kv: KVNamespace,
  limit = 100,
  windowMs = 60000
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const windowEnd = windowStart + windowMs
  const rateLimitKey = `rate_limit:${identifier}:${windowStart}`

  try {
    // Use KV storage for persistent rate limiting
    const countStr = await kv.get(rateLimitKey)
    const currentCount = countStr ? Number.parseInt(countStr, 10) : 0

    if (currentCount >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(windowEnd)
      }
    }

    // Increment count with window expiration
    const newCount = currentCount + 1
    await kv.put(rateLimitKey, newCount.toString(), {
      expirationTtl: Math.ceil(windowMs / 1000) + 10 // Add 10s buffer
    })

    return {
      allowed: true,
      remaining: limit - newCount,
      resetTime: new Date(windowEnd)
    }
  } catch (error) {
    console.error("Rate limiting error:", error)
    throw error
  }
}

export async function getRateLimitInfo(
  identifier: string,
  kv: KVNamespace,
  limit = 100,
  windowMs = 60000
): Promise<{ remaining: number; resetTime: number }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const windowEnd = windowStart + windowMs
  const rateLimitKey = `rate_limit:${identifier}:${windowStart}`

  try {
    const countStr = await kv.get(rateLimitKey)
    const currentCount = countStr ? Number.parseInt(countStr, 10) : 0
    return {
      remaining: Math.max(0, limit - currentCount),
      resetTime: windowEnd
    }
  } catch (error) {
    console.error("Rate limit info error:", error)
    return { remaining: limit, resetTime: windowEnd }
  }
}

function generateRequestId(): string {
  // Use crypto.randomUUID if available in Worker runtime, fallback to timestamp+random
  try {
    return `req_${crypto.randomUUID()}`
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
}

// Type guard for API errors
export function isApiError(error: unknown): error is { statusCode: number; message?: string } {
  return typeof error === "object" && error !== null && "statusCode" in error
}
