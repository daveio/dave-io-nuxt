export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  
  if (!userId || isNaN(Number(userId))) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid user ID is required'
    })
  }

  // Simulate deleting user
  setResponseStatus(event, 204)
  return null
})