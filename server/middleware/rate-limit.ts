import type { H3Event } from "h3"
import { createError, defineEventHandler, getHeader, getQuery, getRequestURL, setHeader } from "h3"
import {
  getCloudflareEnv,
  getCloudflareRequestInfo,
  getKVNamespace
} from "~/server/utils/cloudflare"
import {
  getCachedRateLimit,
  getSlidingWindowRateLimit,
  initializeRateLimitCache
} from "~/server/utils/rate-limit-cache"
import { writeKVMetrics, createRateLimitKVCounters } from "~/server/utils/kv-metrics"

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (event: H3Event) => string // Custom key generator
  skipSuccessfulRequests?: boolean // Skip successful requests in count
  skipFailedRequests?: boolean // Skip failed requests in count
  enabled?: boolean // Whether rate limiting is enabled for this endpoint
  customMessage?: string // Custom error message when rate limit is exceeded
}

/**
 * Rate limiting presets for common use cases
 */
export const RATE_LIMIT_PRESETS = {
  // Very strict - for sensitive operations
  VERY_STRICT: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 per 15 minutes

  // Strict - for authentication, token management
  STRICT: { windowMs: 15 * 60 * 1000, maxRequests: 10 }, // 10 per 15 minutes

  // Moderate - for resource-intensive operations
  MODERATE: { windowMs: 60 * 1000, maxRequests: 30 }, // 30 per minute

  // Standard - for regular API endpoints
  STANDARD: { windowMs: 60 * 1000, maxRequests: 60 }, // 60 per minute

  // Lenient - for public endpoints, health checks
  LENIENT: { windowMs: 60 * 1000, maxRequests: 120 }, // 120 per minute

  // High volume - for public redirects, static content
  HIGH_VOLUME: { windowMs: 60 * 1000, maxRequests: 300 }, // 300 per minute

  // Real-time - for SSE, WebSocket connections
  REALTIME: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 per minute

  // AI/ML - for compute-intensive operations
  AI_OPERATIONS: { windowMs: 60 * 1000, maxRequests: 20 } // 20 per minute
} as const

/**
 * Rate limiting exemptions for specific endpoints
 */
export const RATE_LIMIT_EXEMPTIONS = new Set(["/api/health", "/api/ping", "/api/_worker-info"])

// NOTE: Rate limiting cache initialization moved to lazy loading to avoid global scope issues in Cloudflare Workers
// Cache initialization happens automatically on first use via ensureCacheInitialized()

/**
 * Helper function to create a rate limit configuration
 */
export function createRateLimit(config: Partial<RateLimitConfig>): RateLimitConfig {
  return {
    windowMs: 60 * 1000, // Default 1 minute
    maxRequests: 60, // Default 60 requests
    enabled: true,
    ...config
  }
}

/**
 * Helper function to create a rate limit configuration from a preset
 */
export function fromPreset(
  preset: keyof typeof RATE_LIMIT_PRESETS,
  overrides?: Partial<RateLimitConfig>
): RateLimitConfig {
  return {
    ...RATE_LIMIT_PRESETS[preset],
    enabled: true,
    ...overrides
  }
}

/**
 * Helper function to disable rate limiting for an endpoint
 */
export function noRateLimit(): RateLimitConfig {
  return {
    windowMs: 60 * 1000,
    maxRequests: Number.MAX_SAFE_INTEGER,
    enabled: false
  }
}

/**
 * Helper function to create token-based rate limiting
 */
export function tokenBasedRateLimit(config: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return createRateLimit({
    ...config,
    keyGenerator: (event: H3Event) => {
      const authHeader = getHeader(event, "authorization")
      const tokenFromQuery = getQuery(event).token as string
      const tokenSubject = authHeader || tokenFromQuery || "anonymous"
      const url = getRequestURL(event)
      return `rate_limit:${url.pathname}:token:${tokenSubject}`
    }
  })
}

/**
 * Helper function to create IP-based rate limiting
 */
export function ipBasedRateLimit(config: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return createRateLimit({
    ...config,
    keyGenerator: (event: H3Event) => {
      const cloudflareInfo = getCloudflareRequestInfo(event)
      const url = getRequestURL(event)
      return `rate_limit:${url.pathname}:ip:${cloudflareInfo.ip}`
    }
  })
}

/**
 * Helper function to create user agent-based rate limiting (for bot protection)
 */
