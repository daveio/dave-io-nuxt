import { getHeader, sendRedirect } from "h3"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { UrlRedirectSchema } from "~/server/utils/schemas"

// Simulated redirect database - in production this would be KV storage
const redirects = new Map<
  string,
  {
    slug: string
    url: string
    title?: string
    description?: string
    clicks: number
    created_at: string
    updated_at: string
  }
>([
  [
    "gh",
    {
      slug: "gh",
      url: "https://github.com/daveio",
      title: "Dave Williams on GitHub",
      description: "My GitHub profile",
      clicks: 42,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-15T12:00:00Z"
    }
  ],
  [
    "tw",
    {
      slug: "tw",
      url: "https://twitter.com/daveio",
      title: "Dave Williams on Twitter",
      description: "My Twitter profile",
      clicks: 28,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-10T08:30:00Z"
    }
  ],
  [
    "li",
    {
      slug: "li",
      url: "https://linkedin.com/in/daveio",
      title: "Dave Williams on LinkedIn",
      description: "My LinkedIn profile",
      clicks: 15,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-05T14:20:00Z"
    }
  ]
])

export default defineEventHandler(async (event) => {
  try {
    const slug = getRouterParam(event, "slug")

    if (!slug) {
      createApiError(400, "Slug parameter is required")
    }

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; ANALYTICS?: AnalyticsEngineDataset }

    // Get redirect from KV storage first, fallback to in-memory
    let redirectData:
      | {
          slug: string
          url: string
          title?: string
          description?: string
          clicks: number
          created_at: string
          updated_at: string
        }
      | undefined
    const redirectKey = `redirect:${slug}`

    if (env?.DATA) {
      try {
        const kvData = await env.DATA.get(redirectKey)
        if (kvData) {
          redirectData = JSON.parse(kvData)
        } else {
          // Fallback to in-memory data and store in KV for future use
          const fallbackData = redirects.get(slug)
          if (fallbackData) {
            redirectData = fallbackData
            // Store in KV for next time
            await env.DATA.put(redirectKey, JSON.stringify(fallbackData))
          }
        }
      } catch (error) {
        console.error("KV redirect lookup failed:", error)
        redirectData = redirects.get(slug)
      }
    } else {
      // No KV available, use in-memory
      redirectData = redirects.get(slug)
    }

    if (!redirectData) {
      createApiError(404, `Redirect not found for slug: ${slug}`)
    }

    // Validate redirect data
    const redirect = UrlRedirectSchema.parse(redirectData)

    // Increment click count in KV or in-memory
    const clickCount = (redirect.clicks || 0) + 1
    const updatedRedirect = {
      ...redirect,
      clicks: clickCount,
      updated_at: new Date().toISOString()
    }

    if (env?.DATA) {
      try {
        await env.DATA.put(redirectKey, JSON.stringify(updatedRedirect))
      } catch (error) {
        console.error("Failed to update redirect in KV:", error)
      }
    } else {
      redirects.set(slug, updatedRedirect)
    }

    // Log analytics to Analytics Engine
    const userAgent = getHeader(event, "user-agent") || "unknown"
    const ip = getHeader(event, "cf-connecting-ip") || getHeader(event, "x-forwarded-for") || "unknown"
    const cfCountry = getHeader(event, "cf-ipcountry") || "unknown"
    const cfRay = getHeader(event, "cf-ray") || "unknown"

    if (env?.ANALYTICS) {
      try {
        env.ANALYTICS.writeDataPoint({
          blobs: [slug, redirect.url, userAgent, ip, cfCountry, cfRay],
          doubles: [1], // Click count
          indexes: [slug] // For querying by slug
        })
      } catch (error) {
        console.error("Failed to write analytics:", error)
      }
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
