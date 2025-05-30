import { getHeader, sendRedirect, setHeader, setResponseStatus } from "h3"
import { getCloudflareRequestInfo, getCloudflareEnv, getKVNamespace, getAnalyticsBinding } from "~/server/utils/cloudflare"
import { createApiError, isApiError } from "~/server/utils/response"
import { UrlRedirectSchema } from "~/server/utils/schemas"

interface RedirectData {
  slug: string
  url: string
  title?: string
  description?: string
  clicks: number
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  try {
    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)
    const analytics = getAnalyticsBinding(env)

    const slug = getRouterParam(event, "slug")

    if (!slug) {
      throw createApiError(400, "Slug parameter is required")
    }

    // Get redirect from KV storage
    const redirectKey = `redirect:${slug}`
    let redirectData: RedirectData | undefined

    try {
      const kvData = await kv.get(redirectKey)
      if (kvData) {
        // Handle both formats: simple string or full object
        try {
          redirectData = JSON.parse(kvData)
        } catch (parseError) {
          // If JSON parsing fails, treat as simple string URL
          redirectData = {
            slug: slug,
            url: kvData,
            clicks: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
      }
    } catch (error) {
      console.error("KV redirect lookup failed:", error)
      throw createApiError(500, "Failed to lookup redirect")
    }

    if (!redirectData) {
      throw createApiError(404, `Redirect not found for slug: ${slug}`)
    }

    // Validate redirect data
    const redirect = UrlRedirectSchema.parse(redirectData)

    // Update redirect click metrics in BOTH KV (for metrics endpoint) and Analytics Engine
    const clickCount = (redirect.clicks || 0) + 1
    const updatedRedirect = {
      ...redirect,
      clicks: clickCount,
      updated_at: new Date().toISOString()
    }

    try {
      // Store redirect data as JSON (exception for unknown object size)
      await kv.put(redirectKey, JSON.stringify(updatedRedirect))
      
      // Also store click metrics in hierarchical KV keys for metrics endpoint
      await Promise.all([
        kv.put(`metrics:redirect:${slug}:clicks`, clickCount.toString()),
        // Update total redirect clicks
        kv.get("metrics:redirect:total:clicks").then(async (totalStr) => {
          const currentTotal = parseInt(totalStr || "0", 10)
          await kv.put("metrics:redirect:total:clicks", (currentTotal + 1).toString())
        })
      ])
    } catch (error) {
      console.error("Failed to update redirect metrics in KV:", error)
      // Continue with redirect even if click tracking fails
    }

    // Write analytics data to Analytics Engine
    const cfInfo = getCloudflareRequestInfo(event)
    try {
      analytics.writeDataPoint({
        blobs: ["redirect", slug, redirect.url, cfInfo.userAgent, cfInfo.ip, cfInfo.country, cfInfo.ray],
        doubles: [1], // Click count
        indexes: ["redirect", slug] // For querying redirects and by slug
      })
    } catch (error) {
      console.error("Failed to write analytics:", error)
      // Continue with redirect even if analytics fails
    }

    console.log(
      `[REDIRECT] ${slug} -> ${redirect.url} | IP: ${cfInfo.ip} | Country: ${cfInfo.country} | Ray: ${cfInfo.ray} | UA: ${cfInfo.userAgent}`
    )

    // Perform redirect (302 Found)
    setResponseStatus(event, 302)
    setHeader(event, 'Location', redirect.url)
    return
  } catch (error: unknown) {
    console.error("Redirect error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Redirect failed")
  }
})