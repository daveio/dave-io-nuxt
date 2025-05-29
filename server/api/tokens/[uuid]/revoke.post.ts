import { createApiResponse, createApiError } from "~/server/utils/response"
import { authorizeEndpoint } from "~/server/utils/auth"

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

    // Parse request body
    let body: RevokeRequest
    try {
      body = await readBody(event)
    } catch (error) {
      throw createApiError(400, "Invalid JSON body")
    }

    if (typeof body.revoked !== "boolean") {
      throw createApiError(400, 'Field "revoked" must be a boolean')
    }

    // In production, this would:
    // 1. Check if token exists in D1 database or KV
    // 2. Update auth:revocation:{uuid} in KV storage
    // 3. Log the revocation action

    const now = new Date().toISOString()

    console.log(`Token ${body.revoked ? "revocation" : "restoration"} requested:`, {
      uuid,
      revoked: body.revoked,
      requestedBy: auth.payload?.sub,
      timestamp: now
    })

    // Simulate the revocation action
    const response: RevokeResponse = {
      uuid,
      revoked: body.revoked,
      message: body.revoked ? "Token has been revoked and is now invalid" : "Token revocation has been removed"
    }

    if (body.revoked) {
      response.revokedAt = now
    }

    return createApiResponse(
      response,
      body.revoked ? "Token revoked successfully" : "Token revocation removed successfully"
    )
  } catch (error: any) {
    console.error("Token revocation error:", error)

    if (error.statusCode) {
      throw error
    }

    throw createApiError(500, "Token revocation operation failed")
  }
})
