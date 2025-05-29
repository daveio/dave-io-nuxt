import { jwtVerify, type JWTPayload } from "jose"
import type { H3Event } from "h3"

// JWT payload structure matching dave-io Worker
export interface JWTTokenPayload extends JWTPayload {
  sub: string // Subject (endpoint or user identifier)
  iat: number // Issued at
  exp?: number // Expiration time
  jti?: string // JWT ID for revocation
  maxRequests?: number // Request limit for this token
}

// Authorization result
export interface AuthResult {
  success: boolean
  payload?: JWTTokenPayload
  error?: string
  requestCount?: number
}

// Extract JWT token from request (Authorization header or query parameter)
export function extractToken(event: H3Event): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = getHeader(event, "authorization")
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7)
  }

  // Fall back to query parameter
  const query = getQuery(event)
  if (query.token && typeof query.token === "string") {
    return query.token
  }

  return null
}

// Verify JWT token
export async function verifyJWT(token: string, secret: string): Promise<AuthResult> {
  try {
    const encoder = new TextEncoder()
    const secretKey = encoder.encode(secret)

    const { payload } = await jwtVerify(token, secretKey)

    // Validate required fields
    if (!payload.sub || typeof payload.sub !== "string") {
      return { success: false, error: "Invalid token: missing subject" }
    }

    if (!payload.iat || typeof payload.iat !== "number") {
      return { success: false, error: "Invalid token: missing issued at" }
    }

    // Check expiration if present
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { success: false, error: "Token expired" }
    }

    return {
      success: true,
      payload: payload as JWTTokenPayload
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Token verification failed"
    }
  }
}

// Check if subject has permission for endpoint
export function checkEndpointPermission(subject: string, endpoint: string): boolean {
  // Hierarchical permission system like dave-io
  // Format: "endpoint:subresource" or just "endpoint"

  if (subject === endpoint) {
    return true
  }

  // Check if subject is a parent permission
  // e.g., "api" allows access to "api:auth", "api:metrics", etc.
  if (endpoint.includes(":")) {
    const [endpointBase] = endpoint.split(":")
    if (subject === endpointBase) {
      return true
    }
  }

  // Check if subject is exact match or wildcard
  if (subject === "*" || subject === "admin") {
    return true
  }

  return false
}

// Request counting and rate limiting (using KV storage)
export async function trackTokenUsage(
  event: H3Event,
  jti: string,
  maxRequests?: number
): Promise<{ allowed: boolean; currentCount: number }> {
  // In a real implementation, this would use Cloudflare KV
  // For now, we'll use a simple in-memory approach

  if (!maxRequests) {
    return { allowed: true, currentCount: 0 }
  }

  // Get current count from KV (simulated)
  const countKey = `token_usage:${jti}`
  // const currentCount = await env.KV.get(countKey) || 0

  // For development, we'll simulate this
  const currentCount = 0 // This would be fetched from KV

  if (currentCount >= maxRequests) {
    return { allowed: false, currentCount }
  }

  // Increment count
  // await env.KV.put(countKey, (currentCount + 1).toString(), { expirationTtl: 3600 })

  return { allowed: true, currentCount: currentCount + 1 }
}

// Check if token is revoked (JTI blacklist)
export async function isTokenRevoked(event: H3Event, jti: string): Promise<boolean> {
  if (!jti) return false

  // In real implementation: check KV store for revoked tokens
  // const revoked = await env.KV.get(`revoked_token:${jti}`)
  // return revoked !== null

  return false // For development
}

// Main authorization function
export async function authorizeEndpoint(
  endpoint: string,
  subResource?: string
): Promise<(event: H3Event) => Promise<AuthResult>> {
  return async (event: H3Event): Promise<AuthResult> => {
    const token = extractToken(event)
    if (!token) {
      return { success: false, error: "No token provided" }
    }

    // Get JWT secret from runtime config
    const config = useRuntimeConfig(event)
    const secret = config.apiJwtSecret
    if (!secret || secret === "dev-secret-change-in-production") {
      console.warn("Using default JWT secret - this is insecure for production!")
    }

    // Verify token
    const verification = await verifyJWT(token, secret)
    if (!verification.success || !verification.payload) {
      return verification
    }

    const { payload } = verification

    // Check if token is revoked
    if (payload.jti && (await isTokenRevoked(event, payload.jti))) {
      return { success: false, error: "Token has been revoked" }
    }

    // Build full endpoint path
    const fullEndpoint = subResource ? `${endpoint}:${subResource}` : endpoint

    // Check permissions
    if (!checkEndpointPermission(payload.sub, fullEndpoint)) {
      return {
        success: false,
        error: `Insufficient permissions for ${fullEndpoint}`
      }
    }

    // Check rate limiting if applicable
    if (payload.jti && payload.maxRequests) {
      const usage = await trackTokenUsage(event, payload.jti, payload.maxRequests)
      if (!usage.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded: ${usage.currentCount}/${payload.maxRequests}`
        }
      }
    }

    return {
      success: true,
      payload,
      requestCount: payload.maxRequests ? 1 : undefined
    }
  }
}

// Helper to get user info from JWT payload
export function getUserFromPayload(payload: JWTTokenPayload) {
  return {
    id: payload.sub,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
    tokenId: payload.jti,
    maxRequests: payload.maxRequests
  }
}
