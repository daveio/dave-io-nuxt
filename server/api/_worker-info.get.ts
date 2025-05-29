import { getHeader } from "h3"
import { createApiResponse } from "~/server/utils/response"

export default defineEventHandler(async (event) => {
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

  return createApiResponse(workerInfo, "Worker information retrieved successfully")
})
