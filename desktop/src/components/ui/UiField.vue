<template>
  <label class="flex flex-col gap-1 text-sm">
    <span class="flex items-center gap-1.5 text-muted">
      <!-- With help: the label itself shows it on hover (dotted underline, no icon). -->
      <UiTooltip v-if="$slots.help">
        <span
          class="underline decoration-dotted decoration-muted/50 underline-offset-[3px] cursor-help"
          >{{ label }}</span
        >
        <template #content><slot name="help" /></template>
      </UiTooltip>
      <template v-else>{{ label }}</template>
    </span>
    <span class="flex items-center gap-1.5">
      <slot />
      <span v-if="suffix" class="text-muted">{{ suffix }}</span>
    </span>
    <span v-if="error" class="text-xs text-red-400">{{ error }}</span>
  </label>
</template>

<script setup lang="ts">
import UiTooltip from "./UiTooltip.vue";
defineProps<{ label: string; error?: string; suffix?: string }>();
</script>
