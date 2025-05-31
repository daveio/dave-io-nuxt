# CDN Optimization Strategy

Because apparently we're not fast enough for the internet's attention span of a goldfish.

## The Current State of Affairs

Your Cloudflare Worker is doing okay, but it's not exactly making the most of Cloudflare's CDN muscle. Right now you've got the equivalent of a Ferrari stuck in first gear - it works, but you're missing out on some serious performance gains.

## Static Asset Optimization (The Low-Hanging Fruit)

**Current Situation**: You've got exactly 3 files in `/public/` and they're not being cached properly.

**Technical Implementation**:

```typescript
// nuxt.config.ts - Add to routeRules
routeRules: {
  // Existing rules...
  
  // Static assets - aggressive caching
  "/**/*.{ico,png,jpg,jpeg,gif,webp,svg}": {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Vary": "Accept-Encoding"
    }
  },
  
  // Fonts - long-term cache with revalidation
  "/_fonts/**": {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "cross-origin"
    }
  },
  
  // Robots and other text files
  "/robots.txt": {
    headers: {
      "Cache-Control": "public, max-age=86400", // 24 hours
      "Content-Type": "text/plain"
    }
  }
}
```

**Asset Versioning Strategy**:
```typescript
// Enable Nuxt's built-in asset hashing
export default defineNuxtConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name].[hash][extname]',
          chunkFileNames: 'chunks/[name].[hash].js',
          entryFileNames: 'entries/[name].[hash].js'
        }
      }
    }
  }
})
```

**Cloudflare Polish Configuration** (via Dashboard or API):
```json
{
  "polish": "lossy",
  "webp": "on",
  "avif": "on"
}
```

## API Response Caching (Where the Magic Happens)

**Current Problem**: Every single API endpoint has `Cache-Control: no-cache, no-store, must-revalidate`. That's like putting a "DO NOT CACHE" sticker on everything.

**Technical Implementation Strategy**:

### Endpoint-Specific Cache Headers
```typescript
// server/utils/cache-headers.ts
export const CacheProfiles = {
  noCache: {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  },
  
  shortTerm: {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "Vary": "Authorization, Accept-Encoding"
  },
  
  mediumTerm: {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    "Vary": "Authorization, Accept-Encoding"
  },
  
  longTerm: {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    "Vary": "Accept-Encoding"
  }
} as const

export function setCacheHeaders(event: H3Event, profile: keyof typeof CacheProfiles) {
  setHeaders(event, CacheProfiles[profile])
}
```

### `/api/health` - Edge-Cacheable Health Checks
```typescript
// server/api/health.get.ts modifications
export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  
  // Set cache headers for edge caching
  setCacheHeaders(event, 'shortTerm')
  
  // Add ETag for conditional requests
  const etag = `"health-${Date.now().toString(36)}"`
  setHeader(event, 'ETag', etag)
  
  // Check If-None-Match header
  const ifNoneMatch = getHeader(event, 'if-none-match')
  if (ifNoneMatch === etag) {
    setResponseStatus(event, 304)
    return ''
  }
  
  // Existing health check logic...
})
```

### `/api/stats` - Stale-While-Revalidate Pattern
```typescript
// server/api/stats.get.ts with edge caching
export default defineEventHandler(async (event) => {
  // Enable edge caching with SWR
  setCacheHeaders(event, 'mediumTerm')
  
  // Use Cloudflare's Cache API for manual control
  const cache = caches.default
  const cacheKey = new Request(`https://cache.internal/stats`, {
    cf: { cacheEverything: true }
  })
  
  // Try cache first
  let response = await cache.match(cacheKey)
  if (response) {
    // Serve from cache, trigger background refresh if stale
    const cacheControl = response.headers.get('cache-control')
    if (shouldRevalidate(cacheControl)) {
      // Trigger background refresh without waiting
      event.waitUntil(refreshStatsCache(env, cacheKey))
    }
    return response.json()
  }
  
  // Generate fresh response and cache it
  const freshData = await generateStatsData(env)
  const freshResponse = new Response(JSON.stringify(freshData), {
    headers: CacheProfiles.mediumTerm
  })
  
  event.waitUntil(cache.put(cacheKey, freshResponse.clone()))
  return freshData
})
```

### Conditional Caching Based on Authentication
```typescript
// server/utils/conditional-cache.ts
export function shouldCacheResponse(event: H3Event, endpoint: string): boolean {
  const authHeader = getHeader(event, 'authorization')
  const hasAuth = authHeader && authHeader.startsWith('Bearer ')
  
  // Don't cache authenticated requests to sensitive endpoints
  const sensitiveEndpoints = ['/api/metrics', '/api/analytics', '/api/tokens']
  if (hasAuth && sensitiveEndpoints.some(ep => endpoint.startsWith(ep))) {
    return false
  }
  
  // Cache public endpoints regardless of auth
  const publicEndpoints = ['/api/health', '/api/ping', '/api/stats']
  return publicEndpoints.includes(endpoint)
}

