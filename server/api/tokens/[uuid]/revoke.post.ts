import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
import { authorizeEndpoint } from "~/server/utils/auth"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

interface RevokeRequest {
  revoked: boolean
}

interface RevokeResponse {
  uuid: string
  revoked: boolean
  revokedAt?: string
  message: string
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  let authToken: string | null = null
  let uuid: string | undefined
  let operation: "revoke" | "unrevoke" | undefined

  try {
    // Check authorization for token management
    const authFunc = await authorizeEndpoint("api", "tokens")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    authToken = auth.payload?.sub || null

    uuid = getRouterParam(event, "uuid")

    if (!uuid) {
      throw createApiError(400, "Token UUID is required")
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(uuid)) {
      throw createApiError(400, "Invalid UUID format")
    }

    // Parse request body
    let body: RevokeRequest
    try {
      body = await readBody(event)
    } catch {
      throw createApiError(400, "Invalid JSON body")
    }

    if (typeof body.revoked !== "boolean") {
      throw createApiError(400, 'Field "revoked" must be a boolean')
    }

    operation = body.revoked ? "revoke" : "unrevoke"
    const now = new Date().toISOString()

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env?.DATA) {
      throw createApiError(500, "KV storage not available")
    }

    const revokedKey = `revoked_token:${uuid}`

    try {
      if (body.revoked) {
        // Add token to revocation blacklist with 30-day expiration
        await env.DATA.put(
          revokedKey,
          JSON.stringify({
            revoked_at: now,
            revoked_by: auth.payload?.sub,
            reason: "Manual revocation via API"
          }),
          { expirationTtl: 86400 * 30 }
        ) // 30 days
      } else {
        // Remove token from revocation blacklist
        await env.DATA.delete(revokedKey)
      }
    } catch (error) {
      console.error("Failed to update token revocation in KV:", error)
      throw createApiError(500, "Failed to update token revocation status")
    }

    console.log(`Token ${body.revoked ? "revocation" : "restoration"} completed:`, {
      uuid,
      revoked: body.revoked,
      requestedBy: auth.payload?.sub,
      timestamp: now
    })

    const response: RevokeResponse = {
      uuid,
      revoked: body.revoked,
      message: body.revoked ? "Token has been revoked and is now invalid" : "Token revocation has been removed"
    }

    if (body.revoked) {
      response.revokedAt = now
    }

    // Write successful KV metrics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const kvCounters = createAPIRequestKVCounters(`/api/tokens/${uuid}/revoke`, "POST", 200, cfInfo, [
        { key: "tokens:revocations:total" },
        { key: `tokens:revocations:${operation}` },
        { key: `tokens:revoked:${uuid}:operations` },
        { key: `tokens:revocations:by-user:${authToken || "unknown"}` }
      ])

      if (env?.DATA) {
        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (metricsError) {
      console.error("Failed to write token revocation success KV metrics:", metricsError)
    }

    return createApiResponse(
      response,
      body.revoked ? "Token revoked successfully" : "Token revocation removed successfully"
    )
  } catch (error: unknown) {
    console.error("Token revocation error:", error)

    // Write KV metrics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      const kvCounters = createAPIRequestKVCounters(
        `/api/tokens/${uuid || "unknown"}/revoke`,
        "POST",
        statusCode,
        cfInfo,
        [
          { key: "tokens:revocations:total" },
          { key: "tokens:revocations:errors:total" },
          { key: `tokens:revocations:errors:${statusCode}` },
          { key: operation ? `tokens:revocations:${operation}:errors` : "tokens:revocations:unknown:errors" }
        ]
      )

      if (env?.DATA) {
        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (metricsError) {
      console.error("Failed to write token revocation error KV metrics:", metricsError)
    }

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Token revocation operation failed")
  }
})
