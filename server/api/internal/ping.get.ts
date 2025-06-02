import { recordAPIMetrics } from "~/server/middleware/metrics"
import { getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiResponse, logRequest } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  // Simple ping endpoint for monitoring and health checks
  const cfInfo = getCloudflareRequestInfo(event)

  const pongData = {
    pong: true,
    timestamp: new Date().toISOString(),
    cf_ray: cfInfo.ray,
    cf_datacenter: cfInfo.datacenter,
    cf_country: cfInfo.country,
    user_agent: cfInfo.userAgent
  }

  // Record standard API metrics
  await recordAPIMetrics(event, 200)

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "ping", "GET", 200, {
    datacenter: cfInfo.datacenter,
    responseTime: `${responseTime}ms`,
    cfRay: cfInfo.ray
  })

  return createApiResponse(pongData, "pong")
})
