<template>
  <div
    class="flex shrink-0 items-center gap-3 h-12 px-3 bg-bg border-b border-line overflow-x-auto whitespace-nowrap [&>*]:shrink-0"
  >
    <UiSegmented
      :model-value="displayMode"
      :options="tabs"
      @update:model-value="
        (mode) => updateDisplayMode(mode as Types.DisplayMode)
      "
    />
    <slot name="actions" />

    <div class="flex-1" />

    <template v-if="['basics', 'graphs', 'breakdown'].includes(displayMode)">
      <span class="text-xs text-muted">Player</span>
      <UiSegmented
        v-model="displayOptions.playerBasics"
        :options="playerOptions(autoPlayerBasics)"
        @update:model-value="updateDisplayOptions"
      />
    </template>
    <template v-if="displayMode === 'chance'">
      <span class="text-xs text-muted">Player</span>
      <UiSegmented
        v-model="displayOptions.playerChance"
        :options="playerOptions(autoPlayerChance)"
        @update:model-value="updateDisplayOptions"
      />
    </template>

    <template v-if="['basics', 'compare', 'breakdown'].includes(displayMode)">
      <span class="text-xs text-muted">Bars</span>
      <UiSegmented
        v-model="displayOptions.barHeight"
        :options="[
          { value: 'normalized', label: 'Normalized' },
          { value: 'absolute', label: 'Absolute' },
          { value: 'full', label: 'Full' },
        ]"
        @update:model-value="updateDisplayOptions"
      />
      <UiSegmented
        v-model="displayOptions.suit"
        :options="[
          { value: 'grouped', label: 'Grouped' },
          { value: 'individual', label: 'Suits' },
        ]"
        @update:model-value="updateDisplayOptions"
      />
      <select
        v-model="strategyContentPair"
        class="ui-input w-40 py-0"
        aria-label="Display"
        @change="updateDisplayOptions"
      >
        <option value="show,default">Strategy</option>
        <option value="show,eq">Strategy + EQ</option>
        <option value="show,ev">Strategy + EV</option>
        <option value="show,eqr">Strategy + EQR</option>
        <option value="none,default">Weight</option>
        <option value="none,eq">EQ</option>
        <option value="none,ev">EV</option>
        <option value="none,eqr">EQR</option>
      </select>
    </template>

    <UiSegmented
      v-if="displayMode === 'graphs'"
      v-model="displayOptions.contentGraphs"
      :options="[
        { value: 'eq', label: 'EQ' },
        { value: 'ev', label: 'EV' },
        { value: 'eqr', label: 'EQR' },
      ]"
      @update:model-value="updateDisplayOptions"
    />

    <select
      v-if="displayMode === 'chance'"
      v-model="displayOptions.chartChance"
      class="ui-input w-44 py-0"
      aria-label="Chart"
      @change="updateDisplayOptions"
    >
      <option value="strategy-combos">Strategy (combos)</option>
      <option value="strategy">Strategy (%)</option>
      <option value="eq">Equity</option>
      <option value="ev">EV</option>
      <option value="eqr">EQR</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRefs, watch } from "vue";
import { capitalize } from "../../utils";
import * as Types from "../../result-types";
import UiSegmented from "../ui/UiSegmented.vue";

const props = defineProps<{
  displayMode: Types.DisplayMode;
  chanceMode: string;
  autoPlayerBasics: "oop" | "ip";
  autoPlayerChance: "oop" | "ip";
}>();

const emit = defineEmits<{
  (event: "update:display-mode", displayMode: Types.DisplayMode): void;
  (event: "update:display-options", displayOptions: Types.DisplayOptions): void;
}>();

/**
 * Strategy, Equity and Breakdown (grid and summary), Turn / River while a card is being
 * dealt, then Compare (laid out differently: both ranges side by side).
 */
const tabs = computed(() => [
  { value: "basics", label: "Strategy" },
  { value: "graphs", label: "Equity" },
  { value: "breakdown", label: "Breakdown" },
  ...(props.chanceMode === ""
    ? []
    : [{ value: "chance", label: capitalize(props.chanceMode) }]),
  { value: "compare", label: "Compare" },
]);

const playerOptions = (auto: "oop" | "ip") => [
  { value: "auto", label: `Auto (${auto.toUpperCase()})` },
  { value: "oop", label: "OOP" },
  { value: "ip", label: "IP" },
];

const { chanceMode } = toRefs(props);
let displayModeOld = "basics" as Types.DisplayMode;

// Selecting a card-dealing node opens its tab; leaving it goes back to the previous one.
watch(chanceMode, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    displayModeOld = props.displayMode;
    emit("update:display-mode", "chance");
  } else if (!newValue && oldValue) {
    emit("update:display-mode", displayModeOld);
  }
});

const displayOptions = reactive<Types.DisplayOptions>(
  Types.defaultDisplayOptions()
);

const strategyContentPair = ref("show,default");

const savedDisplayOptions = localStorage.getItem("display-options");
if (savedDisplayOptions) {
  const saved: Types.DisplayOptions = JSON.parse(savedDisplayOptions);
  if (Types.barHeightList.includes(saved?.barHeight)) {
    displayOptions.barHeight = saved.barHeight;
  }
  if (Types.suitList.includes(saved?.suit)) {
    displayOptions.suit = saved.suit;
  }
  if (Types.strategyList.includes(saved?.strategy)) {
    displayOptions.strategy = saved.strategy;
  }
  if (Types.contentBasicsList.includes(saved?.contentBasics)) {
    displayOptions.contentBasics = saved.contentBasics;
  }
  if (Types.contentGraphsList.includes(saved?.contentGraphs)) {
    displayOptions.contentGraphs = saved.contentGraphs;
  }
  if (Types.chartChanceList.includes(saved?.chartChance)) {
    displayOptions.chartChance = saved.chartChance;
  }
  strategyContentPair.value = [
    displayOptions.strategy,
    displayOptions.contentBasics,
  ].join(",");
  emit("update:display-options", displayOptions);
}

const updateDisplayMode = (displayMode: Types.DisplayMode) => {
  if (displayMode !== "chance") {
    displayModeOld = displayMode;
  }
  emit("update:display-mode", displayMode);
};

const updateDisplayOptions = () => {
  const options = displayOptions;
  const [strategy, content] = strategyContentPair.value.split(",");
  options.strategy = strategy as Types.DisplayOptions["strategy"];
  options.contentBasics = content as Types.DisplayOptions["contentBasics"];
  localStorage.setItem("display-options", JSON.stringify(options));
  emit("update:display-options", options);
};
</script>
