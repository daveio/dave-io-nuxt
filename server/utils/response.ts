import type { ApiSuccessResponse, ApiErrorResponse } from './schemas'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  meta?: {
    total?: number
    page?: number
    per_page?: number
    total_pages?: number
    request_id?: string
  }
  timestamp: string
}

export function createApiResponse<T>(
  data?: T,
  message?: string,
  meta?: ApiResponse<T>['meta']
): ApiSuccessResponse {
  return {
    success: true,
    data,
    message,
    meta: {
      ...meta,
      request_id: generateRequestId()
    },
    timestamp: new Date().toISOString()
  }
}

export function createApiError(
  statusCode: number,
  message: string,
  details?: any
): never {
  throw createError({
    statusCode,
    statusMessage: message,
    data: {
      success: false,
      error: message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
      meta: {
        request_id: generateRequestId()
      },
      timestamp: new Date().toISOString()
    } as ApiErrorResponse
  })
}

export function validateInput(input: any, schema: any): boolean {
  // Basic validation - in production, use a proper validation library like Zod
  if (!input || typeof input !== 'object') {
    return false
  }
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = input[key]
    if (rules.required && (value === undefined || value === null || value === '')) {
      return false
    }
    if (value && rules.type && typeof value !== rules.type) {
      return false
    }
    if (value && rules.maxLength && value.length > rules.maxLength) {
      return false
    }
    if (value && rules.pattern && !rules.pattern.test(value)) {
      return false
    }
  }
  
  return true
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return String(input)
  
  return input
    .replace(/[<>"'&]/g, (char) => {
      switch (char) {
        case '<': return '&lt;'
        case '>': return '&gt;'
        case '"': return '&quot;'
        case "'": return '&#x27;'
        case '&': return '&amp;'
        default: return char
      }
    })
    .trim()
    .slice(0, 1000) // Max length safety
}

// Worker-compatible rate limiting (simple in-memory)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(identifier: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}

export function getRateLimitInfo(identifier: string): { remaining: number; resetTime: number } {
  const record = rateLimitMap.get(identifier)
  if (!record || Date.now() > record.resetTime) {
    return { remaining: 100, resetTime: Date.now() + 60000 }
  }
  return { remaining: Math.max(0, 100 - record.count), resetTime: record.resetTime }
}

function generateRequestId(): string {
  // Use crypto.randomUUID if available in Worker runtime, fallback to timestamp+random
  try {
    return `req_${crypto.randomUUID()}`
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
}