export function getCacheProfile(endpoint: string, hasAuth: boolean) {
  if (!shouldCacheResponse({ node: { req: { url: endpoint } } } as H3Event, endpoint)) {
    return 'noCache'
  }
  
  // Endpoint-specific cache strategies
  switch (endpoint) {
    case '/api/health':
    case '/api/ping':
      return 'shortTerm'
    case '/api/stats':
      return 'mediumTerm'
    default:
      return 'noCache'
  }
}
```

### Vary Header Strategy
```typescript
// server/middleware/cache-control.ts
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  
  if (url.pathname.startsWith('/api/')) {
    const authHeader = getHeader(event, 'authorization')
    const acceptHeader = getHeader(event, 'accept')
    
    // Build Vary header based on endpoint requirements
    const varyHeaders = ['Accept-Encoding']
    
    if (authHeader) {
      varyHeaders.push('Authorization')
    }
    
    if (acceptHeader?.includes('text/yaml') || acceptHeader?.includes('text/plain')) {
      varyHeaders.push('Accept')
    }
    
    setHeader(event, 'Vary', varyHeaders.join(', '))
  }
})
```

## Font & Asset Delivery (The Typography Perfectionist's Dream)

**Current Setup**: Google Fonts via `@nuxt/fonts` with `/_fonts/` prefix.

**Technical Implementation**:

### Self-Hosted Font Strategy
```typescript
// nuxt.config.ts - Font optimization
export default defineNuxtConfig({
  fonts: {
    defaults: {
      weights: [400],
      styles: ["normal", "italic"],
      subsets: ["latin-ext", "latin"]
    },
    families: [
      { 
        name: "Sixtyfour Convergence", 
        provider: "google",
        display: "swap", // Critical for performance
        preload: true,
        fallbacks: ["monospace"]
      },
      { 
        name: "Sono", 
        provider: "google",
        display: "swap",
        fallbacks: ["sans-serif"]
      },
      { 
        name: "Victor Mono", 
        provider: "google",
        display: "swap", 
        fallbacks: ["monospace"]
      }
    ],
    assets: {
      prefix: "/_fonts/"
    },
    // Enable font optimization
    experimental: {
      processCSSVariables: true
    }
  },
  
  // Font preloading in head
  app: {
    head: {
      link: [
        {
          rel: 'preload',
          href: '/_fonts/sixtyfour-convergence-400-normal.woff2',
          as: 'font',
          type: 'font/woff2',
          crossorigin: 'anonymous'
        }
      ]
    }
  }
})
```

### Font Loading Performance
```css
/* assets/css/fonts.css */
@font-face {
  font-family: 'Sixtyfour Convergence';
  src: url('/_fonts/sixtyfour-convergence-400-normal.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap; /* Critical for CLS */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC;
}

/* Font loading optimization */
.font-loading {
  font-family: 'Sixtyfour Convergence', monospace;
  /* Fallback font with similar metrics */
  font-size-adjust: 0.5; /* Maintain layout during font swap */
}
```

### Advanced Font Optimization
```typescript
// composables/useFontOptimization.ts
export const useFontOptimization = () => {
  const fontLoadingStrategy = ref('swap')
  
  // Detect connection quality and adjust strategy
  const connection = (navigator as any).connection
  if (connection) {
    if (connection.effectiveType === '4g') {
      fontLoadingStrategy.value = 'swap'
    } else if (connection.effectiveType === '3g') {
      fontLoadingStrategy.value = 'fallback'
    } else {
      fontLoadingStrategy.value = 'block'
    }
  }
  
  // Preload critical fonts based on route
  const preloadCriticalFonts = (route: string) => {
    const criticalFonts = {
      '/': ['sixtyfour-convergence-400-normal.woff2'],
      '/analytics': ['sono-400-normal.woff2', 'victor-mono-400-normal.woff2']
    }
    
    const fonts = criticalFonts[route] || []
    fonts.forEach(font => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = `/_fonts/${font}`
      link.as = 'font'
      link.type = 'font/woff2'
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    })
  }
  
  return { fontLoadingStrategy, preloadCriticalFonts }
}
```

## Redirect Performance (The URL Shortener Optimization)

**Current Behavior**: Every `/go/{slug}` request hits KV storage.

**Technical Implementation**:

### Edge-Cached Redirect Strategy
```typescript
// server/routes/go/[slug].get.ts - Enhanced with edge caching
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createApiError(400, "Slug parameter is required")
  
  // Use Cloudflare Cache API for popular redirects
  const cache = caches.default
  const cacheKey = new Request(`https://redirects.internal/go/${slug}`, {
    cf: { 
      cacheEverything: true,
      cacheTtlByStatus: {
        "200-299": 900, // 15 minutes for successful redirects
        "404": 60,      // 1 minute for 404s to allow for new redirects
        "500-599": 0    // Don't cache errors
      }
    }
  })
  
  // Try edge cache first
  let cachedResponse = await cache.match(cacheKey)
  if (cachedResponse && !isStale(cachedResponse)) {
    // Update click metrics in background
    event.waitUntil(updateClickMetricsAsync(env, slug))
    
    const redirectUrl = await cachedResponse.text()
    setResponseStatus(event, 302)
    setHeader(event, "Location", redirectUrl)
    setHeader(event, "Cache-Control", "public, max-age=900")
    setHeader(event, "X-Cache", "HIT")
    return
  }
  
  // Fallback to KV lookup
  const env = getCloudflareEnv(event)
  const kv = getKVNamespace(env)
  
  try {
    const redirectData = await getRedirectFromKV(kv, slug)
    if (!redirectData) {
      throw createApiError(404, `Redirect not found for slug: ${slug}`)
    }
    
    // Cache the redirect at the edge
    const response = new Response(redirectData.url, {
      status: 302,
      headers: {
        "Location": redirectData.url,
        "Cache-Control": "public, max-age=900",
        "X-Cache": "MISS"
      }
    })
    
    event.waitUntil(cache.put(cacheKey, response.clone()))
    
    // Update metrics
    await updateRedirectMetrics(kv, slug, redirectData)
    
    // Perform redirect
    setResponseStatus(event, 302)
    setHeader(event, "Location", redirectData.url)
    setHeader(event, "Cache-Control", "public, max-age=900")
    
  } catch (error) {
    // Handle errors...
  }
})

