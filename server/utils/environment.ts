import type { EventHandlerRequest, H3Event } from "h3"
import { createApiError } from "./response"

/**
 * Standard Cloudflare environment bindings interface
 */
export interface CloudflareEnv {
  /** KV Namespace for general data storage */
  DATA?: KVNamespace
  /** Cloudflare AI for machine learning tasks */
  AI?: Ai
  /** Analytics Engine for logging and metrics */
  ANALYTICS?: AnalyticsEngineDataset
}

/**
 * Environment configuration for controlling fallback behavior
 */
interface EnvironmentConfig {
  /** Whether to allow mock data in development mode */
  allowMockData: boolean
  /** Whether to enable graceful degradation when services are unavailable */
  gracefulDegradation: boolean
  /** Current environment mode */
  environment: "development" | "production" | "test"
}

/**
 * Get environment configuration based on runtime context
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  // In production, be strict about service availability
  const isProduction = process.env.NODE_ENV === "production" || process.env.CLOUDFLARE_ENVIRONMENT === "production"

  const isTest = process.env.NODE_ENV === "test"

  return {
    allowMockData: !isProduction && !isTest,
    gracefulDegradation: !isProduction,
    environment: isProduction ? "production" : isTest ? "test" : "development"
  }
}

/**
 * Get and validate Cloudflare environment bindings from an H3Event
 */
export function getCloudflareEnv(event: H3Event<EventHandlerRequest>): CloudflareEnv {
  return (event.context.cloudflare?.env as CloudflareEnv) || {}
}

/**
 * Check if required Cloudflare bindings are available
 */
export function checkRequiredBindings(env: CloudflareEnv, required: (keyof CloudflareEnv)[]): void {
  const config = getEnvironmentConfig()
  const missing: string[] = []

  for (const binding of required) {
    if (!env[binding]) {
      missing.push(binding)
    }
  }

  if (missing.length > 0) {
    const bindingsList = missing.join(", ")

    // In production, always throw errors for missing bindings
    if (config.environment === "production") {
      throw createApiError(503, `Required services not available: ${bindingsList}`)
    }

    // In development, log warnings but allow graceful degradation if enabled
    if (config.gracefulDegradation) {
      console.warn(`⚠️  Missing Cloudflare bindings in ${config.environment}: ${bindingsList}`)
      console.warn("   Some features may not work correctly")
    } else {
      throw createApiError(503, `Required services not available: ${bindingsList}`)
    }
  }
}

/**
 * Safe getter for KV namespace with fallback handling
 */
export function getKVNamespace(env: CloudflareEnv): KVNamespace | null {
  const config = getEnvironmentConfig()

  if (env.DATA) {
    return env.DATA
  }

  if (config.gracefulDegradation && config.environment !== "production") {
    console.warn("⚠️  KV namespace (DATA) not available, continuing with limited functionality")
    return null
  }

  throw createApiError(503, "Storage service not available")
}

/**
 * Safe getter for AI binding with fallback handling
 */
export function getAIBinding(env: CloudflareEnv): Ai | null {
  const config = getEnvironmentConfig()

  if (env.AI) {
    return env.AI
  }

  if (config.gracefulDegradation && config.environment !== "production") {
    console.warn("⚠️  AI binding not available, AI features disabled")
    return null
  }

  throw createApiError(503, "AI service not available")
}

/**
 * Safe getter for Analytics binding with fallback handling
 */
export function getAnalyticsBinding(env: CloudflareEnv): AnalyticsEngineDataset | null {
  const config = getEnvironmentConfig()

  if (env.ANALYTICS) {
    return env.ANALYTICS
  }

  if (config.gracefulDegradation && config.environment !== "production") {
    console.warn("⚠️  Analytics binding not available, analytics disabled")
    return null
  }

  throw createApiError(503, "Analytics service not available")
}

/**
 * Environment variable helpers
 */
export function getEnvironmentVariable(name: string, required = false): string | undefined {
  const value = process.env[name]

  if (required && !value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }

  return value
}

/**
 * Check if we're running in a development environment
 */
export function isDevelopment(): boolean {
  return getEnvironmentConfig().environment === "development"
}

/**
 * Check if we're running in a production environment
 */
export function isProduction(): boolean {
  return getEnvironmentConfig().environment === "production"
}

/**
 * Check if mock data should be allowed
 */
export function shouldAllowMockData(): boolean {
  return getEnvironmentConfig().allowMockData
}
