# Dave.io Nuxt Edition 🌟

Welcome to the most over-engineered personal website you'll ever encounter. This isn't just a website; it's a full-blown API fortress masquerading as a humble Nuxt application. Dave decided his personal site needed JWT authentication, rate limiting, schema validation, and enough security features to make Fort Knox jealous.

## What Is This Thing?

This is a Nuxt 3 application that combines a personal website with a comprehensive API system. Think of it as two things in one:

1. **A Nuxt Website**: Because everyone needs a place to put their thoughts on the internet
2. **A Production API**: With JWT authentication, hierarchical permissions, and more enterprise features than your startup's "MVP"

Originally, Dave's site was a simple Cloudflare Worker. But why keep things simple when you can rebuild everything with type safety, comprehensive testing, and enough abstractions to make your head spin?

## Features That Nobody Asked For (But Everyone Needs)

### 🔐 Enterprise-Grade Authentication
- JWT tokens with hierarchical permissions (`api:metrics`, `ai:alt`, etc.)
- Token introspection and validation endpoints
- Rate limiting per token (because Dave doesn't trust anyone)
- Token revocation support (for when things go sideways)

### 🤖 AI Integration
- Alt-text generation for images (URL or file upload)
- Because accessibility matters, even for personal sites
- Simulated AI responses (real AI costs money, and Dave is practical)

### 📊 Metrics & Analytics
- Comprehensive API metrics in JSON, YAML, or Prometheus formats
- Request/response statistics with Cloudflare metadata
- Perfect for when you want to obsess over your site's performance

### 🔗 URL Shortening & Redirects
- `/go/gh` → GitHub profile (because typing is hard)
- `/go/tw` → Twitter/X (when Dave remembers to post)
- `/go/li` → LinkedIn (for professional pretenses)

### 🛡️ Security Features
- CORS headers that actually make sense
- Rate limiting (in-memory for now, KV storage for production)
- Input sanitization and validation
- Security headers that would make OWASP proud

## Getting Started (For the Brave)

### Prerequisites
- **Bun** (because npm is so 2023)
- **Node.js 18+** (if you insist on being traditional)
- **Cloudflare Account** (for the full experience)
- **A sense of humor** (for dealing with Dave's code comments)

### Installation

```bash
# Clone this magnificent monstrosity
git clone https://github.com/daveio/dave-io-nuxt.git
cd dave-io-nuxt

# Install dependencies (bun is preferred, but npm works too)
bun install

# Set up environment variables (see .env.example)
cp .env.example .env
# Edit .env with your secrets (don't commit them, Dave will find you)

# Generate types and prepare Nuxt
bun run types
bun run nuxt prepare

# Start the development server
bun run dev
```

### Environment Variables

Create a `.env` file with these variables (don't worry, Dave won't judge your secret naming):

```bash
# JWT Secret (change this, seriously)
API_JWT_SECRET=your-super-secret-jwt-key-here

# Cloudflare credentials (for production deployment)
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-d1-database-id
CLOUDFLARE_KV_NAMESPACE_ID=your-kv-namespace-id

# Public API base URL
NUXT_PUBLIC_API_BASE_URL=/api
```

## API Documentation (The Good Stuff)

### Authentication

All protected endpoints require a JWT token. You can provide it via:
- **Authorization header**: `Authorization: Bearer <token>`
- **Query parameter**: `?token=<token>`

### Core Endpoints

#### `GET /api/health`
The only endpoint that doesn't judge you for not having authentication.

```bash
curl http://localhost:3000/api/health
```

#### `GET /api/auth`
Token introspection and validation. Perfect for existential questions about your JWT.

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth
```

#### `GET /api/metrics`
Get comprehensive API metrics in your preferred format.

```bash
# JSON (default)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics

# YAML (for the hipsters)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics?format=yaml

# Prometheus (for the monitoring obsessed)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/metrics?format=prometheus
```

#### `GET/POST /api/ai/alt`
Generate alt-text for images. Because accessibility is cool.

```bash
# Via URL parameter
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/ai/alt?url=https://example.com/image.jpg"

# Via POST body
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/image.jpg"}' \
  http://localhost:3000/api/ai/alt
```

#### `GET /go/{slug}`
URL redirects for the lazy (we've all been there).

- `/go/gh` → Dave's GitHub
- `/go/tw` → Dave's Twitter/X
- `/go/li` → Dave's LinkedIn

### Token Management

#### `GET /api/tokens/{uuid}`
Get token usage information.

#### `GET /api/tokens/{uuid}/metrics`
Detailed metrics for a specific token.

#### `GET /api/tokens/{uuid}/revoke`
Revoke a token (nuclear option).

## Scripts & Utilities

Dave has provided some handy scripts in the `bin/` directory:

### `bin/jwt.ts` - JWT Token Management
```bash
# Create a new token
bun run bin/jwt.ts create --sub "api:metrics" --description "Metrics access" --expiry "30d"

# Create an admin token (dangerous)
bun run bin/jwt.ts create --sub "admin" --description "God mode" --no-expiry

# Verify a token
bun run bin/jwt.ts verify "eyJhbGciOiJIUzI1NiJ9..."

# Interactive mode (for the GUI lovers)
bun run bin/jwt.ts create --interactive
```

### `bin/api-test.ts` - HTTP API Testing
```bash
# Test against local development server
bun run test:api

# Test against production (if you're feeling brave)
bun run test:api --url https://dave.io

# Test specific endpoints
bun run test:api --auth-only
bun run test:api --metrics-only
bun run test:api --ai-only

# Use an existing token
bun run test:api --token "eyJhbGciOiJIUzI1NiJ9..."
```

## Testing (Because Dave Believes in Quality)

```bash
# Run unit tests
bun run test

# Run tests with UI (fancy)
bun run test:ui

# Run tests with coverage (for the perfectionists)
bun run test:coverage

# Test the API over HTTP
bun run test:api
```

## Deployment (To The Cloud!)

### Development
```bash
bun run dev
```

### Production Build
```bash
bun run build
```

### Cloudflare Workers Deployment
```bash
# Deploy to Cloudflare
bun run deploy

# Preview locally with Wrangler
bun run preview:cloudflare
```

## Project Structure (For the Curious)

```
├── server/
│   ├── api/              # API endpoints
│   │   ├── auth.get.ts   # JWT validation
│   │   ├── metrics.get.ts # API metrics
│   │   ├── ai/           # AI endpoints
│   │   ├── go/           # URL redirects
│   │   └── tokens/       # Token management
│   ├── utils/            # Server utilities
│   │   ├── auth.ts       # Authentication logic
│   │   ├── response.ts   # Response helpers
│   │   └── schemas.ts    # Zod validation schemas
│   └── middleware/       # Server middleware
├── test/                 # Unit tests
├── bin/                  # CLI scripts
│   ├── jwt.ts           # JWT token management
│   └── api-test.ts      # HTTP API testing
├── types/               # TypeScript definitions
└── public/              # Static assets
```

## Technologies Used (The Stack)

- **Nuxt 3**: Because Vue is lovely
- **TypeScript**: For when JavaScript isn't painful enough
- **Zod**: Schema validation that actually works
- **JOSE**: JWT handling done right
- **Vitest**: Testing that doesn't make you cry
- **Cloudflare Workers**: Because serverless is the future
- **Bun**: The runtime that makes everything faster

## Contributing (If You Dare)

Found a bug? Want to add a feature? Dave welcomes contributions, but be warned: he has opinions about code style.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (and write tests, Dave is watching)
4. Run the test suite (`bun run test && bun run test:api`)
5. Submit a pull request with a description that makes Dave smile

## License

MIT License - Because sharing is caring, and Dave believes in open source.

## Final Thoughts

This project started as a simple personal website and evolved into a full-fledged API platform. Why? Because Dave doesn't do things halfway. If you're looking for a simple static site generator, this probably isn't for you. If you want to see how to build a production-ready API with authentication, validation, testing, and deployment automation, welcome to the rabbit hole.

Remember: with great power comes great responsibility. Use these APIs wisely, and may your tokens never expire unexpectedly.

---

*Built with ❤️ (and perhaps too much caffeine) by [Dave Williams](https://dave.io)*