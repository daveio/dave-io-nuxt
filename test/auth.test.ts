import { SignJWT } from "jose"
import { beforeEach, describe, expect, it } from "vitest"
import { checkEndpointPermission, extractToken, getUserFromPayload, verifyJWT } from "~/server/utils/auth"

// Mock H3Event for testing
function mockH3Event(headers: Record<string, string> = {}, query: Record<string, unknown> = {}): unknown {
  return {
    node: {
      req: {
        headers
      }
    },
    query
  }
}
interface MockEvent {
  node?: {
    req?: {
      headers?: Record<string, string>
    }
  }
  query?: Record<string, unknown>
}
// Mock getHeader function
;(global as unknown as { getHeader: (event: MockEvent, name: string) => string | undefined }).getHeader = (
  event: MockEvent,
  name: string
) => {
  return event?.node?.req?.headers?.[name.toLowerCase()]
}

// Mock getQuery function
;(global as unknown as { getQuery: (event: MockEvent) => Record<string, unknown> }).getQuery = (event: MockEvent) => {
  return event?.query || {}
}

describe("Authentication System", () => {
  const testSecret = "test-secret-key-for-jwt-testing"

  beforeEach(() => {
    // Reset any global state if needed
  })

  describe("extractToken", () => {
    it("should extract token from Authorization header", () => {
      const event = mockH3Event({
        authorization: "Bearer test-token-here"
      })

      // biome-ignore lint/suspicious/noExplicitAny: Test mock requires any type
      const token = extractToken(event as any)
      expect(token).toBe("test-token-here")
    })

    it("should extract token from query parameter", () => {
      const event = mockH3Event(
        {},
        {
          token: "query-token-here"
        }
      )

      // biome-ignore lint/suspicious/noExplicitAny: Test mock requires any type
      const token = extractToken(event as any)
      expect(token).toBe("query-token-here")
    })

    it("should prefer Authorization header over query parameter", () => {
      const event = mockH3Event(
        {
          authorization: "Bearer header-token"
        },
        {
          token: "query-token"
        }
      )

      // biome-ignore lint/suspicious/noExplicitAny: Test mock requires any type
      const token = extractToken(event as any)
      expect(token).toBe("header-token")
    })

    it("should return null when no token is found", () => {
      const event = mockH3Event()

      // biome-ignore lint/suspicious/noExplicitAny: Test mock requires any type
      const token = extractToken(event as any)
      expect(token).toBeNull()
    })

    it("should return null for malformed Authorization header", () => {
      const event = mockH3Event({
        authorization: "Basic some-basic-auth"
      })

      // biome-ignore lint/suspicious/noExplicitAny: Test mock requires any type
      const token = extractToken(event as any)
      expect(token).toBeNull()
    })
  })

  describe("verifyJWT", () => {
    it("should verify a valid JWT token", async () => {
      // Create a test token
      const encoder = new TextEncoder()
      const secretKey = encoder.encode(testSecret)

      const now = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        sub: "test-user",
        iat: now,
        exp: now + 3600, // 1 hour
        jti: "test-jti"
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secretKey)

      const result = await verifyJWT(token, testSecret)

      expect(result.success).toBe(true)
      expect(result.payload).toBeDefined()
      expect(result.payload?.sub).toBe("test-user")
    })

    it("should reject token with invalid signature", async () => {
      const result = await verifyJWT("invalid.token.here", testSecret)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("should reject expired token", async () => {
      // Create an expired token
      const encoder = new TextEncoder()
      const secretKey = encoder.encode(testSecret)

      const now = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        sub: "test-user",
        iat: now - 7200, // 2 hours ago
        exp: now - 3600, // 1 hour ago (expired)
        jti: "test-jti"
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secretKey)

      const result = await verifyJWT(token, testSecret)

      expect(result.success).toBe(false)
      expect(result.error).toContain("timestamp check failed")
    })

    it("should reject token without required subject", async () => {
      const encoder = new TextEncoder()
      const secretKey = encoder.encode(testSecret)

      const now = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        iat: now,
        exp: now + 3600
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(secretKey)

      const result = await verifyJWT(token, testSecret)

      expect(result.success).toBe(false)
      expect(result.error).toContain("missing subject")
    })
  })

  describe("checkEndpointPermission", () => {
    it("should allow exact match permissions", () => {
      expect(checkEndpointPermission("api:metrics", "api:metrics")).toBe(true)
      expect(checkEndpointPermission("ai:alt", "ai:alt")).toBe(true)
    })

    it("should allow parent permissions for hierarchical endpoints", () => {
      expect(checkEndpointPermission("api", "api:metrics")).toBe(true)
      expect(checkEndpointPermission("ai", "ai:alt")).toBe(true)
      expect(checkEndpointPermission("api", "api:tokens")).toBe(true)
    })

    it("should allow admin and wildcard permissions", () => {
      expect(checkEndpointPermission("admin", "api:metrics")).toBe(true)
      expect(checkEndpointPermission("*", "ai:alt")).toBe(true)
      expect(checkEndpointPermission("admin", "any:endpoint")).toBe(true)
    })

    it("should reject insufficient permissions", () => {
      expect(checkEndpointPermission("ai:alt", "api:metrics")).toBe(false)
      expect(checkEndpointPermission("api:metrics", "ai:alt")).toBe(false)
      expect(checkEndpointPermission("user", "admin:panel")).toBe(false)
    })

    it("should not allow child permissions for parent endpoints", () => {
      expect(checkEndpointPermission("api:metrics", "api")).toBe(false)
      expect(checkEndpointPermission("ai:alt", "ai")).toBe(false)
    })
  })

  describe("getUserFromPayload", () => {
    it("should extract user information from JWT payload", () => {
      const payload = {
        sub: "test-user",
        iat: 1609459200, // 2021-01-01 00:00:00 UTC
        exp: 1609545600, // 2021-01-02 00:00:00 UTC
        jti: "test-token-id",
        maxRequests: 1000
      }

      const user = getUserFromPayload(payload)

      expect(user.id).toBe("test-user")
      expect(user.issuedAt).toEqual(new Date(1609459200 * 1000))
      expect(user.expiresAt).toEqual(new Date(1609545600 * 1000))
      expect(user.tokenId).toBe("test-token-id")
      expect(user.maxRequests).toBe(1000)
    })

    it("should handle payload without expiration", () => {
      const payload = {
        sub: "test-user",
        iat: 1609459200,
        jti: "test-token-id"
      }

      const user = getUserFromPayload(payload)

      expect(user.id).toBe("test-user")
      expect(user.issuedAt).toEqual(new Date(1609459200 * 1000))
      expect(user.expiresAt).toBeNull()
      expect(user.tokenId).toBe("test-token-id")
      expect(user.maxRequests).toBeUndefined()
    })
  })
})
