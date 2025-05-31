<template>
  <div
    class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col justify-center py-12 px-4 relative overflow-hidden">
    <!-- Background elements -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(120,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_40%_80%,rgba(255,198,119,0.2),transparent_50%)]"></div>

    <div class="max-w-3xl mx-auto w-full relative z-10">
      <!-- Hero section -->
      <div class="text-center mb-8">
        <div class="mb-4">
          <h1
            class="text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent mb-2 font-family-convergence">
            dave.io
          </h1>
          <div class="mt-6 h-1 w-32 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
        </div>
        <p class="pt-2 text-xl text-gray-300 font-light">because "just a website" is boring</p>
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
  title: "dave.io - Dave Williams",
  meta: [
    {
      name: "description",
      content: "Personal site of Dave Williams"
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
    title: "home",
    colorMode: "dark",
    services: ["web"]
  })
})

// Log button interactions
const handleServiceClick = (service) => {
  logInteraction("click", "service-button", { service })
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Sixtyfour+Convergence&display=swap');

.font-family-convergence {
  font-family: 'Sixtyfour Convergence', monospace;
}
</style>