export function userAgentBasedRateLimit(config: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return createRateLimit({
    ...config,
    keyGenerator: (event: H3Event) => {
      const cloudflareInfo = getCloudflareRequestInfo(event)
      const url = getRequestURL(event)
      // Create a simplified user agent hash for grouping
      const uaHash = cloudflareInfo.userAgent.split(" ").slice(0, 3).join("_")
      return `rate_limit:${url.pathname}:ua:${uaHash}`
    }
  })
}

/**
 * Rate limiting configuration registry for easy endpoint-specific setup
 */
const rateLimitRegistry = new Map<string, RateLimitConfig>()

/**
 * Register a rate limit configuration for a specific endpoint
 */
export function setRateLimit(endpoint: string, config: RateLimitConfig): void {
  rateLimitRegistry.set(endpoint, config)
}

/**
 * Register multiple rate limit configurations
 */
export function setRateLimits(configs: Record<string, RateLimitConfig>): void {
  for (const [endpoint, config] of Object.entries(configs)) {
    rateLimitRegistry.set(endpoint, config)
  }
}

/**
 * Clear rate limit configuration for an endpoint
 */
export function clearRateLimit(endpoint: string): void {
  rateLimitRegistry.delete(endpoint)
}

/**
 * Get all registered rate limit configurations
 */
export function getRateLimitConfigs(): Map<string, RateLimitConfig> {
  return new Map(rateLimitRegistry)
}

/**
 * Apply rate limiting to a specific endpoint handler
 * This function can be called at the beginning of any API endpoint
 */
export async function applyRateLimit(event: H3Event, config?: RateLimitConfig): Promise<void> {
  // Check if rate limiting is disabled via environment variable
  if (isRateLimitingDisabled()) {
    return
  }

  const url = getRequestURL(event)
  const pathname = url.pathname

  // Use provided config or get from registry/defaults
  const rateLimitConfig = config || getRateLimitConfig(pathname)

  // Skip if rate limiting is disabled
  if (rateLimitConfig.enabled === false) {
    return
  }

  const env = getCloudflareEnv(event)

  // Skip rate limiting if required services are not available
  if (!env.DATA) {
    return
  }

  const kv = getKVNamespace(env)
  const cloudflareInfo = getCloudflareRequestInfo(event)

  const rateLimitKey = generateRateLimitKey(event, rateLimitConfig)
  const tokenSubject = await extractTokenSubject(event)

  try {
    // Use new caching layer for improved performance
    const rateLimitResult = await getCachedRateLimit(
      rateLimitKey,
      rateLimitConfig.maxRequests,
      rateLimitConfig.windowMs,
      kv
    )

    // Check if rate limit is exceeded
    if (!rateLimitResult.allowed) {
      // Log rate limit violation to KV metrics
      const kvCounters = createRateLimitKVCounters(
        "blocked",
        pathname,
        tokenSubject,
        rateLimitConfig.maxRequests - rateLimitResult.remaining + 1,
        { country: cloudflareInfo.country }
      )
      await writeKVMetrics(kv, kvCounters)

      // Throw rate limit error with custom message if provided
      throw createError({
        statusCode: 429,
        statusMessage: rateLimitConfig.customMessage || "Too Many Requests",
        data: {
          error: "Rate limit exceeded",
          limit: rateLimitConfig.maxRequests,
          windowMs: rateLimitConfig.windowMs,
          remaining: rateLimitResult.remaining,
          resetTime: new Date(rateLimitResult.resetTime).toISOString(),
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        }
      })
    }

    // Rate limit not exceeded - set headers and check for warnings
    // (KV update is handled by the caching layer asynchronously)

    // Set rate limit headers
    setHeader(event, "X-RateLimit-Limit", rateLimitConfig.maxRequests.toString())
    setHeader(event, "X-RateLimit-Remaining", rateLimitResult.remaining.toString())
    setHeader(event, "X-RateLimit-Reset", new Date(rateLimitResult.resetTime).toISOString())
    setHeader(event, "X-RateLimit-Window", rateLimitConfig.windowMs.toString())
    setHeader(event, "X-RateLimit-Cached", rateLimitResult.fromCache.toString())

    // Log warning events when approaching limit
    const requestsUsed = rateLimitConfig.maxRequests - rateLimitResult.remaining
    if (requestsUsed > rateLimitConfig.maxRequests * 0.8) {
      const kvCounters = createRateLimitKVCounters(
        "warning",
        pathname,
        tokenSubject,
        requestsUsed,
        { country: cloudflareInfo.country }
      )
      await writeKVMetrics(kv, kvCounters)
    }
  } catch (error) {
    // Re-throw rate limit errors
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 429) {
      throw error
    }

    // Log other errors but don't block the request
    console.error("Rate limiting error:", error)
  }
}

