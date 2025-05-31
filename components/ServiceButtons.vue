<template>
  <div class="flex justify-center">
    <UButton to="/go" variant="solid" color="primary" size="xl"
      class="justify-center hover:scale-105 transition-transform duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
      @click="handleServiceClick('redirector')">
      <template #leading>
        <UIcon name="i-heroicons-link" class="group-hover:rotate-12 transition-transform duration-200" />
      </template>
      URL Redirector
      <template #trailing>
        <UIcon name="i-heroicons-arrow-right" class="group-hover:translate-x-1 transition-transform duration-200" />
      </template>
    </UButton>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  handleServiceClick: (service: any) => void
}>()
</script>
