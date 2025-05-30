import { requireAPIAuth } from "~/server/utils/auth-helpers"
import { getCloudflareEnv, getKVNamespace } from "~/server/utils/cloudflare"
import { createApiError } from "~/server/utils/response"
import { getKVMetrics } from "~/server/utils/analytics"
import type { AnalyticsRealtimeUpdate } from "~/types/analytics"

export default defineEventHandler(async (event) => {
  try {
    // Require analytics permissions
    await requireAPIAuth(event, "analytics")
    
    const env = getCloudflareEnv(event)
    const kv = getKVNamespace(env)
    
    // Set up Server-Sent Events
    setHeader(event, "Content-Type", "text/event-stream")
    setHeader(event, "Cache-Control", "no-cache")
    setHeader(event, "Connection", "keep-alive")
    setHeader(event, "Access-Control-Allow-Origin", "*")
    setHeader(event, "Access-Control-Allow-Methods", "GET")
    setHeader(event, "Access-Control-Allow-Headers", "Cache-Control")
    
    // Create a readable stream for SSE
    let isConnected = true
    let intervalId: NodeJS.Timeout
    
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const initialMessage = `data: ${JSON.stringify({
          type: "connected",
          timestamp: new Date().toISOString(),
          message: "Real-time analytics stream connected"
        })}\n\n`
        
        controller.enqueue(new TextEncoder().encode(initialMessage))
        
        // Send periodic updates every 5 seconds
        intervalId = setInterval(async () => {
          if (!isConnected) {
            clearInterval(intervalId)
            controller.close()
            return
          }
          
          try {
            // Get current metrics
            const metrics = await getKVMetrics(kv)
            
            // Create a mock real-time update
            const update: AnalyticsRealtimeUpdate = {
              timestamp: new Date().toISOString(),
              event: {
                type: "ping",
                timestamp: new Date().toISOString(),
                cloudflare: {
                  ray: "realtime-update",
                  country: "US",
                  ip: "192.168.1.1",
                  datacenter: "DFW",
                  userAgent: "RealtimeStream/1.0",
                  requestUrl: "/analytics/realtime"
                },
                data: {
                  pingCount: 1
                }
              },
              metrics: {
                overview: {
                  totalRequests: metrics.totalRequests,
                  successfulRequests: metrics.successfulRequests,
                  failedRequests: metrics.failedRequests,
                  averageResponseTime: 120 + Math.floor(Math.random() * 60), // Mock fluctuating response time
                  uniqueVisitors: Math.floor(metrics.totalRequests * 0.7)
                },
                redirects: {
                  totalClicks: metrics.redirectClicks,
                  topSlugs: Object.entries(metrics.redirectsBySlug)
                    .map(([slug, clicks]) => ({
                      slug,
                      clicks,
                      destinations: [`https://github.com/daveio`]
                    }))
                    .sort((a, b) => b.clicks - a.clicks)
                    .slice(0, 5)
                }
              }
            }
            
            const sseMessage = `data: ${JSON.stringify(update)}\n\n`
            controller.enqueue(new TextEncoder().encode(sseMessage))
            
          } catch (error) {
            console.error("Error sending real-time update:", error)
            
            const errorMessage = `data: ${JSON.stringify({
              type: "error",
              timestamp: new Date().toISOString(),
              message: "Failed to fetch real-time data"
            })}\n\n`
            
            controller.enqueue(new TextEncoder().encode(errorMessage))
          }
        }, 5000) // Update every 5 seconds
        
        // Handle client disconnect
        event.node.req.on("close", () => {
          isConnected = false
          clearInterval(intervalId)
          controller.close()
        })
        
        event.node.req.on("error", () => {
          isConnected = false
          clearInterval(intervalId)
          controller.close()
        })
      },
      
      cancel() {
        isConnected = false
        if (intervalId) {
          clearInterval(intervalId)
        }
      }
    })
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      }
    })
    
  } catch (error: unknown) {
    console.error("Real-time analytics error:", error)
    
    if (error instanceof Error) {
      throw createApiError(500, `Failed to start real-time stream: ${error.message}`)
    }
    
    throw createApiError(500, "Failed to start real-time analytics stream")
  }
})