#!/usr/bin/env bun
import { Command } from "commander"
import { createToken } from "./jwt"

const program = new Command()

interface TestResult {
  endpoint: string
  method: string
  status: number
  success: boolean
  response?: any
  error?: string
  duration: number
}

interface TestSuite {
  name: string
  results: TestResult[]
  passed: number
  failed: number
  duration: number
}

class APITester {
  private baseUrl: string
  public tokens: Map<string, string> = new Map()
  private secret: string

  constructor(baseUrl: string = "http://localhost:3000", secret?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "") // Remove trailing slash
    this.secret = secret || process.env.API_JWT_SECRET || "dev-secret-change-in-production"
  }

  // Generate JWT tokens for testing
  async generateTokens() {
    console.log("🔐 Generating test tokens...")

    try {
      // Admin token (unlimited access)
      const adminToken = await createToken(
        {
          sub: "admin",
          description: "Test admin token",
          expiresIn: "1h"
        },
        this.secret
      )
      this.tokens.set("admin", adminToken.token)

      // API metrics token
      const metricsToken = await createToken(
        {
          sub: "api:metrics",
          description: "Test metrics token",
          expiresIn: "1h"
        },
        this.secret
      )
      this.tokens.set("metrics", metricsToken.token)

      // AI alt-text token
      const aiToken = await createToken(
        {
          sub: "ai:alt",
          description: "Test AI token",
          maxRequests: 100,
          expiresIn: "1h"
        },
        this.secret
      )
      this.tokens.set("ai", aiToken.token)

      // Limited token for rate limiting tests
      const limitedToken = await createToken(
        {
          sub: "api",
          description: "Test limited token",
          maxRequests: 5,
          expiresIn: "1h"
        },
        this.secret
      )
      this.tokens.set("limited", limitedToken.token)

      console.log("✅ Generated tokens for: admin, metrics, ai, limited")
    } catch (error) {
      console.error("❌ Failed to generate tokens:", error)
      throw error
    }
  }

  // Make HTTP request with optional auth
  async makeRequest(
    endpoint: string,
    method: string = "GET",
    token?: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<TestResult> {
    const startTime = Date.now()
    const url = `${this.baseUrl}${endpoint}`

    try {
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers
      }

      if (token) {
        requestHeaders["Authorization"] = `Bearer ${token}`
      }

      const requestInit: RequestInit = {
        method,
        headers: requestHeaders
      }

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        requestInit.body = JSON.stringify(body)
      }

      const response = await fetch(url, requestInit)
      const duration = Date.now() - startTime

      let responseData: any
      const contentType = response.headers.get("content-type")

      if (contentType?.includes("application/json")) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      return {
        endpoint,
        method,
        status: response.status,
        success: response.ok,
        response: responseData,
        duration
      }
    } catch (error) {
      const duration = Date.now() - startTime
      return {
        endpoint,
        method,
        status: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration
      }
    }
  }

  // Test authentication endpoints
  async testAuth(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🔐 Testing Authentication Endpoints...")

    // Test auth endpoint without token
    results.push(await this.makeRequest("/api/auth"))

    // Test auth endpoint with valid token
    results.push(await this.makeRequest("/api/auth", "GET", this.tokens.get("admin")))

    // Test auth endpoint with invalid token
    results.push(await this.makeRequest("/api/auth", "GET", "invalid.token.here"))

    // Test auth endpoint with query parameter token
    const queryToken = this.tokens.get("metrics")
    results.push(await this.makeRequest(`/api/auth?token=${queryToken}`))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Authentication",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test metrics endpoints
  async testMetrics(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n📊 Testing Metrics Endpoints...")

    // Test metrics without auth (should fail)
    results.push(await this.makeRequest("/api/metrics"))

    // Test metrics with valid token
    results.push(await this.makeRequest("/api/metrics", "GET", this.tokens.get("metrics")))

    // Test metrics with admin token (should work)
    results.push(await this.makeRequest("/api/metrics", "GET", this.tokens.get("admin")))

    // Test metrics with wrong permission token (should fail)
    results.push(await this.makeRequest("/api/metrics", "GET", this.tokens.get("ai")))

    // Test different response formats
    results.push(await this.makeRequest("/api/metrics?format=json", "GET", this.tokens.get("metrics")))
    results.push(await this.makeRequest("/api/metrics?format=yaml", "GET", this.tokens.get("metrics")))
    results.push(await this.makeRequest("/api/metrics?format=prometheus", "GET", this.tokens.get("metrics")))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Metrics",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test AI endpoints
  async testAI(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🤖 Testing AI Endpoints...")

    // Test AI alt-text without auth (should fail)
    results.push(await this.makeRequest("/api/ai/alt"))

    // Test AI alt-text GET with image parameter
    results.push(
      await this.makeRequest("/api/ai/alt?image=https://example.com/image.jpg", "GET", this.tokens.get("ai"))
    )

    // Test AI alt-text POST with URL in body
    results.push(
      await this.makeRequest("/api/ai/alt", "POST", this.tokens.get("ai"), {
        url: "https://example.com/test.png"
      })
    )

    // Test AI alt-text with invalid URL
    results.push(await this.makeRequest("/api/ai/alt?image=invalid-url", "GET", this.tokens.get("ai")))

    // Test AI alt-text with wrong permission token (should fail)
    results.push(
      await this.makeRequest("/api/ai/alt?image=https://example.com/image.jpg", "GET", this.tokens.get("metrics"))
    )

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "AI Endpoints",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test redirect endpoints
  async testRedirects(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🔗 Testing Redirect Endpoints...")

    // Test GitHub redirect
    results.push(await this.makeRequest("/go/gh"))

    // Test Twitter redirect
    results.push(await this.makeRequest("/go/tw"))

    // Test LinkedIn redirect
    results.push(await this.makeRequest("/go/li"))

    // Test invalid redirect slug
    results.push(await this.makeRequest("/go/invalid"))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Redirects",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test token management endpoints
  async testTokens(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🎫 Testing Token Management Endpoints...")

    const testUuid = "550e8400-e29b-41d4-a716-446655440000"

    // Test token usage without auth (should fail)
    results.push(await this.makeRequest(`/api/tokens/${testUuid}`))

    // Test token usage with valid auth
    results.push(await this.makeRequest(`/api/tokens/${testUuid}`, "GET", this.tokens.get("admin")))

    // Test token metrics
    results.push(await this.makeRequest(`/api/tokens/${testUuid}/metrics`, "GET", this.tokens.get("admin")))

    // Test token revocation
    results.push(await this.makeRequest(`/api/tokens/${testUuid}/revoke`, "GET", this.tokens.get("admin")))

    // Test invalid UUID format
    results.push(await this.makeRequest("/api/tokens/invalid-uuid", "GET", this.tokens.get("admin")))

    // Test non-existent token
    results.push(
      await this.makeRequest("/api/tokens/11111111-2222-3333-4444-555555555555", "GET", this.tokens.get("admin"))
    )

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Token Management",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test health endpoint
  async testHealth(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n❤️ Testing Health Endpoint...")

    results.push(await this.makeRequest("/api/health"))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Health",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Print test results
  printResults(suites: TestSuite[]) {
    console.log("\n" + "=".repeat(80))
    console.log("🧪 API TEST RESULTS")
    console.log("=".repeat(80))

    let totalPassed = 0
    let totalFailed = 0
    let totalDuration = 0

    for (const suite of suites) {
      totalPassed += suite.passed
      totalFailed += suite.failed
      totalDuration += suite.duration

      const status = suite.failed === 0 ? "✅" : "❌"
      console.log(`\n${status} ${suite.name}: ${suite.passed}/${suite.results.length} passed (${suite.duration}ms)`)

      if (suite.failed > 0) {
        for (const result of suite.results) {
          if (!result.success) {
            console.log(`   ❌ ${result.method} ${result.endpoint} - ${result.status || "ERR"} (${result.duration}ms)`)
            if (result.error) {
              console.log(`      Error: ${result.error}`)
            }
          }
        }
      }
    }

    console.log("\n" + "-".repeat(80))
    console.log(`📊 SUMMARY: ${totalPassed}/${totalPassed + totalFailed} tests passed (${totalDuration}ms total)`)

    if (totalFailed === 0) {
      console.log("🎉 All tests passed!")
    } else {
      console.log(`😞 ${totalFailed} tests failed`)
    }
    console.log("=".repeat(80))

    return totalFailed === 0
  }

  // Test dashboard endpoints
  async testDashboard(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n📊 Testing Dashboard Endpoints...")

    // Test dashboard endpoints
    results.push(await this.makeRequest("/api/dashboard/demo", "GET", this.tokens.get("admin")))
    results.push(await this.makeRequest("/api/dashboard/hacker-news", "GET", this.tokens.get("admin")))
    results.push(await this.makeRequest("/api/dashboard/hackernews", "GET", this.tokens.get("admin")))
    results.push(await this.makeRequest("/api/dashboard/nonexistent", "GET", this.tokens.get("admin")))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Dashboard",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test RouterOS endpoints
  async testRouterOS(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🔧 Testing RouterOS Endpoints...")

    // Test RouterOS endpoints
    results.push(await this.makeRequest("/api/routeros/putio"))
    results.push(await this.makeRequest("/api/routeros/putio?format=json"))
    results.push(await this.makeRequest("/api/routeros/cache"))
    results.push(await this.makeRequest("/api/routeros/reset", "POST", this.tokens.get("admin")))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "RouterOS",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test multiple metrics formats
  async testMetricsFormats(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n📈 Testing Metrics Format Endpoints...")

    // Test all metrics format endpoints
    results.push(await this.makeRequest("/api/metrics/json", "GET", this.tokens.get("metrics")))
    results.push(await this.makeRequest("/api/metrics/yaml", "GET", this.tokens.get("metrics")))
    results.push(await this.makeRequest("/api/metrics/prometheus", "GET", this.tokens.get("metrics")))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Metrics Formats",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Test enhanced token management
  async testTokenManagement(): Promise<TestSuite> {
    const results: TestResult[] = []
    const startTime = Date.now()

    console.log("\n🎫 Testing Enhanced Token Management...")

    const testUuid = "550e8400-e29b-41d4-a716-446655440000"

    // Test token usage endpoint
    results.push(await this.makeRequest(`/api/tokens/${testUuid}/usage`, "GET", this.tokens.get("admin")))

    // Test token revocation endpoint
    results.push(
      await this.makeRequest(`/api/tokens/${testUuid}/revoke`, "POST", this.tokens.get("admin"), {
        revoked: true
      })
    )

    // Test invalid UUID
    results.push(await this.makeRequest("/api/tokens/invalid-uuid/usage", "GET", this.tokens.get("admin")))

    const passed = results.filter((r) => r.success).length
    const failed = results.length - passed

    return {
      name: "Enhanced Token Management",
      results,
      passed,
      failed,
      duration: Date.now() - startTime
    }
  }

  // Run all tests
  async runAllTests(): Promise<boolean> {
    console.log("🚀 Starting API Test Suite")
    console.log(`📍 Testing against: ${this.baseUrl}`)

    await this.generateTokens()

    const suites: TestSuite[] = []

    try {
      suites.push(await this.testHealth())
      suites.push(await this.testAuth())
      suites.push(await this.testMetrics())
      suites.push(await this.testMetricsFormats())
      suites.push(await this.testDashboard())
      suites.push(await this.testRouterOS())
      suites.push(await this.testAI())
      suites.push(await this.testRedirects())
      suites.push(await this.testTokens())
      suites.push(await this.testTokenManagement())
    } catch (error) {
      console.error("❌ Test suite failed:", error)
      return false
    }

    return this.printResults(suites)
  }
}

// CLI interface
program.name("api-test").description("HTTP API Test Suite for dave-io-nuxt").version("1.0.0")

program
  .option("-u, --url <url>", "Base URL for API testing", "http://localhost:3000")
  .option("-s, --secret <secret>", "JWT secret for token generation")
  .option("-t, --token <token>", "Use existing token instead of generating new ones")
  .option("--auth-only", "Test only authentication endpoints")
  .option("--metrics-only", "Test only metrics endpoints")
  .option("--ai-only", "Test only AI endpoints")
  .option("--redirects-only", "Test only redirect endpoints")
  .option("--tokens-only", "Test only token management endpoints")
  .option("--health-only", "Test only health endpoint")
  .option("--dashboard-only", "Test only dashboard endpoints")
  .option("--routeros-only", "Test only RouterOS endpoints")
  .option("--metrics-formats-only", "Test only metrics format endpoints")
  .action(async (options) => {
    const tester = new APITester(options.url, options.secret)

    if (options.token) {
      // Use provided token for all tests
      tester.tokens.set("admin", options.token)
      tester.tokens.set("metrics", options.token)
      tester.tokens.set("ai", options.token)
      tester.tokens.set("limited", options.token)
    }

    let success = false

    try {
      if (options.authOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testAuth()
        success = tester.printResults([suite])
      } else if (options.metricsOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testMetrics()
        success = tester.printResults([suite])
      } else if (options.aiOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testAI()
        success = tester.printResults([suite])
      } else if (options.redirectsOnly) {
        const suite = await tester.testRedirects()
        success = tester.printResults([suite])
      } else if (options.tokensOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testTokens()
        success = tester.printResults([suite])
      } else if (options.healthOnly) {
        const suite = await tester.testHealth()
        success = tester.printResults([suite])
      } else if (options.dashboardOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testDashboard()
        success = tester.printResults([suite])
      } else if (options.routerosOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testRouterOS()
        success = tester.printResults([suite])
      } else if (options.metricsFormatsOnly) {
        if (!options.token) await tester.generateTokens()
        const suite = await tester.testMetricsFormats()
        success = tester.printResults([suite])
      } else {
        success = await tester.runAllTests()
      }
    } catch (error) {
      console.error("❌ Test execution failed:", error)
      process.exit(1)
    }

    process.exit(success ? 0 : 1)
  })

program.addHelpText(
  "after",
  `
Examples:
  bun run test:api                          # Run all tests against localhost:3000
  bun run test:api --url https://dave.io   # Test against production
  bun run test:api --auth-only              # Test only auth endpoints
  bun run test:api --token "eyJhbGci..."    # Use existing token
  bun run test:api --secret "my-secret"     # Use custom JWT secret

Environment Variables:
  API_JWT_SECRET                            # Default JWT secret for token generation

Notes:
  - Tests will generate temporary JWT tokens for testing different permissions
  - Health endpoint tests don't require authentication
  - Redirect tests check for proper redirect responses (3xx status codes)
  - Failed tests will show detailed error information
`
)

async function main(): Promise<void> {
  await program.parseAsync()
}

// Check if this file is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { APITester }
