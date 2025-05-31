<template>
  <div class="mb-4">
    <div class="social-links-table">
      <div class="links-row">
        <span class="link-name text-blue-300 font-bold"><span class="mr-2">🌐</span> Web</span>
        <a href="https://dave.io" target="_blank" class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Web', 'https://dave.io')">https://dave.io</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-yellow-400">🦋</span>
          Bluesky
        </span>
        <a href="https://dave.io/go/bluesky" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Bluesky', 'https://dave.io/go/bluesky')">https://dave.io/go/bluesky</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-green-400">📓</span>
          Dreamwidth
        </span>
        <a href="https://dave.io/go/dreamwidth" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Dreamwidth', 'https://dave.io/go/dreamwidth')">https://dave.io/go/dreamwidth</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-blue-400">📘</span>
          Facebook
        </span>
        <a href="https://dave.io/go/facebook" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Facebook', 'https://dave.io/go/facebook')">https://dave.io/go/facebook</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-magenta-400">🐙</span>
          GitHub
        </span>
        <a href="https://dave.io/go/github" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('GitHub', 'https://dave.io/go/github')">https://dave.io/go/github</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-red-400">📷</span>
          Instagram
        </span>
        <a href="https://dave.io/go/instagram" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Instagram', 'https://dave.io/go/instagram')">https://dave.io/go/instagram</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-yellow-400">🔗</span>
          LinkedIn
        </span>
        <a href="https://dave.io/go/linkedin" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('LinkedIn', 'https://dave.io/go/linkedin')">https://dave.io/go/linkedin</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-green-400">🐘</span>
          Mastodon
        </span>
        <a href="https://dave.io/go/mastodon" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Mastodon', 'https://dave.io/go/mastodon')">https://dave.io/go/mastodon</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-blue-400">🔮</span>
          Pillowfort
        </span>
        <a href="https://dave.io/go/pillowfort" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Pillowfort', 'https://dave.io/go/pillowfort')">https://dave.io/go/pillowfort</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-magenta-400">🧵</span>
          Threads
        </span>
        <a href="https://dave.io/go/threads" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Threads', 'https://dave.io/go/threads')">https://dave.io/go/threads</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-red-400">📱</span>
          Tumblr
        </span>
        <a href="https://dave.io/go/tumblr" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('Tumblr', 'https://dave.io/go/tumblr')">https://dave.io/go/tumblr</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-yellow-400">🎥</span>
          YouTube
        </span>
        <a href="https://dave.io/go/youtube" target="_blank"
          class="underline text-blue-300 hover:text-blue-400 link-url"
          @click="handleLinkClick('YouTube', 'https://dave.io/go/youtube')">https://dave.io/go/youtube</a>
      </div>
      <div class="links-row">
        <span class="link-name">
          <span class="font-bold mr-2 text-gray-400">☠️</span>
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

@media (max-width: 700px) {
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