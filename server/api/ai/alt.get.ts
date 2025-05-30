import {
  checkAIRateLimit as checkAIRateLimitAuth,
  requireAIAuth,
  setRateLimitHeaders
} from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { validateImageURL } from "~/server/utils/validation"

// Local function removed - using shared helper from auth-helpers

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for AI alt text generation using helper
    const auth = await requireAIAuth(event, "alt")

    const query = getQuery(event)
    const imageUrl = query.image as string

    if (!imageUrl) {
      throw createApiError(400, "Image URL is required (image parameter)")
    }

    // Get environment bindings using helper
    const env = getCloudflareEnv(event)

    // Check rate limiting using shared helper
    const userId = auth.payload?.jti || auth.payload?.sub || "anonymous"
    const rateLimit = await checkAIRateLimitAuth(userId, env.DATA)

    if (!rateLimit.allowed) {
      setRateLimitHeaders(event, 100, 0, rateLimit.resetTime)
      throw createApiError(429, "Rate limit exceeded. Maximum 100 requests per hour.")
    }

    // Set rate limit headers using helper
    setRateLimitHeaders(event, 100, rateLimit.remaining, rateLimit.resetTime)

    // Validate and fetch image using shared validation helper
    const processingStart = Date.now()
    const imageBuffer = await validateImageURL(imageUrl)

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

    // Write analytics data to Analytics Engine
    try {
      const cfInfo = getCloudflareRequestInfo(event)
      if (env?.ANALYTICS) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            "ai",
            "alt-text",
            "get",
            imageUrl,
            altText.substring(0, 100),
            auth.payload?.sub || "anonymous",
            cfInfo.userAgent,
            cfInfo.ip,
            cfInfo.country,
            cfInfo.ray
          ],
          doubles: [processingTime, imageBuffer.byteLength], // Processing time and image size
          indexes: ["ai", "alt-text", auth.payload?.sub || "anonymous"] // For querying AI operations
        })
      }
    } catch (error) {
      console.error("Failed to write AI analytics:", error)
      // Continue with response even if analytics fails
    }

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
