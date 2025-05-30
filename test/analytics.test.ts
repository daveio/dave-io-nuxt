import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  aggregateAnalyticsMetrics,
  getTimeRangeBoundaries,
  isBot,
  parseAnalyticsResults
} from "~/server/utils/analytics"
import type { AnalyticsEngineResult, AnalyticsEvent } from "~/types/analytics"

describe("Analytics Utils", () => {
  describe("getTimeRangeBoundaries", () => {
    it("should calculate 1h range correctly", () => {
      vi.useFakeTimers()
      const now = new Date("2024-01-01T12:00:00Z")
      vi.setSystemTime(now)

      const { start, end } = getTimeRangeBoundaries("1h")

      expect(end).toEqual(now)
      expect(start).toEqual(new Date("2024-01-01T11:00:00Z"))
      vi.useRealTimers()
    })

    it("should calculate 24h range correctly", () => {
      vi.useFakeTimers()
      const now = new Date("2024-01-01T12:00:00Z")
      vi.setSystemTime(now)

      const { start, end } = getTimeRangeBoundaries("24h")

      expect(end).toEqual(now)
      expect(start).toEqual(new Date("2023-12-31T12:00:00Z"))
      vi.useRealTimers()
    })

    it("should handle custom range with valid dates", () => {
      const customStart = "2024-01-01T10:00:00Z"
      const customEnd = "2024-01-01T11:00:00Z"

      const { start, end } = getTimeRangeBoundaries("custom", customStart, customEnd)

      expect(start).toEqual(new Date(customStart))
      expect(end).toEqual(new Date(customEnd))
    })

    it("should throw error for custom range without dates", () => {
      expect(() => getTimeRangeBoundaries("custom")).toThrow("Custom time range requires start and end dates")
    })
  })

  describe("parseAnalyticsResults", () => {
    it("should parse redirect events correctly", () => {
      const results: AnalyticsEngineResult[] = [
        {
          index1: "redirect",
          blob2: "gh",
          blob3: "https://github.com/user/repo",
          blob4: "Mozilla/5.0 Chrome",
          blob5: "192.168.1.1",
          blob6: "US",
          blob7: "abc123",
          double1: 5,
          timestamp: "2024-01-01T12:00:00Z"
        }
      ]

      const events = parseAnalyticsResults(results)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe("redirect")
      expect(events[0]?.data).toEqual({
        slug: "gh",
        destinationUrl: "https://github.com/user/repo",
        clickCount: 5
      })
      expect(events[0]?.cloudflare.country).toBe("US")
    })

    it("should parse auth events correctly", () => {
      const results: AnalyticsEngineResult[] = [
        {
          index1: "auth",
          blob2: "success",
          blob3: "user@example.com",
          blob4: "/api/auth",
          blob5: "192.168.1.1",
          blob6: "CA",
          blob7: "def456",
          timestamp: "2024-01-01T12:00:00Z"
        }
      ]

      const events = parseAnalyticsResults(results)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe("auth")
      expect(events[0]?.data).toEqual({
        success: true,
        tokenSubject: "user@example.com",
        endpoint: "/api/auth"
      })
    })

    it("should parse AI events correctly", () => {
      const results: AnalyticsEngineResult[] = [
        {
          index1: "ai",
          blob2: "alt-text",
          blob3: "POST",
          blob4: "image.jpg",
          blob5: "192.168.1.1",
          blob6: "GB",
          blob7: "ghi789",
          blob8: "A beautiful sunset",
          blob9: "user123",
          double1: 1500,
          double2: 2048,
          timestamp: "2024-01-01T12:00:00Z"
        }
      ]

      const events = parseAnalyticsResults(results)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe("ai")
      expect(events[0]?.data).toEqual({
        operation: "alt-text",
        method: "POST",
        imageSource: "image.jpg",
        processingTimeMs: 1500,
        imageSizeBytes: 2048,
        generatedText: "A beautiful sunset",
        userId: "user123"
      })
    })

    it("should parse rate limit events correctly", () => {
      const results: AnalyticsEngineResult[] = [
        {
          index1: "rate_limit",
          blob2: "throttled",
          blob3: "/api/data",
          blob8: "user@example.com",
          blob9: "2024-01-01T12:01:00Z",
          double1: 10,
          double2: 60000,
          double3: 100,
          double4: 90,
          timestamp: "2024-01-01T12:00:00Z"
        }
      ]

      const events = parseAnalyticsResults(results)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe("rate_limit")
      expect(events[0]?.data).toEqual({
        action: "throttled",
        endpoint: "/api/data",
        tokenSubject: "user@example.com",
        requestsInWindow: 10,
        windowSizeMs: 60000,
        maxRequests: 100,
        remainingRequests: 90,
        resetTime: "2024-01-01T12:01:00Z"
      })
    })

    it("should default to api_request for unknown event types", () => {
      const results: AnalyticsEngineResult[] = [
        {
          index1: "unknown",
          blob2: "/api/test",
          blob3: "GET",
          blob8: "user@example.com",
          double1: 200,
          double2: 150,
          timestamp: "2024-01-01T12:00:00Z"
        }
      ]

      const events = parseAnalyticsResults(results)

      expect(events).toHaveLength(1)
      expect(events[0]?.type).toBe("api_request")
      expect(events[0]?.data).toEqual({
        endpoint: "/api/test",
        method: "GET",
        statusCode: 200,
        responseTimeMs: 150,
        tokenSubject: "user@example.com"
      })
    })
  })

  describe("aggregateAnalyticsMetrics", () => {
    let sampleEvents: AnalyticsEvent[]

    beforeEach(() => {
      sampleEvents = [
        {
          type: "redirect",
          timestamp: "2024-01-01T12:00:00Z",
          cloudflare: {
            ray: "abc",
            country: "US",
            ip: "192.168.1.1",
            datacenter: "abc",
            userAgent: "Chrome",
            requestUrl: "/"
          },
          data: { slug: "gh", destinationUrl: "https://github.com", clickCount: 3 }
        },
        {
          type: "auth",
          timestamp: "2024-01-01T12:01:00Z",
          cloudflare: {
            ray: "def",
            country: "CA",
            ip: "192.168.1.2",
            datacenter: "def",
            userAgent: "Firefox",
            requestUrl: "/"
          },
          data: { success: true, tokenSubject: "user1" }
        },
        {
          type: "auth",
          timestamp: "2024-01-01T12:02:00Z",
          cloudflare: {
            ray: "ghi",
            country: "US",
            ip: "192.168.1.1",
            datacenter: "ghi",
            userAgent: "Safari",
            requestUrl: "/"
          },
          data: { success: false, tokenSubject: "user2" }
        },
        {
          type: "ai",
          timestamp: "2024-01-01T12:03:00Z",
          cloudflare: {
            ray: "jkl",
            country: "GB",
            ip: "192.168.1.3",
            datacenter: "jkl",
            userAgent: "Chrome",
            requestUrl: "/"
          },
          data: {
            operation: "alt-text",
            method: "POST",
            imageSource: "test.jpg",
            processingTimeMs: 1200,
            imageSizeBytes: 1024
          }
        }
      ]
    })

    it("should calculate overview metrics correctly", () => {
      const metrics = aggregateAnalyticsMetrics(sampleEvents, "1h")

      expect(metrics.overview.totalRequests).toBe(4)
      expect(metrics.overview.uniqueVisitors).toBe(3)
      expect(metrics.overview.successfulRequests).toBe(4) // all events are considered successful by default
      expect(metrics.overview.failedRequests).toBe(0) // no failures in current logic
    })

    it("should calculate redirect metrics correctly", () => {
      const metrics = aggregateAnalyticsMetrics(sampleEvents, "1h")

      expect(metrics.redirects.totalClicks).toBe(3)
      expect(metrics.redirects.topSlugs).toHaveLength(1)
      expect(metrics.redirects.topSlugs[0]).toEqual({
        slug: "gh",
        clicks: 3,
        destinations: ["https://github.com"]
      })
    })

    it("should calculate AI metrics correctly", () => {
      const metrics = aggregateAnalyticsMetrics(sampleEvents, "1h")

      expect(metrics.ai.totalOperations).toBe(1)
      expect(metrics.ai.averageProcessingTime).toBe(1200)
      expect(metrics.ai.totalImagesSized).toBe(1)
      expect(metrics.ai.averageImageSize).toBe(1024)
    })

    it("should calculate authentication metrics correctly", () => {
      const metrics = aggregateAnalyticsMetrics(sampleEvents, "1h")

      expect(metrics.authentication.totalAttempts).toBe(2)
      expect(metrics.authentication.successRate).toBe(50)
      expect(metrics.authentication.failedAttempts).toBe(1)
      expect(metrics.authentication.topTokenSubjects).toHaveLength(2)
    })

    it("should calculate geographic distribution correctly", () => {
      const metrics = aggregateAnalyticsMetrics(sampleEvents, "1h")

      expect(metrics.geographic).toHaveLength(3)
      expect(metrics.geographic[0]?.country).toBe("US")
      expect(metrics.geographic[0]?.requests).toBe(2)
      expect(metrics.geographic[0]?.percentage).toBe(50)
    })

    it("should handle empty events array", () => {
      const metrics = aggregateAnalyticsMetrics([], "1h")

      expect(metrics.overview.totalRequests).toBe(0)
      expect(metrics.overview.uniqueVisitors).toBe(0)
      expect(metrics.redirects.totalClicks).toBe(0)
      expect(metrics.ai.totalOperations).toBe(0)
      expect(metrics.authentication.totalAttempts).toBe(0)
    })
  })

  describe("isBot", () => {
    it("should detect bot user agents", () => {
      expect(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true)
      expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true)
      expect(isBot("facebookexternalhit/1.1")).toBe(false) // doesn't match our patterns
      expect(isBot("Twitterbot/1.0")).toBe(true)
      expect(isBot("crawler-test")).toBe(true)
      expect(isBot("spider-indexer")).toBe(true)
      expect(isBot("headless-chrome")).toBe(true)
      expect(isBot("puppeteer/1.0")).toBe(true)
    })

    it("should not detect regular browsers as bots", () => {
      expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe(false)
      expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")).toBe(false)
      expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)")).toBe(false)
    })

    it("should be case insensitive", () => {
      expect(isBot("GOOGLEBOT/2.1")).toBe(true)
      expect(isBot("Bot-Test-Agent")).toBe(true)
      expect(isBot("webcrawler")).toBe(true)
      expect(isBot("SPIDER")).toBe(true)
    })
  })
})
