<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Real-time Activity
          </h3>
        </div>
        <UBadge color="green" variant="soft">
          {{ updates.length }} updates
        </UBadge>
      </div>
    </template>

    <div class="space-y-3 max-h-80 overflow-y-auto">
      <div
        v-for="(update, index) in displayedUpdates"
        :key="`${update.timestamp}-${index}`"
        class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg transition-all duration-300"
        :class="{ 'animate-pulse': index === 0 && isNew(update) }"
      >
        <!-- Event Icon -->
        <div class="flex-shrink-0 mt-0.5">
          <div 
            class="w-8 h-8 rounded-full flex items-center justify-center"
            :class="getEventIconBg(update.event.type)"
          >
            <Icon 
              :name="getEventIcon(update.event.type)" 
              size="16"
              :class="getEventIconColor(update.event.type)"
            />
          </div>
        </div>

        <!-- Event Details -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ getEventTitle(update.event) }}
            </h4>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatTime(update.timestamp) }}
            </span>
          </div>
          
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ getEventDescription(update.event) }}
          </p>
          
          <!-- Location Info -->
          <div class="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <div class="flex items-center gap-1">
              <Icon name="i-lucide-map-pin" size="12" />
              <span>{{ getLocationString(update.event.cloudflare) }}</span>
            </div>
            <div class="flex items-center gap-1">
              <Icon name="i-lucide-globe" size="12" />
              <span>{{ update.event.cloudflare.datacenter }}</span>
            </div>
          </div>
        </div>

        <!-- Event Metrics (if available) -->
        <div v-if="hasMetrics(update.event)" class="text-right">
          <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ getMetricValue(update.event) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ getMetricLabel(update.event.type) }}
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="updates.length === 0" class="text-center py-8">
        <Icon name="i-lucide-activity" size="48" class="mx-auto text-gray-400 mb-4" />
        <p class="text-gray-500 dark:text-gray-400">
          Waiting for real-time activity...
        </p>
      </div>
    </div>

    <template #footer v-if="updates.length > maxVisible">
      <div class="text-center">
        <UButton
          variant="ghost"
          color="gray"
          size="sm"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Show Recent Only' : `Show All ${updates.length} Updates` }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { AnalyticsRealtimeUpdate, AnalyticsEvent } from '~/types/analytics'

interface Props {
  updates: AnalyticsRealtimeUpdate[]
}

const props = defineProps<Props>()

const showAll = ref(false)
const maxVisible = 10
const lastUpdateTime = ref<string>('')

const displayedUpdates = computed(() => {
  return showAll.value ? props.updates : props.updates.slice(0, maxVisible)
})

function isNew(update: AnalyticsRealtimeUpdate): boolean {
  return update.timestamp !== lastUpdateTime.value
}

function getEventIcon(type: string): string {
  const icons = {
    ping: 'i-lucide-heart',
    redirect: 'i-lucide-external-link',
    auth: 'i-lucide-shield-check',
    ai: 'i-lucide-brain',
    routeros: 'i-lucide-router',
    api_request: 'i-lucide-server'
  }
  return icons[type] || 'i-lucide-activity'
}

function getEventIconBg(type: string): string {
  const backgrounds = {
    ping: 'bg-green-100 dark:bg-green-900/20',
    redirect: 'bg-blue-100 dark:bg-blue-900/20',
    auth: 'bg-purple-100 dark:bg-purple-900/20',
    ai: 'bg-pink-100 dark:bg-pink-900/20',
    routeros: 'bg-orange-100 dark:bg-orange-900/20',
    api_request: 'bg-gray-100 dark:bg-gray-900/20'
  }
  return backgrounds[type] || 'bg-gray-100 dark:bg-gray-900/20'
}

function getEventIconColor(type: string): string {
  const colors = {
    ping: 'text-green-600',
    redirect: 'text-blue-600',
    auth: 'text-purple-600',
    ai: 'text-pink-600',
    routeros: 'text-orange-600',
    api_request: 'text-gray-600'
  }
  return colors[type] || 'text-gray-600'
}

function getEventTitle(event: AnalyticsEvent): string {
  switch (event.type) {
    case 'ping':
      return 'Health Check'
    case 'redirect':
      return `Redirect: /go/${(event.data as any).slug}`
    case 'auth':
      return (event.data as any).success ? 'Authentication Success' : 'Authentication Failed'
    case 'ai':
      return `AI ${(event.data as any).operation}`
    case 'routeros':
      return `RouterOS ${(event.data as any).operation}`
    case 'api_request':
      return `API: ${(event.data as any).endpoint}`
    default:
      return 'Unknown Event'
  }
}

function getEventDescription(event: AnalyticsEvent): string {
  switch (event.type) {
    case 'ping':
      return 'System health check ping received'
    case 'redirect':
      const redirectData = event.data as any
      return `Redirected to ${redirectData.destinationUrl}`
    case 'auth':
      const authData = event.data as any
      return authData.success 
        ? `Token ${authData.tokenSubject} authenticated successfully`
        : `Authentication failed for ${authData.tokenSubject}`
    case 'ai':
      const aiData = event.data as any
      return `${aiData.method} request for ${aiData.operation} processed`
    case 'routeros':
      const routerosData = event.data as any
      return `RouterOS ${routerosData.operation} operation completed`
    case 'api_request':
      const apiData = event.data as any
      return `${apiData.method} request to ${apiData.endpoint}`
    default:
      return 'Event details unavailable'
  }
}

function getLocationString(cloudflare: any): string {
  return `${cloudflare.country || 'Unknown'}`
}

function hasMetrics(event: AnalyticsEvent): boolean {
  return ['ai', 'api_request'].includes(event.type)
}

function getMetricValue(event: AnalyticsEvent): string {
  switch (event.type) {
    case 'ai':
      return `${(event.data as any).processingTimeMs || 0}ms`
    case 'api_request':
      return `${(event.data as any).responseTimeMs || 0}ms`
    default:
      return ''
  }
}

function getMetricLabel(type: string): string {
  switch (type) {
    case 'ai':
      return 'Processing'
    case 'api_request':
      return 'Response'
    default:
      return ''
  }
}

function formatTime(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
}

// Update last update time when new updates arrive
watch(() => props.updates[0], (newUpdate) => {
  if (newUpdate) {
    lastUpdateTime.value = newUpdate.timestamp
  }
})
</script>