import { recordAPIErrorMetrics, recordAPIMetrics } from "~/server/middleware/metrics"
import { extractToken, getUserFromPayload, verifyJWT } from "~/server/utils/auth"
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

    // Record metrics for successful auth
    recordAPIMetrics(event, 200)

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
        jti: payload.jti
      },
      user: {
        id: user.id,
        issuedAt: user.issuedAt.toISOString(),
        expiresAt: user.expiresAt?.toISOString() || null,
        tokenId: user.tokenId
      },
      timestamp: new Date().toISOString()
    })

    return response
  } catch (error: unknown) {
    console.error("Authentication error:", error)

    // Record metrics for failed auth
    recordAPIErrorMetrics(event, error)

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
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
