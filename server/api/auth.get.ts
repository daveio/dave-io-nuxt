import { extractToken, getUserFromPayload, verifyJWT } from "~/server/utils/auth"
import { getCloudflareRequestInfo, getCloudflareEnv, getAnalyticsBinding } from "~/server/utils/cloudflare"
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

    // Write analytics data for successful auth
    try {
      const env = getCloudflareEnv(event)
      const analytics = getAnalyticsBinding(env)
      const cfInfo = getCloudflareRequestInfo(event)
      
      analytics.writeDataPoint({
        blobs: ["auth", "success", payload.sub, cfInfo.userAgent, cfInfo.ip, cfInfo.country, cfInfo.ray],
        doubles: [1], // Auth success count
        indexes: ["auth", payload.sub] // For querying auth events and by subject
      })
    } catch (error) {
      console.error("Failed to write auth analytics:", error)
      // Continue with response even if analytics fails
    }

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

    // Write analytics data for failed auth
    try {
      const env = getCloudflareEnv(event)
      const analytics = getAnalyticsBinding(env)
      const cfInfo = getCloudflareRequestInfo(event)
      
      analytics.writeDataPoint({
        blobs: ["auth", "failed", "unknown", cfInfo.userAgent, cfInfo.ip, cfInfo.country, cfInfo.ray],
        doubles: [1], // Auth failure count
        indexes: ["auth", "failed"] // For querying auth failures
      })
    } catch (analyticsError) {
      console.error("Failed to write auth failure analytics:", analyticsError)
      // Continue with error response even if analytics fails
    }

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Authentication failed")
  }
})
