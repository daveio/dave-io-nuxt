import { recordAPIMetrics } from "~/server/middleware/metrics"
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

  // Record standard API metrics
  await recordAPIMetrics(event, 200)

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "health", "GET", 200, {
    environment: healthData.environment,
    runtime: healthData.runtime,
    responseTime: `${responseTime}ms`
  })

  return createApiResponse(healthData, "Service is healthy")
})
