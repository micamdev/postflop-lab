<template>
  <!-- Narrow window: a rail of two buttons that unfolds the explorer over the page. -->
  <div
    v-if="isNarrow && !isExpanded"
    class="flex flex-col items-center shrink-0 w-11 gap-2 py-2 bg-panel border-r border-line"
  >
    <UiTooltip text="Saved ranges">
      <button
        type="button"
        class="w-8 h-8 rounded-md text-xs font-bold text-muted hover:text-ink hover:bg-panel2"
        aria-label="Saved ranges"
        @click="expand('ranges')"
      >
        R
      </button>
    </UiTooltip>
    <UiTooltip text="Saved trees">
      <button
        type="button"
        class="w-8 h-8 rounded-md text-xs font-bold text-muted hover:text-ink hover:bg-panel2"
        aria-label="Saved trees"
        @click="expand('configurations')"
      >
        T
      </button>
    </UiTooltip>
  </div>

  <aside
    v-else
    ref="root"
    :class="[
      'flex flex-col shrink-0 w-[250px] h-full bg-panel border-r border-line',
      isNarrow ? 'absolute left-0 top-0 z-30 shadow-2xl shadow-black/50' : '',
    ]"
  >
    <header class="flex items-center gap-2 px-2.5 pt-2.5">
      <UiSegmented
        :model-value="tab"
        :options="[
          { value: 'ranges', label: 'Ranges' },
          { value: 'configurations', label: 'Trees' },
        ]"
        @update:model-value="(value) => switchTab(value as SavedStore)"
      />
      <div class="flex-1" />
      <UiMenu :items="fileMenu">
        <template #trigger>
          <button
            type="button"
            class="w-7 h-7 rounded-md text-muted hover:text-ink hover:bg-panel2"
            aria-label="Import or export"
          >
            ⋯
          </button>
        </template>
      </UiMenu>
      <button
        v-if="isNarrow"
        type="button"
        class="w-7 h-7 rounded-md text-muted hover:text-ink hover:bg-panel2"
        aria-label="Collapse"
        @click="isExpanded = false"
      >
        «
      </button>
    </header>

    <div class="px-2.5 py-2">
      <input
        v-model="query"
        type="search"
        :placeholder="tab === 'ranges' ? 'Search ranges…' : 'Search trees…'"
        class="ui-input w-full"
      />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2 text-sm">
      <p v-if="tree.length === 0" class="px-2 py-3 text-muted">
        {{ tab === "ranges" ? "No saved ranges yet" : "No saved trees yet" }}
        — use “Save current”.
      </p>
      <p v-else-if="shown.length === 0" class="px-2 py-3 text-muted">
        No match
      </p>

      <template v-for="{ node, depth } in shown" :key="keyOf(node.path)">
        <div
          :class="[
            'group flex items-center gap-1.5 h-7 pr-1 rounded-md cursor-pointer select-none',
            keyOf(node.path) === selected
              ? 'bg-accent/15 text-ink'
              : 'hover:bg-panel2',
            node.kind === 'item' ? 'text-muted' : 'text-ink',
          ]"
          :style="{ paddingLeft: `${8 + depth * 14}px` }"
          :draggable="node.kind === 'item' && tab === 'ranges'"
          @click="onClick(node)"
          @dblclick="onDoubleClick(node)"
          @dragstart="(e) => onDragStart(e, node)"
        >
          <span class="w-3 text-[10px] text-muted">
            {{ node.kind === "folder" ? (isOpen(node.path) ? "▾" : "▸") : "" }}
          </span>
          <input
            v-if="
              editing?.kind === 'rename' && editing.key === keyOf(node.path)
            "
            v-model="nameInput"
            v-focus
            class="ui-input h-6 flex-1 min-w-0 px-1.5"
            @click.stop
            @keydown.enter="confirmEditing"
            @keydown.escape="cancelEditing"
          />
          <span v-else class="flex-1 truncate">{{ node.name }}</span>
          <span
            v-for="tag in tagsOf(node)"
            :key="tag"
            :class="[
              'px-1 rounded text-[10px] font-bold',
              tag === 'OOP'
                ? 'bg-oop/20 text-oop'
                : tag === 'IP'
                  ? 'bg-ip/20 text-ip'
                  : 'bg-accent/20 text-accent',
            ]"
          >
            {{ tag }}
          </span>
          <UiMenu :items="rowMenu(node)">
            <template #trigger>
              <button
                type="button"
                class="w-6 h-6 rounded text-muted opacity-0 group-hover:opacity-100 hover:text-ink hover:bg-panel2"
                aria-label="More"
                @click.stop
              >
                ⋯
              </button>
            </template>
          </UiMenu>
        </div>

        <div
          v-if="node.kind === 'item' && keyOf(node.path) === selected"
          class="flex gap-1.5 py-1"
          :style="{ paddingLeft: `${26 + depth * 14}px` }"
        >
          <template v-if="tab === 'ranges'">
            <UiButton size="sm" class="!text-oop" @click="useRange(node, 0)">
              → OOP
            </UiButton>
            <UiButton size="sm" class="!text-ip" @click="useRange(node, 1)">
              → IP
            </UiButton>
          </template>
          <UiButton v-else size="sm" @click="useTree(node)">Load</UiButton>
        </div>
      </template>
    </div>

    <footer class="px-2.5 py-2 border-t border-line">
      <div v-if="editing && editing.kind !== 'rename'" class="mb-2">
        <p class="mb-1 text-xs text-muted">{{ editingLabel }}</p>
        <input
          v-model="nameInput"
          v-focus
          placeholder="Name"
          class="ui-input w-full"
          @keydown.enter="confirmEditing"
          @keydown.escape="cancelEditing"
        />
        <div class="flex justify-end gap-1.5 mt-1.5">
          <UiButton size="sm" @click="cancelEditing">Cancel</UiButton>
          <UiButton size="sm" @click="confirmEditing">OK</UiButton>
        </div>
      </div>
      <p v-if="message" class="mb-2 text-xs text-red-400">{{ message }}</p>
      <div class="flex gap-1.5">
        <UiButton size="sm" @click="startNewFolder">＋ Folder</UiButton>
        <UiMenu :items="saveMenu">
          <template #trigger>
            <UiButton size="sm">Save current ▾</UiButton>
          </template>
        </UiMenu>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import * as Db from "../../db";
