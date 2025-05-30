import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { getValidatedUUID } from "~/server/utils/validation"

interface TokenUsage {
  uuid: string
  requestCount: number
  lastUsed: string | null
  isRevoked: boolean
  maxRequests?: number
  createdAt: string
  rateLimitRemaining?: number
}

// Get token usage from KV storage
async function getTokenUsageFromKV(uuid: string, kv?: KVNamespace): Promise<TokenUsage> {
  if (!kv) {
    throw createApiError(503, "Token storage service unavailable")
  }

  try {
    // Get basic token info and usage stats
    const [tokenData, usageData, revokedData] = await Promise.all([
      kv.get(`token:${uuid}`),
      kv.get(`auth:count:${uuid}:requests`),
      kv.get(`auth:revocation:${uuid}`)
    ])

    if (!tokenData) {
      throw createApiError(404, `Token not found: ${uuid}`)
    }

    const token = JSON.parse(tokenData)
    const requestCount = usageData ? Number.parseInt(usageData, 10) : 0
    const isRevoked = !!revokedData

    // Get last used timestamp
    const lastUsedData = await kv.get(`auth:count:${uuid}:last-used`)
    const lastUsed = lastUsedData || null

    // Calculate remaining requests if there's a limit
    const rateLimitRemaining = token.maxRequests ? Math.max(0, token.maxRequests - requestCount) : undefined

    return {
      uuid,
      requestCount,
      lastUsed,
      isRevoked,
      maxRequests: token.maxRequests,
      createdAt: token.createdAt || new Date().toISOString(),
      rateLimitRemaining
    }
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) throw error
    console.error("Failed to get token usage from KV:", error)
    throw createApiError(500, "Failed to retrieve token usage")
  }
}

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for token management using helper
    await requireAPIAuth(event, "tokens")

    // Validate UUID parameter using helper
    const uuid = getValidatedUUID(event)

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env.DATA) {
      throw createApiError(503, "Token service not available")
    }

    // Get token usage from KV storage
    const usage = await getTokenUsageFromKV(uuid, env.DATA)

    return createApiResponse(usage, "Token usage retrieved successfully")
  } catch (error: unknown) {
    console.error("Token usage error:", error)

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token usage retrieval failed")
  }
})
