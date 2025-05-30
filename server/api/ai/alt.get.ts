import { createAIKVCounters, writeAnalytics } from "~/server/utils/analytics"
import {
  checkAIRateLimit as checkAIRateLimitAuth,
  requireAIAuth,
  setRateLimitHeaders
} from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getCloudflareRequestInfo } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse, isApiError, logRequest } from "~/server/utils/response"
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

    let aiSuccess = false
    let aiErrorType: string | undefined

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

      aiSuccess = true
    } catch (error) {
      console.error("AI processing failed:", error)
      aiSuccess = false
      aiErrorType = error instanceof Error ? error.name : "UnknownError"
      throw createApiError(500, "Failed to process image with AI")
    }

    const processingTime = Date.now() - processingStart

    // Write analytics using standardized system
    try {
      const cfInfo = getCloudflareRequestInfo(event)

      const analyticsEvent = {
        type: "ai" as const,
        timestamp: new Date().toISOString(),
        cloudflare: cfInfo,
        data: {
          operation: "alt-text" as const,
          method: "GET" as "GET" | "POST",
          imageSource: imageUrl,
          processingTimeMs: processingTime,
          imageSizeBytes: imageBuffer.byteLength,
          generatedText: aiSuccess ? altText.substring(0, 100) : undefined,
          userId: auth.payload?.sub || undefined,
          success: aiSuccess,
          errorType: aiSuccess ? undefined : aiErrorType || "unknown"
        }
      }

      const kvCounters = createAIKVCounters(
        "alt-text",
        aiSuccess,
        processingTime,
        imageBuffer.byteLength,
        auth.payload?.sub,
        cfInfo,
        [
          { key: "ai:alt-text:requests:total" },
          { key: `ai:alt-text:models:${aiModel.replace(/[^a-z0-9]/g, "-")}` },
          { key: "ai:alt-text:rate-limit:used", increment: 1 },
          { key: "ai:alt-text:rate-limit:remaining", value: rateLimit.remaining }
        ]
      )

      await writeAnalytics(true, env?.ANALYTICS, env?.DATA, analyticsEvent, kvCounters)
    } catch (error) {
      console.error("Failed to write AI analytics:", error)
      // Continue with response even if analytics fails
    }

    // Log successful request
    logRequest(event, "ai/alt", "GET", 200, {
      user: auth.payload?.sub || "anonymous",
      imageSize: imageBuffer.byteLength,
      processingTime,
      success: true
    })

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

    // Log error request
    // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for error handling
    const statusCode = isApiError(error) ? (error as any).statusCode || 500 : 500
    logRequest(event, "ai/alt", "GET", statusCode, {
      user: "unknown",
      imageSize: 0,
      processingTime: 0,
      success: false
    })

    // Write failure analytics if we have enough context
    try {
      const env = getCloudflareEnv(event)
      const cfInfo = getCloudflareRequestInfo(event)
      const query = getQuery(event)
      const imageUrl = query.image as string

      if (env?.ANALYTICS && imageUrl) {
        const errorType = isApiError(error) ? `${error.statusCode}` : "500"
        env.ANALYTICS.writeDataPoint({
          blobs: [
            "ai",
            "alt-text",
            "get",
            imageUrl,
            "",
            "anonymous",
            cfInfo.userAgent,
            cfInfo.ip,
            cfInfo.country,
            cfInfo.ray,
            errorType
          ],
          doubles: [0, 0], // No processing time or image size for early failures
          indexes: ["ai"] // Analytics Engine only supports 1 index
        })
      }
    } catch (analyticsError) {
      console.error("Failed to write failure analytics:", analyticsError)
    }

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    throw createApiError(500, "Alt text generation failed")
  }
})
