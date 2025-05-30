import {
  aggregateAnalyticsMetrics,
  getAnalyticsCacheKey,
  getKVMetrics,
  getTimeRangeBoundaries,
  parseAnalyticsResults,
  queryAnalyticsEngine,
  queryTimeSeriesData
} from "~/server/utils/analytics"
import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getCloudflareRequestInfo, getKVNamespace } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse } from "~/server/utils/response"
import type { AnalyticsMetrics, AnalyticsQueryParams, AnalyticsResponse } from "~/types/analytics"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  let authToken: string | null = null

  try {
    // Require analytics permissions
    const authResult = await requireAPIAuth(event, "analytics")
    authToken = authResult?.sub || null

    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)

    // Parse query parameters
    const query = getQuery(event)
    const params: AnalyticsQueryParams = {
      // biome-ignore lint/suspicious/noExplicitAny: Query params need type flexibility for enum casting
      timeRange: (query.timeRange as any) || "24h",
      customStart: query.customStart as string,
      customEnd: query.customEnd as string,
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic string array from query params needs flexible typing
      eventTypes: query.eventTypes ? ((query.eventTypes as string).split(",") as any[]) : undefined,
      country: query.country as string,
      tokenSubject: query.tokenSubject as string,
      limit: query.limit ? Number.parseInt(query.limit as string, 10) : 1000
    }

    // Check cache first
    const cacheKey = getAnalyticsCacheKey(params)
    const cached = await kv.get(cacheKey)

    if (cached) {
      const parsedCache = JSON.parse(cached)
      if (Date.now() - parsedCache.timestamp < 5 * 60 * 1000) {
        // 5 minutes
        return createApiResponse(parsedCache.data, "Analytics data retrieved from cache", {
          request_id: crypto.randomUUID()
        })
      }
    }

    // Get KV metrics for fast data
    const kvMetrics = await getKVMetrics(kv)

    // Calculate time boundaries for the request
    const { start: _start, end: _end } = getTimeRangeBoundaries(params.timeRange, params.customStart, params.customEnd)

    // Query Analytics Engine for real data
    const [engineResults, timeSeriesData] = await Promise.all([
      queryAnalyticsEngine(event, params),
      queryTimeSeriesData(event, params)
    ])
    const events = parseAnalyticsResults(engineResults)

    // Aggregate real analytics events into comprehensive metrics
    const aggregatedMetrics = aggregateAnalyticsMetrics(events, params.timeRange, params.customStart, params.customEnd)

    // Merge KV metrics (fast queries) with Analytics Engine data (detailed analysis)
    const metrics: AnalyticsMetrics = {
      timeframe: aggregatedMetrics.timeframe,
      timeSeries: timeSeriesData, // Use real time-series data
      overview: {
        // Use KV for accurate request counts, Analytics Engine for calculated metrics
        totalRequests: kvMetrics.totalRequests || aggregatedMetrics.overview.totalRequests,
        successfulRequests: kvMetrics.successfulRequests || aggregatedMetrics.overview.successfulRequests,
        failedRequests: kvMetrics.failedRequests || aggregatedMetrics.overview.failedRequests,
        averageResponseTime: aggregatedMetrics.overview.averageResponseTime,
        uniqueVisitors: aggregatedMetrics.overview.uniqueVisitors
      },
      redirects: {
        // Prefer KV for redirect counts (authoritative) but use Analytics Engine for detailed breakdown
        totalClicks: kvMetrics.redirectClicks || aggregatedMetrics.redirects.totalClicks,
        topSlugs:
          aggregatedMetrics.redirects.topSlugs.length > 0
            ? aggregatedMetrics.redirects.topSlugs
            : Object.entries(kvMetrics.redirectsBySlug)
                .map(([slug, clicks]) => ({
                  slug,
                  clicks,
                  destinations: [] // Will be populated from Analytics Engine data
                }))
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 10)
      },
      ai: aggregatedMetrics.ai,
      authentication: aggregatedMetrics.authentication,
      routeros: {
        // Use KV for RouterOS cache data (most accurate)
        cacheHits: kvMetrics.routeros.cacheHits,
        cacheMisses: kvMetrics.routeros.cacheMisses,
        putioGenerations: aggregatedMetrics.routeros.putioGenerations
      },
      geographic: aggregatedMetrics.geographic,
      userAgents: aggregatedMetrics.userAgents,
      rateLimiting: {
        // Use KV for rate limiting data (authoritative)
        throttledRequests: kvMetrics.rateLimitedRequests,
        throttledByToken: aggregatedMetrics.rateLimiting.throttledByToken
      }
    }

    // Cache the results
    await kv.put(
      cacheKey,
      JSON.stringify({
        data: metrics,
        timestamp: Date.now()
      }),
      { expirationTtl: 300 }
    ) // 5 minutes

    // Write analytics about analytics query (meta!)
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      if (env?.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            "api_request",
            "/api/analytics",
            "GET",
            cfInfo.userAgent,
            cfInfo.ip,
            cfInfo.country,
            cfInfo.ray,
            authToken || "anonymous",
            params.timeRange,
            JSON.stringify(params.eventTypes || [])
          ],
          doubles: [
            responseTime,
            200,
            1, // success
            metrics.overview.totalRequests,
            metrics.overview.successfulRequests,
            metrics.overview.failedRequests,
            metrics.redirects.totalClicks,
            metrics.ai.totalOperations,
            cached ? 1 : 0, // was cached
            engineResults.length // number of raw events
          ],
          indexes: ["api_request", "/api/analytics", authToken || "anonymous"]
        })
      }

      // Update KV counters for analytics usage
      if (env?.DATA) {
        await env.DATA.put(
          "metrics:analytics:queries:total",
          String((await env.DATA.get("metrics:analytics:queries:total").then((v) => Number.parseInt(v || "0"))) + 1)
        )

        // Track which time ranges are most popular
        const timeRangeKey = `metrics:analytics:time_ranges:${params.timeRange}:count`
        await env.DATA.put(
          timeRangeKey,
          String((await env.DATA.get(timeRangeKey).then((v) => Number.parseInt(v || "0"))) + 1)
        )

        // Track cache hit rate
        if (cached) {
          await env.DATA.put(
            "metrics:analytics:cache:hits",
            String((await env.DATA.get("metrics:analytics:cache:hits").then((v) => Number.parseInt(v || "0"))) + 1)
          )
        } else {
          await env.DATA.put(
            "metrics:analytics:cache:misses",
            String((await env.DATA.get("metrics:analytics:cache:misses").then((v) => Number.parseInt(v || "0"))) + 1)
          )
        }
      }
    } catch (analyticsError) {
      console.error("Failed to write analytics query analytics:", analyticsError)
    }

    return createApiResponse(metrics, "Analytics data retrieved successfully", {
      request_id: crypto.randomUUID()
    })
  } catch (error: unknown) {
    console.error("Analytics error:", error)

    if (error instanceof Error) {
      throw createApiError(500, `Failed to retrieve analytics: ${error.message}`)
    }

    throw createApiError(500, "Failed to retrieve analytics")
  }
})