// Background metrics update to avoid blocking redirect
async function updateClickMetricsAsync(env: any, slug: string) {
  try {
    const kv = getKVNamespace(env)
    const redirectKey = `redirect:${slug}`
    const kvData = await kv.get(redirectKey)
    
    if (kvData) {
      const redirectData = JSON.parse(kvData)
      const updatedData = {
        ...redirectData,
        clicks: (redirectData.clicks || 0) + 1,
        updated_at: new Date().toISOString()
      }
      
      await Promise.all([
        kv.put(redirectKey, JSON.stringify(updatedData)),
        kv.put(`metrics:redirect:${slug}:clicks`, updatedData.clicks.toString())
      ])
    }
  } catch (error) {
    console.error("Background metrics update failed:", error)
  }
}
```

### Intelligent Cache Warming
```typescript
// server/utils/redirect-cache-warming.ts
export class RedirectCacheWarmer {
  private env: any
  private cache: Cache
  
  constructor(env: any) {
    this.env = env
    this.cache = caches.default
  }
  
  async warmPopularRedirects() {
    const kv = getKVNamespace(this.env)
    
    // Get top 100 redirects by click count
    const popularRedirects = await this.getPopularRedirects(kv, 100)
    
    // Warm cache for popular redirects
    const warmingPromises = popularRedirects.map(async (redirect) => {
      const cacheKey = new Request(`https://redirects.internal/go/${redirect.slug}`)
      const cached = await this.cache.match(cacheKey)
      
      if (!cached || this.isStale(cached)) {
        const response = new Response(redirect.url, {
          headers: {
            "Cache-Control": "public, max-age=900",
            "X-Cache": "WARMED"
          }
        })
        
        await this.cache.put(cacheKey, response)
      }
    })
    
    await Promise.all(warmingPromises)
  }
  
  private async getPopularRedirects(kv: KVNamespace, limit: number) {
    // Get all redirect click metrics
    const { keys } = await kv.list({ prefix: "metrics:redirect:" })
    
    const redirectStats = await Promise.all(
      keys.map(async (key) => {
        const clicks = await kv.get(key.name)
        const slug = key.name.split(':')[2] // Extract slug from metrics:redirect:slug:clicks
        return { slug, clicks: parseInt(clicks || '0') }
      })
    )
    
    return redirectStats
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
  }
  
  private isStale(response: Response): boolean {
    const cacheControl = response.headers.get('cache-control')
    if (!cacheControl) return true
    
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
    if (!maxAgeMatch) return true
    
    const maxAge = parseInt(maxAgeMatch[1])
    const age = parseInt(response.headers.get('age') || '0')
    
    return age > maxAge * 0.8 // Consider stale at 80% of max-age
  }
}

// Scheduled cache warming (could be triggered by Cron Triggers)
export async function scheduledCacheWarming(env: any) {
  const warmer = new RedirectCacheWarmer(env)
  await warmer.warmPopularRedirects()
}
```

### Static Redirect Rules (wrangler.jsonc)
```json
{
  "rules": [
    {
      "action": "redirect",
      "action_parameters": {
        "from_value": "https://next.dave.io/301",
        "target_url": "https://www.youtube.com/watch?v=fEM21kmPPik",
        "status_code": 301
      },
      "expression": "http.request.full_uri eq \"https://next.dave.io/301\""
    },
    {
      "action": "redirect", 
      "action_parameters": {
        "from_value": "https://next.dave.io/cv",
        "target_url": "https://cv.dave.io",
        "status_code": 302
      },
      "expression": "http.request.full_uri eq \"https://next.dave.io/cv\""
    }
  ]
}
```

### Analytics-Aware Caching
```typescript
// server/utils/analytics-aware-caching.ts
export function shouldCacheRedirect(userAgent: string, referrer: string): boolean {
  // Don't cache requests from bots/crawlers
  const botPatterns = [
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
    /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
    /twitterbot/i, /linkedinbot/i, /whatsapp/i
  ]
  
  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    return false
  }
  
  // Don't cache direct navigation (no referrer) for analytics accuracy
  if (!referrer || referrer === '') {
    return false
  }
  
  return true
}

