/**
 * Local caching layer for rate limiting to reduce KV operations
 * Implements sliding window rate limiting with memory-based counters
 */

interface CacheEntry {
  count: number
  windowStart: number
  lastUpdate: number
}

interface SlidingWindow {
  buckets: number[]
  currentBucket: number
  bucketSize: number
  windowStart: number
}

// In-memory cache for rate limit counters
const RATE_LIMIT_CACHE = new Map<string, CacheEntry>()
const SLIDING_WINDOW_CACHE = new Map<string, SlidingWindow>()

// Cache configuration
const CACHE_TTL = 5000 // 5 seconds - cache entries expire quickly
const MAX_CACHE_SIZE = 10000 // Maximum entries to prevent memory bloat
const CACHE_CLEANUP_INTERVAL = 60000 // 1 minute
const SLIDING_WINDOW_BUCKETS = 12 // 12 buckets for 5-second intervals in 1-minute window

// Sliding window configuration
const BUCKET_SIZE_MS = 5000 // 5 seconds per bucket
const WINDOW_SIZE_MS = 60000 // 1 minute total window

/**
 * Clean up expired cache entries periodically
 */
let cleanupTimer: NodeJS.Timeout | null = null

function startCacheCleanup() {
  if (cleanupTimer) return

  cleanupTimer = setInterval(() => {
    const now = Date.now()

    // Clean expired regular cache entries
    for (const [key, entry] of RATE_LIMIT_CACHE.entries()) {
      if (now - entry.lastUpdate > CACHE_TTL) {
        RATE_LIMIT_CACHE.delete(key)
      }
    }

    // Clean expired sliding window entries
    for (const [key, window] of SLIDING_WINDOW_CACHE.entries()) {
      if (now - window.windowStart > WINDOW_SIZE_MS * 2) {
        // Keep for 2 windows
        SLIDING_WINDOW_CACHE.delete(key)
      }
    }

    // Prevent cache from growing too large
    if (RATE_LIMIT_CACHE.size > MAX_CACHE_SIZE) {
      const entries = Array.from(RATE_LIMIT_CACHE.entries()).sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)

      // Remove oldest 20% of entries
      const toRemove = Math.floor(entries.length * 0.2)
      for (let i = 0; i < toRemove; i++) {
        const entry = entries[i]
        if (entry?.[0]) {
          RATE_LIMIT_CACHE.delete(entry[0])
        }
      }
    }
  }, CACHE_CLEANUP_INTERVAL)
}

/**
 * Initialize the cache cleanup process
 */
export function initializeRateLimitCache() {
  startCacheCleanup()
}

/**
 * Get rate limit status with local caching
 */
export async function getCachedRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  kv?: KVNamespace
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: number
  fromCache: boolean
}> {
  const now = Date.now()
  const cacheKey = `${key}:${maxRequests}:${windowMs}`

  // Check cache first
  const cached = RATE_LIMIT_CACHE.get(cacheKey)
  if (cached && now - cached.lastUpdate < CACHE_TTL) {
    const windowExpired = now - cached.windowStart > windowMs

    if (windowExpired) {
      // Reset window
      cached.count = 1
      cached.windowStart = now
      cached.lastUpdate = now
    } else {
      // Increment count
      cached.count++
      cached.lastUpdate = now
    }

    const allowed = cached.count <= maxRequests
    const remaining = Math.max(0, maxRequests - cached.count)
    const resetTime = cached.windowStart + windowMs

    // Async update to KV (fire and forget)
    if (kv) {
      updateKVAsync(key, cached, kv).catch(console.error)
    }

    return { allowed, remaining, resetTime, fromCache: true }
  }

  // Cache miss - fetch from KV
  if (kv) {
    try {
      const kvData = await kv.get(key)
      const parsed = kvData ? JSON.parse(kvData) : null

      if (parsed?.windowStart && now - parsed.windowStart < windowMs) {
        // Valid KV data
        const newCount = parsed.count + 1
        const entry: CacheEntry = {
          count: newCount,
          windowStart: parsed.windowStart,
          lastUpdate: now
        }

        RATE_LIMIT_CACHE.set(cacheKey, entry)

        const allowed = newCount <= maxRequests
        const remaining = Math.max(0, maxRequests - newCount)
        const resetTime = parsed.windowStart + windowMs

        // Update KV with new count
        updateKVAsync(key, entry, kv).catch(console.error)

        return { allowed, remaining, resetTime, fromCache: false }
      }
    } catch (error) {
      console.error("Rate limit KV error:", error)
    }
  }

  // Fallback - create new window
  const entry: CacheEntry = {
    count: 1,
    windowStart: now,
    lastUpdate: now
  }

  RATE_LIMIT_CACHE.set(cacheKey, entry)

  if (kv) {
    updateKVAsync(key, entry, kv).catch(console.error)
  }

  return {
    allowed: true,
    remaining: maxRequests - 1,
    resetTime: now + windowMs,
    fromCache: false
  }
}

