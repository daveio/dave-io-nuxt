<template>
  <div class="min-h-screen flex items-center justify-center bg-black">
    <div class="text-center">
      <img
        src="/nedry.gif"
        alt="You didn't say the magic word"
        class="mx-auto max-w-lg w-full h-auto"
      />
      <p class="text-green-400 font-mono text-lg mt-6">
        You didn't say the magic word!
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Page metadata
useHead({
  title: "Access Denied - Dave.io",
  meta: [{ name: "description", content: "You didn't say the magic word!" }]
})

// Page logging
const { logPageVisit } = usePageLogging()

onMounted(() => {
  // Log page visit to access denied page
  logPageVisit("/go", {
    title: "Access Denied",
    theme: "jurassic-park",
    reason: "no-magic-word"
  })
})
</script>
