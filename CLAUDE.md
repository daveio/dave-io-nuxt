# CLAUDE.md - AI Agent Instructions for dave-io-nuxt

## Project Overview

This is a Nuxt 3 application serving as Dave Williams' personal website with a comprehensive REST API platform. The project migrated from a simple Cloudflare Worker (`../dave-io`) to a full-featured Nuxt application while maintaining complete API compatibility and adding enterprise-grade features including authentication, validation, testing, and deployment automation.

## Core Architecture

### Technology Stack

- **Runtime**: Nuxt 3 with Cloudflare Workers preset (`cloudflare_module`)
- **Authentication**: JWT with JOSE library, hierarchical permission system
- **Validation**: Zod schemas for all API requests/responses with TypeScript integration
- **Testing**: Vitest for unit tests, custom HTTP API test suite with comprehensive endpoint coverage
- **Deployment**: Cloudflare Workers with Wrangler, production-ready configuration
- **Package Manager**: Bun (preferred), npm compatible
- **Code Quality**: Biome for linting/formatting, TypeScript strict mode

### Project Structure

```plaintext
├── server/api/              # API endpoints (Nuxt server routes)
│   ├── _worker-info.get.ts  # Worker runtime information
│   ├── auth.get.ts          # JWT token validation and introspection
│   ├── health.get.ts        # Health check endpoint
│   ├── ping.get.ts          # Simple ping with analytics
│   ├── metrics.get.ts       # API metrics (JSON/YAML/Prometheus)
│   ├── stats.get.ts         # Basic API statistics
│   ├── ai/                  # AI-related endpoints
│   │   ├── alt.get.ts       # Alt-text generation (GET with URL param)
│   │   └── alt.post.ts      # Alt-text generation (POST with body/upload)
│   ├── dashboard/           # Dashboard data feeds
│   │   └── [name].get.ts    # Named dashboard endpoints (demo, hackernews)
│   ├── go/                  # URL redirect service
│   │   └── [slug].get.ts    # Handles /go/gh, /go/tw, /go/li redirects
│   ├── routeros/            # MikroTik RouterOS integration
│   │   ├── cache.get.ts     # Cache status
│   │   ├── putio.get.ts     # Put.io script generation
│   │   └── reset.post.ts    # Cache reset
│   └── tokens/              # Token management
│       └── [uuid]/          # Token operations by UUID
│           ├── [..path].get.ts  # Dynamic token operations
│           ├── usage.get.ts     # Token usage statistics
│           └── revoke.post.ts   # Token revocation
├── server/utils/            # Shared server utilities
│   ├── auth.ts              # JWT verification, permission checking
│   ├── response.ts          # API response helpers, rate limiting, type guards
│   └── schemas.ts           # Zod validation schemas, TypeScript types
├── server/middleware/       # Server middleware
│   ├── cors.ts              # CORS configuration
│   ├── error.ts             # Global error handling and security headers
│   └── shell-scripts.ts     # Shell script responses for curl/wget
├── test/                    # Unit tests
│   ├── auth.test.ts         # Authentication system tests
│   ├── schemas.test.ts      # Schema validation tests
│   └── response.test.ts     # Response utility tests
├── bin/                     # CLI utilities and scripts
│   ├── jwt.ts               # JWT token management CLI
│   ├── api-test.ts          # HTTP API testing suite
│   └── kv.ts                # KV storage backup/restore/management CLI
├── types/                   # TypeScript type definitions
│   └── api.ts               # API types re-exported from schemas
└── public/                  # Static assets
```

## Authentication & Authorization System

### JWT Token Structure

```typescript
interface JWTTokenPayload {
  sub: string        // Subject (permission scope)
  iat: number       // Issued at timestamp
  exp?: number      // Expiration timestamp (optional)
  jti?: string      // JWT ID for revocation tracking
  maxRequests?: number // Request limit for this token
}
```

### Hierarchical Permission System

- **Exact match**: `api:metrics` allows access to `api:metrics` endpoint only
- **Parent permissions**: `api` allows access to ALL `api:*` endpoints
- **Admin permissions**: `admin` and `*` allow access to ALL endpoints
- **Scope format**: `{category}:{resource}` (e.g., `ai:alt`, `api:tokens`, `routeros:cache`)

### Permission Categories

- `api`: Core API functionality (metrics, tokens, auth)
- `ai`: AI services (alt-text generation)
- `routeros`: RouterOS/MikroTik integration
- `dashboard`: Dashboard data feeds
- `admin`: Full system access
- `*`: Wildcard (full access)

