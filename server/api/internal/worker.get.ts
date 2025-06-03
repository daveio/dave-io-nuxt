import { getHeader } from "h3"
import { recordAPIMetrics } from "~/server/middleware/metrics"
import { createApiResponse, logRequest } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
  const startTime = Date.now()

  // This endpoint provides info about the Worker runtime
  const workerInfo = {
    runtime: "Cloudflare Workers",
    preset: "cloudflare_module",
    api_available: true,
    server_side_rendering: true,
    edge_functions: true,
    cf_ray: getHeader(event, "cf-ray") || "not-available",
    cf_ipcountry: getHeader(event, "cf-ipcountry") || "unknown",
    cf_connecting_ip: getHeader(event, "cf-connecting-ip") || getHeader(event, "x-forwarded-for") || "unknown",
    worker_limits: {
      cpu_time: "50ms (startup) + 50ms (request)",
      memory: "128MB",
      request_timeout: "30s"
    }
  }

  // Record standard API metrics
  recordAPIMetrics(event, 200)

  // Log successful request
  const responseTime = Date.now() - startTime
  logRequest(event, "worker-info", "GET", 200, {
    runtime: workerInfo.runtime,
    preset: workerInfo.preset,
    apiAvailable: workerInfo.api_available,
    responseTime: `${responseTime}ms`
  })

  return createApiResponse(workerInfo, "Worker information retrieved successfully")
})