import {
  MAX_DEPTH,
  SavedNode,
  SavedStore,
  buildFolderTree,
  checkJsonItems,
  filterFolderTree,
  isUnder,
  itemsToAdd,
  nameTaken,
  renamedPath,
  rowFor,
  saveTargets,
  toJsonItems,
  visibleRows,
} from "../../saved-items";
import { RangeSource, useConfigStore, useStore } from "../../store";
import { applyConfigValue, configToValue } from "../../tree-config-value";
import { useRangeEditing } from "../../use-range-editing";
import { useWindowWidth } from "../../use-window-width";
import * as invokes from "../../invokes";
import { ask } from "../../library";
import UiButton from "../ui/UiButton.vue";
import UiMenu from "../ui/UiMenu.vue";
import UiSegmented from "../ui/UiSegmented.vue";
import UiTooltip from "../ui/UiTooltip.vue";

/** Focuses an input as soon as it appears. */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

const store = useStore();
const config = useConfigStore();
const editors = [useRangeEditing(0), useRangeEditing(1)];

const tab = ref<SavedStore>("ranges");
const rows = ref<(Db.DbItem | Db.DbGroup)[]>([]);
const query = ref("");
const openFolders = ref(new Set<string>());
const selected = ref<string | null>(null);
const message = ref("");

type Editing =
  | { kind: "rename"; key: string; node: SavedNode }
  | { kind: "newFolder"; parent: string[] }
  | { kind: "save"; target: 0 | 1 | "tree"; folder: string[] };
const editing = ref<Editing | null>(null);
const nameInput = ref("");

const keyOf = (path: string[]) => JSON.stringify(path);

