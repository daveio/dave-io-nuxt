# CLAUDE.md - AI Agent Instructions

## ⚠️ CRITICAL DEVELOPMENT RULE: TIME AND COST ARE NOT IMPORTANT

Do a good job. Don't try to optimise for how long you take, or how much you spend on API calls. Code quality and completeness are more important.

## ⚠️ CRITICAL DEVELOPMENT RULE: IMPLEMENT TESTS

**EVERYTHING MUST HAVE A TEST**. This is non-negotiable. If you write a function, you must also write a test for it. This ensures that the function works as intended and prevents regressions in the future.

Small functions can be ignored if they are trivial, but anything with logic or side effects must be tested.

Tests should cover all edge cases and error conditions. Use Vitest via `bun run test` for unit tests, and ensure they run successfully before committing your changes.

Frontend can often not be tested effectively; that is acceptable. Backend APIs MUST be tested.

## ⚠️ CRITICAL DEVELOPMENT RULE: KEEP DOCUMENTATION IN SYNC

**`CLAUDE.md` and `README.md` MUST BE KEPT IN SYNC**, though written in different styles for different consumers.

## ⚠️ CRITICAL DEVELOPMENT RULE: USE THE CHECKS

**USE THE QUALITY VERIFICATION TOOLS**. Run them before you consider your work finished, and ensure they pass. **DO NOT SKIP THEM**.

If you must skip them due to scoping or resource limitation, add a TODO to come back to it. Remember to always use the term "TODO" in TODO comments.

- `bun run lint` - linting with Trunk and Biome
- `bun run typecheck` - TypeScript type checking
- `bun run test` - unit tests with Vitest

## ⚠️ CRITICAL DEVELOPMENT RULE: COMMIT AFTER CHANGES

**COMMIT AFTER EVERY SIGNIFICANT BLOCK OF WORK**.

Use `git add -A . && oco --fgm --yes` to commit changes after completing a feature, fixing a bug, or making significant updates. This ensures that all work is tracked and recoverable. This command will automatically generate you a commit message based on the changes made, so you don't have to worry about writing it yourself.

If `git add -A . && oco --fgm --yes` fails, run `git add -A . && git commit -am "[commit_message]"` to manually commit your changes. Replace `[commit_message]` with a descriptive message about the changes made. Keep to a single line. Include a single emoji at the start of the message to indicate the type of change (e.g., 🐛 for bug fixes, ✨ for new features, 🔧 for improvements).

## ⚠️ CRITICAL DEVELOPMENT RULE: ABSOLUTELY NO MOCK DATA

**ZERO TOLERANCE FOR MOCK DATA, SIMULATIONS, OR FAKE RESPONSES**. Use ONLY real `env.AI.run()`, `env.DATA.get/put()` calls. Mocks or simulations are allowable in tests.

**FORBIDDEN PATTERNS:**

- ❌ `Math.random()` for any data generation
- ❌ Hardcoded success rates, percentages, or metrics (e.g., "99.2%", "99.9%")
- ❌ Mock time series data or fake chart data
- ❌ Simulated delays or processing times
- ❌ Default fallback values that mask missing real data
- ❌ Graceful degradation that returns fake data
- ❌ "Demo" modes with mock data
- ❌ Any form of data simulation or estimation
- ❌ `shouldAllowMockData()` conditional mock data
- ❌ Try/catch blocks that return fake data instead of re-throwing errors
- ❌ Loading states with placeholder data that looks real
- ❌ Computed properties that generate fake metrics

**REQUIRED BEHAVIOR:**

- ✅ Real service calls with proper error handling
- ✅ Throwing errors when real data is unavailable
- ✅ Documenting service limitations clearly
- ✅ Return proper HTTP error codes when services fail
- ✅ Log errors for debugging without masking them with fake data
- ✅ Components that crash visibly when data is missing
- ✅ APIs that return 500/503 errors instead of mock responses

**RATIONALE:** This app is NOT mission-critical. Errors and failures are ACCEPTABLE. Surfacing problems is MORE IMPORTANT than preserving user experience. Debugging visibility trumps everything else.

**DETECTION CHALLENGE:** Mock patterns are often NOT signposted with obvious keywords. Pattern searches like `grep -r "mock\|fake\|simulate"` will miss many violations. Manual code review is REQUIRED to identify subtle mock patterns like hardcoded calculations, fallback values, or "safe" defaults that mask real service failures.

## ⚠️ CRITICAL DEVELOPMENT RULE: NO DEFERRED IMPLEMENTATIONS

**NOTHING SHALL BE LEFT "FOR LATER" WITHOUT EXPLICIT TODO COMMENTS**. If an implementation is incomplete, placeholder, or deferred, it MUST include a comment containing `TODO`. This includes tests.

