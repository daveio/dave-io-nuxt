# Dave.io Nuxt Edition 🌟

Welcome to the most spectacularly over-engineered personal website you'll encounter today. This isn't just a website; it's a full-blown API fortress masquerading as a humble Nuxt application. Dave decided his personal site needed JWT authentication, hierarchical permissions, rate limiting, schema validation, backup systems, and enough security features to make Fort Knox feel inadequate.

## What Is This Beautiful Monstrosity?

This is a Nuxt 3 application that combines a personal website with a comprehensive API system. Think of it as two things that probably shouldn't be in the same repo, but here we are:

1. **A Nuxt Website**: Because everyone needs a place to dump their thoughts on the internet
2. **A Production API**: With JWT authentication, hierarchical permissions, and more enterprise features than most actual enterprises

Originally, Dave's site was a simple Cloudflare Worker. But why keep things simple when you can rebuild everything with type safety, comprehensive testing, CLI tools, backup systems, and enough abstractions to make your head spin like a merry-go-round in a tornado?

## Features That Nobody Asked For (But Everyone Secretly Wants)

### 🔐 Enterprise-Grade Authentication

- JWT tokens with hierarchical permissions (`api:metrics`, `ai:alt`, etc.)
- Token introspection and validation endpoints
- Rate limiting per token (because Dave doesn't trust anyone, including himself)
- Token revocation support (for when life gets complicated)
- CLI-based token management with D1 database storage that would make enterprise admins weep with joy
- JSONC configuration parsing because Dave believes in good developer experience
- Graceful fallback when Cloudflare credentials are missing (because sometimes you just want to work offline)

### 🤖 AI Integration (Now With Real AI Magic!)

- Alt-text generation for images (URL or file upload) using Cloudflare AI
- Powered by `@cf/llava-hf/llava-1.5-7b-hf` model (because we don't mess around with fake AI)
- Because accessibility matters, even for personal sites that are way too complicated
- Comprehensive rate limiting (100 requests/hour per token, because Dave doesn't trust anyone)
- File size validation and proper error handling (up to 10MB images)
- Consistent authentication and response formatting across both GET and POST endpoints

### 📊 Metrics & Analytics That Would Make Google Jealous

- Comprehensive API metrics in JSON, YAML, or Prometheus formats
- Request/response statistics with Cloudflare metadata
- Perfect for when you want to obsess over your site's performance
- KV-cached metrics with automatic invalidation

### 🔗 URL Shortening & Redirects

- `/go/gh` → GitHub profile (because typing is genuinely hard)
- `/go/tw` → Twitter/X (when Dave remembers social media exists)
- `/go/li` → LinkedIn (for professional pretenses)
- Click tracking with Analytics Engine integration

### 🛠️ RouterOS Integration (Because Dave Loves Networking)

- MikroTik router script generation
- `/api/routeros/putio` for automated download management
- Cache management and statistics
- Because normal people don't integrate their personal website with their router

### 📱 Dashboard Data Feeds

- Hacker News RSS integration
- Demo data endpoints for testing
- Because even personal sites need dashboards these days

### 💾 KV Storage Management (The Crown Jewel)

- Complete backup and restore system
- Pattern-based data filtering
- Production-ready with multiple safety confirmations
- CLI tool that handles your data with kid gloves

### 🛡️ Security Features That Would Impress the NSA

- CORS headers that actually make sense
- Rate limiting (in-memory for dev, KV storage for production)
- Input sanitization and validation with Zod
- Security headers that would make OWASP shed a single tear of joy
- Shell script responses for curl/wget requests (because Dave has a sense of humor)

## Getting Started (For the Brave and Caffeinated)

### Prerequisites

- **Bun** (because npm is so last decade)
- **Node.js 18+** (if you insist on being traditional)
- **Cloudflare Account** (for the full experience)
- **A sense of humor** (for dealing with Dave's code comments)
- **Coffee** (lots of it)

### Installation

```bash
# Clone this magnificent monstrosity
git clone https://github.com/daveio/dave-io-nuxt.git
cd dave-io-nuxt

# Install dependencies (bun is preferred, but we don't judge)
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your secrets (don't commit them, Dave has trust issues)

# Generate types and prepare Nuxt
bun run types
bun run nuxt prepare

# Start the development server
bun run dev
```

### Environment Variables

Create a `.env` file with these variables (we promise not to judge your naming conventions):

```bash
# JWT Secret (change this, seriously, Dave is watching)
API_JWT_SECRET=your-super-secret-jwt-key-that-definitely-isnt-password123

# Cloudflare credentials (for when you want the full production experience)
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# Public API base URL
NUXT_PUBLIC_API_BASE_URL=/api
```

## API Documentation (The Crown Jewels)

### Authentication (Gateway to the Kingdom)

All protected endpoints require a JWT token. You can provide it via:

- **Authorization header**: `Authorization: Bearer <token>`
- **Query parameter**: `?token=<token>` (for when headers are too mainstream)

### Core Endpoints (The Essentials)

#### `GET /api/health`

The only endpoint that doesn't judge you for not having authentication.

```bash
curl http://localhost:3000/api/health
```

#### `GET /api/ping`

Simple ping endpoint that logs analytics and shows off Cloudflare headers like a peacock.

```bash
curl http://localhost:3000/api/ping
```

#### `GET /api/_worker-info`

Internal Worker runtime information (because transparency is trendy).

```bash
curl http://localhost:3000/api/_worker-info
```

#### `GET /api/auth`

Token introspection and validation. Perfect for existential questions about your JWT's purpose in life.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth
```

#### `GET /api/metrics`

Get comprehensive API metrics in your preferred format (because choice matters).

```bash
# JSON (the sensible default)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics

# YAML (for the hipsters)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics?format=yaml

# Prometheus (for the monitoring-obsessed)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics?format=prometheus
```

#### `GET/POST /api/ai/alt`

Generate alt-text for images. Because accessibility is cooler than avocado toast.

```bash
# Via URL parameter (the lazy way)
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/ai/alt?url=https://example.com/image.jpg"

# Via POST body (the proper way)
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}' \
  http://localhost:3000/api/ai/alt

# File upload (for when you're feeling fancy)
curl -X POST -H "Authorization: Bearer <token>" \
  -F "file=@image.jpg" \
  http://localhost:3000/api/ai/alt
```

### RouterOS Endpoints (For the Network Nerds)

#### `GET /api/routeros/putio`

Generate MikroTik router scripts for automated file management.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/routeros/putio
```

#### `GET /api/routeros/cache`

Check RouterOS cache status.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/routeros/cache
```

#### `POST /api/routeros/reset`

Reset RouterOS cache (the nuclear option).

```bash
curl -X POST -H "Authorization: Bearer <token>" http://localhost:3000/api/routeros/reset
```

### Dashboard Endpoints (Because Data Is Beautiful)

#### `GET /api/dashboard/{name}`

Get dashboard data feeds. Supports `demo` and `hackernews`.

```bash
# Demo data (for testing purposes)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/dashboard/demo

# Hacker News feed (for your daily dose of tech drama)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/dashboard/hackernews
```

### Statistics & Redirects

#### `GET /api/stats`

Get basic API statistics (the lite version of metrics).

```bash
curl http://localhost:3000/api/stats
```

#### `GET /go/{slug}`

URL redirects for the chronically lazy (we've all been there).

- `/go/gh` → Dave's GitHub
- `/go/tw` → Dave's Twitter/X
- `/go/li` → Dave's LinkedIn

### Token Management (Handle With Care)

#### `GET /api/tokens/{uuid}`

Get token usage information.

#### `GET /api/tokens/{uuid}/metrics`

Detailed metrics for a specific token.

#### `GET /api/tokens/{uuid}/usage`

Token usage statistics.

#### `POST /api/tokens/{uuid}/revoke`

Revoke a token (relationship status: it's complicated).

## Scripts & Utilities (Dave's Toolbox)

Dave has lovingly crafted some handy scripts in the `bin/` directory, now with shared modules to eliminate code duplication (because even Dave believes in DRY principles):

### `bin/jwt.ts` - JWT Token Management CLI (Now With Database Powers!)

```bash
# Initialize D1 database schema (one-time setup, like assembling IKEA furniture)
bun jwt init

# Create a new token (with great power...)
bun jwt create --sub "api:metrics" --description "Metrics access" --expiry "30d"

# Create an admin token (comes great responsibility)
bun jwt create --sub "admin" --description "God mode" --no-expiry --seriously-no-expiry

# Verify a token (trust, but verify)
bun jwt verify "eyJhbGciOiJIUzI1NiJ9..."

# List all your beautiful tokens (like a digital collection)
bun jwt list

# Show detailed info about a specific token (for the detail-oriented)
bun jwt show <uuid>

# Search for tokens (because sometimes you forget what you created)
bun jwt search --sub "api"                    # Find by subject
bun jwt search --description "test"           # Find by description
bun jwt search --uuid "123e4567-e89b"         # Find by UUID

# Revoke a token (relationship status: it's complicated)
bun jwt revoke <uuid>
bun jwt revoke <uuid> --confirm               # Skip the dramatic confirmation

# Interactive mode (for the GUI enthusiasts)
bun jwt create --interactive
```

**New Features That Will Make Your Life Better:**

- **Automatic Configuration**: Reads D1 and KV IDs from `wrangler.jsonc` (because hardcoded IDs are so 2023)
- **Environment Override**: Environment variables still win over config files (hierarchy matters)
- **Graceful Degradation**: Works without Cloudflare credentials for basic operations (perfect for offline work)
- **D1 Storage**: Token metadata lives in your production database (persistent and searchable)
- **KV Revocation**: Immediate token blacklisting via KV storage (no waiting around)
- **Smart Error Handling**: Helpful error messages that actually help (revolutionary concept)

### `bin/api-test.ts` - HTTP API Testing Suite

```bash
# Test against local development server
bun run test:api

# Test against production (if you're feeling brave)
bun run test:api --url https://dave.io

# Test specific endpoints (because targeted testing is efficient)
bun run test:api --auth-only
bun run test:api --metrics-only
bun run test:api --ai-only
bun run test:api --dashboard-only
bun run test:api --routeros-only

# Use an existing token (for when you're feeling prepared)
bun run test:api --token "eyJhbGciOiJIUzI1NiJ9..."
```

### `bin/kv.ts` - KV Storage Management (The Data Whisperer)

```bash
# Backup operations (because data loss is not an option)
bun run kv backup                    # Backup selected data patterns
bun run kv backup --all              # Backup everything (YOLO mode)

# Restore operations (for when things go sideways)
bun run kv restore kv-2025-05-29-213826.json

# Management operations (for the control freaks)
bun run kv list                      # List all KV keys
bun run kv list --pattern "metrics" # Filter by pattern
bun run kv wipe                      # Nuclear option (requires CONFIRM_WIPE=yes)
```

**Backup Patterns (because not all data is created equal):**

- `dashboard:demo:items` - Demo dashboard data
- `redirect:*` - URL redirections
- `metrics:*` - API metrics cache
- `auth:*` - Authentication data
- `routeros:*` - RouterOS cache

## Testing (Because Dave Believes in Quality)

```bash
# Run unit tests (the foundation of trust)
bun run test

# Run tests with UI (fancy visual feedback)
bun run test:ui

# Run tests with coverage (for the perfectionists)
bun run test:coverage

# Test the API over HTTP (integration testing at its finest)
bun run test:api

# Type checking and linting (because standards matter)
bun run typecheck
bun run lint
bun run format

# The full monty (what Dave runs before committing, and you should too)
bun check
```

## Deployment (To The Clouds!)

### Development

```bash
bun run dev
```

### Production Build

```bash
bun run build
```

### Cloudflare Workers Deployment (The Big Leagues)

#### Initial Setup (One-Time Pain)

```bash
# Create Cloudflare resources
wrangler kv:namespace create DATA
wrangler d1 create NEXT_API_AUTH_METADATA
wrangler analytics put NEXT_DAVE_IO_ANALYTICS

# Update wrangler.jsonc with the resource IDs
# (Copy the IDs from the output above - the JWT tool will read them automatically)

# Initialize the D1 database schema (because empty databases are useless)
bun jwt init

# Set production secrets
wrangler secret put API_JWT_SECRET
wrangler secret put CLOUDFLARE_API_TOKEN    # For CLI tools and KV management
wrangler secret put CLOUDFLARE_ACCOUNT_ID   # For CLI tools and KV management

# Deploy to the cloud
bun run deploy

# Test your production deployment
bun run test:api --url https://your-worker.your-subdomain.workers.dev

# Create your first production token (you'll need this)
bun jwt create --sub "admin" --description "Production admin access" --expiry "90d"
```

#### Ongoing Deployment (The Daily Grind)

```bash
# Make changes, test locally
bun run dev

# Run quality checks (don't skip this, Dave is watching)
bun check

# Deploy to production
bun run deploy

# Verify everything works
curl https://your-production-url.com/api/health
```

## Project Structure (For the Architecturally Curious)

```plaintext
├── server/                  # The backend kingdom
│   ├── api/                 # API endpoints (the crown jewels)
│   │   ├── auth.get.ts      # JWT validation
│   │   ├── health.get.ts    # Health check
│   │   ├── ping.get.ts      # Simple ping
│   │   ├── metrics.get.ts   # API metrics
│   │   ├── stats.get.ts     # Basic stats
│   │   ├── ai/              # AI endpoints
│   │   │   ├── alt.get.ts   # Alt-text (GET)
│   │   │   └── alt.post.ts  # Alt-text (POST)
│   │   ├── dashboard/       # Dashboard data
│   │   │   └── [name].get.ts # Named dashboards
│   │   ├── go/              # URL redirects
│   │   │   └── [slug].get.ts # Redirect handler
│   │   ├── routeros/        # RouterOS integration
│   │   │   ├── cache.get.ts # Cache status
│   │   │   ├── putio.get.ts # Put.io scripts
│   │   │   └── reset.post.ts # Cache reset
│   │   └── tokens/          # Token management
│   │       └── [uuid]/      # Token operations
│   ├── utils/               # Server utilities (the workhorses)
│   │   ├── auth.ts          # Authentication logic
│   │   ├── response.ts      # Response helpers
│   │   ├── schemas.ts       # Zod validation schemas
│   │   └── environment.ts   # Runtime configuration
│   └── middleware/          # Server middleware (the gatekeepers)
│       ├── cors.ts          # CORS configuration
│       ├── error.ts         # Error handling
│       └── shell-scripts.ts # Shell script responses
├── test/                    # Unit tests (the safety net)
├── bin/                     # CLI scripts (Dave's toolbox)
│   ├── jwt.ts              # JWT token management
│   ├── api-test.ts         # HTTP API testing
│   ├── kv.ts               # KV storage management
│   └── shared/             # Shared CLI utilities (DRY principles in action)
│       ├── cloudflare.ts   # Cloudflare client management
│       └── cli-utils.ts    # Common utilities and helpers
├── types/                   # TypeScript definitions
├── app.vue                  # Minimal frontend (placeholder for now)
└── public/                  # Static assets
```

## Technologies Used (The Foundation)

- **Nuxt 3**: Because Vue is delightful
- **TypeScript**: For when JavaScript isn't painful enough
- **Zod**: Schema validation that actually works
- **JOSE**: JWT handling done right
- **Vitest**: Testing that doesn't make you cry
- **Cloudflare Workers**: Because serverless is the future
- **Bun**: The runtime that makes everything faster
- **Biome**: Linting and formatting that just works
- **Commander**: CLI framework for the command-line warriors

## Contributing (If You Dare)

Found a bug? Want to add a feature? Dave welcomes contributions, but be warned: he has strong opinions about code style and will judge your commit messages.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (and write tests, Dave is definitely watching)
4. Run the test suite (`bun run test && bun run test:api`)
5. Ensure everything passes (`bun check`)
6. Submit a pull request with a description that makes Dave smile
7. Prepare for code review feedback (Dave is thorough)

## License

MIT License - Because sharing is caring, and Dave believes in open source (and good karma).

## Next Steps

### Immediate Improvements

- **Frontend Development**: Build actual website content (the current `app.vue` is a bit lonely)
- **✅ Real AI Integration**: ~~Replace simulated responses with actual Cloudflare AI~~ **DONE!** Now using real Cloudflare AI for alt-text generation with consistent rate limiting and authentication
- **Enhanced Monitoring**: Add comprehensive logging and alerting
- **✅ Custom Domain Setup**: ~~Set up production domain routing~~ **DONE!** Configured for both `next.dave.io` with comprehensive route patterns
- **✅ D1 Integration**: ~~Implement database features for persistent storage~~ **DONE!** Now with full JWT token management
- **✅ Code Quality**: ~~Fix all TypeScript, linting, and build warnings~~ **DONE!** Now passing all checks with proper types and security practices
- **JWT Management Dashboard**: Build a web UI for token management (because CLI tools are great, but pretty interfaces are better)

### Security Enhancements

- **Token Rotation**: Automatic JWT refresh capabilities
- **IP Allowlisting**: Geographic and IP-based restrictions
- **Audit Logging**: Enhanced security event tracking
- **Content Validation**: File scanning and validation improvements

### Performance Optimizations

- **Response Caching**: Intelligent caching strategies
- **Bundle Optimization**: Reduce Worker bundle size
- **Compression**: Response compression for large payloads
- **CDN Integration**: Optimize static asset delivery

## Final Thoughts

This project started as a simple personal website and evolved into a full-fledged API platform with database integration, CLI management tools, and enough enterprise features to make Fortune 500 companies jealous. Why? Because Dave doesn't do things halfway. If you're looking for a simple static site generator, this probably isn't for you. If you want to see how to build a production-ready API with authentication, validation, testing, deployment automation, backup systems, database integration, and enough features to power a small startup, welcome to the rabbit hole.

The codebase demonstrates modern TypeScript patterns, proper error handling, comprehensive testing, real-world deployment scenarios, database integration, CLI tool development, and enterprise-grade features that would make your DevOps team weep with joy. It's simultaneously a personal website, a learning resource, and a testament to what happens when a developer has too much free time and strong opinions about code quality.

The latest addition of comprehensive JWT token management with D1 database storage proves that sometimes over-engineering is exactly the right amount of engineering. You can now manage tokens like a proper enterprise application, complete with search, revocation, and metadata storage that would make GitHub's token management system take notes.

Remember: with great power comes great responsibility. Use these APIs wisely, back up your data religiously, initialize your databases properly, and may your tokens never expire unexpectedly (unless you want them to).

---

*Built with ❤️ (and perhaps too much caffeine) by [Dave Williams](https://dave.io)*

*P.S. - If you curl the root URL, you'll get a nice shell script response. Because Dave thought that would be amusing, and he was right.*
