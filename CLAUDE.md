# CLAUDE.md - AI Agent Instructions for dave-io-nuxt

## Project Overview

This is a Nuxt 3 application that serves as Dave Williams' personal website and provides a comprehensive REST API with enterprise-grade features. The project migrates functionality from a Cloudflare Worker (`../dave-io`) to a full Nuxt application while maintaining API compatibility and adding robust authentication, validation, and testing infrastructure.

## Architecture

### Core Technologies
- **Runtime**: Nuxt 3 with Cloudflare Workers preset (`cloudflare_module`)
- **Authentication**: JWT with JOSE library, hierarchical permissions
- **Validation**: Zod schemas for all API requests/responses
- **Testing**: Vitest for unit tests, custom HTTP API test suite
- **Deployment**: Cloudflare Workers with Wrangler
- **Package Manager**: Bun (preferred), npm compatible

### Directory Structure
```
├── server/api/              # API endpoints (Nuxt server routes)
│   ├── auth.get.ts         # JWT token validation and introspection
│   ├── health.get.ts       # Health check endpoint
│   ├── metrics.get.ts      # API metrics (JSON/YAML/Prometheus)
│   ├── ai/                 # AI-related endpoints
│   │   ├── alt.get.ts      # Alt-text generation (GET with URL param)
│   │   └── alt.post.ts     # Alt-text generation (POST with body/upload)
│   ├── go/                 # URL redirect service
│   │   └── [slug].get.ts   # Handles /go/gh, /go/tw, /go/li redirects
│   └── tokens/             # Token management
│       └── [uuid]/         # Token operations by UUID
│           └── [...path].get.ts # Usage, metrics, revocation
├── server/utils/           # Shared server utilities
│   ├── auth.ts            # JWT verification, permission checking
│   ├── response.ts        # API response helpers, rate limiting
│   └── schemas.ts         # Zod validation schemas
├── server/middleware/      # Server middleware
│   ├── cors.ts           # CORS configuration
│   └── error.ts          # Error handling
├── test/                  # Unit tests
│   ├── auth.test.ts      # Authentication system tests
│   ├── schemas.test.ts   # Schema validation tests
│   └── response.test.ts  # Response utility tests
├── bin/                   # CLI utilities and scripts
│   ├── jwt.ts            # JWT token management CLI
│   └── api-test.ts       # HTTP API testing suite
├── types/                 # TypeScript type definitions
│   └── api.ts            # API types re-exported from schemas
└── public/               # Static assets
```

## Authentication System

### JWT Token Structure
```typescript
interface JWTTokenPayload {
  sub: string        // Subject (permission scope)
  iat: number       // Issued at timestamp
  exp?: number      // Expiration timestamp (optional)
  jti?: string      // JWT ID for revocation
  maxRequests?: number // Request limit for this token
}
```

### Permission Hierarchy
- **Exact match**: `api:metrics` allows access to `api:metrics` endpoint
- **Parent permissions**: `api` allows access to `api:metrics`, `api:tokens`, etc.
- **Admin permissions**: `admin` and `*` allow access to all endpoints
- **Hierarchical format**: `{category}:{resource}` (e.g., `ai:alt`, `api:tokens`)

### Token Management
- Generation: `bin/jwt.ts create` command with various options
- Verification: `bin/jwt.ts verify <token>` command
- Introspection: `GET /api/auth` endpoint
- Revocation: Planned KV storage blacklist (currently simulated)

## API Endpoints

### Core Endpoints

#### `GET /api/health`
- **Purpose**: Health check and basic system info
- **Authentication**: None required
- **Response**: Basic success response with timestamp

#### `GET /api/auth`
- **Purpose**: JWT token validation and introspection
- **Authentication**: Required (any valid token)
- **Response**: Token details, user info, validation status

#### `GET /api/metrics`
- **Purpose**: Comprehensive API metrics and statistics
- **Authentication**: Required (`api:metrics` or `api` or `admin`)
- **Query Parameters**: 
  - `format`: `json` (default), `yaml`, `prometheus`
- **Response**: Request/response statistics, system metrics

### AI Endpoints

#### `GET /api/ai/alt`
- **Purpose**: Generate alt-text for images via URL parameter
- **Authentication**: Required (`ai:alt`, `ai`, or `admin`)
- **Query Parameters**: 
  - `url`: Image URL to process
- **Response**: Generated alt-text and metadata

#### `POST /api/ai/alt`
- **Purpose**: Generate alt-text for images via body or file upload
- **Authentication**: Required (`ai:alt`, `ai`, or `admin`)
- **Body**: `{ url: string }` or file upload
- **Response**: Generated alt-text and metadata

### Redirect Endpoints

#### `GET /go/{slug}`
- **Purpose**: URL shortening and redirect service
- **Authentication**: None required
- **Supported Slugs**:
  - `gh`: GitHub profile
  - `tw`: Twitter/X profile  
  - `li`: LinkedIn profile
- **Response**: 302 redirect with analytics logging

### Token Management

#### `GET /api/tokens/{uuid}`
- **Purpose**: Get token usage information
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Token usage statistics

#### `GET /api/tokens/{uuid}/metrics`
- **Purpose**: Detailed metrics for specific token
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Token-specific request statistics

#### `GET /api/tokens/{uuid}/revoke`
- **Purpose**: Revoke a token by UUID
- **Authentication**: Required (`api:tokens`, `api`, or `admin`)
- **Response**: Revocation confirmation

## Response Format Standards

### Success Response
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

### Error Response
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

## Environment Variables

### Required for Development
```bash
API_JWT_SECRET=your-jwt-secret-key
```

