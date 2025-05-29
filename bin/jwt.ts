#!/usr/bin/env bun
import { Command } from "commander"
import { SignJWT, jwtVerify } from "jose"
import ms from "ms"
import readlineSync from "readline-sync"
import { v4 as uuidv4 } from "uuid"

interface JWTRequest {
  sub: string
  expiresIn?: string
  maxRequests?: number
  description?: string
  noExpiry?: boolean
}

interface TokenMetadata {
  uuid: string
  sub: string
  description?: string
  maxRequests?: number
  createdAt: string
  expiresAt?: string
}

const program = new Command()

program.name("jwt").description("JWT Token Management for dave-io-nuxt").version("3.0.0")

// Environment variable helpers
function getJWTSecret(): string | null {
  return process.env.API_JWT_SECRET || null
}

// Token creation with JOSE library (compatible with our auth system)
async function createToken(options: JWTRequest, secret: string): Promise<{ token: string; metadata: TokenMetadata }> {
  const uuid = uuidv4()
  const now = Math.floor(Date.now() / 1000)
  const createdAt = new Date().toISOString()

  let exp: number | undefined
  let expiresAt: string | undefined

  if (!options.noExpiry) {
    // Default to 30 days if no expiration specified and not explicitly set to no expiry
    const defaultExpiry = options.expiresIn || "30d"
    exp = now + parseExpiration(defaultExpiry)
    expiresAt = new Date(exp * 1000).toISOString()
  }

  const jwtPayload = {
    sub: options.sub,
    iat: now,
    jti: uuid,
    ...(exp && { exp }),
    ...(options.maxRequests && { maxRequests: options.maxRequests })
  }

  // Use JOSE library (same as our auth system)
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(secret)

  const jwt = new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setSubject(options.sub)
    .setJti(uuid)

  if (exp) {
    jwt.setExpirationTime(exp)
  }

  const token = await jwt.sign(secretKey)

  const metadata: TokenMetadata = {
    uuid,
    sub: options.sub,
    description: options.description,
    maxRequests: options.maxRequests,
    createdAt,
    expiresAt
  }

  return { token, metadata }
}

// Parse expiration duration
function parseExpiration(expiresIn: string): number {
  let milliseconds: number | undefined
  try {
    // Use our custom parsing function
    milliseconds = parseCompoundDuration(expiresIn)
  } catch {
    milliseconds = undefined
  }

  if (typeof milliseconds !== "number" || milliseconds <= 0) {
    milliseconds = parseCompoundDuration(expiresIn)
  }

  if (typeof milliseconds !== "number" || milliseconds <= 0) {
    console.error(`❌ Invalid expiration format: ${expiresIn}`)
    process.exit(1)
  }
  return Math.floor(milliseconds / 1000)
}

function parseCompoundDuration(duration: string): number | undefined {
  const units: Record<string, number> = {
    w: 604800000, // week
    d: 86400000, // day
    h: 3600000, // hour
    m: 60000, // minute
    s: 1000 // second
  }

  let total = 0
  const remaining = duration.toLowerCase()
  const regex = /(\d+)([wdhms])/g
  let match: RegExpExecArray | null
  let hasMatches = false

  match = regex.exec(remaining)
  while (match !== null) {
    hasMatches = true
    const value = Number.parseInt(match[1] || "0")
    const unit = match[2] || ""
    if (unit && units[unit as keyof typeof units]) {
      total += value * (units[unit as keyof typeof units] || 0)
    }
    match = regex.exec(remaining)
  }

  return hasMatches ? total : undefined
}

