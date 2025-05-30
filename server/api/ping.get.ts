import { createAPIRequestKVCounters, writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
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

  // Write analytics using standardized system
  try {
    const env = getCloudflareEnv(event)
    const responseTime = Date.now() - startTime

    const analyticsEvent = {
      type: "ping" as const,
      timestamp: new Date().toISOString(),
      cloudflare: cfInfo,
      data: {
        pingCount: 1
      }
    }

    const kvCounters = createAPIRequestKVCounters("/api/ping", "GET", 200, cfInfo, [
      { key: "ping:total" },
      { key: "ping:by-datacenter:" + cfInfo.datacenter.toLowerCase() },
      { key: "ping:response-time:bucket", increment: responseTime < 10 ? 1 : 0 }, // Fast pings
      {
        key: "ping:unique-ips:daily:" + new Date().toISOString().split("T")[0] + ":" + cfInfo.ip.replace(/\./g, "-"),
        increment: 0,
        value: 1
      } // Unique daily IPs
    ])

    await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
  } catch (error) {
    console.error("Failed to write ping analytics:", error)
    // Continue with response even if analytics fails
  }

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "ping", "GET", 200, {
    datacenter: cfInfo.datacenter,
    responseTime: `${responseTime}ms`,
    cfRay: cfInfo.ray
  })

  return createApiResponse(pongData, "pong")
})
