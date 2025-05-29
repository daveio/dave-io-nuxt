import { authorizeEndpoint } from "~/server/utils/auth"
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
  last_24h: { total: number; successful: number; failed: number }
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

    // Get total API requests from KV counters
    const [totalRequests, successfulRequests, failedRequests, rateLimitedRequests] = await Promise.all([
      kv.get("metrics:requests:total").then((v) => Number.parseInt(v || "0")),
      kv.get("metrics:requests:successful").then((v) => Number.parseInt(v || "0")),
      kv.get("metrics:requests:failed").then((v) => Number.parseInt(v || "0")),
      kv.get("metrics:requests:rate_limited").then((v) => Number.parseInt(v || "0"))
    ])

    // Get 24h metrics from KV (these should be updated by Analytics Engine processing)
    const [last24hTotal, last24hSuccessful, last24hFailed] = await Promise.all([
      kv.get("metrics:24h:total").then((v) => Number.parseInt(v || "0")),
      kv.get("metrics:24h:successful").then((v) => Number.parseInt(v || "0")),
      kv.get("metrics:24h:failed").then((v) => Number.parseInt(v || "0"))
    ])

    const metricsData = {
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      rate_limited_requests: rateLimitedRequests,
      last_24h: {
        total: last24hTotal,
        successful: last24hSuccessful,
        failed: last24hFailed
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
    // Check authorization for metrics endpoint
    const authFunc = await authorizeEndpoint("api", "metrics")
    const auth = await authFunc(event)
    if (!auth.success) {
      createApiError(401, auth.error || "Unauthorized")
    }

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; ANALYTICS?: AnalyticsEngineDataset }

    if (!env?.DATA || !env?.ANALYTICS) {
      throw createApiError(503, "Analytics services not available")
    }

    // Get query parameters for format
    const query = getQuery(event)
    const format = (query.format as string) || "json"

    // Get metrics data from Analytics Engine/KV
    const metricsData = await getMetricsFromAnalytics(env.ANALYTICS, env.DATA)

    // Validate and format metrics data
    const metrics = TokenMetricsSchema.parse({
      success: true,
      data: metricsData,
      timestamp: new Date().toISOString()
    })

    // Handle different output formats
    switch (format.toLowerCase()) {
      case "json":
        setHeader(event, "content-type", "application/json")
        return metrics

      case "yaml": {
        setHeader(event, "content-type", "application/x-yaml")
        // Simple YAML conversion - in production use a proper YAML library
        const yamlOutput = `
success: true
data:
  total_requests: ${metrics.data.total_requests}
  successful_requests: ${metrics.data.successful_requests}
  failed_requests: ${metrics.data.failed_requests}
  rate_limited_requests: ${metrics.data.rate_limited_requests}
  last_24h:
    total: ${metrics.data.last_24h.total}
    successful: ${metrics.data.last_24h.successful}
    failed: ${metrics.data.last_24h.failed}
timestamp: ${metrics.timestamp}
`.trim()
        return yamlOutput
      }

      case "prometheus": {
        setHeader(event, "content-type", "text/plain")
        // Prometheus format
        const prometheusOutput = `
# HELP api_requests_total Total number of API requests
# TYPE api_requests_total counter
api_requests_total ${metrics.data.total_requests}

# HELP api_requests_successful_total Total number of successful API requests
# TYPE api_requests_successful_total counter
api_requests_successful_total ${metrics.data.successful_requests}

# HELP api_requests_failed_total Total number of failed API requests
# TYPE api_requests_failed_total counter
api_requests_failed_total ${metrics.data.failed_requests}

# HELP api_requests_rate_limited_total Total number of rate limited API requests
# TYPE api_requests_rate_limited_total counter
api_requests_rate_limited_total ${metrics.data.rate_limited_requests}

# HELP api_requests_24h_total Total number of API requests in last 24 hours
# TYPE api_requests_24h_total gauge
api_requests_24h_total ${metrics.data.last_24h.total}
`.trim()
        return prometheusOutput
      }

      default:
        createApiError(400, `Unsupported format: ${format}. Supported formats: json, yaml, prometheus`)
    }
  } catch (error: unknown) {
    console.error("Metrics error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Failed to retrieve metrics")
  }
})
