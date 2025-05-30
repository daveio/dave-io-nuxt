<template>
  <div>
    <UContainer class="py-24">
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">next.dave.io</h1>
        <p class="text-lg text-gray-600 dark:text-gray-300">API Platform & Analytics Dashboard</p>
      </div>
      
      <UCard class="max-w-md mx-auto">
        <template #header>
          <h2 class="text-xl font-semibold">Available Services</h2>
        </template>
        
        <div class="space-y-4">
          <UButton 
            to="/analytics" 
            block 
            color="blue" 
            variant="solid"
            size="lg"
          >
            📊 Analytics Dashboard
          </UButton>
          
          <UButton 
            to="/go" 
            block 
            color="gray" 
            variant="outline"
            size="lg"
          >
            🔗 URL Redirector
          </UButton>
        </div>
        
        <template #footer>
          <div>
            <h3 class="text-lg font-medium mb-3">API Endpoints</h3>
            <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div><UKbd>/api/health</UKbd> - Service status</div>
              <div><UKbd>/api/metrics</UKbd> - Performance metrics</div>
              <div><UKbd>/api/ai/alt</UKbd> - AI alt-text generation</div>
              <div><UKbd>/api/analytics</UKbd> - Analytics data</div>
            </div>
          </div>
        </template>
      </UCard>
    </UContainer>
  </div>
</template>

<script setup>
// Set page title and meta
useHead({
  title: 'next.dave.io - API Platform & Analytics',
  meta: [
    { name: 'description', content: 'Enterprise-grade REST API platform with authentication, analytics, and AI services.' }
  ]
})
</script>