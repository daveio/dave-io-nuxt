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

  let whereClause = `timestamp >= '${start.toISOString()}' AND timestamp <= '${end.toISOString()}'`

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
            userId: result.blob9 || undefined
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
 * Query Analytics Engine using Cloudflare REST API
 */
export async function queryAnalyticsEngine(
  event: H3Event,
  params: AnalyticsQueryParams
): Promise<AnalyticsEngineResult[]> {
  const env = getCloudflareEnv(event)

  if (!env.ANALYTICS) {
    throw new Error("Analytics Engine not available")
  }

  // Build Analytics Engine SQL query
  const sqlQuery = buildAnalyticsQuery(params)

  try {
    // CONSTRAINT: Analytics Engine in Workers runtime does not support direct SQL querying
    // Analytics Engine only supports writing data points via writeDataPoint()
    // Analytics querying requires Cloudflare's GraphQL API with proper credentials

    console.error("Analytics Engine querying not implemented: requires GraphQL API access")
    console.error("Query attempted:", sqlQuery)

    // Return empty array - this is a service limitation, not mock data
    // See: https://developers.cloudflare.com/analytics/graphql-api/
    return []
  } catch (error) {
    console.error("Analytics Engine query preparation failed:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Analytics Engine query failed: ${errorMessage}`)
  }
}

/**
 * Write analytics event to Analytics Engine
 */
export function writeAnalyticsEvent(analytics: AnalyticsEngineDataset, event: AnalyticsEvent): void {
  try {
    switch (event.type) {
      case "redirect": {
        const redirectData = event.data as RedirectEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "redirect",
            redirectData.slug,
            redirectData.destinationUrl,
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray
          ],
          doubles: [redirectData.clickCount],
          indexes: ["redirect", redirectData.slug]
        })
        break
      }

      case "auth": {
        const authData = event.data as AuthEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "auth",
            authData.success ? "success" : "failed",
            authData.tokenSubject,
            authData.endpoint || "",
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray
          ],
          doubles: [1],
          indexes: ["auth", authData.tokenSubject]
        })
        break
      }

      case "ai": {
        const aiData = event.data as AIEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "ai",
            aiData.operation,
            aiData.method,
            aiData.imageSource,
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray,
            aiData.generatedText || "",
            aiData.userId || ""
          ],
          doubles: [aiData.processingTimeMs, aiData.imageSizeBytes || 0],
          indexes: ["ai", aiData.operation, aiData.userId || "anonymous"]
        })
        break
      }

      case "routeros": {
        const routerosData = event.data as RouterOSEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "routeros",
            routerosData.operation,
            routerosData.cacheStatus || "",
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray
          ],
          doubles: [routerosData.ipv4Count || 0, routerosData.ipv6Count || 0],
          indexes: ["routeros", routerosData.operation]
        })
        break
      }

      case "ping":
        analytics.writeDataPoint({
          blobs: [
            "ping",
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray
          ],
          doubles: [1],
          indexes: ["ping"]
        })
        break

      case "api_request": {
        const apiData = event.data as APIRequestEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "api_request",
            apiData.endpoint,
            apiData.method,
            apiData.statusCode.toString(),
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray,
            apiData.tokenSubject || ""
          ],
          doubles: [apiData.responseTimeMs, apiData.statusCode],
          indexes: ["api_request", apiData.endpoint, apiData.tokenSubject || "anonymous"]
        })
        break
      }

      case "rate_limit": {
        const rateLimitData = event.data as RateLimitEvent["data"]
        analytics.writeDataPoint({
          blobs: [
            "rate_limit",
            rateLimitData.action,
            rateLimitData.endpoint,
            event.cloudflare.userAgent,
            event.cloudflare.ip,
            event.cloudflare.country,
            event.cloudflare.ray,
            rateLimitData.tokenSubject || "",
            rateLimitData.resetTime
          ],
          doubles: [
            rateLimitData.requestsInWindow,
            rateLimitData.windowSizeMs,
            rateLimitData.maxRequests,
            rateLimitData.remainingRequests
          ],
          indexes: ["rate_limit", rateLimitData.action, rateLimitData.tokenSubject || "anonymous"]
        })
        break
      }
    }
  } catch (error) {
    console.error("Failed to write analytics event:", error)
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
