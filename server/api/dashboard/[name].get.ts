import { authorizeEndpoint } from "~/server/utils/auth"
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

// Simulated demo data (in production this would come from KV)
const demoItems: DashboardItem[] = [
  {
    title: "API Endpoints",
    subtitle: "12 active endpoints",
    linkURL: "/api/docs"
  },
  {
    title: "JWT Tokens",
    subtitle: "3 active tokens",
    linkURL: "/api/auth"
  },
  {
    title: "System Health",
    subtitle: "All systems operational",
    linkURL: "/api/ping"
  },
  {
    title: "Metrics",
    subtitle: "View API metrics",
    linkURL: "/api/metrics"
  }
]

async function fetchHackerNews(): Promise<DashboardItem[]> {
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

      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1],
          subtitle: "Hacker News",
          linkURL: linkMatch[1]
        })
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

    let items: DashboardItem[]
    const error: string | null = null

    switch (name) {
      case "demo":
        items = demoItems
        break

      case "hacker-news":
      case "hackernews":
        items = await fetchHackerNews()
        break

      default:
        throw createApiError(404, `Dashboard '${name}' not found`)
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
