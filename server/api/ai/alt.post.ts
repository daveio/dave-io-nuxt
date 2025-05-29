import { authorizeEndpoint } from "~/server/utils/auth"
import { createApiError, createApiResponse, isApiError } from "~/server/utils/response"
import { AiAltTextRequestSchema, AiAltTextResponseSchema } from "~/server/utils/schemas"

export default defineEventHandler(async (event) => {
  try {
    // Check authorization for AI alt-text endpoint
    const authFunc = await authorizeEndpoint("ai", "alt")
    const auth = await authFunc(event)
    if (!auth.success) {
      createApiError(401, auth.error || "Unauthorized")
    }

    // Get environment bindings
    const env = event.context.cloudflare?.env as { DATA?: KVNamespace; AI?: Ai }

    // Parse and validate request body
    const body = await readBody(event)
    const request = AiAltTextRequestSchema.parse(body)

    const startTime = Date.now()

    // Process the image data
    let imageData: Buffer

    if (request.url) {
      // Fetch image from URL
      try {
        const response = await fetch(request.url)
        if (!response.ok) {
          createApiError(400, `Failed to fetch image: ${response.statusText}`)
        }

        const contentType = response.headers.get("content-type")
        if (!contentType?.startsWith("image/")) {
          createApiError(400, "URL does not point to an image")
        }

        imageData = Buffer.from(await response.arrayBuffer())
      } catch (error) {
        createApiError(400, `Failed to fetch image from URL: ${error}`)
      }
    } else if (request.image) {
      // Decode base64 image
      try {
        imageData = Buffer.from(request.image, "base64")
      } catch (_error) {
        createApiError(400, "Invalid base64 image data")
      }
    } else {
      createApiError(400, "Either url or image must be provided")
    }

    // Validate image size
    if (imageData.length > 10 * 1024 * 1024) {
      // 10MB limit
      createApiError(400, "Image too large (max 10MB)")
    }

    // Use Cloudflare AI for image analysis
    let altText: string
    let confidence: number

    if (env?.AI) {
      try {
        const result = (await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
          image: Array.from(new Uint8Array(imageData)),
          prompt:
            "Describe this image in detail for use as alt text. Focus on the main subjects, actions, and important visual elements that would help someone understand the image content. Be concise but descriptive.",
          max_tokens: 150
        })) as { description?: string; text?: string }

        altText = result.description || result.text || "Unable to generate description"

        // Clean up the AI response
        altText = altText.trim()
        if (altText.length > 300) {
          altText = altText.substring(0, 297) + "..."
        }

        // Set confidence based on response quality
        confidence = altText.length > 20 ? 0.92 : 0.75
      } catch (error) {
        console.error("AI processing failed:", error)
        altText = "Image content could not be analyzed automatically"
        confidence = 0.0
      }
    } else {
      console.warn("AI binding not available, using fallback")
      altText = "AI service temporarily unavailable - image analysis could not be performed"
      confidence = 0.0
    }

    const processingTime = Date.now() - startTime

    // Build response
    const response = AiAltTextResponseSchema.parse({
      success: true,
      alt_text: altText,
      confidence: Math.round(confidence * 100) / 100,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString()
    })

    return response
  } catch (error: unknown) {
    console.error("AI alt-text error:", error)

    // Re-throw API errors
    if (isApiError(error)) {
      throw error
    }

    createApiError(500, "Failed to generate alt text")
  }
})
