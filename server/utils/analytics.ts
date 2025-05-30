import Cloudflare from "cloudflare"
import { parseISO, subDays, subHours } from "date-fns"
import type { H3Event } from "h3"
import { groupBy, mean, sortBy, sum, take } from "lodash-es"
import type {
  AIEvent,
  APIRequestEvent,
  AnalyticsEngineResult,
  AnalyticsEvent,
  AnalyticsMetrics,
  AnalyticsQueryParams,
  AnalyticsTimeRange,
  AuthEvent,
  KVMetrics,
  PingEvent,
  RateLimitEvent,
  RedirectEvent,
  RouterOSEvent
} from "~/types/analytics"
import { getCloudflareEnv } from "./cloudflare"
import { getEnvironmentVariable } from "./environment"

/**
 * Check if dangerous global API key usage is enabled
 */
function isDangerousGlobalKeyEnabled(): boolean {
  const useGlobalKey = process.env.API_DEV_USE_DANGEROUS_GLOBAL_KEY
  return useGlobalKey === "1" || useGlobalKey === "true"
}

/**
 * Create Cloudflare client with appropriate authentication method
 * Supports both API Token (preferred) and API Key (legacy/dangerous) authentication
 */
function createCloudflareClient(): Cloudflare {
  if (isDangerousGlobalKeyEnabled()) {
    // Use legacy API Key authentication (requires email + API key)
    const apiKey = getEnvironmentVariable("CLOUDFLARE_API_KEY", true)
    const email = getEnvironmentVariable("CLOUDFLARE_EMAIL", true)

    if (!apiKey || !email) {
      throw new Error(
        "CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL are required when using dangerous global key authentication"
      )
    }

    return new Cloudflare({
      apiKey: apiKey,
      apiEmail: email
    })
  } else {
    // Use preferred API Token authentication
    const apiToken = getEnvironmentVariable("CLOUDFLARE_API_TOKEN", true)

    if (!apiToken) {
      throw new Error("CLOUDFLARE_API_TOKEN is required for Analytics Engine queries")
    }

    return new Cloudflare({
      apiToken: apiToken
    })
  }
}

/**
 * Calculate time range boundaries
 */
export function getTimeRangeBoundaries(
  range: AnalyticsTimeRange,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date } {
  const now = new Date()

  switch (range) {
    case "1h":
      return { start: subHours(now, 1), end: now }
    case "24h":
      return { start: subHours(now, 24), end: now }
    case "7d":
      return { start: subDays(now, 7), end: now }
    case "30d":
      return { start: subDays(now, 30), end: now }
    case "custom":
      if (!customStart || !customEnd) {
        throw new Error("Custom time range requires start and end dates")
      }
      return {
        start: parseISO(customStart),
        end: parseISO(customEnd)
      }
    default:
      return { start: subHours(now, 24), end: now }
  }
}

/**
 * Build Analytics Engine SQL query for time-series data
 */
export function buildAnalyticsQuery(params: AnalyticsQueryParams): string {
  const { start, end } = getTimeRangeBoundaries(params.timeRange, params.customStart, params.customEnd)

  const startDateTime = start.toISOString().replace("T", " ").substring(0, 19)
  const endDateTime = end.toISOString().replace("T", " ").substring(0, 19)
  let whereClause = `"timestamp" >= toDateTime('${startDateTime}') AND "timestamp" <= toDateTime('${endDateTime}')`

  if (params.eventTypes && params.eventTypes.length > 0) {
    const types = params.eventTypes.map((t) => `'${t}'`).join(", ")
    whereClause += ` AND index1 IN (${types})`
  }

  if (params.country) {
    whereClause += ` AND blob6 = '${params.country}'`
  }

  if (params.tokenSubject) {
    whereClause += ` AND blob2 = '${params.tokenSubject}'`
  }

  const groupByClause = params.groupBy?.length ? `GROUP BY ${params.groupBy.join(", ")}` : ""

  const orderClause = "ORDER BY timestamp DESC"
  const limitClause = params.limit ? `LIMIT ${params.limit}` : "LIMIT 1000"
  const offsetClause = params.offset ? `OFFSET ${params.offset}` : ""

  return `
    SELECT *
    FROM analytics_dataset
    WHERE ${whereClause}
    ${groupByClause}
    ${orderClause}
    ${limitClause}
    ${offsetClause}
  `.trim()
}

/**
 * Parse Analytics Engine results into structured events
 */
