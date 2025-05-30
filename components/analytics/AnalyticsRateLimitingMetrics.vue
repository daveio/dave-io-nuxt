<template>
  <UCard class="analytics-rate-limiting-metrics">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Rate Limiting</h3>
        <div class="flex items-center space-x-2">
          <UBadge
            :color="rateLimitingData.throttledRequests > 0 ? 'red' : 'green'"
            variant="soft"
          >
            {{ rateLimitingData.throttledRequests }} Throttled
          </UBadge>
          <UBadge
            v-if="props.realtimeUpdates && isRealTimeActive"
            color="blue"
            variant="soft"
            class="animate-pulse"
          >
            <UIcon name="i-heroicons-signal" class="h-3 w-3 mr-1" />
            Live
          </UBadge>
        </div>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Overview Stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div class="flex items-center">
            <UIcon name="i-heroicons-shield-exclamation" class="h-5 w-5 text-red-500 mr-2" />
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Throttled Requests</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatNumber(rateLimitingData.throttledRequests) }}
              </p>
              <p v-if="lastRateLimitEvent" class="text-xs text-gray-500 mt-1">
                Last: {{ lastRateLimitEvent.toLocaleTimeString() }}
              </p>
            </div>
            <div v-if="props.realtimeUpdates && realtimeData.length > 0" class="text-right">
              <UBadge color="orange" variant="soft" size="sm">
                +{{ realtimeData.filter(e => e.event?.type === 'rate_limit').length }}
              </UBadge>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div class="flex items-center">
            <UIcon name="i-heroicons-user-group" class="h-5 w-5 text-orange-500 mr-2" />
            <div>
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Affected Tokens</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ rateLimitingData.throttledByToken.length }}
              </p>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div class="flex items-center">
            <UIcon name="i-heroicons-clock" class="h-5 w-5 text-blue-500 mr-2" />
            <div>
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Rate Limit Status</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ rateLimitingData.throttledRequests > 0 ? 'ACTIVE' : 'OK' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Throttled Tokens -->
      <div v-if="rateLimitingData.throttledByToken.length > 0">
        <h4 class="text-md font-semibold mb-3">Most Throttled Tokens</h4>
        <div class="space-y-2">
          <div
            v-for="token in rateLimitingData.throttledByToken.slice(0, 5)"
            :key="token.tokenSubject"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div class="flex items-center">
              <UIcon name="i-heroicons-key" class="h-4 w-4 text-gray-500 mr-2" />
              <span class="font-mono text-sm">
                {{ truncateToken(token.tokenSubject) }}
              </span>
            </div>
            <div class="flex items-center space-x-2">
              <UBadge color="red" variant="soft">
                {{ token.throttledCount }} throttled
              </UBadge>
              <UButton
                size="xs"
                variant="ghost"
                @click="viewTokenDetails(token.tokenSubject)"
              >
                View
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Rate Limiting Rules Info - only show if we have real violations to display rules -->
      <div v-if="rateLimitingData.throttledRequests > 0">
        <h4 class="text-md font-semibold mb-3">Rate Limiting Rules</h4>
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Rate limiting rules are enforced per endpoint. View server logs or configuration for current limits.
        </div>
      </div>

      <!-- Rate Limiting Chart -->
      <div v-if="showChart">
        <h4 class="text-md font-semibold mb-3">Rate Limiting Over Time</h4>
        <div class="h-64 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
          <div class="text-center">
            <UIcon name="i-heroicons-chart-bar" class="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p class="text-sm text-gray-500">Rate limiting timeline chart</p>
            <p class="text-xs text-gray-400 mt-1">Coming soon with Analytics Engine integration</p>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AnalyticsMetrics } from "~/types/analytics"

interface Props {
  metrics: AnalyticsMetrics | null
  showChart?: boolean
  realtimeUpdates?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showChart: true,
  realtimeUpdates: false
})

// Real-time state
// biome-ignore lint/suspicious/noExplicitAny: Real-time events from SSE have dynamic structure that varies by event type
const realtimeData = ref<any[]>([])
const lastRateLimitEvent = ref<Date | null>(null)
const isRealTimeActive = ref(false)
const eventSource = ref<EventSource | null>(null)