**FORBIDDEN PATTERNS:**

- ❌ Throwing generic errors without implementing real functionality
- ❌ Empty function bodies that should be implemented
- ❌ Placeholder comments like "implement later" without TODO
- ❌ Partial implementations that silently do nothing
- ❌ Components that render empty without indicating missing implementation

**REQUIRED BEHAVIOR:**

- ✅ Every incomplete implementation MUST have `// TODO: [specific description]`
- ✅ TODO comments must be specific about what needs implementation
- ✅ Prefer throwing explicit errors over silent incomplete behavior
- ✅ Make incomplete functionality obvious and searchable

**RATIONALE:** Deferred work WILL BE FORGOTTEN unless explicitly marked. TODO comments ensure incomplete implementations are trackable and searchable. Better to crash visibly than silently do nothing.

## Overview

Nuxt 3 + Cloudflare Workers REST API platform. Migrated from simple Worker to enterprise-grade application with authentication, validation, testing, deployment automation.

## Tech Stack

**Runtime**: Nuxt 3 + Cloudflare Workers (`cloudflare_module`)
**Auth**: JWT + JOSE, hierarchical permissions
**Validation**: Zod schemas + TypeScript
**Testing**: Vitest + custom HTTP API suite
**Tools**: Bun, Biome, TypeScript strict

## Structure

**Key Paths**:

- `server/api/` - API endpoints
- `server/utils/` - Auth, response helpers, schemas
- `bin/` - CLI tools (jwt.ts, kv.ts, api-test.ts)

## Authentication

**Dual Methods**: Bearer tokens (`Authorization: Bearer <jwt>`) + URL params (`?token=<jwt>`)
**JWT Structure**: `{sub, iat, exp?, jti?, maxRequests?}`
**Hierarchical Permissions**: `category:resource` format. Parent permissions grant child access. `admin`/`*` = full access.
**Categories**: `api`, `ai`, `dashboard`, `admin`, `*`

## Endpoints

**Public** (4): `/api/internal/health`, `/api/internal/ping`, `/api/internal/worker`, `/go/{slug}`
**Protected**: All others require JWT with appropriate scope
**Key Protected**:

- `/api/internal/auth` - Token validation (any token)
- `/api/internal/metrics` - API metrics (`api:metrics`+)
- `/api/ai/alt` - Alt-text generation (`ai:alt`+)
- `/api/tokens/{uuid}/*` - Token management (`api:tokens`+)

**Token Management**: Use `bin/jwt.ts` for create/verify/list/revoke operations

## Key APIs

**Core**: `/api/internal/health`, `/api/internal/ping`, `/api/internal/auth`, `/api/internal/metrics` (json/yaml/prometheus)
**AI**: `/api/ai/alt` (GET url param, POST body/upload)
**Tokens**: `/api/tokens/{uuid}/usage`, `/api/tokens/{uuid}/revoke`
**Redirects**: `/go/{slug}` (gh/tw/li)

## Metrics

**Storage**: KV-based metrics for fast dashboard queries
**Counters**: Request tracking, redirect clicks, auth events, AI operations
**Functionality**: Real-time KV storage with hierarchical keys, automatic aggregation

## Response Format

**Success**: `{success: true, data?, message?, meta?, timestamp}`
**Error**: `{success: false, error, details?, meta?, timestamp}`
**Meta**: Contains requestId, timestamp, cfRay, datacenter, country

## Config

**Env**: `API_JWT_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
**Bindings**: KV (DATA), D1 (DB), AI
**Optional**: `NUXT_PUBLIC_API_BASE_URL=/api`
**Dev Options**:

- `API_DEV_USE_DANGEROUS_GLOBAL_KEY=1` - Use legacy API key authentication (requires `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`)

## Testing

**Unit**: Vitest + happy-dom in `test/` - `bun run test|test:ui|test:coverage`
**HTTP API**: `bin/api-test.ts` - End-to-end testing - `bun run test:api [--auth-only|--ai-only|etc]`
**Remote**: `bun run test:api --url https://example.com`

## CLI Tools

**JWT** (`bin/jwt.ts`): `init|create|verify|list|show|search|revoke` - D1 + KV integration
**API Test** (`bin/api-test.ts`): Comprehensive endpoint testing
**KV** (`bin/kv.ts`): `backup|restore|list|wipe` - Pattern-based with safeguards
**Deploy Env** (`bin/deploy-env.ts`): Secure production environment deployment - validates configuration, filters dev variables, deploys via wrangler

## Security

**Headers**: CORS, CSP, security headers, cache control disabled for APIs
**Validation**: Zod schemas for all inputs, TypeScript integration, file upload limits

## Development

