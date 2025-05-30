<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <Icon name="i-lucide-shield-check" class="text-green-600 dark:text-green-400" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Authentication
        </h3>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Main Metrics -->
      <div class="grid grid-cols-2 gap-4">
        <div class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ metrics.authentication.successRate.toFixed(1) }}%
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Success Rate
          </p>
        </div>
        
        <div class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ formatNumber(metrics.authentication.totalAttempts) }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Total Attempts
          </p>
        </div>
      </div>

      <!-- Success/Failure Breakdown -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-green-500 rounded-full" />
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Successful Logins
            </span>
          </div>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.authentication.totalAttempts - metrics.authentication.failedAttempts) }}
          </span>
        </div>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-red-500 rounded-full" />
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Failed Attempts
            </span>
          </div>
          <span class="font-medium text-gray-900 dark:text-gray-100">
            {{ formatNumber(metrics.authentication.failedAttempts) }}
          </span>
        </div>
      </div>

      <!-- Top Token Subjects -->
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
          Top Token Usage
        </h4>
        <div class="space-y-2">
          <div 
            v-for="token in topTokens"
            :key="token.subject"
            class="flex items-center justify-between text-sm"
          >
            <div class="flex items-center gap-2">
              <UBadge color="primary" variant="soft" size="xs">
                {{ token.subject }}
              </UBadge>
            </div>
            <span class="font-medium text-gray-900 dark:text-gray-100">
              {{ formatNumber(token.requests) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Security Status -->
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Security Status
          </span>
          <UBadge :color="securityColor" variant="soft">
            {{ securityStatus }}
          </UBadge>
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
const _topTokens = computed(() => {
  return props.metrics.authentication.topTokenSubjects.slice(0, 5)
})

const _securityColor = computed(() => {
  const rate = props.metrics.authentication.successRate
  if (rate >= 95) return "green"
  if (rate >= 90) return "yellow"
  return "red"
})

const _securityStatus = computed(() => {
  const rate = props.metrics.authentication.successRate
  const failed = props.metrics.authentication.failedAttempts

  if (rate >= 98 && failed < 10) return "Excellent"
  if (rate >= 95 && failed < 50) return "Good"
  if (rate >= 90 && failed < 100) return "Fair"
  return "Needs Attention"
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