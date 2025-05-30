<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="text-center">
        <h1 class="text-4xl font-bold text-gray-900 mb-2">next.dave.io</h1>
        <p class="text-lg text-gray-600 mb-8">API Platform & Analytics Dashboard</p>
      </div>
      
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Available Services</h2>
            <div class="space-y-3">
              <NuxtLink 
                to="/analytics" 
                class="block w-full text-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                📊 Analytics Dashboard
              </NuxtLink>
              
              <NuxtLink 
                to="/go" 
                class="block w-full text-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                🔗 URL Redirector
              </NuxtLink>
            </div>
          </div>
          
          <div class="border-t border-gray-200 pt-6">
            <h3 class="text-lg font-medium text-gray-900 mb-3">API Endpoints</h3>
            <div class="space-y-2 text-sm text-gray-600">
              <div><code class="bg-gray-100 px-2 py-1 rounded">/api/health</code> - Service status</div>
              <div><code class="bg-gray-100 px-2 py-1 rounded">/api/metrics</code> - Performance metrics</div>
              <div><code class="bg-gray-100 px-2 py-1 rounded">/api/ai/alt</code> - AI alt-text generation</div>
              <div><code class="bg-gray-100 px-2 py-1 rounded">/api/analytics</code> - Analytics data</div>
            </div>
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