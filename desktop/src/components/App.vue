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

    <div
      v-if="store.appError"
      class="flex shrink-0 items-center gap-3 px-4 py-1.5 text-sm bg-red-500/10 text-red-400 border-b border-line"
      role="alert"
    >
      <span class="flex-1">{{ store.appError }}</span>
      <button
        type="button"
        class="text-muted hover:text-ink"
        aria-label="Dismiss"
        @click="store.appError = ''"
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

      <div v-show="store.navView === 'library'" class="h-full px-6 py-4">
        <LibraryPage />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { trackTreeModified } from "../tree-source";
import { setInternalErrorHandler } from "../invokes";
import { handleInternalError } from "../internal-error";
import { useStore } from "../store";
import { useSolverSession } from "../solver-session";

import TopBar from "./TopBar.vue";
import SetupPage from "./setup/SetupPage.vue";
import LibraryPage from "./LibraryPage.vue";
import ResultViewer from "./ResultViewer.vue";

const store = useStore();
const session = useSolverSession();
// Marks the saved tree "modified" on any setup edit, whichever page made it.
trackTreeModified();
// An internal error in the engine: drop the results and show it, instead of a closed app.
setInternalErrorHandler(handleInternalError);
</script>
