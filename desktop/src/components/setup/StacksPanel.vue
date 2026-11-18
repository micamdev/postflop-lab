<template>
  <UiPanel title="Stacks">
    <div class="grid grid-cols-3 gap-2">
      <UiField label="Pot">
        <input
          v-model.number="config.startingPot"
          type="number"
          min="1"
          class="ui-input w-full"
          :disabled="locked"
        />
      </UiField>
      <UiField label="Stack">
        <input
          v-model.number="config.effectiveStack"
          type="number"
          min="1"
          class="ui-input w-full"
          :disabled="locked"
        />
      </UiField>
      <UiField label="SPR">
        <span class="h-7 leading-7 text-xs tabular-nums">{{ spr }}</span>
      </UiField>
    </div>
  </UiPanel>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useConfigStore } from "../../store";
import UiField from "../ui/UiField.vue";
import UiPanel from "../ui/UiPanel.vue";
import { hasManualEdits } from "../../tree-config-value";

const config = useConfigStore();

const spr = computed(() =>
  config.startingPot > 0
    ? (config.effectiveStack / config.startingPot).toFixed(1)
    : "—"
);

const locked = computed(() => hasManualEdits(config));
</script>
