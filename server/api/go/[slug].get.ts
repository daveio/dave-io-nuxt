import { getHeader, sendRedirect } from "h3"
import { writeAnalytics } from "~/server/utils/analytics"
import { getCloudflareEnv, getCloudflareRequestInfo, getKVNamespace } from "~/server/utils/cloudflare"
import { createApiError, isApiError, logRequest } from "~/server/utils/response"
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
        } catch {
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
        kv
          .get("metrics:redirect:total:clicks")
          .then(async (totalStr) => {
            const currentTotal = Number.parseInt(totalStr || "0", 10)
            await kv.put("metrics:redirect:total:clicks", (currentTotal + 1).toString())
          })
      ])
    } catch (error) {
      console.error("Failed to update redirect metrics in KV:", error)
      // Continue with redirect even if click tracking fails
    }

    // Write analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)

      const analyticsEvent = {
        type: "redirect" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          slug: slug,
          targetUrl: redirect.url,
          clickCount: clickCount,
          title: redirect.title
        }
      }

      const kvCounters = [
        { key: "redirect:total:clicks" },
        { key: `redirect:${slug}:clicks`, value: clickCount },
        { key: `redirect:targets:${redirect.url.replace(/[^a-z0-9]/g, "-")}` },
        { key: `redirect:countries:${cfInfo.country.toLowerCase()}` },
        { key: `redirect:daily:${new Date().toISOString().split("T")[0]}` }
      ]

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (error) {
      console.error("Failed to write analytics:", error)
      // Continue with redirect even if analytics fails
    }

    // Log redirect request
    logRequest(event, `go/${slug}`, "GET", 302, {
      target: redirect.url,
      clicks: clickCount,
      cached: "hit"
    })

    // Perform redirect (302 Found)
    return sendRedirect(event, redirect.url, 302)
  } catch (error: unknown) {
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500

    // Log failed redirect request
    logRequest(event, `go/${slug || "unknown"}`, "GET", statusCode, {
      error: isApiError(error) ? (error as any).statusMessage || "Unknown error" : "Internal error"
    })

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Redirect failed")
  }
})
