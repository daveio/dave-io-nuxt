<template>
  <div class="max-w-3xl mx-auto w-full relative z-10">
    <Hero />
    <TerminalWindow />
    <CurlCommand />
  </div>
</template>

<script setup lang="ts">
import Hero from "./Hero.vue"
import TerminalWindow from "./TerminalWindow.vue"
import CurlCommand from "./CurlCommand.vue"

defineProps<{
  handleServiceClick: (service: any) => void
}>()

// Animation removed per user request
</script>

