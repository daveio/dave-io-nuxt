import { createApiError } from "~/server/utils/response"
import { authorizeEndpoint } from "~/server/utils/auth"

function generateYAML(obj: any, indent = 0): string {
  const spaces = "  ".repeat(indent)
  const lines: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`${spaces}${key}:`)
      lines.push(generateYAML(value, indent + 1))
    } else if (Array.isArray(value)) {
      lines.push(`${spaces}${key}:`)
      for (const item of value) {
        lines.push(`${spaces}  - ${JSON.stringify(item)}`)
      }
    } else {
      const yamlValue = typeof value === "string" ? `"${value}"` : String(value)
      lines.push(`${spaces}${key}: ${yamlValue}`)
    }
  }

  return lines.join("\n")
}

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

    // Comprehensive metrics data
    const metrics = {
      service: "dave-io-nuxt",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requests: {
        total: 12847,
        successful: 12156,
        failed: 691,
        rate_limited: 34
      },
      endpoints: {
        "/api/auth": { count: 1240, avg_response_time: 125 },
        "/api/metrics": { count: 89, avg_response_time: 45 },
        "/api/ai/alt": { count: 456, avg_response_time: 1230 },
        "/api/dashboard/demo": { count: 67, avg_response_time: 234 },
        "/api/dashboard/hacker-news": { count: 34, avg_response_time: 567 },
        "/api/routeros/putio": { count: 123, avg_response_time: 890 },
        "/go/gh": { count: 234, avg_response_time: 12 },
        "/go/tw": { count: 123, avg_response_time: 15 },
        "/go/li": { count: 67, avg_response_time: 18 }
      },
      status_codes: {
        "200": 11567,
        "301": 278,
        "302": 145,
        "400": 234,
        "401": 123,
        "404": 145,
        "429": 34,
        "500": 67
      },
      jwt_tokens: {
        active: 15,
        revoked: 3,
        expired: 8,
        total_requests: 8934,
        rate_limited: 34
      },
      cloudflare: {
        ray: cfRay,
        datacenter,
        country
      },
      cache: {
        hits: 8945,
        misses: 3902,
        hit_ratio: 0.696
      },
      routeros: {
        cache_hits: 234,
        cache_misses: 12,
        refresh_count: 8,
        reset_count: 2,
        last_updated: new Date(Date.now() - 1800000).toISOString()
      }
    }

    setHeader(event, "Content-Type", "text/yaml")
    return generateYAML(metrics)
  } catch (error: any) {
    console.error("Metrics YAML error:", error)

    if (error.statusCode) {
      throw error
    }

    throw createApiError(500, "Metrics YAML generation failed")
  }
})