export function getCacheKeyWithAnalytics(slug: string, userAgent: string, country: string): string {
  // Create cache variations for different user segments
  const deviceType = /mobile/i.test(userAgent) ? 'mobile' : 'desktop'
  const region = getRegionFromCountry(country)
  
  return `redirect:${slug}:${deviceType}:${region}`
}
```

## Analytics & Real-time Data (The Balancing Act)

**Current Architecture**: KV + Analytics Engine dual storage (smart move).

**Technical Enhancement Strategy**:

### Tiered Analytics Caching
```typescript
// server/api/analytics/index.get.ts - Multi-tier caching
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const timeRange = query.timeRange as string || '24h'
  
  // Create cache key based on time range and granularity
  const cacheKey = `analytics:${timeRange}:${Math.floor(Date.now() / getCacheTTL(timeRange))}`
  
  // Tier 1: Edge cache (Cloudflare Cache API)
  const cache = caches.default
  const edgeCacheKey = new Request(`https://analytics.internal/${cacheKey}`)
  let cachedResponse = await cache.match(edgeCacheKey)
  
  if (cachedResponse) {
    setHeader(event, 'X-Cache', 'EDGE-HIT')
    return cachedResponse.json()
  }
  
  // Tier 2: KV cache
  const env = getCloudflareEnv(event)
  const kvCacheKey = `cache:${cacheKey}`
  const kvCached = await env.DATA.get(kvCacheKey)
  
  if (kvCached) {
    const data = JSON.parse(kvCached)
    
    // Cache at edge with shorter TTL
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${getCacheTTL(timeRange)}`
      }
    })
    
    event.waitUntil(cache.put(edgeCacheKey, response.clone()))
    setHeader(event, 'X-Cache', 'KV-HIT')
    return data
  }
  
  // Tier 3: Fresh data from Analytics Engine
  const freshData = await generateAnalyticsData(env, timeRange)
  
  // Cache in both tiers
  const cachePromises = [
    // KV cache with longer TTL
    env.DATA.put(kvCacheKey, JSON.stringify(freshData), {
      expirationTtl: getCacheTTL(timeRange) * 2
    }),
    
    // Edge cache with shorter TTL
    cache.put(edgeCacheKey, new Response(JSON.stringify(freshData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${getCacheTTL(timeRange)}`
      }
    }))
  ]
  
  event.waitUntil(Promise.all(cachePromises))
  setHeader(event, 'X-Cache', 'MISS')
  return freshData
})

function getCacheTTL(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 60      // 1 minute for hourly data
    case '24h': return 300    // 5 minutes for daily data
    case '7d': return 900     // 15 minutes for weekly data
    case '30d': return 3600   // 1 hour for monthly data
    default: return 300
  }
}
```

### Progressive Data Loading
```typescript
// composables/useAnalytics.ts - Progressive loading strategy
export const useAnalytics = () => {
  const overview = ref(null)
  const details = ref(null)
  const realtime = ref(null)
  
  // Load overview data first (cached)
  const loadOverview = async () => {
    try {
      const response = await $fetch('/api/analytics/overview', {
        query: { cache: 'preferred' }
      })
      overview.value = response.data
    } catch (error) {
      console.error('Failed to load overview:', error)
    }
  }
  
  // Load detailed data second (may be fresh)
  const loadDetails = async (timeRange: string) => {
    try {
      const response = await $fetch('/api/analytics/details', {
        query: { timeRange, cache: 'fresh-preferred' }
      })
      details.value = response.data
    } catch (error) {
      console.error('Failed to load details:', error)
    }
  }
  
  // Real-time data via SSE (no caching)
  const connectRealtime = () => {
    const eventSource = new EventSource('/api/analytics/realtime')
    
    eventSource.onmessage = (event) => {
      realtime.value = JSON.parse(event.data)
    }
    
    eventSource.onerror = () => {
      // Exponential backoff reconnection
      setTimeout(() => connectRealtime(), Math.random() * 5000 + 1000)
    }
    
    return eventSource
  }
  
  return { overview, details, realtime, loadOverview, loadDetails, connectRealtime }
}
```

### Smart Cache Invalidation
```typescript
// server/utils/analytics-cache-invalidation.ts
export class AnalyticsCacheManager {
  private env: any
  private cache: Cache
  
  constructor(env: any) {
    this.env = env
    this.cache = caches.default
  }
  
  // Invalidate cache when new analytics events arrive
  async invalidateOnNewEvent(eventType: string, timestamp: string) {
    const affectedTimeRanges = this.getAffectedTimeRanges(timestamp)
    
    const invalidationPromises = affectedTimeRanges.map(async (timeRange) => {
      // Invalidate edge cache
      const edgeCacheKey = new Request(`https://analytics.internal/analytics:${timeRange}:*`)
      await this.cache.delete(edgeCacheKey)
      
      // Invalidate KV cache
      const kvKeys = await this.env.DATA.list({ prefix: `cache:analytics:${timeRange}:` })
      const deletePromises = kvKeys.keys.map(key => this.env.DATA.delete(key.name))
      await Promise.all(deletePromises)
    })
    
    await Promise.all(invalidationPromises)
  }
  
  // Selective invalidation based on event impact
  private getAffectedTimeRanges(timestamp: string): string[] {
    const eventTime = new Date(timestamp)
    const now = new Date()
    const timeDiff = now.getTime() - eventTime.getTime()
    
    const affected = []
    
    // Always invalidate real-time data
    affected.push('realtime')
    
    // Invalidate hourly if within last hour
    if (timeDiff < 60 * 60 * 1000) {
      affected.push('1h')
    }
    
    // Invalidate daily if within last 24 hours
    if (timeDiff < 24 * 60 * 60 * 1000) {
      affected.push('24h')
    }
    
    // Weekly and monthly less frequently
    if (timeDiff < 7 * 24 * 60 * 60 * 1000) {
      affected.push('7d')
    }
    
    return affected
  }
  
