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
}

// Get dashboard configuration from KV storage
async function getDashboardItems(name: string, kv: KVNamespace): Promise<DashboardItem[]> {
  try {
    const dashboardKey = `dashboard:${name}:config`
    const cachedConfig = await kv.get(dashboardKey)

    if (cachedConfig) {
      return JSON.parse(cachedConfig)
    }
    
    throw new Error(`Dashboard configuration not found for: ${name}`)
  } catch (error) {
    console.error("Failed to get dashboard from KV:", error)
    throw error
  }
}


async function fetchHackerNews(kv: KVNamespace): Promise<DashboardItem[]> {
  const cacheKey = "dashboard:hackernews:cache"
  const cacheTtl = 1800 // 30 minutes

  // Try to get cached data first
  try {
    const cached = await kv.get(cacheKey)
    if (cached) {
      const parsedCache = JSON.parse(cached)
      if (Date.now() - parsedCache.timestamp < cacheTtl * 1000) {
        return parsedCache.items
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

    // Simple RSS parsing (in production you'd use a proper XML parser)
    const items: DashboardItem[] = []
    const itemRegex = /<item>[\s\S]*?<\/item>/g
    const matches = rssText.match(itemRegex) || []

    for (const match of matches.slice(0, 10)) {
      // Top 10 items
      const titleMatch = match.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
      const linkMatch = match.match(/<link>(.*?)<\/link>/)
      const _commentsMatch = match.match(/<comments>(.*?)<\/comments>/)

      if (titleMatch && linkMatch && titleMatch[1] && linkMatch[1]) {
        items.push({
          title: titleMatch[1],
          subtitle: "Hacker News",
          linkURL: linkMatch[1]
        })
      }
    }

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

    return items
  } catch (error) {
    console.error("Error fetching Hacker News:", error)
    return [
      {
        title: "Error loading Hacker News",
        subtitle: "RSS feed temporarily unavailable"
      }
    ]
  }
}

export default defineEventHandler(async (event) => {
  try {
    const name = getRouterParam(event, "name")

    if (!name) {
      throw createApiError(400, "Dashboard name is required")
    }

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace }

    if (!env?.DATA) {
      throw createApiError(503, "Dashboard service not available")
    }

    let items: DashboardItem[]
    const error: string | null = null

    switch (name) {
      case "demo":
        items = await getDashboardItems(name, env.DATA)
        break

      case "hacker-news":
      case "hackernews":
        items = await fetchHackerNews(env.DATA)
        break

      default:
        // Check if custom dashboard exists in KV
        try {
          items = await getDashboardItems(name, env.DATA)
          if (items.length === 0) {
            throw createApiError(404, `Dashboard '${name}' not found`)
          }
        } catch {
          throw createApiError(404, `Dashboard '${name}' not found`)
        }
    }

    const response: DashboardResponse = {
      dashboard: name,
      error,
      items,
      timestamp: Date.now()
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
