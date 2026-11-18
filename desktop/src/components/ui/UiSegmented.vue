<template>
  <ToggleGroupRoot
    :model-value="modelValue"
    type="single"
    class="inline-flex rounded-[7px] border border-line bg-panel2 p-0.5"
    @update:model-value="onUpdate"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="option.disabled"
      :class="[
        'px-2.5 py-0.5 rounded-[5px] text-xs font-medium transition-colors select-none',
        'disabled:opacity-40 disabled:cursor-default',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
        option.value === modelValue
          ? 'bg-sel text-ink'
          : 'text-muted hover:text-ink',
      ]"
    >
      {{ option.label }}
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<script setup lang="ts">
import { ToggleGroupItem, ToggleGroupRoot } from "reka-ui";

defineProps<{
  modelValue: string;
  options: { value: string; label: string; disabled?: boolean }[];
}>();

const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

// A single toggle group can be emptied by clicking the selected item: keep the selection.
const onUpdate = (value: unknown) => {
  if (typeof value === "string" && value !== "")
    emit("update:modelValue", value);
};
</script>
