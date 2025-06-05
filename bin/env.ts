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
import { Command } from "commander"

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
}

/**
 * Filter environment variables for production deployment
 */
function filterProductionVars(envVars: EnvVars, scriptMode = false): EnvVars {
  const productionVars: EnvVars = {}
  const excludedPrefixes = ["API_DEV_"]
  const excludedKeys = ["CLOUDFLARE_API_KEY", "CLOUDFLARE_EMAIL"]

  for (const [key, value] of Object.entries(envVars)) {
    // Skip development variables
    if (excludedPrefixes.some((prefix) => key.startsWith(prefix))) {
      if (!scriptMode) {
        console.log(`🔇 Skipping development variable: ${key}`)
      }
      continue
    }

    // Skip dangerous legacy authentication
    if (excludedKeys.includes(key)) {
      if (!scriptMode) {
        console.log(`🔒 Skipping insecure variable: ${key}`)
      }
      continue
    }

    // Skip empty values
    if (!value.trim()) {
      if (!scriptMode) {
        console.log(`⚠️  Skipping empty variable: ${key}`)
      }
      continue
    }

    productionVars[key] = value
    if (!scriptMode) {
      console.log(`✅ Including production variable: ${key}`)
    }
  }

  return productionVars
}

/**
 * Deploy a single environment variable using wrangler
 */
async function deploySecret(key: string, value: string, scriptMode = false, useLocal = false): Promise<boolean> {
  try {
    if (!scriptMode) {
      const target = useLocal ? "local" : "remote"
      console.log(`🚀 Deploying secret to ${target}: ${key}`)
    }

    const wranglerArgs = ["bun", "run", "wrangler", "secret", "put", key]
    if (useLocal) {
      wranglerArgs.push("--local")
    } else {
      wranglerArgs.push("--remote")
    }

    const process = spawn(wranglerArgs, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    })

    // Send the secret value via STDIN
    process.stdin?.write(value)
    process.stdin?.end()

    const result = await process.exited

    if (result === 0) {
      if (!scriptMode) {
        console.log(`✅ Successfully deployed: ${key}`)
      }
      return true
    }
    if (!scriptMode) {
      console.error(`❌ Failed to deploy: ${key}`)
    }
    return false
  } catch (error) {
    if (!scriptMode) {
      console.error("❌ Error deploying variable:", key, error)
    }
    return false
  }
}

const program = new Command()

program
  .name("env")
  .description("Deploy Environment Variables to Cloudflare Workers")
  .version("1.0.0")
  .option("--script", "Enable script mode (non-interactive, structured output)")
  .option("--env-file <path>", "Path to environment file", ".env")
  .option("--local", "Deploy to local wrangler dev environment")
  .option("--remote", "Deploy to remote production environment [default]")

// Check if script mode is enabled
function isScriptMode(): boolean {
  return program.opts().script || false
}

// Check if local mode is enabled
function isLocalMode(): boolean {
  return program.opts().local || false
}

/**
 * Main deployment function
 */
async function deployEnvironment(envFilePath: string, scriptMode: boolean, useLocal: boolean): Promise<void> {
  try {
    if (!scriptMode) {
      console.log("🔧 Starting environment deployment...")
      console.log(`📂 Reading environment from: ${envFilePath}`)
    }

    // Parse and validate environment
    const envVars = parseEnvFile(envFilePath)
    validateEnvironment(envVars)

    // Filter for production variables
    const productionVars = filterProductionVars(envVars, scriptMode)

    if (Object.keys(productionVars).length === 0) {
      if (scriptMode) {
        const output = {
          success: true,
          message: "No production variables to deploy",
          deployed: 0,
          total: 0
        }
        console.log(JSON.stringify(output, null, 2))
      } else {
        console.log("⚠️  No production variables to deploy")
      }
      return
    }

    if (!scriptMode) {
      console.log(`📦 Deploying ${Object.keys(productionVars).length} variables...`)
    }

    // Deploy each variable
    const results = await Promise.all(
      Object.entries(productionVars).map(([key, value]) => deploySecret(key, value, scriptMode, useLocal))
    )

    const successCount = results.filter(Boolean).length
    const totalCount = results.length

    if (scriptMode) {
      const output = {
        success: successCount === totalCount,
        deployed: successCount,
        total: totalCount,
        variables: Object.keys(productionVars)
      }
      console.log(JSON.stringify(output, null, 2))
    } else {
      if (successCount === totalCount) {
        console.log(`🎉 Successfully deployed all ${totalCount} variables!`)
      } else {
        console.error(`❌ Deployed ${successCount}/${totalCount} variables. Some deployments failed.`)
      }
    }

    process.exit(successCount === totalCount ? 0 : 1)
  } catch (error) {
    if (scriptMode) {
      const output = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
      console.log(JSON.stringify(output, null, 2))
    } else {
      console.error("💥 Deployment failed:", error instanceof Error ? error.message : error)
    }
    process.exit(1)
  }
}

// CLI action
program.action(async (options) => {
  const envFilePath = join(process.cwd(), options.envFile)
  const scriptMode = isScriptMode()
  const useLocal = isLocalMode()
  await deployEnvironment(envFilePath, scriptMode, useLocal)
})

async function main(): Promise<void> {
  await program.parseAsync()
}

// Run the deployment
if (import.meta.main) {
  main()
}