### Required for Production
```bash
API_JWT_SECRET=production-jwt-secret
CLOUDFLARE_API_TOKEN=cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=cloudflare-account-id
CLOUDFLARE_D1_DATABASE_ID=d1-database-id
CLOUDFLARE_KV_NAMESPACE_ID=kv-namespace-id
```

### Optional
```bash
NUXT_PUBLIC_API_BASE_URL=/api  # Public API base URL
```

## Testing Infrastructure

### Unit Tests (Vitest)
- **Location**: `test/` directory
- **Framework**: Vitest with happy-dom environment
- **Coverage**: Authentication, schemas, response utilities
- **Run**: `bun run test`

### HTTP API Tests
- **Location**: `bin/api-test.ts`
- **Purpose**: End-to-end HTTP testing of all API endpoints
- **Features**: JWT token generation, comprehensive endpoint testing
- **Run**: `bun run test:api`

### Test Commands
```bash
bun run test              # Unit tests
bun run test:ui           # Unit tests with UI
bun run test:coverage     # Unit tests with coverage
bun run test:api          # HTTP API tests (local)
bun run test:api --url https://dave.io  # HTTP API tests (remote)
```

## CLI Scripts

### JWT Token Management (`bin/jwt.ts`)
```bash
# Create tokens
bun run bin/jwt.ts create --sub "api:metrics" --expiry "30d"
bun run bin/jwt.ts create --sub "admin" --no-expiry --seriously-no-expiry

# Verify tokens
bun run bin/jwt.ts verify "eyJhbGciOiJIUzI1NiJ9..."

# Interactive mode
bun run bin/jwt.ts create --interactive
```

### API Testing (`bin/api-test.ts`)
```bash
# Full test suite
bun run test:api

# Specific endpoint tests
bun run test:api --auth-only
bun run test:api --metrics-only
bun run test:api --ai-only

# Custom URL
bun run test:api --url https://production.domain.com
```

## Security Considerations

### Headers
- **CORS**: Enabled for `/api/**` routes
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Cache Control**: Disabled for API and redirect routes

### Rate Limiting
- **Implementation**: In-memory for development, KV storage for production
- **Scope**: Per-token rate limiting with configurable limits
- **Enforcement**: Checked during JWT authorization

### Input Validation
- **Schema Validation**: All API requests validated with Zod schemas
- **Sanitization**: Input sanitization in response utilities
- **File Uploads**: Size and type validation for AI endpoints

## Development Workflow

### Common Commands
```bash
# Development
bun run dev              # Start dev server with hot reload
bun run types            # Generate Cloudflare types
bun run nuxt prepare     # Prepare Nuxt

# Quality
bun run typecheck        # TypeScript checking
bun run lint             # Biome linting
bun run format           # Code formatting

# Testing
bun run test             # Unit tests
bun run test:api         # API tests

# Building
bun run build            # Production build
bun run preview:cloudflare  # Preview with Wrangler
```

### Code Style
- **Linter**: Biome
- **Formatter**: Biome
- **TypeScript**: Strict mode enabled
- **Comments**: Minimal, only when necessary for context

## Deployment

### Cloudflare Workers
- **Preset**: `cloudflare_module` in `nuxt.config.ts`
- **Configuration**: `wrangler.jsonc` with bindings for KV, D1, AI, Analytics
- **Command**: `bun run deploy`

### Environment Setup
1. Configure Cloudflare bindings in `wrangler.jsonc`
2. Set environment variables (secrets via `wrangler secret put`)
3. Initialize D1 database schema (if using token storage)
4. Deploy with `bun run deploy`

## Important Files to Understand

### Configuration
- `nuxt.config.ts`: Nuxt configuration with Cloudflare preset
- `wrangler.jsonc`: Cloudflare Workers configuration
- `vitest.config.ts`: Test configuration
- `package.json`: Scripts and dependencies

### Core Logic
- `server/utils/auth.ts`: JWT authentication and authorization
- `server/utils/schemas.ts`: Zod validation schemas
- `server/utils/response.ts`: Response helpers and utilities

### API Implementation
- `server/api/auth.get.ts`: Token introspection
- `server/api/metrics.get.ts`: API metrics endpoint
- `server/api/ai/alt.{get,post}.ts`: AI alt-text generation

## Known Limitations

1. **Rate Limiting**: Currently in-memory (not persistent across requests)
2. **Token Storage**: Simulated D1 database operations (needs real D1 setup)
3. **AI Integration**: Simulated responses (needs real AI service integration)
4. **File Upload**: Basic implementation (needs enhanced validation)

## Migration from ../dave-io

This project maintains API compatibility with the original Cloudflare Worker while adding:
- Type safety with TypeScript and Zod
- Comprehensive testing infrastructure
- Enhanced authentication with hierarchical permissions
- Better error handling and response formatting
- CLI tools for token management and testing

The migration preserves all original endpoints while improving reliability, maintainability, and developer experience.

## AI Agent Guidelines

When working with this codebase:

1. **Maintain API Compatibility**: Preserve existing endpoint behavior
2. **Follow Authentication Patterns**: Use hierarchical permissions consistently
3. **Validate All Inputs**: Use Zod schemas for request/response validation
4. **Write Tests**: Add unit tests for new functionality
5. **Update Documentation**: Keep this file and README.md current
6. **Follow Type Safety**: Leverage TypeScript throughout
7. **Respect Security**: Don't weaken authentication or validation
8. **Test Changes**: Use `bun run test:api` to verify endpoint functionality

This project demonstrates production-ready patterns for API development with modern tooling and comprehensive testing. The architecture supports both development velocity and production reliability.