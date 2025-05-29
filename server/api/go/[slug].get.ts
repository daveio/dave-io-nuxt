import { createApiResponse, createApiError } from "~/server/utils/response"
import { UrlRedirectSchema } from "~/server/utils/schemas"

// Simulated redirect database - in production this would be KV storage
const redirects = new Map<string, any>([
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

    // Get redirect from storage
    const redirectData = redirects.get(slug)
    if (!redirectData) {
      createApiError(404, `Redirect not found for slug: ${slug}`)
    }

    // Validate redirect data
    const redirect = UrlRedirectSchema.parse(redirectData)

    // Increment click count (in production, this would update KV storage)
    redirect.clicks++
    redirects.set(slug, {
      ...redirect,
      updated_at: new Date().toISOString()
    })

    // Log analytics (in production, this would write to Analytics Engine)
    const userAgent = getHeader(event, "user-agent") || "unknown"
    const ip = getClientIP(event) || getHeader(event, "cf-connecting-ip") || "unknown"
    const cfCountry = getHeader(event, "cf-ipcountry") || "unknown"
    const cfRay = getHeader(event, "cf-ray") || "unknown"

    console.log(
      `[REDIRECT] ${slug} -> ${redirect.url} | IP: ${ip} | Country: ${cfCountry} | Ray: ${cfRay} | UA: ${userAgent}`
    )

    // Perform redirect (302 Found)
    return sendRedirect(event, redirect.url, 302)
  } catch (error: any) {
    console.error("Redirect error:", error)

    // Re-throw API errors
    if (error.statusCode) {
      throw error
    }

    createApiError(500, "Redirect failed")
  }
})
