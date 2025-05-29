export interface User {
  id: number
  name: string
  email: string
  created: string
  updated?: string
  lastLogin?: string
}

export interface Post {
  id: number
  title: string
  content: string
  author: string
  published: boolean
  created?: string
  updated?: string
}

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  uploaded_at: string
}

export interface ApiMeta {
  total?: number
  page?: number
  per_page?: number
  total_pages?: number
}

export interface ApiResponse<T = any> {
  data?: T
  message?: string
  meta?: ApiMeta
  timestamp?: string
}

export interface ApiError {
  error: string
  details?: any
  timestamp: string
}

export interface SystemStats {
  users: {
    total: number
    active: number
    new_today: number
  }
  posts: {
    total: number
    published: number
    drafts: number
  }
  system: {
    uptime: number
    memory_usage: NodeJS.MemoryUsage
    node_version: string
    platform: string
  }
}

export interface HealthCheck {
  status: 'ok' | 'error'
  timestamp: string
  version: string
  environment: string
}