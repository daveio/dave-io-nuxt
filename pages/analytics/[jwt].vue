<template>
  <UApp class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-6 py-8">
      <!-- Header -->
      <div class="flex flex-col gap-6 mb-8">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-4xl font-bold text-gray-900 dark:text-gray-100">
              Analytics Dashboard
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">
              Real-time insights for next.dave.io
            </p>
          </div>
          
          <div class="flex items-center gap-4">
            <!-- Time Range Selector -->
            <USelect
              v-model="selectedTimeRange"
              :options="timeRangeOptions"
              size="md"
              class="w-48"
              @change="onTimeRangeChange"
            />
            
            <!-- Real-time Toggle -->
            <UButton
              :color="isRealtimeEnabled ? 'primary' : 'neutral'"
              :variant="isRealtimeEnabled ? 'solid' : 'outline'"
              :icon="isRealtimeEnabled ? 'i-lucide-pause' : 'i-lucide-play'"
              @click="toggleRealtime"
            >
              {{ isRealtimeEnabled ? 'Live' : 'Start Live' }}
            </UButton>
            
            <!-- Refresh Button -->
            <UButton
              color="gray"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="isLoading"
              @click="refresh"
            >
              Refresh
            </UButton>

            <!-- Logout Button -->
            <UButton
              color="red"
              variant="outline"
              icon="i-lucide-log-out"
              @click="logout"
            >
              Logout
            </UButton>
          </div>
        </div>

        <!-- Custom Date Range (if selected) -->
        <div v-if="isCustomRange" class="flex items-center gap-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <UFormField label="Start Date" class="flex-1">
            <UInput
              v-model="customStart"
              type="datetime-local"
              @change="onCustomDateChange"
            />
          </UFormField>
          <UFormField label="End Date" class="flex-1">
            <UInput
              v-model="customEnd"
              type="datetime-local"
              @change="onCustomDateChange"
            />
          </UFormField>
        </div>

        <!-- Status Bar -->
        <div class="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-2">
              <div :class="[
                'w-3 h-3 rounded-full',
                error ? 'bg-red-500' : isLoading ? 'bg-yellow-500' : 'bg-green-500'
              ]" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ error ? 'Error' : isLoading ? 'Loading' : 'Connected' }}
              </span>
            </div>
            
            <div v-if="lastUpdated" class="text-sm text-gray-500 dark:text-gray-400">
              Last updated: {{ formatDistanceToNow(lastUpdated, { addSuffix: true }) }}
            </div>
            
            <div v-if="isRealtimeEnabled" class="flex items-center gap-2">
              <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span class="text-sm text-green-600 dark:text-green-400 font-medium">
                Live Updates
              </span>
            </div>

            <!-- Auth Status -->
            <div v-if="authPayload" class="flex items-center gap-2">
              <Icon name="i-lucide-shield-check" size="16" class="text-green-600 dark:text-green-400" />
              <span class="text-sm text-gray-600 dark:text-gray-400">
                Authenticated as: <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">{{ authPayload.sub }}</code>
              </span>
            </div>
          </div>
          
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ timeRangeLabel }}
          </div>
        </div>
      </div>

      <!-- Error State -->
      <UAlert
        v-if="error"
        color="error"
        variant="solid"
        :title="'Failed to load analytics'"
        :description="error"
        class="mb-6"
      >
        <template #actions>
          <UButton color="white" variant="ghost" @click="refresh">
            Try Again
          </UButton>
        </template>
      </UAlert>

      <!-- Auth Error State -->
      <UAlert
        v-if="authError"
        color="error"
        variant="solid"
        :title="'Authentication Error'"
        :description="authError"
        class="mb-6"
      >
        <template #actions>
          <UButton color="white" variant="ghost" @click="logout">
            Return to Login
          </UButton>
        </template>
      </UAlert>

      <!-- Loading State -->
      <div v-if="isLoading && !metrics" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <USkeleton
          v-for="i in 4"
          :key="i"
          class="h-32 rounded-lg"
        />
      </div>

      <!-- Main Content -->
      <div v-if="metrics" class="space-y-8">
        <!-- Overview Metrics -->
        <AnalyticsOverview :metrics="metrics" />
        
        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsRequestsChart :metrics="metrics" />
          <AnalyticsRedirectChart :metrics="metrics" />
        </div>
        
        <!-- Secondary Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnalyticsAIMetrics :metrics="metrics" />
          <AnalyticsAuthMetrics :metrics="metrics" />
          <AnalyticsRouterOSMetrics :metrics="metrics" />
        </div>
        
        <!-- Data Tables -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnalyticsGeographicChart :metrics="metrics" />
          <AnalyticsUserAgentsTable :metrics="metrics" />
        </div>
        
        <!-- Real-time Updates -->
        <AnalyticsRealtimeUpdates 
          v-if="isRealtimeEnabled"
          :updates="realtimeUpdates"
        />
      </div>

      <!-- Empty State -->
      <div v-if="!isLoading && !error && !authError && !metrics" class="text-center py-16">
        <div class="max-w-md mx-auto">
          <div class="w-16 h-16 mx-auto mb-4 text-gray-400">
            <Icon name="i-lucide-bar-chart-3" size="64" />
          </div>
          <h3 class="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No Analytics Data
          </h3>
          <p class="text-gray-500 dark:text-gray-400 mb-4">
            Start generating some traffic to see analytics data here.
          </p>
          <UButton @click="fetchMetrics()">
            Load Analytics
          </UButton>
        </div>
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

