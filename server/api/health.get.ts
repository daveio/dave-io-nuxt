import { createApiResponse } from '~/server/utils/response'
import { HealthCheckSchema } from '~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const healthData = HealthCheckSchema.parse({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    runtime: 'cloudflare-workers',
    cf_ray: getHeader(event, 'cf-ray') || 'unknown',
    cf_datacenter: getHeader(event, 'cf-ray')?.substring(0, 3) || 'unknown'
  })
  
  return createApiResponse(healthData, 'Service is healthy')
})