<template>
  <label class="flex flex-col gap-1 text-sm">
    <span class="flex items-center gap-1.5 text-muted">
      {{ label }}
      <slot name="help" />
    </span>
    <span class="flex items-center gap-1.5">
      <slot />
      <span v-if="suffix" class="text-muted">{{ suffix }}</span>
    </span>
    <span v-if="error" class="text-xs text-red-400">{{ error }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ label: string; error?: string; suffix?: string }>();
</script>

<style>
/* Fields placed in a UiField (inputs and selects). */
.ui-input {
  @apply h-8 rounded-md border border-line bg-panel2 px-2 text-sm text-ink;
  @apply focus:border-accent focus:ring-1 focus:ring-accent;
  @apply disabled:opacity-50;
}
</style>
