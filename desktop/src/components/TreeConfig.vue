<template>
  <div v-if="!isEditMode" class="flex flex-col max-w-2xl gap-4">
    <p class="text-sm text-muted">
      The tree is built from the Setup: stacks, bet sizes, all-in thresholds and
      merging. Here you can preview it and add or remove lines by hand. While
      lines are edited, those settings are locked.
    </p>

    <div class="flex items-center gap-2">
      <UiButton variant="primary" :disabled="!isInputValid" @click="startEdit">
        Preview & edit tree
      </UiButton>
      <UiButton v-if="hasEdit" variant="danger" @click="clearEdit">
        Clear edits & unlock
      </UiButton>
    </div>
    <p v-if="firstSetupError" class="text-xs text-red-400">
      Fix the Setup first: {{ firstSetupError }}
    </p>

    <UiPanel v-if="hasEdit" title="Lines edited by hand">
      <div v-if="addedLinesArray.length > 0" class="text-sm">
        <div class="mb-1 text-xs text-muted">Added</div>
        <div v-for="line in addedLinesArray" :key="line">{{ line }}</div>
      </div>
      <div
        v-if="removedLinesArray.length > 0"
        :class="['text-sm', addedLinesArray.length > 0 ? 'mt-3' : '']"
      >
        <div class="mb-1 text-xs text-muted">Removed</div>
        <div v-for="line in removedLinesArray" :key="line">{{ line }}</div>
      </div>
    </UiPanel>

    <p v-if="boardMismatch" class="text-xs text-ip">
      The edited tree assumes a {{ config.expectedBoardLength }}-card board, but
      the board has {{ config.board.length }} cards. Clear the edits to use this
      board.
    </p>
    <ul v-if="errorLines.length > 0" class="text-xs text-red-400">
      <li v-for="error in errorLines" :key="error">{{ error }}</li>
    </ul>
  </div>

  <div v-else>
    <Suspense>
      <template #default>
        <TreeEditor @save="saveEdit" @cancel="cancelEdit" />
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore, useConfigStore } from "../store";
import { readableLineString } from "../utils";
import { setupErrors } from "../setup-validation";
import TreeEditor from "./TreeEditor.vue";
import UiButton from "./ui/UiButton.vue";
import UiPanel from "./ui/UiPanel.vue";

// The tree's lines edited by hand (the other tree settings are in the Setup): their list,
// the tree preview and editor, and clearing them.

const store = useStore();
const config = useConfigStore();

const isEditMode = ref(false);

const hasEdit = computed(
  () => config.addedLines.length > 0 || config.removedLines.length > 0
);

const addedLinesArray = computed(() =>
  config.addedLines === ""
    ? []
    : config.addedLines.split(",").map(readableLineString)
);

const removedLinesArray = computed(() =>
  config.removedLines === ""
    ? []
    : config.removedLines.split(",").map(readableLineString)
);

// The same checks as Solve (setup-validation).
const errors = computed(() => setupErrors(config));
const errorLines = computed(() => errors.value.lines);
const firstSetupError = computed(
  () =>
    [
      ...errors.value.basics,
      ...errors.value.oop,
      ...errors.value.ip,
      ...errors.value.misc,
    ][0] ?? ""
);
const isInputValid = computed(
  () => firstSetupError.value === "" && errorLines.value.length === 0
);

const boardMismatch = computed(
  () =>
    config.board.length >= 3 &&
    config.expectedBoardLength > 0 &&
    config.board.length !== config.expectedBoardLength
);

const startEdit = () => {
  isEditMode.value = true;
  if (config.expectedBoardLength === 0) {
    config.expectedBoardLength = Math.max(config.board.length, 3);
  }
  store.headers["tree-config"].push("Tree Preview & Edit");
};

const clearEdit = () => {
  config.expectedBoardLength = 0;
  config.addedLines = "";
  config.removedLines = "";
};

const saveEdit = (addedLines: string, removedLines: string) => {
  isEditMode.value = false;
  config.addedLines = addedLines;
  config.removedLines = removedLines;
  if (config.addedLines === "" && config.removedLines === "") {
    config.expectedBoardLength = 0;
  }
  store.headers["tree-config"].pop();
};

const cancelEdit = () => {
  isEditMode.value = false;
  if (config.addedLines === "" && config.removedLines === "") {
    config.expectedBoardLength = 0;
  }
  store.headers["tree-config"].pop();
};
</script>
