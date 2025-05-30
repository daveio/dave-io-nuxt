import { writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { generateRouterOSScript, handleResponseFormat } from "~/server/utils/formatters"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"

interface BGPPrefix {
  prefix: string
  exact?: boolean
}

interface RipeAPIResponse {
  data?: {
    prefixes?: BGPPrefix[]
  }
}

interface BGPViewAPIResponse {
  data?: {
    ipv4_prefixes?: BGPPrefix[]
    ipv6_prefixes?: BGPPrefix[]
  }
}

interface RouteROSData {
  ipv4Ranges: string[]
  ipv6Ranges: string[]
  script: string
  lastUpdated: string
  cacheHit: boolean
}

const CACHE_TTL = 3600000 // 1 hour

// Get cached data from KV storage
async function getCachedData(kv?: KVNamespace): Promise<RouteROSData | null> {
  if (!kv) return null

  try {
    const [ipv4Data, ipv6Data, metadata] = await Promise.all([
      kv.get("routeros:putio:ipv4"),
      kv.get("routeros:putio:ipv6"),
      kv.get("routeros:putio:metadata:last-updated")
    ])

    if (ipv4Data && ipv6Data && metadata) {
      const lastUpdated = new Date(metadata)
      if (Date.now() - lastUpdated.getTime() < CACHE_TTL) {
        const ipv4Ranges = JSON.parse(ipv4Data)
        const ipv6Ranges = JSON.parse(ipv6Data)
        const script = generateRouterOSScript(ipv4Ranges, ipv6Ranges, {
          listName: "putio",
          comment: "put.io",
          timestamp: metadata
        })

        return {
          ipv4Ranges,
          ipv6Ranges,
          script,
          lastUpdated: metadata,
          cacheHit: true
        }
      }
    }
  } catch (error) {
    console.error("Failed to get cached data from KV:", error)
  }

  return null
}

// Store data in KV storage
async function storeDataInKV(data: RouteROSData, kv: KVNamespace): Promise<void> {
  try {
    await Promise.all([
      kv.put("routeros:putio:ipv4", JSON.stringify(data.ipv4Ranges)),
      kv.put("routeros:putio:ipv6", JSON.stringify(data.ipv6Ranges)),
      kv.put("routeros:putio:script", data.script),
      kv.put("routeros:putio:metadata:last-updated", data.lastUpdated)
    ])

    // Update cache hit metrics
    const hits = await kv.get("metrics:routeros:cache-hits")
    const hitCount = hits ? Number.parseInt(hits, 10) + 1 : 1
    await kv.put("metrics:routeros:cache-hits", hitCount.toString())
  } catch (error) {
    console.error("Failed to store data in KV:", error)
  }
}

async function fetchPutIOData(kv: KVNamespace): Promise<RouteROSData> {
  try {
    // Fetch from RIPE STAT API
    const ripeResponse = await fetch("https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS9009")
    let ipv4Ranges: string[] = []
    let ipv6Ranges: string[] = []

    if (ripeResponse.ok) {
      const ripeData = (await ripeResponse.json()) as RipeAPIResponse
      const prefixes = ripeData.data?.prefixes || []

      for (const prefix of prefixes) {
        if (prefix.prefix) {
          if (prefix.prefix.includes(":")) {
            ipv6Ranges.push(prefix.prefix)
          } else {
            ipv4Ranges.push(prefix.prefix)
          }
        }
      }
    }

    // Fallback to BGPView API if RIPE fails or has no data
    if (ipv4Ranges.length === 0 && ipv6Ranges.length === 0) {
      const bgpResponse = await fetch("https://api.bgpview.io/asn/9009/prefixes")
      if (bgpResponse.ok) {
        const bgpData = (await bgpResponse.json()) as BGPViewAPIResponse
        const prefixes = bgpData.data?.ipv4_prefixes || []
        const ipv6Prefixes = bgpData.data?.ipv6_prefixes || []

        ipv4Ranges = prefixes.map((p: BGPPrefix) => p.prefix)
        ipv6Ranges = ipv6Prefixes.map((p: BGPPrefix) => p.prefix)
      }
    }

    // Generate RouterOS script using shared helper
    const script = generateRouterOSScript(ipv4Ranges, ipv6Ranges, {
      listName: "putio",
      comment: "put.io"
    })

    const data: RouteROSData = {
      ipv4Ranges,
      ipv6Ranges,
      script,
      lastUpdated: new Date().toISOString(),
      cacheHit: false
    }

    // Store in KV cache
    await storeDataInKV(data, kv)

    return data
  } catch (error) {
    console.error("Error fetching put.io data:", error)
    throw new Error("Failed to fetch put.io IP ranges")
  }
}

// Function moved to shared formatters utility

export default defineEventHandler(async (event) => {
  try {
    // Format parameter will be handled by handleResponseFormat

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; ANALYTICS?: AnalyticsEngineDataset }

    if (!env?.DATA) {
      throw createApiError(503, "RouterOS service not available")
    }

    // Check KV cache first
    let data: RouteROSData

    const cachedData = await getCachedData(env.DATA)
    if (cachedData) {
      data = cachedData
    } else {
      data = await fetchPutIOData(env.DATA)

      // Update cache miss metrics
      try {
        const misses = await env.DATA.get("metrics:routeros:cache-misses")
        const missCount = misses ? Number.parseInt(misses, 10) + 1 : 1
        await env.DATA.put("metrics:routeros:cache-misses", missCount.toString())
      } catch (error) {
        console.error("Failed to update cache miss metrics:", error)
      }
    }

    // Write analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)

      const analyticsEvent = {
        type: "routeros" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          operation: "putio" as "putio" | "cache" | "reset",
          cacheStatus: data.cacheHit ? "hit" : "miss",
          ipv4Count: data.ipv4Ranges.length,
          ipv6Count: data.ipv6Ranges.length
        }
      }

      const kvCounters = [
        { key: "routeros:putio:requests:total" },
        { key: `routeros:putio:cache:${data.cacheHit ? "hits" : "misses"}` },
        { key: "routeros:putio:ipv4-ranges", value: data.ipv4Ranges.length },
        { key: "routeros:putio:ipv6-ranges", value: data.ipv6Ranges.length },
        { key: "routeros:putio:last-fetched", value: data.lastUpdated }
      ]

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (error) {
      console.error("Failed to write RouterOS analytics:", error)
      // Continue with response even if analytics fails
    }

    // Check if JSON format is explicitly requested
    const format = getQuery(event).format as string

    // Log successful request
    logRequest(event, "routeros/putio", "GET", 200, {
      format: format || "script",
      ipv4Count: data.ipv4Ranges.length,
      ipv6Count: data.ipv6Ranges.length,
      cacheHit: data.cacheHit,
      lastUpdated: data.lastUpdated
    })

    if (format === "json") {
      return createApiResponse(
        {
          ipv4Count: data.ipv4Ranges.length,
          ipv6Count: data.ipv6Ranges.length,
          ipv4Ranges: data.ipv4Ranges,
          ipv6Ranges: data.ipv6Ranges,
          lastUpdated: data.lastUpdated,
          cacheHit: data.cacheHit
        },
        "put.io IP ranges retrieved successfully"
      )
    }

    // Default: Return RouterOS script
    setHeader(event, "Content-Type", "text/plain")
    setHeader(event, "Content-Disposition", 'attachment; filename="putio-routeros.rsc"')
    return data.script
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

    // Log failed request
    logRequest(event, "routeros/putio", "GET", statusCode, {
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusMessage property exists
      error: isApiError(error) ? (error as any).statusMessage || "Unknown error" : "Internal error"
    })

    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "RouterOS script generation failed")
  }
})
