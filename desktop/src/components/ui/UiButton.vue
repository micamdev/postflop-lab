<template>
  <button
    type="button"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap',
      'transition-colors select-none disabled:opacity-40 disabled:cursor-default',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
      size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
      variantClass,
    ]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
  }>(),
  { variant: "ghost", size: "md", disabled: false }
);

const variantClass = computed(
  () =>
    ({
      primary:
        "bg-accent text-white hover:brightness-110 disabled:hover:brightness-100",
      ghost:
        "border border-line text-ink hover:bg-panel2 disabled:hover:bg-transparent",
      danger:
        "border border-red-500/60 text-red-400 hover:bg-red-500/10 disabled:hover:bg-transparent",
    })[props.variant]
);
</script>