// Verify token command
program
  .command("verify <token>")
  .description("Verify a JWT token")
  .option("--secret <secret>", "JWT secret key")
  .action(async (token, options) => {
    const secret = options.secret || getJWTSecret()
    if (!secret) {
      console.error("❌ JWT secret is required. Set API_JWT_SECRET env var or use --secret option")
      process.exit(1)
    }

    try {
      const encoder = new TextEncoder()
      const secretKey = encoder.encode(secret)

      const { payload } = await jwtVerify(token, secretKey)

      console.log("✅ Token is valid")
      console.log("\n🔍 Token Details:")
      console.log(JSON.stringify(payload, null, 2))

      if (payload.exp) {
        const expiresAt = new Date(payload.exp * 1000)
        const isExpired = expiresAt <= new Date()
        console.log(`\nExpires: ${expiresAt.toISOString()} ${isExpired ? "❌ (EXPIRED)" : "✅ (Valid)"}`)
      } else {
        console.log("\nExpires: ♾️  Never")
      }
    } catch (error) {
      console.error("❌ Token verification failed:", error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

// Create command
program
  .command("create")
  .description("Create a new JWT token")
  .option("-s, --sub <subject>", "Subject (endpoint or user identifier) for the token")
  .option("-e, --expiry <time>", 'Token expiration (e.g., "1h", "7d", "30d") [default: 30d]')
  .option("-m, --max-requests <number>", "Maximum number of requests allowed", (value) => Number.parseInt(value))
  .option("-d, --description <text>", "Description of the token purpose")
  .option("--no-expiry", "Create a token that never expires (requires confirmation)")
  .option("--seriously-no-expiry", "Skip confirmation for no-expiry tokens (use with caution)")
  .option("--secret <secret>", "JWT secret key")
  .option("-i, --interactive", "Interactive mode")
  .action(async (options) => {
    let tokenRequest: JWTRequest
    let secret: string

    if (options.interactive) {
      console.log("\n🔐 Interactive JWT Token Creator\n")

      const sub = readlineSync.question("Enter subject (endpoint or user identifier): ")
      if (!sub) {
        console.error("❌ Subject is required")
        process.exit(1)
      }

      const description = readlineSync.question("Enter description (optional): ") || undefined
      const expiresIn =
        readlineSync.question('Enter expiration (optional, e.g., "1h", "7d") [default: 30d]: ') || undefined
      const maxRequestsStr = readlineSync.question("Enter max requests (optional): ")
      const maxRequests = maxRequestsStr ? Number.parseInt(maxRequestsStr) : undefined

      // Handle no-expiry option in interactive mode
      let noExpiry = false
      if (!expiresIn && readlineSync.keyInYN("Create token without expiration? (NOT RECOMMENDED)")) {
        console.log("⚠️  WARNING: Tokens without expiration can pose security risks!")
        console.log("   They remain valid indefinitely unless explicitly revoked.")
        if (readlineSync.keyInYN("Are you sure you want to create a token without expiration?")) {
          noExpiry = true
        }
      }

      secret = options.secret || getJWTSecret() || readlineSync.question("Enter JWT secret: ", { hideEchoBack: true })

      tokenRequest = { sub, description, expiresIn, maxRequests, noExpiry }
    } else {
      if (!options.sub) {
        console.error("❌ Subject (--sub) is required")
        process.exit(1)
      }

      // Handle no-expiry warnings in command-line mode
      let noExpiry = false
      if (options.noExpiry) {
        // --no-expiry was explicitly specified
        if (!options.seriouslyNoExpiry) {
          // --seriously-no-expiry was NOT specified
          console.log("⚠️  WARNING: You are creating a token without expiration!")
          console.log("   This is NOT RECOMMENDED for security reasons.")
          console.log("   Tokens without expiration remain valid indefinitely unless explicitly revoked.")
          console.log('   Consider using a long expiration period instead (e.g., --expiry "1y").')
          console.log("")
          const confirmed = readlineSync.keyInYN("Are you sure you want to create a token without expiration?")
          if (!confirmed) {
            console.log("❌ Token creation cancelled")
            process.exit(1)
          }
        }
        noExpiry = true
      }

      secret = options.secret || getJWTSecret()
      if (!secret) {
        console.error("❌ JWT secret is required. Set API_JWT_SECRET env var or use --secret option")
        process.exit(1)
      }

      tokenRequest = {
        sub: options.sub,
        description: options.description,
        expiresIn: options.expiry,
        maxRequests: options.maxRequests,
        noExpiry
      }
    }

    try {
      const { token, metadata } = await createToken(tokenRequest, secret)

      console.log("\n✅ JWT Token Created Successfully\n")
      console.log("Token:")
      console.log(token)
      console.log("\nMetadata:")
      console.log(JSON.stringify(metadata, null, 2))

      console.log("\n💡 Usage Examples:")
      console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/auth`)
      console.log(`curl "http://localhost:3000/api/auth?token=${token}"`)

      console.log("\n📋 Test with our API:")
      console.log(`bun run bin/api-test.ts --token "${token}"`)
    } catch (error) {
      console.error("❌ Error creating token:", error)
      process.exit(1)
    }
  })

// Add help text to the main program
program.addHelpText(
  "after",
  `
Commands:
  create              Create a new JWT token
  verify <token>      Verify and inspect a JWT token

Environment Variables:
  API_JWT_SECRET                  JWT secret key

Examples:
  bun jwt create --sub "api:metrics" --description "Metrics access"  # 30d default expiry
  bun jwt create --sub "ai:alt" --max-requests 1000 --expiry "7d"
  bun jwt create --sub "admin" --no-expiry --seriously-no-expiry  # No expiry (dangerous)
  bun jwt create --sub "api" --description "API access" --expiry "1y"
  bun jwt verify "eyJhbGciOiJIUzI1NiJ9..."

Security Notes:
  - Tokens default to 30-day expiration for security
  - Use --no-expiry only for special cases (requires confirmation)
  - Use --seriously-no-expiry to skip confirmation (use with extreme caution)
  - This version is compatible with our Nuxt API authentication system
`
)

async function main(): Promise<void> {
  await program.parseAsync()
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { createToken, parseExpiration }
