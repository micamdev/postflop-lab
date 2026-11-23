<template>
  <header
    class="flex shrink-0 items-center gap-3 h-10 px-3 bg-panel border-b border-line"
  >
    <BoardChips v-if="board.length > 0" :board="board" size="md" />
    <span class="font-semibold truncate max-w-[16rem]" :title="name">{{
      name
    }}</span>
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
        { value: 'library', label: 'Library' },
        { value: 'setup', label: 'Setup' },
        { value: 'results', label: 'Results' },
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
        :title="
          settingsError
            ? `Solve settings (Setup › Solve): ${settingsError}`
            : ''
        "
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

    <button
      v-if="batch.isRunning"
      type="button"
      class="text-xs text-muted hover:text-ink tabular-nums"
      title="A batch is solving flops: see the Library"
      @click="store.navView = 'library'"
    >
      Batch {{ batchProgressText }}
    </button>
    <UiTooltip v-if="updateState.update" :text="updateTooltip">
      <button
        type="button"
        class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent/15 text-accent-ink transition-colors hover:bg-accent/25 disabled:opacity-60 disabled:cursor-default"
        :disabled="isUpdating || updateBlocked !== null"
        @click="onUpdate"
      >
        {{ updateText }}
      </button>
    </UiTooltip>
    <UiTooltip text="About">
      <button
        type="button"
        class="w-5 h-5 rounded-full border border-line text-[11px] leading-none font-semibold text-muted transition-colors hover:text-ink hover:border-muted"
        aria-label="About"
        @click="isAboutOpen = true"
      >
        ?
      </button>
    </UiTooltip>

    <template v-if="action === 'save'">
      <UiButton variant="primary" @click="store.isSaveDialogOpen = true">
        Save
      </UiButton>
    </template>
    <template v-else-if="action === 'resolve-locks'">
      <UiButton
        v-if="savesBeside(session.flags, session.canSave)"
        @click="store.isSaveDialogOpen = true"
      >
        Save
      </UiButton>
      <UiButton
        variant="primary"
        :disabled="
          !store.currentLine ||
          lockResolve.isBusy ||
          !!lockResolve.disabledReason
        "
        :title="lockResolve.disabledReason"
        @click="onResolveLocks"
      >
        {{ lockResolve.isBusy ? "Preparing…" : "Re-solve with locks" }}
      </UiButton>
    </template>
  </header>

  <SaveSolutionDialog
    v-if="store.isSaveDialogOpen"
    @close="onSaveDialogClose"
  />
  <AboutDialog v-model:open="isAboutOpen" />
</template>

<script setup lang="ts">
import { exploitabilityText } from "../units";
import BoardChips from "./ui/BoardChips.vue";
import { computed, onUnmounted, ref } from "vue";
import { useStore, useConfigStore, useSavedConfigStore } from "../store";
import { useSolverSession } from "../solver-session";
import {
  StatusTone,
  primaryAction,
  savesBeside,
  progressFraction,
  solutionStatus,
} from "../solve-status";
import { validateSolveSettings } from "../solve-settings";
import UiButton from "./ui/UiButton.vue";
import UiSegmented from "./ui/UiSegmented.vue";
import UiTooltip from "./ui/UiTooltip.vue";
import SaveSolutionDialog from "./SaveSolutionDialog.vue";
import { useLockResolve } from "../lock-resolve";
import { hasPendingLocks } from "../lock-utils";
import AboutDialog from "./AboutDialog.vue";
import { useBatch } from "../use-batch";
import { useSolverBusy } from "../solver-busy";
import { ask } from "../library";
import {
  installUpdate,
  updateBlocker,
  updateButtonText,
  updateState,
} from "../update";

const store = useStore();
const config = useConfigStore();
const savedConfig = useSavedConfigStore();
const session = useSolverSession();
const batch = useBatch();
const batchProgressText = computed(() =>
  batch.progress ? `${batch.progress.index + 1}/${batch.progress.total}` : "…"
);

const lockResolve = useLockResolve();
const isAboutOpen = ref(false);

const solverBusy = useSolverBusy();
const updateBlocked = computed(() =>
  updateBlocker({ solverBusy: solverBusy.value, batchRunning: batch.isRunning })
);
const isUpdating = computed(
  () =>
    updateState.phase === "downloading" || updateState.phase === "installing"
);
const updateText = computed(() =>
  updateButtonText({
    ...updateState,
    version: updateState.update?.version ?? "",
  })
);
const updateTooltip = computed(() => {
  if (updateBlocked.value) return updateBlocked.value;
  if (updateState.phase === "failed") return updateState.error;
  return "Download, install and restart Postflop Lab";
});
const onUpdate = async () => {
  if (
    store.isSolverFinished &&
    !store.isSolutionSaved &&
    !(await ask(
      "The current solution is not saved. Update and restart anyway?"
    ))
  ) {
    return;
  }
  await installUpdate();
};

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-panel2 text-muted",
  busy: "bg-accent/15 text-accent-ink",
  warn: "bg-ip/15 text-ip",
  ok: "bg-act-check/15 text-act-check",
  error: "bg-red-500/15 text-red-400",
};

const board = computed(() =>
  session.flags.hasGame ? savedConfig.board : config.board
);
const name = computed(() => store.solutionInfo?.name ?? "New spot");
const status = computed(() => solutionStatus(session.flags));
const action = computed(() =>
  primaryAction(
    session.flags,
    session.canSave,
    hasPendingLocks(store.locks, store.solutionLocks)
  )
);

const onResolveLocks = async () => {
  if (!store.currentLine) return;
  await lockResolve.start(store.currentLine);
  if (lockResolve.error) session.message = lockResolve.error;
};

const onSaveDialogClose = async () => {
  store.isSaveDialogOpen = false;
  // A "Save first" of a re-solve with locks continues once saved.
  if ((await lockResolve.onSaveDialogClosed()) && lockResolve.error) {
    session.message = lockResolve.error;
  }
};
const settingsError = computed(() => validateSolveSettings(session.settings));

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
  return `it ${session.iteration} · ${exploitabilityText(session.exploitability, pot.value)}`;
});
</script>