### Token Management Workflow

- **Generation**: `bin/jwt.ts create` command with various options
- **Verification**: `bin/jwt.ts verify <token>` command
- **Introspection**: `GET /api/auth` endpoint
- **Revocation**: KV storage blacklist (simulated in development)

## API Endpoint Reference

### Core System Endpoints

#### `GET /api/health`

- **Purpose**: Health check and basic system status
- **Authentication**: None required
- **Response**: System status with timestamps and environment info

#### `GET /api/ping`

- **Purpose**: Simple ping with analytics logging
- **Authentication**: None required
- **Response**: Pong with Cloudflare metadata and request tracking

#### `GET /api/_worker-info`

- **Purpose**: Worker runtime information and capabilities
- **Authentication**: None required
- **Response**: Runtime details, limits, and Cloudflare-specific info

#### `GET /api/auth`

- **Purpose**: JWT token validation and introspection
- **Authentication**: Required (any valid token)
- **Response**: Token details, user info, validation status

#### `GET /api/metrics`

- **Purpose**: Comprehensive API metrics and statistics
- **Authentication**: Required (`api:metrics` or `api` or `admin`)
- **Query Parameters**:
  - `format`: `json` (default), `yaml`, `prometheus`
- **Response**: Request/response statistics, system metrics in specified format

#### `GET /api/stats`

- **Purpose**: Basic API statistics (lightweight version of metrics)
- **Authentication**: None required
- **Response**: Simple request counters and uptime

### AI Service Endpoints

#### `GET /api/ai/alt`

- **Purpose**: Generate alt-text for images via URL parameter
- **Authentication**: Required (`ai:alt`, `ai`, or `admin`)
- **Query Parameters**:
  - `url`: Image URL to process
- **Response**: Generated alt-text with confidence and metadata

#### `POST /api/ai/alt`

- **Purpose**: Generate alt-text for images via body or file upload
- **Authentication**: Required (`ai:alt`, `ai`, or `admin`)
- **Body**: `{ url: string }` or multipart file upload
- **Response**: Generated alt-text with processing metadata

### Dashboard Data Endpoints

#### `GET /api/dashboard/{name}`

- **Purpose**: Retrieve dashboard-specific data feeds
- **Authentication**: Required (`dashboard:{name}`, `dashboard`, or `admin`)
- **Supported Names**:
  - `demo`: Sample dashboard data for testing
  - `hackernews`: Live Hacker News RSS feed parsing
- **Response**: Structured dashboard data with items array

### RouterOS Integration Endpoints

#### `GET /api/routeros/putio`

- **Purpose**: Generate MikroTik RouterOS scripts for Put.io integration
- **Authentication**: Required (`routeros:putio`, `routeros`, or `admin`)
- **Response**: RouterOS script for automated file management

#### `GET /api/routeros/cache`

- **Purpose**: Check RouterOS cache status and statistics
- **Authentication**: Required (`routeros:cache`, `routeros`, or `admin`)
- **Response**: Cache statistics and health information

#### `POST /api/routeros/reset`

- **Purpose**: Reset RouterOS cache (administrative operation)
- **Authentication**: Required (`routeros:reset`, `routeros`, or `admin`)
- **Response**: Cache reset confirmation and new status

### URL Redirect Service

#### `GET /go/{slug}`

- **Purpose**: URL shortening and redirect service with analytics
- **Authentication**: None required
- **Supported Slugs**:
  - `gh`: GitHub profile redirect
  - `tw`: Twitter/X profile redirect
  - `li`: LinkedIn profile redirect
- **Response**: 302 redirect with click tracking

### Token Management Endpoints

#### `GET /api/tokens/{uuid}`

#### `GET /api/tokens/{uuid}/usage`

- **Purpose**: Get detailed token usage information and statistics
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Token usage metrics, request counts, last used timestamps

#### `GET /api/tokens/{uuid}/metrics`

- **Purpose**: Detailed metrics for specific token (alias for usage)
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Token-specific request statistics and performance data

#### `POST /api/tokens/{uuid}/revoke`

- **Purpose**: Revoke a token by UUID (permanent action)
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Revocation confirmation and updated status

## Response Format Standards

### Success Response Structure

```typescript
{
  success: true,
  data?: any,
  message?: string,
  meta?: {
    requestId: string,
    timestamp: string,
    cfRay?: string,
    datacenter?: string,
    country?: string
  },
  timestamp: string
}
```

### Error Response Structure

