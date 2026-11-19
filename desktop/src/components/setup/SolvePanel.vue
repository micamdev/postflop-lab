<template>
  <UiPanel title="Solve">
    <!-- Settings: a summary; the fields in a popover from Edit; an invalid one is named. -->
    <template #actions>
      <UiPopover v-model:open="isOpen">
        <template #trigger>
          <button
            type="button"
            class="normal-case tracking-normal font-semibold text-accent-ink hover:underline"
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
    </template>
    <div class="text-xs text-muted tabular-nums leading-5">
      <div>{{ summary[0] }}</div>
      <div>{{ summary[1] }}</div>
    </div>

    <UiButton
      variant="primary"
      class="w-full mt-3"
      :disabled="!canSolve || blocker !== null"
      @click="onSolve"
    >
      ▶ Solve
    </UiButton>
    <!-- One line kept even when empty: the panel never changes height. -->
    <p
      class="h-4 mt-1.5 text-xs truncate"
      :class="settingsError ? 'text-red-400' : 'text-muted'"
      :title="status"
    >
      {{ status }}
    </p>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useConfigStore, useStore } from "../../store";
import { solveBlocker, useSolverSession } from "../../solver-session";
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
const config = useConfigStore();
const session = useSolverSession();
const batch = useBatch();

const isOpen = ref(false);
const settingsError = computed(() => validateSolveSettings(session.settings));
/** What the spot still lacks to be solved (board, ranges, tree settings), or null. */
const blocker = computed(() => solveBlocker(config, store.ranges));

/** Two lines: how it computes, then when it stops. */
const summary = computed(() => {
  const s = session.settings;
  return [
    [
      `${s.precision}-bit`,
      `${s.threads} threads`,
      ...(store.isBunchingEnabled ? ["bunching on"] : []),
      ...(session.ignoreMemoryLimit ? ["RAM limit ignored"] : []),
    ].join(" · "),
    `target ${s.targetExploitability}% · max ${s.maxIterations} iterations`,
  ];
});

/** Under the button: an invalid setting, or what the spot lacks, or nothing. */
const status = computed(() => settingsError.value ?? blocker.value ?? "");

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