/**
 * Get current rate limit status for an endpoint without incrementing
 */
export async function getRateLimitStatus(
  event: H3Event,
  config?: RateLimitConfig
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: string
  totalRequests: number
  limit: number
  windowMs: number
}> {
  const url = getRequestURL(event)
  const pathname = url.pathname
  const rateLimitConfig = config || getRateLimitConfig(pathname)

  if (rateLimitConfig.enabled === false) {
    return {
      allowed: true,
      remaining: rateLimitConfig.maxRequests,
      resetTime: new Date().toISOString(),
      totalRequests: 0,
      limit: rateLimitConfig.maxRequests,
      windowMs: rateLimitConfig.windowMs
    }
  }

  const env = getCloudflareEnv(event)

  // Return disabled state if KV storage is not available
  if (!env.DATA) {
    return {
      allowed: true,
      remaining: rateLimitConfig.maxRequests,
      resetTime: new Date().toISOString(),
      totalRequests: 0,
      limit: rateLimitConfig.maxRequests,
      windowMs: rateLimitConfig.windowMs
    }
  }

  const kv = getKVNamespace(env)

  const rateLimitKey = generateRateLimitKey(event, rateLimitConfig)
  const now = Date.now()
  const windowStart = now - rateLimitConfig.windowMs

  const storedData = await kv.get(rateLimitKey)
  let requestCount = 0
  let windowStartTime = now

  if (storedData) {
    try {
      const parsed = JSON.parse(storedData)
      if (parsed.windowStart && parsed.windowStart > windowStart) {
        requestCount = parsed.count || 0
        windowStartTime = parsed.windowStart
      }
    } catch (parseError) {
      console.warn("Failed to parse rate limit data:", parseError)
    }
  }

  const remaining = Math.max(0, rateLimitConfig.maxRequests - requestCount)
  const resetTime = new Date(windowStartTime + rateLimitConfig.windowMs).toISOString()

  return {
    allowed: requestCount < rateLimitConfig.maxRequests,
    remaining,
    resetTime,
    totalRequests: requestCount,
    limit: rateLimitConfig.maxRequests,
    windowMs: rateLimitConfig.windowMs
  }
}

/**
 * Default rate limiting configurations by endpoint pattern
 */
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Public endpoints - more lenient
  "/api/health": RATE_LIMIT_PRESETS.LENIENT,
  "/api/ping": RATE_LIMIT_PRESETS.STANDARD,
  "/api/stats": RATE_LIMIT_PRESETS.STANDARD,

  // Authentication endpoints - strict
  "/api/auth": RATE_LIMIT_PRESETS.STRICT,

  // AI endpoints - resource intensive
  "/api/ai/alt": RATE_LIMIT_PRESETS.AI_OPERATIONS,

  // Analytics endpoints - moderate to lenient
  "/api/analytics": RATE_LIMIT_PRESETS.LENIENT,
  "/api/analytics/query": RATE_LIMIT_PRESETS.STANDARD,
  "/api/analytics/realtime": RATE_LIMIT_PRESETS.REALTIME,

  // Token management - strict
  "/api/tokens": RATE_LIMIT_PRESETS.STRICT,

  // RouterOS endpoints - moderate
  "/api/routeros": RATE_LIMIT_PRESETS.MODERATE,

  // Redirects - high volume (public facing)
  "/go": RATE_LIMIT_PRESETS.HIGH_VOLUME,

  // Default for all other endpoints
  default: RATE_LIMIT_PRESETS.STANDARD
}

/**
 * Generate rate limiting key for a request
 */
function generateRateLimitKey(event: H3Event, config: RateLimitConfig): string {
  if (config.keyGenerator) {
    return config.keyGenerator(event)
  }

  const cloudflareInfo = getCloudflareRequestInfo(event)
  const url = getRequestURL(event)
  const pathname = url.pathname

  // Try to get token from header or query for authenticated requests
  const authHeader = getHeader(event, "authorization")
  const tokenFromQuery = getQuery(event).token as string
  const tokenSubject = authHeader || tokenFromQuery

  // Use token subject if available, otherwise fall back to IP
  const identifier = tokenSubject ? `token:${tokenSubject}` : `ip:${cloudflareInfo.ip}`

  return `rate_limit:${pathname}:${identifier}`
}

