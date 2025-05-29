import { extractToken, getUserFromPayload, verifyJWT } from "~/server/utils/auth"
import { createApiError, isApiError } from "~/server/utils/response"
import { AuthSuccessResponseSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  try {
    // Extract JWT token
    const token = extractToken(event)
    if (!token) {
      createApiError(401, "No authentication token provided")
    }

    // Get JWT secret from environment
    const secret = process.env.API_JWT_SECRET
    if (!secret) {
      console.error("API_JWT_SECRET environment variable not set")
      createApiError(500, "Authentication service unavailable")
    }

    // Verify JWT token
    const verification = await verifyJWT(token, secret)
    if (!verification.success || !verification.payload) {
      createApiError(401, verification.error || "Invalid token")
    }

    const { payload } = verification
    const user = getUserFromPayload(payload)

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

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Authentication failed")
  }
})
