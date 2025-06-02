import { getHeaders } from "h3"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
import { createApiResponse, logRequest } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  // Get all request headers as seen by the Worker
  const headers = getHeaders(event)
  
  // Extract Cloudflare-specific headers for easier inspection
  const cloudflareHeaders = Object.entries(headers)
    .filter(([key]) => key.toLowerCase().startsWith('cf-'))
    .reduce((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {} as Record<string, string>)

  // Extract forwarding headers
  const forwardingHeaders = Object.entries(headers)
    .filter(([key]) => key.toLowerCase().includes('forward') || key.toLowerCase().includes('real-ip'))
    .reduce((acc, [key, value]) => {
      acc[key] = value
      return acc
    }, {} as Record<string, string>)

  const headerInfo = {
    all_headers: headers,
    cloudflare_headers: cloudflareHeaders,
    forwarding_headers: forwardingHeaders,
    header_count: Object.keys(headers).length,
    request_info: {
      method: event.node.req.method,
      url: event.node.req.url,
      http_version: event.node.req.httpVersion
    }
  }

  // Write KV metrics
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)

    const userAgent = headers["user-agent"] || ""
    const kvCounters = createAPIRequestKVCounters("/api/internal/headers", "GET", 200, cfInfo, userAgent, [
      { key: "headers:requests:total" },
      { key: `headers:count:${Math.floor(headerInfo.header_count / 10) * 10}` }, // Bucket header counts by 10s
      { key: `headers:cf-headers:${Object.keys(cloudflareHeaders).length}` }
    ])

    if (env?.DATA) {
      await writeKVMetrics(env.DATA, kvCounters)
    }
  } catch (error) {
    console.error("Failed to write headers metrics:", error)
    // Continue with response even if metrics fails
  }

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "headers", "GET", 200, {
    headerCount: headerInfo.header_count,
    cfHeaderCount: Object.keys(cloudflareHeaders).length,
    responseTime: `${responseTime}ms`
  })

  return createApiResponse(headerInfo, "Request headers retrieved successfully")
})