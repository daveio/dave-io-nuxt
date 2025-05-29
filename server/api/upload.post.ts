import { createApiResponse, createApiError, sanitizeInput } from '~/server/utils/response'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'image/webp',
  'text/plain',
  'application/pdf',
  'application/json'
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES = 5

export default defineEventHandler(async (event) => {
  try {
    const files = await readMultipartFormData(event)
    
    if (!files || files.length === 0) {
      createApiError(400, 'No files uploaded')
    }
    
    if (files.length > MAX_FILES) {
      createApiError(400, `Maximum ${MAX_FILES} files allowed`)
    }

    // Validate each file
    for (const file of files) {
      // Check file size
      if (!file.data || file.data.length === 0) {
        createApiError(400, 'Empty files are not allowed')
      }
      
      if (file.data.length > MAX_FILE_SIZE) {
        createApiError(400, `File ${file.filename || 'unknown'} exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`)
      }
      
      // Check MIME type
      if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
        createApiError(400, `File type ${file.type} not allowed`)
      }
      
      // Validate filename
      if (file.filename) {
        const sanitizedFilename = sanitizeInput(file.filename)
        if (sanitizedFilename !== file.filename) {
          createApiError(400, `Invalid filename: ${file.filename}`)
        }
      }
    }

    // Process files
    const processedFiles = files.map((file, index) => {
      const fileExtension = file.filename?.split('.').pop()?.toLowerCase()
      
      return {
        id: `file_${Date.now()}_${index}`,
        name: sanitizeInput(file.filename || 'unknown'),
        size: file.data?.length || 0,
        type: file.type || 'application/octet-stream',
        extension: fileExtension || null,
        uploaded_at: new Date().toISOString(),
        checksum: generateChecksum(file.data)
      }
    })

    return createApiResponse(
      processedFiles, 
      `Successfully uploaded ${files.length} file(s)`,
      { total: processedFiles.length }
    )
    
  } catch (error: any) {
    console.error('File upload error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    createApiError(500, 'Failed to process uploaded files')
  }
})

function generateChecksum(data: Buffer | Uint8Array): string {
  // Simple checksum - in production use crypto.createHash
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data[i]
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}