/**
 * Sliding window rate limiter for more precise rate limiting
 */
export async function getSlidingWindowRateLimit(
  key: string,
  maxRequests: number,
  kv?: KVNamespace
): Promise<{
  allowed: boolean
  remaining: number
  resetTime: number
  requestsInWindow: number
}> {
  const now = Date.now()
  const cacheKey = `sliding:${key}:${maxRequests}`

  let window = SLIDING_WINDOW_CACHE.get(cacheKey)

  if (!window) {
    // Initialize new sliding window
    window = {
      buckets: new Array(SLIDING_WINDOW_BUCKETS).fill(0),
      currentBucket: 0,
      bucketSize: BUCKET_SIZE_MS,
      windowStart: now
    }
    SLIDING_WINDOW_CACHE.set(cacheKey, window)
  }

  // Calculate which bucket we should be in
  const elapsed = now - window.windowStart
  const targetBucket = Math.floor(elapsed / BUCKET_SIZE_MS) % SLIDING_WINDOW_BUCKETS

  // Clear buckets that have expired (more than 1 window old)
  if (elapsed > WINDOW_SIZE_MS) {
    const bucketsToExpire = Math.min(SLIDING_WINDOW_BUCKETS, Math.floor(elapsed / BUCKET_SIZE_MS))
    for (let i = 0; i < bucketsToExpire; i++) {
      const bucketIndex = (window.currentBucket + 1 + i) % SLIDING_WINDOW_BUCKETS
      window.buckets[bucketIndex] = 0
    }

    // Update window start time
    window.windowStart = now - (elapsed % WINDOW_SIZE_MS)
  }

  // Update current bucket
  window.currentBucket = targetBucket

  // Add request to current bucket
  if (window.buckets[targetBucket] !== undefined) {
    window.buckets[targetBucket]++
  }

  // Calculate total requests in the sliding window
  const totalRequests = window.buckets.reduce((sum, count) => sum + count, 0)

  const allowed = totalRequests <= maxRequests
  const remaining = Math.max(0, maxRequests - totalRequests)

  // Next reset is when the oldest bucket expires
  const nextResetBucket = (targetBucket + 1) % SLIDING_WINDOW_BUCKETS
  const nextResetTime = window.windowStart + nextResetBucket * BUCKET_SIZE_MS + WINDOW_SIZE_MS

  // Async update to KV for persistence
  if (kv) {
    updateSlidingWindowKVAsync(key, window, kv).catch(console.error)
  }

  return {
    allowed,
    remaining,
    resetTime: nextResetTime,
    requestsInWindow: totalRequests
  }
}

/**
 * Batch KV operations to reduce API calls
 */
const BATCH_QUEUE = new Map<string, { data: unknown; timestamp: number }>()
const BATCH_TIMEOUT = 1000 // 1 second
let batchTimer: NodeJS.Timeout | null = null

async function updateKVAsync(key: string, entry: CacheEntry, kv: KVNamespace) {
  BATCH_QUEUE.set(key, { data: entry, timestamp: Date.now() })

  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      await flushBatchQueue(kv)
      batchTimer = null
    }, BATCH_TIMEOUT)
  }
}

async function updateSlidingWindowKVAsync(key: string, window: SlidingWindow, kv: KVNamespace) {
  BATCH_QUEUE.set(`sliding:${key}`, { data: window, timestamp: Date.now() })

  if (!batchTimer) {
    batchTimer = setTimeout(async () => {
      await flushBatchQueue(kv)
      batchTimer = null
    }, BATCH_TIMEOUT)
  }
}

async function flushBatchQueue(kv: KVNamespace) {
  if (BATCH_QUEUE.size === 0) return

  const updates = Array.from(BATCH_QUEUE.entries())
  BATCH_QUEUE.clear()

  // Process updates in batches to avoid overwhelming KV
  const BATCH_SIZE = 10
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(
        ([key, { data }]) => kv.put(key, JSON.stringify(data), { expirationTtl: 300 }) // 5 minutes TTL
      )
    )
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getRateLimitCacheStats() {
  return {
    cacheSize: RATE_LIMIT_CACHE.size,
    slidingWindowSize: SLIDING_WINDOW_CACHE.size,
    batchQueueSize: BATCH_QUEUE.size,
    maxCacheSize: MAX_CACHE_SIZE,
    cacheTtl: CACHE_TTL,
    cleanupInterval: CACHE_CLEANUP_INTERVAL
  }
}

/**
 * Clear all cache entries (for testing or manual reset)
 */
export function clearRateLimitCache() {
  RATE_LIMIT_CACHE.clear()
  SLIDING_WINDOW_CACHE.clear()
  BATCH_QUEUE.clear()

  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }
}

// Initialize cache cleanup on module load
initializeRateLimitCache()
