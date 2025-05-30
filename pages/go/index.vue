<template>
  <div class="min-h-screen flex items-center justify-center bg-black">
    <div class="text-center">
      <img 
        src="/dennis-nedry.gif" 
        alt="Dennis Nedry saying 'You didn't say the magic word'"
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
</script>