import type { H3Event } from "h3"
import { getHeader, getMethod, getRequestURL } from "h3"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"

/**
 * Helper to automatically record standard API metrics for an endpoint
 * This should be called in the success path of every /api endpoint
 */
export async function recordAPIMetrics(event: H3Event, statusCode = 200): Promise<void> {
  try {
    const env = getCloudflareEnv(event)
    if (!env?.DATA) {
      return // Skip metrics if KV is not available
    }

    const url = getRequestURL(event)
    const method = getMethod(event)
    const cfInfo = getCloudflareRequestInfo(event)
    const userAgent = getHeader(event, "user-agent") || ""

    const kvCounters = createAPIRequestKVCounters(url.pathname, method, statusCode, cfInfo, userAgent)

    await writeKVMetrics(env.DATA, kvCounters)
  } catch (error) {
    console.error("Failed to record API metrics:", error)
    // Never let metrics errors break the request
  }
}

/**
 * Helper to record API metrics in error scenarios
 * This should be called in error handlers for /api endpoints
 */
export async function recordAPIErrorMetrics(event: H3Event, error: unknown): Promise<void> {
  let statusCode = 500

  // Extract status code from error if it's an API error
  if (error && typeof error === "object" && "statusCode" in error) {
    // biome-ignore lint/suspicious/noExplicitAny: Error objects have dynamic structure
    statusCode = (error as any).statusCode || 500
  }

  await recordAPIMetrics(event, statusCode)
}
