export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  
  if (!userId || isNaN(Number(userId))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid user ID is required'
    })
  }

  // Simulate fetching user from database
  const user = {
    id: Number(userId),
    name: `User ${userId}`,
    email: `user${userId}@example.com`,
    created: '2024-01-01',
    lastLogin: new Date().toISOString()
  }

  return {
    data: user
  }
})