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

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace }

    console.log("RouterOS cache reset requested by:", auth.payload?.sub)

    const resetTime = new Date().toISOString()

    // Clear RouterOS cache from KV storage
    if (env?.DATA) {
      try {
        const keysToDelete = [
          "routeros:putio:ipv4",
          "routeros:putio:ipv6",
          "routeros:putio:script",
          "routeros:putio:metadata:last-updated",
          "routeros:putio:metadata:last-error",
          "routeros:putio:metadata:update-in-progress"
        ]

        // Delete all cache keys in parallel
        await Promise.all(keysToDelete.map((key) => env.DATA!.delete(key)))

        // Reset metrics counters
        await Promise.all([
          env.DATA.put("metrics:routeros:cache-hits", "0"),
          env.DATA.put("metrics:routeros:cache-misses", "0"),
          env.DATA.put("metrics:routeros:refresh-count", "0")
        ])

        console.log("RouterOS cache cleared from KV storage")
      } catch (error) {
        console.error("Failed to clear RouterOS cache from KV:", error)
        // Don't fail the request - log the error and continue
      }
    } else {
      console.warn("KV storage not available for cache reset")
    }

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
