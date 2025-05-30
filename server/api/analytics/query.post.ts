import { z } from "zod"
import {
  aggregateAnalyticsMetrics,
  getAnalyticsCacheKey,
  parseAnalyticsResults,
  queryAnalyticsEngine
} from "~/server/utils/analytics"
import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getKVNamespace } from "~/server/utils/cloudflare"
import { createApiError, createApiResponse } from "~/server/utils/response"
import type { AnalyticsResponse } from "~/types/analytics"

// Validation schema for query parameters
const AnalyticsQuerySchema = z.object({
  timeRange: z.enum(["1h", "24h", "7d", "30d", "custom"]).default("24h"),
  customStart: z.string().optional(),
  customEnd: z.string().optional(),
  eventTypes: z.array(z.enum(["ping", "redirect", "auth", "ai", "routeros", "api_request"])).optional(),
  country: z.string().optional(),
  userAgent: z.string().optional(),
  tokenSubject: z.string().optional(),
  groupBy: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  limit: z.number().min(1).max(10000).default(1000),
  offset: z.number().min(0).default(0),
  aggregated: z.boolean().default(true),
  cacheResults: z.boolean().default(true)
})

export default defineEventHandler(async (event) => {
  try {
    // Require analytics permissions
    await requireAPIAuth(event, "analytics")

    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)

    // Parse and validate request body
    const body = await readBody(event)
    const params = AnalyticsQuerySchema.parse(body)

    // Generate cache key if caching is enabled
    let cacheKey: string | undefined
    if (params.cacheResults) {
      cacheKey = getAnalyticsCacheKey(params)
      const cached = await kv.get(cacheKey)

      if (cached) {
        const parsedCache = JSON.parse(cached)
        if (Date.now() - parsedCache.timestamp < 2 * 60 * 1000) {
          // 2 minutes for custom queries
          // biome-ignore lint/suspicious/noExplicitAny: Generic analytics response type
          return createApiResponse<AnalyticsResponse<any>>(
            {
              success: true,
              data: parsedCache.data,
              meta: {
                requestId: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                cached: true,
                cacheExpiry: new Date(parsedCache.timestamp + 2 * 60 * 1000).toISOString(),
                queryTime: 0
              }
            },
            "Custom analytics query retrieved from cache"
          )
        }
      }
    }

    const queryStartTime = Date.now()

    // Execute real Analytics Engine query
    const engineResults = await queryAnalyticsEngine(event, params)
    const events = parseAnalyticsResults(engineResults)

    // Apply limit and offset to real events
    const paginatedEvents = events.slice(params.offset, params.offset + params.limit)

    const queryTime = Date.now() - queryStartTime

    // biome-ignore lint/suspicious/noExplicitAny: Response data can be aggregated metrics or raw events
    let responseData: any

    if (params.aggregated) {
      // Return aggregated metrics
      responseData = aggregateAnalyticsMetrics(paginatedEvents, params.timeRange, params.customStart, params.customEnd)
    } else {
      // Return raw events
      responseData = {
        events: paginatedEvents,
        total: events.length,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + params.limit < events.length
      }
    }

    // Cache the results if enabled
    if (params.cacheResults && cacheKey) {
      await kv.put(
        cacheKey,
        JSON.stringify({
          data: responseData,
          timestamp: Date.now()
        }),
        { expirationTtl: 120 }
      ) // 2 minutes
    }

    // biome-ignore lint/suspicious/noExplicitAny: Generic analytics response type
    const response: AnalyticsResponse<any> = {
      success: true,
      data: responseData,
      meta: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        cached: false,
        queryTime
      }
    }

    return createApiResponse(response, "Custom analytics query executed successfully")
  } catch (error: unknown) {
    console.error("Custom analytics query error:", error)

    if (error instanceof z.ZodError) {
      throw createApiError(400, `Invalid query parameters: ${error.errors.map((e) => e.message).join(", ")}`)
    }

    if (error instanceof Error) {
      throw createApiError(500, `Failed to execute analytics query: ${error.message}`)
    }

    throw createApiError(500, "Failed to execute custom analytics query")
  }
})
