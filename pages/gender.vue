<template>
  <div
    class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col justify-center py-12 px-4 relative overflow-hidden">
    <Background />

    <div class="relative z-10 max-w-4xl mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-4xl md:text-6xl font-bold text-white mb-4">
          <UIcon name="i-mdi-light-gender-transgender" class="mr-4 text-blue-300" />
          Gender & Pronouns
        </h1>
        <p class="text-xl text-gray-300">
          Understanding my identity and preferred pronouns
        </p>
      </div>

      <div class="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 mb-8 border border-gray-700">
        <div class="space-y-6">
          <div>
            <h2 class="text-2xl font-bold text-blue-300 mb-3">My Pronouns</h2>
            <p class="text-lg text-gray-200 mb-2">
              <strong>they/them/theirs</strong>
            </p>
            <p class="text-gray-300">
              Please use these pronouns when referring to me in any context.
            </p>
          </div>

          <div>
            <h2 class="text-2xl font-bold text-blue-300 mb-3">Why This Matters</h2>
            <p class="text-gray-300 leading-relaxed">
              Using correct pronouns is a simple way to show respect and create an inclusive environment.
              It acknowledges someone's identity and helps build trust in our interactions.
            </p>
          </div>

          <div>
            <h2 class="text-2xl font-bold text-blue-300 mb-3">Examples</h2>
            <div class="space-y-2 text-gray-300">
              <p>• "Dave is working on <strong>their</strong> project."</p>
              <p>• "I spoke with <strong>them</strong> yesterday."</p>
              <p>• "This is <strong>theirs</strong>."</p>
            </div>
          </div>

          <div>
            <h2 class="text-2xl font-bold text-blue-300 mb-3">Questions?</h2>
            <p class="text-gray-300 leading-relaxed">
              If you have questions about pronouns or want to learn more about creating inclusive spaces,
              I'm happy to discuss. You can reach out through any of the contact methods on my main page.
            </p>
          </div>
        </div>
      </div>

      <div class="text-center">
        <NuxtLink to="/"
          class="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
          @click="handleBackClick">
          <UIcon name="i-mdi-arrow-left" class="mr-2" />
          Back to Home
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Background from "../components/Background.vue"

// Set page title and meta
useHead({
  title: "Gender & Pronouns - dave.io",
  meta: [
    {
      name: "description",
      content: "Information about Dave Williams' gender identity and preferred pronouns (they/them)"
    },
    {
      name: "keywords",
      content: "pronouns, they/them, gender identity, inclusion, respect"
    }
  ]
})

// Page logging
const { logPageVisit, logInteraction } = usePageLogging()

onMounted(() => {
  // Log page visit
  logPageVisit("/gender", {
    title: "gender-pronouns",
    colorMode: "dark",
    services: ["web"]
  })
})

// Track back button clicks
// biome-ignore lint/correctness/noUnusedVariables: Used in template
const handleBackClick = () => {
  logInteraction("click", "navigation", { action: "back-to-home", from: "gender" })
}
</script>

<style scoped>
/* Additional styling if needed */
</style>
