import { authorizeEndpoint } from "~/server/utils/auth"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  let authToken: string | null = null
  let authSuccess = false

  try {
    // Check authorization for cache management
    const authFunc = await authorizeEndpoint("routeros", "admin")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    authToken = auth.payload?.sub || null
    authSuccess = true

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)

    console.log("RouterOS cache reset requested by:", auth.payload?.sub)

    const resetTime = new Date().toISOString()
    let keysDeleted = 0

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
        await Promise.all(keysToDelete.map((key) => env.DATA?.delete(key)))
        keysDeleted = keysToDelete.length

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

    // Write successful KV metrics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const _responseTime = Date.now() - startTime

      const userAgent = getHeader(event, "user-agent") || ""
      const kvCounters = createAPIRequestKVCounters("/api/routeros/reset", "POST", 200, cfInfo, userAgent, [
        { key: "routeros:reset:total" },
        { key: "routeros:reset:success" },
        { key: "routeros:reset:keys-deleted", value: keysDeleted },
        { key: `routeros:reset:by-user:${authToken || "anonymous"}` },
        { key: "routeros:cache:manual-resets" }
      ])

      if (env?.DATA) {
        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (metricsError) {
      console.error("Failed to write RouterOS reset success KV metrics:", metricsError)
    }

    // Log successful request
    logRequest(event, "routeros/reset", "POST", 200, {
      cacheStatus: "reset",
      counts: `deleted:${keysDeleted}`,
      operation: "reset"
    })

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

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for error handling
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "routeros/reset", "POST", statusCode, {
      cacheStatus: "error",
      counts: "unknown",
      operation: "reset"
    })

    // Write KV metrics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      const userAgent = getHeader(event, "user-agent") || ""
      const kvCounters = createAPIRequestKVCounters("/api/routeros/reset", "POST", statusCode, cfInfo, userAgent, [
        { key: "routeros:reset:errors:total" },
        { key: authSuccess ? "routeros:reset:errors:processing" : "routeros:reset:errors:auth-failed" }
      ])

      if (env?.DATA) {
        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (metricsError) {
      console.error("Failed to write RouterOS reset error KV metrics:", metricsError)
    }

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "RouterOS cache reset failed")
  }
})
