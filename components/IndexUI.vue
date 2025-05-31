<template>
  <div class="max-w-3xl mx-auto w-full relative z-10">
    <Hero />
    <TerminalWindow />

    <!-- Curl command section -->
    <div class="curl-section mb-8">
      <div
        class="bg-black border border-gray-700 rounded-lg overflow-hidden shadow-2xl p-4 font-mono text-white text-sm">
        <div class="text-center">
          <div class="text-lg font-extrabold mb-4 static-gradient-text">
            Want to see this animated?
          </div>
          <div class="text-gray-300">
            <code class="bg-gray-800 px-2 py-1 rounded text-blue-300 cursor-pointer hover:bg-gray-700 transition-colors"
              @click="copyCurlCommand" title="Click to copy to clipboard">curl https://dave.io | sh</code>
          </div>
        </div>
      </div>
    </div>

    <!-- <ServiceButtons :handleServiceClick="handleServiceClick" /> -->
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import Hero from "./Hero.vue"
import TerminalWindow from "./TerminalWindow.vue"
// import ServiceButtons from './ServiceButtons.vue'

// Import page logging functionality
const { logInteraction } = usePageLogging()

defineProps<{
  handleServiceClick: (service: any) => void
}>()

// Copy curl command to clipboard and track the action
const copyCurlCommand = async () => {
  const command = "curl https://dave.io | sh"
  try {
    await navigator.clipboard.writeText(command)
    logInteraction("copy", "curl-command", { command })
  } catch (err) {
    // Fallback for older browsers or when clipboard API fails
    const textArea = document.createElement("textarea")
    textArea.value = command
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand("copy")
    document.body.removeChild(textArea)
    logInteraction("copy", "curl-command", { command, fallback: true })
  }
}

// Animation removed per user request
</script>

<style scoped>
.curl-section {
  margin-top: 10px;
}

.static-gradient-text {
  background: linear-gradient(90deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
