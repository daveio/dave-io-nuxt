import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { batchKVGet, getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { formatMetricsAsPrometheus, formatMetricsAsYAML, handleResponseFormat } from "~/server/utils/formatters"
import { createAPIRequestKVCounters, getKVMetrics, writeKVMetrics } from "~/server/utils/kv-metrics"
import { createApiError, isApiError, logRequest } from "~/server/utils/response"
import { TokenMetricsSchema } from "~/server/utils/schemas"

async function getMetricsFromKV(kv?: KVNamespace): Promise<{
  total_requests: number
  successful_requests: number
  failed_requests: number
  redirect_clicks: number
  last_24h: { total: number; successful: number; failed: number; redirects: number }
}> {
  if (!kv) {
    throw new Error("KV storage is required for metrics")
  }

  try {
    // Get metrics using new hierarchy
    const kvMetrics = await getKVMetrics(kv)

    const metricsData = {
      total_requests: kvMetrics.totalRequests,
      successful_requests: kvMetrics.successfulRequests,
      failed_requests: kvMetrics.failedRequests,
      redirect_clicks: kvMetrics.redirectClicks,
      last_24h: {
        total: 0,
        successful: 0,
        failed: 0,
        redirects: 0
      }
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
    if (!env.DATA) {
      // Write KV metrics for service unavailable
      try {
        const cfInfo = getCloudflareRequestInfo(event)

        const kvCounters = createAPIRequestKVCounters(
          "/api/internal/metrics",
          "GET",
          503,
          cfInfo,
          getHeader(event, "user-agent")
        )

        if (env?.DATA) {
          await writeKVMetrics(env.DATA, kvCounters)
        }
      } catch (kvError) {
        console.error("Failed to write metrics error KV metrics:", kvError)
      }

      // Log error request
      logRequest(event, "metrics", "GET", 503, {
        error: "KV storage not available",
        user: authToken || "unknown",
        kvAvailable: !!env?.DATA
      })

      throw createApiError(503, "KV storage not available")
    }

    // Get metrics data from KV
    const metricsData = await getMetricsFromKV(env.DATA)

    // Validate and format metrics data
    const metrics = TokenMetricsSchema.parse({
      success: true,
      data: metricsData,
      timestamp: new Date().toISOString()
    })

    // Get requested format for metrics response
    const requestedFormat = (getQuery(event).format as string) || "json"

    // Write successful KV metrics with rich data
    try {
      const cfInfo = getCloudflareRequestInfo(event)

      const kvCounters = createAPIRequestKVCounters(
        "/api/internal/metrics",
        "GET",
        200,
        cfInfo,
        getHeader(event, "user-agent")
      )

      if (env?.DATA) {
        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (metricsError) {
      console.error("Failed to write metrics success KV metrics:", metricsError)
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

    // Write KV metrics for failed requests
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
      const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

      if (env?.DATA) {
        const kvCounters = createAPIRequestKVCounters(
          "/api/internal/metrics",
          "GET",
          statusCode,
          cfInfo,
          getHeader(event, "user-agent")
        )

        await writeKVMetrics(env.DATA, kvCounters)
      }
    } catch (kvError) {
      console.error("Failed to write metrics error KV metrics:", kvError)
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
