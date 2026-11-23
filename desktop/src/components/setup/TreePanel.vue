<template>
  <UiPanel>
    <!-- The whole tree: its origin and actions, then stacks and thresholds | bet sizes. -->
    <header class="flex items-center gap-2 mb-2 text-xs">
      <span class="text-[11px] font-semibold tracking-[0.07em] text-muted"
        >TREE</span
      >
      <span class="truncate text-muted" :title="treeOrigin">
        {{ treeOrigin }}
        <span v-if="store.treeSource?.modified" class="text-ip">
          (modified)</span
        >
      </span>
      <div class="flex-1" />
      <button
        type="button"
        class="px-1.5 rounded text-muted hover:bg-panel2 hover:text-ink"
        title="Empty every tree setting: stacks, bet sizes, thresholds and edited lines"
        @click="clearTree"
      >
        Clear
      </button>
      <button
        type="button"
        class="shrink-0 font-semibold text-accent-ink hover:underline"
        title="Preview the tree and add or remove lines"
        @click="store.sideView = 'tree-config'"
      >
        Edit lines ›
      </button>
    </header>

    <div
      class="grid gap-x-6 gap-y-3"
      style="grid-template-columns: minmax(0, 420px) minmax(0, 1fr)"
    >
      <section>
        <div
          class="mb-2 text-[11px] font-semibold tracking-[0.07em] text-muted"
        >
          STACKS &amp; THRESHOLDS
        </div>
        <div class="grid grid-cols-4 gap-x-3 gap-y-2">
          <UiField label="Pot" suffix="bb">
            <input
              v-model.number="potBb"
              type="number"
              min="0.1"
              step="0.1"
              :max="toBb(MAX_AMOUNT)"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
          <UiField label="Stack" suffix="bb">
            <input
              v-model.number="stackBb"
              type="number"
              min="0.1"
              step="0.1"
              :max="toBb(MAX_AMOUNT)"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
          <UiField label="SPR">
            <span class="h-7 leading-7 text-xs tabular-nums">{{ spr }}</span>
          </UiField>

          <UiField label="Rake" suffix="%">
            <input
              v-model.number="config.rakePercent"
              type="number"
              min="0"
              max="100"
              step="0.5"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
          <UiField label="Rake cap" suffix="bb">
            <template #help>
              The most rake taken from a pot. 0 means no rake.
            </template>
            <input
              v-model.number="rakeCapBb"
              type="number"
              min="0"
              step="0.1"
              :max="toBb(3 * MAX_AMOUNT)"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>

          <UiField label="Add all-in" suffix="%">
            <template #help>
              Add an all-in action wherever the largest possible bet is less
              than this share of the pot.
            </template>
            <input
              v-model.number="config.addAllInThreshold"
              type="number"
              min="0"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
          <UiField label="Force all-in" suffix="%">
            <template #help>
              <p>
                Replace a bet with an all-in if the SPR (stack / pot) after the
                bet is called is below this threshold. 15-20% is recommended.
              </p>
              <p class="mt-1">
                Like PioSOLVER's "all-in threshold", which looks at the share of
                the initial stack committed: with s the initial SPR and r Pio's
                threshold, Threshold = s × (1 − r) / (1 + 2 × s × r).
              </p>
            </template>
            <input
              v-model.number="config.forceAllInThreshold"
              type="number"
              min="0"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
          <UiField label="Merging" suffix="%">
            <template #help>
              <p>Merge bets of similar sizes, as PioSOLVER does.</p>
              <p class="mt-1">
                Take the largest bet (X% of the pot) and remove the other bets
                (Y%) with (100 + X) / (100 + Y) &lt; 1 + threshold; repeat with
                the next largest remaining bet.
              </p>
            </template>
            <input
              v-model.number="config.mergingThreshold"
              type="number"
              min="0"
              class="ui-input w-full"
              :disabled="locked"
            />
          </UiField>
        </div>

        <label class="flex items-center gap-2 mt-3 text-xs">
          <input
            v-model="config.donkOption"
            type="checkbox"
            class="rounded border-line bg-panel2 text-accent"
            :disabled="locked"
          />
          Different sizes for OOP donk bets (turn and river)
        </label>

        <ul v-if="errors.length > 0" class="mt-2 text-xs text-red-400">
          <li v-for="error in errors" :key="error">{{ error }}</li>
        </ul>
        <p v-if="config.forceAllInThreshold > 30" class="mt-2 text-xs text-ip">
          A force all-in threshold above 30% is not recommended (hover its
          label).
        </p>
      </section>
      <BetSizesFields />
    </div>

    <p v-if="locked" class="mt-2 text-xs text-ip">
      This tree has lines edited by hand: its settings and bet sizes are locked
      until the edits are cleared (Edit lines).
    </p>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { emptySetup, useConfigStore, useStore } from "../../store";
import { MAX_AMOUNT } from "../../utils";
import { fromBb, toBb } from "../../units";
import { setupErrors } from "../../setup-validation";
import { hasManualEdits } from "../../tree-config-value";
import UiField from "../ui/UiField.vue";
import UiPanel from "../ui/UiPanel.vue";
import BetSizesFields from "./BetSizesFields.vue";

// Stacks, rake, all-in thresholds, merging and donk bets: the tree settings besides the bet
// sizes. The tree's hand-edited lines are in the "Edit lines" view.

const config = useConfigStore();
const store = useStore();

const spr = computed(() =>
  config.startingPot > 0
    ? (config.effectiveStack / config.startingPot).toFixed(1)
    : "—"
);

const locked = computed(() => hasManualEdits(config));

/** A Setup amount typed in big blinds (stored in app units; a cleared field stays ""). */
const inBb = (field: "startingPot" | "effectiveStack" | "rakeCap") =>
  computed({
    get: () => {
      const value = config[field] as number | string;
      return typeof value === "number" && Number.isFinite(value)
        ? toBb(value)
        : value;
    },
    set: (bb: number | string) => {
      (config[field] as number | string) =
        typeof bb === "number" && Number.isFinite(bb) ? fromBb(bb) : bb;
    },
  });
const potBb = inBb("startingPot");
const stackBb = inBb("effectiveStack");
const rakeCapBb = inBb("rakeCap");

const errors = computed(() => {
  const all = setupErrors(config);
  return [...all.basics, ...all.misc];
});

/** Empties the tree: stacks, rake, bet sizes, thresholds, donk option and edited lines. */
const clearTree = () => {
  // Everything empty but the board.
  const { board, ...tree } = emptySetup();
  void board;
  config.$patch(tree);
};

const treeOrigin = computed(() =>
  store.treeSource ? store.treeSource.path.join(" › ") : "Unsaved tree"
);
</script>
