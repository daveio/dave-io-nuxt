import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { batchKVGet, getCloudflareEnv } from "~/server/utils/cloudflare"
import { formatMetricsAsPrometheus, formatMetricsAsYAML, handleResponseFormat } from "~/server/utils/formatters"
import { createApiError, isApiError } from "~/server/utils/response"
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
  try {
    // Check authorization for metrics endpoint using helper
    await requireAPIAuth(event, "metrics")

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)
    if (!env.DATA || !env.ANALYTICS) {
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

    // Handle different output formats using centralized formatter
    return handleResponseFormat(event, metrics, {
      json: () => metrics,
      yaml: () => formatMetricsAsYAML(metrics),
      prometheus: () => formatMetricsAsPrometheus(metrics)
    })
  } catch (error: unknown) {
    console.error("Metrics error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Failed to retrieve metrics")
  }
})
