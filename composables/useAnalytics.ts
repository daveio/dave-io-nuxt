import type {
  AnalyticsMetrics,
  AnalyticsQueryParams,
  AnalyticsRealtimeUpdate,
  AnalyticsResponse,
  AnalyticsTimeRange
} from "~/types/analytics"

/**
 * Main analytics composable for dashboard data fetching
 */
export function useAnalytics(jwtToken?: string) {
  // Reactive state
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const metrics = ref<AnalyticsMetrics | null>(null)
  const lastUpdated = ref<Date | null>(null)

  // Real-time state
  const isRealtimeEnabled = ref(false)
  const realtimeEventSource = ref<EventSource | null>(null)
  const realtimeUpdates = ref<AnalyticsRealtimeUpdate[]>([])

  // Configuration
  const { $config } = useNuxtApp()
  const apiBaseUrl = $config.public.apiBaseUrl || "/api"

  /**
   * Fetch analytics metrics
   */
  async function fetchMetrics(params: Partial<AnalyticsQueryParams> = {}) {
    isLoading.value = true
    error.value = null

    try {
      const queryParams = new URLSearchParams()

      if (params.timeRange) queryParams.set("timeRange", params.timeRange)
      if (params.customStart) queryParams.set("customStart", params.customStart)
      if (params.customEnd) queryParams.set("customEnd", params.customEnd)
      if (params.eventTypes) queryParams.set("eventTypes", params.eventTypes.join(","))
      if (params.country) queryParams.set("country", params.country)
      if (params.tokenSubject) queryParams.set("tokenSubject", params.tokenSubject)
      if (params.limit) queryParams.set("limit", params.limit.toString())

      // Add JWT token if provided (prefer Bearer header, fallback to URL param)
      // biome-ignore lint/suspicious/noExplicitAny: Fetch options need flexible structure
      const fetchOptions: any = {}
      if (jwtToken) {
        fetchOptions.headers = {
          Authorization: `Bearer ${jwtToken}`
        }
      }

      const response = await $fetch<AnalyticsResponse<AnalyticsMetrics>>(
        `${apiBaseUrl}/analytics?${queryParams.toString()}`,
        fetchOptions
      )

      if (response.success) {
        metrics.value = response.data
        lastUpdated.value = new Date()
      } else {
        throw new Error(response.error || "Failed to fetch analytics")
      }
    } catch (err) {
      console.error("Analytics fetch error:", err)
      error.value = err instanceof Error ? err.message : "Failed to fetch analytics"
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Execute custom analytics query
   */
  async function executeQuery(params: AnalyticsQueryParams) {
    isLoading.value = true
    error.value = null

    try {
      // Add JWT token if provided (prefer Bearer header)
      // biome-ignore lint/suspicious/noExplicitAny: Fetch options need flexible structure
      const fetchOptions: any = {
        method: "POST",
        body: params
      }
      if (jwtToken) {
        fetchOptions.headers = {
          Authorization: `Bearer ${jwtToken}`
        }
      }

      // biome-ignore lint/suspicious/noExplicitAny: Generic analytics response type
      const response = await $fetch<AnalyticsResponse<any>>(`${apiBaseUrl}/analytics/query`, fetchOptions)

      if (response.success) {
        return response.data
      }
      throw new Error(response.error || "Failed to execute query")
    } catch (err) {
      console.error("Analytics query error:", err)
      error.value = err instanceof Error ? err.message : "Failed to execute query"
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Start real-time analytics updates
   */
  function startRealtime() {
    if (isRealtimeEnabled.value || realtimeEventSource.value) {
      return // Already connected
    }

    try {
      // For EventSource, we need to use URL params since we can't set headers
      const queryParams = new URLSearchParams()
      if (jwtToken) queryParams.set("token", jwtToken)

      realtimeEventSource.value = new EventSource(
        `${apiBaseUrl}/analytics/realtime${queryParams.toString() ? `?${queryParams.toString()}` : ""}`
      )

      realtimeEventSource.value.onopen = () => {
        isRealtimeEnabled.value = true
        console.log("Real-time analytics connected")
      }

      realtimeEventSource.value.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as AnalyticsRealtimeUpdate

          // Add to updates list (keep only last 50)
          realtimeUpdates.value.unshift(data)
          if (realtimeUpdates.value.length > 50) {
            realtimeUpdates.value = realtimeUpdates.value.slice(0, 50)
          }

          // Update metrics if provided
          if (data.metrics && metrics.value) {
            // Merge real-time updates with existing metrics
            if (data.metrics.overview) {
              metrics.value.overview = { ...metrics.value.overview, ...data.metrics.overview }
            }
            if (data.metrics.redirects) {
              metrics.value.redirects = { ...metrics.value.redirects, ...data.metrics.redirects }
            }
            lastUpdated.value = new Date()
          }
          // biome-ignore lint/suspicious/noExplicitAny: Error handling requires flexible type
        } catch (err: any) {
          console.error("Failed to parse real-time update:", err)
        }
      }

      realtimeEventSource.value.onerror = (err: Event) => {
        console.error("Real-time analytics error:", err)
        stopRealtime()
      }
    } catch (err) {
      console.error("Failed to start real-time analytics:", err)
      error.value = "Failed to connect to real-time updates"
    }
  }

  /**
   * Stop real-time analytics updates
   */
  function stopRealtime() {
    if (realtimeEventSource.value) {
      realtimeEventSource.value.close()
      realtimeEventSource.value = null
    }
    isRealtimeEnabled.value = false
    console.log("Real-time analytics disconnected")
  }

  /**
   * Toggle real-time updates
   */
  function toggleRealtime() {
    if (isRealtimeEnabled.value) {
      stopRealtime()
    } else {
      startRealtime()
    }
  }

  /**
   * Refresh current metrics
   */
  async function refresh() {
    if (metrics.value) {
      // Re-fetch with the same timeframe
      await fetchMetrics({
        timeRange: metrics.value.timeframe.range,
        customStart: metrics.value.timeframe.start,
        customEnd: metrics.value.timeframe.end
      })
    } else {
      await fetchMetrics()
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopRealtime()
  })

  return {
    // State
    isLoading: readonly(isLoading),
    error: readonly(error),
    metrics: readonly(metrics),
    lastUpdated: readonly(lastUpdated),

    // Real-time
    isRealtimeEnabled: readonly(isRealtimeEnabled),
    realtimeUpdates: readonly(realtimeUpdates),

    // Methods
    fetchMetrics,
    executeQuery,
    startRealtime,
    stopRealtime,
    toggleRealtime,
    refresh
  }
}

/**
 * Time range selector composable
 */
export function useTimeRange() {
  const selectedRange = ref<AnalyticsTimeRange>("24h")
  const customStart = ref<string>("")
  const customEnd = ref<string>("")

  const timeRangeOptions = [
    { value: "1h", label: "Last Hour" },
    { value: "24h", label: "Last 24 Hours" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "custom", label: "Custom Range" }
  ]

  const isCustomRange = computed(() => selectedRange.value === "custom")

  const timeRangeLabel = computed(() => {
    const option = timeRangeOptions.find((opt) => opt.value === selectedRange.value)
    if (option?.value === "custom" && customStart.value && customEnd.value) {
      return `${customStart.value} - ${customEnd.value}`
    }
    return option?.label || "Unknown"
  })

  function setTimeRange(range: AnalyticsTimeRange, start?: string, end?: string) {
    selectedRange.value = range
    if (range === "custom") {
      customStart.value = start || ""
      customEnd.value = end || ""
    }
  }

  function getQueryParams(): Partial<AnalyticsQueryParams> {
    return {
      timeRange: selectedRange.value,
      customStart: isCustomRange.value ? customStart.value : undefined,
      customEnd: isCustomRange.value ? customEnd.value : undefined
    }
  }

  return {
    selectedRange,
    customStart,
    customEnd,
    timeRangeOptions,
    isCustomRange: readonly(isCustomRange),
    timeRangeLabel: readonly(timeRangeLabel),
    setTimeRange,
    getQueryParams
  }
}

/**
 * Chart data formatting composable
 */
export function useChartData() {
  /**
   * Format time series data for charts using real Analytics Engine data
   */
  function formatTimeSeriesData(metrics: AnalyticsMetrics, field: string): Array<{ time: string; value: number }> {
    if (!metrics.timeSeries) {
      throw new Error(`Time series data not available for field: ${field}`)
    }

    const data = metrics.timeSeries[field as keyof typeof metrics.timeSeries]
    if (!data) {
      throw new Error(`Unknown time series field: ${field}`)
    }

    return data.map((point) => ({
      time: point.timestamp,
      value: point.value
    }))
  }

  /**
   * Format data for pie chart
   */
  function formatPieChartData(data: Array<{ name?: string; country?: string; agent?: string; requests: number }>) {
    return data.map((item) => ({
      name: item.name || item.country || item.agent || "Unknown",
      value: item.requests,
      percentage: ((item.requests / data.reduce((sum, d) => sum + d.requests, 0)) * 100).toFixed(1)
    }))
  }

  /**
   * Format data for bar chart
   */
  function formatBarChartData(data: Array<{ slug?: string; name?: string; clicks?: number; requests?: number }>) {
    return data.map((item) => ({
      name: item.slug || item.name || "Unknown",
      value: item.clicks || item.requests || 0
    }))
  }

  return {
    formatTimeSeriesData,
    formatPieChartData,
    formatBarChartData
  }
}

/**
 * Dashboard layout composable
 */
export function useDashboardLayout() {
  const selectedWidgets = ref<string[]>([
    "overview-metrics",
    "requests-chart",
    "redirect-stats",
    "geographic-map",
    "user-agents",
    "ai-operations"
  ])

  const availableWidgets = [
    { id: "overview-metrics", title: "Overview Metrics", type: "metrics" },
    { id: "requests-chart", title: "Requests Over Time", type: "chart" },
    { id: "redirect-stats", title: "Redirect Statistics", type: "chart" },
    { id: "geographic-map", title: "Geographic Distribution", type: "chart" },
    { id: "user-agents", title: "User Agents", type: "table" },
    { id: "ai-operations", title: "AI Operations", type: "metrics" },
    { id: "auth-stats", title: "Authentication", type: "metrics" },
    { id: "routeros-stats", title: "RouterOS Stats", type: "metrics" },
    { id: "rate-limiting", title: "Rate Limiting", type: "table" }
  ]

  function toggleWidget(widgetId: string) {
    if (selectedWidgets.value.includes(widgetId)) {
      selectedWidgets.value = selectedWidgets.value.filter((id) => id !== widgetId)
    } else {
      selectedWidgets.value.push(widgetId)
    }
  }

  return {
    selectedWidgets,
    availableWidgets,
    toggleWidget
  }
}