export function parseAnalyticsResults(results: AnalyticsEngineResult[]): AnalyticsEvent[] {
  return results.map((result) => {
    const baseEvent = {
      timestamp: result.timestamp || new Date().toISOString(),
      cloudflare: {
        ray: result.blob7 || "unknown",
        country: result.blob6 || "unknown",
        ip: result.blob5 || "unknown",
        datacenter: result.blob7?.substring(0, 3) || "unknown",
        userAgent: result.blob4 || "unknown",
        requestUrl: "/"
      }
    }

    // Parse based on event type (index1)
    switch (result.index1) {
      case "redirect":
        return {
          ...baseEvent,
          type: "redirect",
          data: {
            slug: result.blob2 || "",
            destinationUrl: result.blob3 || "",
            clickCount: result.double1 || 1
          }
        } as RedirectEvent

      case "auth":
        return {
          ...baseEvent,
          type: "auth",
          data: {
            success: result.blob2 === "success",
            tokenSubject: result.blob3 || "unknown",
            endpoint: result.blob4 || undefined
          }
        } as AuthEvent

      case "ai":
        return {
          ...baseEvent,
          type: "ai",
          data: {
            operation: result.blob2 as "alt-text",
            method: (result.blob3 || "GET") as "GET" | "POST",
            imageSource: result.blob4 || "",
            processingTimeMs: result.double1 || 0,
            imageSizeBytes: result.double2 || undefined,
            generatedText: result.blob8 || undefined,
            userId: result.blob9 || undefined,
            success: result.blob10 === "success",
            errorType: result.blob10 === "success" ? undefined : result.blob10
          }
        } as AIEvent

      case "routeros":
        return {
          ...baseEvent,
          type: "routeros",
          data: {
            operation: result.blob2 as "putio" | "cache" | "reset",
            cacheStatus: result.blob3 || undefined,
            ipv4Count: result.double1 || undefined,
            ipv6Count: result.double2 || undefined
          }
        } as RouterOSEvent

      case "ping":
        return {
          ...baseEvent,
          type: "ping",
          data: {
            pingCount: result.double1 || 1
          }
        } as PingEvent

      case "rate_limit":
        return {
          ...baseEvent,
          type: "rate_limit",
          data: {
            action: result.blob2 as "throttled" | "blocked" | "warning",
            endpoint: result.blob3 || "/",
            tokenSubject: result.blob8 || undefined,
            requestsInWindow: result.double1 || 0,
            windowSizeMs: result.double2 || 60000,
            maxRequests: result.double3 || 100,
            remainingRequests: result.double4 || 0,
            resetTime: result.blob9 || new Date().toISOString()
          }
        } as RateLimitEvent

      default:
        return {
          ...baseEvent,
          type: "api_request",
          data: {
            endpoint: result.blob2 || "/",
            method: result.blob3 || "GET",
            statusCode: result.double1 || 200,
            responseTimeMs: result.double2 || 0,
            tokenSubject: result.blob8 || undefined
          }
        } as APIRequestEvent
    }
  })
}

/**
 * Calculate rate limiting metrics from events
 */
function calculateRateLimitMetrics(eventsByType: Record<string, AnalyticsEvent[]>) {
  const rateLimitEvents = (eventsByType.rate_limit as RateLimitEvent[]) || []

  const throttledRequests = rateLimitEvents.filter(
    (e) => e.data.action === "throttled" || e.data.action === "blocked"
  ).length

  const throttledBySubject = groupBy(
    rateLimitEvents.filter((e) => e.data.action === "throttled" || e.data.action === "blocked"),
    (e) => e.data.tokenSubject || "anonymous"
  )

  const throttledByToken = take(
    sortBy(
      Object.entries(throttledBySubject).map(([subject, events]) => ({
        tokenSubject: subject,
        throttledCount: events.length
      })),
      (e) => -e.throttledCount
    ),
    10
  )

  return {
    throttledRequests,
    throttledByToken
  }
}

/**
 * Aggregate analytics events into metrics
 */
