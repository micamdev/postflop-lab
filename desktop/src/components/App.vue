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
      <div v-show="store.navView === 'setup'" class="flex h-full">
        <SetupNav />
        <div class="legacy flex-1 overflow-y-auto px-6 py-4">
          <div class="flex items-center gap-3 mb-4">
            <UiButton
              v-if="store.sideView === 'bunching'"
              size="sm"
              @click="store.sideView = 'oop-range'"
            >
              ← Back to setup
            </UiButton>
            <h1 class="text-lg font-semibold">{{ header }}</h1>
          </div>

          <div v-show="store.sideView === 'oop-range'">
            <RangeEditor :player="0" />
          </div>
          <div v-show="store.sideView === 'ip-range'">
            <RangeEditor :player="1" />
          </div>
          <div v-show="store.sideView === 'board'">
            <BoardSelector />
          </div>
          <div v-show="store.sideView === 'tree-config'">
            <TreeConfig />
          </div>
          <div v-show="store.sideView === 'bunching'">
            <BunchingEffect />
          </div>
        </div>
      </div>

      <div v-show="store.navView === 'results'" class="legacy h-full">
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
import { computed } from "vue";
import { useStore } from "../store";
import { useSolverSession } from "../solver-session";

import TopBar from "./TopBar.vue";
import SetupNav from "./SetupNav.vue";
import UiButton from "./ui/UiButton.vue";
import RangeEditor from "./RangeEditor.vue";
import BoardSelector from "./BoardSelector.vue";
import TreeConfig from "./TreeConfig.vue";
import BunchingEffect from "./BunchingEffect.vue";
import LibraryPage from "./LibraryPage.vue";
import ResultViewer from "./ResultViewer.vue";

const store = useStore();
const session = useSolverSession();
const header = computed(() => store.headers[store.sideView].join(" > "));
</script>
