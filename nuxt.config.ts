import { defineNuxtConfig } from "nuxt/config"

// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: "2025-05-15",
  devtools: { enabled: true },
  
  // Vite configuration to disable sourcemaps in production
  vite: {
    build: {
      sourcemap: false // Disable sourcemaps in production to avoid warnings
    }
  },
  nitro: {
    preset: "cloudflare_module",
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },
    experimental: {
      wasm: true
    },
    routeRules: {
      '/api/**': { 
        cors: true,
        headers: { 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '0' // Updated per best practices
        }
      },
      '/go/**': {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    }
  },
  runtimeConfig: {
    // Server-side environment variables
    apiJwtSecret: process.env.API_JWT_SECRET || 'dev-secret-change-in-production',
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    public: {
      // Client-side environment variables
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || '/api'
    }
  },
  modules: [
    "@nuxt/content",
    "@nuxt/eslint",
    "@nuxt/fonts",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/test-utils",
    "@nuxt/ui",
    "nitro-cloudflare-dev"
  ]
})
