<template>
  <nav
    class="flex flex-col shrink-0 gap-1 w-52 p-2 overflow-y-auto bg-panel border-r border-line"
  >
    <button
      v-for="item in items"
      :key="item.view"
      type="button"
      :class="[
        'flex flex-col items-start gap-1.5 px-3 py-2 rounded-md text-left text-sm transition-colors',
        store.sideView === item.view
          ? 'bg-panel2 text-ink font-semibold'
          : 'text-muted hover:bg-panel2 hover:text-ink',
      ]"
      @click="store.sideView = item.view"
    >
      {{ item.label }}
      <RangeMiniViewer v-if="item.view === 'oop-range'" :player="0" />
      <RangeMiniViewer v-if="item.view === 'ip-range'" :player="1" />
      <span v-if="item.view === 'board'" class="flex gap-0.5">
        <span
          v-for="card in config.board"
          :key="card"
          :class="[
            'flex items-center justify-center w-5 h-6 rounded text-xs font-bold text-white',
            suitBgClasses[card & 3],
          ]"
        >
          {{ cardText(card).rank }}
        </span>
        <span v-if="config.board.length === 0" class="text-muted font-normal">
          No board yet
        </span>
      </span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { SideView, useConfigStore, useStore } from "../store";
import { cardText, suitBgClasses } from "../utils";
import RangeMiniViewer from "./RangeMiniViewer.vue";

const store = useStore();
const config = useConfigStore();

const items: { view: SideView; label: string }[] = [
  { view: "oop-range", label: "OOP range" },
  { view: "ip-range", label: "IP range" },
  { view: "board", label: "Board" },
  { view: "tree-config", label: "Tree" },
];
</script>
