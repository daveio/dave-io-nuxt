<template>
  <div class="mb-4">
    <div class="social-links-table">
      <div class="links-row">
        <span class="link-name text-blue-300 font-bold">
          <UIcon name="i-heroicons-globe-alt" class="mr-2 text-blue-300" />
          Web
        </span>
        <a href="https://dave.io" target="_blank" class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Web', 'https://dave.io')">https://dave.io</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-bluesky" class="mr-2 text-sky-400 font-bold" />
          Bluesky
        </span>
        <a href="https://dave.io/go/bluesky" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Bluesky', 'https://dave.io/go/bluesky')">https://dave.io/go/bluesky</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-heroicons-book-open" class="mr-2 text-green-400 font-bold" />
          Dreamwidth
        </span>
        <a href="https://dave.io/go/dreamwidth" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Dreamwidth', 'https://dave.io/go/dreamwidth')">https://dave.io/go/dreamwidth</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-facebook" class="mr-2 text-blue-500 font-bold" />
          Facebook
        </span>
        <a href="https://dave.io/go/facebook" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Facebook', 'https://dave.io/go/facebook')">https://dave.io/go/facebook</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-github" class="mr-2 text-gray-300 font-bold" />
          GitHub
        </span>
        <a href="https://dave.io/go/github" target="_blank" class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('GitHub', 'https://dave.io/go/github')">https://dave.io/go/github</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-instagram" class="mr-2 text-pink-400 font-bold" />
          Instagram
        </span>
        <a href="https://dave.io/go/instagram" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Instagram', 'https://dave.io/go/instagram')">https://dave.io/go/instagram</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-linkedin" class="mr-2 text-blue-600 font-bold" />
          LinkedIn
        </span>
        <a href="https://dave.io/go/linkedin" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('LinkedIn', 'https://dave.io/go/linkedin')">https://dave.io/go/linkedin</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-mastodon" class="mr-2 text-purple-400 font-bold" />
          Mastodon
        </span>
        <a href="https://dave.io/go/mastodon" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Mastodon', 'https://dave.io/go/mastodon')">https://dave.io/go/mastodon</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-heroicons-chat-bubble-left-ellipsis" class="mr-2 text-indigo-400 font-bold" />
          Pillowfort
        </span>
        <a href="https://dave.io/go/pillowfort" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Pillowfort', 'https://dave.io/go/pillowfort')">https://dave.io/go/pillowfort</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-threads" class="mr-2 text-gray-300 font-bold" />
          Threads
        </span>
        <a href="https://dave.io/go/threads" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Threads', 'https://dave.io/go/threads')">https://dave.io/go/threads</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-tumblr" class="mr-2 text-blue-400 font-bold" />
          Tumblr
        </span>
        <a href="https://dave.io/go/tumblr" target="_blank" class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Tumblr', 'https://dave.io/go/tumblr')">https://dave.io/go/tumblr</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-simple-icons-youtube" class="mr-2 text-red-500 font-bold" />
          YouTube
        </span>
        <a href="https://dave.io/go/youtube" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('YouTube', 'https://dave.io/go/youtube')">https://dave.io/go/youtube</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <UIcon name="i-heroicons-x-mark" class="mr-2 text-gray-400 font-bold" />
          Twitter
        </span>
        <span class="text-gray-500 link-url">We don't use Twitter any more.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Import page logging functionality
const { logInteraction } = usePageLogging()

// Track link clicks
// biome-ignore lint/correctness/noUnusedVariables: Used in template
const handleLinkClick = (service: string, url: string) => {
  logInteraction("click", "terminal-link", { service, url })
}
</script>

<style scoped>
.social-links-table {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.links-row {
  display: contents;
}

.link-name {
  font-weight: 500;
  text-align: right;
  padding-right: 5px;
  display: inline-flex;
  justify-content: flex-end;
  align-items: center;
}

.link-url {
  word-break: break-all;
}

@media (max-width: 800px) {
  .social-links-table {
    grid-template-columns: 0.6fr 1.3fr;
    font-size: 0.95em;
    max-width: 100%;
    gap: 0.5rem 1rem;
  }

  .link-name,
  .link-url {
    min-width: 0;
    word-break: break-all;
  }
}
</style>
