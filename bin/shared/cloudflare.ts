/**
 * Shared Cloudflare configuration and client management for CLI tools
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import Cloudflare from "cloudflare"
import { parse as parseJSONC } from "jsonc-parser"

export interface CloudflareConfig {
  apiToken: string
  accountId: string
  databaseId?: string
  kvNamespaceId?: string
}

interface D1Database {
  binding: string
  database_id: string
}

interface KVNamespace {
  binding: string
  id: string
}

export interface CloudflareClientResult {
  client: Cloudflare
  config: CloudflareConfig
}

export interface WranglerConfig {
  databaseId?: string
  kvNamespaceId?: string
}

/**
 * Parse wrangler.jsonc configuration file to extract binding IDs
 */
export function getWranglerConfig(): WranglerConfig {
  try {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc")
    const wranglerContent = readFileSync(wranglerPath, "utf-8")
    const wranglerConfig = parseJSONC(wranglerContent)

    // Extract D1 database ID
    let databaseId: string | undefined
    if (wranglerConfig.d1_databases && Array.isArray(wranglerConfig.d1_databases)) {
      const dbBinding = (wranglerConfig.d1_databases as D1Database[]).find((db) => db.binding === "DB")
      if (dbBinding?.database_id) {
        databaseId = dbBinding.database_id
      }
    }

    // Extract KV namespace ID
    let kvNamespaceId: string | undefined
    if (wranglerConfig.kv_namespaces && Array.isArray(wranglerConfig.kv_namespaces)) {
      const kvBinding = (wranglerConfig.kv_namespaces as KVNamespace[]).find((kv) => kv.binding === "DATA")
      if (kvBinding?.id) {
        kvNamespaceId = kvBinding.id
      }
    }

    return { databaseId, kvNamespaceId }
  } catch (error) {
    console.warn(
      "⚠️  Could not read wrangler.jsonc, using fallback IDs:",
      error instanceof Error ? error.message : String(error)
    )
    return {
      databaseId: "106894e2-1f5c-4979-a777-0b45febbb993",
      kvNamespaceId: "184eca13ac05485d96de48c436a6f5e6"
    }
  }
}

/**
 * Get Cloudflare configuration from environment variables and wrangler.jsonc
 */
export function getCloudflareConfig(includeDatabase = false, includeKV = false): CloudflareConfig {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const wranglerConfig = getWranglerConfig()
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || wranglerConfig.databaseId
  const kvNamespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID || wranglerConfig.kvNamespaceId

  const missingVars: string[] = []

  if (!apiToken) {
    missingVars.push("CLOUDFLARE_API_TOKEN")
  }
  if (!accountId) {
    missingVars.push("CLOUDFLARE_ACCOUNT_ID")
  }
  if (includeDatabase && !databaseId) {
    missingVars.push("CLOUDFLARE_D1_DATABASE_ID")
  }

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables:\n${missingVars.map((v) => `  - ${v}`).join("\n")}`)
  }

  const config: CloudflareConfig = {
    apiToken: apiToken as string,
    accountId: accountId as string
  }

  if (includeDatabase && databaseId) {
    config.databaseId = databaseId
  }

  if (includeKV && kvNamespaceId) {
    config.kvNamespaceId = kvNamespaceId
  }

  return config
}

/**
 * Create a Cloudflare client with configuration
 */
export function createCloudflareClient(includeDatabase = false, includeKV = false): CloudflareClientResult {
  const config = getCloudflareConfig(includeDatabase, includeKV)
  const client = new Cloudflare({ apiToken: config.apiToken })
  return { client, config }
}

/**
 * Create a Cloudflare client with optional configuration (returns null if credentials missing)
 */
export function createOptionalCloudflareClient(
  includeDatabase = false,
  includeKV = false
): CloudflareClientResult | null {
  try {
    return createCloudflareClient(includeDatabase, includeKV)
  } catch {
    return null
  }
}

/**
 * Validate that Cloudflare credentials are configured and return client
 */
export function validateCloudflareConfig(includeDatabase = false, includeKV = false): CloudflareClientResult {
  const result = createOptionalCloudflareClient(includeDatabase, includeKV)

  if (!result) {
    console.error("❌ Cloudflare credentials not configured")
    console.error("   Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID environment variables")
    process.exit(1)
  }

  return result
}

/**
 * Execute D1 database query
 */
export async function executeD1Query(
  client: Cloudflare,
  accountId: string,
  databaseId: string,
  sql: string,
  params: unknown[] = []
): Promise<unknown> {
  try {
    const response = await client.d1.database.query(databaseId, {
      account_id: accountId,
      sql,
      params: params as string[]
    })
    return response
  } catch (error) {
    console.error("D1 query failed:", { sql, params, error })
    throw error
  }
}
