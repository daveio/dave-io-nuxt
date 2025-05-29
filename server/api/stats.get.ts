import { createApiError, createApiResponse } from "~/server/utils/response"
import { SystemMetricsSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  try {
    const env = event.context.cloudflare?.env as { 
      KV?: KVNamespace
      ANALYTICS?: AnalyticsEngineDataset 
    }

    if (!env?.KV || !env?.ANALYTICS) {
      throw createApiError(503, "Analytics services not available")
    }

    // Get real statistics from KV and Analytics Engine
    const [userCount, postCount, apiMetrics] = await Promise.all([
      env.KV.get("stats:users:total").then(v => parseInt(v || "0")),
      env.KV.get("stats:posts:total").then(v => parseInt(v || "0")),
      env.KV.get("stats:api:endpoints").then(v => parseInt(v || "8"))
    ])

    // Get active users from the last 24 hours via Analytics
    const activeUsers = await env.KV.get("stats:users:active_24h").then(v => parseInt(v || "0"))
    const newUsersToday = await env.KV.get("stats:users:new_today").then(v => parseInt(v || "0"))
    const publishedPosts = await env.KV.get("stats:posts:published").then(v => parseInt(v || "0"))
    const draftPosts = await env.KV.get("stats:posts:drafts").then(v => parseInt(v || "0"))

    const stats = SystemMetricsSchema.parse({
      users: {
        total: userCount,
        active: activeUsers,
        new_today: newUsersToday
      },
      posts: {
        total: postCount,
        published: publishedPosts,
        drafts: draftPosts
      },
      system: {
        runtime: "cloudflare-workers",
        timestamp: new Date().toISOString(),
        cf_ray: getHeader(event, "cf-ray") || "unknown",
        cf_datacenter: getHeader(event, "cf-ray")?.substring(0, 3) || "unknown",
        cf_country: getHeader(event, "cf-ipcountry") || "unknown"
      },
      api: {
        version: "1.0.0",
        endpoints_available: apiMetrics,
        rate_limit: "100 requests/minute"
      }
    })

    return createApiResponse(stats, "Statistics retrieved successfully")
  } catch (error) {
    console.error("Stats API error:", error)
    if (error instanceof Response) throw error
    throw createApiError(500, "Failed to retrieve statistics")
  }
})
