import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

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
  try {
    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace }

    if (!env?.DATA) {
      throw createApiError(503, "Cache service not available")
    }

    // Get cache statistics from KV storage
    const stats = await getCacheStatsFromKV(env.DATA)

    return createApiResponse(stats, "RouterOS cache status retrieved successfully")
  } catch (error: unknown) {
    console.error("RouterOS cache error:", error)

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "RouterOS cache status retrieval failed")
  }
})
