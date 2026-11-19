<template>
  <div class="relative flex h-full min-h-0">
    <SavedExplorer />

    <!-- Ranges on top, the tree settings under them, board / memory / solve on the right. -->
    <!-- Kept mounted (v-show): a range being edited keeps its Cancel point. -->
    <div
      v-show="store.sideView === 'main'"
      class="grid flex-1 min-w-0 content-start gap-3 p-3 overflow-y-auto"
      style="grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 280px"
    >
      <RangePanel :player="0" />
      <RangePanel :player="1" />
      <div class="flex flex-col row-span-2 gap-3">
        <BoardPanel />
        <MemoryEstimate />
        <SolvePanel />
      </div>
      <TreePanel class="col-span-2" />
    </div>

    <div
      v-show="store.sideView !== 'main'"
      class="flex-1 min-w-0 overflow-y-auto px-6 py-4"
    >
      <div class="flex items-center gap-3 mb-4">
        <UiButton size="sm" @click="backToSetup"> ← Back to setup </UiButton>
        <h1 class="text-lg font-semibold">
          {{ store.sideView === "bunching" ? "Bunching effect" : "Tree lines" }}
        </h1>
      </div>
      <TreeConfig v-if="store.sideView === 'tree-config'" />
      <BunchingEffect v-show="store.sideView === 'bunching'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStore } from "../../store";
import { leaveTreeEdit } from "../../tree-edit-guard";
import SavedExplorer from "./SavedExplorer.vue";
import RangePanel from "./RangePanel.vue";
import BoardPanel from "./BoardPanel.vue";
import TreePanel from "./TreePanel.vue";
import MemoryEstimate from "./MemoryEstimate.vue";
import SolvePanel from "./SolvePanel.vue";
import TreeConfig from "../TreeConfig.vue";
import BunchingEffect from "../BunchingEffect.vue";
import UiButton from "../ui/UiButton.vue";

const store = useStore();

/** Back to the main Setup view, after asking about an unsaved tree lines edit. */
const backToSetup = async () => {
  if (await leaveTreeEdit()) store.sideView = "main";
};
</script>
