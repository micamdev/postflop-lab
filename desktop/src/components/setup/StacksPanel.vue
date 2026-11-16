<template>
  <UiPanel title="Stacks">
    <div class="grid grid-cols-3 gap-2">
      <UiField label="Pot">
        <input
          v-model.number="config.startingPot"
          type="number"
          min="1"
          class="ui-input w-full"
          @input="markTreeModified"
        />
      </UiField>
      <UiField label="Stack">
        <input
          v-model.number="config.effectiveStack"
          type="number"
          min="1"
          class="ui-input w-full"
          @input="markTreeModified"
        />
      </UiField>
      <UiField label="SPR">
        <span class="h-8 leading-8 text-sm tabular-nums">{{ spr }}</span>
      </UiField>
    </div>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useConfigStore, useStore } from "../../store";
import UiField from "../ui/UiField.vue";
import UiPanel from "../ui/UiPanel.vue";

const config = useConfigStore();
const store = useStore();

const spr = computed(() =>
  config.startingPot > 0
    ? (config.effectiveStack / config.startingPot).toFixed(1)
    : "—"
);

const markTreeModified = () => {
  if (store.treeSource) store.treeSource.modified = true;
};
</script>
