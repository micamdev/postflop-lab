<template>
  <DialogRoot :open="open" @update:open="(value) => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <DialogContent
        class="fixed left-1/2 top-1/3 z-50 w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none"
      >
        <DialogTitle class="mb-3 text-base font-semibold">About</DialogTitle>
        <DialogDescription class="sr-only">
          Postflop Lab version and credits
        </DialogDescription>
        <AboutPage />
        <div class="mt-5 flex justify-end">
          <DialogClose as-child>
            <UiButton>Close</UiButton>
          </DialogClose>
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
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import AboutPage from "./AboutPage.vue";
import UiButton from "./ui/UiButton.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();
</script>
