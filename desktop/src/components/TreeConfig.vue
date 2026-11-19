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
        <TreeEditor
          @save="saveEdit"
          @cancel="cancelEdit"
          @state="editState = $event"
        />
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useStore, useConfigStore } from "../store";
import { readableLineString } from "../utils";
import { setupErrors } from "../setup-validation";
import TreeEditor, { type TreeEditState } from "./TreeEditor.vue";
import { openTreeEdit } from "../tree-edit-guard";
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
};

// The open edit, for the guard that asks before leaving it (Back to setup, loading a
// solution): Save, Discard or Stay when its lines changed.
const editState = ref<TreeEditState | null>(null);
let closeGuard: (() => void) | null = null;
watch(isEditMode, (open) => {
  closeGuard?.();
  closeGuard = null;
  editState.value = null;
  if (!open) return;
  closeGuard = openTreeEdit({
    isDirty: () =>
      editState.value !== null &&
      (editState.value.added !== config.addedLines ||
        editState.value.removed !== config.removedLines),
    canSave: () => editState.value?.canSave ?? false,
    save: () => {
      if (editState.value) {
        saveEdit(editState.value.added, editState.value.removed);
      }
    },
    discard: () => cancelEdit(),
  });
});

// Left without the guard (it already ended the edit otherwise): drop it, its tree would be
// stale.
onBeforeUnmount(() => {
  closeGuard?.();
  if (isEditMode.value) cancelEdit();
});
// A loaded solution brings its own lines and board length: only close the editor.
watch(
  () => store.solutionLoadCount,
  () => {
    isEditMode.value = false;
  }
);

const cancelEdit = () => {
  isEditMode.value = false;
  if (config.addedLines === "" && config.removedLines === "") {
    config.expectedBoardLength = 0;
  }
};
</script>
