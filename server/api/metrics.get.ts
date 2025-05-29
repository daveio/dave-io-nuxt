import { createApiResponse, createApiError } from "~/server/utils/response"
import { TokenMetricsSchema } from "~/server/utils/schemas"
import { authorizeEndpoint } from "~/server/utils/auth"

// Simulated metrics data - in production this would come from Analytics Engine/KV
const metricsData = {
  total_requests: 1524,
  successful_requests: 1489,
  failed_requests: 35,
  rate_limited_requests: 12,
  last_24h: {
    total: 145,
    successful: 142,
    failed: 3
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

    // Get query parameters for format
    const query = getQuery(event)
    const format = (query.format as string) || "json"

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

      case "yaml":
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

      case "prometheus":
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

      default:
        createApiError(400, `Unsupported format: ${format}. Supported formats: json, yaml, prometheus`)
    }
  } catch (error: any) {
    console.error("Metrics error:", error)

    // Re-throw API errors
    if (error.statusCode) {
      throw error
    }

    createApiError(500, "Failed to retrieve metrics")
  }
})
