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
 * KV metrics structure for fast dashboard queries
 */
interface KVMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  redirectClicks: number
  redirectsBySlug: Record<string, number>
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
 * Get KV metrics for fast dashboard queries
 */
export async function getKVMetrics(kv: KVNamespace): Promise<KVMetrics> {
  // Get all metrics keys in parallel
  const metricsKeys = await kv.list({ prefix: "metrics:" })

  // Calculate totals by aggregating all resource metrics
  let totalRequests = 0
  let successfulRequests = 0
  let failedRequests = 0
  let redirectClicks = 0

  // Get redirect metrics by slug
  const redirectsBySlug: Record<string, number> = {}

  // Process all metrics keys in parallel
  const metricValues = await Promise.all(
    metricsKeys.keys.map(async (key) => {
      const value = await kv.get(key.name)
      return { key: key.name, count: Number.parseInt(value || "0", 10) || 0 }
    })
  )

  // Aggregate metrics from all resources
  for (const { key, count } of metricValues) {
    if (key.includes(":hit:total")) {
      totalRequests += count
    } else if (key.includes(":hit:ok")) {
      successfulRequests += count
    } else if (key.includes(":hit:error")) {
      failedRequests += count
    } else if (key.startsWith("metrics:redirect:")) {
      const slug = key.replace("metrics:redirect:", "")
      redirectsBySlug[slug] = count
      redirectClicks += count
    }
  }

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    redirectClicks,
    redirectsBySlug
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
 * Helper to create standard KV counters for API requests
 */
export function createAPIRequestKVCounters(
  endpoint: string,
  _method: string,
  statusCode: number,
  _cfInfo: { country: string; datacenter: string },
  userAgent?: string,
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const resource = getResourceFromEndpoint(endpoint)
  const success = statusCode < 400
  const visitorType = classifyVisitor(userAgent || "")

  const baseCounters: KVCounterEntry[] = [
    // Hit tracking
    { key: `metrics:${resource}:hit:total` },
    { key: success ? `metrics:${resource}:hit:ok` : `metrics:${resource}:hit:error` },

    // Visitor tracking
    { key: `metrics:${resource}:visitor:${visitorType}` }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create standard KV counters for auth events
 */
export function createAuthKVCounters(
  endpoint: string,
  success: boolean,
  _tokenSubject: string | undefined,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const resource = getResourceFromEndpoint(endpoint)

  const baseCounters: KVCounterEntry[] = [
    // Auth tracking
    { key: success ? `metrics:${resource}:auth:succeeded` : `metrics:${resource}:auth:failed` }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create KV counters for redirect events
 */
export function createRedirectKVCounters(
  slug: string,
  _destinationUrl: string,
  clickCount: number,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const baseCounters: KVCounterEntry[] = [
    // Redirect click tracking
    { key: `metrics:redirect:${slug}`, increment: clickCount }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create KV counters for AI events
 */
export function createAIKVCounters(
  _operation: string,
  success: boolean,
  _processingTimeMs: number,
  _imageSizeBytes: number | undefined,
  _userId: string | undefined,
  _cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const baseCounters: KVCounterEntry[] = [
    // AI operation tracking
    { key: success ? "metrics:ai:hit:ok" : "metrics:ai:hit:error" },
    { key: "metrics:ai:hit:total" }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to detect bot user agents
 */
export function isBot(userAgent: string): boolean {
  return classifyVisitor(userAgent) === "bot"
}

export type { KVCounterEntry, KVMetrics }