**Commands**: `bun check` (comprehensive), `bun run typecheck|lint|format|test|test:api|build`
**Deployment**: `bun run deploy:env` (environment variables), `bun run deploy` (full deployment)
**Style**: Biome linting/formatting, TypeScript strict, minimal comments, consistent error patterns

## Linting & Type Guidelines

**TypeScript `any` Types**:

- Prefer specific types whenever possible
- Use `any` when necessary for external libraries or complex dynamic structures
- Consider `: any` AND `as any`
- **ALWAYS** add Biome ignore comment when using `any`: `// biome-ignore lint/suspicious/noExplicitAny: [REASON FOR ANY TYPE USAGE]`

**Unused Variables/Functions**:

- Commonly flagged when used in Vue templates only
- Verify template usage, then add ignore comment: `// biome-ignore lint/correctness/noUnusedVariables: [REASON FOR LINTER CONFUSION]`
- Example reasons: "Used in template", "Vue composition API reactive", "Required by framework"

## Deployment

**Setup**: Create KV/D1 resources, configure `wrangler.jsonc`, set secrets
**Environment**: `bun run deploy:env` - validates config, excludes API_DEV_* vars, requires CLOUDFLARE_API_TOKEN
**Process**: `bun check` → `bun run deploy:env` → `bun run deploy` → monitor
**Verification**: Test `/api/health` and run `bun run test:api --url production-url`

**Environment Deployment Safety**:

- Only deploys production-safe variables from `.env`
- Validates required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `API_JWT_SECRET`
- Excludes all `API_DEV_*` variables and legacy `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL`
- Uses secure wrangler secret deployment via STDIN

## Key Files

**Config**: `nuxt.config.ts`, `wrangler.jsonc`, `vitest.config.ts`, `biome.json`
**Core**: `server/utils/{auth,schemas,response}.ts`, `server/middleware/{error,shell-scripts}.ts`
**Examples**: `server/api/internal/{auth,metrics}.get.ts`, `server/api/ai/alt.{get,post}.ts`

## Migration Context

Maintains API compatibility with original Worker while adding: TypeScript + Zod validation, comprehensive testing, enhanced JWT auth, consistent error handling, CLI tools, security headers.

## Documentation Guidelines

1. README: Friendly, sardonic tone reflecting Dave's personality
2. Technical accuracy: Test all examples and commands
3. Comprehensive coverage with examples
4. Update CLAUDE.md and README.md after significant work

## AI Agent Guidelines

**Code Quality**: Maintain API compatibility, use hierarchical auth, Zod validation, type guards, comprehensive tests
**Type Safety**: TypeScript strict, avoid `any`, schema-first development, export types via `types/api.ts`
**Testing**: Unit + integration tests, test auth hierarchies and error scenarios
**Performance**: Monitor bundle size, minimize cold starts, optimize caching
**Security**: Validate all inputs, verify tokens/permissions, security headers, log security events

Reference implementation for production-ready serverless APIs with TypeScript, testing, enterprise security.

## KV Metrics System

**Storage**: Single KV-based metrics storage for performance and simplicity
**Key Structure**: Simplified hierarchical patterns (`redirect:[slug]`, `metrics:[resource]:hit:ok`)
**Counters**: Resource-based tracking with hit/auth/visitor classification
**Helpers**: Standardized counter creation functions for different event types
**Performance**: Fast reads for dashboard queries, optimized for Cloudflare Workers edge compute

### KV Hierarchy

**Redirect Storage**: `redirect:[slug]` stores target URLs
**Redirect Metrics**: `metrics:redirect:[slug]` tracks click counts
**API Metrics**: `metrics:[resource]:hit:ok/error/total` tracks request success/failure
**Auth Metrics**: `metrics:[resource]:auth:succeeded/failed` tracks authentication events
**Visitor Metrics**: `metrics:[resource]:visitor:human/bot/unknown` tracks visitor classification
**Dashboard Cache**: `dashboard:hackernews:cache` and `dashboard:hackernews:last-updated` for Hacker News data

**Resource Extraction**: First URL segment after `/api/` (e.g., `/api/auth` → `auth` resource)
**User Agent Classification**: Automatic bot/human/unknown classification based on user agent patterns
**Metrics Middleware**: Centralized metrics collection via helper functions for all API endpoints

## Next Steps

**Immediate**: Frontend dev, enhanced monitoring, JWT management dashboard
**Security**: Token rotation, IP allowlisting, audit logging, content validation
**Performance**: Response caching, bundle optimization, compression, CDN
**DevEx**: OpenAPI docs, client SDKs, Docker dev env, CI/CD, monitoring dashboard
**Architecture**: Microservices, event-driven (Queues), multi-tenancy, API versioning, WebSockets (Durable Objects)

**Completed**: ✅ D1 integration, ✅ Code quality, ✅ Real AI integration, ✅ Custom domain
