import type { H3Event } from "h3"
import { type AuthResult, authorizeEndpoint } from "./auth"
import { createApiError } from "./response"

/**
 * Simplified authorization wrapper that handles the common pattern:
 * 1. Call authorizeEndpoint
 * 2. Check success
 * 3. Throw error if failed
 */
export async function requireAuth(event: H3Event, endpoint: string, subResource?: string): Promise<AuthResult> {
  const authFunc = await authorizeEndpoint(endpoint, subResource)
  const auth = await authFunc(event)

  if (!auth.success) {
    throw createApiError(401, auth.error || "Unauthorized")
  }

  return auth
}

/**
 * Convenience functions for common authorization patterns
 */
export const requireAPIAuth = (event: H3Event, resource?: string) => requireAuth(event, "api", resource)

export const requireAIAuth = (event: H3Event, resource?: string) => requireAuth(event, "ai", resource)

export const requireRouterOSAuth = (event: H3Event, resource?: string) => requireAuth(event, "routeros", resource)

export const requireDashboardAuth = (event: H3Event, resource?: string) => requireAuth(event, "dashboard", resource)

export const requireAdminAuth = (event: H3Event) => requireAuth(event, "admin")

/**
 * Rate limiting helper for AI endpoints
 * Centralizes the AI rate limiting logic
 */
export async function checkAIRateLimit(
  userId: string,
  kv?: KVNamespace,
  maxRequests = 100,
  windowMs = 60 * 60 * 1000 // 1 hour
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const windowEnd = windowStart + windowMs

  const key = `ai:rate_limit:${userId}:${windowStart}`

  try {
    if (kv) {
      const countStr = await kv.get(key)
      const currentCount = countStr ? Number.parseInt(countStr, 10) : 0

      if (currentCount >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(windowEnd)
        }
      }

      const newCount = currentCount + 1
      await kv.put(key, newCount.toString(), {
        expirationTtl: Math.ceil(windowMs / 1000) + 60 // Add 1 minute buffer
      })

      return {
        allowed: true,
        remaining: maxRequests - newCount,
        resetTime: new Date(windowEnd)
      }
    }

    // Fallback to basic rate limiting without persistence
    console.warn("KV not available for AI rate limiting")
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: new Date(windowEnd)
    }
  } catch (error) {
    console.error("AI rate limiting error:", error)
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: new Date(windowEnd)
    }
  }
}

/**
 * Set rate limit headers on response
 */
export function setRateLimitHeaders(event: H3Event, limit: number, remaining: number, resetTime: Date): void {
  setHeader(event, "X-RateLimit-Limit", limit.toString())
  setHeader(event, "X-RateLimit-Remaining", remaining.toString())
  setHeader(event, "X-RateLimit-Reset", resetTime.toISOString())
}
