import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"
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
  const startTime = Date.now()
  let authToken: string | null = null
  let uuid: string | undefined

  try {
    // Check authorization for token management using helper
    const authResult = await requireAPIAuth(event, "tokens")
    authToken = authResult?.sub || null

    // Validate UUID parameter using helper
    uuid = getValidatedUUID(event)

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env.DATA) {
      throw createApiError(503, "Token service not available")
    }

    // Get token usage from KV storage
    const usage = await getTokenUsageFromKV(uuid, env.DATA)

    // Write successful analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const analyticsEvent = {
        type: "api_request" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          endpoint: `/api/tokens/${uuid}/usage`,
          method: "GET",
          statusCode: 200,
          responseTimeMs: responseTime,
          tokenSubject: authToken || undefined
        }
      }

      const kvCounters = createAPIRequestKVCounters(`/api/tokens/${uuid}/usage`, "GET", 200, cfInfo, [
        { key: "tokens:usage:queries:total" },
        { key: `tokens:usage:${uuid}:queries` },
        { key: "tokens:usage:request-counts", value: usage.requestCount },
        { key: "tokens:usage:revoked-count", increment: usage.isRevoked ? 1 : 0 }
      ])

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write token usage success analytics:", analyticsError)
    }

    // Log successful request
    logRequest(event, "tokens/{uuid}/usage", "GET", 200, {
      tokenId: uuid,
      usage: `requests:${usage.requestCount},remaining:${usage.rateLimitRemaining || "unlimited"}`,
      isRevoked: usage.isRevoked
    })

    return createApiResponse(usage, "Token usage retrieved successfully")
  } catch (error: unknown) {
    console.error("Token usage error:", error)

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "tokens/{uuid}/usage", "GET", statusCode, {
      tokenId: uuid || "unknown",
      usage: "error",
      isRevoked: false
    })

    // Write analytics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      const analyticsEvent = {
        type: "api_request" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          endpoint: `/api/tokens/${uuid || "unknown"}/usage`,
          method: "GET",
          statusCode: statusCode,
          responseTimeMs: responseTime,
          tokenSubject: authToken || undefined
        }
      }

      const kvCounters = createAPIRequestKVCounters(
        `/api/tokens/${uuid || "unknown"}/usage`,
        "GET",
        statusCode,
        cfInfo,
        [
          { key: "tokens:usage:queries:total" },
          { key: "tokens:usage:errors:total" },
          { key: `tokens:usage:errors:${statusCode}` }
        ]
      )

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write token usage error analytics:", analyticsError)
    }

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token usage retrieval failed")
  }
})
