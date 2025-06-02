import { recordAPIErrorMetrics, recordAPIMetrics } from "~/server/middleware/metrics"
import { authorizeEndpoint } from "~/server/utils/auth"
import { getCloudflareEnv } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { TokenMetricsSchema, TokenUsageSchema } from "~/server/utils/schemas"

interface TokenUsageData {
  token_id: string
  usage_count: number
  max_requests: number
  created_at: string
  last_used: string
}

export default defineEventHandler(async (event) => {
  const _startTime = Date.now()
  let _authToken: string | null = null
  let uuid: string | undefined
  let path: string | undefined

  try {
    // Check authorization for token management
    const authFunc = await authorizeEndpoint("api", "tokens")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    _authToken = auth.payload?.sub || null

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env?.DATA) {
      throw createApiError(503, "Token service not available")
    }

    uuid = getRouterParam(event, "uuid")
    path = getRouterParam(event, "path")

    if (!uuid) {
      throw createApiError(400, "Token UUID is required")
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(uuid)) {
      throw createApiError(400, "Invalid UUID format")
    }

    // Handle different paths
    if (!path) {
      // GET /api/tokens/{uuid} - Get token usage
      const tokenKey = `token:${uuid}`
      const tokenData = await env.DATA.get(tokenKey)

      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      const usage: TokenUsageData = JSON.parse(tokenData)
      const validatedUsage = TokenUsageSchema.parse(usage)

      // Record successful metrics
      await recordAPIMetrics(event, 200)

      return createApiResponse(validatedUsage, "Token usage retrieved successfully")
    }
    if (path === "revoke") {
      // GET /api/tokens/{uuid}/revoke - Revoke token (legacy endpoint)
      const tokenKey = `token:${uuid}`
      const tokenData = await env.DATA.get(tokenKey)

      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      // Add the token to revocation blacklist
      await env.DATA.put(`revoked_token:${uuid}`, "true", { expirationTtl: 86400 * 30 })

      console.log(`Token revoked: ${uuid}`)

      const revokeData = {
        revoked: true,
        token_id: uuid,
        revoked_at: new Date().toISOString()
      }

      // Record successful metrics
      await recordAPIMetrics(event, 200)

      return createApiResponse(revokeData, "Token revoked successfully")
    }
    if (path === "metrics") {
      // GET /api/tokens/{uuid}/metrics - Get token metrics
      const tokenKey = `token:${uuid}`
      const tokenData = await env.DATA.get(tokenKey)

      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      const _usage: TokenUsageData = JSON.parse(tokenData)

      // Get real metrics data from KV counters for this specific token
      const [totalRequests, successfulRequests, failedRequests, rateLimitedRequests] = await Promise.all([
        env.DATA.get(`metrics:tokens:${uuid}:requests:total`).then((v) => Number.parseInt(v || "0")),
        env.DATA.get(`metrics:tokens:${uuid}:requests:successful`).then((v) => Number.parseInt(v || "0")),
        env.DATA.get(`metrics:tokens:${uuid}:requests:failed`).then((v) => Number.parseInt(v || "0")),
        env.DATA.get(`metrics:tokens:${uuid}:requests:rate-limited`).then((v) => Number.parseInt(v || "0"))
      ])

      const [last24hTotal, last24hSuccessful, last24hFailed] = await Promise.all([
        env.DATA.get(`metrics:tokens:${uuid}:24h:total`).then((v) => Number.parseInt(v || "0")),
        env.DATA.get(`metrics:tokens:${uuid}:24h:successful`).then((v) => Number.parseInt(v || "0")),
        env.DATA.get(`metrics:tokens:${uuid}:24h:failed`).then((v) => Number.parseInt(v || "0"))
      ])

      const metrics = TokenMetricsSchema.parse({
        success: true,
        data: {
          total_requests: totalRequests,
          successful_requests: successfulRequests,
          failed_requests: failedRequests,
          rate_limited_requests: rateLimitedRequests,
          last_24h: {
            total: last24hTotal,
            successful: last24hSuccessful,
            failed: last24hFailed
          }
        },
        timestamp: new Date().toISOString()
      })

      // Record successful metrics
      await recordAPIMetrics(event, 200)

      return metrics
    }
    throw createApiError(404, `Unknown token endpoint: ${path}`)
  } catch (error: unknown) {
    console.error("Token management error:", error)

    // Record error metrics
    await recordAPIErrorMetrics(event, error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token management failed")
  }
})