  // Proactive cache warming for popular queries
  async warmPopularQueries() {
    const popularQueries = [
      { timeRange: '24h', endpoint: 'overview' },
      { timeRange: '7d', endpoint: 'overview' },
      { timeRange: '24h', endpoint: 'geographic' },
      { timeRange: '24h', endpoint: 'redirects' }
    ]
    
    const warmingPromises = popularQueries.map(async (query) => {
      try {
        await $fetch(`/api/analytics/${query.endpoint}`, {
          query: { timeRange: query.timeRange },
          headers: { 'X-Cache-Warm': 'true' }
        })
      } catch (error) {
        console.error(`Failed to warm cache for ${query.endpoint}:${query.timeRange}`, error)
      }
    })
    
    await Promise.all(warmingPromises)
  }
}
```

### Real-time Data Optimization
```typescript
// server/api/analytics/realtime.get.ts - Optimized SSE
export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  
  const env = getCloudflareEnv(event)
  
  // Use ReadableStream for efficient SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial data
      const initialData = getCachedRealtimeData(env.DATA)
      controller.enqueue(`data: ${JSON.stringify(initialData)}\n\n`)
      
      // Set up periodic updates
      const intervalId = setInterval(async () => {
        try {
          const realtimeData = await getRealtimeAnalytics(env)
          controller.enqueue(`data: ${JSON.stringify(realtimeData)}\n\n`)
        } catch (error) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
        }
      }, 5000) // Update every 5 seconds
      
      // Cleanup on close
      event.node.req.on('close', () => {
        clearInterval(intervalId)
        controller.close()
      })
    }
  })
  
  return new Response(stream)
})

// Efficient real-time data aggregation
async function getRealtimeAnalytics(env: any): Promise<any> {
  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
  
  // Get data from last 5 minutes only
  const recentEvents = await env.ANALYTICS.fetch({
    query: `
      SELECT 
        blob1 as event_type,
        double1 as timestamp,
        blob2 as endpoint,
        index1 as status_code
      FROM analytics 
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 100
    `,
    params: [fiveMinutesAgo.getTime()]
  })
  
  // Aggregate in-memory for real-time metrics
  return aggregateRealtimeMetrics(recentEvents)
}
```

## Frontend Caching Strategy (The Full-Stack Approach)

### Static Site Generation with Smart Invalidation
```typescript
// nuxt.config.ts - Enhanced SSG configuration
export default defineNuxtConfig({
  nitro: {
    prerender: {
      routes: [
        '/',           // Homepage - always prerender
        '/analytics',  // Analytics dashboard shell
        '/go'         // Redirect listing page
      ],
      ignore: [
        '/api/**',     // Don't prerender API routes
        '/go/**'       // Dynamic redirects
      ]
    },
    
    // ISR configuration
    routeRules: {
      // Homepage - static with revalidation
      '/': { 
        prerender: true,
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
      },
      
      // Analytics dashboard - hybrid approach
      '/analytics': { 
        ssr: true,
        experimentalNoScripts: false, // Need JS for interactivity
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' }
      },
      
      // API routes - selective caching as defined earlier
      '/api/health': { 
        headers: { 'Cache-Control': 'public, max-age=60' }
      },
      '/api/stats': { 
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' }
      }
    }
  }
})
```

### Progressive Enhancement with Caching
```typescript
// composables/usePageCache.ts - Client-side caching strategy
export const usePageCache = () => {
  const cacheStore = new Map()
  const cacheTTL = new Map()
  
  const getCached = <T>(key: string): T | null => {
    const expires = cacheTTL.get(key)
    if (expires && Date.now() > expires) {
      cacheStore.delete(key)
      cacheTTL.delete(key)
      return null
    }
    return cacheStore.get(key) || null
  }
  
  const setCached = <T>(key: string, data: T, ttlMs: number = 300000) => {
    cacheStore.set(key, data)
    cacheTTL.set(key, Date.now() + ttlMs)
  }
  
  const fetchWithCache = async <T>(
    url: string, 
    options: RequestInit = {},
    cacheTTL: number = 300000
  ): Promise<T> => {
    const cacheKey = `${url}:${JSON.stringify(options)}`
    
    // Try cache first
    const cached = getCached<T>(cacheKey)
    if (cached) {
      return cached
    }
    
    // Fetch fresh data
    const response = await $fetch<T>(url, options)
    setCached(cacheKey, response, cacheTTL)
    
    return response
  }
  
  return { getCached, setCached, fetchWithCache }
}
```

### Service Worker Cache Strategy
```typescript
// public/sw.js - Advanced service worker caching
const CACHE_NAME = 'next-dave-io-v1'
const STATIC_CACHE = 'static-v1'
const API_CACHE = 'api-v1'

