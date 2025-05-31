<template>
  <div class="mb-8">
    <div class="pb-6 terminal-container w-full bg-black border border-gray-700 rounded-lg overflow-hidden shadow-2xl"
      ref="terminalContainer">
      <!-- Terminal header -->
      <div class="terminal-header flex items-center justify-start px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div class="flex space-x-2">
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
          <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
        </div>
        <div class="text-center flex-1 text-sm text-gray-400 font-mono">dave.io :: fish :: 13x37</div>
      </div>

      <!-- Terminal content -->
      <div class="terminal-content font-mono text-white p-4 text-sm" ref="terminalContent">
        <div class="pt-4 mb-4 flex flex-col items-center">
          <div class="gradient-border-box mb-4">
            <div class="box-content flex items-center justify-center h-full w-full">
              <span class="font-bold text-lg text-white">Dave Williams</span>
            </div>
          </div>
          <div
            class="text-center text-xl font-extrabold pastel-gradient-text mb-4 flex items-center justify-center gap-2 pt-4">
            <span>🚀</span>
            <span>Weapons-grade <span class="text-yellow-400">DevOps</span> engineer,
              <span class="text-green-400">developer</span>, and tinkerer</span>
            <span>🚀</span>
          </div>
        </div>
        <div class="mb-4">
          <div class="links-table main-links-table">
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
              <span class="text-gray-500 link-url twitter-message">We don't use Twitter any more.</span>
            </div>
          </div>
        </div>
        <div class="mt-8">
          <div class="links-table extra-links-table">
            <div class="links-row">
              <span class="link-name">
                <span class="font-bold mr-2">💼</span>
                Check out my CV
              </span>
              <a href="https://dave.io/go/cv" target="_blank"
                class="underline text-blue-300 hover:text-blue-400 link-url"
                @click="handleLinkClick('CV', 'https://dave.io/go/cv')">https://dave.io/go/cv</a>
            </div>
            <div class="links-row">
              <span class="link-name">
                <span class="font-bold mr-2">🔑</span>
                Grab my public key
              </span>
              <a href="https://dave.io/go/key" target="_blank"
                class="underline text-blue-300 hover:text-blue-400 link-url"
                @click="handleLinkClick('key', 'https://dave.io/go/key')">https://dave.io/go/key</a>
            </div>
            <div class="links-row">
              <span class="link-name">
                <span class="font-bold mr-2">🧩</span>
                Give me a TODO
              </span>
              <a href="https://dave.io/go/todo" target="_blank"
                class="underline text-blue-300 hover:text-blue-400 link-url"
                @click="handleLinkClick('TODO', 'https://dave.io/go/todo')">https://dave.io/go/todo</a>
            </div>
            <div class="links-row">
              <span class="link-name">
                <span class="font-bold mr-2">🎤</span>
                Enjoy this talk
              </span>
              <a href="https://dave.io/go/wat" target="_blank"
                class="underline text-blue-300 hover:text-blue-400 link-url"
                @click="handleLinkClick('Talk', 'https://dave.io/go/wat')">https://dave.io/go/wat</a>
            </div>
            <div class="links-row">
              <span class="link-name">
                <span class="font-bold mr-2">🦜</span>
                Read this story
              </span>
              <a href="https://dave.io/go/blit" target="_blank"
                class="underline text-blue-300 hover:text-blue-400 link-url"
                @click="handleLinkClick('Story', 'https://dave.io/go/blit')">https://dave.io/go/blit</a>
            </div>
          </div>
        </div>
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
.terminal-container {
  max-height: 90vh;
  overflow-y: auto;
  width: 100%;
}

.terminal-content {
  overflow: visible;
  width: 100%;
}

.gradient-border-box {
  border-radius: 12px;
  padding: 2px;
  background: linear-gradient(90deg, #a78bfa, #60a5fa, #34d399, #fbbf24, #f87171, #f472b6);
  width: 420px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.box-content {
  background: #111;
  border-radius: 10px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pastel-gradient-text {
  background: linear-gradient(90deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}



.links-table {
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
  display: inline-block;
  /* Better control of URL display */
  max-width: 100%;
}

@media (max-width: 700px) {
  .terminal-container {
    min-height: auto;
    max-height: none;
    border-radius: 0.75rem;
    width: 100%;
  }

  .terminal-content {
    padding: 1rem 0.5rem;
    /* Increased horizontal padding for better spacing */
    width: 100%;
    box-sizing: border-box;
    /* Ensures padding is included in width */
  }

  /* Optimize the spacing of emoji icons on mobile */
  .link-name span.mr-2 {
    margin-right: 0 !important;
    /* Minimize emoji spacing on mobile */
    font-size: 0.8rem;
    /* Slightly smaller emojis */
  }

  /* Optimize font size for mobile */
  .pastel-gradient-text {
    font-size: 0.85rem;
    line-height: 1.3;
  }

  /* Mobile text adjustments */
  .text-center.text-xl span.text-green-400 {
    display: none;
  }

  /* Hide rockets on mobile */
  .text-center.text-xl span:first-child,
  .text-center.text-xl span:last-child {
    display: none;
  }

  .gradient-border-box {
    width: 94vw;
    /* Slightly less width to ensure margins on both sides */
    min-width: 0;
    max-width: calc(100% - 1rem);
    /* Ensure it doesn't overflow container */
    height: 60px;
    font-size: 1rem;
    margin: 0 auto;
    /* Center the box */
  }

  /* Base table settings */
  .links-table {
    max-width: 100%;
    width: 100%;
    gap: 0.3rem 0.3rem;
    margin: 0;
    padding-right: 0.2rem;
    padding-left: 0.2rem;
  }

  /* Different column ratios */
  .main-links-table {
    grid-template-columns: 0.45fr 1.55fr;
  }

  .extra-links-table {
    grid-template-columns: 0.65fr 1.35fr;
  }

  /* Fix Twitter message display to just show "Nope." on mobile */
  .twitter-message {
    font-size: 0;
    display: block;
  }

  .twitter-message::before {
    content: "Nope.";
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .link-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 0.3rem;
    /* Less padding to save space */
    font-size: 0.8rem;
    /* Smaller font size to fit better */
  }

  .link-url {
    min-width: 0;
    max-width: 100%;
    word-break: break-all;
    font-size: 0.8rem;
    /* Smaller font size to prevent wrapping */
    display: block;
    /* Ensure it uses full width available */
  }
}
</style>
