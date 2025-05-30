# CLAUDE.md - AI Agent Instructions

## ⚠️ CRITICAL DEVELOPMENT RULE: ABSOLUTELY NO MOCK DATA

**ZERO TOLERANCE FOR MOCK DATA, SIMULATIONS, OR FAKE RESPONSES**. Use ONLY real `env.ANALYTICS.sql()`, `env.AI.run()`, `env.DATA.get/put()` calls. Mocks or simulations are allowable in tests.

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

**NOTHING SHALL BE LEFT "FOR LATER" WITHOUT EXPLICIT TODO COMMENTS**. If an implementation is incomplete, placeholder, or deferred, it MUST include a comment containing `TODO`.

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
- `pages/analytics/` - Dashboard
- `components/analytics/` - Dashboard components

## Authentication

**Dual Methods**: Bearer tokens (`Authorization: Bearer <jwt>`) + URL params (`?token=<jwt>`)
**JWT Structure**: `{sub, iat, exp?, jti?, maxRequests?}`
**Hierarchical Permissions**: `category:resource` format. Parent permissions grant child access. `admin`/`*` = full access.
**Categories**: `api`, `ai`, `routeros`, `dashboard`, `analytics`, `admin`, `*`

## Endpoints

**Public** (8/22): `/api/health`, `/api/ping`, `/api/_worker-info`, `/api/stats`, `/api/go/{slug}`, `/go/{slug}`
**Protected** (14/22): All others require JWT with appropriate scope
**Key Protected**:

- `/api/auth` - Token validation (any token)
- `/api/metrics` - API metrics (`api:metrics`+)
- `/api/ai/alt` - Alt-text generation (`ai:alt`+)
- `/api/tokens/{uuid}/*` - Token management (`api:tokens`+)
- `/api/analytics*` - Analytics data (`api:analytics`+)
- `/api/routeros/*` - RouterOS integration (`routeros:*`+)

**Token Management**: Use `bin/jwt.ts` for create/verify/list/revoke operations

## Key APIs

**Core**: `/api/health`, `/api/ping`, `/api/auth`, `/api/metrics` (json/yaml/prometheus)
**AI**: `/api/ai/alt` (GET url param, POST body/upload)
**Analytics**: `/api/analytics` (timeRange params), `/api/analytics/realtime` (SSE), `/api/analytics/query` (POST)
**RouterOS**: `/api/routeros/cache`, `/api/routeros/putio`, `/api/routeros/reset`
**Tokens**: `/api/tokens/{uuid}/usage`, `/api/tokens/{uuid}/revoke`
**Redirects**: `/go/{slug}` (gh/tw/li)

## Analytics

**Dashboard**: `/analytics` - Vue 3 + @nuxt/ui + Chart.js
**Features**: Real-time SSE updates, time ranges, interactive charts, filtering
**Metrics**: System overview, redirects, AI ops, auth security, RouterOS, geographic, user agents
**Tech**: Composition API, Pinia, @tanstack/vue-table, EventSource
**Data**: Cloudflare Analytics Engine + KV storage for caching

## Response Format

**Success**: `{success: true, data?, message?, meta?, timestamp}`
**Error**: `{success: false, error, details?, meta?, timestamp}`
**Meta**: Contains requestId, timestamp, cfRay, datacenter, country

## Config

**Env**: `API_JWT_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
**Bindings**: KV (DATA), D1 (DB), AI, Analytics Engine (ANALYTICS)
**Optional**: `NUXT_PUBLIC_API_BASE_URL=/api`
**Dev Options**: 
- `API_DEV_DISABLE_RATE_LIMITS=1` - Disable rate limiting
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
**Rate Limiting**: Per-token limits with KV storage, JWT middleware integration
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

**Setup**: Create KV/D1/Analytics resources, configure `wrangler.jsonc`, set secrets
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
**Examples**: `server/api/{auth,metrics}.get.ts`, `server/api/ai/alt.{get,post}.ts`

## Migration Context

Maintains API compatibility with original Worker while adding: TypeScript + Zod validation, comprehensive testing, enhanced JWT auth, consistent error handling, CLI tools, security headers, rate limiting.

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
**Security**: Validate all inputs, verify tokens/permissions, rate limiting, security headers, log security events

Reference implementation for production-ready serverless APIs with TypeScript, testing, enterprise security.

## Analytics Engine

**Dual Storage**: Analytics Engine (events) + KV (fast metrics)
**Schema**: `blobs[]` (strings, 10 max), `doubles[]` (numbers, 20 max), `indexes[]` (queries, 5 max)
**Event Types**: redirect, auth, ai, ping, routeros with structured field patterns
**KV Keys**: Hierarchical kebab-case (`metrics:requests:total`)
**Query Results**: Positional field names (`blob1`, `double1`, `index1`)
**Guidelines**: Event type first, include user context, use doubles for metrics, dual storage for queryable data

## Next Steps

**Immediate**: Frontend dev, enhanced monitoring, JWT management dashboard
**Security**: Token rotation, IP allowlisting, audit logging, content validation
**Performance**: Response caching, bundle optimization, compression, CDN
**DevEx**: OpenAPI docs, client SDKs, Docker dev env, CI/CD, monitoring dashboard
**Architecture**: Microservices, event-driven (Queues), multi-tenancy, API versioning, WebSockets (Durable Objects)

**Completed**: ✅ D1 integration, ✅ Code quality, ✅ Real AI integration, ✅ Custom domain