// Cache strategies by route type
const cacheStrategies = {
  // Static assets - cache first
  static: (request) => caches.match(request).then(response => 
    response || fetch(request).then(fetchResponse => {
      const responseClone = fetchResponse.clone()
      caches.open(STATIC_CACHE).then(cache => cache.put(request, responseClone))
      return fetchResponse
    })
  ),
  
  // API routes - network first with fallback
  api: (request) => fetch(request).then(response => {
    const responseClone = response.clone()
    
    // Only cache successful responses
    if (response.ok) {
      caches.open(API_CACHE).then(cache => {
        // Respect cache headers
        const cacheControl = response.headers.get('cache-control')
        if (!cacheControl?.includes('no-cache')) {
          cache.put(request, responseClone)
        }
      })
    }
    
    return response
  }).catch(() => caches.match(request)), // Fallback to cache on network failure
  
  // Pages - stale while revalidate
  page: (request) => {
    return caches.match(request).then(response => {
      const fetchPromise = fetch(request).then(fetchResponse => {
        const responseClone = fetchResponse.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone))
        return fetchResponse
      })
      
      return response || fetchPromise
    })
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)
  
  // Route to appropriate strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(cacheStrategies.api(request))
  } else if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$/)) {
    event.respondWith(cacheStrategies.static(request))
  } else {
    event.respondWith(cacheStrategies.page(request))
  }
})
```

### Component-Level Caching
```vue
<!-- components/CachedAnalyticsChart.vue -->
<template>
  <div>
    <canvas ref="chartCanvas" v-if="chartData" />
    <div v-else class="loading-skeleton" />
  </div>
</template>

<script setup lang="ts">
interface Props {
  timeRange: string
  chartType: string
  refreshInterval?: number
}

const props = withDefaults(defineProps<Props>(), {
  refreshInterval: 300000 // 5 minutes default
})

const chartData = ref(null)
const lastFetch = ref(0)
const { fetchWithCache } = usePageCache()

// Smart cache key including component props
const cacheKey = computed(() => 
  `chart:${props.chartType}:${props.timeRange}:${Math.floor(Date.now() / props.refreshInterval)}`
)

const loadChartData = async () => {
  try {
    const data = await fetchWithCache(
      `/api/analytics/charts/${props.chartType}`,
      { query: { timeRange: props.timeRange } },
      props.refreshInterval
    )
    
    chartData.value = data
    lastFetch.value = Date.now()
  } catch (error) {
    console.error('Failed to load chart data:', error)
  }
}

// Load data on mount and when props change
watch(() => [props.timeRange, props.chartType], loadChartData, { immediate: true })

// Optional: Auto-refresh with exponential backoff
const refreshTimer = ref(null)
onMounted(() => {
  if (props.refreshInterval > 0) {
    refreshTimer.value = setInterval(() => {
      // Only refresh if tab is visible
      if (document.visibilityState === 'visible') {
        loadChartData()
      }
    }, props.refreshInterval)
  }
})

onUnmounted(() => {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
  }
})
</script>
```

## Headers & Compression (The Details That Matter)

### Advanced Compression Strategy
```typescript
// server/middleware/compression.ts
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const acceptEncoding = getHeader(event, 'accept-encoding') || ''
  
  // Determine optimal compression based on content type and client support
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.json')) {
    // JSON APIs - prefer Brotli for better compression ratios
    if (acceptEncoding.includes('br')) {
      setHeader(event, 'Content-Encoding', 'br')
      setHeader(event, 'Vary', 'Accept-Encoding')
    } else if (acceptEncoding.includes('gzip')) {
      setHeader(event, 'Content-Encoding', 'gzip')
      setHeader(event, 'Vary', 'Accept-Encoding')
    }
  }
  
  // Static assets compression headers
  if (url.pathname.match(/\.(js|css|html|xml|json|txt)$/)) {
    setHeader(event, 'Vary', 'Accept-Encoding')
  }
})
```

### Content-Type Specific Headers
```typescript
// server/utils/content-headers.ts
export const ContentTypeHeaders = {
  // JavaScript assets
  'application/javascript': {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'application/javascript; charset=utf-8'
  },
  
  // CSS assets  
  'text/css': {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'text/css; charset=utf-8'
  },
  
  // Images
  'image/webp': {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'image/webp'
  },
  'image/avif': {
    'Cache-Control': 'public, max-age=31536000, immutable', 
    'Content-Type': 'image/avif'
  },
  
  // Fonts
  'font/woff2': {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'font/woff2',
    'Cross-Origin-Resource-Policy': 'cross-origin'
  },
  
  // API responses
  'application/json': {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  },
  
  // HTML pages
  'text/html': {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0'
  }
} as const

export function setContentTypeHeaders(event: H3Event, contentType: keyof typeof ContentTypeHeaders) {
  const headers = ContentTypeHeaders[contentType]
  if (headers) {
    setHeaders(event, headers)
  }
}
```

### Security Headers Optimization
```typescript
// server/middleware/security-headers.ts
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  
  // Base security headers for all responses
  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0', // Modern browsers prefer CSP
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  }
  
  // API-specific headers
  if (url.pathname.startsWith('/api/')) {
    setHeaders(event, {
      ...baseHeaders,
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      'X-Robots-Tag': 'noindex, nofollow'
    })
  } else {
    // Page-specific CSP
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://analytics.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
    
    setHeaders(event, {
      ...baseHeaders,
      'Content-Security-Policy': csp
    })
  }
})
```

### CORS Optimization
```typescript
// server/middleware/optimized-cors.ts
export default defineEventHandler(async (event) => {
  if (!event.node.req.url?.startsWith('/api/')) return
  
  const origin = getHeader(event, 'origin')
  const method = getMethod(event)
  
  // Optimized CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-API-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours preflight cache
    'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
  }
  
  // Origin validation with whitelist
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173', 
    'https://dave.io',
    'https://next.dave.io'
  ]
  
  if (origin && allowedOrigins.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  } else {
    corsHeaders['Access-Control-Allow-Origin'] = 'null'
  }
  
  setHeaders(event, corsHeaders)
  
  // Handle preflight with extended cache
  if (method === 'OPTIONS') {
    setResponseStatus(event, 204)
    setHeader(event, 'Content-Length', '0')
    return ''
  }
})
```

### Response Size Optimization
```typescript
// server/utils/response-optimization.ts
export function optimizeResponseSize(data: any, request: H3Event): any {
  const acceptHeader = getHeader(request, 'accept') || ''
  const userAgent = getHeader(request, 'user-agent') || ''
  
  // Mobile optimization - reduce data payload
  const isMobile = /mobile/i.test(userAgent)
  if (isMobile && data && typeof data === 'object') {
    return optimizeForMobile(data)
  }
  
  // API format optimization
  if (acceptHeader.includes('application/json')) {
    return removeNullValues(data)
  }
  
  return data
}

