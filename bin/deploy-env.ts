#!/usr/bin/env bun

/**
 * Deploy Environment Variables to Production
 *
 * This script reads environment variables from .env and deploys them to Cloudflare Workers
 * using wrangler secret put. It validates configuration and filters out development-only
 * variables.
 *
 * Safety features:
 * - Only deploys production-safe variables
 * - Validates required configuration
 * - Prevents deployment of API_DEV_* variables
 * - Ensures secure API token usage over legacy API key
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawn } from "bun"

interface EnvVars {
  [key: string]: string
}

/**
 * Parse .env file into key-value pairs
 */
function parseEnvFile(filePath: string): EnvVars {
  if (!existsSync(filePath)) {
    throw new Error(`Environment file not found: ${filePath}`)
  }

  const envContent = readFileSync(filePath, "utf-8")
  const envVars: EnvVars = {}

  for (const line of envContent.split("\n")) {
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue
    }

    const equalIndex = trimmedLine.indexOf("=")
    if (equalIndex === -1) {
      continue
    }

    const key = trimmedLine.slice(0, equalIndex).trim()
    let value = trimmedLine.slice(equalIndex + 1).trim()

    // Remove quotes from value if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    envVars[key] = value
  }

  return envVars
}

/**
 * Validate environment configuration for production deployment
 */
function validateEnvironment(envVars: EnvVars): void {
  const requiredVars = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "API_JWT_SECRET"]
  const missingVars = requiredVars.filter((varName) => !envVars[varName])

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`)
  }

  // Check for dangerous API key configuration
  if (
    (envVars.CLOUDFLARE_API_KEY || envVars.CLOUDFLARE_EMAIL) &&
    (!envVars.CLOUDFLARE_API_TOKEN || !envVars.CLOUDFLARE_ACCOUNT_ID)
  ) {
    throw new Error(
      "API key and email are configured but missing CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. " +
        "Production deployment requires secure API token authentication."
    )
  }

  console.log("✅ Environment validation passed")
}

/**
 * Filter environment variables for production deployment
 */
function filterProductionVars(envVars: EnvVars): EnvVars {
  const productionVars: EnvVars = {}
  const excludedPrefixes = ["API_DEV_"]
  const excludedKeys = ["CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL"]

  for (const [key, value] of Object.entries(envVars)) {
    // Skip development variables
    if (excludedPrefixes.some((prefix) => key.startsWith(prefix))) {
      console.log(`🔇 Skipping development variable: ${key}`)
      continue
    }

    // Skip dangerous legacy authentication
    if (excludedKeys.includes(key)) {
      console.log(`🔒 Skipping insecure variable: ${key}`)
      continue
    }

    // Skip empty values
    if (!value.trim()) {
      console.log(`⚠️  Skipping empty variable: ${key}`)
      continue
    }

    productionVars[key] = value
    console.log(`✅ Including production variable: ${key}`)
  }

  return productionVars
}

/**
 * Deploy a single environment variable using wrangler
 */
async function deploySecret(key: string, value: string): Promise<boolean> {
  try {
    console.log(`🚀 Deploying secret: ${key}`)

    const process = spawn(["bun", "run", "wrangler", "secret", "put", key], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    })

    // Send the secret value via STDIN
    process.stdin?.write(value)
    process.stdin?.end()

    const result = await process.exited

    if (result === 0) {
      console.log(`✅ Successfully deployed: ${key}`)
      return true
    }
    console.error(`❌ Failed to deploy: ${key}`)
    return false
  } catch (error) {
    console.error("❌ Error deploying variable:", key, error)
    return false
  }
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
  try {
    console.log("🔧 Starting environment deployment...")

    const envFilePath = join(process.cwd(), ".env")
    console.log(`📂 Reading environment from: ${envFilePath}`)

    // Parse and validate environment
    const envVars = parseEnvFile(envFilePath)
    validateEnvironment(envVars)

    // Filter for production variables
    const productionVars = filterProductionVars(envVars)

    if (Object.keys(productionVars).length === 0) {
      console.log("⚠️  No production variables to deploy")
      return
    }

    console.log(`📦 Deploying ${Object.keys(productionVars).length} variables...`)

    // Deploy each variable
    const results = await Promise.all(Object.entries(productionVars).map(([key, value]) => deploySecret(key, value)))

    const successCount = results.filter(Boolean).length
    const totalCount = results.length

    if (successCount === totalCount) {
      console.log(`🎉 Successfully deployed all ${totalCount} variables!`)
      process.exit(0)
    } else {
      console.error(`❌ Deployed ${successCount}/${totalCount} variables. Some deployments failed.`)
      process.exit(1)
    }
  } catch (error) {
    console.error("💥 Deployment failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run the deployment
if (import.meta.main) {
  main()
}
