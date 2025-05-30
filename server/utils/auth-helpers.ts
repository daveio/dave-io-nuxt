import type { H3Event } from "h3"
import { createAuthKVCounters, createRateLimitKVCounters, writeAnalytics } from "./analytics"
import { type AuthResult, authorizeEndpoint } from "./auth"
import { getCloudflareEnv, getCloudflareRequestInfo } from "./cloudflare"
import { createApiError } from "./response"

/**
 * Simplified authorization wrapper that handles the common pattern:
 * 1. Call authorizeEndpoint
 * 2. Check success
 * 3. Throw error if failed
 * 4. Write analytics for auth attempts
 */
export async function requireAuth(event: H3Event, endpoint: string, subResource?: string): Promise<AuthResult> {
  const startTime = Date.now()
  const authFunc = await authorizeEndpoint(endpoint, subResource)
  const auth = await authFunc(event)

  // Write detailed analytics for auth attempts
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)
    const responseTime = Date.now() - startTime
    const fullEndpoint = subResource ? `${endpoint}:${subResource}` : endpoint

    const analyticsEvent = {
      type: "auth" as const,
      timestamp: new Date().toISOString(),
      cloudflare: cfInfo,
      data: {
        success: auth.success,
        tokenSubject: auth.tokenSubject || "unknown",
        endpoint: fullEndpoint
      }
    }

    const kvCounters = createAuthKVCounters(fullEndpoint, auth.success, auth.tokenSubject, cfInfo, [
      { key: `auth:response-time:${responseTime < 100 ? "fast" : responseTime < 500 ? "medium" : "slow"}` }
    ])

    await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
  } catch (analyticsError) {
    console.error("Failed to write auth analytics:", analyticsError)
    // Continue with auth flow even if analytics fails
  }

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
 * Centralizes the AI rate limiting logic with analytics tracking
 */
export async function checkAIRateLimit(
  userId: string,
  kv?: KVNamespace,
  analytics?: AnalyticsEngineDataset,
  maxRequests = 100,
  windowMs = 60 * 60 * 1000, // 1 hour
  cfInfo?: { userAgent: string; ip: string; country: string; ray: string }
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const windowEnd = windowStart + windowMs

  const key = `ai:rate_limit:${userId}:${windowStart}`

  try {
    if (kv) {
      const countStr = await kv.get(key)
      const currentCount = countStr ? Number.parseInt(countStr, 10) : 0

      const result = {
        allowed: currentCount < maxRequests,
        remaining: Math.max(0, maxRequests - currentCount - (currentCount < maxRequests ? 1 : 0)),
        resetTime: new Date(windowEnd)
      }

      // Write analytics for rate limit check
      if (analytics && cfInfo) {
        const analyticsEvent = {
          type: "rate_limit" as const,
          timestamp: new Date().toISOString(),
          cloudflare: cfInfo,
          data: {
            action: result.allowed ? "allowed" : ("blocked" as "throttled" | "blocked" | "warning"),
            endpoint: "ai",
            tokenSubject: userId,
            requestsInWindow: currentCount,
            windowSizeMs: windowMs,
            maxRequests: maxRequests,
            remainingRequests: result.remaining,
            resetTime: result.resetTime.toISOString()
          }
        }

        const kvCounters = createRateLimitKVCounters(
          result.allowed ? "allowed" : "blocked",
          "ai",
          userId,
          currentCount,
          cfInfo,
          [
            { key: `rate-limits:ai:${result.allowed ? "allowed" : "blocked"}` },
            { key: `rate-limits:ai:by-user:${userId.replace(/[^a-z0-9]/g, "-")}:total` }
          ]
        )

        await writeAnalytics(true, analytics, kv, analyticsEvent, kvCounters)
      }

      // Update the rate limit counter
      if (result.allowed) {
        const newCount = currentCount + 1
        await kv.put(key, newCount.toString(), {
          expirationTtl: Math.ceil(windowMs / 1000) + 60 // Add 1 minute buffer
        })
      }

      return result
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
