<template>
  <header
    class="flex shrink-0 items-center gap-3 h-10 px-3 bg-panel border-b border-line"
  >
    <div v-if="board.length > 0" class="flex gap-0.5">
      <span
        v-for="card in board"
        :key="card"
        :class="[
          'flex items-center justify-center w-[22px] h-7 rounded text-[13px] font-bold text-white',
          suitBgClasses[card & 3],
        ]"
      >
        {{ cardText(card).rank }}
      </span>
    </div>
    <span class="font-semibold truncate max-w-[16rem]">{{ name }}</span>
    <span
      :class="[
        'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold',
        toneClass[status.tone],
      ]"
    >
      ● {{ status.label }}
    </span>

    <UiSegmented
      v-model="store.navView"
      class="ml-2"
      :options="[
        { value: 'setup', label: 'Setup' },
        { value: 'results', label: 'Results' },
        { value: 'library', label: 'Library' },
      ]"
    />

    <div class="flex-1" />

    <template v-if="action === 'progress'">
      <div class="flex items-center gap-2.5 text-xs text-muted tabular-nums">
        <div class="w-36 h-1.5 rounded-full bg-panel2 overflow-hidden">
          <div
            class="h-full bg-accent transition-[width]"
            :style="{ width: `${progress * 100}%` }"
          />
        </div>
        <span>{{ progressText }}</span>
        <span>{{ elapsedText }}</span>
      </div>
      <UiButton
        v-if="!store.isSolverPaused"
        size="sm"
        :disabled="!store.isSolverRunning"
        @click="session.pause()"
      >
        Pause
      </UiButton>
      <UiButton
        v-else
        size="sm"
        :disabled="settingsError !== null"
        @click="session.resume()"
      >
        Resume
      </UiButton>
      <UiButton
        size="sm"
        :disabled="store.isFinalizing"
        @click="session.stop()"
      >
        Stop
      </UiButton>
    </template>

    <UiTooltip text="Solve settings">
      <button
        type="button"
        class="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-panel2"
        aria-label="Solve settings"
        @click="isSettingsOpen = !isSettingsOpen"
      >
        ⚙
      </button>
    </UiTooltip>
    <UiTooltip text="About">
      <button
        type="button"
        class="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-panel2"
        aria-label="About"
        @click="isAboutOpen = true"
      >
        ?
      </button>
    </UiTooltip>

    <template v-if="action === 'save'">
      <UiButton :disabled="!canSolve" @click="onSolve">▶ Solve</UiButton>
      <UiButton variant="primary" @click="isSaveDialogOpen = true">
        Save
      </UiButton>
    </template>
    <UiButton
      v-else-if="action === 'solve'"
      variant="primary"
      :disabled="!canSolve"
      @click="onSolve"
    >
      ▶ Solve
    </UiButton>
  </header>

  <SolveSettingsPanel v-model:open="isSettingsOpen" />
  <SaveSolutionDialog
    v-if="isSaveDialogOpen"
    @close="isSaveDialogOpen = false"
  />
  <AboutDialog v-model:open="isAboutOpen" />
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useStore, useConfigStore, useSavedConfigStore } from "../store";
import { useSolverSession } from "../solver-session";
import {
  StatusTone,
  primaryAction,
  progressFraction,
  solutionStatus,
} from "../solve-status";
import { validateSolveSettings } from "../solve-settings";
import { cardText, suitBgClasses } from "../utils";
import { ask } from "../library";
import UiButton from "./ui/UiButton.vue";
import UiSegmented from "./ui/UiSegmented.vue";
import UiTooltip from "./ui/UiTooltip.vue";
import SolveSettingsPanel from "./SolveSettingsPanel.vue";
import SaveSolutionDialog from "./SaveSolutionDialog.vue";
import AboutDialog from "./AboutDialog.vue";

const store = useStore();
const config = useConfigStore();
const savedConfig = useSavedConfigStore();
const session = useSolverSession();

const isSettingsOpen = ref(false);
const isSaveDialogOpen = ref(false);
const isAboutOpen = ref(false);

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-panel2 text-muted",
  busy: "bg-accent/15 text-accent",
  warn: "bg-ip/15 text-ip",
  ok: "bg-act-check/15 text-act-check",
  error: "bg-red-500/15 text-red-400",
};

const board = computed(() =>
  session.flags.hasGame ? savedConfig.board : config.board
);
const name = computed(() => store.solutionInfo?.name ?? "New spot");
const status = computed(() => solutionStatus(session.flags));
const action = computed(() => primaryAction(session.flags, session.canSave));
const settingsError = computed(() => validateSolveSettings(session.settings));

const canSolve = computed(
  () =>
    !store.isLibraryBusy &&
    !store.isBunchingRunning &&
    !session.isBuilding &&
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

// Live elapsed time while the solver runs.
const now = ref(performance.now());
const timer = setInterval(() => (now.value = performance.now()), 500);
onUnmounted(() => clearInterval(timer));

const elapsedText = computed(() => {
  const running =
    session.segmentStart > 0 ? now.value - session.segmentStart : 0;
  const ms = Math.max(0, session.elapsedMs) + Math.max(0, running);
  return `${(ms / 1000).toFixed(1)} s`;
});

const pot = computed(() => savedConfig.startingPot || config.startingPot);

const progress = computed(() =>
  progressFraction({
    iteration: Math.max(0, session.iteration),
    maxIterations: session.settings.maxIterations,
    initialExploitability: session.initialExploitability,
    exploitability: session.exploitability,
    target: (pot.value * session.settings.targetExploitability) / 100,
  })
);

const progressText = computed(() => {
  if (store.isFinalizing) return "Finalizing…";
  if (session.iteration === -1) return "Allocating memory…";
  if (session.iteration === -2) return "Collecting bunching data…";
  if (!Number.isFinite(session.exploitability)) {
    return `it ${session.iteration}`;
  }
  const percent = (session.exploitability * 100) / pot.value;
  return (
    `it ${session.iteration} · ${session.exploitability.toFixed(2)} ` +
    `(${percent.toFixed(2)}%)`
  );
});
</script>