```typescript
{
  success: false,
  error: string,
  details?: string,
  meta?: {
    requestId: string,
    timestamp: string
  },
  timestamp: string
}
```

## Environment Configuration

### Development Environment

```bash
API_JWT_SECRET=your-jwt-secret-key
```

### Production Environment

```bash
API_JWT_SECRET=production-jwt-secret
CLOUDFLARE_API_TOKEN=cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=cloudflare-account-id
```

### Cloudflare Bindings (wrangler.jsonc)

```json
{
  "kv_namespaces": [{"binding": "DATA", "id": "your-kv-namespace-id"}],
  "d1_databases": [{"binding": "DB", "database_id": "your-d1-database-id"}],
  "ai": {"binding": "AI"},
  "analytics_engine_datasets": [{"binding": "ANALYTICS", "dataset": "your-dataset-name"}]
}
```

### Optional Configuration

```bash
NUXT_PUBLIC_API_BASE_URL=/api  # Public API base URL
```

## Testing Infrastructure

### Unit Testing (Vitest)

- **Location**: `test/` directory
- **Framework**: Vitest with happy-dom environment for browser API simulation
- **Coverage**: Authentication logic, schema validation, response utilities
- **Commands**:
  - `bun run test` - Standard test run
  - `bun run test:ui` - Interactive test UI
  - `bun run test:coverage` - Coverage report

### HTTP API Testing (Custom Suite)

- **Location**: `bin/api-test.ts`
- **Purpose**: End-to-end HTTP testing of all API endpoints
- **Features**:
  - Automatic JWT token generation for testing
  - Comprehensive endpoint testing with authentication
  - Support for different endpoint categories
  - Remote URL testing capability
- **Commands**:
  - `bun run test:api` - Full test suite
  - `bun run test:api --auth-only` - Authentication tests only
  - `bun run test:api --metrics-only` - Metrics endpoint tests
  - `bun run test:api --ai-only` - AI endpoint tests
  - `bun run test:api --dashboard-only` - Dashboard endpoint tests
  - `bun run test:api --routeros-only` - RouterOS endpoint tests
  - `bun run test:api --metrics-formats-only` - Metrics format tests
  - `bun run test:api --url https://example.com` - Test against remote URL

## CLI Tools & Scripts

### JWT Token Management (`bin/jwt.ts`)

Comprehensive JWT token management with interactive and batch modes.

```bash
# Create tokens with various options
bun run bin/jwt.ts create --sub "api:metrics" --description "Metrics access" --expiry "30d"
bun run bin/jwt.ts create --sub "admin" --description "Full access" --no-expiry --seriously-no-expiry

# Token verification
bun run bin/jwt.ts verify "eyJhbGciOiJIUzI1NiJ9..."

# Interactive token creation
bun run bin/jwt.ts create --interactive
```

### API Testing Suite (`bin/api-test.ts`)

Production-ready API testing with comprehensive endpoint coverage.

```bash
# Full test suite against local development
bun run test:api

# Targeted testing
bun run test:api --auth-only --verbose
bun run test:api --metrics-only --url https://production.example.com

# Using existing authentication
bun run test:api --token "existing-jwt-token" --ai-only
```

### KV Storage Management (`bin/kv.ts`)

Production-ready KV storage management with backup/restore capabilities.

```bash
# Backup operations
bun run bin/kv.ts backup                    # Backup selected data patterns
bun run bin/kv.ts backup --all             # Backup all KV data

# Restore operations
bun run bin/kv.ts restore kv-2025-05-29-213826.json

# Management operations
bun run bin/kv.ts list                      # List all KV keys
bun run bin/kv.ts list --pattern "metrics" # Filter by pattern
bun run bin/kv.ts wipe                      # Wipe all data (requires CONFIRM_WIPE=yes)

# Shorthand via npm scripts
bun run kv backup --all
bun run kv restore backup-file.json
```

**Backup Patterns (configurable in script):**

- `dashboard:demo:items` - Demo dashboard data
- `redirect:*` - URL redirections
- `metrics:*` - API metrics cache
- `auth:*` - Authentication data
- `routeros:*` - RouterOS cache

**Security Features:**

- Multiple confirmation prompts for destructive operations
- Pattern-based filtering to prevent accidental data loss
- Environment variable requirement for wipe operations
- Comprehensive error handling and validation

## Security Implementation

### Security Headers

- **CORS**: Configured for `/api/**` routes with appropriate origins
- **Content Security Policy**: Strict policy preventing XSS attacks
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Cache Control**: Disabled for API routes to prevent sensitive data caching

