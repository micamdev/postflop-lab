<template>
  <section
    :class="[
      'flex flex-col min-w-0 gap-2 rounded-lg border bg-panel px-3 py-2.5',
      isDropTarget ? 'border-accent' : 'border-line',
    ]"
    @dragover="onDragOver"
    @dragleave="isDropTarget = false"
    @drop="onDrop"
  >
    <header class="flex items-center gap-2 min-w-0">
      <span
        :class="[
          'px-1.5 py-0.5 rounded text-xs font-bold',
          player === 0 ? 'bg-oop/20 text-oop' : 'bg-ip/20 text-ip',
        ]"
      >
        {{ player === 0 ? "OOP" : "IP" }}
      </span>
      <span class="truncate text-xs text-muted" :title="originText">
        <template v-if="source">
          {{ source.path.slice(0, -1).join(" › ")
          }}{{ source.path.length > 1 ? " › " : "" }}
          <b class="font-semibold text-ink">{{
            source.path[source.path.length - 1]
          }}</b>
          <span v-if="source.modified" class="text-ip"> (modified)</span>
        </template>
        <template v-else>Unsaved range</template>
      </span>
      <div class="flex-1" />
      <template v-if="isEditing">
        <UiButton
          size="sm"
          title="Back to the range before Edit"
          @click="cancelEdit"
        >
          Cancel
        </UiButton>
        <UiButton size="sm" variant="primary" @click="isEditing = false">
          Done
        </UiButton>
      </template>
      <UiButton v-else size="sm" @click="startEdit">Edit</UiButton>
    </header>

    <div
      class="grid gap-[2px] select-none"
      style="grid-template-columns: repeat(13, minmax(0, 1fr))"
      @mouseleave="editing.endPaint"
      @mouseup="editing.endPaint"
    >
      <div
        v-for="cell in cells"
        :key="cell.index"
        :class="[
          'relative h-[clamp(22px,calc((100vh-460px)/14),44px)] rounded-[2px] overflow-hidden bg-cell',
          isEditing ? 'cursor-pointer' : '',
        ]"
        @mousedown="isEditing && editing.startPaint(cell.row, cell.col)"
        @mouseenter="isEditing && editing.paintOver(cell.row, cell.col)"
      >
        <div
          :class="['absolute inset-x-0 bottom-0', fillClass]"
          :style="{ height: `${store.ranges[player][cell.index]}%` }"
        />
        <span
          :class="[
            'relative px-[3px] text-[10px] leading-[18px]',
            store.ranges[player][cell.index] > 0
              ? 'font-semibold text-white'
              : 'text-muted/70',
          ]"
        >
          {{ cell.text }}
        </span>
      </div>
    </div>

    <footer class="flex items-center justify-between text-xs text-muted">
      <span>
        {{ editing.numCombos.value.toFixed(1) }} combos ({{
          ((editing.numCombos.value * 100) / ((52 * 51) / 2)).toFixed(1)
        }}%)
      </span>
      <span v-if="!isEditing">Drop a saved range here</span>
    </footer>

    <div v-if="isEditing" class="flex flex-col gap-2">
      <input
        v-model="editing.text.value"
        type="text"
        class="ui-input w-full"
        placeholder="AA,KQs,T9s-76s…"
        @focus="($event.target as HTMLInputElement).select()"
        @change="editing.applyText"
      />
      <p v-if="editing.error.value" class="text-xs text-red-400">
        {{ editing.error.value }}
      </p>
      <div class="flex items-center gap-2 text-sm">
        <span class="text-muted">Weight</span>
        <input
          v-model.number="editing.weight.value"
          type="range"
          min="0"
          max="100"
          step="5"
          class="flex-1 accent-[rgb(var(--accent))]"
          @change="editing.clampWeight"
        />
        <input
          v-model.number="editing.weight.value"
          type="number"
          min="0"
          max="100"
          class="ui-input w-16 text-center"
          @change="editing.clampWeight"
        />
        <span class="text-muted">%</span>
        <UiButton size="sm" @click="editing.invert">Invert</UiButton>
        <UiButton size="sm" variant="danger" @click="editing.clear">
          Clear
        </UiButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStore } from "../../store";
import { ranks } from "../../utils";
import { useRangeEditing } from "../../use-range-editing";
import UiButton from "../ui/UiButton.vue";

const props = defineProps<{ player: 0 | 1 }>();

const store = useStore();
const editing = useRangeEditing(props.player);
const isEditing = ref(false);
/** The range before Edit, for Cancel. */
let beforeEdit: Awaited<ReturnType<typeof editing.snapshot>> | null = null;

const startEdit = async () => {
  beforeEdit = await editing.snapshot();
  isEditing.value = true;
};

// A loaded solution replaces the ranges: the edit (and its Cancel) no longer applies.
watch(
  () => store.solutionLoadCount,
  () => {
    beforeEdit = null;
    isEditing.value = false;
  }
);

const cancelEdit = async () => {
  if (beforeEdit) await editing.restore(beforeEdit);
  beforeEdit = null;
  isEditing.value = false;
};
const isDropTarget = ref(false);

const source = computed(() => store.rangeSources[props.player]);
const originText = computed(() =>
  source.value ? source.value.path.join(" › ") : "Unsaved range"
);
const fillClass = props.player === 0 ? "bg-oop/85" : "bg-ip/85";

/** Hand class of a cell (row and col from 1, AA top left). */
const cellText = (row: number, col: number) => {
  const r1 = 13 - Math.min(row, col);
  const r2 = 13 - Math.max(row, col);
  return ranks[r1] + ranks[r2] + ["s", "", "o"][Math.sign(row - col) + 1];
};

const cells = Array.from({ length: 13 * 13 }, (_, index) => {
  const row = Math.floor(index / 13) + 1;
  const col = (index % 13) + 1;
  return { index, row, col, text: cellText(row, col) };
});

const RANGE_TYPE = "application/x-postflop-range";

const onDragOver = (e: DragEvent) => {
  if (!e.dataTransfer?.types.includes(RANGE_TYPE)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  isDropTarget.value = true;
};

const onDrop = async (e: DragEvent) => {
  isDropTarget.value = false;
  const data = e.dataTransfer?.getData(RANGE_TYPE);
  if (!data) return;
  e.preventDefault();
  const { path, value } = JSON.parse(data) as {
    path: string[];
    value: unknown;
  };
  await editing.loadText(String(value), path);
};
</script>
