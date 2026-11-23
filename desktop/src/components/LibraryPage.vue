<template>
  <BatchDialog
    v-if="isBatchOpen"
    :entries="entries"
    default-prefix="Batch"
    @close="isBatchOpen = false"
  />
  <FlopReport
    v-if="reportSource"
    :key="reportSource.name"
    :entries="entries"
    :source="reportSource"
    :loading-text="busyText"
    @back="reportSource = null"
    @open="openFromReport"
    @refresh="refresh"
  />
  <div v-else class="flex flex-col h-full">
    <div class="flex items-center gap-2 mb-4">
      <input
        v-model="query"
        type="search"
        placeholder="Search by name or board (e.g. Jh9d4c)…"
        class="ui-input w-80"
      />
      <div class="flex-1" />
      <UiButton
        :disabled="batch.isRunning"
        title="Solve the Setup's spot on a set of flops, for a flop report"
        @click="isBatchOpen = true"
      >
        Solve a flop subset…
      </UiButton>
      <UiButton :disabled="store.isLibraryBusy" @click="importFile">
        Import…
      </UiButton>
      <UiButton @click="openFolder">Open folder</UiButton>
      <UiButton @click="refresh">Refresh</UiButton>
    </div>

    <div
      v-if="batch.isRunning"
      class="flex items-center gap-3 mb-3 text-sm text-muted"
    >
      <span class="spinner inline-block"></span>
      <span v-if="batch.progress">
        Batch: flop {{ batch.progress.index + 1 }}/{{
          batch.progress.total
        }}
        “{{ batch.progress.name }}”, iteration {{ batch.progress.iteration }}
      </span>
      <span v-else>Batch starting…</span>
      <UiButton size="sm" @click="batch.stop()">Stop</UiButton>
    </div>
    <div
      v-else-if="batch.result"
      class="flex flex-wrap items-center gap-3 mb-3 text-sm"
    >
      <span>
        Batch {{ batch.result.cancelled ? "stopped" : "done" }}:
        {{ batch.result.solved }} flop{{
          batch.result.solved === 1 ? "" : "s"
        }}
        saved<span v-if="batch.result.failed.length > 0" class="text-red-400"
          >, {{ batch.result.failed.length }} failed ({{
            batch.result.failed.join("; ")
          }})</span
        >.
      </span>
      <UiButton
        v-if="lastBatchSource"
        size="sm"
        @click="reportSource = lastBatchSource"
      >
        Open report
      </UiButton>
    </div>
    <div v-if="errorText" class="mb-3 text-sm text-red-400">
      {{ errorText }}
    </div>
    <div
      v-if="busyText"
      class="flex items-center gap-3 mb-3 text-sm text-muted"
    >
      <span class="spinner inline-block"></span>
      {{ busyText }}
    </div>

    <p v-if="entries.length === 0" class="mt-6 text-muted">
      No saved solutions yet — solve a spot, then Save in the top bar.
    </p>
    <p v-else-if="shown.length === 0" class="mt-6 text-muted">No match</p>

    <div
      v-else
      class="flex-1 min-h-0 overflow-y-auto rounded-lg border border-line bg-panel"
    >
      <table class="w-full text-sm tabular-nums">
        <thead class="sticky top-0 z-10 bg-panel2">
          <tr class="text-left text-xs text-muted">
            <th
              v-for="column in COLUMNS"
              :key="column.key"
              class="px-3 py-2 font-semibold cursor-pointer select-none hover:text-ink"
              @click="sortBy(column.key)"
            >
              {{ column.label }}
              <span v-if="sortKey === column.key">{{
                descending ? "▼" : "▲"
              }}</span>
            </th>
            <th class="px-3 py-2 font-semibold">Precision</th>
            <th class="w-10"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry of shown"
            :key="entry.name"
            :class="[
              'border-t border-line',
              entry.meta
                ? store.isLibraryBusy
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-panel2'
                : 'text-muted',
              entry.name === store.solutionInfo?.name ? 'bg-accent/10' : '',
            ]"
            @click="onRowClick(entry)"
          >
            <td class="px-3 py-2 font-semibold">
              <span
                v-if="renaming === entry.name"
                class="flex items-center gap-1.5"
                @click.stop
              >
                <input
                  v-model="newName"
                  v-focus
                  type="text"
                  class="ui-input h-7 w-56"
                  @click.stop
                  @keydown.enter="rename(entry.name)"
                  @keydown.esc="renaming = null"
                />
                <UiButton @click="rename(entry.name)">OK</UiButton>
                <UiButton @click="renaming = null">Cancel</UiButton>
              </span>
              <span v-else>{{ entry.name }}</span>
            </td>
            <template v-if="entry.meta">
              <td class="px-3 py-2 whitespace-nowrap">
                <BoardChips :board="entry.meta.board" />
              </td>
              <td class="px-3 py-2 whitespace-nowrap text-muted">
                {{ new Date(entry.meta.created_at * 1000).toLocaleString() }}
              </td>
              <td class="px-3 py-2">{{ depthLabel(entry.meta.depth) }}</td>
              <td class="px-3 py-2">{{ exploitabilityText(entry.meta) }}</td>
            </template>
            <td v-else colspan="4" class="px-3 py-2">
              Unreadable: {{ entry.error }}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-muted">
              {{ formatBytes(entry.file_size) }}
            </td>
            <td class="px-3 py-2 text-muted">
              {{ entry.meta ? entry.meta.precision + "-bit" : "" }}
            </td>
            <td class="px-2 py-1 text-right" @click.stop>
              <UiMenu :items="rowMenu(entry)">
                <template #trigger>
                  <button
                    type="button"
                    class="w-7 h-7 rounded-md text-muted hover:text-ink hover:bg-panel2"
                    aria-label="More"
                    :disabled="store.isLibraryBusy"
                  >
                    ⋯
                  </button>
                </template>
              </UiMenu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { latestOnly } from "../latest-only";
