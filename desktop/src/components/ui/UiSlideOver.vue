<template>
  <DialogRoot
    :open="open"
    :modal="false"
    @update:open="(value) => emit('update:open', value)"
  >
    <DialogPortal>
      <DialogContent
        class="fixed right-0 top-10 bottom-0 z-40 w-[360px] flex flex-col border-l border-line bg-panel shadow-2xl shadow-black/50 outline-none"
        @interact-outside="(e) => e.preventDefault()"
      >
        <header
          class="flex items-center justify-between h-11 px-4 border-b border-line"
        >
          <DialogTitle class="text-sm font-semibold">{{ title }}</DialogTitle>
          <DialogClose
            class="w-7 h-7 rounded-md text-muted hover:text-ink hover:bg-panel2"
            aria-label="Close"
          >
            ✕
          </DialogClose>
        </header>
        <DialogDescription class="sr-only">{{ title }}</DialogDescription>
        <div class="flex-1 overflow-y-auto px-4 py-3">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";

defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();
</script>
