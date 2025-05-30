<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4">
    <div class="max-w-md mx-auto w-full">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">next.dave.io</h1>
        <p class="text-lg text-gray-600">API Platform & Analytics Dashboard</p>
      </div>
      
      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-xl font-semibold text-gray-900">Available Services</h2>
        </div>
        
        <div class="p-6 space-y-4">
          <NuxtLink 
            to="/analytics" 
            class="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md text-center transition-colors"
          >
            📊 Analytics Dashboard
          </NuxtLink>
          
          <NuxtLink 
            to="/go" 
            class="block w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 px-4 rounded-md text-center transition-colors"
          >
            🔗 URL Redirector
          </NuxtLink>
        </div>
        
        <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <h3 class="text-lg font-medium text-gray-900 mb-3">API Endpoints</h3>
          <div class="space-y-2 text-sm text-gray-600">
            <div><code class="bg-gray-200 px-2 py-1 rounded text-gray-800 font-mono">/api/health</code> - Service status</div>
            <div><code class="bg-gray-200 px-2 py-1 rounded text-gray-800 font-mono">/api/metrics</code> - Performance metrics</div>
            <div><code class="bg-gray-200 px-2 py-1 rounded text-gray-800 font-mono">/api/ai/alt</code> - AI alt-text generation</div>
            <div><code class="bg-gray-200 px-2 py-1 rounded text-gray-800 font-mono">/api/analytics</code> - Analytics data</div>
          </div>
        </div>
      </div>
    </div>
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