import { getCloudflareEnv, getKVNamespace, shouldAllowMockData } from "~/server/utils/environment"
import { parseRSSFeed } from "~/server/utils/formatters"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

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

// Get dashboard configuration from KV storage
async function getDashboardItems(
  name: string,
  kv: KVNamespace
): Promise<{ items: DashboardItem[]; source: "kv" | "mock" }> {
  try {
    const dashboardKey = `dashboard:${name}:config`
    const cachedConfig = await kv.get(dashboardKey)

    if (cachedConfig) {
      return { items: JSON.parse(cachedConfig), source: "kv" }
    }

    // Special case for demo dashboard - provide mock data but clearly indicate it
    if (name === "demo" && shouldAllowMockData()) {
      console.warn("⚠️  Demo dashboard using mock data - no KV configuration found")
      return {
        items: [
          {
            title: "API Endpoints",
            subtitle: "12 active endpoints (mock data)",
            linkURL: "/api/docs"
          },
          {
            title: "JWT Tokens",
            subtitle: "3 active tokens (mock data)",
            linkURL: "/api/auth"
          },
          {
            title: "System Health",
            subtitle: "All systems operational (mock data)",
            linkURL: "/api/ping"
          }
        ],
        source: "mock"
      }
    }

    throw new Error(`Dashboard configuration not found for: ${name}`)
  } catch (error) {
    console.error("Failed to get dashboard from KV:", error)
    throw error
  }
}

async function fetchHackerNews(kv: KVNamespace): Promise<{ items: DashboardItem[]; source: "cache" | "live" }> {
  const cacheKey = "dashboard:hackernews:cache"
  const cacheTtl = 1800 // 30 minutes

  // Try to get cached data first
  try {
    const cached = await kv.get(cacheKey)
    if (cached) {
      const parsedCache = JSON.parse(cached)
      if (Date.now() - parsedCache.timestamp < cacheTtl * 1000) {
        return { items: parsedCache.items, source: "cache" }
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

    // Parse RSS using fast-xml-parser instead of regex
    const rssItems = parseRSSFeed(rssText)
    const items: DashboardItem[] = rssItems.slice(0, 10).map((item) => ({
      title: item.title,
      subtitle: "Hacker News",
      linkURL: item.link
    }))

    // Cache the results
    if (items.length > 0) {
      try {
        await kv.put(
          cacheKey,
          JSON.stringify({
            items,
            timestamp: Date.now()
          }),
          { expirationTtl: cacheTtl }
        )
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
  try {
    const name = getRouterParam(event, "name")

    if (!name) {
      throw createApiError(400, "Dashboard name is required")
    }

    // Get environment bindings
    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)

    let items: DashboardItem[]
    let source: "kv" | "mock" | "live" | "cache"
    const error: string | null = null

    switch (name) {
      case "demo": {
        if (!kv) {
          throw createApiError(503, "Dashboard service not available")
        }
        const result = await getDashboardItems(name, kv)
        items = result.items
        source = result.source
        break
      }

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
        if (!kv) {
          throw createApiError(503, "Dashboard service not available")
        }
        // Check if custom dashboard exists in KV
        try {
          const result = await getDashboardItems(name, kv)
          items = result.items
          source = result.source
          if (items.length === 0) {
            throw createApiError(404, `Dashboard '${name}' not found`)
          }
        } catch {
          throw createApiError(404, `Dashboard '${name}' not found`)
        }
      }
    }

    const response: DashboardResponse = {
      dashboard: name,
      error,
      items,
      timestamp: Date.now(),
      source
    }

    // Add warning header when serving mock data
    if (source === "mock") {
      setHeader(event, "X-Data-Source", "mock")
      setHeader(event, "X-Warning", "This endpoint is serving mock data for demonstration purposes")
    }

    return createApiResponse(response, `Dashboard '${name}' retrieved successfully`)
  } catch (error: unknown) {
    console.error("Dashboard error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Dashboard retrieval failed")
  }
})
