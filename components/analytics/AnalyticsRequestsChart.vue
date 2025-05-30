<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Requests Over Time
        </h3>
        <div class="flex items-center gap-2">
          <USelect
            v-model="selectedMetric"
            :options="metricOptions"
            size="sm"
            class="w-32"
          />
        </div>
      </div>
    </template>

    <div class="h-80">
      <canvas ref="chartCanvas" />
    </div>

    <template #footer>
      <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-primary-500 rounded-full" />
            <span>Successful</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-red-500 rounded-full" />
            <span>Failed</span>
          </div>
        </div>
        <div>
          Peak: {{ peakRequests }} requests
        </div>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { Chart, registerables } from "chart.js"
import type { AnalyticsMetrics } from "~/types/analytics"

Chart.register(...registerables)

interface Props {
  metrics: AnalyticsMetrics
}

const props = defineProps<Props>()

const chartCanvas = ref<HTMLCanvasElement>()
const chart = ref<Chart>()
const selectedMetric = ref("requests")
const peakRequests = ref(0)

const _metricOptions = [
  { value: "requests", label: "Requests" },
  { value: "response_time", label: "Response Time" },
  { value: "unique_visitors", label: "Visitors" }
]

// Generate mock time series data based on timeframe
const chartData = computed(() => {
  const { range } = props.metrics.timeframe
  const now = new Date()
  const intervals: Date[] = []
  let intervalMs: number

  switch (range) {
    case "1h":
      intervalMs = 5 * 60 * 1000 // 5 minutes
      break
    case "24h":
      intervalMs = 60 * 60 * 1000 // 1 hour
      break
    case "7d":
      intervalMs = 6 * 60 * 60 * 1000 // 6 hours
      break
    case "30d":
      intervalMs = 24 * 60 * 60 * 1000 // 1 day
      break
    default:
      intervalMs = 60 * 60 * 1000
  }

  const start = new Date(props.metrics.timeframe.start)
  for (let time = start.getTime(); time <= now.getTime(); time += intervalMs) {
    intervals.push(new Date(time))
  }

  const baseRequests = Math.floor(props.metrics.overview.totalRequests / intervals.length)
  const successRatio = props.metrics.overview.successfulRequests / props.metrics.overview.totalRequests

  return intervals.map((time, _index) => {
    const variance = Math.random() * 0.4 + 0.8 // 80-120% variance
    const totalReqs = Math.floor(baseRequests * variance)
    const successfulReqs = Math.floor(totalReqs * successRatio)
    const failedReqs = totalReqs - successfulReqs

    return {
      time: time.toISOString(),
      label: formatTimeLabel(time, range),
      total: totalReqs,
      successful: successfulReqs,
      failed: failedReqs,
      responseTime: 100 + Math.random() * 200 // 100-300ms
    }
  })
})

function formatTimeLabel(date: Date, range: string): string {
  switch (range) {
    case "1h":
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    case "24h":
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    case "7d":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit" })
    case "30d":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    default:
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }
}

function updateChart() {
  if (!chart.value || !chartCanvas.value) return

  const ctx = chartCanvas.value.getContext("2d")
  if (!ctx) return

  const data = chartData.value
  peakRequests.value = Math.max(...data.map((d) => d.total))

  // biome-ignore lint/suspicious/noExplicitAny: Chart.js datasets require flexible structure
  let datasets: any[] = []

  if (selectedMetric.value === "requests") {
    datasets = [
      {
        label: "Successful Requests",
        data: data.map((d) => d.successful),
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 2,
        fill: true,
        tension: 0.4
      },
      {
        label: "Failed Requests",
        data: data.map((d) => d.failed),
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        borderColor: "rgb(239, 68, 68)",
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }
    ]
  } else if (selectedMetric.value === "response_time") {
    datasets = [
      {
        label: "Response Time (ms)",
        data: data.map((d) => d.responseTime),
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        borderColor: "rgb(16, 185, 129)",
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }
    ]
  } else {
    // Unique visitors (estimated)
    datasets = [
      {
        label: "Unique Visitors",
        data: data.map((d) => Math.floor(d.total * 0.7)),
        backgroundColor: "rgba(147, 51, 234, 0.1)",
        borderColor: "rgb(147, 51, 234)",
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }
    ]
  }

  chart.value.data = {
    labels: data.map((d) => d.label),
    datasets
  }

  chart.value.update("none")
}

function initChart() {
  if (!chartCanvas.value) return

  const ctx = chartCanvas.value.getContext("2d")
  if (!ctx) return

  chart.value = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: []
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: "rgba(0, 0, 0, 0.1)"
          },
          ticks: {
            color: "#6B7280"
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: "rgba(0, 0, 0, 0.1)"
          },
          ticks: {
            color: "#6B7280"
          }
        }
      }
    }
  })

  updateChart()
}

onMounted(() => {
  nextTick(() => {
    initChart()
  })
})

onUnmounted(() => {
  if (chart.value) {
    chart.value.destroy()
  }
})

watch(
  () => props.metrics,
  () => {
    updateChart()
  },
  { deep: true }
)

watch(selectedMetric, () => {
  updateChart()
})
</script>