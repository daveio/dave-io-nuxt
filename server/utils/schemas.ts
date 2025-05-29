import { z } from 'zod'

// Common response schemas
export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.any().optional(),
  message: z.string().optional(),
  meta: z.object({
    total: z.number().optional(),
    page: z.number().optional(),
    per_page: z.number().optional(),
    total_pages: z.number().optional(),
    request_id: z.string().optional()
  }).optional(),
  timestamp: z.string()
})

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.any().optional(),
  meta: z.object({
    request_id: z.string().optional()
  }).optional(),
  timestamp: z.string()
})

// JWT related schemas
export const JWTDetailsSchema = z.object({
  sub: z.string(),
  iat: z.number(),
  exp: z.number().optional(),
  jti: z.string().optional(),
  maxRequests: z.number().optional()
})

export const UserSchema = z.object({
  id: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string().nullable(),
  tokenId: z.string().optional(),
  maxRequests: z.number().optional()
})

export const AuthSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  jwt: JWTDetailsSchema,
  user: UserSchema,
  timestamp: z.string()
})

// Health check schemas
export const HealthCheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  timestamp: z.string(),
  version: z.string(),
  environment: z.string(),
  runtime: z.string().optional(),
  cf_ray: z.string().optional(),
  cf_datacenter: z.string().optional()
})

// Metrics schemas
export const SystemMetricsSchema = z.object({
  users: z.object({
    total: z.number(),
    active: z.number(),
    new_today: z.number()
  }),
  posts: z.object({
    total: z.number(),
    published: z.number(),
    drafts: z.number()
  }),
  system: z.object({
    runtime: z.string(),
    timestamp: z.string(),
    cf_ray: z.string().optional(),
    cf_datacenter: z.string().optional(),
    cf_country: z.string().optional()
  }),
  api: z.object({
    version: z.string(),
    endpoints_available: z.number(),
    rate_limit: z.string()
  })
})

// Worker info schemas
export const WorkerInfoSchema = z.object({
  runtime: z.string(),
  preset: z.string(),
  api_available: z.boolean(),
  server_side_rendering: z.boolean(),
  edge_functions: z.boolean(),
  cf_ray: z.string(),
  cf_ipcountry: z.string(),
  cf_connecting_ip: z.string(),
  worker_limits: z.object({
    cpu_time: z.string(),
    memory: z.string(),
    request_timeout: z.string()
  })
})

// URL redirect schemas (for /go endpoints)
export const UrlRedirectSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-zA-Z0-9\-_]+$/),
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  clicks: z.number().default(0),
  created_at: z.string(),
  updated_at: z.string().optional()
})

export const CreateRedirectSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-zA-Z0-9\-_]+$/),
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional()
})

// AI service schemas
export const AiAltTextRequestSchema = z.object({
  url: z.string().url().optional(),
  image: z.string().optional() // base64 encoded image
}).refine(data => data.url || data.image, {
  message: "Either url or image must be provided"
})

export const AiAltTextResponseSchema = z.object({
  success: z.literal(true),
  alt_text: z.string(),
  confidence: z.number().optional(),
  processing_time_ms: z.number().optional(),
  timestamp: z.string()
})

// Token management schemas
export const TokenUsageSchema = z.object({
  token_id: z.string(),
  usage_count: z.number(),
  max_requests: z.number().optional(),
  created_at: z.string(),
  last_used: z.string().optional()
})

export const TokenMetricsSchema = z.object({
  success: z.literal(true),
  data: z.object({
    total_requests: z.number(),
    successful_requests: z.number(),
    failed_requests: z.number(),
    rate_limited_requests: z.number(),
    last_24h: z.object({
      total: z.number(),
      successful: z.number(),
      failed: z.number()
    })
  }),
  timestamp: z.string()
})

// Export commonly used types
export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
export type JWTDetails = z.infer<typeof JWTDetailsSchema>
export type User = z.infer<typeof UserSchema>
export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>
export type HealthCheck = z.infer<typeof HealthCheckSchema>
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>
export type WorkerInfo = z.infer<typeof WorkerInfoSchema>
export type UrlRedirect = z.infer<typeof UrlRedirectSchema>
export type CreateRedirect = z.infer<typeof CreateRedirectSchema>
export type AiAltTextRequest = z.infer<typeof AiAltTextRequestSchema>
export type AiAltTextResponse = z.infer<typeof AiAltTextResponseSchema>
export type TokenUsage = z.infer<typeof TokenUsageSchema>
export type TokenMetrics = z.infer<typeof TokenMetricsSchema>