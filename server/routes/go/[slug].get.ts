import { setHeader, setResponseStatus } from "h3"
import { getCloudflareEnv, getCloudflareRequestInfo, getKVNamespace } from "~/server/utils/cloudflare"
import { createRedirectKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
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

    // Get redirect from KV storage using kebab-case keys
    const redirectUrlKey = `redirect:${slug}:url`
    const redirectClicksKey = `redirect:${slug}:clicks`
    const redirectCreatedKey = `redirect:${slug}:created-at`
    const redirectUpdatedKey = `redirect:${slug}:updated-at`

    let redirectData: RedirectData | undefined

    try {
      const [url, clicksStr, createdAt, updatedAt] = await Promise.all([
        kv.get(redirectUrlKey),
        kv.get(redirectClicksKey),
        kv.get(redirectCreatedKey),
        kv.get(redirectUpdatedKey)
      ])

      if (url) {
        redirectData = {
          slug: slug,
          url: url,
          clicks: Number.parseInt(clicksStr || "0", 10),
          created_at: createdAt || new Date().toISOString(),
          updated_at: updatedAt || new Date().toISOString()
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

    // Update redirect click metrics using kebab-case keys
    const clickCount = (redirect.clicks || 0) + 1
    const updatedAt = new Date().toISOString()

    try {
      // Store redirect data using kebab-case colon-separated keys with simple values
      await Promise.all([
        kv.put(redirectClicksKey, clickCount.toString()),
        kv.put(redirectUpdatedKey, updatedAt),
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

    // Write KV metrics
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      const kv = getKVNamespace(env)

      const kvCounters = createRedirectKVCounters(
        slug,
        redirect.url,
        1, // Single click increment
        cfInfo,
        [
          { key: `redirect:${slug}:clicks`, value: clickCount },
          { key: `redirect:daily:${new Date().toISOString().split("T")[0]}` }
        ]
      )

      await writeKVMetrics(kv, kvCounters)
    } catch (error) {
      console.error("Failed to write redirect KV metrics:", error)
      // Continue with redirect even if metrics fails
    }

    // Log redirect request
    logRequest(event, `go/${slug}`, "GET", 302, {
      target: redirect.url,
      clicks: clickCount,
      cached: "hit"
    })

    // Perform redirect (302 Found)
    setResponseStatus(event, 302)
    setHeader(event, "Location", redirect.url)
    return
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusCode property exists
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    const slug = getRouterParam(event, "slug")

    // Log failed redirect request
    logRequest(event, `go/${slug || "unknown"}`, "GET", statusCode, {
      // biome-ignore lint/suspicious/noExplicitAny: isApiError type guard ensures statusMessage property exists
      error: isApiError(error) ? (error as any).statusMessage || "Unknown error" : "Internal error"
    })

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Redirect failed")
  }
})
