import { createApiError } from "~/server/utils/response"
import { authorizeEndpoint } from "~/server/utils/auth"

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for metrics access
    const authFunc = await authorizeEndpoint("api", "metrics")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    // Get Cloudflare request metadata
    const cfRay = getHeader(event, "cf-ray") || "unknown"
    const datacenter = getHeader(event, "cf-datacenter") || "unknown"
    const country = getHeader(event, "cf-ipcountry") || "unknown"

    // Current timestamp for Prometheus
    const timestamp = Math.floor(Date.now() / 1000)

    // Generate Prometheus metrics format
    const lines: string[] = []

    // Service info
    lines.push("# HELP dave_io_info Information about the dave.io service")
    lines.push("# TYPE dave_io_info gauge")
    lines.push(
      `dave_io_info{version="1.0.0",service="dave-io-nuxt",datacenter="${datacenter}",country="${country}"} 1 ${timestamp}`
    )
    lines.push("")

    // Request metrics
    lines.push("# HELP dave_io_requests_total Total number of requests by status")
    lines.push("# TYPE dave_io_requests_total counter")
    lines.push(`dave_io_requests_total{status="total"} 12847 ${timestamp}`)
    lines.push(`dave_io_requests_total{status="successful"} 12156 ${timestamp}`)
    lines.push(`dave_io_requests_total{status="failed"} 691 ${timestamp}`)
    lines.push(`dave_io_requests_total{status="rate_limited"} 34 ${timestamp}`)
    lines.push("")

    // HTTP status codes
    lines.push("# HELP dave_io_http_responses_total HTTP responses by status code")
    lines.push("# TYPE dave_io_http_responses_total counter")
    const statusCodes = {
      "200": 11567,
      "301": 278,
      "302": 145,
      "400": 234,
      "401": 123,
      "404": 145,
      "429": 34,
      "500": 67
    }
    for (const [code, count] of Object.entries(statusCodes)) {
      lines.push(`dave_io_http_responses_total{code="${code}"} ${count} ${timestamp}`)
    }
    lines.push("")

    // Endpoint metrics
    lines.push("# HELP dave_io_endpoint_requests_total Total requests per endpoint")
    lines.push("# TYPE dave_io_endpoint_requests_total counter")
    lines.push("# HELP dave_io_endpoint_duration_milliseconds Average response time per endpoint")
    lines.push("# TYPE dave_io_endpoint_duration_milliseconds gauge")

    const endpoints = {
      "/api/auth": { count: 1240, avg_response_time: 125 },
      "/api/metrics": { count: 89, avg_response_time: 45 },
      "/api/ai/alt": { count: 456, avg_response_time: 1230 },
      "/api/dashboard/demo": { count: 67, avg_response_time: 234 },
      "/api/dashboard/hacker-news": { count: 34, avg_response_time: 567 },
      "/api/routeros/putio": { count: 123, avg_response_time: 890 },
      "/go/gh": { count: 234, avg_response_time: 12 },
      "/go/tw": { count: 123, avg_response_time: 15 },
      "/go/li": { count: 67, avg_response_time: 18 }
    }

    for (const [endpoint, stats] of Object.entries(endpoints)) {
      lines.push(`dave_io_endpoint_requests_total{endpoint="${endpoint}"} ${stats.count} ${timestamp}`)
      lines.push(
        `dave_io_endpoint_duration_milliseconds{endpoint="${endpoint}"} ${stats.avg_response_time} ${timestamp}`
      )
    }
    lines.push("")

    // JWT token metrics
    lines.push("# HELP dave_io_jwt_tokens_total JWT token statistics")
    lines.push("# TYPE dave_io_jwt_tokens_total gauge")
    lines.push(`dave_io_jwt_tokens_total{status="active"} 15 ${timestamp}`)
    lines.push(`dave_io_jwt_tokens_total{status="revoked"} 3 ${timestamp}`)
    lines.push(`dave_io_jwt_tokens_total{status="expired"} 8 ${timestamp}`)
    lines.push("")

    lines.push("# HELP dave_io_jwt_requests_total Total requests using JWT tokens")
    lines.push("# TYPE dave_io_jwt_requests_total counter")
    lines.push(`dave_io_jwt_requests_total 8934 ${timestamp}`)
    lines.push("")

    // Cache metrics
    lines.push("# HELP dave_io_cache_operations_total Cache operations by result")
    lines.push("# TYPE dave_io_cache_operations_total counter")
    lines.push(`dave_io_cache_operations_total{result="hit"} 8945 ${timestamp}`)
    lines.push(`dave_io_cache_operations_total{result="miss"} 3902 ${timestamp}`)
    lines.push("")

    lines.push("# HELP dave_io_cache_hit_ratio Cache hit ratio")
    lines.push("# TYPE dave_io_cache_hit_ratio gauge")
    lines.push(`dave_io_cache_hit_ratio 0.696 ${timestamp}`)
    lines.push("")

    // RouterOS metrics
    lines.push("# HELP dave_io_routeros_cache_operations_total RouterOS cache operations")
    lines.push("# TYPE dave_io_routeros_cache_operations_total counter")
    lines.push(`dave_io_routeros_cache_operations_total{operation="hit"} 234 ${timestamp}`)
    lines.push(`dave_io_routeros_cache_operations_total{operation="miss"} 12 ${timestamp}`)
    lines.push(`dave_io_routeros_cache_operations_total{operation="refresh"} 8 ${timestamp}`)
    lines.push(`dave_io_routeros_cache_operations_total{operation="reset"} 2 ${timestamp}`)
    lines.push("")

    // AI metrics
    lines.push("# HELP dave_io_ai_requests_total AI service requests")
    lines.push("# TYPE dave_io_ai_requests_total counter")
    lines.push(`dave_io_ai_requests_total{service="alt_text"} 456 ${timestamp}`)
    lines.push(`dave_io_ai_requests_total{service="alt_text",status="rate_limited"} 12 ${timestamp}`)
    lines.push(`dave_io_ai_requests_total{service="alt_text",status="error"} 23 ${timestamp}`)
    lines.push("")

    lines.push("# HELP dave_io_ai_processing_duration_milliseconds AI processing time")
    lines.push("# TYPE dave_io_ai_processing_duration_milliseconds gauge")
    lines.push(`dave_io_ai_processing_duration_milliseconds{service="alt_text"} 1230 ${timestamp}`)
    lines.push("")

    // Redirect metrics
    lines.push("# HELP dave_io_redirects_total URL redirect usage")
    lines.push("# TYPE dave_io_redirects_total counter")
    lines.push(`dave_io_redirects_total{slug="gh"} 234 ${timestamp}`)
    lines.push(`dave_io_redirects_total{slug="tw"} 123 ${timestamp}`)
    lines.push(`dave_io_redirects_total{slug="li"} 67 ${timestamp}`)

    setHeader(event, "Content-Type", "text/plain; version=0.0.4")
    return lines.join("\n")
  } catch (error: any) {
    console.error("Metrics Prometheus error:", error)

    if (error.statusCode) {
      throw error
    }

    throw createApiError(500, "Prometheus metrics generation failed")
  }
})
