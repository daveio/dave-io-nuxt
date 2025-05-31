<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />
    <NuxtPage />
  </UApp>
</template>

<script setup lang="ts">
// Set default color mode preference
const colorMode = useColorMode()
if (process.client) {
  colorMode.preference = "dark"
}
</script>
