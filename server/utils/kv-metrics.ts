import type { H3Event } from "h3"

/**
 * KV counter entry for simple increments or value sets
 */
interface KVCounterEntry {
  key: string
  increment?: number
  value?: string | number
}

/**
 * KV metrics structure following new hierarchical schema
 */
interface KVMetrics {
  // Top-level metrics (entire worker)
  ok: number
  error: number
  times: {
    "last-hit": number
    "last-error": number
    "last-ok": number
  }
  visitor: {
    human: number
    bot: number
    unknown: number
  }
  group: {
    "1xx": number
    "2xx": number
    "3xx": number
    "4xx": number
    "5xx": number
  }
  status: Record<string, number>

  // Resource-specific metrics
  resources: Record<
    string,
    {
      ok: number
      error: number
      times: {
        "last-hit": number
        "last-error": number
        "last-ok": number
      }
      visitor: {
        human: number
        bot: number
        unknown: number
      }
      group: {
        "1xx": number
        "2xx": number
        "3xx": number
        "4xx": number
        "5xx": number
      }
      status: Record<string, number>
    }
  >

  // Redirect-specific metrics
  redirect: Record<
    string,
    {
      ok: number
      error: number
      times: {
        "last-hit": number
        "last-error": number
        "last-ok": number
      }
      visitor: {
        human: number
        bot: number
        unknown: number
      }
      group: {
        "1xx": number
        "2xx": number
        "3xx": number
        "4xx": number
        "5xx": number
      }
      status: Record<string, number>
    }
  >
}

/**
 * Write metrics to KV storage only
 */
export async function writeKVMetrics(kvNamespace: KVNamespace, kvCounters: KVCounterEntry[]): Promise<void> {
  try {
    await Promise.all(
      kvCounters.map(async (counter) => {
        try {
          if (counter.value !== undefined) {
            // Set specific value
            await kvNamespace.put(counter.key, String(counter.value))
          } else {
            // Increment by specified amount (default 1)
            const currentValue = await kvNamespace.get(counter.key).then((v) => Number.parseInt(v || "0"))
            const increment = counter.increment || 1
            await kvNamespace.put(counter.key, String(currentValue + increment))
          }
        } catch (error) {
          console.error("Failed to update KV counter:", counter.key, error)
          // Continue with other counters even if one fails
        }
      })
    )
  } catch (error) {
    console.error("Failed to write KV metrics:", error)
    // Don't throw - metrics should never break the main flow
  }
}

/**
 * Get KV metrics following new hierarchical schema
 */
export async function getKVMetrics(kv: KVNamespace): Promise<KVMetrics> {
  try {
    // Get the structured metrics data from KV
    const metricsData = await kv.get("metrics", "json")

    if (!metricsData) {
      // Return empty metrics structure if not found
      return createEmptyMetrics()
    }

    return metricsData as KVMetrics
  } catch (error) {
    console.error("Failed to get KV metrics:", error)
    return createEmptyMetrics()
  }
}

/**
 * Create empty metrics structure
 */
function createEmptyMetrics(): KVMetrics {
  const emptyMetric = {
    ok: 0,
    error: 0,
    times: {
      "last-hit": 0,
      "last-error": 0,
      "last-ok": 0
    },
    visitor: {
      human: 0,
      bot: 0,
      unknown: 0
    },
    group: {
      "1xx": 0,
      "2xx": 0,
      "3xx": 0,
      "4xx": 0,
      "5xx": 0
    },
    status: {}
  }

  return {
    ...emptyMetric,
    resources: {},
    redirect: {}
  }
}

/**
 * Extract resource name from endpoint path
 */
function getResourceFromEndpoint(endpoint: string): string {
  // Remove /api/ prefix and get first segment
  const path = endpoint.replace(/^\/api\//, "")
  const segments = path.split("/")
  return segments[0] || "unknown"
}

/**
 * Classify user agent as human, bot, or unknown
 */
function classifyVisitor(userAgent: string): "human" | "bot" | "unknown" {
  if (!userAgent) return "unknown"

  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /headless/i,
    /phantom/i,
    /puppeteer/i,
    /playwright/i,
    /selenium/i,
    /curl/i,
    /wget/i
  ]

  if (botPatterns.some((pattern) => pattern.test(userAgent))) {
    return "bot"
  }

  // Simple heuristic for human browsers
  if (/mozilla|chrome|safari|firefox|edge/i.test(userAgent)) {
    return "human"
  }

  return "unknown"
}

/**
 * Update metrics for API requests in the new hierarchical schema
 */
