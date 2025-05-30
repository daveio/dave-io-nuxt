<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          User Agents
        </h3>
        <div class="flex items-center gap-2">
          <UBadge 
            :color="showBotsOnly ? 'primary' : 'gray'" 
            variant="soft"
            class="cursor-pointer"
            @click="showBotsOnly = !showBotsOnly"
          >
            {{ botCount }} bots
          </UBadge>
          <UBadge 
            :color="!showBotsOnly ? 'primary' : 'gray'" 
            variant="soft"
            class="cursor-pointer"
            @click="showBotsOnly = false"
          >
            {{ humanCount }} humans
          </UBadge>
        </div>
      </div>
    </template>

    <div class="overflow-x-auto">
      <UTable 
        :rows="filteredUserAgents" 
        :columns="columns"
        :ui="{
          td: { base: 'max-w-[0] truncate text-sm' },
          th: { base: 'text-xs font-medium' }
        }"
      >
        <template #agent-data="{ row }">
          <div class="flex items-center gap-2 max-w-xs">
            <div class="flex-shrink-0">
              <UBadge 
                :color="row.isBot ? 'orange' : 'blue'" 
                variant="soft" 
                size="xs"
              >
                {{ row.isBot ? 'Bot' : 'Human' }}
              </UBadge>
            </div>
            <span 
              class="truncate text-gray-900 dark:text-gray-100 font-mono text-xs"
              :title="row.agent"
            >
              {{ row.agent }}
            </span>
          </div>
        </template>

        <template #requests-data="{ row }">
          <div class="text-right">
            <div class="font-semibold text-gray-900 dark:text-gray-100">
              {{ formatNumber(row.requests) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ getRequestPercentage(row.requests) }}%
            </div>
          </div>
        </template>

        <template #type-data="{ row }">
          <div class="flex items-center gap-2">
            <Icon 
              :name="row.isBot ? 'i-lucide-bot' : 'i-lucide-user'" 
              size="16"
              :class="row.isBot ? 'text-orange-600' : 'text-blue-600'"
            />
            <span class="text-sm">
              {{ getUserAgentType(row.agent) }}
            </span>
          </div>
        </template>
      </UTable>
    </div>

    <template #footer v-if="hasMore">
      <div class="text-center">
        <UButton
          variant="ghost"
          color="gray"
          size="sm"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Show Less' : `Show ${remaining} More` }}
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

const showBotsOnly = ref(false)
const showAll = ref(false)
const maxVisible = 10

const columns = [
  {
    key: 'agent',
    label: 'User Agent',
    sortable: true
  },
  {
    key: 'requests',
    label: 'Requests',
    sortable: true
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true
  }
]

const totalRequests = computed(() => {
  return props.metrics.userAgents.reduce((sum, ua) => sum + ua.requests, 0)
})

const botCount = computed(() => {
  return props.metrics.userAgents.filter(ua => ua.isBot).length
})

const humanCount = computed(() => {
  return props.metrics.userAgents.filter(ua => !ua.isBot).length
})

const filteredUserAgents = computed(() => {
  let agents = props.metrics.userAgents
  
  if (showBotsOnly.value) {
    agents = agents.filter(ua => ua.isBot)
  }
  
  return showAll.value ? agents : agents.slice(0, maxVisible)
})

const hasMore = computed(() => {
  const total = showBotsOnly.value 
    ? props.metrics.userAgents.filter(ua => ua.isBot).length
    : props.metrics.userAgents.length
  return total > maxVisible
})

const remaining = computed(() => {
  const total = showBotsOnly.value 
    ? props.metrics.userAgents.filter(ua => ua.isBot).length
    : props.metrics.userAgents.length
  return Math.max(0, total - maxVisible)
})

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

function getRequestPercentage(requests: number): string {
  return totalRequests.value > 0 ? ((requests / totalRequests.value) * 100).toFixed(1) : '0.0'
}

function getUserAgentType(agent: string): string {
  // Simplified user agent detection
  if (/curl|wget|httpie/i.test(agent)) return 'CLI Tool'
  if (/bot|crawler|spider|scraper/i.test(agent)) return 'Bot'
  if (/chrome/i.test(agent)) return 'Chrome'
  if (/firefox/i.test(agent)) return 'Firefox'
  if (/safari/i.test(agent)) return 'Safari'
  if (/edge/i.test(agent)) return 'Edge'
  if (/mobile|android|iphone|ipad/i.test(agent)) return 'Mobile'
  return 'Other'
}
</script>