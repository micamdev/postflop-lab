<template>
  <div>
    <div class="flex gap-3">
      <button class="button-base button-blue" @click="importFile">
        Import...
      </button>
      <button class="button-base button-blue" @click="openFolder">
        Open Folder
      </button>
      <button class="button-base button-blue" @click="refresh">Refresh</button>
    </div>

    <div v-if="errorText" class="mt-4 text-red-500">{{ errorText }}</div>
    <div v-if="busyText" class="flex items-center mt-4">
      <span class="spinner inline-block mr-3"></span>
      {{ busyText }}
    </div>

    <div v-if="entries.length === 0" class="mt-6 text-gray-500">
      No saved solutions yet. Solve a spot, then use "Save" in Run Solver.
    </div>

    <table v-else class="mt-6 w-full text-sm">
      <thead>
        <tr class="text-left border-b-2">
          <th class="py-1 pr-3">Name</th>
          <th class="py-1 pr-3">Board</th>
          <th class="py-1 pr-3">Date</th>
          <th class="py-1 pr-3">Depth</th>
          <th class="py-1 pr-3">Exploitability</th>
          <th class="py-1 pr-3">Precision</th>
          <th class="py-1 pr-3">Size</th>
          <th class="py-1"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry of entries"
          :key="entry.name"
          :class="'border-b ' + (entry.meta ? '' : 'text-gray-400')"
        >
          <td class="py-1.5 pr-3 font-semibold">
            <input
              v-if="renaming === entry.name"
              v-model="newName"
              type="text"
              class="px-1 py-0.5 rounded"
              @keydown.enter="rename(entry.name)"
              @keydown.esc="renaming = null"
            />
            <span v-else>{{ entry.name }}</span>
          </td>
          <template v-if="entry.meta">
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <span
                v-for="card of entry.meta.board"
                :key="card"
                :class="'mr-0.5 ' + cardText(card).colorClass"
              >
                {{ cardText(card).rank + cardText(card).suit }}
              </span>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              {{ new Date(entry.meta.created_at * 1000).toLocaleString() }}
            </td>
            <td class="py-1.5 pr-3">{{ depthLabel(entry.meta.depth) }}</td>
            <td class="py-1.5 pr-3">{{ exploitabilityText(entry.meta) }}</td>
            <td class="py-1.5 pr-3">{{ entry.meta.precision }}-bit</td>
          </template>
          <td v-else colspan="5" class="py-1.5 pr-3">
            Unreadable: {{ entry.error }}
          </td>
          <td class="py-1.5 pr-3 whitespace-nowrap">
            {{ formatBytes(entry.file_size) }}
          </td>
          <td class="py-1.5 whitespace-nowrap text-right">
            <template v-if="renaming === entry.name">
              <button class="link mr-3" @click="rename(entry.name)">OK</button>
              <button class="link" @click="renaming = null">Cancel</button>
            </template>
            <template v-else>
              <button
                v-if="entry.meta"
                class="link mr-3"
                :disabled="!!busyText"
                @click="load(entry.name)"
              >
                Load
              </button>
              <button
                v-if="entry.meta"
                class="link mr-3"
                @click="startRename(entry.name)"
              >
                Rename
              </button>
              <button
                v-if="entry.meta"
                class="link mr-3"
                @click="exportFile(entry.name)"
              >
                Export
              </button>
              <button class="link text-red-500" @click="remove(entry.name)">
                Delete
              </button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import { cardText } from "../utils";
import * as invokes from "../invokes";
import { ask, depthLabel, formatBytes, loadSolution } from "../library";

const store = useStore();

const entries = ref<invokes.LibraryEntry[]>([]);
const errorText = ref("");
const busyText = ref("");
const renaming = ref<string | null>(null);
const newName = ref("");

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
  () => store.sideView,
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

<style scoped>
.link {
  @apply text-blue-600 hover:underline disabled:opacity-40;
}
</style>
