import { authorizeEndpoint } from "~/server/utils/auth"
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
  try {
    // Check authorization for token management
    const authFunc = await authorizeEndpoint("api", "tokens")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    const env = event.context.cloudflare?.env as { 
      KV?: KVNamespace
      ANALYTICS?: AnalyticsEngineDataset 
    }

    if (!env?.KV) {
      throw createApiError(503, "Token service not available")
    }

    const uuid = getRouterParam(event, "uuid")
    const path = getRouterParam(event, "path")

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
      const tokenData = await env.KV.get(tokenKey)
      
      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      const usage: TokenUsageData = JSON.parse(tokenData)
      const validatedUsage = TokenUsageSchema.parse(usage)
      return createApiResponse(validatedUsage, "Token usage retrieved successfully")
    }
    if (path === "revoke") {
      // GET /api/tokens/{uuid}/revoke - Revoke token
      const tokenKey = `token:${uuid}`
      const tokenData = await env.KV.get(tokenKey)
      
      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      // Add the token to revocation blacklist
      await env.KV.put(`revoked_token:${uuid}`, 'true', { expirationTtl: 86400 * 30 })

      console.log(`Token revoked: ${uuid}`)

      const revokeData = {
        revoked: true,
        token_id: uuid,
        revoked_at: new Date().toISOString()
      }

      return createApiResponse(revokeData, "Token revoked successfully")
    }
    if (path === "metrics") {
      // GET /api/tokens/{uuid}/metrics - Get token metrics
      const tokenKey = `token:${uuid}`
      const tokenData = await env.KV.get(tokenKey)
      
      if (!tokenData) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      const usage: TokenUsageData = JSON.parse(tokenData)

      // Get real metrics data from KV counters for this specific token
      const [totalRequests, successfulRequests, failedRequests, rateLimitedRequests] = await Promise.all([
        env.KV.get(`token:${uuid}:requests:total`).then(v => parseInt(v || "0")),
        env.KV.get(`token:${uuid}:requests:successful`).then(v => parseInt(v || "0")),
        env.KV.get(`token:${uuid}:requests:failed`).then(v => parseInt(v || "0")),
        env.KV.get(`token:${uuid}:requests:rate_limited`).then(v => parseInt(v || "0"))
      ])

      const [last24hTotal, last24hSuccessful, last24hFailed] = await Promise.all([
        env.KV.get(`token:${uuid}:24h:total`).then(v => parseInt(v || "0")),
        env.KV.get(`token:${uuid}:24h:successful`).then(v => parseInt(v || "0")),
        env.KV.get(`token:${uuid}:24h:failed`).then(v => parseInt(v || "0"))
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

      return metrics
    }
    throw createApiError(404, `Unknown token endpoint: ${path}`)
  } catch (error: unknown) {
    console.error("Token management error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token management failed")
  }
})