function optimizeForMobile(data: any): any {
  if (Array.isArray(data)) {
    // Limit array sizes for mobile
    return data.slice(0, 50).map(item => optimizeForMobile(item))
  }
  
  if (data && typeof data === 'object') {
    const optimized: any = {}
    
    // Remove less critical fields for mobile
    const criticalFields = ['id', 'name', 'value', 'timestamp', 'url', 'title']
    
    for (const [key, value] of Object.entries(data)) {
      if (criticalFields.includes(key) || key.startsWith('_')) {
        optimized[key] = optimizeForMobile(value)
      }
    }
    
    return optimized
  }
  
  return data
}

function removeNullValues(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeNullValues).filter(item => item !== null && item !== undefined)
  }
  
  if (obj && typeof obj === 'object') {
    const cleaned: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        cleaned[key] = removeNullValues(value)
      }
    }
    return cleaned
  }
  
  return obj
}
```

### HTTP/2 Push Optimization
```typescript
// server/middleware/http2-push.ts
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  
  // HTTP/2 Server Push for critical resources
  if (url.pathname === '/' || url.pathname === '/analytics') {
    const pushResources = [
      '/_fonts/sixtyfour-convergence-400-normal.woff2',
      '/assets/main.css',
      '/assets/app.js'
    ]
    
    // Add Link headers for HTTP/2 Push
    const linkHeaders = pushResources.map(resource => 
      `<${resource}>; rel=preload; as=${getResourceType(resource)}`
    ).join(', ')
    
    setHeader(event, 'Link', linkHeaders)
  }
})

function getResourceType(url: string): string {
  if (url.endsWith('.woff2')) return 'font'
  if (url.endsWith('.css')) return 'style'
  if (url.endsWith('.js')) return 'script'
  if (url.match(/\.(png|jpg|jpeg|gif|webp|avif)$/)) return 'image'
  return 'fetch'
}
```

## Smart Placement & Regional Optimization

**Current Status**: Using `"placement": {"mode": "smart"}` ✓

### Regional KV Strategies
```typescript
// server/utils/regional-optimization.ts
export class RegionalOptimizer {
  private getRegionalKVKey(baseKey: string, country: string): string {
    const region = this.getRegionFromCountry(country)
    return `${region}:${baseKey}`
  }
  
  private getRegionFromCountry(country: string): string {
    const regions = {
      'US': 'nam', 'CA': 'nam', 'MX': 'nam',
      'GB': 'eur', 'DE': 'eur', 'FR': 'eur', 'IT': 'eur', 'ES': 'eur',
      'JP': 'apac', 'SG': 'apac', 'AU': 'apac', 'KR': 'apac',
      'BR': 'latam', 'AR': 'latam', 'CL': 'latam'
    }
    return regions[country] || 'global'
  }
  
  async getRegionalData(kv: KVNamespace, key: string, country: string): Promise<string | null> {
    // Try regional cache first
    const regionalKey = this.getRegionalKVKey(key, country)
    const regionalData = await kv.get(regionalKey)
    
    if (regionalData) {
      return regionalData
    }
    
    // Fallback to global cache
    return kv.get(key)
  }
  
  async setRegionalData(kv: KVNamespace, key: string, value: string, country: string, ttl?: number): Promise<void> {
    const regionalKey = this.getRegionalKVKey(key, country)
    
    const promises = [
      kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined),
      kv.put(regionalKey, value, ttl ? { expirationTtl: ttl * 2 } : undefined) // Regional cache lives longer
    ]
    
