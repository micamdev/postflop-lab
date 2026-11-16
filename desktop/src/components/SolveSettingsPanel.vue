<template>
  <UiSlideOver
    :open="open"
    title="Solve settings"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="flex flex-col gap-4">
      <UiField label="Threads">
        <input
          v-model.number="session.settings.threads"
          type="number"
          min="1"
          max="64"
          class="ui-input w-24"
          :disabled="isRunning"
        />
      </UiField>

      <UiField label="Precision">
        <template #help>
          <UiTooltip>
            <span class="cursor-help text-muted">ⓘ</span>
            <template #content>
              <p>Precision mainly changes memory usage.</p>
              <p class="mt-1">
                16-bit uses about half the memory of 32-bit. Speed depends on
                the machine: 32-bit needs fewer instructions, 16-bit moves less
                memory.
              </p>
              <p class="mt-1">
                32-bit keeps about 7 significant digits, 16-bit about 4: 16-bit
                is not suited to a target below 0.1%.
              </p>
              <p class="mt-1">
                If 32-bit does not fit in memory, the solve switches to 16-bit.
              </p>
            </template>
          </UiTooltip>
        </template>
        <UiSegmented
          v-model="session.settings.precision"
          :options="[
            { value: '32', label: '32-bit', disabled: isRunning },
            { value: '16', label: '16-bit', disabled: isRunning },
          ]"
        />
      </UiField>

      <UiField label="Target exploitability" suffix="% of the pot">
        <template #help>
          <UiTooltip
            text="Distance to the Nash equilibrium at which the solve stops: lower is more accurate but slower."
          >
            <span class="cursor-help text-muted">ⓘ</span>
          </UiTooltip>
        </template>
        <input
          v-model.number="session.settings.targetExploitability"
          type="number"
          min="0"
          step="0.05"
          class="ui-input w-24"
          :disabled="store.isSolverRunning"
        />
      </UiField>

      <UiField label="Max iterations">
        <input
          v-model.number="session.settings.maxIterations"
          type="number"
          min="0"
          max="100000"
          class="ui-input w-28"
          :disabled="store.isSolverRunning"
        />
      </UiField>

      <p v-if="settingsError" class="text-xs text-red-400">
        {{ settingsError }}
      </p>

      <label class="flex items-center gap-2 text-sm">
        <input
          v-model="session.ignoreMemoryLimit"
          type="checkbox"
          class="rounded border-line bg-panel2 text-accent"
        />
        Ignore RAM limit (not recommended)
      </label>

      <section class="pt-3 border-t border-line">
        <h3 class="mb-2 text-[11px] font-semibold tracking-[0.07em] text-muted">
          ADVANCED
        </h3>
        <div class="flex items-center justify-between text-sm">
          <span>
            Bunching effect:
            <span class="text-muted">{{ bunchingText }}</span>
          </span>
          <UiButton size="sm" @click="openBunching">Bunching effect…</UiButton>
        </div>
        <p class="mt-1 text-xs text-muted">
          Solutions solved with the bunching effect cannot be saved or locked.
        </p>
      </section>
    </div>
  </UiSlideOver>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "../store";
import { useSolverSession } from "../solver-session";
import { validateSolveSettings } from "../solve-settings";
import { cardText } from "../utils";
import UiSlideOver from "./ui/UiSlideOver.vue";
import UiField from "./ui/UiField.vue";
import UiSegmented from "./ui/UiSegmented.vue";
import UiTooltip from "./ui/UiTooltip.vue";
import UiButton from "./ui/UiButton.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const store = useStore();
const session = useSolverSession();

const isRunning = computed(
  () => store.isSolverRunning || store.isSolverPaused || store.isFinalizing
);
const settingsError = computed(() => validateSolveSettings(session.settings));

const bunchingText = computed(() => {
  if (!store.isBunchingEnabled) return "Off";
  if (store.bunchingFlop.length === 0) return "On — data not ready";
  const flop = store.bunchingFlop
    .map((card) => {
      const text = cardText(card);
      return text.rank + text.suit;
    })
    .join("");
  return `On — flop ${flop}`;
});

const openBunching = () => {
  store.navView = "setup";
  store.sideView = "bunching";
  emit("update:open", false);
};
</script>
