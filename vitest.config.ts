import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", ".trunk/**", ".nuxt/**", ".output/**", "coverage/**", "bin/**"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "test/",
        "bin/",
        ".nuxt/",
        ".output/",
        ".trunk/",
        "coverage/",
        "**/*.d.ts",
        "**/*.config.*"
      ]
    }
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "."),
      "~/": resolve(__dirname, "./")
    }
  }
})
