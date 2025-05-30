import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, logRequest } from "~/server/utils/response"
import { SystemMetricsSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  try {
    const env = event.context.cloudflare?.env as {
      DATA?: KVNamespace
      ANALYTICS?: AnalyticsEngineDataset
    }

    if (!env?.DATA || !env?.ANALYTICS) {
      // Write analytics for failed request using standardized system
      try {
        const cfInfo = getCloudflareRequestInfo(event)
        const responseTime = Date.now() - startTime

        const analyticsEvent = {
          type: "api_request" as const,
          timestamp: new Date().toISOString(),
          cloudflare: cfInfo,
          data: {
            endpoint: "/api/stats",
            method: "GET",
            statusCode: 503,
            responseTimeMs: responseTime,
            tokenSubject: undefined
          }
        }

        const kvCounters = createAPIRequestKVCounters("/api/stats", "GET", 503, cfInfo, [
          { key: "stats:errors:service-unavailable" },
          { key: "stats:availability:kv", increment: env?.DATA ? 1 : 0 },
          { key: "stats:availability:analytics", increment: env?.ANALYTICS ? 1 : 0 }
        ])

        await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
      } catch (analyticsError) {
        console.error("Failed to write stats error analytics:", analyticsError)
      }

      // Log error request
      logRequest(event, "stats", "GET", 503, {
        error: "Analytics services not available",
        kvAvailable: !!env?.DATA,
        analyticsAvailable: !!env?.ANALYTICS
      })

      throw createApiError(503, "Analytics services not available")
    }

    // Get real statistics from KV and Analytics Engine
    const [userCount, postCount, apiMetrics] = await Promise.all([
      env.DATA.get("stats:users:total").then((v) => Number.parseInt(v || "0")),
      env.DATA.get("stats:posts:total").then((v) => Number.parseInt(v || "0")),
      env.DATA.get("stats:api:endpoints").then((v) => Number.parseInt(v || "8"))
    ])

    // Get active users from the last 24 hours via Analytics
    const activeUsers = await env.DATA.get("stats:users:active-24h").then((v) => Number.parseInt(v || "0"))
    const newUsersToday = await env.DATA.get("stats:users:new-today").then((v) => Number.parseInt(v || "0"))
    const publishedPosts = await env.DATA.get("stats:posts:published").then((v) => Number.parseInt(v || "0"))
    const draftPosts = await env.DATA.get("stats:posts:drafts").then((v) => Number.parseInt(v || "0"))

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

    // Write successful analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const analyticsEvent = {
        type: "api_request" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          endpoint: "/api/stats",
          method: "GET",
          statusCode: 200,
          responseTimeMs: responseTime,
          tokenSubject: undefined
        }
      }

      const kvCounters = createAPIRequestKVCounters("/api/stats", "GET", 200, cfInfo, [
        { key: "stats:retrievals:total" },
        { key: "stats:metrics:users:total", value: userCount },
        { key: "stats:metrics:users:active", value: activeUsers },
        { key: "stats:metrics:users:new-today", value: newUsersToday },
        { key: "stats:metrics:posts:total", value: postCount },
        { key: "stats:metrics:posts:published", value: publishedPosts },
        { key: "stats:metrics:posts:drafts", value: draftPosts },
        { key: "stats:metrics:api:endpoints", value: apiMetrics },
        { key: `stats:runtimes:${stats.system.runtime.replace(/[^a-z0-9]/g, "-")}` },
        { key: `stats:datacenters:${stats.system.cf_datacenter}` }
      ])

      await writeAnalytics(true, env.ANALYTICS, env.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write stats success analytics:", analyticsError)
    }

    // Log successful request
    const responseTime = Date.now() - startTime
    logRequest(event, "stats", "GET", 200, {
      totalUsers: userCount,
      totalPosts: postCount,
      activeUsers,
      responseTime: `${responseTime}ms`
    })

    return createApiResponse(stats, "Statistics retrieved successfully")
  } catch (error) {
    console.error("Stats API error:", error)

    // Log error request
    logRequest(event, "stats", "GET", 500, {
      error: error instanceof Error ? error.message : "Unknown error"
    })

    if (error instanceof Response) throw error
    throw createApiError(500, "Failed to retrieve statistics")
  }
})
