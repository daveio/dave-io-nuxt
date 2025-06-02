import { getHeader } from "h3"
import { getCloudflareEnv, getCloudflareRequestInfo, getKVNamespace } from "~/server/utils/cloudflare"
import { createAPIRequestKVCounters, writeKVMetrics } from "~/server/utils/kv-metrics"
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

  // Write KV metrics
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)
    const kv = getKVNamespace(env)

    const userAgent = getHeader(event, "user-agent") || ""
    const kvCounters = createAPIRequestKVCounters("/api/_worker-info", "GET", 200, cfInfo, userAgent, [
      { key: "worker-info:requests:total" },
      { key: `worker-info:runtimes:${workerInfo.runtime.replace(/[^a-z0-9]/g, "-")}` },
      { key: `worker-info:presets:${workerInfo.preset}` },
      { key: "worker-info:features:api-available", increment: workerInfo.api_available ? 1 : 0 },
      { key: "worker-info:features:ssr", increment: workerInfo.server_side_rendering ? 1 : 0 },
      { key: "worker-info:features:edge-functions", increment: workerInfo.edge_functions ? 1 : 0 }
    ])

    await writeKVMetrics(kv, kvCounters)
  } catch (error) {
    console.error("Failed to write worker-info metrics:", error)
    // Continue with response even if metrics fails
  }

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
