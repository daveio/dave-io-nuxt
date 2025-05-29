import { authorizeEndpoint } from "~/server/utils/auth"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { TokenMetricsSchema, TokenUsageSchema } from "~/server/utils/schemas"

// Simulated token usage database - in production this would be KV storage
const tokenUsage = new Map<string, any>([
  [
    "550e8400-e29b-41d4-a716-446655440000",
    {
      token_id: "550e8400-e29b-41d4-a716-446655440000",
      usage_count: 42,
      max_requests: 100,
      created_at: "2024-01-01T00:00:00Z",
      last_used: "2024-01-15T12:30:00Z"
    }
  ],
  [
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    {
      token_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      usage_count: 15,
      max_requests: 50,
      created_at: "2024-01-05T00:00:00Z",
      last_used: "2024-01-14T08:15:00Z"
    }
  ]
])

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for token management
    const authFunc = await authorizeEndpoint("api", "tokens")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
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
      const usage = tokenUsage.get(uuid)
      if (!usage) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      const tokenData = TokenUsageSchema.parse(usage)
      return createApiResponse(tokenData, "Token usage retrieved successfully")
    } else if (path === "revoke") {
      // GET /api/tokens/{uuid}/revoke - Revoke token
      const usage = tokenUsage.get(uuid)
      if (!usage) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      // In production, this would add the JTI to a blacklist in KV storage
      // await env.KV.put(`revoked_token:${uuid}`, 'true', { expirationTtl: 86400 * 30 })

      console.log(`Token revoked: ${uuid}`)

      const revokeData = {
        revoked: true,
        token_id: uuid,
        revoked_at: new Date().toISOString()
      }

      return createApiResponse(revokeData, "Token revoked successfully")
    } else if (path === "metrics") {
      // GET /api/tokens/{uuid}/metrics - Get token metrics
      const usage = tokenUsage.get(uuid)
      if (!usage) {
        throw createApiError(404, `Token not found: ${uuid}`)
      }

      // Simulate metrics data for this specific token
      const metrics = TokenMetricsSchema.parse({
        success: true,
        data: {
          total_requests: usage.usage_count,
          successful_requests: Math.floor(usage.usage_count * 0.95),
          failed_requests: Math.floor(usage.usage_count * 0.05),
          rate_limited_requests: 0,
          last_24h: {
            total: Math.floor(usage.usage_count * 0.1),
            successful: Math.floor(usage.usage_count * 0.095),
            failed: Math.floor(usage.usage_count * 0.005)
          }
        },
        timestamp: new Date().toISOString()
      })

      return metrics
    } else {
      throw createApiError(404, `Unknown token endpoint: ${path}`)
    }
  } catch (error: any) {
    console.error("Token management error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token management failed")
  }
})
