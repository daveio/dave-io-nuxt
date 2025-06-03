#!/usr/bin/env bun

/**
 * KV Admin - Backup, restore, and manage utility for Cloudflare KV storage
 *
 * This tool uses the official Cloudflare SDK to manage KV namespaces via the API.
 * For production operations, set environment variables for authentication.
 *
 * YAML Format: Keys are nested by colon-separated paths for better structure.
 * Example: "metrics:group:5xx" becomes { metrics: { group: { 5xx: "value" } } }
 *
 * Usage:
 *   bun run bin/kv export             - Export KV data to nested YAML in data/kv/
 *   bun run bin/kv export --all       - Export all KV data to nested YAML
 *   bun run bin/kv import <filename>  - Import KV data from nested YAML file
 *   bun run bin/kv list [--pattern]   - List KV keys with optional pattern filtering
 *   bun run bin/kv wipe [--pattern]   - Wipe KV data (optionally matching pattern)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type Cloudflare from "cloudflare"
import { Command } from "commander"
import yaml from "js-yaml"
import JSON5 from "json5"
import { getTimestamp, keyMatchesPatterns, tryParseJson } from "./shared/cli-utils"
import { getWranglerConfig, validateCloudflareConfig } from "./shared/cloudflare"

const EXPORT_DIR = "data/kv"

// Configure the key patterns to include in exports (using regular expressions)
// Updated for new hierarchical schema structure
const EXPORT_KEY_PATTERNS = [
  /^metrics$/, // Single structured metrics object
  /^redirect$/, // Single structured redirect mappings object
  /^dashboard:.*$/, // Dashboard cache data
  /^auth:.*$/, // Auth-related keys (legacy, may be removed)
  /^routeros:.*$/ // RouterOS cache keys (legacy, may be removed)
]

// Get KV namespace ID from wrangler.jsonc or fallback
function getKVNamespaceId(): string {
  const wranglerConfig = getWranglerConfig()
  return process.env.CLOUDFLARE_KV_NAMESPACE_ID || wranglerConfig.kvNamespaceId || "184eca13ac05485d96de48c436a6f5e6"
}

// KV Admin Tool - requires Cloudflare credentials

const program = new Command()

program.name("kv").description("KV Admin utility for dave-io-nuxt").version("1.0.0")

// Fetch all keys from Cloudflare KV namespace
async function fetchAllKeys(cloudflare: Cloudflare, accountId: string): Promise<string[]> {
  const kvNamespaceId = getKVNamespaceId()
  const response = await cloudflare.kv.namespaces.keys.list(kvNamespaceId, { account_id: accountId })
  return response.result?.map((key: { name: string }) => key.name) || []
}

// Fetch values for a list of keys
async function fetchKeyValues(
  cloudflare: Cloudflare,
  accountId: string,
  keys: string[]
): Promise<Record<string, unknown>> {
  const kvData: Record<string, unknown> = {}
  const kvNamespaceId = getKVNamespaceId()

  for (const key of keys) {
    try {
      console.log("📥 Fetching value for key:", key)
      const valueResponse = await cloudflare.kv.namespaces.values.get(kvNamespaceId, key, { account_id: accountId })

      if (valueResponse) {
        const valueStr = await valueResponse.text()
        kvData[key] = tryParseJson(valueStr)
      }
    } catch (error) {
      console.error("❌ Failed to get value for key:", key, error)
    }
  }

  return kvData
}

// Filter keys based on export patterns
function filterKeys(allKeys: string[], exportAll: boolean): string[] {
  return exportAll ? allKeys : allKeys.filter((key: string) => keyMatchesPatterns(key, EXPORT_KEY_PATTERNS))
}

// Convert flat KV data to nested structure based on colon-separated keys
function convertToNestedStructure(flatData: Record<string, unknown>): Record<string, unknown> {
  // Use Object.create(null) to avoid prototype pollution
  const nested = Object.create(null) as Record<string, unknown>

  // Prototype pollution protection
  const isPrototypePollutionKey = (key: string): boolean => {
    return key === "__proto__" || key === "constructor" || key === "prototype"
  }

  for (const [key, value] of Object.entries(flatData)) {
    if (isPrototypePollutionKey(key)) {
      continue
    } // Skip dangerous keys entirely

    const parts = key.split(":").filter((part) => part.length > 0 && !isPrototypePollutionKey(part))
    if (parts.length === 0) {
      continue
    }

    let current = nested

    // Navigate/create the nested structure safely
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part && !isPrototypePollutionKey(part) && !Object.hasOwn(current, part)) {
        current[part] = Object.create(null) as Record<string, unknown>
      }
      if (part && !isPrototypePollutionKey(part) && current[part] && typeof current[part] === "object") {
        const nextCurrent = current[part]
        if (nextCurrent && typeof nextCurrent === "object" && !Array.isArray(nextCurrent)) {
          current = nextCurrent as Record<string, unknown>
        } else {
          break // Exit if we can't navigate further
        }
      } else if (part) {
        break // Exit if we can't navigate further
      }
    }

    // Set the final value safely
    const finalKey = parts[parts.length - 1]
    if (finalKey && !isPrototypePollutionKey(finalKey)) {
      current[finalKey] = value
    }
  }

  return nested
}

// Convert nested structure back to flat KV keys
function convertToFlatStructure(nestedData: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(nestedData)) {
    if (!key) {
      continue
    } // Skip empty keys

    const fullKey = prefix ? `${prefix}:${key}` : key

    // Check if value is a nested object (either regular object or null-prototype object)
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.constructor === Object || Object.getPrototypeOf(value) === null)
    ) {
      // Recursively flatten nested objects
      Object.assign(flat, convertToFlatStructure(value as Record<string, unknown>, fullKey))
    } else {
      // Leaf value - store with the full key
      flat[fullKey] = value
    }
  }

  return flat
}

// Get all KV keys with their values, filtering by patterns if specified
async function getAllKVData(exportAll = false) {
  console.log(`📊 Fetching ${exportAll ? "all" : "selected"} keys from KV namespace...`)

  const { client: cloudflare, config } = validateCloudflareConfig(false, true)

  try {
    const allKeys = await fetchAllKeys(cloudflare, config.accountId)
    const keys = filterKeys(allKeys, exportAll)

    console.log(`🔍 Found ${keys.length} keys ${exportAll ? "" : `matching patterns (out of ${allKeys.length} total)`}`)

    return await fetchKeyValues(cloudflare, config.accountId, keys)
  } catch (error) {
    console.error("❌ Failed to fetch keys from Cloudflare KV:", error)
    throw error
  }
}

// Wipe all KV data
async function wipeKV(dryRun = false) {
  try {
    const { client: cloudflare, config } = validateCloudflareConfig(false, true)
    const kvNamespaceId = getKVNamespaceId()

    // Real KV wipe using Cloudflare SDK
    console.log(`📊 Fetching all keys from Cloudflare KV${dryRun ? " [DRY RUN]" : ""}...`)
    const response = await cloudflare.kv.namespaces.keys.list(kvNamespaceId, { account_id: config.accountId })
    const keys = response.result?.map((key: { name: string }) => key.name) || []

    console.log(`🔍 Found ${keys.length} keys${dryRun ? " that would be deleted" : " to delete"}`)

    if (keys.length === 0) {
      console.log("✅ No keys to delete. KV namespace is already empty.")
      return true
    }

    if (dryRun) {
      console.log("\n🔍 Keys that would be deleted:")
      for (const key of keys.slice(0, 20)) {
        console.log(`  - ${key}`)
      }
      if (keys.length > 20) {
        console.log(`  ... and ${keys.length - 20} more keys`)
      }
      console.log(`\n📊 Total: ${keys.length} keys would be permanently deleted`)
      return true
    }

    // Multiple safety confirmations
    console.log("\n⚠️  WARNING: You are about to PERMANENTLY DELETE ALL DATA in the KV namespace.")
    console.log(`This will delete ${keys.length} keys and CANNOT be undone unless you have a backup.`)
    console.log("\n🚨 This is a DESTRUCTIVE operation!")

    // For safety, require explicit confirmation
    console.log("ℹ️  Set CONFIRM_WIPE=yes environment variable to proceed with deletion")

    if (process.env.CONFIRM_WIPE !== "yes") {
      console.log("❌ Wipe cancelled - confirmation required")
      return false
    }

    console.log("🗑️  Deleting all keys...")
    let successCount = 0
    let errorCount = 0

    for (const key of keys) {
      try {
        await cloudflare.kv.namespaces.values.delete(kvNamespaceId, key, { account_id: config.accountId })
        console.log("  ✓ Deleted:", key)
        successCount++
      } catch (error) {
        console.error("  ❌ Failed to delete", `${key}:`, error)
        errorCount++
      }
    }

    console.log(`\n✅ Wipe completed! ${successCount} deleted, ${errorCount} errors`)
    return errorCount === 0
  } catch (error) {
    console.error("❌ Failed to wipe KV data:", error)
    return false
  }
}

// Export KV data to YAML in data/kv directory
async function exportKV(exportAll = false, dryRun = false) {
  try {
    console.log(
      `🚀 Starting KV export to YAML (${exportAll ? "all keys" : "selected keys"})${dryRun ? " [DRY RUN]" : ""}...`
    )
    const flatKvData = await getAllKVData(exportAll)

    // Convert flat structure to nested structure for YAML
    const nestedKvData = convertToNestedStructure(flatKvData)

    // Convert numeric strings to actual numbers for better YAML output
    const processedData = JSON5.parse(
      JSON5.stringify(nestedKvData, (_key, value) => {
        // Convert numeric strings to numbers where appropriate
        if (typeof value === "string") {
          // Check if it's a pure integer
          if (/^-?\d+$/.test(value)) {
            const num = Number.parseInt(value, 10)
            if (!Number.isNaN(num) && Math.abs(num) <= Number.MAX_SAFE_INTEGER) {
              return num
            }
          }
          // Check if it's a float
          if (/^-?\d+\.\d+$/.test(value)) {
            const num = Number.parseFloat(value)
            if (!Number.isNaN(num) && Number.isFinite(num)) {
              return num
            }
          }
        }
        return value
      })
    )

    // Convert to YAML with proper numeric handling and anchor support
    const yamlOutput = yaml.dump(processedData, {
      indent: 2,
      lineWidth: 120,
      noRefs: false, // Allow YAML references/anchors
      quotingType: '"',
      sortKeys: true // Sort keys for consistent output
    })

    if (dryRun) {
      console.log(`📊 Would export ${Object.keys(flatKvData).length} keys`)
      console.log("\n🔍 YAML preview (first 500 characters):")
      console.log(yamlOutput.substring(0, 500) + (yamlOutput.length > 500 ? "..." : ""))
      return true
    }

    // Ensure export directory exists
    if (!existsSync(EXPORT_DIR)) {
      mkdirSync(EXPORT_DIR, { recursive: true })
      console.log(`📁 Created ${EXPORT_DIR} directory`)
    }

    const timestamp = getTimestamp()
    const filename = `kv-${timestamp}.yaml`
    const filepath = resolve(EXPORT_DIR, filename)

    // Write to file
    writeFileSync(filepath, yamlOutput, "utf8")
    console.log(`✅ Export saved to ${filepath}`)
    console.log(`📊 Exported ${Object.keys(flatKvData).length} keys`)
    return true
  } catch (error) {
    console.error("❌ Failed to export KV data:", error)
    return false
  }
}

// Check if user has confirmed overwrite via flags or environment
function checkOverwriteConfirmation(options: { yes?: boolean; y?: boolean }): boolean {
  // Check command line flags
  if (options.yes || options.y) {
    return true
  }

  // Check environment variable
  const envVar = process.env.KV_IMPORT_ALLOW_OVERWRITE
  if (envVar && (envVar === "1" || envVar.toLowerCase() === "true")) {
    return true
  }

  return false
}

// Import KV data from YAML file
async function importKV(
  filename: string,
  options: { yes?: boolean; y?: boolean; wipe?: boolean; w?: boolean; dryRun?: boolean }
) {
  try {
    // Resolve file path - support both absolute and relative paths
    let filepath: string
    if (filename.startsWith("/")) {
      filepath = filename
    } else if (filename.startsWith("data/kv/") || filename.startsWith("./data/kv/")) {
      filepath = resolve(filename)
    } else {
      // Assume it's just a filename in the data/kv directory
      filepath = resolve(EXPORT_DIR, filename)
    }

    if (!existsSync(filepath)) {
      console.error(`❌ File not found: ${filepath}`)
      return false
    }

    console.log(`📖 Reading import file from ${filepath}${options.dryRun ? " [DRY RUN]" : ""}...`)
    const fileData = readFileSync(filepath, "utf-8")

    // Parse YAML data with anchor/reference support
    let nestedImportData: Record<string, unknown>
    try {
      nestedImportData = yaml.load(fileData, {
        schema: yaml.DEFAULT_SCHEMA // Support anchors and references
      }) as Record<string, unknown>

      if (!nestedImportData || typeof nestedImportData !== "object") {
        throw new Error("Invalid YAML structure - expected object")
      }

      // Filter out YAML anchor definitions (keys starting with _)
      const filteredData = Object.create(null) as Record<string, unknown>
      for (const [key, value] of Object.entries(nestedImportData)) {
        if (!key.startsWith("_")) {
          filteredData[key] = value
        }
      }
      nestedImportData = filteredData
    } catch (parseError) {
      console.error("❌ Failed to parse YAML:", parseError)
      return false
    }

    // Convert nested structure back to flat KV keys
    const importData = convertToFlatStructure(nestedImportData)
    const importKeys = Object.keys(importData)
    console.log(`📊 Found ${importKeys.length} keys to import`)

    if (importKeys.length === 0) {
      console.log("✅ Nothing to import - file contains no keys")
      return true
    }

    if (options.dryRun) {
      console.log(`📊 Would import ${importKeys.length} keys`)
      console.log("\n🔍 Keys that would be imported:")
      for (const key of importKeys.slice(0, 20)) {
        const value = importData[key]
        const valueStr = typeof value === "string" ? value : JSON5.stringify(value, null, 0)
        const preview = valueStr.substring(0, 50) + (valueStr.length > 50 ? "..." : "")
        console.log(`  - ${key}: ${preview}`)
      }
      if (importKeys.length > 20) {
        console.log(`  ... and ${importKeys.length - 20} more keys`)
      }
      return true
    }

    const { client: cloudflare, config } = validateCloudflareConfig(false, true)
    const kvNamespaceId = getKVNamespaceId()

    // Handle wipe option first
    if (options.wipe || options.w) {
      console.log("🗑️ Wiping KV namespace before import...")
      const wipeSuccess = await wipeKVInternal(cloudflare, config.accountId, kvNamespaceId)
      if (!wipeSuccess) {
        console.error("❌ Failed to wipe KV namespace - aborting import")
        return false
      }
    } else {
      // Check for existing keys that would be overwritten
      console.log("🔍 Checking for existing keys that would be overwritten...")
      const existingKeys = await fetchAllKeys(cloudflare, config.accountId)
      const conflictingKeys = importKeys.filter((key) => existingKeys.includes(key))

      if (conflictingKeys.length > 0) {
        console.log(`⚠️ WARNING: ${conflictingKeys.length} keys will be overwritten:`)
        for (const key of conflictingKeys.slice(0, 10)) {
          console.log(`  - ${key}`)
        }
        if (conflictingKeys.length > 10) {
          console.log(`  ... and ${conflictingKeys.length - 10} more`)
        }

        // Check if user has confirmed overwrite
        if (!checkOverwriteConfirmation(options)) {
          console.log("\n❌ Import cancelled - existing keys would be overwritten")
          console.log("Use one of the following to confirm overwrite:")
          console.log("  --yes or -y flag")
          console.log("  KV_IMPORT_ALLOW_OVERWRITE=1 environment variable")
          console.log("  --wipe or -w flag to clear namespace first")
          return false
        }

        console.log("✅ Overwrite confirmed - proceeding with import")
      }
    }

    // Perform the import
    console.log("\n🔄 Importing to Cloudflare KV...")
    let successCount = 0
    let errorCount = 0

    for (const [key, value] of Object.entries(importData)) {
      try {
        // Use JSON5 for better JSON serialization
        const valueStr = typeof value === "string" ? value : JSON5.stringify(value, null, 0)
        await cloudflare.kv.namespaces.values.update(kvNamespaceId, key, {
          account_id: config.accountId,
          value: valueStr,
          metadata: "{}"
        })
        const preview = valueStr.substring(0, 100) + (valueStr.length > 100 ? "..." : "")
        console.log("  ✓", `${key}:`, preview)
        successCount++
      } catch (error) {
        console.error("  ❌ Failed to import", `${key}:`, error)
        errorCount++
      }
    }

    console.log(`\n✅ Import completed! ${successCount} successful, ${errorCount} errors`)
    return errorCount === 0
  } catch (error) {
    console.error("❌ Failed to import KV data:", error)
    return false
  }
}

// Internal wipe function for import use (without confirmation prompts)
async function wipeKVInternal(cloudflare: Cloudflare, accountId: string, kvNamespaceId: string): Promise<boolean> {
  try {
    const response = await cloudflare.kv.namespaces.keys.list(kvNamespaceId, { account_id: accountId })
    const keys = response.result?.map((key: { name: string }) => key.name) || []

    if (keys.length === 0) {
      console.log("✅ KV namespace is already empty")
      return true
    }

    console.log(`🗑️ Deleting ${keys.length} existing keys...`)
    let successCount = 0
    let errorCount = 0

    for (const key of keys) {
      try {
        await cloudflare.kv.namespaces.values.delete(kvNamespaceId, key, { account_id: accountId })
        successCount++
      } catch (error) {
        console.error("  ❌ Failed to delete", `${key}:`, error)
        errorCount++
      }
    }

    console.log(`✅ Wipe completed! ${successCount} deleted, ${errorCount} errors`)
    return errorCount === 0
  } catch (error) {
    console.error("❌ Failed to wipe KV data:", error)
    return false
  }
}

// Wipe command
program
  .command("wipe")
  .description("Wipe all KV data (DANGEROUS!)")
  .option("-d, --dry-run", "Show what would be deleted without making changes")
  .action(async (options) => {
    await wipeKV(options.dryRun)
  })

// List command
program
  .command("list")
  .description("List all KV keys")
  .option("-p, --pattern <pattern>", "Filter keys by pattern")
  .option("-d, --dry-run", "No effect (list is always read-only)")
  .action(async (options) => {
    try {
      console.log("📊 Listing KV keys...")

      const { client: cloudflare, config } = validateCloudflareConfig(false, true)
      const kvNamespaceId = getKVNamespaceId()

      // Use Cloudflare SDK to list keys
      const response = await cloudflare.kv.namespaces.keys.list(kvNamespaceId, { account_id: config.accountId })
      const keys = response.result?.map((key: { name: string }) => key.name) || []

      let filteredKeys = keys
      if (options.pattern) {
        // Sanitize pattern input to prevent ReDoS attacks
        const sanitizedPattern = options.pattern
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex characters
          .substring(0, 100) // Limit pattern length

        try {
          // Use simple string matching instead of regex for safety
          filteredKeys = keys.filter((key: string) => key.toLowerCase().includes(sanitizedPattern.toLowerCase()))
        } catch {
          console.error("❌ Invalid pattern:", options.pattern)
          return
        }
      }

      console.log(`\n🔍 Found ${filteredKeys.length} keys${options.pattern ? ` matching "${options.pattern}"` : ""}:`)

      for (const key of filteredKeys) {
        try {
          const valueResponse = await cloudflare.kv.namespaces.values.get(kvNamespaceId, key, {
            account_id: config.accountId
          })
          const value = valueResponse ? await valueResponse.text() : ""
          const preview = value.substring(0, 50) + (value.length > 50 ? "..." : "")
          console.log("  📄", `${key}:`, preview)
        } catch {
          console.log("  📄", `${key}: <failed to fetch value>`)
        }
      }
    } catch (error) {
      console.error("❌ Failed to list KV keys:", error)
    }
  })

// Export command
program
  .command("export")
  .description("Export KV data to YAML file in data/kv directory")
  .option("-a, --all", "Export all KV data (not just pattern matches)")
  .option("-d, --dry-run", "Show what would be exported without writing files")
  .action(async (options) => {
    await exportKV(options.all, options.dryRun)
  })

// Import command
program
  .command("import <filename>")
  .description("Import KV data from YAML file")
  .option("-y, --yes", "Skip confirmation for overwriting existing keys")
  .option("-w, --wipe", "Wipe KV namespace before importing")
  .option("-d, --dry-run", "Show what would be imported without making changes")
  .action(async (filename, options) => {
    await importKV(filename, options)
  })

// Add help text
program.addHelpText(
  "after",
  `
Examples:
  bun run bin/kv export              # Export selected data patterns to YAML
  bun run bin/kv export --all        # Export all KV data to YAML
  bun run bin/kv export --dry-run    # Preview what would be exported
  bun run bin/kv import data/kv/kv-20241201-120000.yaml  # Import from YAML
  bun run bin/kv import kv-20241201-120000.yaml --yes    # Import with auto-confirm
  bun run bin/kv import data/kv/backup.yaml --wipe       # Wipe then import
  bun run bin/kv import backup.yaml --dry-run           # Preview what would be imported
  bun run bin/kv list                # List all keys
  bun run bin/kv list --pattern "^metrics:"  # List metrics keys
  bun run bin/kv wipe                # Wipe all data (dangerous!)
  bun run bin/kv wipe --dry-run      # Preview what would be deleted

Environment Variables:
  CLOUDFLARE_API_TOKEN              - Cloudflare API token with KV permissions
  CLOUDFLARE_ACCOUNT_ID             - Your Cloudflare account ID
  KV_IMPORT_ALLOW_OVERWRITE         - Set to "1" or "true" to skip import confirmation

Note: In development, this uses simulated KV data. In production deployment,
this would connect to the actual Cloudflare KV namespace.

Export Patterns (Updated for hierarchical schema):
  - metrics (single structured JSON object with all metrics)
  - redirect (single JSON object with all redirect mappings)
  - dashboard:* (dashboard cache data)
  - auth:* (legacy authentication data)
  - routeros:* (legacy RouterOS cache)
`
)

async function main(): Promise<void> {
  await program.parseAsync()
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { wipeKV, exportKV, importKV }
