<template>
  <UiPanel title="Bet sizes">
    <template #actions>
      <UiTooltip
        text="Sizes in % of the pot, comma separated (e.g. 33, 75). Raises also accept 2.5x; a for all-in."
      >
        <span class="cursor-help">ⓘ</span>
      </UiTooltip>
    </template>

    <table class="w-full text-xs">
      <thead>
        <tr class="text-muted">
          <th class="pb-1 text-left font-semibold" />
          <th
            v-for="street in STREETS"
            :key="street"
            class="pb-1 text-left font-semibold"
          >
            {{ street }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <td class="pr-1.5 py-0.5 whitespace-nowrap text-muted">
            {{ row.label }}
          </td>
          <td v-for="(field, i) in row.fields" :key="i" class="py-0.5 pr-1">
            <input
              v-if="field"
              v-model="config[field]"
              type="text"
              :disabled="locked"
              :title="errors[field] ?? ''"
              :class="[
                'ui-input h-7 w-full px-1.5 text-xs',
                errors[field] ? '!border-red-500' : '',
              ]"
              @input="markTreeModified"
              @blur="sanitize(field)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="locked" class="mt-2 text-xs text-ip">
      This tree has lines edited by hand: pot, stack and sizes can only change
      in Edit tree.
    </p>

    <div class="flex items-center justify-between mt-2 text-xs">
      <span class="truncate text-muted" :title="treeOrigin">
        {{ treeOrigin }}
        <span v-if="store.treeSource?.modified" class="text-ip">
          (modified)</span
        >
      </span>
      <button
        type="button"
        class="shrink-0 font-semibold text-accent hover:underline"
        @click="store.sideView = 'tree-config'"
      >
        Edit tree ›
      </button>
    </div>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useConfigStore, useStore } from "../../store";
import { sanitizeBetString } from "../../utils";
import { hasManualEdits } from "../../tree-config-value";
import UiPanel from "../ui/UiPanel.vue";
import UiTooltip from "../ui/UiTooltip.vue";

type BetField =
  | "oopFlopBet"
  | "oopFlopRaise"
  | "oopTurnBet"
  | "oopTurnRaise"
  | "oopTurnDonk"
  | "oopRiverBet"
  | "oopRiverRaise"
  | "oopRiverDonk"
  | "ipFlopBet"
  | "ipFlopRaise"
  | "ipTurnBet"
  | "ipTurnRaise"
  | "ipRiverBet"
  | "ipRiverRaise";

const STREETS = ["Flop", "Turn", "River"];

const config = useConfigStore();
const store = useStore();
const locked = computed(() => hasManualEdits(config));
const errors = reactive<Partial<Record<BetField, string>>>({});

// A field outlined as invalid is checked again when its value changes from elsewhere.
watch(
  () => (Object.keys(errors) as BetField[]).map((field) => config[field]),
  () => {
    for (const field of Object.keys(errors) as BetField[]) {
      const result = sanitizeBetString(config[field], field.endsWith("Raise"));
      if (result.valid) delete errors[field];
      else errors[field] = result.s;
    }
  }
);

const rows = computed(() => {
  const list: { label: string; fields: (BetField | null)[] }[] = [
    { label: "OOP bet", fields: ["oopFlopBet", "oopTurnBet", "oopRiverBet"] },
    {
      label: "OOP raise",
      fields: ["oopFlopRaise", "oopTurnRaise", "oopRiverRaise"],
    },
    { label: "IP bet", fields: ["ipFlopBet", "ipTurnBet", "ipRiverBet"] },
    {
      label: "IP raise",
      fields: ["ipFlopRaise", "ipTurnRaise", "ipRiverRaise"],
    },
  ];
  if (config.donkOption) {
    list.push({
      label: "OOP donk",
      fields: [null, "oopTurnDonk", "oopRiverDonk"],
    });
  }
  return list;
});

/** Tidies a valid entry; keeps an invalid one as typed, outlined, with the reason. */
const sanitize = (field: BetField) => {
  const result = sanitizeBetString(config[field], field.endsWith("Raise"));
  if (result.valid) {
    config[field] = result.s;
    delete errors[field];
  } else {
    errors[field] = result.s;
  }
};

const treeOrigin = computed(() =>
  store.treeSource ? store.treeSource.path.join(" › ") : "Unsaved tree"
);

const markTreeModified = () => {
  if (store.treeSource) store.treeSource.modified = true;
};
</script>