// Computed properties for rate limiting data
// biome-ignore lint/correctness/noUnusedVariables: Used in template for displaying rate limiting metrics
const rateLimitingData = computed(() => {
  const baseData = props.metrics?.rateLimiting || {
    throttledRequests: 0,
    throttledByToken: []
  }

  // If real-time is enabled, merge with real-time data
  if (props.realtimeUpdates && realtimeData.value.length > 0) {
    const realtimeThrottled = realtimeData.value.filter(
      (update) =>
        update.event?.type === "rate_limit" &&
        (update.event.data.action === "throttled" || update.event.data.action === "blocked")
    )

    return {
      throttledRequests: baseData.throttledRequests + realtimeThrottled.length,
      throttledByToken: [...baseData.throttledByToken, ...aggregateRealtimeTokens(realtimeThrottled)]
    }
  }

  return baseData
})

// Removed averageRateLimit - no mock data allowed

// Helper functions
// biome-ignore lint/correctness/noUnusedVariables: Used in template for number formatting
function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

// biome-ignore lint/correctness/noUnusedVariables: Used in template for token display
function truncateToken(token: string): string {
  if (token === "anonymous") return "Anonymous"
  if (token.length <= 20) return token
  return `${token.substring(0, 10)}...${token.substring(token.length - 7)}`
}

// biome-ignore lint/correctness/noUnusedVariables: Used in template click handlers
function viewTokenDetails(tokenSubject: string) {
  if (!tokenSubject) {
    throw new Error("Cannot view token details: no token subject provided")
  }
  // Navigate to token details page or open modal
  console.log("View token details:", tokenSubject)
  // This could navigate to a detailed view or emit an event
}

// biome-ignore lint/suspicious/noExplicitAny: Real-time rate limit events have nested dynamic structure from SSE updates
function aggregateRealtimeTokens(rateLimitEvents: any[]) {
  const tokenCounts = new Map<string, number>()

  // biome-ignore lint/complexity/noForEach: Map.set in forEach is the intended pattern for aggregation
  rateLimitEvents.forEach((event) => {
    const tokenSubject = event.event?.data?.tokenSubject || "anonymous"
    tokenCounts.set(tokenSubject, (tokenCounts.get(tokenSubject) || 0) + 1)
  })

  return Array.from(tokenCounts.entries()).map(([tokenSubject, throttledCount]) => ({
    tokenSubject,
    throttledCount
  }))
}

// Real-time event handling with SSE connection
// biome-ignore lint/suspicious/noExplicitAny: SSE update events have dynamic structure that varies by source
function handleRealtimeUpdate(update: any) {
  if (!update || !update.event) {
    throw new Error("Invalid real-time update: missing event data")
  }

  if (update.event?.type === "rate_limit") {
    if (!update.timestamp) {
      throw new Error("Invalid rate limit event: missing timestamp")
    }

    realtimeData.value.unshift(update)
    lastRateLimitEvent.value = new Date()

    // Keep only the last 100 events for performance
    if (realtimeData.value.length > 100) {
      realtimeData.value = realtimeData.value.slice(0, 100)
    }
  }
}

// Start real-time updates with EventSource connection
function startRealtimeUpdates() {
  if (eventSource.value) return

  try {
    eventSource.value = new EventSource("/api/analytics/realtime")

    eventSource.value.onopen = () => {
      console.log("Rate limiting metrics SSE connected")
      isRealTimeActive.value = true
    }

    eventSource.value.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)

        if (update.type === "connected" || update.type === "error") {
          return
        }

        // Handle real analytics updates
        handleRealtimeUpdate(update)
      } catch (error) {
        console.error("Failed to parse rate limiting SSE message:", error)
      }
    }

    eventSource.value.onerror = (error) => {
      console.error("Rate limiting EventSource error:", error)
      isRealTimeActive.value = false

      // Retry connection after a delay
      setTimeout(() => {
        if (props.realtimeUpdates && !eventSource.value) {
          startRealtimeUpdates()
        }
      }, 5000)
    }
  } catch (error) {
    console.error("Failed to start rate limiting EventSource:", error)
    isRealTimeActive.value = false
  }
}

// Stop real-time updates
function stopRealtimeUpdates() {
  if (eventSource.value) {
    eventSource.value.close()
    eventSource.value = null
  }
  isRealTimeActive.value = false
}

// Watch for real-time updates toggle
watch(
  () => props.realtimeUpdates,
  (enabled) => {
    if (enabled) {
      startRealtimeUpdates()
    } else {
      stopRealtimeUpdates()
      realtimeData.value = []
    }
  },
  { immediate: true }
)

// Lifecycle hooks
onMounted(() => {
  if (props.realtimeUpdates) {
    startRealtimeUpdates()
  }
})

onBeforeUnmount(() => {
  stopRealtimeUpdates()
})
</script>

<style scoped>
.analytics-rate-limiting-metrics {
  @apply w-full;
}
</style>