// Set page metadata
definePageMeta({
  title: 'Analytics Dashboard',
  description: 'Real-time analytics dashboard for next.dave.io'
})

// SEO
useSeoMeta({
  title: 'Analytics Dashboard - next.dave.io',
  description: 'Real-time analytics and insights for next.dave.io API and website traffic'
})

const route = useRoute()
const router = useRouter()

// Extract JWT from route parameter
const jwtToken = route.params.jwt as string
const authError = ref('')
const authPayload = ref<any>(null)

// Verify JWT token on mount
onMounted(async () => {
  if (!jwtToken || typeof jwtToken !== 'string') {
    authError.value = 'Invalid JWT token in URL'
    return
  }

  try {
    // Validate token
    const response = await $fetch('/api/auth', {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      }
    })

    if (response.success) {
      authPayload.value = response.data.payload
      
      // Check analytics permission
      const subject = authPayload.value.sub
      const hasPermission = subject === 'api:analytics' || 
                           subject === 'api' || 
                           subject === 'admin' || 
                           subject === '*'
      
      if (!hasPermission) {
        authError.value = 'Token does not have analytics permissions'
        return
      }

      // Start loading analytics data
      fetchMetrics(getQueryParams())
    } else {
      authError.value = response.error || 'Invalid token'
    }
  } catch (err: any) {
    if (err.statusCode === 401) {
      authError.value = 'Invalid or expired token'
    } else if (err.statusCode === 403) {
      authError.value = 'Insufficient permissions for analytics access'
    } else {
      authError.value = 'Failed to validate token'
    }
    console.error('Auth error:', err)
  }
})

// Composables - pass JWT token to analytics composable
const {
  isLoading,
  error,
  metrics,
  lastUpdated,
  isRealtimeEnabled,
  realtimeUpdates,
  fetchMetrics,
  toggleRealtime,
  refresh
} = useAnalytics(jwtToken)

const {
  selectedRange: selectedTimeRange,
  customStart,
  customEnd,
  timeRangeOptions,
  isCustomRange,
  timeRangeLabel,
  setTimeRange,
  getQueryParams
} = useTimeRange()

// Handle time range changes
function onTimeRangeChange() {
  if (authPayload.value) {
    fetchMetrics(getQueryParams())
  }
}

function onCustomDateChange() {
  if (isCustomRange.value && customStart.value && customEnd.value && authPayload.value) {
    fetchMetrics(getQueryParams())
  }
}

// Logout function
function logout() {
  localStorage.removeItem('analytics_jwt')
  router.push('/analytics')
}

// Handle page visibility for real-time updates
useHead({
  title: 'Analytics Dashboard'
})

// Cleanup on unmount
onUnmounted(() => {
  if (isRealtimeEnabled.value) {
    toggleRealtime()
  }
})
</script>

<style scoped>
/* Add custom scrollbar for dark mode */
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