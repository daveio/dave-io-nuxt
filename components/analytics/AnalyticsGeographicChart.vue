<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Geographic Distribution
        </h3>
        <UBadge color="primary" variant="soft">
          {{ totalRequests }} requests
        </UBadge>
      </div>
    </template>

    <div class="h-80">
      <canvas ref="chartCanvas" />
    </div>

    <template #footer>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div 
          v-for="(country, index) in topCountries" 
          :key="country.country"
          class="flex items-center gap-2"
        >
          <div 
            class="w-3 h-3 rounded-full"
            :style="`background-color: ${getCountryColor(index)}`"
          />
          <span class="text-gray-600 dark:text-gray-400">
            {{ getCountryName(country.country) }}
          </span>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ country.percentage.toFixed(1) }}%
          </span>
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

const totalRequests = computed(() => {
  return props.metrics.geographic.reduce((sum, country) => sum + country.requests, 0)
})

const _topCountries = computed(() => {
  return props.metrics.geographic.slice(0, 6) // Show top 6 countries
})

const chartColors = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Yellow
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#EC4899", // Pink
  "#6B7280" // Gray
]

function getCountryColor(index: number): string {
  return chartColors[index % chartColors.length]
}

function getCountryName(code: string): string {
  const countryNames: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    DE: "Germany",
    CA: "Canada",
    FR: "France",
    AU: "Australia",
    JP: "Japan",
    NL: "Netherlands",
    SE: "Sweden",
    other: "Other"
  }
  return countryNames[code] || code
}

function initChart() {
  if (!chartCanvas.value) return

  const ctx = chartCanvas.value.getContext("2d")
  if (!ctx) return

  const data = props.metrics.geographic.map((country, index) => ({
    label: getCountryName(country.country),
    data: country.requests,
    backgroundColor: getCountryColor(index),
    borderColor: "#fff",
    borderWidth: 2
  }))

  chart.value = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.map((d) => d.label),
      datasets: [
        {
          data: data.map((d) => d.data),
          backgroundColor: data.map((d) => d.backgroundColor),
          borderColor: data.map((d) => d.borderColor),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // We'll show legend in footer
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          titleColor: "#fff",
          bodyColor: "#fff",
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const percentage = ((context.parsed / totalRequests.value) * 100).toFixed(1)
              return `${context.label}: ${context.parsed} (${percentage}%)`
            }
          }
        }
      },
      cutout: "60%",
      elements: {
        arc: {
          borderRadius: 4
        }
      }
    }
  })
}

function updateChart() {
  if (!chart.value) return

  const data = props.metrics.geographic.map((country, index) => ({
    label: getCountryName(country.country),
    data: country.requests,
    backgroundColor: getCountryColor(index)
  }))

  chart.value.data = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        data: data.map((d) => d.data),
        backgroundColor: data.map((d) => d.backgroundColor),
        borderColor: "#fff",
        borderWidth: 2
      }
    ]
  }

  chart.value.update("none")
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
  () => props.metrics.geographic,
  () => {
    updateChart()
  },
  { deep: true }
)
</script>