import { exploitabilityText as formatExploitability } from "../units";
import BoardChips from "./ui/BoardChips.vue";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import {
  FailedLoads,
  SortKey,
  filterEntries,
  noteLoad,
  sortEntries,
  withFailedLoads,
} from "../library-list";
import UiButton from "./ui/UiButton.vue";
import FlopReport from "./library/FlopReport.vue";
import BatchDialog from "./library/BatchDialog.vue";
import { useBatch } from "../use-batch";
import { configKey } from "../flop-report";
import UiMenu from "./ui/UiMenu.vue";
import * as invokes from "../invokes";
import {
  ask,
  deleteSolution,
  depthLabel,
  importSolution,
  formatBytes,
  loadSolution,
  renameSolution,
} from "../library";

const store = useStore();

const entries = ref<invokes.LibraryEntry[]>([]);
const batch = useBatch();
const isBatchOpen = ref(false);
// Each flop the batch saves shows up in the list (and in an open report).
watch(
  [() => batch.progress?.index, () => batch.isRunning],
  () => void refresh()
);
/** A solution of the last batch's spot, to open its report from. */
const lastBatchSource = computed(() => {
  const entry = entries.value.find(
    (e) =>
      e.meta && e.meta.board.length === 3 && configKey(e.meta) === batch.lastKey
  );
  return entry ? withMeta(entry) : null;
});
/** The solution whose flop report is shown (instead of the list), or null. */
const reportSource = ref<
  (invokes.LibraryEntry & { meta: invokes.SolutionMeta }) | null
>(null);
const withMeta = (entry: invokes.LibraryEntry) =>
  entry as invokes.LibraryEntry & { meta: invokes.SolutionMeta };

/** Opens a flop of the report; a refused load goes back to the list, where its error shows. */
const openFromReport = async (name: string) => {
  const entry = entries.value.find((e) => e.name === name);
  if (!entry || store.isLibraryBusy) return;
  await load(entry);
  if (errorText.value) reportSource.value = null;
};
const failedLoads: FailedLoads = reactive(new Map());
const errorText = ref("");
const busyText = ref("");
const renaming = ref<string | null>(null);
const newName = ref("");

/** Focuses an input as soon as it appears. */
// After a menu closes (it gives the focus back to its button first).
const vFocus = {
  mounted: (el: HTMLElement) => void setTimeout(() => el.focus(), 50),
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "board", label: "Board" },
  { key: "date", label: "Date" },
  { key: "depth", label: "Depth" },
  { key: "exploitability", label: "Exploitability" },
  { key: "size", label: "Size" },
];

