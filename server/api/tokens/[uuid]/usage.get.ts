import { createApiResponse, createApiError } from "~/server/utils/response"
import { authorizeEndpoint } from "~/server/utils/auth"

interface TokenUsage {
  uuid: string
  requestCount: number
  lastUsed: string | null
  isRevoked: boolean
  maxRequests?: number
  createdAt: string
  rateLimitRemaining?: number
}

// Simulated token usage database - in production this would be KV storage
const tokenUsage = new Map<string, TokenUsage>([
  [
    "550e8400-e29b-41d4-a716-446655440000",
    {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      requestCount: 42,
      lastUsed: "2024-01-15T12:30:00Z",
      isRevoked: false,
      maxRequests: 100,
      createdAt: "2024-01-01T00:00:00Z",
      rateLimitRemaining: 58
    }
  ],
  [
    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    {
      uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      requestCount: 15,
      lastUsed: "2024-01-14T08:15:00Z",
      isRevoked: false,
      maxRequests: 50,
      createdAt: "2024-01-05T00:00:00Z",
      rateLimitRemaining: 35
    }
  ],
  [
    "revoked-token-example-uuid-here",
    {
      uuid: "revoked-token-example-uuid-here",
      requestCount: 234,
      lastUsed: "2024-01-10T15:45:00Z",
      isRevoked: true,
      maxRequests: 1000,
      createdAt: "2023-12-15T00:00:00Z",
      rateLimitRemaining: 0
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

    if (!uuid) {
      throw createApiError(400, "Token UUID is required")
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(uuid)) {
      throw createApiError(400, "Invalid UUID format")
    }

    // Get token usage from storage
    const usage = tokenUsage.get(uuid)
    if (!usage) {
      throw createApiError(404, `Token not found: ${uuid}`)
    }

    // In production, this would fetch from KV storage:
    // - auth:count:{uuid}:requests (request count)
    // - auth:count:{uuid}:last-used (last usage timestamp)
    // - auth:revocation:{uuid} (revocation status)

    return createApiResponse(usage, "Token usage retrieved successfully")
  } catch (error: any) {
    console.error("Token usage error:", error)

    if (error.statusCode) {
      throw error
    }

    throw createApiError(500, "Token usage retrieval failed")
  }
})
