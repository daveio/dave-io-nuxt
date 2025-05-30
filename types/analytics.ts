import type { CloudflareRequestInfo } from "~/server/utils/cloudflare"

/**
 * Analytics Engine Event Types
 */
export type AnalyticsEventType = "ping" | "redirect" | "auth" | "ai" | "routeros" | "api_request" | "rate_limit"

/**
 * Time range options for analytics queries
 */
export type AnalyticsTimeRange = "1h" | "24h" | "7d" | "30d" | "custom"

/**
 * Analytics Engine query result structure
 */
export interface AnalyticsEngineResult {
  // Blob fields (string data)
  blob1?: string
  blob2?: string
  blob3?: string
  blob4?: string
  blob5?: string
  blob6?: string
  blob7?: string
  blob8?: string
  blob9?: string
  blob10?: string

  // Double fields (numeric data)
  double1?: number
  double2?: number
  double3?: number
  double4?: number
  double5?: number
  double6?: number
  double7?: number
  double8?: number
  double9?: number
  double10?: number
  double11?: number
  double12?: number
  double13?: number
  double14?: number
  double15?: number
  double16?: number
  double17?: number
  double18?: number
  double19?: number
  double20?: number

  // Index fields (optimized for querying)
  index1?: string
  index2?: string
  index3?: string
  index4?: string
  index5?: string

  // Timestamp
  timestamp?: string
  _sample_interval?: number
}

/**
 * Structured analytics event data
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType
  timestamp: string
  cloudflare: CloudflareRequestInfo
  data: Record<string, unknown>
}

/**
 * Redirect analytics event
 */
export interface RedirectEvent extends AnalyticsEvent {
  type: "redirect"
  data: {
    slug: string
    destinationUrl: string
    clickCount: number
  }
}

/**
 * Authentication analytics event
 */
export interface AuthEvent extends AnalyticsEvent {
  type: "auth"
  data: {
    success: boolean
    tokenSubject: string
    endpoint?: string
  }
}

/**
 * AI operation analytics event
 */
export interface AIEvent extends AnalyticsEvent {
  type: "ai"
  data: {
    operation: "alt-text"
    method: "GET" | "POST"
    imageSource: string
    processingTimeMs: number
    imageSizeBytes?: number
    generatedText?: string
    userId?: string
  }
}

/**
 * RouterOS analytics event
 */
export interface RouterOSEvent extends AnalyticsEvent {
  type: "routeros"
  data: {
    operation: "putio" | "cache" | "reset"
    cacheStatus?: string
    ipv4Count?: number
    ipv6Count?: number
  }
}

/**
 * Ping analytics event
 */
export interface PingEvent extends AnalyticsEvent {
  type: "ping"
  data: {
    pingCount: number
  }
}

/**
 * API request analytics event
 */
export interface APIRequestEvent extends AnalyticsEvent {
  type: "api_request"
  data: {
    endpoint: string
    method: string
    statusCode: number
    responseTimeMs: number
    tokenSubject?: string
  }
}

/**
 * Rate limiting analytics event
 */
export interface RateLimitEvent extends AnalyticsEvent {
  type: "rate_limit"
  data: {
    action: "throttled" | "blocked" | "warning"
    endpoint: string
    tokenSubject?: string
    requestsInWindow: number
    windowSizeMs: number
    maxRequests: number
    remainingRequests: number
    resetTime: string
  }
}

/**
 * Aggregated analytics metrics
 */
export interface AnalyticsMetrics {
  timeframe: {
    start: string
    end: string
    range: AnalyticsTimeRange
  }
  overview: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    averageResponseTime: number
    uniqueVisitors: number
  }
  redirects: {
    totalClicks: number
    topSlugs: Array<{
      slug: string
      clicks: number
      destinations: string[]
    }>
  }
  ai: {
    totalOperations: number
    averageProcessingTime: number
    totalImagesSized: number
    averageImageSize: number
  }
  authentication: {
    totalAttempts: number
    successRate: number
    failedAttempts: number
    topTokenSubjects: Array<{
      subject: string
      requests: number
    }>
  }
  routeros: {
    cacheHits: number
    cacheMisses: number
    putioGenerations: number
  }
  geographic: Array<{
    country: string
    requests: number
    percentage: number
  }>
  userAgents: Array<{
    agent: string
    requests: number
    isBot: boolean
  }>
  rateLimiting: {
    throttledRequests: number
    throttledByToken: Array<{
      tokenSubject: string
      throttledCount: number
    }>
  }
}

/**
 * KV metrics structure for fast queries
 */
export interface KVMetrics {
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
 * Analytics query parameters
 */
export interface AnalyticsQueryParams {
  timeRange: AnalyticsTimeRange
  customStart?: string
  customEnd?: string
  eventTypes?: AnalyticsEventType[]
  country?: string
  userAgent?: string
  tokenSubject?: string
  groupBy?: string[]
  metrics?: string[]
  limit?: number
  offset?: number
}

/**
 * Analytics dashboard widget configuration
 */
export interface AnalyticsDashboardWidget {
  id: string
  title: string
  type: "chart" | "metric" | "table" | "map"
  chartType?: "line" | "bar" | "pie" | "area" | "gauge"
  size: "small" | "medium" | "large"
  refreshInterval?: number
  query: AnalyticsQueryParams
  displayOptions?: {
    showLegend?: boolean
    showTooltip?: boolean
    xAxisLabel?: string
    yAxisLabel?: string
    colors?: string[]
  }
}

/**
 * Real-time analytics update
 */
export interface AnalyticsRealtimeUpdate {
  timestamp: string
  event: AnalyticsEvent | null
  metrics?: Partial<AnalyticsMetrics>
}

/**
 * Analytics API response structure
 */
export interface AnalyticsResponse<T = unknown> {
  success: boolean
  data: T
  meta?: {
    requestId: string
    timestamp: string
    cached?: boolean
    cacheExpiry?: string
    queryTime?: number
  }
  message?: string
  error?: string
}
