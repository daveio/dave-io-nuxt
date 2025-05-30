<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <Icon name="i-lucide-brain" class="text-purple-600 dark:text-purple-400" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          AI Operations
        </h3>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Main Metrics -->
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ formatNumber(metrics.ai.successfulOperations) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Successful Operations
          </p>
        </div>

        <div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ formatNumber(metrics.ai.failedOperations) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Failed Operations
          </p>
        </div>
      </div>

      <!-- Secondary Metrics -->
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ formatNumber(metrics.ai.totalOperations) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Total Operations
          </p>
        </div>
        
        <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ Math.round(metrics.ai.averageProcessingTime) }}ms
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Avg Processing
          </p>
        </div>
      </div>

      <!-- Additional Stats -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Images Processed
          </span>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.ai.totalImagesSized) }}
          </span>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Average Image Size
          </span>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatBytes(metrics.ai.averageImageSize) }}
          </span>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Processing Speed
          </span>
          <UBadge :color="processingSpeedColor" variant="soft">
            {{ processingSpeedLabel }}
          </UBadge>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Success Rate
          </span>
          <span class="font-medium text-green-600 dark:text-green-400">
            {{ successRate }}%
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Failed Operations
          </span>
          <span class="font-medium text-red-600 dark:text-red-400">
            {{ formatNumber(metrics.ai.failedOperations) }}
          </span>
        </div>
      </div>

      <!-- Performance Indicator -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Performance
          </span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ performanceScore }}/100
          </span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            class="h-2 rounded-full transition-all duration-500"
            :class="performanceBarColor"
            :style="`width: ${performanceScore}%`"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AnalyticsMetrics } from "~/types/analytics"

interface Props {
  metrics: AnalyticsMetrics
}

const props = defineProps<Props>()

// Computed values
// biome-ignore lint/correctness/noUnusedVariables: Used in template for badge color
const processingSpeedColor = computed(() => {
  const time = props.metrics.ai.averageProcessingTime
  if (time < 500) return "green"
  if (time < 1500) return "yellow"
  return "red"
})

// biome-ignore lint/correctness/noUnusedVariables: Used in template for speed label display
const processingSpeedLabel = computed(() => {
  const time = props.metrics.ai.averageProcessingTime
  if (time < 500) return "Fast"
  if (time < 1000) return "Good"
  if (time < 1500) return "Fair"
  return "Slow"
})

// biome-ignore lint/correctness/noUnusedVariables: Used in template for success rate display
const successRate = computed(() => {
  const totalOps = props.metrics.ai.totalOperations
  if (totalOps === 0) {
    return "0.0"
  }
  return props.metrics.ai.successRate.toFixed(1)
})

const performanceScore = computed(() => {
  const time = props.metrics.ai.averageProcessingTime
  const successRate = props.metrics.ai.successRate
  let score = 100

  // Deduct points for slow processing
  if (time > 500) score -= 10
  if (time > 1000) score -= 20
  if (time > 1500) score -= 30
  if (time > 2000) score -= 40

  // Deduct points for low success rate
  if (successRate < 95) score -= 10
  if (successRate < 90) score -= 20
  if (successRate < 80) score -= 30
  if (successRate < 70) score -= 40

  return Math.max(0, Math.min(100, score))
})

// biome-ignore lint/correctness/noUnusedVariables: Used in template for progress bar styling
const performanceBarColor = computed(() => {
  const score = performanceScore.value
  if (score >= 80) return "bg-green-500"
  if (score >= 60) return "bg-yellow-500"
  return "bg-red-500"
})

// Utility functions
// biome-ignore lint/correctness/noUnusedVariables: Used in template
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

// biome-ignore lint/correctness/noUnusedVariables: Used in template
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}
</script>