### Rate Limiting

- **Implementation**: In-memory storage for development, KV storage for production
- **Scope**: Per-token rate limiting with configurable limits and time windows
- **Enforcement**: Integrated with JWT authorization middleware
- **Recovery**: Automatic reset based on time windows

### Input Validation & Sanitization

- **Schema Validation**: All API requests validated using Zod schemas
- **Type Safety**: Full TypeScript integration with runtime validation
- **Sanitization**: Input sanitization in response utilities
- **File Upload Validation**: Size limits and type checking for AI endpoints

## Development Workflow

### Quality Assurance Commands

```bash
# Type checking and validation
bun run typecheck          # TypeScript strict checking
bun run lint               # Biome linting
bun run format             # Code formatting

# Testing suite
bun run test               # Unit tests
bun run test:api           # HTTP API tests

# Build and deployment
bun run build              # Production build
bun run preview:cloudflare # Local preview with Wrangler

# Comprehensive check (recommended before commits)
bun check                  # Types + build + format + lint + typecheck
```

### Code Style Guidelines

- **Linter**: Biome (replaces ESLint + Prettier)
- **Formatter**: Biome with consistent configuration
- **TypeScript**: Strict mode enabled with comprehensive type checking
- **Comments**: Minimal commenting, code should be self-documenting
- **Error Handling**: Consistent error patterns with type guards

## Deployment Architecture

### Cloudflare Workers Configuration

- **Preset**: `cloudflare_module` in `nuxt.config.ts`
- **Bindings**: KV storage, D1 database, AI services, Analytics Engine
- **Compatibility**: Latest Cloudflare Workers features enabled
- **Performance**: Optimized bundle with tree-shaking and compression

### Deployment Process

#### Initial Cloudflare Setup

1. **Create Cloudflare Resources:**

   ```bash
   # Create KV namespace
   wrangler kv:namespace create DATA

   # Create D1 database (optional, for future use)
   wrangler d1 create NEXT_API_AUTH_METADATA

   # Create Analytics Engine dataset
   wrangler analytics put NEXT_DAVE_IO_ANALYTICS
   ```
2. **Configure wrangler.jsonc with resource IDs:**

   ```json
   {
     "kv_namespaces": [{"binding": "DATA", "id": "your-kv-namespace-id"}],
     "d1_databases": [{"binding": "DB", "database_id": "your-d1-database-id"}],
     "ai": {"binding": "AI"},
     "analytics_engine_datasets": [{"binding": "ANALYTICS", "dataset": "NEXT_DAVE_IO_ANALYTICS"}]
   }
   ```
3. **Set environment secrets:**

   ```bash
   # Set JWT secret for production
   wrangler secret put API_JWT_SECRET

   # Set any additional production secrets
   wrangler secret put CLOUDFLARE_API_TOKEN    # For KV tool
   wrangler secret put CLOUDFLARE_ACCOUNT_ID   # For KV tool
   ```
4. **Deploy the application:**

   ```bash
   bun run deploy
   ```
5. **Verify deployment:**

   ```bash
   # Test health endpoint
   curl https://your-worker.your-subdomain.workers.dev/api/health

   # Test with production URL
   bun run test:api --url https://your-production-url.com
   ```

#### Ongoing Deployment

1. Make code changes and test locally
2. Run quality checks: `bun check`
3. Deploy: `bun run deploy`
4. Monitor via Cloudflare dashboard

## Key Files for Understanding

### Configuration Files

- `nuxt.config.ts`: Nuxt configuration with Cloudflare preset and route rules
- `wrangler.jsonc`: Cloudflare Workers configuration with bindings
- `vitest.config.ts`: Test configuration with environment setup
- `package.json`: Scripts, dependencies, and project metadata
- `biome.json`: Linting and formatting configuration

### Core Implementation Files

- `server/utils/auth.ts`: JWT authentication and authorization logic
- `server/utils/schemas.ts`: Zod validation schemas and TypeScript types
- `server/utils/response.ts`: Response helpers, rate limiting, type guards
- `server/middleware/error.ts`: Global error handling and security headers
- `server/middleware/shell-scripts.ts`: Curl/wget detection and responses

### API Implementation Examples

- `server/api/auth.get.ts`: Token introspection with comprehensive validation
- `server/api/metrics.get.ts`: Multi-format metrics endpoint (JSON/YAML/Prometheus)
- `server/api/ai/alt.{get,post}.ts`: AI service integration with error handling

## Migration Context

