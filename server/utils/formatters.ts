import { XMLParser } from "fast-xml-parser"
import type { H3Event } from "h3"
import { dump as yamlDump } from "js-yaml"
import { createApiError } from "./response"

/**
 * Format metrics data as YAML using js-yaml library
 * Replaces manual string concatenation in metrics endpoint
 */
export function formatMetricsAsYAML(metrics: {
  success: boolean
  data: {
    total_requests: number
    successful_requests: number
    failed_requests: number
    rate_limited_requests: number
    last_24h: {
      total: number
      successful: number
      failed: number
    }
  }
  timestamp: string
}): string {
  return yamlDump(metrics, {
    indent: 2,
    lineWidth: 120,
    noRefs: true
  })
}

/**
 * Format metrics data as Prometheus exposition format
 * Centralizes the Prometheus format generation
 */
export function formatMetricsAsPrometheus(metrics: {
  data: {
    total_requests: number
    successful_requests: number
    failed_requests: number
    rate_limited_requests: number
    last_24h: {
      total: number
      successful: number
      failed: number
    }
  }
}): string {
  const lines: string[] = []

  // Total requests counter
  lines.push("# HELP api_requests_total Total number of API requests")
  lines.push("# TYPE api_requests_total counter")
  lines.push(`api_requests_total ${metrics.data.total_requests}`)
  lines.push("")

  // Successful requests counter
  lines.push("# HELP api_requests_successful_total Total number of successful API requests")
  lines.push("# TYPE api_requests_successful_total counter")
  lines.push(`api_requests_successful_total ${metrics.data.successful_requests}`)
  lines.push("")

  // Failed requests counter
  lines.push("# HELP api_requests_failed_total Total number of failed API requests")
  lines.push("# TYPE api_requests_failed_total counter")
  lines.push(`api_requests_failed_total ${metrics.data.failed_requests}`)
  lines.push("")

  // Rate limited requests counter
  lines.push("# HELP api_requests_rate_limited_total Total number of rate limited API requests")
  lines.push("# TYPE api_requests_rate_limited_total counter")
  lines.push(`api_requests_rate_limited_total ${metrics.data.rate_limited_requests}`)
  lines.push("")

  // 24h requests gauge
  lines.push("# HELP api_requests_24h_total Total number of API requests in last 24 hours")
  lines.push("# TYPE api_requests_24h_total gauge")
  lines.push(`api_requests_24h_total ${metrics.data.last_24h.total}`)

  return lines.join("\n")
}

/**
 * Response format handler - centralizes the format switching logic
 */
export function handleResponseFormat(
  event: H3Event,
  _data: unknown,
  supportedFormats: {
    json?: () => unknown
    yaml?: () => string
    prometheus?: () => string
    text?: () => string
  }
): unknown {
  const query = getQuery(event)
  const format = (query.format as string)?.toLowerCase() || "json"

  switch (format) {
    case "json":
      if (!supportedFormats.json) {
        throw createApiError(400, "JSON format not supported for this endpoint")
      }
      setHeader(event, "content-type", "application/json")
      return supportedFormats.json()

    case "yaml":
      if (!supportedFormats.yaml) {
        throw createApiError(400, "YAML format not supported for this endpoint")
      }
      setHeader(event, "content-type", "application/x-yaml")
      return supportedFormats.yaml()

    case "prometheus":
      if (!supportedFormats.prometheus) {
        throw createApiError(400, "Prometheus format not supported for this endpoint")
      }
      setHeader(event, "content-type", "text/plain")
      return supportedFormats.prometheus()

    case "text":
      if (!supportedFormats.text) {
        throw createApiError(400, "Text format not supported for this endpoint")
      }
      setHeader(event, "content-type", "text/plain")
      return supportedFormats.text()

    default: {
      const supported = Object.keys(supportedFormats).join(", ")
      throw createApiError(400, `Unsupported format: ${format}. Supported formats: ${supported}`)
    }
  }
}

/**
 * Parse RSS/XML content using fast-xml-parser
 * Replaces manual regex-based parsing in dashboard endpoint
 */
export function parseRSSFeed(xmlContent: string): Array<{
  title: string
  link: string
  description?: string
  pubDate?: string
}> {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true
    })

    const parsed = parser.parse(xmlContent)

    // Handle RSS 2.0 format
    const channel = parsed.rss?.channel
    if (!channel) {
      throw new Error("Invalid RSS format - no channel found")
    }

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean)

    return items.map((item: any) => ({
      title: item.title || "Untitled",
      link: item.link || "",
      description: item.description || undefined,
      pubDate: item.pubDate || undefined
    }))
  } catch (error) {
    console.error("RSS parsing error:", error)
    throw createApiError(500, "Failed to parse RSS feed")
  }
}

/**
 * Generate RouterOS script from IP ranges
 * Centralizes script generation logic
 */
export function generateRouterOSScript(
  ipv4Ranges: string[],
  ipv6Ranges: string[],
  options: {
    listName?: string
    comment?: string
    timestamp?: string
  } = {}
): string {
  const listName = options.listName || "putio"
  const comment = options.comment || "put.io"
  const timestamp = options.timestamp || new Date().toISOString()

  const lines: string[] = []

  // Header
  lines.push(`# RouterOS script for ${listName} IP ranges`)
  lines.push("# Generated by dave.io API")
  lines.push(`# Generated at: ${timestamp}`)
  lines.push("")

  // Remove existing entries
  lines.push(`# Remove existing ${listName} address lists`)
  lines.push(`/ip firewall address-list remove [find list="${listName}"]`)
  lines.push(`/ipv6 firewall address-list remove [find list="${listName}"]`)
  lines.push("")

  // Add IPv4 ranges
  if (ipv4Ranges.length > 0) {
    lines.push("# Add IPv4 ranges")
    for (const range of ipv4Ranges) {
      lines.push(`/ip firewall address-list add list=${listName} address=${range} comment="${comment} IPv4"`)
    }
    lines.push("")
  }

  // Add IPv6 ranges
  if (ipv6Ranges.length > 0) {
    lines.push("# Add IPv6 ranges")
    for (const range of ipv6Ranges) {
      lines.push(`/ipv6 firewall address-list add list=${listName} address=${range} comment="${comment} IPv6"`)
    }
    lines.push("")
  }

  // Footer
  lines.push("# Script completed")
  lines.push(
    `:log info "${listName} address list updated: ${ipv4Ranges.length} IPv4, ${ipv6Ranges.length} IPv6 ranges"`
  )

  return lines.join("\n")
}

/**
 * Template-based script generation
 * Could be extended for other script types
 */
export function generateScript(templateName: string, variables: Record<string, unknown>): string {
  switch (templateName) {
    case "routeros-putio":
      return generateRouterOSScript(
        variables.ipv4Ranges as string[],
        variables.ipv6Ranges as string[],
        variables.options as any
      )
    default:
      throw createApiError(400, `Unknown script template: ${templateName}`)
  }
}
