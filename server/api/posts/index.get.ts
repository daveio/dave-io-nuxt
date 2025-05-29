import { createApiResponse, createApiError, sanitizeInput } from '~/server/utils/response'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10))
    const search = query.search ? sanitizeInput(String(query.search)) : ''
    const publishedOnly = query.published === 'true'

    // Simulate posts data
    let posts = [
      { 
        id: 1, 
        title: 'Getting Started with Cloudflare Workers', 
        content: 'Learn how to build APIs with Cloudflare Workers and Nuxt 3...', 
        author: 'Alice', 
        published: true,
        created: '2024-01-01T00:00:00Z',
        tags: ['cloudflare', 'workers', 'api']
      },
      { 
        id: 2, 
        title: 'Advanced Nuxt 3 Patterns', 
        content: 'Deep dive into composables, plugins, and server-side rendering...', 
        author: 'Bob', 
        published: true,
        created: '2024-01-02T00:00:00Z',
        tags: ['nuxt', 'vue', 'ssr']
      },
      { 
        id: 3, 
        title: 'TypeScript Best Practices', 
        content: 'Writing better TypeScript code with strict types and validation...', 
        author: 'Charlie', 
        published: false,
        created: '2024-01-03T00:00:00Z',
        tags: ['typescript', 'development']
      }
    ]

    // Filter by published status
    if (publishedOnly) {
      posts = posts.filter(post => post.published)
    }

    // Filter by search if provided
    if (search) {
      posts = posts.filter(post => 
        post.title.toLowerCase().includes(search.toLowerCase()) ||
        post.content.toLowerCase().includes(search.toLowerCase()) ||
        post.author.toLowerCase().includes(search.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      )
    }

    // Pagination
    const start = (page - 1) * limit
    const paginatedPosts = posts.slice(start, start + limit)

    const meta = {
      total: posts.length,
      page,
      per_page: limit,
      total_pages: Math.ceil(posts.length / limit),
      has_next: page < Math.ceil(posts.length / limit),
      has_prev: page > 1
    }

    return createApiResponse(paginatedPosts, 'Posts retrieved successfully', meta)
    
  } catch (error: any) {
    console.error('Posts retrieval error:', error)
    createApiError(500, 'Failed to retrieve posts')
  }
})