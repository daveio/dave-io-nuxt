import { getHeader, setHeader } from "h3"

// Middleware to detect curl/wget requests and serve shell script for root path
export default defineEventHandler(async (event) => {
  const userAgent = getHeader(event, "user-agent") || ""
  const requestUrl = event.node.req.url || "/"
  const url = new URL(requestUrl, "http://localhost")

  // Check if this is a curl or wget request
  const isCurlOrWget = userAgent.toLowerCase().includes("curl") || userAgent.toLowerCase().includes("wget")

  // Only serve shell script for the root path (not /api/ or /go/ paths)
  if (isCurlOrWget && (url.pathname === "/" || url.pathname === "")) {
    const helloScript = `#!/bin/bash
# dave.io - Personal website and API platform
# Written by Dave Williams - https://dave.io

echo "👋 Hello from dave.io!"
echo ""
echo "You've reached my personal website and API platform."
echo "This is a Cloudflare Worker serving both a Vue.js SPA and comprehensive REST API."
echo ""
echo "🌐 Website: https://dave.io"
echo "📖 API Docs: https://dave.io/api/docs"
echo "🔧 GitHub: https://github.com/daveio"
echo ""
echo "Some useful endpoints:"
echo "  GET /api/ping          - Health check"
echo "  GET /api/auth          - JWT token validation"
echo "  GET /api/metrics       - API metrics"
echo "  GET /go/gh             - Redirect to GitHub"
echo "  GET /go/tw             - Redirect to Twitter"
echo "  GET /go/li             - Redirect to LinkedIn"
echo ""
echo "For API access, you'll need a JWT token."
echo "Contact dave@dave.io for access or check the docs."
echo ""
echo "Thanks for curling! 🚀"
`

    setHeader(event, "Content-Type", "text/x-shellscript")
    setHeader(event, "Cache-Control", "no-cache")
    return helloScript
  }
})