export function aggregateAnalyticsMetrics(
  events: AnalyticsEvent[],
  timeRange: AnalyticsTimeRange,
  customStart?: string,
  customEnd?: string
): AnalyticsMetrics {
  const { start, end } = getTimeRangeBoundaries(timeRange, customStart, customEnd)

  // Group events by type
  const eventsByType = groupBy(events, "type")

  // Calculate overview metrics
  const totalRequests = events.length
  const successfulRequests = events.filter((e) =>
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic event data structure
    e.type === "api_request" ? (e.data as any).statusCode < 400 : true
  ).length
  const failedRequests = totalRequests - successfulRequests

  const apiEvents = eventsByType.api_request || []
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic event data structure
  const averageResponseTime = apiEvents.length > 0 ? mean(apiEvents.map((e) => (e.data as any).responseTimeMs || 0)) : 0

  const uniqueVisitors = new Set(events.map((e) => e.cloudflare.ip)).size

  // Redirect metrics
  const redirectEvents = (eventsByType.redirect as RedirectEvent[]) || []
  const totalClicks = sum(redirectEvents.map((e) => e.data.clickCount))
  const redirectsBySlug = groupBy(redirectEvents, (e) => e.data.slug)
  const topSlugs = take(
    sortBy(
      Object.entries(redirectsBySlug).map(([slug, events]) => ({
        slug,
        clicks: sum(events.map((e) => e.data.clickCount)),
        destinations: [...new Set(events.map((e) => e.data.destinationUrl))]
      })),
      (e) => -e.clicks
    ),
    10
  )

  // AI metrics
  const aiEvents = (eventsByType.ai as AIEvent[]) || []
  const totalOperations = aiEvents.length
  const successfulAiOperations = aiEvents.filter((e) => e.data.success).length
  const failedAiOperations = totalOperations - successfulAiOperations
  const aiSuccessRate = totalOperations > 0 ? (successfulAiOperations / totalOperations) * 100 : 0
  const averageProcessingTime = aiEvents.length > 0 ? mean(aiEvents.map((e) => e.data.processingTimeMs)) : 0
  const imagesWithSize = aiEvents.filter((e) => e.data.imageSizeBytes)
  const totalImagesSized = imagesWithSize.length
  const averageImageSize = imagesWithSize.length > 0 ? mean(imagesWithSize.map((e) => e.data.imageSizeBytes ?? 0)) : 0

  // Auth metrics
  const authEvents = (eventsByType.auth as AuthEvent[]) || []
  const totalAttempts = authEvents.length
  const successfulAuth = authEvents.filter((e) => e.data.success).length
  const successRate = totalAttempts > 0 ? (successfulAuth / totalAttempts) * 100 : 0
  const failedAttempts = totalAttempts - successfulAuth

  const authBySubject = groupBy(authEvents, (e) => e.data.tokenSubject)
  const topTokenSubjects = take(
    sortBy(
      Object.entries(authBySubject).map(([subject, events]) => ({
        subject,
        requests: events.length
      })),
      (e) => -e.requests
    ),
    10
  )

  // RouterOS metrics (these should come from KV for accuracy)
  const routerosEvents = (eventsByType.routeros as RouterOSEvent[]) || []

  // Geographic distribution
  const byCountry = groupBy(events, (e) => e.cloudflare.country)
  const geographic = take(
    sortBy(
      Object.entries(byCountry).map(([country, events]) => ({
        country,
        requests: events.length,
        percentage: (events.length / totalRequests) * 100
      })),
      (e) => -e.requests
    ),
    20
  )

  // User agent analysis
  const byUserAgent = groupBy(events, (e) => e.cloudflare.userAgent)
  const userAgents = take(
    sortBy(
      Object.entries(byUserAgent).map(([agent, events]) => ({
        agent: agent.length > 100 ? `${agent.substring(0, 100)}...` : agent,
        requests: events.length,
        isBot: /bot|crawler|spider|scraper/i.test(agent)
      })),
      (e) => -e.requests
    ),
    15
  )

  return {
    timeframe: {
      start: start.toISOString(),
      end: end.toISOString(),
      range: timeRange
    },
    timeSeries: {
      requests: [],
      redirects: [],
      auth: [],
      ai: [],
      responseTime: [],
      errors: [],
      rateLimits: [],
      uniqueVisitors: []
    },
    overview: {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      uniqueVisitors
    },
    redirects: {
      totalClicks,
      topSlugs
    },
    ai: {
      totalOperations,
      successfulOperations: successfulAiOperations,
      failedOperations: failedAiOperations,
      successRate: aiSuccessRate,
      averageProcessingTime,
      totalImagesSized,
      averageImageSize
    },
    authentication: {
      totalAttempts,
      successRate,
      failedAttempts,
      topTokenSubjects
    },
    routeros: {
      cacheHits: 0, // Will be populated from KV
      cacheMisses: 0, // Will be populated from KV
      putioGenerations: routerosEvents.filter((e) => e.data.operation === "putio").length
    },
    geographic,
    userAgents,
    rateLimiting: {
      throttledRequests: calculateRateLimitMetrics(eventsByType).throttledRequests,
      throttledByToken: calculateRateLimitMetrics(eventsByType).throttledByToken
    }
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
 * Analytics Engine SQL API response structure
 */
interface AnalyticsEngineSQLResponse {
  meta: Array<{ name: string; type: string }>
  data: Array<Record<string, unknown>>
  rows: number
  rows_before_limit_at_least: number
}

/**
 * Query Analytics Engine using Cloudflare SQL API
 *
 * This implementation queries our custom Analytics Engine dataset "NEXT_DAVE_IO_ANALYTICS"
 * using the SQL API. The dataset contains structured events with:
 * - blob1-blob10: String fields (event type, userAgent, IP, country, etc.)
 * - double1-double20: Numeric fields (processing times, counts, status codes, etc.)
 * - index1-index5: Indexed fields for fast filtering (event type, identifiers)
 * - timestamp: Event timestamp
 * - _sample_interval: Sampling weight for aggregations
 */
export async function queryAnalyticsEngine(
  event: H3Event,
  params: AnalyticsQueryParams
): Promise<AnalyticsEngineResult[]> {
  // biome-ignore lint/correctness/noUnusedVariables: env would be used for Analytics Engine binding check but not needed for SQL API calls
  const env = getCloudflareEnv(event)

  // Check for required environment variables
  const accountId = getEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID", true)

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for Analytics Engine queries")
  }

  try {
    // Create Cloudflare client with appropriate authentication method
    const client = createCloudflareClient()

    // Build SQL query based on parameters
    const sqlQuery = buildAnalyticsEngineQuery(params)

    // Make direct HTTP request to Analytics Engine SQL API
    // The API expects the query as raw text in the request body
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`

    const authHeaders: Record<string, string> = {
      "Content-Type": "text/plain"
    }

    if (isDangerousGlobalKeyEnabled()) {
      const apiKey = getEnvironmentVariable("CLOUDFLARE_API_KEY", true)
      const email = getEnvironmentVariable("CLOUDFLARE_EMAIL", true)
      if (!apiKey || !email) {
        throw new Error(
          "CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL are required when using dangerous global key authentication"
        )
      }
      authHeaders["X-Auth-Email"] = email
      authHeaders["X-Auth-Key"] = apiKey
    } else {
      const apiToken = getEnvironmentVariable("CLOUDFLARE_API_TOKEN", true)
      if (!apiToken) {
        throw new Error("CLOUDFLARE_API_TOKEN is required for Analytics Engine queries")
      }
      authHeaders["Authorization"] = `Bearer ${apiToken}`
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: authHeaders,
      body: sqlQuery
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Analytics Engine HTTP error: ${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as AnalyticsEngineSQLResponse

    // Check if the response has the expected structure
    if (!result.data) {
      throw new Error(`Invalid Analytics Engine response structure in main query: ${JSON.stringify(result)}`)
    }

    // Transform SQL response to AnalyticsEngineResult[]
    return transformSQLResponseToAnalyticsResults(result.data)
  } catch (error) {
    console.error("Analytics Engine SQL query failed:", error)

    // Handle Cloudflare API errors
    if (error instanceof Cloudflare.APIError) {
      throw new Error(`Analytics Engine API error: ${error.status} - ${error.message}`)
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Analytics Engine query failed: ${errorMessage}`)
  }
}

