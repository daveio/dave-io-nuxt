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
 * Write metrics to KV storage using simple key-value pairs
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
 * Get a simple KV metric value
 */
export async function getKVMetric(kv: KVNamespace, key: string): Promise<number> {
  try {
    const value = await kv.get(key)
    return value ? Number.parseInt(value) : 0
  } catch (error) {
    // trunk-ignore(semgrep/javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring): Safe string template
    console.error(`Failed to get KV metric ${key}:`, error)
    return 0
  }
}

/**
 * Set a simple KV metric value
 */
export async function setKVMetric(kv: KVNamespace, key: string, value: number): Promise<void> {
  try {
    await kv.put(key, String(value))
  } catch (error) {
    // trunk-ignore(semgrep/javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring): Safe string template
    console.error(`Failed to set KV metric ${key}:`, error)
  }
}

/**
 * Increment a simple KV metric value
 */
export async function incrementKVMetric(kv: KVNamespace, key: string, increment = 1): Promise<void> {
  try {
    const currentValue = await getKVMetric(kv, key)
    await setKVMetric(kv, key, currentValue + increment)
  } catch (error) {
    // trunk-ignore(semgrep/javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring): Safe string template
    console.error(`Failed to increment KV metric ${key}:`, error)
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
 * Update metrics for API requests using simple KV keys
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

    // Build list of KV operations to perform
    const operations: Promise<void>[] = []

    // Update top-level metrics
    if (success) {
      operations.push(incrementKVMetric(kv, "metrics:ok"))
      operations.push(setKVMetric(kv, "metrics:times:last-ok", now))
    } else {
      operations.push(incrementKVMetric(kv, "metrics:error"))
      operations.push(setKVMetric(kv, "metrics:times:last-error", now))
    }

    operations.push(setKVMetric(kv, "metrics:times:last-hit", now))
    operations.push(incrementKVMetric(kv, `metrics:visitor:${visitorType}`))
    operations.push(incrementKVMetric(kv, `metrics:group:${statusGroup}`))
    operations.push(incrementKVMetric(kv, `metrics:status:${statusCode}`))

    // Update resource-specific metrics
    if (success) {
      operations.push(incrementKVMetric(kv, `metrics:resources:${resource}:ok`))
      operations.push(setKVMetric(kv, `metrics:resources:${resource}:times:last-ok`, now))
    } else {
      operations.push(incrementKVMetric(kv, `metrics:resources:${resource}:error`))
      operations.push(setKVMetric(kv, `metrics:resources:${resource}:times:last-error`, now))
    }

    operations.push(setKVMetric(kv, `metrics:resources:${resource}:times:last-hit`, now))
    operations.push(incrementKVMetric(kv, `metrics:resources:${resource}:visitor:${visitorType}`))
    operations.push(incrementKVMetric(kv, `metrics:resources:${resource}:group:${statusGroup}`))
    operations.push(incrementKVMetric(kv, `metrics:resources:${resource}:status:${statusCode}`))

    // Execute all operations in parallel
    await Promise.all(operations)
  } catch (error) {
    console.error("Failed to update API request metrics:", error)
  }
}

/**
 * Fire-and-forget version of updateAPIRequestMetrics
 * This function should be used when metrics updates should not block the response
 */
export function updateAPIRequestMetricsAsync(
  kv: KVNamespace,
  endpoint: string,
  method: string,
  statusCode: number,
  cfInfo: { country: string; datacenter: string },
  userAgent?: string
): void {
  // Fire and forget
  void updateAPIRequestMetrics(kv, endpoint, method, statusCode, cfInfo, userAgent)
}

/**
 * Update metrics for redirect events using simple KV keys
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

    // Build list of KV operations to perform
    const operations: Promise<void>[] = []

    // Update top-level metrics
    if (success) {
      operations.push(incrementKVMetric(kv, "metrics:ok"))
      operations.push(setKVMetric(kv, "metrics:times:last-ok", now))
    } else {
      operations.push(incrementKVMetric(kv, "metrics:error"))
      operations.push(setKVMetric(kv, "metrics:times:last-error", now))
    }

    operations.push(setKVMetric(kv, "metrics:times:last-hit", now))
    operations.push(incrementKVMetric(kv, `metrics:visitor:${visitorType}`))
    operations.push(incrementKVMetric(kv, `metrics:group:${statusGroup}`))
    operations.push(incrementKVMetric(kv, `metrics:status:${statusCode}`))

    // Update "go" resource metrics
    const goResource = "go"
    if (success) {
      operations.push(incrementKVMetric(kv, `metrics:resources:${goResource}:ok`))
      operations.push(setKVMetric(kv, `metrics:resources:${goResource}:times:last-ok`, now))
    } else {
      operations.push(incrementKVMetric(kv, `metrics:resources:${goResource}:error`))
      operations.push(setKVMetric(kv, `metrics:resources:${goResource}:times:last-error`, now))
    }

    operations.push(setKVMetric(kv, `metrics:resources:${goResource}:times:last-hit`, now))
    operations.push(incrementKVMetric(kv, `metrics:resources:${goResource}:visitor:${visitorType}`))
    operations.push(incrementKVMetric(kv, `metrics:resources:${goResource}:group:${statusGroup}`))
    operations.push(incrementKVMetric(kv, `metrics:resources:${goResource}:status:${statusCode}`))

    // Update redirect-specific metrics
    if (success) {
      operations.push(incrementKVMetric(kv, `metrics:redirect:${slug}:ok`))
      operations.push(setKVMetric(kv, `metrics:redirect:${slug}:times:last-ok`, now))
    } else {
      operations.push(incrementKVMetric(kv, `metrics:redirect:${slug}:error`))
      operations.push(setKVMetric(kv, `metrics:redirect:${slug}:times:last-error`, now))
    }

    operations.push(setKVMetric(kv, `metrics:redirect:${slug}:times:last-hit`, now))
    operations.push(incrementKVMetric(kv, `metrics:redirect:${slug}:visitor:${visitorType}`))
    operations.push(incrementKVMetric(kv, `metrics:redirect:${slug}:group:${statusGroup}`))
    operations.push(incrementKVMetric(kv, `metrics:redirect:${slug}:status:${statusCode}`))

    // Execute all operations in parallel
    await Promise.all(operations)
  } catch (error) {
    console.error("Failed to update redirect metrics:", error)
  }
}

/**
 * Fire-and-forget version of updateRedirectMetrics
 * This function should be used when metrics updates should not block the response
 */
export function updateRedirectMetricsAsync(
  kv: KVNamespace,
  slug: string,
  statusCode: number,
  userAgent?: string
): void {
  // Fire and forget
  void updateRedirectMetrics(kv, slug, statusCode, userAgent)
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
 * Helper function to get multiple metrics at once
 */
export async function getKVMetrics(kv: KVNamespace, keys: string[]): Promise<Record<string, number>> {
  try {
    const values = await Promise.all(keys.map((key) => getKVMetric(kv, key)))
    const result: Record<string, number> = {}
    keys.forEach((key, index) => {
      result[key] = values[index] ?? 0
    })
    return result
  } catch (error) {
    console.error("Failed to get multiple KV metrics:", error)
    return {}
  }
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

export type { KVCounterEntry }
