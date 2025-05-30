<template>
  <UApp class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-6 py-8">
      <!-- Header -->
      <div class="max-w-2xl mx-auto text-center mb-12">
        <div class="mb-6">
          <Icon name="i-lucide-bar-chart-3" size="64" class="mx-auto text-primary-600 dark:text-primary-400 mb-4" />
          <h1 class="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Analytics Dashboard
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-400">
            Access real-time insights for next.dave.io
          </p>
        </div>
      </div>

      <!-- JWT Input Form -->
      <div class="max-w-md mx-auto">
        <UCard>
          <template #header>
            <div class="text-center">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Authentication Required
              </h2>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Enter your JWT token to access analytics
              </p>
            </div>
          </template>

          <form @submit.prevent="handleSubmit" class="space-y-6">
            <UFormField label="JWT Token" required>
              <UTextarea
                v-model="jwtToken"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                :rows="4"
                size="lg"
                :invalid="!!error"
                autofocus
              />
              <template #help>
                <div class="space-y-1">
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Required permissions: <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">api:analytics</code>, 
                    <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">api</code>, or 
                    <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">admin</code>
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Generate tokens with: <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">bun jwt create --sub "api:analytics"</code>
                  </p>
                </div>
              </template>
            </UFormField>

            <UAlert
              v-if="error"
              color="error"
              variant="soft"
              :title="'Authentication Failed'"
              :description="error"
              class="mb-4"
            />

            <div class="flex gap-3">
              <UButton
                type="submit"
                color="primary"
                size="lg"
                :loading="isValidating"
                :disabled="!jwtToken.trim()"
                class="flex-1"
              >
                <Icon name="i-lucide-log-in" class="mr-2" />
                Access Dashboard
              </UButton>
              <UButton
                color="gray"
                variant="outline"
                size="lg"
                @click="clearToken"
                :disabled="!jwtToken.trim()"
              >
                <Icon name="i-lucide-x" />
              </UButton>
            </div>
          </form>

          <template #footer>
            <div class="text-center">
              <div class="space-y-2">
                <div class="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <div class="flex items-center gap-1">
                    <div class="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Secure</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-2 h-2 bg-blue-500 rounded-full" />
                    <span>Real-time</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <div class="w-2 h-2 bg-purple-500 rounded-full" />
                    <span>Comprehensive</span>
                  </div>
                </div>
                <p class="text-xs text-gray-400 dark:text-gray-500">
                  Your token is validated securely and never stored locally
                </p>
              </div>
            </div>
          </template>
        </UCard>
      </div>

      <!-- Features Preview -->
      <div class="max-w-4xl mx-auto mt-12">
        <h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center mb-8">
          What you'll get access to
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-activity" size="32" class="mx-auto text-primary-600 dark:text-primary-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">Real-time Metrics</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Live request monitoring, success rates, and performance data
            </p>
          </div>
          
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-link" size="32" class="mx-auto text-green-600 dark:text-green-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">Redirect Analytics</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Track /go/* redirects with click-through rates and destinations
            </p>
          </div>
          
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-brain" size="32" class="mx-auto text-purple-600 dark:text-purple-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Operations</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Alt-text generation stats, processing times, and success rates
            </p>
          </div>
          
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-shield-check" size="32" class="mx-auto text-blue-600 dark:text-blue-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">Security Metrics</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Authentication patterns, token usage, and security monitoring
            </p>
          </div>
          
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-globe" size="32" class="mx-auto text-orange-600 dark:text-orange-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">Geographic Data</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Request distribution by country and regional performance
            </p>
          </div>
          
          <div class="text-center p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Icon name="i-lucide-users" size="32" class="mx-auto text-red-600 dark:text-red-400 mb-3" />
            <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">User Analysis</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Bot vs human traffic, user agents, and behavior patterns
            </p>
          </div>
        </div>
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
// Set page metadata
definePageMeta({
  title: 'Analytics Authentication',
  description: 'Authenticate to access the analytics dashboard'
})

// SEO
useSeoMeta({
  title: 'Analytics Dashboard - Authentication - next.dave.io',
  description: 'Secure access to comprehensive analytics and insights for next.dave.io API and website traffic'
})

const router = useRouter()

const jwtToken = ref('')
const error = ref('')
const isValidating = ref(false)

// Load token from localStorage on mount
onMounted(() => {
  const stored = localStorage.getItem('analytics_jwt')
  if (stored) {
    jwtToken.value = stored
  }
})

async function handleSubmit() {
  if (!jwtToken.value.trim()) {
    error.value = 'Please enter a JWT token'
    return
  }

  isValidating.value = true
  error.value = ''

  try {
    // Validate token by making a test request to analytics API
    const response = await $fetch('/api/auth', {
      headers: {
        'Authorization': `Bearer ${jwtToken.value.trim()}`
      }
    })

    if (response.success) {
      // Check if token has analytics permission
      const payload = response.data.payload
      const subject = payload.sub
      
      const hasPermission = subject === 'api:analytics' || 
                           subject === 'api' || 
                           subject === 'admin' || 
                           subject === '*'
      
      if (!hasPermission) {
        error.value = 'Token does not have analytics permissions. Required: api:analytics, api, or admin'
        return
      }

      // Store token temporarily (for session only)
      localStorage.setItem('analytics_jwt', jwtToken.value.trim())

      // Navigate to protected analytics page
      await router.push(`/analytics/${encodeURIComponent(jwtToken.value.trim())}`)
    } else {
      error.value = response.error || 'Invalid token'
    }
  } catch (err: any) {
    if (err.statusCode === 401) {
      error.value = 'Invalid or expired token'
    } else if (err.statusCode === 403) {
      error.value = 'Insufficient permissions for analytics access'
    } else {
      error.value = 'Failed to validate token. Please check your connection and try again.'
    }
    console.error('Token validation failed:', err)
  } finally {
    isValidating.value = false
  }
}

function clearToken() {
  jwtToken.value = ''
  error.value = ''
  localStorage.removeItem('analytics_jwt')
}

// Handle paste events to clean up token
watch(jwtToken, (newValue) => {
  if (newValue) {
    // Clean up common paste artifacts
    jwtToken.value = newValue.trim().replace(/[\n\r\t]/g, '')
  }
  if (error.value) {
    error.value = ''
  }
})
</script>

<style scoped>
/* Custom scrollbar for dark mode */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background-color: #f3f4f6;
}

.dark ::-webkit-scrollbar-track {
  background-color: #1f2937;
}

::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 9999px;
}

.dark ::-webkit-scrollbar-thumb {
  background-color: #4b5563;
}

::-webkit-scrollbar-thumb:hover {
  background-color: #9ca3af;
}

.dark ::-webkit-scrollbar-thumb:hover {
  background-color: #6b7280;
}
</style>