/**
 * Get rate limit configuration for an endpoint
 */
function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Check registry first (takes precedence)
  const registryConfig = rateLimitRegistry.get(pathname)
  if (registryConfig) {
    return registryConfig
  }

  // Check for pattern matches in registry
  for (const [pattern, config] of rateLimitRegistry.entries()) {
    if (pathname.startsWith(pattern)) {
      return config
    }
  }

  // Check default configurations for exact matches
  if (DEFAULT_RATE_LIMITS[pathname]) {
    return DEFAULT_RATE_LIMITS[pathname]
  }

  // Check for pattern matches in defaults
  for (const [pattern, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
    if (pattern !== "default" && pathname.startsWith(pattern)) {
      return config
    }
  }

  // Return default configuration
  return DEFAULT_RATE_LIMITS.default || RATE_LIMIT_PRESETS.STANDARD
}

/**
 * Check if rate limiting should be disabled based on environment variable
 */
function isRateLimitingDisabled(): boolean {
  const disableVar = process.env.API_DEV_DISABLE_RATE_LIMITS
  return disableVar === "1" || disableVar === "true"
}

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(event: H3Event): Promise<void> {
  // Check if rate limiting is disabled via environment variable
  if (isRateLimitingDisabled()) {
    return
  }

  const url = getRequestURL(event)
  const pathname = url.pathname

  // Skip rate limiting for certain paths
  if (
    pathname.startsWith("/_nuxt") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots.txt") ||
    pathname.includes(".")
  ) {
    return
  }

  const env = getCloudflareEnv(event)

  // Skip rate limiting if KV storage is not available (allows proper 404s)
  if (!env.DATA) {
    return
  }

  const kv = getKVNamespace(env)
  const cloudflareInfo = getCloudflareRequestInfo(event)

  const config = getRateLimitConfig(pathname)
  const rateLimitKey = generateRateLimitKey(event, config)
  const tokenSubject = await extractTokenSubject(event)

  try {
    // Get current request count and timestamp
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Get stored rate limit data from KV (handles stateless nature)
    const storedData = await kv.get(rateLimitKey)
    let requestCount = 0
    let windowStartTime = now

    if (storedData) {
      try {
        const parsed = JSON.parse(storedData)
        if (parsed.windowStart && parsed.windowStart > windowStart) {
          // Still within the current window
          requestCount = parsed.count || 0
          windowStartTime = parsed.windowStart
        }
        // If the stored window is expired, start fresh (count = 0)
      } catch (parseError) {
        // If parsing fails, start fresh
        console.warn("Failed to parse rate limit data, starting fresh:", parseError)
      }
    }

    // Increment request count
    requestCount++

    // Calculate remaining requests and reset time
    const remainingRequests = Math.max(0, config.maxRequests - requestCount)
    const resetTime = new Date(windowStartTime + config.windowMs).toISOString()

    // Determine action based on request count
    let action: "throttled" | "blocked" | "warning" = "warning"

    if (requestCount > config.maxRequests) {
      action = "blocked"

      // Log rate limit violation to KV metrics
      const kvCounters = createRateLimitKVCounters(
        action,
        pathname,
        tokenSubject,
        requestCount,
        { country: cloudflareInfo.country }
      )
      await writeKVMetrics(kv, kvCounters)

      // Throw rate limit error
      throw createError({
        statusCode: 429,
        statusMessage: "Too Many Requests",
        data: {
          error: "Rate limit exceeded",
          limit: config.maxRequests,
          windowMs: config.windowMs,
          remaining: 0,
          resetTime,
          retryAfter: Math.ceil((windowStartTime + config.windowMs - now) / 1000)
        }
      })
    }

    if (requestCount > config.maxRequests * 0.8) {
      // Warning when approaching limit (80% threshold)
      action = "warning"
    }

    // Store updated rate limit data in KV
    const rateLimitData = {
      count: requestCount,
      windowStart: windowStartTime,
      lastUpdated: now,
      endpoint: pathname
    }

    await kv.put(
      rateLimitKey,
      JSON.stringify(rateLimitData),
      { expirationTtl: Math.ceil(config.windowMs / 1000) + 300 } // TTL with 5-minute buffer
    )

    // Set rate limit headers
    setHeader(event, "X-RateLimit-Limit", config.maxRequests.toString())
    setHeader(event, "X-RateLimit-Remaining", remainingRequests.toString())
    setHeader(event, "X-RateLimit-Reset", resetTime)
    setHeader(event, "X-RateLimit-Window", config.windowMs.toString())

    // Log rate limit events for KV metrics (except normal requests)
    if (action !== "warning" || requestCount > config.maxRequests * 0.8) {
      const kvCounters = createRateLimitKVCounters(
        action,
        pathname,
        tokenSubject,
        requestCount,
        { country: cloudflareInfo.country }
      )
      await writeKVMetrics(kv, kvCounters)
    }
  } catch (error) {
    // If it's a rate limit error, re-throw it
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 429) {
      throw error
    }

    // Log other errors but don't block the request
    console.error("Rate limiting error:", error)
  }
}

