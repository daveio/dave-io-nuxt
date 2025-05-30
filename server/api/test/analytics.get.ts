import { defineEventHandler } from 'h3'
import { getCloudflareEnv, getAnalyticsBinding, getCloudflareRequestInfo } from '~/server/utils/cloudflare'
import { createApiResponse, createApiError } from '~/server/utils/response'
import { queryAnalyticsEngine } from '~/server/utils/analytics'

export default defineEventHandler(async (event) => {
  try {
    const env = getCloudflareEnv(event)
    const cfInfo = getCloudflareRequestInfo(event)
    
    // Test writing to Analytics Engine
    console.log('Testing Analytics Engine write...')
    
    try {
      const analytics = getAnalyticsBinding(env)
      
      // Write a test data point
      analytics.writeDataPoint({
        blobs: [
          "test",
          "analytics-test", 
          "write-test",
          cfInfo.userAgent,
          cfInfo.ip,
          cfInfo.country,
          cfInfo.ray,
          new Date().toISOString()
        ],
        doubles: [1, Date.now()],
        indexes: ["test", "analytics-test"]
      })
      
      console.log('✅ Analytics Engine write successful')
    } catch (writeError) {
      console.error('❌ Analytics Engine write failed:', writeError)
      throw createApiError(500, `Analytics write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
    }
    
    // Test reading from Analytics Engine (wait a moment for data to be available)
    console.log('Testing Analytics Engine read...')
    
    try {
      const queryParams = {
        timeRange: "1h" as const,
        eventTypes: ["test"],
        limit: 10,
        offset: 0
      }
      
      const results = await queryAnalyticsEngine(event, queryParams)
      console.log('✅ Analytics Engine read successful, results:', results.length)
      
      return createApiResponse({
        writeStatus: 'success',
        readStatus: 'success',
        resultsCount: results.length,
        testData: results.slice(0, 3), // Show first 3 results
        message: 'Analytics Engine is working correctly'
      }, 'Analytics Engine test completed')
      
    } catch (readError) {
      console.error('❌ Analytics Engine read failed:', readError)
      
      return createApiResponse({
        writeStatus: 'success',
        readStatus: 'failed',
        readError: readError instanceof Error ? readError.message : String(readError),
        message: 'Analytics Engine write works but read failed'
      }, 'Analytics Engine test partially completed')
    }
    
  } catch (error) {
    console.error('Analytics Engine test failed:', error)
    throw createApiError(500, `Test failed: ${error instanceof Error ? error.message : String(error)}`)
  }
})
