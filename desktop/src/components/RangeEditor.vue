<template>
  <div class="flex mt-1">
    <div class="shrink-0 ml-1">
      <table class="shadow-md select-none snug" @mouseleave="dragEnd">
        <tr v-for="row in 13" :key="row" class="h-9">
          <td
            v-for="col in 13"
            :key="col"
            class="relative w-[2.625rem] border border-line"
            @mousedown="dragStart(row, col)"
            @mouseup="dragEnd"
            @mouseenter="mouseEnter(row, col)"
          >
            <div
              :class="
                'absolute w-full h-full left-0 top-0 ' +
                (row === col ? 'bg-panel2' : 'bg-cell')
              "
            >
              <div
                class="absolute w-full h-full left-0 top-0 bg-bottom bg-no-repeat"
                :style="{
                  'background-image': `linear-gradient(${yellow500} 0% 100%)`,
                  'background-size': `100% ${cellValue(row, col)}%`,
                }"
              ></div>
            </div>
            <div
              :class="
                'absolute -top-px left-[0.1875rem] z-10 text-shadow ' +
                (cellValue(row, col) > 0 ? 'text-white' : 'text-muted')
              "
            >
              {{ cellText(row, col) }}
            </div>
            <div
              class="absolute bottom-px right-1 z-10 text-sm text-shadow text-white"
            >
              {{
                cellValue(row, col) > 0 && cellValue(row, col) < 100
                  ? cellValue(row, col).toFixed(1)
                  : ""
              }}
            </div>
          </td>
        </tr>
      </table>

      <div class="mt-5">
        <div class="flex">
          <input
            v-model="rangeText"
            type="text"
            :class="
              'flex-grow mr-6 px-2 py-1 rounded-lg text-sm ' +
              (rangeTextError ? 'input-error' : '')
            "
            @focus="($event.target as HTMLInputElement).select()"
            @change="onRangeTextChange"
          />

          <UiButton
            v-if="player >= 2"
            class="mr-4"
            variant="ghost"
            @click="invertRange"
          >
            Invert
          </UiButton>

          <UiButton variant="ghost" @click="clearRange"> Clear </UiButton>
        </div>

        <div v-if="rangeTextError" class="mt-1 text-red-400">
          Error: {{ rangeTextError }}
        </div>
      </div>

      <div class="flex mt-3.5 items-center">
        <div>
          Weight:
          <input
            v-model="weight"
            type="range"
            class="ml-3 w-40 align-middle"
            min="0"
            max="100"
            step="5"
            @change="onWeightChange"
          />
          <input
            v-model="weight"
            type="number"
            :class="
              'w-20 ml-4 px-2 py-1 rounded-lg text-sm text-center ' +
              (weight < 0 || weight > 100 ? 'input-error' : '')
            "
            min="0"
            max="100"
            step="5"
            @change="onWeightChange"
          />
          %
        </div>

        <span class="inline-block ml-auto">
          {{ numCombos.toFixed(1) }} combos ({{
            ((numCombos * 100) / ((52 * 51) / 2)).toFixed(1)
          }}%)
        </span>
      </div>
    </div>

    <div class="flex-grow max-w-[18rem] ml-6">
      <!-- Saved ranges come from the explorer (drag one here, or its "→ Fold" button). -->
      <div
        :class="[
          'flex items-center justify-center h-28 px-4 rounded-lg border-2 border-dashed text-center text-sm',
          isDropTarget ? 'border-accent text-ink' : 'border-line text-muted',
        ]"
        @dragover="onDragOver"
        @dragleave="isDropTarget = false"
        @drop="onDrop"
      >
        Drop a saved range here, or use “→ Fold” in the explorer. Save it with
        “Save current › Fold range”.
      </div>

      <div v-if="player >= 2" class="flex mt-12 justify-center gap-4">
        <UiButton class="!px-5" variant="ghost" @click="emit('save')">
          Save Edit
        </UiButton>
        <UiButton class="!px-5" variant="danger" @click="emit('cancel')">
          Cancel Edit
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from "./ui/UiButton.vue";
import { ref } from "vue";
import { useStore } from "../store";
import { ranks } from "../utils";
import { useRangeEditing } from "../use-range-editing";

const yellow500 = "#eab308";

const props = withDefaults(
  defineProps<{ player: number; defaultText?: string }>(),
  { defaultText: "" }
);

const emit = defineEmits<{
  (event: "save"): void;
  (event: "cancel"): void;
}>();

const store = useStore();
const editing = useRangeEditing(props.player);
const { text: rangeText, error: rangeTextError, weight, numCombos } = editing;
rangeText.value = props.defaultText;

const cellText = (row: number, col: number) => {
  const r1 = 13 - Math.min(row, col);
  const r2 = 13 - Math.max(row, col);
  return ranks[r1] + ranks[r2] + ["s", "", "o"][Math.sign(row - col) + 1];
};

const cellValue = (row: number, col: number) => {
  return store.ranges[props.player][13 * (row - 1) + col - 1];
};

const dragStart = editing.startPaint;
const dragEnd = editing.endPaint;
const mouseEnter = editing.paintOver;
const onWeightChange = editing.clampWeight;
const onRangeTextChange = editing.applyText;
const clearRange = editing.clear;
const invertRange = editing.invert;
const RANGE_TYPE = "application/x-postflop-range";
const isDropTarget = ref(false);

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
  const { value } = JSON.parse(data) as { value: unknown };
  await editing.loadText(String(value));
};
</script>
