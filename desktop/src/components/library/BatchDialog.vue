<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="emit('close')"
  >
    <div
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-dialog-title"
      tabindex="-1"
      class="w-[28rem] p-5 rounded-lg border border-line bg-panel shadow-xl outline-none"
      @keydown.esc="emit('close')"
    >
      <h2 id="batch-dialog-title" class="mb-1 font-semibold">
        Solve a flop subset
      </h2>
      <p class="mb-4 text-sm text-muted">
        The spot of the Setup (ranges, tree, threads, precision) solved on a set
        of flops that stands for all of them, each saved in the library. Its
        report then compares the flops. Node locks and the bunching effect are
        not used.
      </p>

      <div class="flex flex-col gap-3 text-sm">
        <div class="flex items-center justify-between gap-3">
          Flops
          <UiSegmented
            :model-value="String(size)"
            :options="
              SUBSET_SIZES.map((n) => ({
                value: String(n),
                label: n === 1755 ? 'All 1755' : String(n),
              }))
            "
            @update:model-value="size = Number($event)"
          />
        </div>
        <label class="flex items-center justify-between gap-3">
          Name prefix
          <input v-model="prefix" type="text" class="ui-input w-56" />
        </label>
        <div class="flex items-center justify-between gap-3">
          Target (of the pot)
          <UiSegmented
            :model-value="String(target)"
            :options="
              BATCH_TARGETS.map((t) => ({
                value: String(t),
                label: `${t}%`,
              }))
            "
            @update:model-value="target = Number($event)"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          Save depth
          <UiSegmented
            v-model="depth"
            :options="[
              { value: 'flop', label: 'Flop only' },
              { value: 'turn', label: 'Up to the turn' },
              { value: 'river', label: 'Complete' },
            ]"
          />
        </div>
        <p class="text-xs text-muted">
          {{
            depth === "flop"
              ? "Small files, enough for the report; turns and rivers cannot be opened."
              : "Larger files: a complete save of many flops can take a lot of disk space."
          }}
        </p>
      </div>

      <p v-if="plan && !plan.ok" class="mt-4 text-sm text-red-400">
        {{ plan.error }}
      </p>
      <p v-else-if="plan" class="mt-4 text-sm">
        {{ plan.toSolve.length }} to solve<span
          v-if="plan.skipped > 0"
          class="text-muted"
        >
          ({{ plan.skipped }} of this spot already in the library)</span
        >.
      </p>

      <div class="flex justify-end gap-2 mt-5">
        <UiButton @click="emit('close')">Cancel</UiButton>
        <UiButton
          variant="primary"
          :disabled="!canStart"
          :title="batch.isSolverBusy ? 'The solver or the library is busy' : ''"
          @click="onStart"
        >
          Solve {{ plan?.ok ? plan.toSolve.length : "" }} flops
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useBatch, BatchPreview } from "../../use-batch";
import { SUBSET_SIZES } from "../../flop-subsets";
import { BATCH_TARGETS, DEFAULT_BATCH_TARGET } from "../../solve-settings";
import { latestOnly } from "../../latest-only";
import * as invokes from "../../invokes";
import UiButton from "../ui/UiButton.vue";
import UiSegmented from "../ui/UiSegmented.vue";

const props = defineProps<{
  entries: invokes.LibraryEntry[];
  defaultPrefix: string;
}>();

const emit = defineEmits<{ (event: "close"): void }>();

// Focus inside on open: Escape closes, Tab starts from the dialog.
const dialog = ref<HTMLElement | null>(null);
onMounted(() => dialog.value?.focus());

const batch = useBatch();
const size = ref(49);
const prefix = ref(props.defaultPrefix);
const depth = ref("flop");
/** Exploitability to reach on each flop: the report averages them, so 1% is enough. */
const target = ref(DEFAULT_BATCH_TARGET);
const plan = ref<BatchPreview | null>(null);

// The plan for the current choices (one preview at a time, the latest choices last).
const updatePlan = latestOnly(async () => {
  plan.value = await batch.preview(
    size.value,
    prefix.value.trim(),
    props.entries
  );
});
watch([size, prefix, () => props.entries], () => void updatePlan(), {
  immediate: true,
});

const canStart = computed(
  () =>
    plan.value?.ok === true &&
    plan.value.toSolve.length > 0 &&
    !batch.isRunning &&
    !batch.isSolverBusy
);

const onStart = () => {
  const current = plan.value;
  if (!current?.ok || !canStart.value) return;
  emit("close");
  void batch.start(current, depth.value, target.value);
};
</script>
