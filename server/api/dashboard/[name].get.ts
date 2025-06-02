import { recordAPIErrorMetrics, recordAPIMetrics } from "~/server/middleware/metrics"
import { getCloudflareEnv, getKVNamespace } from "~/server/utils/cloudflare"
import { parseRSSFeed } from "~/server/utils/formatters"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"

interface DashboardItem {
  title: string
  subtitle: string
  linkURL?: string
  imageURL?: string
}

interface DashboardResponse {
  dashboard: string
  error: string | null
  items: DashboardItem[]
  timestamp: number
  source?: "kv" | "mock" | "live" | "cache"
}

async function fetchHackerNews(kv: KVNamespace): Promise<{ items: DashboardItem[]; source: "cache" | "live" }> {
  const cacheKey = "dashboard:hackernews:cache"
  const lastUpdatedKey = "dashboard:hackernews:last-updated"
  const cacheHours = 1 // 1 hour cache
  const cacheMs = cacheHours * 60 * 60 * 1000

  // Check if we have cached data and if it's still fresh
  try {
    const [cachedData, lastUpdatedStr] = await Promise.all([kv.get(cacheKey), kv.get(lastUpdatedKey)])

    if (cachedData && lastUpdatedStr) {
      const lastUpdated = Number.parseInt(lastUpdatedStr, 10)
      const now = Date.now()

      if (now - lastUpdated < cacheMs) {
        const items = JSON.parse(cachedData)
        return { items, source: "cache" }
      }
    }
  } catch (error) {
    console.error("Failed to get cached Hacker News data:", error)
  }

  // Fetch fresh data
  try {
    const response = await fetch("https://news.ycombinator.com/rss")
    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`)
    }

    const rssText = await response.text()
    const rssItems = parseRSSFeed(rssText)
    const items: DashboardItem[] = rssItems.slice(0, 10).map((item) => ({
      title: item.title,
      subtitle: "Hacker News",
      linkURL: item.link
    }))

    // Cache the results using separate keys as specified
    if (items.length > 0) {
      const now = Date.now()
      try {
        await Promise.all([kv.put(cacheKey, JSON.stringify(items)), kv.put(lastUpdatedKey, now.toString())])
      } catch (error) {
        console.error("Failed to cache Hacker News data:", error)
      }
    }

    return { items, source: "live" }
  } catch (error) {
    console.error("Error fetching Hacker News:", error)
    throw new Error("Hacker News RSS feed temporarily unavailable")
  }
}

export default defineEventHandler(async (event) => {
  const _startTime = Date.now()

  try {
    const name = getRouterParam(event, "name")

    if (!name) {
      throw createApiError(400, "Dashboard name is required")
    }

    // Get environment bindings
    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)

    let items: DashboardItem[]
    let source: "live" | "cache"
    const error: string | null = null

    switch (name) {
      case "hacker-news":
      case "hackernews": {
        if (!kv) {
          throw createApiError(503, "Dashboard service not available")
        }
        const result = await fetchHackerNews(kv)
        items = result.items
        source = result.source
        break
      }

      default: {
        throw createApiError(404, `Dashboard '${name}' not found`)
      }
    }

    const response: DashboardResponse = {
      dashboard: name,
      error,
      items,
      timestamp: Date.now(),
      source
    }

    // Add cache status header
    setHeader(event, "X-Data-Source", source)

    // Record standard API metrics
    await recordAPIMetrics(event, 200)

    // Log successful request
    logRequest(event, "dashboard/{name}", "GET", 200, {
      dashboardName: name,
      source,
      itemCount: items.length
    })

    return createApiResponse(response, `Dashboard '${name}' retrieved successfully`)
  } catch (error: unknown) {
    console.error("Dashboard error:", error)

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for error handling
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    const name = getRouterParam(event, "name") || "unknown"
    logRequest(event, "dashboard/{name}", "GET", statusCode, {
      dashboardName: name,
      source: "error",
      itemCount: 0
    })

    // Record error metrics
    await recordAPIErrorMetrics(event, error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Dashboard retrieval failed")
  }
})
