<template>
  <UCard class="analytics-rate-limiting-chart">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">Rate Limiting Activity</h3>
        <div class="flex items-center space-x-2">
          <UBadge 
            v-if="props.realtimeUpdates && realtimeEvents.length > 0" 
            color="blue" 
            variant="soft"
            size="sm"
            class="animate-pulse"
          >
            <UIcon name="i-heroicons-signal" class="h-3 w-3 mr-1" />
            Live ({{ realtimeEvents.length }})
          </UBadge>
          <UButton
            size="sm"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            @click="refreshData"
            :loading="isRefreshing"
          />
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Chart Container -->
      <div v-if="hasChartData" class="h-80">
        <canvas ref="chartCanvas"></canvas>
      </div>
      <div v-else class="h-80 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <div class="text-center">
          <UIcon name="i-heroicons-chart-bar" class="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p class="text-sm text-gray-500">
            {{ props.realtimeUpdates ? 'Waiting for real-time rate limiting events...' : 'No rate limiting data available' }}
          </p>
          <p class="text-xs text-gray-400 mt-1">
            {{ props.realtimeUpdates ? 'Charts will appear when rate limiting events occur' : 'Enable real-time updates to see live data' }}
          </p>
        </div>
      </div>

      <!-- Legend and Info -->
      <div v-if="hasChartData" class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div class="flex items-center">
          <div class="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
          <span>Blocked Requests</span>
        </div>
        <div class="flex items-center">
          <div class="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
          <span>Throttled Requests</span>
        </div>
        <div class="flex items-center">
          <div class="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
          <span>Warning Events</span>
        </div>
      </div>

      <!-- Real-time Events Summary -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 class="font-semibold mb-2">Most Affected Endpoints</h4>
          <div v-if="topEndpoints.length > 0" class="space-y-2">
            <div 
              v-for="endpoint in topEndpoints" 
              :key="endpoint.path"
              class="flex justify-between items-center"
            >
              <span class="text-sm font-mono">{{ endpoint.path }}</span>
              <UBadge 
                color="red"
                variant="soft"
                size="sm"
              >
                {{ endpoint.violations }}
              </UBadge>
            </div>
          </div>
          <div v-else class="text-sm text-gray-500">
            No endpoint violations detected
          </div>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 class="font-semibold mb-2">Rate Limiting Status</h4>
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-sm">Real-time Updates</span>
              <UBadge 
                :color="props.realtimeUpdates ? 'green' : 'gray'" 
                variant="soft" 
                size="sm"
              >
                {{ props.realtimeUpdates ? 'Enabled' : 'Disabled' }}
              </UBadge>
            </div>
            <div class="flex justify-between">
              <span class="text-sm">Events in Memory</span>
              <span class="text-sm font-semibold">{{ realtimeEvents.length }}</span>
            </div>
            <div v-if="lastUpdate" class="flex justify-between">
              <span class="text-sm">Last Event</span>
              <span class="text-sm font-mono">{{ lastUpdate.toLocaleTimeString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { Chart, registerables } from "chart.js"
import type { AnalyticsMetrics } from "~/types/analytics"

// Register Chart.js components
Chart.register(...registerables)

interface Props {
  metrics: AnalyticsMetrics | null
  realtimeUpdates?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  realtimeUpdates: false
})

// Component state
const chartCanvas = ref<HTMLCanvasElement>()
const chart = ref<Chart>()
const isRefreshing = ref(false)

// Real-time state
// biome-ignore lint/suspicious/noExplicitAny: Real-time events from SSE have dynamic structure that varies by event type
const realtimeEvents = ref<any[]>([])
const lastUpdate = ref<Date | null>(null)
const updateInterval = ref<NodeJS.Timeout | null>(null)

// Computed properties
// TODO: Implement rate limiting data display in chart template
// biome-ignore lint/correctness/noUnusedVariables: Will be used when rate limiting metrics display is implemented
const rateLimitingData = computed(() => {
  return (
    props.metrics?.rateLimiting || {
      throttledRequests: 0,
      throttledByToken: []
    }
  )
})

const hasChartData = computed(() => {
  return props.realtimeUpdates && realtimeEvents.value.length > 0
})

// biome-ignore lint/correctness/noUnusedVariables: Used in template for displaying top rate-limited endpoints
const topEndpoints = computed(() => {
  if (!props.realtimeUpdates || realtimeEvents.value.length === 0) {
    return []
  }

  // Aggregate ONLY real-time events by endpoint
  const endpointCounts = new Map<string, number>()

  // biome-ignore lint/complexity/noForEach: Map.set in forEach is the intended aggregation pattern
  realtimeEvents.value.forEach((event) => {
    if (
      event.event?.type === "rate_limit" &&
      (event.event.data.action === "blocked" || event.event.data.action === "throttled")
    ) {
      const endpoint = event.event.data.endpoint || "unknown"
      endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1)
    }
  })

  return Array.from(endpointCounts.entries())
    .map(([path, violations]) => ({ path, violations }))
    .sort((a, b) => b.violations - a.violations)
    .slice(0, 5)
})