export async function updateAPIRequestMetrics(
  kv: KVNamespace,
  endpoint: string,
  _method: string,
  statusCode: number,
  _cfInfo: { country: string; datacenter: string },
  userAgent?: string
): Promise<void> {
  try {
    const resource = getResourceFromEndpoint(endpoint)
    const success = statusCode < 400
    const visitorType = classifyVisitor(userAgent || "")
    const statusGroup = getStatusGroup(statusCode)
    const now = Date.now()

    // Get current metrics
    const metricsData = (await kv.get("metrics", "json")) || createEmptyMetrics()
    const metrics = metricsData as KVMetrics

    // Ensure resource exists
    if (!metrics.resources[resource]) {
      metrics.resources[resource] = {
        ok: 0,
        error: 0,
        times: { "last-hit": 0, "last-error": 0, "last-ok": 0 },
        visitor: { human: 0, bot: 0, unknown: 0 },
        group: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
        status: {}
      }
    }

    // Update top-level metrics
    if (success) {
      metrics.ok++
      metrics.times["last-ok"] = now
    } else {
      metrics.error++
      metrics.times["last-error"] = now
    }
    metrics.times["last-hit"] = now
    metrics.visitor[visitorType]++
    metrics.group[statusGroup]++
    metrics.status[statusCode.toString()] = (metrics.status[statusCode.toString()] || 0) + 1

    // Update resource-specific metrics
    const resourceMetrics = metrics.resources[resource]
    if (success) {
      resourceMetrics.ok++
      resourceMetrics.times["last-ok"] = now
    } else {
      resourceMetrics.error++
      resourceMetrics.times["last-error"] = now
    }
    resourceMetrics.times["last-hit"] = now
    resourceMetrics.visitor[visitorType]++
    resourceMetrics.group[statusGroup]++
    resourceMetrics.status[statusCode.toString()] = (resourceMetrics.status[statusCode.toString()] || 0) + 1

    // Save updated metrics
    await kv.put("metrics", JSON.stringify(metrics))
  } catch (error) {
    console.error("Failed to update API request metrics:", error)
  }
}

/**
 * Update metrics for redirect events in the new hierarchical schema
 */
export async function updateRedirectMetrics(
  kv: KVNamespace,
  slug: string,
  statusCode: number,
  userAgent?: string
): Promise<void> {
  try {
    const success = statusCode < 400
    const visitorType = classifyVisitor(userAgent || "")
    const statusGroup = getStatusGroup(statusCode)
    const now = Date.now()

    // Get current metrics
    const metricsData = (await kv.get("metrics", "json")) || createEmptyMetrics()
    const metrics = metricsData as KVMetrics

    // Ensure redirect slug exists
    if (!metrics.redirect[slug]) {
      metrics.redirect[slug] = {
        ok: 0,
        error: 0,
        times: { "last-hit": 0, "last-error": 0, "last-ok": 0 },
        visitor: { human: 0, bot: 0, unknown: 0 },
        group: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
        status: {}
      }
    }

    // Update top-level metrics for /go resource
    const goResource = "go"
    if (!metrics.resources[goResource]) {
      metrics.resources[goResource] = {
        ok: 0,
        error: 0,
        times: { "last-hit": 0, "last-error": 0, "last-ok": 0 },
        visitor: { human: 0, bot: 0, unknown: 0 },
        group: { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
        status: {}
      }
    }

    // Update metrics at all levels
    const targets = [metrics, metrics.resources[goResource], metrics.redirect[slug]]

    for (const target of targets) {
      if (success) {
        target.ok++
        target.times["last-ok"] = now
      } else {
        target.error++
        target.times["last-error"] = now
      }
      target.times["last-hit"] = now
      target.visitor[visitorType]++
      target.group[statusGroup]++
      target.status[statusCode.toString()] = (target.status[statusCode.toString()] || 0) + 1
    }

    // Save updated metrics
    await kv.put("metrics", JSON.stringify(metrics))
  } catch (error) {
    console.error("Failed to update redirect metrics:", error)
  }
}

/**
 * Get status code group (1xx, 2xx, etc.)
 */
function getStatusGroup(statusCode: number): "1xx" | "2xx" | "3xx" | "4xx" | "5xx" {
  if (statusCode >= 100 && statusCode < 200) return "1xx"
  if (statusCode >= 200 && statusCode < 300) return "2xx"
  if (statusCode >= 300 && statusCode < 400) return "3xx"
  if (statusCode >= 400 && statusCode < 500) return "4xx"
  return "5xx"
}

/**
 * Legacy helper functions for backward compatibility - now call new functions
 */
export function createAPIRequestKVCounters(
  _endpoint: string,
  _method: string,
  _statusCode: number,
  _cfInfo: { country: string; datacenter: string },
  _userAgent?: string,
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  // Return empty array - actual work done by updateAPIRequestMetrics
  return [...(extraCounters || [])]
}

export function createAuthKVCounters(
  _endpoint: string,
  _success: boolean,
  _tokenSubject: string | undefined,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  // Return empty array - auth metrics now tracked via updateAPIRequestMetrics
  return [...(extraCounters || [])]
}

export function createRedirectKVCounters(
  _slug: string,
  _destinationUrl: string,
  _clickCount: number,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  // Return empty array - actual work done by updateRedirectMetrics
  return [...(extraCounters || [])]
}

export function createAIKVCounters(
  _operation: string,
  _success: boolean,
  _processingTimeMs: number,
  _imageSizeBytes: number | undefined,
  _userId: string | undefined,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  // Return empty array - AI metrics now tracked via updateAPIRequestMetrics
  return [...(extraCounters || [])]
}

/**
 * Helper to detect bot user agents
 */
export function isBot(userAgent: string): boolean {
  return classifyVisitor(userAgent) === "bot"
}

export type { KVCounterEntry, KVMetrics }
