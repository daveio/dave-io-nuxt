export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  const body = await readBody(event)
  
  if (!userId || isNaN(Number(userId))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid user ID is required'
    })
  }

  // Simulate updating user
  const updatedUser = {
    id: Number(userId),
    name: body.name || `User ${userId}`,
    email: body.email || `user${userId}@example.com`,
    updated: new Date().toISOString()
  }

  return {
    data: updatedUser,
    message: 'User updated successfully'
  }
})