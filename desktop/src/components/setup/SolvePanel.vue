<template>
  <UiPanel title="Solve">
    <!-- Settings: a summary; the fields in a popover; an invalid one is named under it. -->
    <div class="flex items-start justify-between gap-2 text-xs text-muted">
      <span class="tabular-nums">{{ summary }}</span>
      <UiPopover v-model:open="isOpen">
        <template #trigger>
          <button
            type="button"
            class="shrink-0 text-accent-ink hover:underline"
          >
            Edit
          </button>
        </template>
        <div class="w-72">
          <h3
            class="mb-3 text-[11px] font-semibold tracking-[0.07em] text-muted"
          >
            SOLVE SETTINGS
          </h3>
          <SolveSettingsFields />
        </div>
      </UiPopover>
    </div>
    <p v-if="settingsError" class="mt-2 text-xs text-red-400">
      {{ settingsError }}
    </p>

    <UiButton
      variant="primary"
      class="w-full mt-3"
      :disabled="!canSolve"
      @click="onSolve"
    >
      ▶ Solve
    </UiButton>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "../../store";
import { useSolverSession } from "../../solver-session";
import { validateSolveSettings } from "../../solve-settings";
import { useBatch } from "../../use-batch";
import { ask } from "../../library";
import UiPanel from "../ui/UiPanel.vue";
import UiButton from "../ui/UiButton.vue";
import SolveSettingsFields from "./SolveSettingsFields.vue";
import UiPopover from "../ui/UiPopover.vue";

// Solves the spot of the Setup. The solve settings are rarely changed: a summary line, the
// fields in a popover behind "Edit"; an invalid setting is shown under the summary.

const store = useStore();
const session = useSolverSession();
const batch = useBatch();

const isOpen = ref(false);
const settingsError = computed(() => validateSolveSettings(session.settings));

const summary = computed(() => {
  const s = session.settings;
  return [
    `${s.precision}-bit`,
    `target ${s.targetExploitability}%`,
    `max ${s.maxIterations} iterations`,
    `${s.threads} threads`,
    ...(store.isBunchingEnabled ? ["bunching on"] : []),
    ...(session.ignoreMemoryLimit ? ["RAM limit ignored"] : []),
  ].join(" · ");
});

const canSolve = computed(
  () =>
    !batch.isRunning &&
    !store.isLibraryBusy &&
    !store.isBunchingRunning &&
    !session.isBuilding &&
    !store.isSolveStarting &&
    !store.isSolverRunning &&
    !store.isSolverPaused &&
    !store.isFinalizing
);

const onSolve = async () => {
  if (store.isSolverFinished) {
    const question = !store.isSolutionSaved
      ? "The current solution is not saved. Solve a new one anyway?"
      : store.solutionLocks.length > 0
        ? "The current solution has node locks. Solve a new one without them?"
        : "";
    if (question && !(await ask(question))) return;
  }
  await session.solve();
};
</script>
