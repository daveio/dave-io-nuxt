<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col justify-center py-12 px-4 relative overflow-hidden">
    <!-- Background elements -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(120,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,119,198,0.3),transparent_50%)]"></div>
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_40%_80%,rgba(255,198,119,0.2),transparent_50%)]"></div>
    
    <div class="max-w-lg mx-auto w-full relative z-10">
      <!-- Hero section -->
      <div class="text-center mb-12">
        <div class="mb-6">
          <h1 class="text-5xl font-bold bg-gradient-to-r from-white via-blue-100 to-purple-200 bg-clip-text text-transparent mb-2">
            next.dave.io
          </h1>
          <div class="h-1 w-32 bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full"></div>
        </div>
        <p class="text-xl text-gray-300 font-light">API Platform & URL Redirector</p>
        <p class="text-sm text-gray-400 mt-2">Enterprise-grade REST services with style</p>
      </div>
      
      <!-- Main card -->
      <UCard class="backdrop-blur-sm bg-white/5 border border-white/10 shadow-2xl">
        <template #header>
          <div class="flex items-center gap-3">
            <div class="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
            <h2 class="text-xl font-semibold text-white">Available Services</h2>
          </div>
        </template>
        
        <div class="space-y-6">
          <!-- URL Redirector Service -->
          <div class="group">
            <UButton 
              to="/go" 
              variant="solid"
              color="primary"
              size="xl"
              block
              class="justify-center group-hover:scale-105 transition-transform duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
            >
              <template #leading>
                <UIcon name="i-heroicons-link" class="group-hover:rotate-12 transition-transform duration-200" />
              </template>
              URL Redirector
              <template #trailing>
                <UIcon name="i-heroicons-arrow-right" class="group-hover:translate-x-1 transition-transform duration-200" />
              </template>
            </UButton>
          </div>
        </div>
        
        <template #footer>
          <div class="space-y-6">
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-code-bracket" class="text-blue-400" />
              <h3 class="text-lg font-medium text-white">API Endpoints</h3>
            </div>
            
            <div class="grid gap-3">
              <div class="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/20">
                <div class="flex items-center gap-3">
                  <UBadge variant="solid" color="emerald" size="sm" class="font-mono">
                    /api/health
                  </UBadge>
                  <span class="text-gray-300">Service status</span>
                </div>
                <UIcon name="i-heroicons-heart" class="text-emerald-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div class="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/20">
                <div class="flex items-center gap-3">
                  <UBadge variant="solid" color="blue" size="sm" class="font-mono">
                    /api/metrics
                  </UBadge>
                  <span class="text-gray-300">Performance metrics</span>
                </div>
                <UIcon name="i-heroicons-chart-bar" class="text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div class="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/20">
                <div class="flex items-center gap-3">
                  <UBadge variant="solid" color="purple" size="sm" class="font-mono">
                    /api/ai/alt
                  </UBadge>
                  <span class="text-gray-300">AI alt-text generation</span>
                </div>
                <UIcon name="i-heroicons-sparkles" class="text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div class="group flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/20">
                <div class="flex items-center gap-3">
                  <UBadge variant="solid" color="orange" size="sm" class="font-mono">
                    /api/analytics
                  </UBadge>
                  <span class="text-gray-300">Analytics data</span>
                </div>
                <UIcon name="i-heroicons-chart-pie" class="text-orange-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            
            <!-- Status indicator -->
            <div class="flex items-center justify-center gap-2 pt-4 border-t border-white/10">
              <div class="flex items-center gap-2">
                <div class="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
                <span class="text-xs text-gray-400">All systems operational</span>
              </div>
            </div>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup>
// Set page title and meta
useHead({
  title: 'next.dave.io - API Platform & URL Redirector',
  meta: [
    { name: 'description', content: 'Enterprise-grade REST API platform with authentication, URL redirection, and AI services.' }
  ]
})

// Force dark color mode for this page
useColorMode().preference = 'dark'
</script>