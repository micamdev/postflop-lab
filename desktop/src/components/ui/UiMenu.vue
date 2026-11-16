<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :side-offset="4"
        align="end"
        class="z-50 min-w-[10rem] rounded-lg border border-line bg-panel2 p-1 shadow-xl shadow-black/40"
      >
        <DropdownMenuItem
          v-for="item in items"
          :key="item.label"
          :disabled="item.disabled"
          :class="[
            'flex items-center px-2.5 py-1.5 rounded-md text-sm cursor-pointer select-none outline-none',
            'data-[highlighted]:bg-accent/20 data-[disabled]:opacity-40 data-[disabled]:cursor-default',
            item.danger ? 'text-red-400' : 'text-ink',
          ]"
          @select="item.onSelect"
        >
          {{ item.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";

defineProps<{
  items: {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    danger?: boolean;
  }[];
}>();
</script>
