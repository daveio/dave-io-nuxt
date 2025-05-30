import { getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiResponse } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  // Simple ping endpoint for monitoring and health checks using shared helper
  const cfInfo = getCloudflareRequestInfo(event)

  const pongData = {
    pong: true,
    timestamp: new Date().toISOString(),
    cf_ray: cfInfo.ray,
    cf_datacenter: cfInfo.datacenter,
    cf_country: cfInfo.country,
    user_agent: cfInfo.userAgent
  }

  // Log ping for analytics using structured logging
  console.log(`[PING] IP: ${cfInfo.ip} | Country: ${cfInfo.country} | Ray: ${cfInfo.ray} | UA: ${cfInfo.userAgent}`)

  return createApiResponse(pongData, "pong")
})
