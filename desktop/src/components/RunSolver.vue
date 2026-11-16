<template>
  <!-- Interim page: replaced by the top bar and the solve settings panel. -->
  <div class="flex flex-col gap-2 max-w-md">
    <label class="flex items-center gap-2">
      Threads
      <input
        v-model.number="session.settings.threads"
        type="number"
        class="w-20 px-2 py-1 rounded-lg text-sm text-center"
      />
    </label>
    <label class="flex items-center gap-2">
      Precision
      <select
        v-model="session.settings.precision"
        class="px-2 py-1 rounded-lg text-sm"
      >
        <option value="32">32-bit</option>
        <option value="16">16-bit</option>
      </select>
    </label>
    <label class="flex items-center gap-2">
      Target exploitability (%)
      <input
        v-model.number="session.settings.targetExploitability"
        type="number"
        step="0.05"
        class="w-20 px-2 py-1 rounded-lg text-sm text-center"
      />
    </label>
    <label class="flex items-center gap-2">
      Max iterations
      <input
        v-model.number="session.settings.maxIterations"
        type="number"
        class="w-24 px-2 py-1 rounded-lg text-sm text-center"
      />
    </label>
    <label class="flex items-center gap-2">
      <input v-model="session.ignoreMemoryLimit" type="checkbox" />
      Ignore RAM limit (not recommended)
    </label>

    <div class="flex gap-3 mt-2">
      <button
        class="button-base button-blue"
        :disabled="
          store.hasSolverRun ||
          store.isLibraryBusy ||
          store.isBunchingRunning ||
          session.isBuilding
        "
        @click="session.solve()"
      >
        Solve
      </button>
      <button
        class="button-base button-red"
        :disabled="!store.isSolverRunning && !store.isSolverPaused"
        @click="session.stop()"
      >
        Stop
      </button>
      <button
        v-if="!store.isSolverPaused"
        class="button-base button-green"
        :disabled="!store.isSolverRunning"
        @click="session.pause()"
      >
        Pause
      </button>
      <button v-else class="button-base button-green" @click="session.resume()">
        Resume
      </button>
    </div>

    <div v-if="session.message" class="text-orange-500 font-semibold">
      {{ session.message }}
    </div>
    <div>Status: {{ status.label }}</div>
    <div v-if="session.iteration >= 0">
      Iteration: {{ session.iteration }} · Exploitability:
      {{ session.exploitability.toFixed(2) }}
    </div>

    <div v-if="store.isSolverFinished" class="flex items-center gap-3 mt-2">
      <button
        class="button-base button-green"
        :disabled="!session.canSave"
        @click="isSaveDialogOpen = true"
      >
        Save
      </button>
      <span v-if="session.saveDisabledReason" class="text-sm text-gray-600">
        {{ session.saveDisabledReason }}
      </span>
    </div>

    <SaveSolutionDialog
      v-if="isSaveDialogOpen"
      @close="isSaveDialogOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStore } from "../store";
import { useSolverSession } from "../solver-session";
import { solutionStatus } from "../solve-status";
import SaveSolutionDialog from "./SaveSolutionDialog.vue";

const store = useStore();
const session = useSolverSession();
const status = computed(() => solutionStatus(session.flags));
const isSaveDialogOpen = ref(false);
</script>
