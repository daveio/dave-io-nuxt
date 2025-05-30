import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"

interface CacheStats {
  ipv4Count: number
  ipv6Count: number
  lastUpdated: string | null
  cacheAge: number // in seconds
  isStale: boolean
  cacheHits: number
  cacheMisses: number
  refreshCount: number
}

// Get cache statistics from KV storage
async function getCacheStatsFromKV(kv?: KVNamespace): Promise<CacheStats> {
  if (!kv) {
    throw createApiError(503, "Cache storage service unavailable")
  }

  try {
    // Get cache data and metadata from KV
    const [ipv4Data, ipv6Data, metadata, hits, misses, refreshes] = await Promise.all([
      kv.get("routeros:putio:ipv4"),
      kv.get("routeros:putio:ipv6"),
      kv.get("routeros:putio:metadata:last-updated"),
      kv.get("metrics:routeros:cache-hits"),
      kv.get("metrics:routeros:cache-misses"),
      kv.get("metrics:routeros:refresh-count")
    ])

    // Parse IPv4 and IPv6 data to count entries
    const ipv4Count = ipv4Data ? JSON.parse(ipv4Data).length : 0
    const ipv6Count = ipv6Data ? JSON.parse(ipv6Data).length : 0

    // Calculate cache age
    const lastUpdated = metadata || null
    const cacheAge = lastUpdated ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000) : 0
    const isStale = cacheAge > 3600 // 1 hour staleness threshold

    return {
      ipv4Count,
      ipv6Count,
      lastUpdated,
      cacheAge,
      isStale,
      cacheHits: hits ? Number.parseInt(hits, 10) : 0,
      cacheMisses: misses ? Number.parseInt(misses, 10) : 0,
      refreshCount: refreshes ? Number.parseInt(refreshes, 10) : 0
    }
  } catch (error) {
    console.error("Failed to get cache stats from KV:", error)
    throw createApiError(500, "Failed to retrieve cache statistics")
  }
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  try {
    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; ANALYTICS?: AnalyticsEngineDataset }

    if (!env?.DATA) {
      // Write analytics for service unavailable using standardized system
      try {
        const cfInfo = getCloudflareRequestInfo(event)
        const responseTime = Date.now() - startTime

        const analyticsEvent = {
          type: "api_request" as const,
          timestamp: new Date().toISOString(),
          cloudflare: cfInfo,
          data: {
            endpoint: "/api/routeros/cache",
            method: "GET",
            statusCode: 503,
            responseTimeMs: responseTime,
            tokenSubject: undefined
          }
        }

        const kvCounters = createAPIRequestKVCounters("/api/routeros/cache", "GET", 503, cfInfo, [
          { key: "routeros:cache:errors:service-unavailable" },
          { key: "routeros:cache:availability:kv", increment: env?.DATA ? 1 : 0 }
        ])

        await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
      } catch (analyticsError) {
        console.error("Failed to write RouterOS cache error analytics:", analyticsError)
      }

      throw createApiError(503, "Cache service not available")
    }

    // Get cache statistics from KV storage
    const stats = await getCacheStatsFromKV(env.DATA)

    // Write successful analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const analyticsEvent = {
        type: "routeros" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          operation: "cache" as "putio" | "cache" | "reset",
          cacheStatus: stats.isStale ? "stale" : "fresh",
          ipv4Count: stats.ipv4Count,
          ipv6Count: stats.ipv6Count
        }
      }

      const kvCounters = createAPIRequestKVCounters("/api/routeros/cache", "GET", 200, cfInfo, [
        { key: "routeros:cache:checks:total" },
        { key: "routeros:cache:status:" + (stats.isStale ? "stale" : "fresh") },
        { key: "routeros:cache:ipv4-count", value: stats.ipv4Count },
        { key: "routeros:cache:ipv6-count", value: stats.ipv6Count },
        { key: "routeros:cache:age-seconds", value: stats.cacheAge },
        { key: "routeros:cache:hits:total", value: stats.cacheHits },
        { key: "routeros:cache:misses:total", value: stats.cacheMisses },
        { key: "routeros:cache:refreshes:total", value: stats.refreshCount },
        { key: "routeros:cache:last-updated", value: stats.lastUpdated || "never" }
      ])

      await writeAnalytics(true, env.ANALYTICS, env.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write RouterOS cache success analytics:", analyticsError)
    }

    // Log successful request
    logRequest(event, "routeros/cache", "GET", 200, {
      cacheStatus: stats.isStale ? "stale" : "fresh",
      counts: `ipv4:${stats.ipv4Count},ipv6:${stats.ipv6Count}`,
      operation: "check"
    })

    return createApiResponse(stats, "RouterOS cache status retrieved successfully")
  } catch (error: unknown) {
    console.error("RouterOS cache error:", error)

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for error handling
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "routeros/cache", "GET", statusCode, {
      cacheStatus: "error",
      counts: "unknown",
      operation: "check"
    })

    // Write analytics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      if (env?.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            "api_request",
            "/api/routeros/cache",
            "GET",
            cfInfo.userAgent,
            cfInfo.ip,
            cfInfo.country,
            cfInfo.ray,
            "cache_error",
            String(statusCode),
            ""
          ],
          doubles: [responseTime, statusCode, 0], // responseTime, statusCode, success
          indexes: ["api_request"] // Analytics Engine only supports 1 index
        })
      }
    } catch (analyticsError) {
      console.error("Failed to write RouterOS cache error analytics:", analyticsError)
    }

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "RouterOS cache status retrieval failed")
  }
})
