<template>
  <UiPanel title="Memory">
    <!-- A fixed height for its two lines: the panels under it never move. -->
    <div class="min-h-[2.625rem]">
      <p v-if="state.kind === 'none'" class="text-xs text-muted">
        {{ state.reason || "Not estimated yet" }}
      </p>
      <p v-else-if="state.kind === 'pending'" class="text-xs text-muted">
        Estimating…
      </p>
      <template v-else>
        <p class="text-sm tabular-nums">
          <span
            :class="
              choice.ok && !choice.compression ? 'text-ink' : 'text-muted'
            "
          >
            {{ formatBytes(state.need32) }} (32-bit)
          </span>
          ·
          <span
            :class="choice.ok && choice.compression ? 'text-ink' : 'text-muted'"
          >
            {{ formatBytes(state.need16) }} (16-bit)
          </span>
        </p>
        <p
          :class="[
            'mt-1 text-xs',
            choice.ok
              ? choice.fellBack
                ? 'text-ip'
                : 'text-muted'
              : 'text-red-400',
          ]"
        >
          <template v-if="!choice.ok"
            >Not enough memory: {{ choice.message }}</template
          >
          <template v-else>
            {{
              Number.isFinite(state.available)
                ? `${formatBytes(state.available)} available`
                : "Memory unknown"
            }}
            ·
            {{ choice.compression ? "16-bit" : "32-bit" }}
            <template v-if="choice.fellBack">(32-bit does not fit)</template>
          </template>
        </p>
      </template>
    </div>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useConfigStore, useStore } from "../../store";
import {
  solveBlocker,
  memoryLimit,
  useSolverSession,
} from "../../solver-session";
import { choosePrecision } from "../../solve-status";
import { gameTreeArgs } from "../../game-args";
import { formatBytes } from "../../utils";
import { latestOnly } from "../../latest-only";
import * as invokes from "../../invokes";
import UiPanel from "../ui/UiPanel.vue";

type State =
  | { kind: "none"; reason: string }
  | { kind: "pending" }
  | { kind: "ready"; need32: number; need16: number; available: number };

const config = useConfigStore();
const store = useStore();
const session = useSolverSession();
const state = ref<State>({ kind: "none", reason: "" });

let requestId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

// One estimate in flight (each may build a tree): edits made meanwhile run once after it.
const estimate = latestOnly(async () => {
  const id = ++requestId;
  // The same check as Solve (setup and ranges): what is missing is shown under Solve.
  if (solveBlocker(config, store.ranges)) {
    // What the spot lacks is shown under Solve: not repeated here.
    state.value = { kind: "none", reason: "" };
    return;
  }
  state.value = { kind: "pending" };
  try {
    const [need32, need16] = await invokes.gameMemoryEstimate(
      gameTreeArgs(config)
    );
    const available = await memoryLimit();
    // A newer setup was sent meanwhile: its answer wins.
    if (id !== requestId) return;
    state.value = { kind: "ready", need32, need16, available };
  } catch (e) {
    if (id === requestId) state.value = { kind: "none", reason: String(e) };
  }
});

const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => void estimate(), 600);
};

watch(() => gameTreeArgs(config), schedule, { deep: true, immediate: true });
watch(() => store.ranges.slice(0, 2), schedule, { deep: true });
onUnmounted(() => clearTimeout(timer));

const choice = computed(() =>
  state.value.kind === "ready"
    ? choosePrecision(
        session.settings.precision,
        state.value.need32,
        state.value.need16,
        state.value.available,
        session.ignoreMemoryLimit
      )
    : { ok: true as const, compression: false, fellBack: false }
);
</script>
