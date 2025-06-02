import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
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

  // Write KV metrics
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)

    const userAgent = getHeader(event, "user-agent") || ""
    const kvCounters = createAPIRequestKVCounters("/api/health", "GET", 200, cfInfo, userAgent, [
      { key: "health:checks:total" },
      { key: `health:environments:${healthData.environment}` },
      { key: `health:runtimes:${healthData.runtime}` }
    ])

    if (env?.DATA) {
      await writeKVMetrics(env.DATA, kvCounters)
    }
  } catch (error) {
    console.error("Failed to write health check KV metrics:", error)
    // Continue with response even if metrics fails
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
