import { checkRateLimit, getRateLimitInfo } from '~/server/utils/response'

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  try {
    const method = getMethod(event)
    const url = event.node.req.url
    const userAgent = getHeader(event, 'user-agent') || 'unknown'
    const ip = getClientIP(event) || getHeader(event, 'cf-connecting-ip') || 'unknown'
    const cfRay = getHeader(event, 'cf-ray') || 'unknown'
    const cfCountry = getHeader(event, 'cf-ipcountry') || 'unknown'
    
    // Check rate limiting
    const rateLimitKey = `${ip}:${method}:${url}`
    if (!checkRateLimit(rateLimitKey, 100, 60000)) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests',
        data: {
          error: 'Rate limit exceeded',
          retry_after: 60,
          timestamp: new Date().toISOString()
        }
      })
    }
    
    const rateLimitInfo = getRateLimitInfo(rateLimitKey)
    
    // Add request logging for API routes (with CF info)
    console.log(`[${new Date().toISOString()}] ${method} ${url} - IP: ${ip} - Country: ${cfCountry} - Ray: ${cfRay} - UA: ${userAgent}`)
    
    // Add security headers
    setHeaders(event, {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 
      'X-XSS-Protection': '0', // Modern browsers don't need this, can cause issues
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-API-Version': '1.0.0',
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': Math.floor(rateLimitInfo.resetTime / 1000).toString(),
      'X-Worker-Environment': 'cloudflare'
    })
    
    // Remove sensitive headers
    removeHeader(event, 'X-Powered-By')
    removeHeader(event, 'Server')
    
  } catch (error: any) {
    console.error('Middleware error:', error)
    
    // Re-throw rate limit errors
    if (error.statusCode === 429) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        error: 'Middleware processing failed',
        timestamp: new Date().toISOString()
      }
    })
  }
})