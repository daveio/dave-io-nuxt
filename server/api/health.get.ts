import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiResponse, logRequest } from "~/server/utils/response"
import { HealthCheckSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  const healthData = HealthCheckSchema.parse({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    runtime: "cloudflare-workers",
    cf_ray: getHeader(event, "cf-ray") || "unknown",
    cf_datacenter: getHeader(event, "cf-ray")?.substring(0, 3) || "unknown"
  })

  // Write analytics (Analytics Engine + KV counters)
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)
    const responseTime = Date.now() - startTime

    const analyticsEvent = {
      type: "api_request" as const,
      timestamp: new Date().toISOString(),
      cloudflare: cfInfo,
      data: {
        endpoint: "/api/health",
        method: "GET",
        statusCode: 200,
        responseTimeMs: responseTime,
        tokenSubject: undefined
      }
    }

    const kvCounters = createAPIRequestKVCounters("/api/health", "GET", 200, cfInfo, [
      { key: "health:checks:total" },
      { key: `health:environments:${healthData.environment}` },
      { key: `health:runtimes:${healthData.runtime}` }
    ])

    await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
  } catch (error) {
    console.error("Failed to write health check analytics:", error)
    // Continue with response even if analytics fails
  }

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "health", "GET", 200, {
    environment: healthData.environment,
    runtime: healthData.runtime,
    responseTime: `${responseTime}ms`
  })

  return createApiResponse(healthData, "Service is healthy")
})
