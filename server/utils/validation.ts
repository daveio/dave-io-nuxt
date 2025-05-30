import type { H3Event } from "h3"
import { validate as validateUUID } from "uuid"
import { createApiError } from "./response"

/**
 * UUID validation regex (v4 format)
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate UUID format and throw standardized error if invalid
 */
export function validateUUID_API(uuid: string): void {
  if (!validateUUID(uuid) || !UUID_REGEX.test(uuid)) {
    throw createApiError(400, "Invalid UUID format")
  }
}

/**
 * Validate and extract UUID from route parameter
 */
export function getValidatedUUID(event: H3Event, paramName = "uuid"): string {
  const uuid = getRouterParam(event, paramName)

  if (!uuid) {
    throw createApiError(400, `${paramName} parameter is required`)
  }

  validateUUID_API(uuid)
  return uuid
}

/**
 * Common URL validation
 */
export function validateURL(url: string, paramName = "url"): void {
  try {
    new URL(url)
  } catch {
    throw createApiError(400, `Invalid ${paramName} format`)
  }
}

/**
 * Validate image URL and content type
 */
export async function validateImageURL(imageUrl: string): Promise<ArrayBuffer> {
  validateURL(imageUrl, "image URL")

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

/**
 * Validate file size limits
 */
export function validateFileSize(data: ArrayBuffer | Buffer, maxSizeBytes: number, description = "File"): void {
  const size = data instanceof ArrayBuffer ? data.byteLength : data.length
  if (size > maxSizeBytes) {
    const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024))
    throw createApiError(400, `${description} too large (max ${maxSizeMB}MB)`)
  }
}

/**
 * Sanitize and validate string parameters
 */
export function validateStringParam(
  value: unknown,
  paramName: string,
  options: {
    required?: boolean
    maxLength?: number
    minLength?: number
    pattern?: RegExp
  } = {}
): string | undefined {
  if (value === undefined || value === null) {
    if (options.required) {
      throw createApiError(400, `${paramName} is required`)
    }
    return undefined
  }

  if (typeof value !== "string") {
    throw createApiError(400, `${paramName} must be a string`)
  }

  if (options.minLength && value.length < options.minLength) {
    throw createApiError(400, `${paramName} must be at least ${options.minLength} characters`)
  }

  if (options.maxLength && value.length > options.maxLength) {
    throw createApiError(400, `${paramName} must be no more than ${options.maxLength} characters`)
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw createApiError(400, `${paramName} format is invalid`)
  }

  return value
}

/**
 * Validate numeric parameters
 */
export function validateNumericParam(
  value: unknown,
  paramName: string,
  options: {
    required?: boolean
    min?: number
    max?: number
    integer?: boolean
  } = {}
): number | undefined {
  if (value === undefined || value === null) {
    if (options.required) {
      throw createApiError(400, `${paramName} is required`)
    }
    return undefined
  }

  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value)

  if (Number.isNaN(num)) {
    throw createApiError(400, `${paramName} must be a valid number`)
  }

  if (options.integer && !Number.isInteger(num)) {
    throw createApiError(400, `${paramName} must be an integer`)
  }

  if (options.min !== undefined && num < options.min) {
    throw createApiError(400, `${paramName} must be at least ${options.min}`)
  }

  if (options.max !== undefined && num > options.max) {
    throw createApiError(400, `${paramName} must be no more than ${options.max}`)
  }

  return num
}
