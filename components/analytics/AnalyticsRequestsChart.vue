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

// biome-ignore lint/correctness/noUnusedVariables: Used in template for metric selection dropdown
const metricOptions = [
  { value: "requests", label: "Requests" },
  { value: "response_time", label: "Response Time" },
  { value: "unique_visitors", label: "Visitors" }
]

// Real time series data from Analytics Engine

const chartData = computed(() => {
  if (!props.metrics.timeSeries) {
    throw new Error("Time series data not available")
  }

  let timeSeriesData: import("~/types/analytics").TimeSeriesDataPoint[]

  if (selectedMetric.value === "response_time") {
    timeSeriesData = props.metrics.timeSeries.responseTime
  } else if (selectedMetric.value === "unique_visitors") {
    timeSeriesData = props.metrics.timeSeries.uniqueVisitors
  } else {
    timeSeriesData = props.metrics.timeSeries.requests
  }

  if (!timeSeriesData) {
    throw new Error(`Time series data not available for field: ${selectedMetric.value}`)
  }

  return timeSeriesData.map((point) => {
    const date = new Date(point.timestamp)
    const formattedLabel = formatTimeLabel(date, props.metrics.timeframe.range)

    return {
      timestamp: point.timestamp,
      label: formattedLabel,
      total: point.value,
      successful: point.successfulRequests || point.value,
      failed: point.failedRequests || 0,
      responseTime: selectedMetric.value === "response_time" ? point.value : props.metrics.overview.averageResponseTime,
      uniqueVisitors: point.uniqueVisitors || 0
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

  // biome-ignore lint/suspicious/noExplicitAny: Chart.js datasets have complex nested structure that's difficult to type
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
    // Unique visitors from real Analytics Engine data
    datasets = [
      {
        label: "Unique Visitors",
        data: data.map((d) => d.uniqueVisitors),
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