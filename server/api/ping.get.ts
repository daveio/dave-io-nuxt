import { createApiResponse } from '~/server/utils/response'

export default defineEventHandler(async (event) => {
  // Simple ping endpoint for monitoring and health checks
  const pongData = {
    pong: true,
    timestamp: new Date().toISOString(),
    cf_ray: getHeader(event, 'cf-ray') || 'unknown',
    cf_datacenter: getHeader(event, 'cf-ray')?.substring(0, 3) || 'unknown',
    cf_country: getHeader(event, 'cf-ipcountry') || 'unknown',
    user_agent: getHeader(event, 'user-agent') || 'unknown'
  }
  
  // Log ping for analytics
  const ip = getClientIP(event) || getHeader(event, 'cf-connecting-ip') || 'unknown'
  console.log(`[PING] IP: ${ip} | Country: ${pongData.cf_country} | Ray: ${pongData.cf_ray} | UA: ${pongData.user_agent}`)
  
  return createApiResponse(pongData, 'pong')
})