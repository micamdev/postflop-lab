<template>
  <section class="rounded-lg border border-line bg-panel px-3 py-2.5">
    <header
      v-if="title || $slots.actions"
      class="flex items-center justify-between mb-2 text-[11px] font-semibold tracking-[0.07em] text-muted"
    >
      <span>{{ title?.toUpperCase() }}</span>
      <div class="flex items-center gap-1.5"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>();
</script>
