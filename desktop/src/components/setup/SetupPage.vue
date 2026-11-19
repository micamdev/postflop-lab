<template>
  <div class="relative flex h-full min-h-0">
    <SavedExplorer />

    <div
      v-if="store.sideView === 'main'"
      class="flex flex-1 min-w-0 gap-3 p-3 overflow-y-auto"
    >
      <RangePanel class="flex-1 self-start" :player="0" />
      <RangePanel class="flex-1 self-start" :player="1" />
      <div class="flex flex-col shrink-0 w-[290px] gap-3">
        <BoardPanel />
        <StacksPanel />
        <BetSizesPanel />
        <MemoryEstimate />
        <SolvePanel />
      </div>
    </div>

    <div
      v-show="store.sideView !== 'main'"
      class="flex-1 min-w-0 overflow-y-auto px-6 py-4"
    >
      <div class="flex items-center gap-3 mb-4">
        <UiButton size="sm" @click="store.sideView = 'main'">
          ← Back to setup
        </UiButton>
        <h1 class="text-lg font-semibold">
          {{ store.sideView === "bunching" ? "Bunching effect" : "Tree" }}
        </h1>
      </div>
      <TreeConfig v-show="store.sideView === 'tree-config'" />
      <BunchingEffect v-show="store.sideView === 'bunching'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStore } from "../../store";
import SavedExplorer from "./SavedExplorer.vue";
import RangePanel from "./RangePanel.vue";
import BoardPanel from "./BoardPanel.vue";
import StacksPanel from "./StacksPanel.vue";
import BetSizesPanel from "./BetSizesPanel.vue";
import MemoryEstimate from "./MemoryEstimate.vue";
import SolvePanel from "./SolvePanel.vue";
import TreeConfig from "../TreeConfig.vue";
import BunchingEffect from "../BunchingEffect.vue";
import UiButton from "../ui/UiButton.vue";

const store = useStore();
</script>