const query = ref("");
const sortKey = ref<SortKey>("date");
const descending = ref(true);
const shown = computed(() =>
  sortEntries(
    filterEntries(withFailedLoads(entries.value, failedLoads), query.value),
    sortKey.value,
    descending.value
  )
);

/** Same column: reverse; new column: dates newest first, the rest ascending. */
const sortBy = (key: SortKey) => {
  if (sortKey.value === key) {
    descending.value = !descending.value;
  } else {
    sortKey.value = key;
    descending.value = key === "date";
  }
};

/** Readable, or only marked after a failed load (which may have been temporary). */
const canOpen = (entry: invokes.LibraryEntry) =>
  entry.meta !== null || failedLoads.has(entry.name);

const onRowClick = (entry: invokes.LibraryEntry) => {
  if (!canOpen(entry) || store.isLibraryBusy || renaming.value === entry.name)
    return;
  void load(entry);
};

const rowMenu = (entry: invokes.LibraryEntry) => [
  ...(canOpen(entry)
    ? [{ label: "Open", onSelect: () => void load(entry) }]
    : []),
  ...(entry.meta
    ? [
        ...(entry.meta.board.length === 3
          ? [
              {
                label: "Report",
                onSelect: () => (reportSource.value = withMeta(entry)),
              },
            ]
          : []),
        { label: "Rename", onSelect: () => startRename(entry.name) },
        { label: "Export…", onSelect: () => void exportFile(entry.name) },
      ]
    : []),
  { label: "Delete", danger: true, onSelect: () => void remove(entry.name) },
];

const FILTERS = [{ name: "Postflop Lab solution", extensions: ["plab"] }];

// One list read at a time (a batch, a save and a delete can all ask at once): an older
// answer arriving last would bring back a deleted or renamed file.
const refresh = latestOnly(async () => {
  try {
    entries.value = await invokes.libraryList();
  } catch (e) {
    errorText.value = String(e);
  }
});

onMounted(refresh);
watch(
  () => store.navView,
  (view) => view === "library" && refresh()
);
watch(
  () => store.isSolutionSaved,
  (saved) => {
    if (!saved) return;
    // The save may have replaced a marked file.
    failedLoads.clear();
    void refresh();
  }
);

/** Renames, deletes, imports: any file may have been replaced, the marks are dropped. */
const run = async (action: () => Promise<void>) => {
  errorText.value = "";
  failedLoads.clear();
  try {
    await action();
  } catch (e) {
    errorText.value = String(e);
  }
  await refresh();
};

const exploitabilityText = (meta: invokes.SolutionMeta) => {
  const pot = Number(meta.tree_config.startingPot) || 0;
  return formatExploitability(meta.exploitability, pot);
};

const load = async (entry: invokes.LibraryEntry) => {
  errorText.value = "";
  busyText.value = `Loading “${entry.name}”…`;
  let error: string | null;
  try {
    error = await loadSolution(entry.name);
  } catch (e) {
    // An unexpected failure must not leave "Loading…" on screen.
    error = String(e);
  } finally {
    busyText.value = "";
  }
  noteLoad(failedLoads, entry, error);
  if (error) errorText.value = error;
};

const startRename = (name: string) => {
  renaming.value = name;
  newName.value = name;
};

const rename = async (from: string) => {
  const to = newName.value;
  renaming.value = null;
  await run(async () => {
    try {
      await renameSolution(from, to);
    } catch (e) {
      throw String(e) === invokes.ERR_EXISTS ? `"${to}" already exists.` : e;
    }
  });
};

const remove = async (name: string) => {
  if (!(await ask(`Delete "${name}"? This cannot be undone.`))) return;
  await run(() => deleteSolution(name));
};

const importFile = async () => {
  const path = await open({ filters: FILTERS });
  if (!path) return;
  await run(async () => {
    try {
      await importSolution(path, false);
    } catch (e) {
      if (String(e) !== invokes.ERR_EXISTS) throw e;
      if (await ask("A solution with this name already exists. Replace it?")) {
        await importSolution(path, true);
      }
    }
  });
};

const exportFile = async (name: string) => {
  const path = await save({ defaultPath: `${name}.plab`, filters: FILTERS });
  if (!path) return;
  await run(() => invokes.libraryExport(name, path));
};

const openFolder = () => run(invokes.libraryOpenFolder);
</script>