/* Narrow window: the explorer folds into a rail. */
const width = useWindowWidth();
const isNarrow = computed(() => width.value < 1500);
const isExpanded = ref(false);
const root = ref<HTMLElement | null>(null);
const expand = (store: SavedStore) => {
  isExpanded.value = true;
  void switchTab(store);
};
const onOutsideClick = (e: MouseEvent) => {
  if (!isNarrow.value || !isExpanded.value || !root.value) return;
  const target = e.target as Node;
  // Menus and dialogs open in portals: clicks there are not "outside".
  const inPortal = (target as Element).closest?.(
    "[data-reka-popper-content-wrapper], [role=menu], [role=dialog]"
  );
  if (!root.value.contains(target) && !inPortal) isExpanded.value = false;
};

/* Data */
const tree = computed(() => buildFolderTree(rows.value));
const filtered = computed(() => filterFolderTree(tree.value, query.value));
const isOpen = (path: string[]) =>
  query.value.trim() !== "" || openFolders.value.has(keyOf(path));
const shown = computed(() => visibleRows(filtered.value, isOpen));

let channel = new BroadcastChannel(`item-picker-${tab.value}`);
const listen = () => {
  channel.onmessage = () => void reload();
};

const reload = async () => {
  rows.value = await Db.getArray(tab.value);
};

/** Reloads and tells the other pickers of this store (bunching editor) to reload too. */
const changed = async () => {
  await reload();
  channel.postMessage({ type: "importJson" });
};

const switchTab = async (value: SavedStore) => {
  if (value === tab.value) return;
  tab.value = value;
  selected.value = null;
  editing.value = null;
  message.value = "";
  channel.close();
  channel = new BroadcastChannel(`item-picker-${value}`);
  listen();
  await reload();
};

onMounted(async () => {
  listen();
  document.addEventListener("mousedown", onOutsideClick);
  await reload();
});
onUnmounted(() => {
  channel.close();
  document.removeEventListener("mousedown", onOutsideClick);
});
watch(tab, () => (query.value = ""));

/* Selection */
const findNode = (key: string | null): SavedNode | null => {
  if (key === null) return null;
  const path = JSON.parse(key) as string[];
  let list = tree.value;
  let node: SavedNode | undefined;
  for (const name of path) {
    node = list.find((n) => n.name === name);
    if (!node) return null;
    list = node.kind === "folder" ? node.children : [];
  }
  return node ?? null;
};

/** Where new folders and saves go: the selected folder, or the selected item's folder. */
const targetFolder = (): string[] => {
  const node = findNode(selected.value);
  if (!node) return [];
  return node.kind === "folder" ? node.path : node.path.slice(0, -1);
};

