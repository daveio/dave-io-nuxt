<template>
  <div class="curl-section mb-8">
    <div
      class="bg-black/50 border border-gray-700 rounded-lg overflow-hidden shadow-2xl p-4 font-mono text-white text-sm">
      <div class="text-center">
        <div class="text-lg font-extrabold mb-4 rainbow-gradient-text">
          Want to see this animated?
        </div>
        <div class="text-gray-300">
          <code class="bg-gray-800 px-2 py-1 rounded text-blue-300 cursor-pointer hover:bg-gray-700 transition-colors"
            @click="copyCurlCommand" title="Click to copy to clipboard">curl https://dave.io | sh</code>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Import page logging functionality
const { logInteraction } = usePageLogging()

// Copy curl command to clipboard and track the action
// biome-ignore lint/correctness/noUnusedVariables: Used in template
const copyCurlCommand = async () => {
  const command = "curl https://dave.io | sh"
  try {
    await navigator.clipboard.writeText(command)
    logInteraction("copy", "curl-command", { command })
  } catch (_err) {
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
</script>

<style scoped>
.curl-section {
  margin-top: 10px;
}
</style>
