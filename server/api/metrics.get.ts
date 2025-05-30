import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { batchKVGet, getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { formatMetricsAsPrometheus, formatMetricsAsYAML, handleResponseFormat } from "~/server/utils/formatters"
import { createApiError, isApiError, logRequest } from "~/server/utils/response"
import { TokenMetricsSchema } from "~/server/utils/schemas"

async function getMetricsFromAnalytics(
  analytics?: AnalyticsEngineDataset,
  kv?: KVNamespace
): Promise<{
  total_requests: number
  successful_requests: number
  failed_requests: number
  rate_limited_requests: number
  redirect_clicks: number
  last_24h: { total: number; successful: number; failed: number; redirects: number }
}> {
  if (!analytics || !kv) {
    throw new Error("Analytics Engine and KV storage are required for metrics")
  }

  try {
    // Try to get cached metrics from KV first
    const cachedMetrics = await kv.get("api_metrics_cache")
    if (cachedMetrics) {
      const parsed = JSON.parse(cachedMetrics)
      // Check if cache is less than 5 minutes old
      if (Date.now() - parsed.cached_at < 5 * 60 * 1000) {
        return parsed.data
      }
    }

    // Query real metrics from Analytics Engine
    const now = new Date()
    const _yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Get total API requests from KV counters using batch helper
    const [totalRequests = 0, successfulRequests = 0, failedRequests = 0, rateLimitedRequests = 0] = await batchKVGet(
      kv,
      [
        "metrics:requests:total",
        "metrics:requests:successful",
        "metrics:requests:failed",
        "metrics:requests:rate_limited"
      ]
    )

    // Get 24h metrics from KV using batch helper
    const [last24hTotal = 0, last24hSuccessful = 0, last24hFailed = 0, last24hRedirects = 0] = await batchKVGet(kv, [
      "metrics:24h:total",
      "metrics:24h:successful",
      "metrics:24h:failed",
      "metrics:24h:redirects"
    ])

    // Get redirect click metrics from KV
    const [totalRedirectClicks = 0] = await batchKVGet(kv, ["metrics:redirect:total:clicks"])

    const metricsData = {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      rate_limited_requests: rateLimitedRequests,
      redirect_clicks: totalRedirectClicks,
      last_24h: {
        total: last24hTotal,
        successful: last24hSuccessful,
        failed: last24hFailed,
        redirects: last24hRedirects
      }
    }

    // Cache the results if KV is available
    if (kv) {
      await kv.put(
        "api_metrics_cache",
        JSON.stringify({
          data: metricsData,
          cached_at: now
        }),
        { expirationTtl: 300 }
      ) // 5 minutes
    }

    return metricsData
  } catch (error) {
    console.error("Failed to get metrics:", error)
    throw error
  }
}

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  let authToken: string | null = null
  let authSuccess = false

  try {
    // Check authorization for metrics endpoint using helper
    const authResult = await requireAPIAuth(event, "metrics")
    authToken = authResult?.sub || null
    authSuccess = true

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env.DATA || !env.ANALYTICS) {
      // Write analytics for service unavailable
      try {
        const cfInfo = getCloudflareRequestInfo(event)
        const responseTime = Date.now() - startTime

        const analyticsEvent = {
          type: "api_request" as const,
          timestamp: new Date().toISOString(),
          cloudflare: cfInfo,
          data: {
            endpoint: "/api/metrics",
            method: "GET",
            statusCode: 503,
            responseTimeMs: responseTime,
            tokenSubject: authToken || undefined
          }
        }

        const kvCounters = createAPIRequestKVCounters("/api/metrics", "GET", 503, cfInfo, [
          { key: "metrics:errors:service-unavailable" },
          { key: "metrics:availability:kv", increment: env?.DATA ? 1 : 0 },
          { key: "metrics:availability:analytics", increment: env?.ANALYTICS ? 1 : 0 }
        ])

        await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
      } catch (analyticsError) {
        console.error("Failed to write metrics error analytics:", analyticsError)
      }

      // Log error request
      logRequest(event, "metrics", "GET", 503, {
        error: "Analytics services not available",
        user: authToken || "unknown",
        kvAvailable: !!env?.DATA,
        analyticsAvailable: !!env?.ANALYTICS
      })

      throw createApiError(503, "Analytics services not available")
    }

    // Get metrics data from Analytics Engine/KV
    const metricsData = await getMetricsFromAnalytics(env.ANALYTICS, env.DATA)

    // Validate and format metrics data
    const metrics = TokenMetricsSchema.parse({
      success: true,
      data: metricsData,
      timestamp: new Date().toISOString()
    })

    // Get requested format for analytics
    const requestedFormat = (getQuery(event).format as string) || "json"

    // Write successful analytics with rich data
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime

      const analyticsEvent = {
        type: "api_request" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          endpoint: "/api/metrics",
          method: "GET",
          statusCode: 200,
          responseTimeMs: responseTime,
          tokenSubject: authToken || undefined
        }
      }

      const kvCounters = createAPIRequestKVCounters("/api/metrics", "GET", 200, cfInfo, [
        { key: "metrics:retrievals:total" },
        { key: `metrics:format:${requestedFormat}` },
        { key: "metrics:data:total-requests", value: metricsData.total_requests },
        { key: "metrics:data:successful-requests", value: metricsData.successful_requests },
        { key: "metrics:data:failed-requests", value: metricsData.failed_requests },
        { key: "metrics:data:rate-limited-requests", value: metricsData.rate_limited_requests },
        { key: "metrics:data:redirect-clicks", value: metricsData.redirect_clicks },
        { key: "metrics:data:last-24h-total", value: metricsData.last_24h.total }
      ])

      await writeAnalytics(true, env.ANALYTICS, env.DATA, analyticsEvent, kvCounters)
    } catch (analyticsError) {
      console.error("Failed to write metrics success analytics:", analyticsError)
    }

    // Log successful request
    const responseTime = Date.now() - startTime
    logRequest(event, "metrics", "GET", 200, {
      user: authToken || "unknown",
      format: requestedFormat,
      totalRequests: metricsData.total_requests,
      responseTime: `${responseTime}ms`
    })

    // Handle different output formats using centralized formatter
    return handleResponseFormat(event, metrics, {
      json: () => metrics,
      yaml: () => formatMetricsAsYAML(metrics),
      prometheus: () => formatMetricsAsPrometheus(metrics)
    })
  } catch (error: unknown) {
    console.error("Metrics error:", error)

    // Write analytics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const responseTime = Date.now() - startTime
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      if (env?.ANALYTICS) {
        const analyticsEvent = {
          type: "api_request" as const,
          timestamp: new Date().toISOString(),
          cloudflare: cfInfo,
          data: {
            endpoint: "/api/metrics",
            method: "GET",
            statusCode: statusCode,
            responseTimeMs: responseTime,
            tokenSubject: authToken || undefined
          }
        }

        const kvCounters = createAPIRequestKVCounters("/api/metrics", "GET", statusCode, cfInfo, [
          { key: "metrics:errors:total" },
          { key: authSuccess ? "metrics:errors:processing" : "metrics:errors:auth-failed" }
        ])

        await writeAnalytics(true, env.ANALYTICS, env.DATA, analyticsEvent, kvCounters)
      }
    } catch (analyticsError) {
      console.error("Failed to write metrics error analytics:", analyticsError)
    }

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "metrics", "GET", statusCode, {
      user: authToken || "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      authSuccess
    })

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Failed to retrieve metrics")
  }
})
