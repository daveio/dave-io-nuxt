import { authorizeEndpoint } from "~/server/utils/auth"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"

async function checkAIRateLimit(
  userId: string,
  kv?: KVNamespace
): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
  const now = Date.now()
  const hourMs = 60 * 60 * 1000
  const maxRequests = 100 // 100 requests per hour
  const windowStart = Math.floor(now / hourMs) * hourMs
  const windowEnd = windowStart + hourMs

  const key = `ai:alt:${userId}:${windowStart}`

  try {
    if (kv) {
      const countStr = await kv.get(key)
      const currentCount = countStr ? Number.parseInt(countStr, 10) : 0

      if (currentCount >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(windowEnd)
        }
      }

      const newCount = currentCount + 1
      await kv.put(key, newCount.toString(), {
        expirationTtl: Math.ceil(hourMs / 1000) + 60 // Add 1 minute buffer
      })

      return {
        allowed: true,
        remaining: maxRequests - newCount,
        resetTime: new Date(windowEnd)
      }
    }
    // Fallback to basic rate limiting without persistence
    console.warn("KV not available for AI rate limiting")
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: new Date(windowEnd)
    }
  } catch (error) {
    console.error("AI rate limiting error:", error)
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: new Date(windowEnd)
    }
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

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; AI?: Ai }

    // Check rate limiting
    const userId = auth.payload?.jti || auth.payload?.sub || "anonymous"
    const rateLimit = await checkAIRateLimit(userId, env?.DATA)

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

    // Use Cloudflare AI for image analysis
    let altText: string
    const aiModel = "@cf/llava-hf/llava-1.5-7b-hf"

    if (!env?.AI) {
      throw createApiError(503, "AI service not available")
    }

    try {
      const result = (await env.AI.run(aiModel as "@cf/llava-hf/llava-1.5-7b-hf", {
        image: Array.from(new Uint8Array(imageBuffer)),
        prompt:
          "Describe this image in detail for use as alt text. Focus on the main subjects, actions, and important visual elements that would help someone understand the image content. Be concise but descriptive.",
        max_tokens: 150
      })) as { description?: string; text?: string }

      altText = result.description || result.text || "Unable to generate description"

      // Clean up the AI response
      altText = altText.trim()
      if (altText.length > 300) {
        altText = `${altText.substring(0, 297)}...`
      }
    } catch (error) {
      console.error("AI processing failed:", error)
      throw createApiError(500, "Failed to process image with AI")
    }

    const processingTime = Date.now() - processingStart

    return createApiResponse(
      {
        altText,
        imageSource: imageUrl,
        model: aiModel,
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
