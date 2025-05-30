import {
  aggregateAnalyticsMetrics,
  getAnalyticsCacheKey,
  getKVMetrics,
  getTimeRangeBoundaries,
  parseAnalyticsResults,
  queryAnalyticsEngine
} from "~/server/utils/analytics"
import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getKVNamespace } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse } from "~/server/utils/response"
import type { AnalyticsMetrics, AnalyticsQueryParams, AnalyticsResponse } from "~/types/analytics"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  try {
    // Require analytics permissions
    await requireAPIAuth(event, "analytics")

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
        return createApiResponse<AnalyticsResponse<AnalyticsMetrics>>(
          {
            success: true,
            data: parsedCache.data,
            meta: {
              requestId: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              cached: true,
              cacheExpiry: new Date(parsedCache.timestamp + 5 * 60 * 1000).toISOString()
            }
          },
          "Analytics data retrieved from cache"
        )
      }
    }

    // Get KV metrics for fast data
    const kvMetrics = await getKVMetrics(kv)

    // Calculate time boundaries for the request
    const { start: _start, end: _end } = getTimeRangeBoundaries(params.timeRange, params.customStart, params.customEnd)

    // Query real Analytics Engine data for detailed insights
    const engineResults = await queryAnalyticsEngine(event, params)
    const events = parseAnalyticsResults(engineResults)

    // Aggregate real analytics events into comprehensive metrics
    const aggregatedMetrics = aggregateAnalyticsMetrics(events, params.timeRange, params.customStart, params.customEnd)

    // Merge KV metrics (fast queries) with Analytics Engine data (detailed analysis)
    const metrics: AnalyticsMetrics = {
      timeframe: aggregatedMetrics.timeframe,
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

    const response: AnalyticsResponse<AnalyticsMetrics> = {
      success: true,
      data: metrics,
      meta: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        cached: false,
        queryTime: Date.now() - startTime
      }
    }

    return createApiResponse(response, "Analytics data retrieved successfully")
  } catch (error: unknown) {
    console.error("Analytics error:", error)

    if (error instanceof Error) {
      throw createApiError(500, `Failed to retrieve analytics: ${error.message}`)
    }

    throw createApiError(500, "Failed to retrieve analytics")
  }
})
