// Static redirects middleware to replicate ../dave-io behavior
export default defineEventHandler(async (event) => {
  const url = new URL(event.node.req.url!, "http://localhost")
  const pathname = url.pathname

  // Define static redirects (from original dave-io Worker)
  const redirects: Record<string, { url: string; status: number }> = {
    "/301": { url: "https://www.youtube.com/watch?v=fEM21kmPPik", status: 301 },
    "/302": { url: "https://www.youtube.com/watch?v=BDERfRP2GI0", status: 302 },
    "/cv": { url: "https://cv.dave.io", status: 302 },
    "/nerd-fonts": { url: "https://dave.io/go/nerd-fonts", status: 302 },
    "/contact": { url: "https://dave.io/dave-williams.vcf", status: 302 },
    "/public-key": { url: "https://dave.io/dave-williams.asc", status: 302 },
    "/todo": { url: "https://dave.io/go/todo", status: 302 }
  }

  if (redirects[pathname]) {
    const redirect = redirects[pathname]
    await sendRedirect(event, redirect.url, redirect.status)
    return
  }
})
