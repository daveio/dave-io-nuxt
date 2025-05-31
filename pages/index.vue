<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col justify-center py-12 px-4 relative overflow-hidden">
    <!-- Background elements -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(120,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_40%_80%,rgba(255,198,119,0.2),transparent_50%)]"></div>

    <div class="max-w-3xl mx-auto w-full relative z-10">
      <!-- Hero section -->
      <div class="text-center mb-8">
        <div class="mb-4">
          <h1 class="text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent mb-2">
            next.dave.io
          </h1>
          <div class="h-1 w-32 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
        </div>
        <p class="text-xl text-gray-300 font-light">API Platform & URL Redirector</p>
        <p class="text-sm text-gray-400 mt-2">Enterprise-grade REST services with style</p>
      </div>

      <!-- Terminal Window -->
      <div class="mb-8">
        <TerminalWindow />
      </div>

      <!-- Service buttons -->
      <!-- Left in just to show the pattern, we don't want the URL redirector
           but will probably add others later that we will want to link -->
      <!-- <div class="flex justify-center">
        <UButton
          to="/go"
          variant="solid"
          color="primary"
          size="xl"
          class="justify-center hover:scale-105 transition-transform duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
          @click="handleServiceClick('redirector')"
        >
          <template #leading>
            <UIcon name="i-heroicons-link" class="group-hover:rotate-12 transition-transform duration-200" />
          </template>
          URL Redirector
          <template #trailing>
            <UIcon name="i-heroicons-arrow-right" class="group-hover:translate-x-1 transition-transform duration-200" />
          </template>
        </UButton>
      </div> -->

      <!-- Status indicator -->
      <div class="flex items-center justify-center gap-2 mt-6">
        <div class="flex items-center gap-2">
          <div class="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
          <span class="text-xs text-gray-400">All systems operational</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Set page title and meta
useHead({
  title: "next.dave.io - API Platform & URL Redirector",
  meta: [
    {
      name: "description",
      content: "Enterprise-grade REST API platform with authentication, URL redirection, and AI services."
    }
  ],
  link: [
    {
      rel: 'stylesheet',
      href: 'https://cdn.jsdelivr.net/npm/xterm@5.1.0/css/xterm.min.css'
    }
  ],
  script: [
    {
      src: 'https://cdn.jsdelivr.net/npm/xterm@5.1.0/lib/xterm.min.js',
      defer: true
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.7.0/lib/xterm-addon-fit.min.js',
      defer: true
    }
  ]
})

// Force dark color mode for this page
useColorMode().preference = "dark"

// Page logging
const { logPageVisit, logInteraction } = usePageLogging()

onMounted(() => {
  // Log page visit
  logPageVisit("/", {
    title: "Homepage",
    colorMode: "dark",
    services: ["redirector", "api"]
  })
})

// Log button interactions
const handleServiceClick = (service) => {
  logInteraction("click", "service-button", { service })
}
</script>