/**
 * Build Analytics Engine SQL query based on query parameters
 */
function buildAnalyticsEngineQuery(params: AnalyticsQueryParams): string {
  const { timeRange, customStart, customEnd, eventTypes, limit = 1000, offset = 0 } = params

  // Calculate time boundaries
  const { start, end } = getTimeRangeBoundaries(timeRange, customStart, customEnd)

  // Build WHERE conditions - use toDateTime function for proper comparison
  const startDateTime = start.toISOString().replace("T", " ").substring(0, 19)
  const endDateTime = end.toISOString().replace("T", " ").substring(0, 19)
  const conditions: string[] = [
    `"timestamp" >= toDateTime('${startDateTime}')`,
    `"timestamp" <= toDateTime('${endDateTime}')`
  ]

  // Filter by event types if specified
  if (eventTypes && eventTypes.length > 0) {
    const eventTypeConditions = eventTypes.map((type) => `index1 = '${type}'`).join(" OR ")
    conditions.push(`(${eventTypeConditions})`)
  }

  // Build the main query with our dataset structure
  // Based on our writeDataPoint structure:
  // - blob1: event type (redirect, auth, ai, etc.)
  // - blob2-blob10: various string data (slug, endpoint, userAgent, ip, country, etc.)
  // - double1-double2: numeric data (counts, processing time, etc.)
  // - index1: event type for fast filtering
  // - index2: specific identifier (slug, tokenSubject, operation, etc.)

  const query = `
    SELECT 
      timestamp,
      blob1, blob2, blob3, blob4, blob5, blob6, blob7, blob8, blob9, blob10,
      double1, double2, double3, double4, double5, double6, double7, double8, double9, double10,
      double11, double12, double13, double14, double15, double16, double17, double18, double19, double20,
      index1,
      _sample_interval
    FROM "NEXT_DAVE_IO_ANALYTICS"
    WHERE ${conditions.join(" AND ")}
    ORDER BY "timestamp" DESC
    LIMIT ${limit}
  `.trim()

  return query
}

/**
 * Transform SQL API response data to AnalyticsEngineResult[]
 */
