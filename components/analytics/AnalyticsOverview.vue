<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <!-- Total Requests -->
    <UCard class="relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Total Requests
          </p>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {{ formatNumber(metrics.overview.totalRequests) }}
          </p>
          <p class="text-sm text-green-600 dark:text-green-400 mt-1">
            +{{ formatNumber(metrics.overview.totalRequests - (metrics.overview.totalRequests - metrics.overview.successfulRequests - metrics.overview.failedRequests)) }} today
          </p>
        </div>
        <div class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <Icon name="i-lucide-activity" size="24" class="text-primary-600 dark:text-primary-400" />
        </div>
      </div>
    </UCard>

    <!-- Success Rate -->
    <UCard class="relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Success Rate
          </p>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {{ _successRate.toFixed(1) }}%
          </p>
          <p class="text-sm text-green-600 dark:text-green-400 mt-1">
            {{ formatNumber(metrics.overview.successfulRequests) }} successful
          </p>
        </div>
        <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <Icon name="i-lucide-check-circle" size="24" class="text-green-600 dark:text-green-400" />
        </div>
      </div>
    </UCard>

    <!-- Average Response Time -->
    <UCard class="relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Avg Response Time
          </p>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {{ Math.round(metrics.overview.averageResponseTime) }}ms
          </p>
          <p class="text-sm" :class="_responseTimeColor">
            {{ _responseTimeStatus }}
          </p>
        </div>
        <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Icon name="i-lucide-zap" size="24" class="text-blue-600 dark:text-blue-400" />
        </div>
      </div>
    </UCard>

    <!-- Unique Visitors -->
    <UCard class="relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600 dark:text-gray-400">
            Unique Visitors
          </p>
          <p class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {{ formatNumber(metrics.overview.uniqueVisitors) }}
          </p>
          <p class="text-sm text-purple-600 dark:text-purple-400 mt-1">
            {{ ((metrics.overview.uniqueVisitors / metrics.overview.totalRequests) * 100).toFixed(1) }}% unique
          </p>
        </div>
        <div class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <Icon name="i-lucide-users" size="24" class="text-purple-600 dark:text-purple-400" />
        </div>
      </div>
    </UCard>

    <!-- Additional Quick Stats -->
    <UCard class="md:col-span-2 lg:col-span-4">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <!-- Redirect Clicks -->
        <div class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.redirects.totalClicks) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Redirect Clicks
          </p>
        </div>

        <!-- AI Operations -->
        <div class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.ai.totalOperations) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            AI Operations
          </p>
        </div>

        <!-- Auth Success Rate -->
        <div class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ metrics.authentication.successRate.toFixed(1) }}%
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Auth Success
          </p>
        </div>

        <!-- Failed Requests -->
        <div class="text-center">
          <p class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ formatNumber(metrics.overview.failedRequests) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Failed Requests
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { AnalyticsMetrics } from "~/types/analytics"

interface Props {
  metrics: AnalyticsMetrics
}

const props = defineProps<Props>()

// Computed values
const _successRate = computed(() => {
  const total = props.metrics.overview.totalRequests
  return total > 0 ? (props.metrics.overview.successfulRequests / total) * 100 : 0
})

const _responseTimeColor = computed(() => {
  const time = props.metrics.overview.averageResponseTime
  if (time < 100) return "text-green-600 dark:text-green-400"
  if (time < 300) return "text-yellow-600 dark:text-yellow-400"
  return "text-red-600 dark:text-red-400"
})

const _responseTimeStatus = computed(() => {
  const time = props.metrics.overview.averageResponseTime
  if (time < 100) return "Excellent"
  if (time < 200) return "Good"
  if (time < 300) return "Fair"
  return "Slow"
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
</script>