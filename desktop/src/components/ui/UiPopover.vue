<template>
  <PopoverRoot
    :open="open"
    @update:open="(value) => emit('update:open', value)"
  >
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side"
        :side-offset="6"
        align="end"
        :collision-padding="8"
        class="z-50 max-h-[var(--reka-popover-content-available-height)] overflow-y-auto rounded-lg border border-line bg-panel2 p-3 shadow-xl shadow-black/40"
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from "reka-ui";

// A panel anchored to its trigger, over the page (closes on a click outside or Escape).

withDefaults(
  defineProps<{
    open?: boolean;
    side?: "top" | "right" | "bottom" | "left";
  }>(),
  { open: undefined, side: "left" }
);

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();
</script>