function transformSQLResponseToAnalyticsResults(data: Array<Record<string, unknown>>): AnalyticsEngineResult[] {
  return data.map((row) => ({
    // Map timestamp
    timestamp: row.timestamp as string,

    // Map blob fields (strings)
    blob1: row.blob1 as string | undefined,
    blob2: row.blob2 as string | undefined,
    blob3: row.blob3 as string | undefined,
    blob4: row.blob4 as string | undefined,
    blob5: row.blob5 as string | undefined,
    blob6: row.blob6 as string | undefined,
    blob7: row.blob7 as string | undefined,
    blob8: row.blob8 as string | undefined,
    blob9: row.blob9 as string | undefined,
    blob10: row.blob10 as string | undefined,

    // Map double fields (numbers)
    double1: row.double1 as number | undefined,
    double2: row.double2 as number | undefined,
    double3: row.double3 as number | undefined,
    double4: row.double4 as number | undefined,
    double5: row.double5 as number | undefined,
    double6: row.double6 as number | undefined,
    double7: row.double7 as number | undefined,
    double8: row.double8 as number | undefined,
    double9: row.double9 as number | undefined,
    double10: row.double10 as number | undefined,
    double11: row.double11 as number | undefined,
    double12: row.double12 as number | undefined,
    double13: row.double13 as number | undefined,
    double14: row.double14 as number | undefined,
    double15: row.double15 as number | undefined,
    double16: row.double16 as number | undefined,
    double17: row.double17 as number | undefined,
    double18: row.double18 as number | undefined,
    double19: row.double19 as number | undefined,
    double20: row.double20 as number | undefined,

    // Map index fields (strings) - only index1 is accessible via SQL
    index1: row.index1 as string | undefined,
    index2: undefined, // Not accessible via SQL API
    index3: undefined, // Not accessible via SQL API
    index4: undefined, // Not accessible via SQL API
    index5: undefined, // Not accessible via SQL API

    // Map sample interval
    _sample_interval: row._sample_interval as number | undefined
  }))
}

/**
 * KV counter entry for simple increments or value sets
 */
interface KVCounterEntry {
  key: string
  increment?: number
  value?: string | number
}

/**
 * Normalize key to kebab-case with colons and ensure metrics: prefix
 */
function normalizeKVKey(key: string): string {
  // Ensure it starts with metrics:
  if (!key.startsWith("metrics:")) {
    key = `metrics:${key}`
  }

  // Convert to kebab-case and normalize separators
  return key
    .toLowerCase()
    .replace(/[^a-z0-9:]/g, "-") // Replace non-alphanumeric (except colons) with dashes
    .replace(/-+/g, "-") // Remove multiple consecutive dashes
    .replace(/-:/g, ":") // Clean up dash-colon combinations
    .replace(/:-/g, ":") // Clean up colon-dash combinations
    .replace(/^-/, "") // Remove leading dash
    .replace(/-$/, "") // Remove trailing dash
}

/**
 * Main analytics function that can write to Analytics Engine only, or Analytics Engine + KV
 */