/**
 * Extract token subject from request - uses real JWT decoding
 */
async function extractTokenSubject(event: H3Event): Promise<string | undefined> {
  const authHeader = getHeader(event, "authorization")
  const tokenFromQuery = getQuery(event).token as string

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7)
    try {
      // Use the real JWT verification function from auth helpers
      const { verifyJWT } = await import("~/server/utils/auth")
      const secret = process.env.API_JWT_SECRET
      if (!secret) {
        throw new Error("API_JWT_SECRET not configured")
      }
      const authResult = await verifyJWT(token, secret)
      if (authResult.success && authResult.payload?.sub) {
        return authResult.payload.sub
      }
      return `token:${token.substring(0, 8)}...${token.substring(token.length - 8)}`
    } catch (_error) {
      // Invalid JWT - return undefined to trigger IP-based rate limiting
      return undefined
    }
  }

  if (tokenFromQuery) {
    try {
      const { verifyJWT } = await import("~/server/utils/auth")
      const secret = process.env.API_JWT_SECRET
      if (!secret) {
        throw new Error("API_JWT_SECRET not configured")
      }
      const authResult = await verifyJWT(tokenFromQuery, secret)
      if (authResult.success && authResult.payload?.sub) {
        return authResult.payload.sub
      }
      return `query:${tokenFromQuery.substring(0, 8)}`
    } catch (_error) {
      // Invalid JWT in query - return undefined
      return undefined
    }
  }

  return undefined
}

/**
 * Update rate limiting metrics in KV
 */
async function updateRateLimitMetrics(
  kv: KVNamespace,
  _action: "throttled" | "blocked",
  tokenSubject?: string
): Promise<void> {
  try {
    // Update total rate limited requests
    const totalKey = "metrics:requests:rate_limited"
    const currentTotal = await kv.get(totalKey)
    const newTotal = (Number.parseInt(currentTotal || "0", 10) || 0) + 1
    await kv.put(totalKey, newTotal.toString())

    // Update rate limited requests by token subject
    if (tokenSubject) {
      const tokenKey = `metrics:rate_limit:token:${tokenSubject}`
      const currentTokenCount = await kv.get(tokenKey)
      const newTokenCount = (Number.parseInt(currentTokenCount || "0", 10) || 0) + 1
      await kv.put(tokenKey, newTokenCount.toString())
    }

    // Update 24h metrics
    const dailyKey = "metrics:24h:rate_limited"
    const currentDaily = await kv.get(dailyKey)
    const newDaily = (Number.parseInt(currentDaily || "0", 10) || 0) + 1
    await kv.put(dailyKey, newDaily.toString(), { expirationTtl: 24 * 60 * 60 }) // 24 hours
  } catch (error) {
    console.error("Failed to update rate limit metrics:", error)
    // Don't throw - metrics should never break the main flow
  }
}

/**
 * Legacy function - use getRateLimitStatus instead
 * @deprecated Use getRateLimitStatus for better type safety
 */
export async function checkRateLimit(
  event: H3Event,
  customConfig?: Partial<RateLimitConfig>
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: string
  totalRequests: number
}> {
  const url = getRequestURL(event)
  const pathname = url.pathname
  const config = { ...getRateLimitConfig(pathname), ...customConfig }

  const status = await getRateLimitStatus(event, config)

  return {
    allowed: status.allowed,
    remaining: status.remaining,
    resetTime: status.resetTime,
    totalRequests: status.totalRequests
  }
}

// Export the middleware as default for Nuxt with eventHandler wrapper
export default defineEventHandler(rateLimitMiddleware)
