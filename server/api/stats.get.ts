import { createApiResponse } from '~/server/utils/response'

export default defineEventHandler(async (event) => {
  // Worker-compatible statistics (no process.uptime or memory access)
  const stats = {
    users: {
      total: 3,
      active: 2,
      new_today: 1
    },
    posts: {
      total: 3,
      published: 2,
      drafts: 1
    },
    system: {
      runtime: 'cloudflare-workers',
      timestamp: new Date().toISOString(),
      cf_ray: getHeader(event, 'cf-ray') || 'unknown',
      cf_datacenter: getHeader(event, 'cf-ray')?.substring(0, 3) || 'unknown',
      cf_country: getHeader(event, 'cf-ipcountry') || 'unknown'
    },
    api: {
      version: '1.0.0',
      endpoints_available: 8,
      rate_limit: '100 requests/minute'
    }
  }

  return createApiResponse(stats, 'Statistics retrieved successfully')
})