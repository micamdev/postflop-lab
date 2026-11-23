<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="!isSaving && emit('close')"
  >
    <div
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-solution-title"
      class="w-[34rem] p-6 bg-panel border border-line rounded-lg shadow-2xl shadow-black/50"
      @keydown.esc="!isSaving && emit('close')"
      @keydown.tab="trapTab($event, dialog)"
    >
      <div id="save-solution-title" class="mb-4 text-lg font-bold">
        Save Solution
      </div>

      <label class="block font-semibold">
        Name
        <input
          ref="nameInput"
          v-model="name"
          type="text"
          class="block w-full mt-1 px-2 py-1 rounded-lg"
          :disabled="isSaving"
          @keydown.enter="save(false)"
        />
      </label>

      <div class="mt-4 font-semibold">Saved depth</div>
      <div v-if="estimates.length === 0" class="mt-1 text-muted">
        Computing sizes…
      </div>
      <label
        v-for="[depth, memory] of estimates"
        :key="depth"
        class="flex items-start mt-2"
      >
        <input
          v-model="selectedDepth"
          type="radio"
          class="mt-1 mr-2"
          :value="depth"
          :disabled="isSaving"
        />
        <span>
          <span class="font-semibold">{{ depthLabel(depth) }}</span>
          <span class="ml-2 text-sm text-muted">
            RAM to reload: {{ formatBytes(memory) }} · file: ~{{
              formatBytes(memory * FILE_SIZE_RATIO[depth])
            }}
          </span>
          <br />
          <span class="text-sm text-muted">{{ depthLoss(depth) }}</span>
        </span>
      </label>

      <div v-if="isSaving" class="flex items-center mt-4">
        <span class="spinner inline-block mr-3"></span>
        Writing... {{ formatBytes(written) }}
      </div>
      <div v-if="errorText" class="mt-4 text-red-400">{{ errorText }}</div>

      <div class="flex justify-end gap-3 mt-6">
        <UiButton variant="ghost" :disabled="isSaving" @click="emit('close')">
          Cancel
        </UiButton>
        <UiButton
          variant="primary"
          :disabled="isSaving || !name.trim() || estimates.length === 0"
          @click="save(false)"
        >
          Save
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from "./ui/UiButton.vue";
import { onMounted, onUnmounted, ref } from "vue";
import { trapTab } from "../modal-focus";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useStore, useSavedConfigStore, SolutionDepth } from "../store";
import * as invokes from "../invokes";
import { ask, depthLabel, depthLoss, formatBytes } from "../library";

const emit = defineEmits<{ (e: "close"): void }>();

/**
 * Approximate compressed file size relative to the RAM to reload, by depth (zstd level 3,
 * measured on a reference turn spot: ~0.25 complete, ~0.05-0.1 up to the turn).
 */
const FILE_SIZE_RATIO: Record<SolutionDepth, number> = {
  river: 0.3,
  turn: 0.1,
  flop: 0.1,
};

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

const store = useStore();
const savedConfig = useSavedConfigStore();

const name = ref(
  savedConfig.board.map((c) => RANKS[c >>> 2] + SUITS[c & 3]).join(" ")
);
const estimates = ref<[SolutionDepth, number][]>([]);
const selectedDepth = ref<SolutionDepth>("river");
const isSaving = ref(false);
const written = ref(0);
const errorText = ref("");

let unlisten: UnlistenFn | null = null;
let isUnmounted = false;

const dialog = ref<HTMLElement | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  // The keyboard starts in the dialog, on the name (ready to retype).
  nameInput.value?.focus();
  nameInput.value?.select();
  try {
    estimates.value =
      (await invokes.librarySaveEstimate()) as typeof estimates.value;
    // Up to the turn by default: small files, rivers re-solved on demand.
    if (estimates.value.some(([depth]) => depth === "turn")) {
      selectedDepth.value = "turn";
    }
  } catch (e) {
    errorText.value = String(e);
  }
  const stop = await listen<{ written: number }>(
    "library-save-progress",
    (event) => (written.value = event.payload.written)
  );
  // The dialog may have closed while the listener was being set up.
  if (isUnmounted) stop();
  else unlisten = stop;
});

onUnmounted(() => {
  isUnmounted = true;
  unlisten?.();
});

const save = async (overwrite: boolean) => {
  // Enter in the name works like the button: not before the depths are known.
  if (isSaving.value || !name.value.trim() || estimates.value.length === 0) {
    return;
  }
  isSaving.value = true;
  written.value = 0;
  errorText.value = "";
  let savedName = "";
  try {
    savedName = await invokes.librarySave(
      name.value,
      selectedDepth.value,
      overwrite,
      {
        treeConfig: { ...savedConfig.$state, spot: store.solvedSpot },
        iterations: store.solutionInfo?.iterations ?? 0,
        exploitability: store.solutionInfo?.exploitability ?? 0,
      }
    );
  } catch (e) {
    isSaving.value = false;
    if (String(e) === invokes.ERR_EXISTS) {
      if (await ask(`"${name.value}" already exists. Replace it?`)) {
        await save(true);
      }
    } else {
      errorText.value = String(e);
    }
    return;
  }
  isSaving.value = false;
  store.isSolutionSaved = true;
  if (store.solutionInfo) store.solutionInfo.name = savedName;
  emit("close");
};
</script>
