<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-2 mb-4">
      <input
        v-model="query"
        type="search"
        placeholder="Search by name or board (e.g. Jh9d4c)…"
        class="ui-input w-80"
      />
      <div class="flex-1" />
      <UiButton :disabled="store.isLibraryBusy" @click="importFile">
        Import…
      </UiButton>
      <UiButton @click="openFolder">Open folder</UiButton>
      <UiButton @click="refresh">Refresh</UiButton>
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
                <span class="inline-flex gap-0.5">
                  <span
                    v-for="card of entry.meta.board"
                    :key="card"
                    :class="[
                      'flex items-center justify-center w-5 h-6 rounded text-xs font-bold text-white',
                      suitBgClasses[card & 3],
                    ]"
                  >
                    {{ cardText(card).rank }}
                  </span>
                </span>
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
import { computed, onMounted, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { cardText, suitBgClasses } from "../utils";
import { SortKey, filterEntries, sortEntries } from "../library-list";
import UiButton from "./ui/UiButton.vue";
import UiMenu from "./ui/UiMenu.vue";
import * as invokes from "../invokes";
import { ask, depthLabel, formatBytes, loadSolution } from "../library";

const store = useStore();

const entries = ref<invokes.LibraryEntry[]>([]);
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
    filterEntries(entries.value, query.value),
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

const onRowClick = (entry: invokes.LibraryEntry) => {
  if (!entry.meta || store.isLibraryBusy || renaming.value === entry.name)
    return;
  void load(entry.name);
};

const rowMenu = (entry: invokes.LibraryEntry) => [
  ...(entry.meta
    ? [
        { label: "Open", onSelect: () => void load(entry.name) },
        { label: "Rename", onSelect: () => startRename(entry.name) },
        { label: "Export…", onSelect: () => void exportFile(entry.name) },
      ]
    : []),
  { label: "Delete", danger: true, onSelect: () => void remove(entry.name) },
];

const FILTERS = [{ name: "Postflop Lab solution", extensions: ["plab"] }];

const refresh = async () => {
  try {
    entries.value = await invokes.libraryList();
  } catch (e) {
    errorText.value = String(e);
  }
};

onMounted(refresh);
watch(
  () => store.navView,
  (view) => view === "library" && refresh()
);
watch(
  () => store.isSolutionSaved,
  (saved) => saved && refresh()
);

const run = async (action: () => Promise<void>) => {
  errorText.value = "";
  try {
    await action();
  } catch (e) {
    errorText.value = String(e);
  }
  await refresh();
};

const exploitabilityText = (meta: invokes.SolutionMeta) => {
  const pot = Number(meta.tree_config.startingPot) || 0;
  const percent =
    pot > 0 ? ` (${((meta.exploitability * 100) / pot).toFixed(2)}%)` : "";
  return meta.exploitability.toFixed(2) + percent;
};

const load = async (name: string) => {
  errorText.value = "";
  busyText.value = `Loading "${name}"...`;
  const error = await loadSolution(name);
  busyText.value = "";
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
      await invokes.libraryRename(from, to);
    } catch (e) {
      throw String(e) === invokes.ERR_EXISTS ? `"${to}" already exists.` : e;
    }
    if (store.solutionInfo?.name === from) store.solutionInfo.name = to;
  });
};

const remove = async (name: string) => {
  if (!(await ask(`Delete "${name}"? This cannot be undone.`))) return;
  await run(() => invokes.libraryDelete(name));
};

const importFile = async () => {
  const path = await open({ filters: FILTERS });
  if (!path) return;
  await run(async () => {
    try {
      await invokes.libraryImport(path, false);
    } catch (e) {
      if (String(e) !== invokes.ERR_EXISTS) throw e;
      if (await ask("A solution with this name already exists. Replace it?")) {
        await invokes.libraryImport(path, true);
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
