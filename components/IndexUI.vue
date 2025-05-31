<template>
  <div class="max-w-3xl mx-auto w-full relative z-10">
    <Hero />
    <TerminalWindow />
    <!-- <ServiceButtons :handleServiceClick="handleServiceClick" /> -->
  </div>
</template>

<script setup lang="ts">
import Hero from "./Hero.vue"
import TerminalWindow from "./TerminalWindow.vue"
// import ServiceButtons from './ServiceButtons.vue'

defineProps<{
  handleServiceClick: (service: any) => void
}>()
</script>
