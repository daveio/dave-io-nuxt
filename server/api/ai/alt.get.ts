import { authorizeEndpoint } from "~/server/utils/auth"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

// Rate limiting storage (in production this would be KV)
const rateLimitStorage = new Map<string, { count: number; resetTime: number }>()

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  const maxRequests = 100 // 100 requests per hour

  const key = `ai:alt:${userId}`
  let data = rateLimitStorage.get(key)

  if (!data || now > data.resetTime) {
    // Reset the counter
    data = { count: 0, resetTime: now + hourMs }
  }

  data.count++
  rateLimitStorage.set(key, data)

  return {
    allowed: data.count <= maxRequests,
    remaining: Math.max(0, maxRequests - data.count),
    resetTime: new Date(data.resetTime)
  }
}

async function validateAndFetchImage(imageUrl: string): Promise<ArrayBuffer> {
  try {
    // Validate URL format
    new URL(imageUrl)
  } catch {
    throw createApiError(400, "Invalid URL format")
  }

  // Fetch the image
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "dave.io/1.0 (AI Alt Text Bot)"
    }
  })

  if (!response.ok) {
    throw createApiError(400, `Failed to fetch image: ${response.status} ${response.statusText}`)
  }

  // Check content type
  const contentType = response.headers.get("content-type") || ""
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"]

  if (!validTypes.some((type) => contentType.includes(type))) {
    throw createApiError(400, `Unsupported image type: ${contentType}`)
  }

  // Check file size (4MB limit)
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number.parseInt(contentLength) > 4 * 1024 * 1024) {
    throw createApiError(400, "Image too large (max 4MB)")
  }

  const imageBuffer = await response.arrayBuffer()

  // Double-check size after download
  if (imageBuffer.byteLength > 4 * 1024 * 1024) {
    throw createApiError(400, "Image too large (max 4MB)")
  }

  return imageBuffer
}

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for AI alt text generation
    const authFunc = await authorizeEndpoint("ai", "alt")
    const auth = await authFunc(event)
    if (!auth.success) {
      throw createApiError(401, auth.error || "Unauthorized")
    }

    const query = getQuery(event)
    const imageUrl = query.image as string

    if (!imageUrl) {
      throw createApiError(400, "Image URL is required (image parameter)")
    }

    // Check rate limiting
    const userId = auth.payload?.jti || auth.payload?.sub || "anonymous"
    const rateLimit = await checkRateLimit(userId)

    if (!rateLimit.allowed) {
      setHeader(event, "X-RateLimit-Limit", "100")
      setHeader(event, "X-RateLimit-Remaining", "0")
      setHeader(event, "X-RateLimit-Reset", rateLimit.resetTime.toISOString())
      throw createApiError(429, "Rate limit exceeded. Maximum 100 requests per hour.")
    }

    // Set rate limit headers
    setHeader(event, "X-RateLimit-Limit", "100")
    setHeader(event, "X-RateLimit-Remaining", rateLimit.remaining.toString())
    setHeader(event, "X-RateLimit-Reset", rateLimit.resetTime.toISOString())

    // Validate and fetch image
    const processingStart = Date.now()
    const imageBuffer = await validateAndFetchImage(imageUrl)

    // Simulate AI processing - in production this would use Cloudflare AI
    // const result = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
    //   image: Array.from(new Uint8Array(imageBuffer)),
    //   prompt: 'Describe this image in detail for use as alt text. Focus on the main subjects, actions, and important visual elements that would help someone understand the image content. Be concise but descriptive.'
    // })

    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000))

    const processingTime = Date.now() - processingStart

    // Simulated AI response
    const altTexts = [
      "A person standing in front of a modern building with glass windows and reflective surfaces",
      "A close-up view of colorful flowers blooming in a garden with green foliage",
      "A computer screen displaying code with syntax highlighting in a dark theme",
      "A group of people having a collaborative discussion around a conference table",
      "A landscape view showing mountains in the background with pine trees in the foreground",
      "A domestic cat sitting on a windowsill looking outside at the street",
      "A plate of food with fresh vegetables and main course arranged in an artistic presentation",
      "A person using a smartphone while sitting at a cafe with a coffee cup nearby"
    ]

    const altText = altTexts[Math.floor(Math.random() * altTexts.length)]

    return createApiResponse(
      {
        altText,
        imageSource: imageUrl,
        model: "@cf/llava-hf/llava-1.5-7b-hf",
        timestamp: new Date().toISOString(),
        processingTimeMs: processingTime,
        imageSizeBytes: imageBuffer.byteLength,
        rateLimit: {
          remaining: rateLimit.remaining,
          resetTime: rateLimit.resetTime.toISOString()
        }
      },
      "Alt text generated successfully"
    )
  } catch (error: unknown) {
    console.error("AI alt text error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Alt text generation failed")
  }
})
