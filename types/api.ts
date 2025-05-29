// Re-export all types from schemas for compatibility
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  JWTDetails,
  User,
  AuthSuccessResponse,
  HealthCheck,
  SystemMetrics,
  WorkerInfo,
  UrlRedirect,
  CreateRedirect,
  AiAltTextRequest,
  AiAltTextResponse,
  TokenUsage,
  TokenMetrics
} from "~/server/utils/schemas"

// Legacy interfaces for backward compatibility
export interface ApiMeta {
  total?: number
  page?: number
  per_page?: number
  total_pages?: number
  request_id?: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  meta?: ApiMeta
  timestamp?: string
}

export interface ApiError {
  success: false
  error: string
  details?: string
  timestamp: string
}

// JWT Token Payload for client-side use
export interface ClientJWTPayload {
  sub: string
  iat: number
  exp?: number
  jti?: string
  maxRequests?: number
}

// Client-side user info
export interface ClientUser {
  id: string
  issuedAt: string
  expiresAt: string | null
  tokenId?: string
  maxRequests?: number
}
