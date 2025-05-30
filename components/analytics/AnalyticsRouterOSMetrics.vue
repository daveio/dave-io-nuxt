<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <Icon name="i-lucide-router" class="text-orange-600 dark:text-orange-400" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          RouterOS Stats
        </h3>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Cache Performance -->
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ formatNumber(metrics.routeros.cacheHits) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Cache Hits
          </p>
        </div>
        
        <div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ formatNumber(metrics.routeros.cacheMisses) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Cache Misses
          </p>
        </div>
      </div>

      <!-- Cache Hit Rate -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Cache Hit Rate
          </span>
          <span class="font-bold text-lg" :class="hitRateColor">
            {{ cacheHitRate.toFixed(1) }}%
          </span>
        </div>
        
        <!-- Progress Bar -->
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div 
            class="h-3 rounded-full transition-all duration-500"
            :class="hitRateBarColor"
            :style="`width: ${cacheHitRate}%`"
          />
        </div>
      </div>

      <!-- Additional Stats -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Put.io Generations
          </span>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.routeros.putioGenerations) }}
          </span>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Total Requests
          </span>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatNumber(totalRequests) }}
          </span>
        </div>
        
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Cache Efficiency
          </span>
          <UBadge :color="efficiencyColor" variant="soft">
            {{ efficiencyLabel }}
          </UBadge>
        </div>
      </div>

      <!-- Performance Metrics -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="grid grid-cols-2 gap-4 text-center">
          <div>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ avgResponseTime }}ms
            </p>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Avg Response
            </p>
          </div>
          <div>
            <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ uptime }}
            </p>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              Uptime
            </p>
          </div>
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
const totalRequests = computed(() => {
  return props.metrics.routeros.cacheHits + props.metrics.routeros.cacheMisses
})

const cacheHitRate = computed(() => {
  const total = totalRequests.value
  return total > 0 ? (props.metrics.routeros.cacheHits / total) * 100 : 0
})

const _hitRateColor = computed(() => {
  const rate = cacheHitRate.value
  if (rate >= 90) return "text-green-600 dark:text-green-400"
  if (rate >= 75) return "text-yellow-600 dark:text-yellow-400"
  return "text-red-600 dark:text-red-400"
})

const _hitRateBarColor = computed(() => {
  const rate = cacheHitRate.value
  if (rate >= 90) return "bg-green-500"
  if (rate >= 75) return "bg-yellow-500"
  return "bg-red-500"
})

const _efficiencyColor = computed(() => {
  const rate = cacheHitRate.value
  if (rate >= 90) return "green"
  if (rate >= 75) return "yellow"
  return "red"
})

const _efficiencyLabel = computed(() => {
  const rate = cacheHitRate.value
  if (rate >= 95) return "Excellent"
  if (rate >= 90) return "Very Good"
  if (rate >= 75) return "Good"
  if (rate >= 50) return "Fair"
  return "Poor"
})

// Real metrics computed from actual data
const _avgResponseTime = computed(() => {
  // This should be calculated from real Analytics Engine events
  // For now, throw an error to indicate missing real data implementation
  throw new Error("RouterOS average response time requires real Analytics Engine aggregation")
})

const _uptime = computed(() => {
  // This should be calculated from real system monitoring data
  // For now, throw an error to indicate missing real data implementation
  throw new Error("RouterOS uptime requires real system monitoring integration")
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