// Chart data generation - ONLY use real data
const generateChartData = () => {
  // Only show chart if we have real data
  if (!props.realtimeUpdates || realtimeEvents.value.length === 0) {
    return {
      labels: [],
      datasets: []
    }
  }

  // Use ONLY real-time events data
  const now = new Date()
  const labels = []
  const blockedData = []
  const throttledData = []
  const warningData = []

  // Create time buckets for the last hour (minute-by-minute)
  for (let i = 59; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 1000)
    labels.push(time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }))

    const windowStart = time.getTime()
    const windowEnd = time.getTime() + 60000 // 1 minute window

    const eventsInWindow = realtimeEvents.value.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime()
      return eventTime >= windowStart && eventTime < windowEnd && event.event?.type === "rate_limit"
    })

    blockedData.push(eventsInWindow.filter((e) => e.event.data?.action === "blocked").length)
    throttledData.push(eventsInWindow.filter((e) => e.event.data?.action === "throttled").length)
    warningData.push(eventsInWindow.filter((e) => e.event.data?.action === "warning").length)
  }

  return {
    labels,
    datasets: [
      {
        label: "Blocked Requests",
        data: blockedData,
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4
      },
      {
        label: "Throttled Requests",
        data: throttledData,
        borderColor: "rgb(249, 115, 22)",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4
      },
      {
        label: "Warning Events",
        data: warningData,
        borderColor: "rgb(234, 179, 8)",
        backgroundColor: "rgba(234, 179, 8, 0.1)",
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4
      }
    ]
  }
}

// Chart options
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false // We're using custom legend
    },
    tooltip: {
      mode: "index" as const,
      intersect: false,
      callbacks: {
        // biome-ignore lint/suspicious/noExplicitAny: Chart.js tooltip callbacks have complex generic types that vary by chart type
        title: (tooltipItems: any[]) => {
          return `Time: ${tooltipItems[0].label}`
        },
        // biome-ignore lint/suspicious/noExplicitAny: Chart.js tooltip context has complex dynamic structure
        label: (context: any) => {
          return `${context.dataset.label}: ${context.parsed.y} requests`
        }
      }
    }
  },
  scales: {
    x: {
      display: true,
      grid: {
        display: false
      },
      ticks: {
        maxTicksLimit: 12
      }
    },
    y: {
      display: true,
      beginAtZero: true,
      grid: {
        color: "rgba(0, 0, 0, 0.1)"
      },
      ticks: {
        stepSize: 1
      }
    }
  },
  interaction: {
    mode: "nearest" as const,
    axis: "x" as const,
    intersect: false
  }
}

// Initialize chart
const initChart = () => {
  if (!chartCanvas.value || !hasChartData.value) return

  const ctx = chartCanvas.value.getContext("2d")
  if (!ctx) return

  chart.value = new Chart(ctx, {
    type: "line",
    data: generateChartData(),
    options: chartOptions
  })
}

// Update chart data
const updateChart = (animate = false) => {
  if (!chart.value) return

  const newData = generateChartData()
  if (newData.labels.length === 0) {
    // Destroy chart if no data
    chart.value.destroy()
    chart.value = undefined
    return
  }

  chart.value.data = newData
  chart.value.update(animate ? "active" : "none")
}

// Handle real-time updates
// biome-ignore lint/suspicious/noExplicitAny: SSE update events have dynamic structure that varies by source
function handleRealtimeUpdate(update: any) {
  if (!update || !update.event) {
    throw new Error("Invalid real-time update: missing event data")
  }

  if (update.event?.type === "rate_limit") {
    if (!update.timestamp) {
      throw new Error("Invalid rate limit event: missing timestamp")
    }

    realtimeEvents.value.unshift({
      ...update,
      timestamp: update.timestamp
    })

    lastUpdate.value = new Date()

    // Keep only the last hour of events for performance
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    realtimeEvents.value = realtimeEvents.value.filter((event) => new Date(event.timestamp).getTime() > oneHourAgo)

    // Initialize chart if we now have data
    if (!chart.value && hasChartData.value) {
      nextTick(() => initChart())
    } else if (chart.value) {
      updateChart(false)
    }
  }
}

// Start real-time updates
// TODO: Replace timer-based updates with real SSE connection to /api/analytics/realtime
function startRealtimeUpdates() {
  if (updateInterval.value) return

  // TODO: Implement EventSource connection instead of timer-based polling
  // Current implementation: Update chart every 30 seconds for smooth real-time experience
  updateInterval.value = setInterval(() => {
    if (chart.value) {
      updateChart(false)
    }
  }, 30000)
}

// Stop real-time updates
function stopRealtimeUpdates() {
  if (updateInterval.value) {
    clearInterval(updateInterval.value)
    updateInterval.value = null
  }
}

// Refresh data
// biome-ignore lint/correctness/noUnusedVariables: Used in template for refresh button click handler
const refreshData = async () => {
  isRefreshing.value = true

  // This would trigger a refresh of real-time data
  // For now, just update the chart
  if (chart.value) {
    updateChart(true)
  }

  isRefreshing.value = false
}

// Watch for real-time updates toggle
watch(
  () => props.realtimeUpdates,
  (enabled) => {
    if (enabled) {
      startRealtimeUpdates()
    } else {
      stopRealtimeUpdates()
      realtimeEvents.value = []
      if (chart.value) {
        chart.value.destroy()
        chart.value = undefined
      }
    }
  },
  { immediate: true }
)

// Watch for hasChartData changes
watch(hasChartData, (hasData) => {
  if (hasData && !chart.value) {
    nextTick(() => initChart())
  } else if (!hasData && chart.value) {
    chart.value.destroy()
    chart.value = undefined
  }
})

// Lifecycle
onMounted(() => {
  if (hasChartData.value) {
    nextTick(() => initChart())
  }
})

onBeforeUnmount(() => {
  stopRealtimeUpdates()

  if (chart.value) {
    chart.value.destroy()
  }
})

// Expose the handleRealtimeUpdate function for parent components
defineExpose({
  handleRealtimeUpdate
})
</script>

<style scoped>
.analytics-rate-limiting-chart {
  @apply w-full;
}
</style>