const onClick = (node: SavedNode) => {
  message.value = "";
  selected.value = keyOf(node.path);
  if (node.kind === "folder" && query.value.trim() === "") {
    const key = keyOf(node.path);
    const next = new Set(openFolders.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    openFolders.value = next;
  }
};

const onDoubleClick = (node: SavedNode) => {
  if (node.kind === "item" && tab.value === "configurations") useTree(node);
};

const onDragStart = (e: DragEvent, node: SavedNode) => {
  if (node.kind !== "item" || !e.dataTransfer) return;
  e.dataTransfer.setData(
    "application/x-postflop-range",
    JSON.stringify({ path: node.path, value: node.value })
  );
  e.dataTransfer.effectAllowed = "copy";
};

/* Using saved items */
const useRange = async (node: SavedNode, player: 0 | 1) => {
  if (node.kind !== "item") return;
  const ok = await editors[player].loadText(String(node.value), node.path);
  message.value = ok ? "" : editors[player].error.value;
  if (ok && isNarrow.value) isExpanded.value = false;
};

const useTree = (node: SavedNode) => {
  if (node.kind !== "item") return;
  applyConfigValue(config, node.value);
  store.treeSource = { path: node.path, modified: false };
  if (isNarrow.value) isExpanded.value = false;
};

const sameSource = (source: RangeSource | null, node: SavedNode) =>
  source !== null &&
  !source.modified &&
  keyOf(source.path) === keyOf(node.path);

const tagsOf = (node: SavedNode): string[] => {
  if (node.kind !== "item") return [];
  if (tab.value === "configurations") {
    return sameSource(store.treeSource, node) ? ["TREE"] : [];
  }
  const tags: string[] = [];
  if (sameSource(store.rangeSources[0], node)) tags.push("OOP");
  if (sameSource(store.rangeSources[1], node)) tags.push("IP");
  return tags;
};

/* Folder, save and rename (inline name input) */
const startNewFolder = () => {
  const parent = targetFolder();
  if (parent.length >= MAX_DEPTH - 1) {
    message.value = "Folders can only be nested 3 levels deep.";
    return;
  }
  editing.value = { kind: "newFolder", parent };
  nameInput.value = "";
  message.value = "";
};

const startSave = (target: 0 | 1 | "tree") => {
  const folder = targetFolder();
  if (folder.length >= MAX_DEPTH) {
    message.value = "Select a folder that is not this deep.";
    return;
  }
  editing.value = { kind: "save", target, folder };
  const source =
    target === "tree" ? store.treeSource : store.rangeSources[target];
  nameInput.value = source ? source.path[source.path.length - 1] : "";
  message.value = "";
};

const startRename = (node: SavedNode) => {
  editing.value = { kind: "rename", key: keyOf(node.path), node };
  nameInput.value = node.name;
  message.value = "";
};

const cancelEditing = () => {
  editing.value = null;
  message.value = "";
};

const editingLabel = computed(() => {
  const e = editing.value;
  if (!e || e.kind === "rename") return "";
  const where = e.kind === "newFolder" ? e.parent : e.folder;
  const place = where.length > 0 ? ` in ${where.join(" › ")}` : "";
  if (e.kind === "newFolder") return `New folder${place}`;
  const what =
    e.target === "tree" ? "tree" : e.target === 0 ? "OOP range" : "IP range";
  return `Save the ${what}${place}`;
});

const validName = (name: string) => {
  if (name === "") {
    message.value = "Enter a name.";
    return false;
  }
  return true;
};

const confirmEditing = async () => {
  const e = editing.value;
  if (!e) return;
  const name = nameInput.value.trim();
  if (!validName(name)) return;

  if (e.kind === "newFolder") {
    if (nameTaken(tree.value, e.parent, name)) {
      message.value = `“${name}” already exists here.`;
      return;
    }
    const ok = await Db.addGroup(
      tab.value,
      rowFor([...e.parent, name], true) as Db.DbGroup
    );
    if (!ok) {
      message.value = "The folder could not be created.";
      return;
    }
    const next = new Set(openFolders.value);
    if (e.parent.length > 0) next.add(keyOf(e.parent));
    openFolders.value = next;
    selected.value = keyOf([...e.parent, name]);
  } else if (e.kind === "save") {
    const path = [...e.folder, name];
    const value =
      e.target === "tree"
        ? configToValue(config)
        : await invokes.rangeToString(e.target);
    const taken = nameTaken(tree.value, e.folder, name);
    if (taken === "folder") {
      message.value = `A folder is named “${name}” here.`;
      return;
    }
    let ok: boolean;
    if (taken === "item") {
      if (!(await ask(`Overwrite “${name}”?`))) return;
      ok = await Db.overwriteItem(
        tab.value,
        rowFor(path, false, value) as Db.DbItem
      );
    } else {
      ok = await Db.addItem(tab.value, rowFor(path, false, value) as Db.DbItem);
    }
    if (!ok) {
      message.value = "It could not be saved.";
      return;
    }
    const source = { path, modified: false };
    if (e.target === "tree") store.treeSource = source;
    else store.rangeSources[e.target] = source;
    selected.value = keyOf(path);
  } else {
    const node = e.node;
    if (name !== node.name) {
      if (nameTaken(tree.value, node.path.slice(0, -1), name)) {
        message.value = `“${name}” already exists here.`;
        return;
      }
      const row = rowFor(
        node.path,
        node.kind === "folder",
        node.kind === "item" ? node.value : undefined
      );
      if (!(await Db.renameItem(tab.value, row, name))) {
        message.value = "It could not be renamed.";
        return;
      }
      followRename(node.path, name);
    }
  }

  editing.value = null;
  message.value = "";
  await changed();
};

/** Origins and open folders follow a rename. */
const followRename = (oldPath: string[], name: string) => {
  const update = (source: RangeSource | null) =>
    source && { ...source, path: renamedPath(source.path, oldPath, name) };
  if (tab.value === "ranges") {
    store.rangeSources = [
      update(store.rangeSources[0]),
      update(store.rangeSources[1]),
    ];
  } else {
    store.treeSource = update(store.treeSource);
  }
  openFolders.value = new Set(
    [...openFolders.value].map((key) =>
      keyOf(renamedPath(JSON.parse(key), oldPath, name))
    )
  );
  selected.value = keyOf(renamedPath(oldPath, oldPath, name));
};

const remove = async (node: SavedNode) => {
  const what =
    node.kind === "folder"
      ? `Delete the folder “${node.name}” and everything in it?`
      : `Delete “${node.name}”?`;
  if (!(await ask(what))) return;
  const row = rowFor(
    node.path,
    node.kind === "folder",
    node.kind === "item" ? node.value : undefined
  );
  if (!(await Db.deleteItem(tab.value, row))) {
    message.value = "It could not be deleted.";
    return;
  }
  // The loaded ranges or tree stay, but they no longer come from a saved item.
  const forget = (source: RangeSource | null) =>
    source && isUnder(source.path, node.path) ? null : source;
  if (tab.value === "ranges") {
    store.rangeSources = [
      forget(store.rangeSources[0]),
      forget(store.rangeSources[1]),
    ];
  } else {
    store.treeSource = forget(store.treeSource);
  }
  if (selected.value && isUnder(JSON.parse(selected.value), node.path)) {
    selected.value = null;
  }
  await changed();
};

/* Menus */
const rowMenu = (node: SavedNode) => [
  { label: "Rename", onSelect: () => startRename(node) },
  { label: "Delete", danger: true, onSelect: () => void remove(node) },
];

// Each tab saves its own kind of item, into the folder selected in that tab.
const saveMenu = computed(() =>
  saveTargets(tab.value).map(({ label, target }) => ({
    label,
    onSelect: () => startSave(target),
  }))
);

const fileMenu = computed(() => [
  { label: "Import JSON…", onSelect: () => void importJson() },
  { label: "Export JSON…", onSelect: () => void exportJson() },
]);

/* JSON import / export (same format as before: {version: 2, name, data}) */
const importJson = async () => {
  message.value = "";
  const filePath = await open({
    defaultPath: `${tab.value}.json`,
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
  if (!filePath) return;

  let obj: { version?: unknown; name?: unknown; data?: unknown };
  try {
    obj = JSON.parse(await readTextFile(filePath));
  } catch {
    message.value = "Parse error (invalid JSON)";
    return;
  }
  if (obj.version !== 2) {
    message.value = "Version mismatch";
    return;
  }
  if (obj.name !== tab.value) {
    message.value = "Data type mismatch";
    return;
  }
  if (!checkJsonItems(tab.value, obj.data)) {
    message.value = "Invalid data";
    return;
  }
  const toAdd = itemsToAdd(tab.value, obj.data, await Db.getArray(tab.value));
  if (typeof toAdd === "string") {
    message.value = `Cannot create group "${toAdd}" because the item already exists`;
    return;
  }
  if (!(await Db.bulkAdd(tab.value, toAdd))) {
    message.value = "The import failed.";
    return;
  }
  await changed();
};

const exportJson = async () => {
  const data = toJsonItems(tree.value);
  const filePath = await save({
    defaultPath: `${tab.value}.json`,
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });
  if (!filePath) return;
  await writeTextFile(
    filePath,
    JSON.stringify({ version: 2, name: tab.value, data }, undefined, 2)
  );
};

defineExpose({ reload });
</script>