    await Promise.all(promises)
  }
}
```

### Edge-Side Personalization
```typescript
// server/middleware/edge-personalization.ts
export default defineEventHandler(async (event) => {
  const cfInfo = getCloudflareRequestInfo(event)
  const url = getRequestURL(event)
  
  // Only personalize specific routes
  if (!url.pathname.startsWith('/api/analytics')) return
  
  // Create personalization context
  const context = {
    country: cfInfo.country,
    datacenter: cfInfo.datacenter,
    timezone: cfInfo.timezone,
    isMobile: /mobile/i.test(cfInfo.userAgent)
  }
  
  // Add to event context for use in handlers
  event.context.personalization = context
  
  // Set regional cache headers
  setHeader(event, 'CF-Cache-Status', cfInfo.cacheStatus || 'UNKNOWN')
  setHeader(event, 'CF-Ray', cfInfo.ray)
  setHeader(event, 'Vary', 'CF-IPCountry, User-Agent')
})
```

### Performance Monitoring & Metrics
```typescript
// server/utils/performance-monitoring.ts
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map()
  
  startTiming(key: string): () => number {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      this.recordMetric(key, duration)
      return duration
    }
  }
  
  recordMetric(key: string, value: number): void {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, [])
    }
    
    const values = this.metrics.get(key)!
    values.push(value)
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift()
    }
  }
  
  getMetrics(key: string): { avg: number; p95: number; p99: number } | null {
    const values = this.metrics.get(key)
    if (!values || values.length === 0) return null
    
    const sorted = [...values].sort((a, b) => a - b)
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    
    return { avg, p95, p99 }
  }
  
  async flushToAnalytics(env: any): Promise<void> {
    const allMetrics = []
    
    for (const [key, values] of this.metrics.entries()) {
      const stats = this.getMetrics(key)
      if (stats) {
        allMetrics.push({
          type: 'performance',
          timestamp: new Date().toISOString(),
          data: {
            metric: key,
            avg: stats.avg,
            p95: stats.p95,
            p99: stats.p99,
            count: values.length
          }
        })
      }
    }
    
    if (allMetrics.length > 0 && env.ANALYTICS) {
      await writeAnalytics(true, env.ANALYTICS, env.DATA, allMetrics, [])
    }
  }
}

// Global performance monitor
export const perfMonitor = new PerformanceMonitor()
```

## Cache Hit Rate Monitoring
```typescript
// server/utils/cache-monitoring.ts
export class CacheMonitor {
  private hits = 0
  private misses = 0
  private lastReset = Date.now()
  
  recordHit(cacheType: 'edge' | 'kv' | 'memory'): void {
    this.hits++
    this.logCacheEvent('HIT', cacheType)
  }
  
  recordMiss(cacheType: 'edge' | 'kv' | 'memory'): void {
    this.misses++
    this.logCacheEvent('MISS', cacheType)
  }
  
  getHitRate(): number {
    const total = this.hits + this.misses
    return total === 0 ? 0 : this.hits / total
  }
  
  getStats(): { hits: number; misses: number; hitRate: number; uptime: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      uptime: Date.now() - this.lastReset
    }
  }
  
  reset(): void {
    this.hits = 0
    this.misses = 0
    this.lastReset = Date.now()
  }
  
  private logCacheEvent(type: 'HIT' | 'MISS', cacheType: string): void {
    console.log(`[CACHE-${type}] ${cacheType} | Rate: ${(this.getHitRate() * 100).toFixed(1)}%`)
  }
}

export const cacheMonitor = new CacheMonitor()
```

## The Implementation Roadmap

### Phase 1: Quick Wins (1-2 hours)
1. **Static asset cache headers** - Add route rules to `nuxt.config.ts`
2. **Health/ping endpoint caching** - 60-second cache headers
3. **Font optimization basics** - Self-host fonts with proper cache headers
4. **Basic compression** - Enable Brotli/Gzip in Cloudflare dashboard

### Phase 2: API Optimization (2-4 hours)
1. **Tiered API caching strategy** - Edge + KV + Analytics Engine
2. **Redirect performance improvements** - 15-minute edge cache for popular slugs
3. **Analytics data caching** - Stale-while-revalidate pattern
4. **Conditional caching logic** - Auth-aware cache decisions

### Phase 3: Advanced Optimization (4-8 hours)
1. **ISR implementation** - Incremental Static Regeneration for pages
2. **Regional optimization** - Country-specific KV caching
3. **Advanced compression and headers** - Content-type specific optimization
4. **Service Worker caching** - Client-side cache strategies

### Phase 4: Monitoring & Tuning (ongoing)
1. **Cache hit rate monitoring** - Real-time cache performance tracking
2. **Performance metrics tracking** - P95/P99 response time monitoring
3. **User experience optimization** - Core Web Vitals improvement
4. **A/B testing** - Cache strategy effectiveness measurement

## Cache Strategy Summary

| Content Type | Cache Location | TTL | Strategy |
|--------------|----------------|-----|----------|
| **Static Assets** | Edge + Browser | 1 year | Immutable with versioning |
| **API Health** | Edge | 60s | Simple cache |
| **API Stats** | Edge + KV | 5min | Stale-while-revalidate |
| **Redirects** | Edge + KV | 15min | Popular redirects only |
| **Analytics** | Edge + KV | 1-5min | Tiered by time range |
| **Pages** | Edge | 1hr | ISR with SWR |
| **Fonts** | Edge + Browser | 1 year | Preload + immutable |

## The Reality Check

Most of these optimizations will give you marginal gains in the grand scheme of things, but they're the kind of marginal gains that separate a professional implementation from a hobby project. Plus, your users (all 12 of them) will appreciate the snappier experience.

The key is implementing them incrementally and measuring the impact. Start with the obvious wins (static assets, health endpoints), then move to the more complex optimizations based on actual usage patterns.

**Performance Impact Expectations**:
- Static assets: 90% faster (cache hits)
- API responses: 60-80% faster (stale-while-revalidate)
- Page loads: 30-50% faster (ISR + preloading)
- Redirects: 85% faster (edge caching)

Remember: premature optimization is the root of all evil, but intelligent caching is just good engineering.

## Next Steps

1. **Implement Phase 1** optimizations first
2. **Measure baseline performance** before changes
3. **Monitor cache hit rates** after implementation
4. **Iterate based on real usage patterns**
5. **Document what works** (and what doesn't)

The best CDN optimization is the one that's actually implemented and measured, not the most theoretically perfect one.
