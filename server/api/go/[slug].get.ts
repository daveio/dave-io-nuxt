import { getHeader, sendRedirect } from "h3"
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
    const env = event.context.cloudflare?.env as { 
      KV?: KVNamespace
      ANALYTICS?: AnalyticsEngineDataset 
    }

    if (!env?.KV || !env?.ANALYTICS) {
      throw createApiError(503, "Redirect service not available")
    }

    const slug = getRouterParam(event, "slug")

    if (!slug) {
      throw createApiError(400, "Slug parameter is required")
    }

    // Get redirect from KV storage
    const redirectKey = `redirect:${slug}`
    let redirectData: RedirectData | undefined

    try {
      const kvData = await env.KV.get(redirectKey)
      if (kvData) {
        redirectData = JSON.parse(kvData)
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

    // Increment click count in KV
    const clickCount = (redirect.clicks || 0) + 1
    const updatedRedirect = {
      ...redirect,
      clicks: clickCount,
      updated_at: new Date().toISOString()
    }

    try {
      await env.KV.put(redirectKey, JSON.stringify(updatedRedirect))
    } catch (error) {
      console.error("Failed to update redirect in KV:", error)
      // Continue with redirect even if click tracking fails
    }

    // Log analytics to Analytics Engine
    const userAgent = getHeader(event, "user-agent") || "unknown"
    const ip = getHeader(event, "cf-connecting-ip") || getHeader(event, "x-forwarded-for") || "unknown"
    const cfCountry = getHeader(event, "cf-ipcountry") || "unknown"
    const cfRay = getHeader(event, "cf-ray") || "unknown"

    try {
      env.ANALYTICS.writeDataPoint({
        blobs: [slug, redirect.url, userAgent, ip, cfCountry, cfRay],
        doubles: [1], // Click count
        indexes: [slug] // For querying by slug
      })
    } catch (error) {
      console.error("Failed to write analytics:", error)
      // Continue with redirect even if analytics fails
    }

    console.log(
      `[REDIRECT] ${slug} -> ${redirect.url} | IP: ${ip} | Country: ${cfCountry} | Ray: ${cfRay} | UA: ${userAgent}`
    )

    // Perform redirect (302 Found)
    return sendRedirect(event, redirect.url, 302)
  } catch (error: unknown) {
    console.error("Redirect error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Redirect failed")
  }
})
