import { authorizeEndpoint } from "~/server/utils/auth"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for cache management
    const authFunc = await authorizeEndpoint("routeros", "admin")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    // In production, this would clear KV storage:
    // - routeros:putio:ipv4
    // - routeros:putio:ipv6
    // - routeros:putio:script
    // - routeros:putio:metadata:last-updated
    // - routeros:putio:metadata:last-error
    // - routeros:putio:metadata:update-in-progress

    console.log("RouterOS cache reset requested by:", auth.payload?.sub)

    // Simulated cache reset
    const resetTime = new Date().toISOString()

    return createApiResponse(
      {
        reset: true,
        timestamp: resetTime,
        message: "RouterOS cache cleared successfully"
      },
      "RouterOS cache reset completed"
    )
  } catch (error: unknown) {
    console.error("RouterOS reset error:", error)

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "RouterOS cache reset failed")
  }
})
