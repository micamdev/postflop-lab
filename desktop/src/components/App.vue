<template>
  <div class="flex flex-col h-screen min-w-[1280px] overflow-hidden">
    <TopBar />

    <div
      v-if="session.message"
      class="flex shrink-0 items-center gap-3 px-4 py-1.5 text-sm bg-ip/10 text-ip border-b border-line"
    >
      <span class="flex-1">{{ session.message }}</span>
      <button
        type="button"
        class="text-muted hover:text-ink"
        aria-label="Dismiss"
        @click="session.clearMessage()"
      >
        ✕
      </button>
    </div>

    <main class="flex-1 min-h-0">
      <div v-show="store.navView === 'setup'" class="h-full">
        <SetupPage />
      </div>

      <div v-show="store.navView === 'results'" class="h-full">
        <ResultViewer />
      </div>

      <div
        v-show="store.navView === 'library'"
        class="legacy h-full overflow-y-auto px-6 py-4"
      >
        <LibraryPage />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useStore } from "../store";
import { useSolverSession } from "../solver-session";

import TopBar from "./TopBar.vue";
import SetupPage from "./setup/SetupPage.vue";
import LibraryPage from "./LibraryPage.vue";
import ResultViewer from "./ResultViewer.vue";

const store = useStore();
const session = useSolverSession();
</script>
