import { getAnalyticsBinding, getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
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

  // Write analytics data to Analytics Engine
  try {
    const env = getCloudflareEnv(event)
    const analytics = getAnalyticsBinding(env)

    analytics.writeDataPoint({
      blobs: ["ping", cfInfo.userAgent, cfInfo.ip, cfInfo.country, cfInfo.ray],
      doubles: [1], // Ping count
      indexes: ["ping"] // For querying ping events
    })
  } catch (error) {
    console.error("Failed to write ping analytics:", error)
    // Continue with response even if analytics fails
  }

  // Log ping for analytics using structured logging
  console.log(`[PING] IP: ${cfInfo.ip} | Country: ${cfInfo.country} | Ray: ${cfInfo.ray} | UA: ${cfInfo.userAgent}`)

  return createApiResponse(pongData, "pong")
})
