<template>
  <DialogRoot :open="open" @update:open="(value) => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/50" />
      <!-- No link focused on open: it would look selected. -->
      <DialogContent
        @open-auto-focus.prevent
        class="fixed left-1/2 top-1/3 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel shadow-2xl shadow-black/50 outline-none"
      >
        <div class="flex flex-col items-center px-6 pt-7 pb-5 text-center">
          <img
            src="/favicon.png"
            alt=""
            class="w-14 h-14 p-2.5 rounded-2xl bg-white"
          />
          <DialogTitle class="mt-3 text-lg font-semibold">
            Postflop Lab
          </DialogTitle>
          <div class="mt-0.5 text-xs text-muted">Version {{ version }}</div>
          <DialogDescription class="mt-3 text-sm text-muted">
            Free and open-source GTO postflop solver.
          </DialogDescription>
          <div class="mt-4 flex gap-2">
            <a
              v-for="link in links"
              :key="link.label"
              :href="link.href"
              target="_blank"
              class="px-3 py-1.5 rounded-md border border-line text-sm text-ink transition-colors hover:bg-panel2"
            >
              {{ link.label }}
            </a>
          </div>
        </div>
        <div
          class="flex items-end gap-4 px-6 py-3 border-t border-line text-xs text-muted"
        >
          <div class="flex-1 space-y-0.5">
            <p>
              Based on
              <a
                href="https://github.com/b-inary/desktop-postflop"
                target="_blank"
                class="text-accent-ink hover:underline"
                >Desktop Postflop</a
              >
              by Wataru Inariba.
            </p>
            <p>© 2022 Wataru Inariba, 2026 Michael Maccio</p>
            <p>License: AGPL-3.0</p>
          </div>
          <DialogClose as-child>
            <UiButton size="sm">Close</UiButton>
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
import { version } from "../../package.json";
import UiButton from "./ui/UiButton.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const repo = "https://github.com/micamdev/postflop-lab";
const links = [
  { label: "GitHub", href: repo },
  { label: "Releases", href: `${repo}/releases` },
  { label: "Report an issue", href: `${repo}/issues/new` },
];
</script>
