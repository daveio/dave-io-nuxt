import type { H3Event } from "h3"
import { setHeader } from "h3"
import { type AuthResult, authorizeEndpoint } from "./auth"
import { type CloudflareRequestInfo, getCloudflareEnv, getCloudflareRequestInfo } from "./cloudflare"
import { createAuthKVCounters, writeKVMetrics } from "./kv-metrics"
import { createApiError } from "./response"

/**
 * Simplified authorization wrapper that handles the common pattern:
 * 1. Call authorizeEndpoint
 * 2. Check success
 * 3. Throw error if failed
 * 4. Write KV metrics for auth attempts
 */
export async function requireAuth(event: H3Event, endpoint: string, subResource?: string): Promise<AuthResult> {
  const startTime = Date.now()
  const authFunc = await authorizeEndpoint(endpoint, subResource)
  const auth = await authFunc(event)

  // Write KV metrics for auth attempts
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)
    const responseTime = Date.now() - startTime
    const fullEndpoint = subResource ? `${endpoint}:${subResource}` : endpoint

    if (env?.DATA) {
      const kvCounters = createAuthKVCounters(fullEndpoint, auth.success, auth.tokenSubject, cfInfo, [
        { key: `auth:response-time:${responseTime < 100 ? "fast" : responseTime < 500 ? "medium" : "slow"}` }
      ])

      await writeKVMetrics(env.DATA, kvCounters)
    }
  } catch (metricsError) {
    console.error("Failed to write auth metrics:", metricsError)
    // Continue with auth flow even if metrics fail
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

export const requireDashboardAuth = (event: H3Event, resource?: string) => requireAuth(event, "dashboard", resource)

export const requireAdminAuth = (event: H3Event) => requireAuth(event, "admin")
