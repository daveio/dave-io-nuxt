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
  rateLimitedRequests: number
  redirectClicks: number
  last24h: {
    total: number
    successful: number
    failed: number
    redirects: number
  }
  routeros: {
    cacheHits: number
    cacheMisses: number
  }
  redirectsBySlug: Record<string, number>
}

/**
 * Normalize key to kebab-case with colons and ensure metrics: prefix
 */
function normalizeKVKey(key: string): string {
  // Ensure it starts with metrics:
  let normalizedKey = key
  if (!normalizedKey.startsWith("metrics:")) {
    normalizedKey = `metrics:${normalizedKey}`
  }

  // Convert to kebab-case and normalize separators
  return normalizedKey
    .toLowerCase()
    .replace(/[^a-z0-9:]/g, "-") // Replace non-alphanumeric (except colons) with dashes
    .replace(/-+/g, "-") // Remove multiple consecutive dashes
    .replace(/-:/g, ":") // Clean up dash-colon combinations
    .replace(/:-/g, ":") // Clean up colon-dash combinations
    .replace(/^-/, "") // Remove leading dash
    .replace(/-$/, "") // Remove trailing dash
}

/**
 * Write metrics to KV storage only
 */
export async function writeKVMetrics(kvNamespace: KVNamespace, kvCounters: KVCounterEntry[]): Promise<void> {
  try {
    await Promise.all(
      kvCounters.map(async (counter) => {
        try {
          const normalizedKey = normalizeKVKey(counter.key)

          if (counter.value !== undefined) {
            // Set specific value
            await kvNamespace.put(normalizedKey, String(counter.value))
          } else {
            // Increment by specified amount (default 1)
            const currentValue = await kvNamespace.get(normalizedKey).then((v) => Number.parseInt(v || "0"))
            const increment = counter.increment || 1
            await kvNamespace.put(normalizedKey, String(currentValue + increment))
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
  // Get all metric keys in parallel
  const metricKeys = [
    "metrics:requests:total",
    "metrics:requests:successful",
    "metrics:requests:failed",
    "metrics:requests:rate_limited",
    "metrics:redirect:total:clicks",
    "metrics:24h:total",
    "metrics:24h:successful",
    "metrics:24h:failed",
    "metrics:24h:redirects",
    "metrics:routeros:cache-hits",
    "metrics:routeros:cache-misses"
  ]

  const results = await Promise.all(
    metricKeys.map(async (key) => {
      const value = await kv.get(key)
      return Number.parseInt(value || "0", 10) || 0
    })
  )

  // Get redirect metrics by slug
  const redirectKeys = await kv.list({ prefix: "metrics:redirect:" })
  const redirectsBySlug: Record<string, number> = {}

  for (const key of redirectKeys.keys) {
    if (key.name !== "metrics:redirect:total:clicks") {
      const slug = key.name.replace("metrics:redirect:", "").replace(":clicks", "")
      const clicks = await kv.get(key.name)
      redirectsBySlug[slug] = Number.parseInt(clicks || "0", 10) || 0
    }
  }

  return {
    totalRequests: results[0] ?? 0,
    successfulRequests: results[1] ?? 0,
    failedRequests: results[2] ?? 0,
    rateLimitedRequests: results[3] ?? 0,
    redirectClicks: results[4] ?? 0,
    last24h: {
      total: results[5] ?? 0,
      successful: results[6] ?? 0,
      failed: results[7] ?? 0,
      redirects: results[8] ?? 0
    },
    routeros: {
      cacheHits: results[9] ?? 0,
      cacheMisses: results[10] ?? 0
    },
    redirectsBySlug
  }
}

/**
 * Helper to create standard KV counters for API requests
 */
export function createAPIRequestKVCounters(
  endpoint: string,
  method: string,
  statusCode: number,
  cfInfo: { country: string; datacenter: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const success = statusCode < 400
  const endpointSlug = endpoint.replace(/^\/api\//, "").replace(/[^a-z0-9]/g, "-")

  const baseCounters: KVCounterEntry[] = [
    { key: "requests:total" },
    { key: success ? "requests:successful" : "requests:failed" },
    { key: `requests:by-status:${statusCode}` },
    { key: `requests:by-method:${method.toLowerCase()}` },
    { key: `requests:by-endpoint:${endpointSlug}:total` },
    {
      key: success ? `requests:by-endpoint:${endpointSlug}:successful` : `requests:by-endpoint:${endpointSlug}:failed`
    },
    { key: `requests:by-country:${cfInfo.country.toLowerCase()}` },
    { key: `requests:by-datacenter:${cfInfo.datacenter.toLowerCase()}` }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create standard KV counters for auth events
 */
export function createAuthKVCounters(
  endpoint: string,
  success: boolean,
  tokenSubject: string | undefined,
  cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const endpointSlug = endpoint.replace(/[^a-z0-9]/g, "-")

  const baseCounters: KVCounterEntry[] = [
    { key: "auth:total" },
    { key: success ? "auth:successful" : "auth:failed" },
    { key: `auth:by-endpoint:${endpointSlug}:total` },
    { key: success ? `auth:by-endpoint:${endpointSlug}:successful` : `auth:by-endpoint:${endpointSlug}:failed` },
    { key: `auth:by-country:${cfInfo.country.toLowerCase()}` }
  ]

  // Add token-specific counters if we have a token subject
  if (tokenSubject) {
    const tokenSlug = tokenSubject.replace(/[^a-z0-9]/g, "-")
    baseCounters.push(
      { key: `auth:by-token:${tokenSlug}:total` },
      { key: success ? `auth:by-token:${tokenSlug}:successful` : `auth:by-token:${tokenSlug}:failed` }
    )
  }

  // Failed auth by country for security monitoring
  if (!success) {
    baseCounters.push({ key: `auth:failed:by-country:${cfInfo.country.toLowerCase()}` })
  }

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create KV counters for redirect events
 */
export function createRedirectKVCounters(
  slug: string,
  destinationUrl: string,
  clickCount: number,
  cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const domainMatch = destinationUrl.match(/^https?:\/\/([^\/]+)/)
  const domain = domainMatch?.[1]?.replace(/[^a-z0-9]/g, "-") || "unknown"

  const baseCounters: KVCounterEntry[] = [
    { key: `redirect:by-domain:${domain}`, increment: clickCount },
    { key: `redirect:by-country:${cfInfo.country.toLowerCase()}`, increment: clickCount }
  ]

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create KV counters for AI events
 */
export function createAIKVCounters(
  operation: string,
  success: boolean,
  processingTimeMs: number,
  imageSizeBytes: number | undefined,
  userId: string | undefined,
  cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const baseCounters: KVCounterEntry[] = [
    { key: "ai:total" },
    { key: success ? "ai:successful" : "ai:failed" },
    { key: `ai:by-operation:${operation}:total` },
    { key: success ? `ai:by-operation:${operation}:successful` : `ai:by-operation:${operation}:failed` },
    { key: `ai:by-country:${cfInfo.country.toLowerCase()}` }
  ]

  // Add processing time buckets for performance monitoring
  const timeBucket = processingTimeMs < 1000 ? "fast" : processingTimeMs < 5000 ? "medium" : "slow"
  baseCounters.push({ key: `ai:by-speed:${timeBucket}` })

  // Add image size buckets if available
  if (imageSizeBytes) {
    const sizeBucket = imageSizeBytes < 100000 ? "small" : imageSizeBytes < 1000000 ? "medium" : "large"
    baseCounters.push({ key: `ai:by-image-size:${sizeBucket}` })
  }

  // Add user-specific counters if available
  if (userId) {
    const userSlug = userId.replace(/[^a-z0-9]/g, "-")
    baseCounters.push(
      { key: `ai:by-user:${userSlug}:total` },
      { key: success ? `ai:by-user:${userSlug}:successful` : `ai:by-user:${userSlug}:failed` }
    )
  }

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to create KV counters for rate limit events
 */
export function createRateLimitKVCounters(
  action: string,
  endpoint: string,
  tokenSubject: string | undefined,
  _requestsInWindow: number,
  cfInfo: { country: string },
  extraCounters?: KVCounterEntry[]
): KVCounterEntry[] {
  const endpointSlug = endpoint.replace(/[^a-z0-9]/g, "-")

  const baseCounters: KVCounterEntry[] = [
    { key: "rate-limits:total" },
    { key: `rate-limits:by-action:${action}` },
    { key: `rate-limits:by-endpoint:${endpointSlug}` },
    { key: `rate-limits:by-country:${cfInfo.country.toLowerCase()}` }
  ]

  // Add token-specific rate limit tracking
  if (tokenSubject) {
    const tokenSlug = tokenSubject.replace(/[^a-z0-9]/g, "-")
    baseCounters.push(
      { key: `rate-limits:by-token:${tokenSlug}:total` },
      { key: `rate-limits:by-token:${tokenSlug}:${action}` }
    )
  }

  return [...baseCounters, ...(extraCounters || [])]
}

/**
 * Helper to detect bot user agents
 */
export function isBot(userAgent: string): boolean {
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /headless/i,
    /phantom/i,
    /puppeteer/i,
    /playwright/i,
    /selenium/i
  ]

  return botPatterns.some((pattern) => pattern.test(userAgent))
}

export type { KVCounterEntry, KVMetrics }
