import { createAuthKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { extractToken, getUserFromPayload, verifyJWT } from "~/server/utils/auth"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, isApiError, logRequest } from "~/server/utils/response"
import { AuthSuccessResponseSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  let authToken: string | null = null

  try {
    // Extract JWT token
    const token = extractToken(event)
    if (!token) {
      throw createApiError(401, "No authentication token provided")
    }

    // Get JWT secret from environment
    const secret = process.env.API_JWT_SECRET
    if (!secret) {
      console.error("API_JWT_SECRET environment variable not set")
      throw createApiError(500, "Authentication service unavailable")
    }

    // Verify JWT token
    const verification = await verifyJWT(token, secret)
    if (!verification.success || !verification.payload) {
      throw createApiError(401, verification.error || "Invalid token")
    }

    const { payload } = verification
    const user = getUserFromPayload(payload)
    authToken = payload.sub

    // Write analytics for successful auth using standardized system
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const analyticsEvent = {
        type: "auth" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          success: true,
          method: "token_verification",
          userId: payload.sub,
          tokenId: payload.jti || undefined,
          responseTimeMs: responseTime
        }
      }

      const kvCounters = createAuthKVCounters(true, responseTime, payload.sub, cfInfo, [
        { key: "auth:token-verifications:total" },
        { key: "auth:token-verifications:success" },
        { key: "auth:users:active:" + payload.sub },
        { key: "auth:tokens:verified:" + (payload.jti || "unknown") }
      ])

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (error) {
      console.error("Failed to write auth analytics:", error)
      // Continue with response even if analytics fails
    }

    // Log successful request
    const responseTime = Date.now() - startTime
    logRequest(event, "auth", "GET", 200, {
      user: payload.sub,
      tokenId: payload.jti || "unknown",
      hasExpiry: payload.exp ? "true" : "false",
      responseTime: `${responseTime}ms`
    })

    // Build response matching dave-io Worker format
    const response = AuthSuccessResponseSchema.parse({
      success: true,
      message: "Authentication successful",
      jwt: {
        sub: payload.sub,
        iat: payload.iat,
        exp: payload.exp,
        jti: payload.jti,
        maxRequests: payload.maxRequests
      },
      user: {
        id: user.id,
        issuedAt: user.issuedAt.toISOString(),
        expiresAt: user.expiresAt?.toISOString() || null,
        tokenId: user.tokenId,
        maxRequests: user.maxRequests
      },
      timestamp: new Date().toISOString()
    })

    return response
  } catch (error: unknown) {
    console.error("Authentication error:", error)

    // Write analytics for failed auth using standardized system
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      const analyticsEvent = {
        type: "auth" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          success: false,
          method: "token_verification",
          userId: authToken || undefined,
          tokenId: undefined,
          responseTimeMs: responseTime
        }
      }

      const kvCounters = createAuthKVCounters(false, responseTime, authToken || undefined, cfInfo, [
        { key: "auth:token-verifications:total" },
        { key: "auth:token-verifications:failed" },
        { key: "auth:errors:verification-failed" }
      ])

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write auth failure analytics:", analyticsError)
      // Continue with error response even if analytics fails
    }

    // Log error request
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "auth", "GET", statusCode, {
      user: authToken || "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      hasToken: authToken ? "true" : "false"
    })

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Authentication failed")
  }
})
