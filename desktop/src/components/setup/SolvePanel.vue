<template>
  <UiPanel title="Solve">
    <!-- Settings: a summary, the fields on demand (open when one is invalid). -->
    <div class="flex items-start justify-between gap-2 text-xs text-muted">
      <span class="tabular-nums">{{ summary }}</span>
      <button
        v-if="!settingsError"
        type="button"
        class="shrink-0 text-accent-ink hover:underline"
        :aria-expanded="isOpen"
        @click="isEditing = !isEditing"
      >
        {{ isOpen ? "Done" : "Edit" }}
      </button>
    </div>
    <div v-if="isOpen" class="mt-3 pt-3 border-t border-line">
      <SolveSettingsFields />
    </div>

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

// Solves the spot of the Setup. The solve settings are rarely changed: a summary line, the
// fields behind "Edit".

const store = useStore();
const session = useSolverSession();
const batch = useBatch();

const isEditing = ref(false);
const settingsError = computed(() => validateSolveSettings(session.settings));
// An invalid setting must not stay hidden.
const isOpen = computed(() => isEditing.value || settingsError.value !== null);

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
