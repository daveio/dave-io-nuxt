import { createApiResponse } from '~/server/utils/response'

export default defineEventHandler(async (event) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    runtime: 'cloudflare-workers',
    cf_ray: getHeader(event, 'cf-ray') || 'unknown',
    cf_datacenter: getHeader(event, 'cf-ray')?.substring(0, 3) || 'unknown'
  }
  
  return createApiResponse(healthData, 'Service is healthy')
})