export async function writeAnalytics(
  kv: boolean,
  analytics: AnalyticsEngineDataset | undefined,
  kvNamespace: KVNamespace | undefined,
  event: AnalyticsEvent,
  kvCounters?: KVCounterEntry[]
): Promise<void> {
  try {
    // Always write to Analytics Engine
    if (analytics) {
      await writeAnalyticsEvent(analytics, event)
    }

    // Write to KV only if kv flag is true
    if (kv && kvNamespace && kvCounters) {
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
            console.error(`Failed to update KV counter ${counter.key}:`, error)
            // Continue with other counters even if one fails
          }
        })
      )
    }
  } catch (error) {
    console.error("Failed to write analytics:", error)
    // Don't throw - analytics should never break the main flow
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
  const slugNormalized = slug.replace(/[^a-z0-9]/g, "-")
  const domainMatch = destinationUrl.match(/^https?:\/\/([^\/]+)/)
  const domain = domainMatch ? domainMatch[1].replace(/[^a-z0-9]/g, "-") : "unknown"

  const baseCounters: KVCounterEntry[] = [
    { key: "redirects:total", increment: clickCount },
    { key: `redirects:by-slug:${slugNormalized}`, increment: clickCount },
    { key: `redirects:by-domain:${domain}`, increment: clickCount },
    { key: `redirects:by-country:${cfInfo.country.toLowerCase()}`, increment: clickCount }
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
  requestsInWindow: number,
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
 * Standard Analytics Engine field mapping for consistent data structure
 */
interface StandardAnalyticsMapping {
  // Blob fields (strings) - standardized positions
  blob1: string // event_type (api_request, auth, ai, redirect, etc.)
  blob2: string // endpoint/operation/slug
  blob3: string // method/action/status
  blob4: string // user_agent
  blob5: string // ip_address
  blob6: string // country
  blob7: string // ray_id
  blob8: string // token_subject/user_id
  blob9: string // additional_context_1
  blob10: string // additional_context_2

  // Double fields (numbers) - standardized positions
  double1: number // response_time_ms
  double2: number // status_code
  double3: number // success_flag (1/0)
  double4: number // size_bytes (image size, payload size, etc.)
  double5: number // duration_ms (processing time, cache age, etc.)
  double6: number // count (click count, request count, etc.)
  double7: number // rate_limit_current
  double8: number // rate_limit_max
  double9: number // custom_metric_1
  double10: number // custom_metric_2

  // Index field - for fast querying (Analytics Engine supports only 1 index)
  index1: string // event_type (same as blob1, for fast filtering)
}

/**
 * Create standardized Analytics Engine data point from event
 */
function createStandardAnalyticsMapping(event: AnalyticsEvent): Partial<StandardAnalyticsMapping> {
  const base = {
    blob1: event.type,
    blob4: event.cloudflare.userAgent,
    blob5: event.cloudflare.ip,
    blob6: event.cloudflare.country,
    blob7: event.cloudflare.ray,
    index1: event.type
  }

  switch (event.type) {
    case "api_request": {
      const data = event.data as APIRequestEvent["data"]
      return {
        ...base,
        blob2: data.endpoint,
        blob3: data.method,
        blob8: data.tokenSubject || "anonymous",
        blob9: data.statusCode.toString(),
        blob10: "",
        double1: data.responseTimeMs,
        double2: data.statusCode,
        double3: data.statusCode < 400 ? 1 : 0,
        double4: 0,
        double5: 0,
        double6: 1,
        double7: 0,
        double8: 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "auth": {
      const data = event.data as AuthEvent["data"]
      return {
        ...base,
        blob2: data.endpoint || "",
        blob3: data.success ? "success" : "failed",
        blob8: data.tokenSubject,
        blob9: "",
        blob10: "",
        double1: 0,
        double2: data.success ? 200 : 401,
        double3: data.success ? 1 : 0,
        double4: 0,
        double5: 0,
        double6: 1,
        double7: 0,
        double8: 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "redirect": {
      const data = event.data as RedirectEvent["data"]
      return {
        ...base,
        blob2: data.slug,
        blob3: data.destinationUrl,
        blob8: "",
        blob9: "",
        blob10: "",
        double1: 0,
        double2: 200,
        double3: 1,
        double4: 0,
        double5: 0,
        double6: data.clickCount,
        double7: 0,
        double8: 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "ai": {
      const data = event.data as AIEvent["data"]
      return {
        ...base,
        blob2: data.operation,
        blob3: data.method,
        blob8: data.userId || "anonymous",
        blob9: data.success ? "success" : data.errorType || "failed",
        blob10: data.imageSource,
        double1: data.processingTimeMs,
        double2: data.success ? 200 : 500,
        double3: data.success ? 1 : 0,
        double4: data.imageSizeBytes || 0,
        double5: 0,
        double6: 1,
        double7: 0,
        double8: 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "rate_limit": {
      const data = event.data as RateLimitEvent["data"]
      return {
        ...base,
        blob2: data.endpoint,
        blob3: data.action,
        blob8: data.tokenSubject || "anonymous",
        blob9: data.resetTime,
        blob10: "",
        double1: 0,
        double2: data.action === "blocked" ? 429 : 200,
        double3: data.action === "allowed" ? 1 : 0,
        double4: 0,
        double5: data.windowSizeMs,
        double6: data.requestsInWindow,
        double7: data.requestsInWindow,
        double8: data.maxRequests,
        double9: data.remainingRequests,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "routeros": {
      const data = event.data as RouterOSEvent["data"]
      return {
        ...base,
        blob2: data.operation,
        blob3: data.cacheStatus || "",
        blob8: "",
        blob9: "",
        blob10: "",
        double1: 0,
        double2: 200,
        double3: 1,
        double4: 0,
        double5: 0,
        double6: 1,
        double7: data.ipv4Count || 0,
        double8: data.ipv6Count || 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    case "ping": {
      const data = event.data as PingEvent["data"]
      return {
        ...base,
        blob2: "ping",
        blob3: "",
        blob8: "",
        blob9: "",
        blob10: "",
        double1: 0,
        double2: 200,
        double3: 1,
        double4: 0,
        double5: 0,
        double6: data.pingCount,
        double7: 0,
        double8: 0,
        double9: 0,
        double10: 0
        // index2 and index3 not used - Analytics Engine only supports 1 index
      }
    }

    default:
      return base
  }
}

/**
 * Write analytics event to Analytics Engine with standardized field mapping
 */
export async function writeAnalyticsEvent(analytics: AnalyticsEngineDataset, event: AnalyticsEvent): Promise<void> {
  try {
    if (!analytics) {
      console.warn("Analytics Engine dataset not available - skipping write")
      return
    }

    // Use standardized mapping for consistent field positions
    const mapping = createStandardAnalyticsMapping(event)

    // Convert mapping to arrays for Analytics Engine
    const blobs = [
      mapping.blob1 || "",
      mapping.blob2 || "",
      mapping.blob3 || "",
      mapping.blob4 || "",
      mapping.blob5 || "",
      mapping.blob6 || "",
      mapping.blob7 || "",
      mapping.blob8 || "",
      mapping.blob9 || "",
      mapping.blob10 || ""
    ]

    const doubles = [
      mapping.double1 || 0,
      mapping.double2 || 0,
      mapping.double3 || 0,
      mapping.double4 || 0,
      mapping.double5 || 0,
      mapping.double6 || 0,
      mapping.double7 || 0,
      mapping.double8 || 0,
      mapping.double9 || 0,
      mapping.double10 || 0
    ]

    const indexes = [mapping.index1 || ""] // Analytics Engine only supports 1 index

    console.log(`Writing analytics event: ${event.type} with index: ${indexes[0]}`)
    
    await analytics.writeDataPoint({
      blobs,
      doubles,
      indexes
    })
    
    console.log(`✅ Analytics event written successfully: ${event.type}`)
  } catch (error) {
    console.error("❌ Failed to write analytics event:", error)
    console.error("Event type:", event.type)
    console.error("Error details:", error instanceof Error ? error.message : String(error))
    // Don't throw - analytics should never break the main flow
  }
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

/**
 * Generate cache key for analytics data
 */
export function getAnalyticsCacheKey(params: AnalyticsQueryParams): string {
  const { timeRange, eventTypes, country, tokenSubject } = params
  const filters = [timeRange, eventTypes?.join(",") || "all", country || "all", tokenSubject || "all"].join(":")

  return `analytics:cache:${filters}`
}

/**
 * Build SQL query for time-series data with proper time buckets
 */
export function buildTimeSeriesQuery(params: AnalyticsQueryParams): string {
  const { start, end } = getTimeRangeBoundaries(params.timeRange, params.customStart, params.customEnd)

  const startDateTime = start.toISOString().replace("T", " ").substring(0, 19)
  const endDateTime = end.toISOString().replace("T", " ").substring(0, 19)
  let whereClause = `"timestamp" >= toDateTime('${startDateTime}') AND "timestamp" <= toDateTime('${endDateTime}')`

  if (params.eventTypes && params.eventTypes.length > 0) {
    const types = params.eventTypes.map((t) => `'${t}'`).join(", ")
    whereClause += ` AND index1 IN (${types})`
  }

  if (params.country) {
    whereClause += ` AND blob6 = '${params.country}'`
  }

  if (params.tokenSubject) {
    whereClause += ` AND blob3 = '${params.tokenSubject}'`
  }

  // Determine time bucket size based on range
  let timeBucket: string
  switch (params.timeRange) {
    case "1h":
      timeBucket = "5 MINUTE"
      break
    case "24h":
      timeBucket = "1 HOUR"
      break
    case "7d":
      timeBucket = "6 HOUR"
      break
    case "30d":
      timeBucket = "1 DAY"
      break
    default:
      timeBucket = "1 HOUR"
  }

  // Simple query without aggregate functions that aren't supported
  return `
    SELECT 
      "timestamp",
      index1 as event_type,
      blob1, blob2, blob3, blob4, blob5,
      double1, double2
    FROM "NEXT_DAVE_IO_ANALYTICS"
    WHERE ${whereClause}
    ORDER BY "timestamp" ASC
    LIMIT 100
  `.trim()
}

/**
 * Query Analytics Engine for time-series data and convert to TimeSeriesData
 */
export async function queryTimeSeriesData(
  _event: H3Event,
  params: AnalyticsQueryParams
): Promise<import("~/types/analytics").TimeSeriesData> {
  const accountId = getEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID", true)

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for time-series queries")
  }

  try {
    const sqlQuery = buildTimeSeriesQuery(params)

    // Make direct HTTP request to Analytics Engine SQL API
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`

    const authHeaders: Record<string, string> = {
      "Content-Type": "text/plain"
    }

    if (isDangerousGlobalKeyEnabled()) {
      const apiKey = getEnvironmentVariable("CLOUDFLARE_API_KEY", true)
      const email = getEnvironmentVariable("CLOUDFLARE_EMAIL", true)
      if (!apiKey || !email) {
        throw new Error(
          "CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL are required when using dangerous global key authentication"
        )
      }
      authHeaders["X-Auth-Email"] = email
      authHeaders["X-Auth-Key"] = apiKey
    } else {
      const apiToken = getEnvironmentVariable("CLOUDFLARE_API_TOKEN", true)
      if (!apiToken) {
        throw new Error("CLOUDFLARE_API_TOKEN is required for Analytics Engine queries")
      }
      authHeaders["Authorization"] = `Bearer ${apiToken}`
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: authHeaders,
      body: sqlQuery
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Analytics Engine HTTP error: ${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as AnalyticsEngineSQLResponse

    // Check if the response has the expected structure
    if (!result.data) {
      throw new Error(`Invalid Analytics Engine response structure in time-series query: ${JSON.stringify(result)}`)
    }

    // Transform response to TimeSeriesData structure
    return transformTimeSeriesResponse(result.data, params)
  } catch (error) {
    console.error("Time-series query failed:", error)

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Time-series query failed: ${errorMessage}`)
  }
}

/**
 * Transform Analytics Engine SQL response to TimeSeriesData
 */
function transformTimeSeriesResponse(
  // biome-ignore lint/suspicious/noExplicitAny: SQL response structure is dynamic from Cloudflare API
  data: any[],
  params: AnalyticsQueryParams
): import("~/types/analytics").TimeSeriesData {
  const result: import("~/types/analytics").TimeSeriesData = {
    requests: [],
    redirects: [],
    auth: [],
    ai: [],
    responseTime: [],
    errors: [],
    rateLimits: [],
    uniqueVisitors: []
  }

  // Group by timestamp since we're not using time buckets yet
  const groupedData = groupBy(data, "timestamp")

  // Generate complete time series with zero values for missing data points
  const { start, end } = getTimeRangeBoundaries(params.timeRange, params.customStart, params.customEnd)
  const timePoints = generateTimePoints(start, end, params.timeRange)

  for (const timePoint of timePoints) {
    const timestamp = timePoint.toISOString()
    const bucketData = groupedData[timestamp] || []

    // Aggregate data for this time bucket
    let totalRequests = 0
    let successfulRequests = 0
    let failedRequests = 0
    let redirects = 0
    let auth = 0
    let ai = 0
    let errors = 0
    let rateLimits = 0
    let totalResponseTime = 0
    let responseTimeCount = 0
    let uniqueVisitorsCount = 0

    for (const row of bucketData) {
      const eventType = row.event_type
      const count = Number(row.event_count) || 0
      const avgTime = Number(row.avg_processing_time) || 0
      const successCount = Number(row.success_count) || 0
      const errorCount = Number(row.error_count) || 0
      const uniqueVisitors = Number(row.unique_visitors) || 0

      totalRequests += count
      successfulRequests += successCount
      failedRequests += errorCount
      uniqueVisitorsCount = Math.max(uniqueVisitorsCount, uniqueVisitors)

      switch (eventType) {
        case "redirect":
          redirects += count
          break
        case "auth":
          auth += count
          break
        case "ai":
          ai += count
          if (avgTime > 0) {
            totalResponseTime += avgTime * count
            responseTimeCount += count
          }
          break
        case "rate_limit":
          rateLimits += count
          break
      }

      errors += errorCount
    }

    // Calculate average response time for this bucket
    const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0

    result.requests.push({
      timestamp,
      value: totalRequests,
      successfulRequests,
      failedRequests
    })
    result.redirects.push({ timestamp, value: redirects })
    result.auth.push({ timestamp, value: auth })
    result.ai.push({ timestamp, value: ai })
    result.responseTime.push({ timestamp, value: avgResponseTime })
    result.errors.push({ timestamp, value: errors })
    result.rateLimits.push({ timestamp, value: rateLimits })
    result.uniqueVisitors.push({ timestamp, value: uniqueVisitorsCount })
  }

  return result
}

/**
 * Generate time points for a given range to ensure complete time series
 */
function generateTimePoints(start: Date, end: Date, range: AnalyticsTimeRange): Date[] {
  const points: Date[] = []
  let current = new Date(start)

  let increment: number
  switch (range) {
    case "1h":
      increment = 5 * 60 * 1000 // 5 minutes
      break
    case "24h":
      increment = 60 * 60 * 1000 // 1 hour
      break
    case "7d":
      increment = 6 * 60 * 60 * 1000 // 6 hours
      break
    case "30d":
      increment = 24 * 60 * 60 * 1000 // 1 day
      break
    default:
      increment = 60 * 60 * 1000 // 1 hour
  }

  while (current <= end) {
    points.push(new Date(current))
    current = new Date(current.getTime() + increment)
  }

  return points
}
