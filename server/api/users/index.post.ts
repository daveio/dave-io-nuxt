import { createApiResponse, createApiError, validateInput, sanitizeInput } from '~/server/utils/response'

const USER_SCHEMA = {
  name: { 
    required: true, 
    type: 'string', 
    maxLength: 100,
    pattern: /^[a-zA-Z\s'-]+$/
  },
  email: { 
    required: true, 
    type: 'string', 
    maxLength: 255,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    
    // Validate input structure
    if (!validateInput(body, USER_SCHEMA)) {
      createApiError(400, 'Invalid input: name and valid email are required')
    }
    
    // Sanitize inputs
    const sanitizedName = sanitizeInput(body.name)
    const sanitizedEmail = sanitizeInput(body.email.toLowerCase())
    
    // Additional business logic validation
    if (sanitizedName.length < 2) {
      createApiError(400, 'Name must be at least 2 characters long')
    }
    
    // Simulate duplicate email check
    const existingEmails = ['alice@example.com', 'bob@example.com', 'charlie@example.com']
    if (existingEmails.includes(sanitizedEmail)) {
      createApiError(409, 'Email already exists')
    }

    // Simulate creating a user
    const newUser = {
      id: Math.floor(Math.random() * 1000) + 4,
      name: sanitizedName,
      email: sanitizedEmail,
      created: new Date().toISOString()
    }

    setResponseStatus(event, 201)
    return createApiResponse(newUser, 'User created successfully')
    
  } catch (error: any) {
    // Log error for debugging
    console.error('User creation error:', error)
    
    // Re-throw API errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle unexpected errors
    createApiError(500, 'Failed to create user')
  }
})