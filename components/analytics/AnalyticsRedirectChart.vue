<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Top Redirects
        </h3>
        <UBadge color="primary" variant="soft">
          {{ metrics.redirects.totalClicks }} total clicks
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <div
        v-for="(slug, index) in topSlugs"
        :key="slug.slug"
        class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
      >
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 text-sm font-semibold">
            {{ index + 1 }}
          </div>
          <div>
            <div class="font-medium text-gray-900 dark:text-gray-100">
              /go/{{ slug.slug }}
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ slug.destinations[0] }}
            </div>
          </div>
        </div>
        
        <div class="text-right">
          <div class="font-semibold text-gray-900 dark:text-gray-100">
            {{ slug.clicks }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ getClickPercentage(slug.clicks) }}%
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="topSlugs.length === 0" class="text-center py-8">
        <Icon name="i-lucide-link" size="48" class="mx-auto text-gray-400 mb-4" />
        <p class="text-gray-500 dark:text-gray-400">
          No redirect clicks recorded yet
        </p>
      </div>
    </div>

    <template #footer v-if="hasMoreSlugs">
      <div class="text-center">
        <UButton
          variant="ghost"
          color="gray"
          size="sm"
          @click="showAllSlugs = !showAllSlugs"
        >
          {{ showAllSlugs ? 'Show Less' : `Show ${remainingSlugs} More` }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { AnalyticsMetrics } from '~/types/analytics'

interface Props {
  metrics: AnalyticsMetrics
}

const props = defineProps<Props>()

const showAllSlugs = ref(false)
const maxVisible = 5

const topSlugs = computed(() => {
  const slugs = props.metrics.redirects.topSlugs || []
  return showAllSlugs.value ? slugs : slugs.slice(0, maxVisible)
})

const hasMoreSlugs = computed(() => {
  return (props.metrics.redirects.topSlugs?.length || 0) > maxVisible
})

const remainingSlugs = computed(() => {
  const total = props.metrics.redirects.topSlugs?.length || 0
  return Math.max(0, total - maxVisible)
})

function getClickPercentage(clicks: number): string {
  const total = props.metrics.redirects.totalClicks
  return total > 0 ? ((clicks / total) * 100).toFixed(1) : '0.0'
}
</script>