This project maintains complete API compatibility with the original Cloudflare Worker while significantly enhancing:

- **Type Safety**: Full TypeScript integration with Zod runtime validation
- **Testing**: Comprehensive unit and integration test coverage
- **Authentication**: Enhanced JWT system with hierarchical permissions
- **Error Handling**: Consistent error patterns with proper HTTP status codes
- **Developer Experience**: CLI tools, comprehensive documentation, automated workflows
- **Production Readiness**: Security headers, rate limiting, monitoring integration

The architecture demonstrates modern serverless patterns suitable for production deployment while maintaining the simplicity and performance characteristics of the original Worker implementation.

## AI Agent Development Guidelines

When working with this codebase, follow these principles:

### Code Quality

1. **Maintain API Compatibility**: Never break existing endpoint behavior
2. **Follow Authentication Patterns**: Use hierarchical permissions consistently
3. **Validate All Inputs**: Always use Zod schemas for validation
4. **Handle Errors Properly**: Use type guards and consistent error responses
5. **Write Comprehensive Tests**: Add both unit and integration tests

### Type Safety

1. **Leverage TypeScript**: Use strict typing throughout
2. **Avoid `any` Types**: Use proper TypeScript types or `unknown` with type guards
3. **Schema-First Development**: Define Zod schemas before implementation
4. **Export Types**: Make types available through `types/api.ts`

### Testing Requirements

1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Use the HTTP API test suite for endpoint testing
3. **Error Scenarios**: Test both success and failure cases
4. **Authentication**: Test permission hierarchies and token validation

### Performance Considerations

1. **Bundle Size**: Monitor Worker bundle size for Cloudflare limits
2. **Cold Start**: Minimize initialization time for serverless environment
3. **Memory Usage**: Be conscious of memory constraints in Worker runtime
4. **Response Time**: Optimize for fast response times with appropriate caching

### Security Standards

1. **Input Validation**: Never trust user input, validate everything
2. **Authentication**: Verify tokens and permissions for protected endpoints
3. **Rate Limiting**: Implement appropriate rate limiting for all endpoints
4. **Headers**: Include security headers in all responses
5. **Logging**: Log security-relevant events for monitoring

This codebase serves as a reference implementation for production-ready serverless APIs with modern TypeScript, comprehensive testing, and enterprise-grade security features. The architecture balances developer experience with performance and maintainability requirements.

## Next Steps

### Immediate Improvements

1. **Frontend Development**: The current `app.vue` is minimal - consider building actual website content or dashboard UI
2. **D1 Database Integration**: Currently configured but unused - implement for persistent token storage and advanced analytics
3. **Real AI Integration**: Replace simulated AI responses with actual Cloudflare AI Workers for alt-text generation
4. **Enhanced Monitoring**: Add structured logging and alerting integration beyond basic Analytics Engine
5. **Custom Domain Setup**: Configure production domain routing in wrangler.jsonc routes section

### Security Enhancements

1. **Token Rotation**: Implement automatic JWT token rotation and refresh capabilities
2. **IP Allowlisting**: Add IP-based restrictions for sensitive endpoints
3. **Audit Logging**: Enhanced security event logging with KV storage
4. **Rate Limiting Improvements**: Implement distributed rate limiting with better algorithms
5. **Content Validation**: Add file type validation and virus scanning for AI upload endpoints

### Performance Optimizations

1. **Response Caching**: Implement intelligent caching strategies for expensive operations
2. **Bundle Optimization**: Further reduce Worker bundle size for faster cold starts
3. **Edge Analytics**: Leverage Cloudflare's edge analytics for better insights
4. **Compression**: Implement response compression for large payloads
5. **CDN Integration**: Optimize static asset delivery via Cloudflare CDN

### Developer Experience

1. **API Documentation**: Generate OpenAPI/Swagger documentation from Zod schemas
2. **Client SDKs**: Generate TypeScript/JavaScript SDK from API definitions
3. **Development Docker**: Create containerized development environment
4. **CI/CD Pipeline**: Implement GitHub Actions for automated testing and deployment
5. **Monitoring Dashboard**: Build admin dashboard for API metrics and token management

### Architecture Evolution

1. **Microservices**: Consider splitting into domain-specific Workers (auth, ai, metrics)
2. **Event-Driven**: Implement event streaming with Cloudflare Queues
3. **Multi-Tenancy**: Add support for multiple users/organizations
4. **API Versioning**: Implement proper API versioning strategy
5. **WebSocket Support**: Add real-time capabilities with Durable Objects
