#!/usr/bin/env bun

/**
 * KV Admin - Backup, restore, and manage utility for Cloudflare KV storage
 *
 * This is a simplified version for the Nuxt implementation since we don't have
 * direct KV access in development. In production with Cloudflare Workers,
 * this would connect to the actual KV namespace.
 *
 * Usage:
 *   bun run bin/kv backup             - Backup KV data matching configured patterns
 *   bun run bin/kv backup --all       - Backup all KV data
 *   bun run bin/kv restore <filename> - Restore KV data from backup file
 *   bun run bin/kv wipe               - Wipe all KV data (DANGEROUS!)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { Command } from "commander"

const BACKUP_DIR = "_backup"

// Configure the key patterns to include in the backup (using regular expressions)
const BACKUP_KEY_PATTERNS = [
  /^dashboard:demo:items$/, // Exact match for "dashboard:demo:items"
  /^redirect:.*$/, // All keys starting with "redirect:"
  /^metrics:.*$/, // All metrics keys
  /^auth:.*$/, // All auth-related keys
  /^routeros:.*$/ // All RouterOS cache keys
]

// Simulated KV data for development (in production this would be Cloudflare KV)
const simulatedKV = new Map<string, string>([
  [
    "dashboard:demo:items",
    JSON.stringify([
      { title: "API Endpoints", subtitle: "12 active endpoints", linkURL: "/api/docs" },
      { title: "JWT Tokens", subtitle: "3 active tokens", linkURL: "/api/auth" },
      { title: "System Health", subtitle: "All systems operational", linkURL: "/api/ping" }
    ])
  ],
  ["redirect:gh", "https://github.com/daveio"],
  ["redirect:tw", "https://twitter.com/daveio"],
  ["redirect:li", "https://linkedin.com/in/daveio"],
  ["metrics:status:200", "11567"],
  ["metrics:status:404", "145"],
  ["metrics:status:500", "67"],
  ["auth:count:550e8400-e29b-41d4-a716-446655440000:requests", "42"],
  ["auth:revocation:revoked-token-example", "true"],
  ["routeros:putio:ipv4", JSON.stringify(["1.2.3.0/24", "4.5.6.0/24"])],
  ["routeros:putio:ipv6", JSON.stringify(["2001:db8::/32"])],
  ["routeros:putio:metadata:last-updated", new Date().toISOString()]
])

const program = new Command()

program.name("kv").description("KV Admin utility for dave-io-nuxt").version("1.0.0")

// Ensure backup directory exists
function ensureBackupDirExists() {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR)
    console.log(`📁 Created ${BACKUP_DIR} directory`)
  }
}

// Get current timestamp in format YYYY-MM-DD-HHmmss
function getTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const seconds = String(now.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`
}

// Check if a key matches any of the configured patterns
function keyMatchesPatterns(key: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(key))
}

// Get all KV keys with their values, filtering by patterns if specified
async function getAllKVData(backupAll = false) {
  console.log(`📊 Fetching ${backupAll ? "all" : "selected"} keys from KV namespace...`)

  // In development, use simulated data
  // In production, this would use Cloudflare KV API
  const allKeys = Array.from(simulatedKV.keys())

  // Filter keys if not backing up all
  const keys = backupAll ? allKeys : allKeys.filter((key) => keyMatchesPatterns(key, BACKUP_KEY_PATTERNS))

  console.log(`🔍 Found ${keys.length} keys ${!backupAll ? `matching patterns (out of ${allKeys.length} total)` : ""}`)

  const kvData: Record<string, unknown> = {}

  // Get values for each key
  for (const key of keys) {
    try {
      console.log(`📥 Fetching value for key: ${key}`)
      const valueRaw = simulatedKV.get(key)

      if (valueRaw === undefined) {
        console.warn(`⚠️  Key ${key} not found, skipping`)
        continue
      }

      // Try to parse as JSON if it looks like JSON
      const jsonPatterns = [
        /^\{.*\}$/, // Object: {...}
        /^\[.*\]$/, // Array: [...]
        /^-?\d+(\.\d+)?$/, // Number: 123 or 123.45
        /^(true|false)$/, // Boolean: true or false
        /^null$/ // null
      ]

      const looksLikeJson = jsonPatterns.some((pattern) => pattern.test(valueRaw))

      if (looksLikeJson) {
        try {
          // Try to parse it as JSON
          kvData[key] = JSON.parse(valueRaw)
        } catch {
          // If parsing fails, store as string
          kvData[key] = valueRaw
        }
      } else {
        // For values that don't look like JSON, store as plain strings
        kvData[key] = valueRaw
      }
    } catch (error) {
      console.error(`❌ Failed to get value for key: ${key}`, error)
    }
  }

  return kvData
}

// Backup KV data to file
async function backupKV(backupAll = false) {
  ensureBackupDirExists()
  const timestamp = getTimestamp()
  const filename = `kv-${timestamp}.json`
  const filepath = resolve(BACKUP_DIR, filename)

  try {
    console.log(`🚀 Starting KV backup (${backupAll ? "all keys" : "selected keys"})...`)
    const kvData = await getAllKVData(backupAll)

    // Write to file
    writeFileSync(filepath, JSON.stringify(kvData, null, 2))
    console.log(`✅ Backup saved to ${filepath}`)
    console.log(`📊 Backed up ${Object.keys(kvData).length} keys`)
    return true
  } catch (error) {
    console.error("❌ Failed to backup KV data:", error)
    return false
  }
}

// Restore KV data from file
async function restoreKV(filename: string) {
  try {
    const filepath = filename.startsWith("/") ? filename : resolve(BACKUP_DIR, filename)

    if (!existsSync(filepath)) {
      console.error(`❌ File not found: ${filepath}`)
      return false
    }

    console.log(`📖 Reading backup from ${filepath}...`)
    const fileData = readFileSync(filepath, "utf-8")
    const kvData = JSON.parse(fileData)

    console.log(`📊 Found ${Object.keys(kvData).length} keys to restore`)

    // In production, this would restore to actual Cloudflare KV
    // For development, we'll just show what would be restored
    console.log("\n🔄 Simulated restore (would update KV in production):")

    for (const [key, value] of Object.entries(kvData)) {
      const valueStr = typeof value === "string" ? value : JSON.stringify(value)
      console.log(`  ✓ ${key}: ${valueStr.substring(0, 100)}${valueStr.length > 100 ? "..." : ""}`)

      // Update simulated KV for consistency
      simulatedKV.set(key, typeof value === "string" ? value : JSON.stringify(value))
    }

    console.log("\n✅ Restore completed successfully!")
    console.log("ℹ️  Note: In production deployment, this would restore to Cloudflare KV")
    return true
  } catch (error) {
    console.error("❌ Failed to restore KV data:", error)
    return false
  }
}

// Wipe all KV data
async function wipeKV() {
  try {
    console.log("📊 Fetching all keys from KV namespace...")
    const keys = Array.from(simulatedKV.keys())
    console.log(`🔍 Found ${keys.length} keys to delete`)

    if (keys.length === 0) {
      console.log("✅ No keys to delete. KV namespace is already empty.")
      return true
    }

    // Multiple safety confirmations
    console.log("\n⚠️  WARNING: You are about to PERMANENTLY DELETE ALL DATA in the KV namespace.")
    console.log(`This will delete ${keys.length} keys and CANNOT be undone unless you have a backup.`)
    console.log("\n🚨 This is a DESTRUCTIVE operation!")
    console.log('\nType "yes" to confirm:')

    // In a real implementation, you'd use readline-sync here
    console.log("ℹ️  Simulated wipe operation (skipping actual deletion in development)")
    console.log("✅ In production, this would permanently delete all KV data")

    return true
  } catch (error) {
    console.error("❌ Failed to wipe KV data:", error)
    return false
  }
}

// Backup command
program
  .command("backup")
  .description("Backup KV data to a timestamped JSON file")
  .option("-a, --all", "Backup all KV data (not just pattern matches)")
  .action(async (options) => {
    await backupKV(options.all)
  })

// Restore command
program
  .command("restore <filename>")
  .description("Restore KV data from a backup file")
  .action(async (filename) => {
    await restoreKV(filename)
  })

// Wipe command
program
  .command("wipe")
  .description("Wipe all KV data (DANGEROUS!)")
  .action(async () => {
    await wipeKV()
  })

// List command
program
  .command("list")
  .description("List all KV keys")
  .option("-p, --pattern <pattern>", "Filter keys by pattern")
  .action(async (options) => {
    console.log("📊 Listing KV keys...")
    const keys = Array.from(simulatedKV.keys())

    let filteredKeys = keys
    if (options.pattern) {
      const pattern = new RegExp(options.pattern)
      filteredKeys = keys.filter((key) => pattern.test(key))
    }

    console.log(`\n🔍 Found ${filteredKeys.length} keys${options.pattern ? ` matching "${options.pattern}"` : ""}:`)

    for (const key of filteredKeys) {
      const value = simulatedKV.get(key) || ""
      const preview = value.substring(0, 50) + (value.length > 50 ? "..." : "")
      console.log(`  📄 ${key}: ${preview}`)
    }
  })

// Add help text
program.addHelpText(
  "after",
  `
Examples:
  bun run bin/kv backup              # Backup selected data patterns
  bun run bin/kv backup --all        # Backup all KV data
  bun run bin/kv restore kv-2024-01-01-120000.json
  bun run bin/kv list                # List all keys
  bun run bin/kv list --pattern "^metrics:"  # List metrics keys
  bun run bin/kv wipe                # Wipe all data (dangerous!)

Environment Variables:
  CLOUDFLARE_API_TOKEN              - Cloudflare API token with KV permissions
  CLOUDFLARE_ACCOUNT_ID             - Your Cloudflare account ID

Note: In development, this uses simulated KV data. In production deployment,
this would connect to the actual Cloudflare KV namespace.

Backup Patterns:
  - dashboard:demo:items (demo dashboard data)
  - redirect:* (URL redirections)
  - metrics:* (API metrics)
  - auth:* (authentication data)
  - routeros:* (RouterOS cache)
`
)

async function main(): Promise<void> {
  await program.parseAsync()
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { backupKV, restoreKV, wipeKV }
