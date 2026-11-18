// Saved ranges and tree configs (IndexedDB rows) as a folder tree, search and JSON
// import/export. Folders hold up to 3 levels, items up to 4 (`name0..name3`).

import type { DbGroup, DbItem } from "./db";

export type SavedStore = "ranges" | "configurations";

export type FolderNode = {
  kind: "folder";
  name: string;
  path: string[];
  children: SavedNode[];
};
export type ItemNode = {
  kind: "item";
  name: string;
  path: string[];
  value: unknown;
};
export type SavedNode = FolderNode | ItemNode;

/** Deepest path of an item; folders stop one level above. */
export const MAX_DEPTH = 4;

type Row = DbItem | DbGroup;

export const rowPath = (row: Row): string[] => {
  const path = [row.name0, row.name1, row.name2, row.name3];
  const end = path.indexOf("");
  return end === -1 ? path : path.slice(0, end);
};

const byName = (a: SavedNode, b: SavedNode) =>
  Number(b.kind === "folder") - Number(a.kind === "folder") ||
  a.name.localeCompare(b.name, undefined, { numeric: true });

export const buildFolderTree = (rows: Row[]): SavedNode[] => {
  const root: SavedNode[] = [];
  const folders = new Map<string, FolderNode>();
  const childrenOf = (path: string[]) =>
    path.length === 0
      ? root
      : (folders.get(JSON.stringify(path))?.children ?? null);

  // Parents before children.
  const sorted = [...rows].sort(
    (a, b) => rowPath(a).length - rowPath(b).length
  );
  for (const row of sorted) {
    const path = rowPath(row);
    const siblings = childrenOf(path.slice(0, -1));
    if (!siblings) continue; // orphan row: its folder is missing
    const name = path[path.length - 1];
    if (row.isGroup === 1) {
      const node: FolderNode = { kind: "folder", name, path, children: [] };
      folders.set(JSON.stringify(path), node);
      siblings.push(node);
    } else {
      siblings.push({ kind: "item", name, path, value: row.value });
    }
  }

  const sortAll = (nodes: SavedNode[]) => {
    nodes.sort(byName);
    for (const node of nodes)
      if (node.kind === "folder") sortAll(node.children);
  };
  sortAll(root);
  return root;
};

/**
 * Nodes matching `query` (case-insensitive, on names) with their ancestors; a matching
 * folder keeps all its content. An empty query keeps everything.
 */
export const filterFolderTree = (
  nodes: SavedNode[],
  query: string
): SavedNode[] => {
  const q = query.trim().toLowerCase();
  if (q === "") return nodes;
  const filter = (list: SavedNode[]): SavedNode[] =>
    list.flatMap((node): SavedNode[] => {
      if (node.name.toLowerCase().includes(q)) return [node];
      if (node.kind === "item") return [];
      const children = filter(node.children);
      return children.length > 0 ? [{ ...node, children }] : [];
    });
  return filter(nodes);
};

/** What already has `name` in `folder`, if anything. */
export const nameTaken = (
  nodes: SavedNode[],
  folder: string[],
  name: string
): "item" | "folder" | null => {
  let list = nodes;
  for (const part of folder) {
    const next = list.find((n) => n.kind === "folder" && n.name === part);
    if (!next || next.kind !== "folder") return null;
    list = next.children;
  }
  const found = list.find((n) => n.name === name);
  return found ? found.kind : null;
};

/** Deep equality of saved values (strings or plain objects). */
export const isEqual = (lhs: unknown, rhs: unknown): boolean => {
  if (lhs === null || typeof lhs !== "object") return lhs === rhs;
  if (Array.isArray(lhs)) {
    if (!Array.isArray(rhs) || lhs.length !== rhs.length) return false;
    return lhs.every((value, i) => isEqual(value, rhs[i]));
  }
  if (rhs === null || typeof rhs !== "object") return false;
  const lhsEntries = Object.entries(lhs);
  const rhsEntries = Object.entries(rhs);
  if (lhsEntries.length !== rhsEntries.length) return false;
  lhsEntries.sort((a, b) => a[0].localeCompare(b[0]));
  rhsEntries.sort((a, b) => a[0].localeCompare(b[0]));
  return lhsEntries.every(
    ([key, value], i) =>
      key === rhsEntries[i][0] && isEqual(value, rhsEntries[i][1])
  );
};

/** One entry of an exported JSON file (`{version: 2, name, data}`). */
export type JsonItem = { path: string[]; isGroup: boolean; value?: unknown };

/**
 * Whether `data` is a valid export for `store`: paths of trimmed non-empty names, folders up
 * to 3 levels and items up to 4, each parent listed before its children, no duplicate.
 * Trims the names in place.
 */
export const checkJsonItems = (
  store: SavedStore,
  data: unknown
): data is JsonItem[] => {
  if (!Array.isArray(data)) return false;
  const valueType = store === "ranges" ? "string" : "object";

  const seen = new Map<string, boolean>();
  seen.set(JSON.stringify([]), true);

  for (const item of data as JsonItem[]) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.isGroup !== "boolean" ||
      !Array.isArray(item.path) ||
      item.path.some((x) => typeof x !== "string") ||
      item.path.length > (item.isGroup ? MAX_DEPTH - 1 : MAX_DEPTH) ||
      (!item.isGroup &&
        (typeof item.value !== valueType || item.value === null))
    ) {
      return false;
    }

    item.path = item.path.map((x) => x.trim());

    if (
      item.path.length === 0 ||
      item.path.some((x) => x === "") ||
      !seen.get(JSON.stringify(item.path.slice(0, -1))) ||
      seen.has(JSON.stringify(item.path))
    ) {
      return false;
    }

    seen.set(JSON.stringify(item.path), item.isGroup);
  }

  return true;
};

/** The database row of a folder or an item at `path`. */
export const rowFor = (
  path: string[],
  isGroup: boolean,
  value?: unknown
): Row =>
  isGroup
    ? {
        name0: path[0],
        name1: path[1] ?? "",
        name2: path[2] ?? "",
        name3: path[3] ?? "",
        isGroup: 1,
      }
    : {
        name0: path[0],
        name1: path[1] ?? "",
        name2: path[2] ?? "",
        name3: path[3] ?? "",
        isGroup: 0,
        value,
      };

/**
 * Rows to add for an import (checked by `checkJsonItems`): folders and identical items
 * already present are skipped; an item whose name is taken by something else gets a
 * " (2)", " (3)"… suffix. Returns the name of a folder that collides with an existing item.
 */
export const itemsToAdd = (
  _store: SavedStore,
  data: JsonItem[],
  existing: Row[]
): Row[] | string => {
  const present = new Map<string, Row>();
  for (const row of existing) present.set(JSON.stringify(rowPath(row)), row);

  const added: Row[] = [];
  for (const entry of data) {
    const path = [...entry.path];
    const depth = path.length;
    const name = path[depth - 1];

    if (entry.isGroup) {
      const master = present.get(JSON.stringify(path));
      if (master && master.isGroup === 0) return name;
      if (!master) {
        const row = rowFor(path, true);
        added.push(row);
        present.set(JSON.stringify(path), row);
      }
      continue;
    }

    let i = 2;
    let master = present.get(JSON.stringify(path));
    while (
      master &&
      (master.isGroup === 1 || !isEqual(master.value, entry.value))
    ) {
      path[depth - 1] = `${name} (${i++})`;
      master = present.get(JSON.stringify(path));
    }
    if (!master) {
      const row = rowFor(path, false, entry.value);
      added.push(row);
      present.set(JSON.stringify(path), row);
    }
  }
  return added;
};

/** Export entries, parents before children. */
export const toJsonItems = (nodes: SavedNode[]): JsonItem[] =>
  nodes.flatMap((node): JsonItem[] =>
    node.kind === "folder"
      ? [{ path: node.path, isGroup: true }, ...toJsonItems(node.children)]
      : [{ path: node.path, isGroup: false, value: node.value }]
  );

/** Rows shown in the explorer: every node whose ancestors are all open, with its depth. */
export const visibleRows = (
  nodes: SavedNode[],
  isOpen: (path: string[]) => boolean,
  depth = 0
): { node: SavedNode; depth: number }[] =>
  nodes.flatMap((node) => [
    { node, depth },
    ...(node.kind === "folder" && isOpen(node.path)
      ? visibleRows(node.children, isOpen, depth + 1)
      : []),
  ]);

/** Whether `path` is `ancestor` or inside it. */
export const isUnder = (path: string[], ancestor: string[]): boolean =>
  ancestor.length <= path.length &&
  ancestor.every((name, i) => path[i] === name);

/** `path` after the node at `renamed` was renamed to `newName`. */
export const renamedPath = (
  path: string[],
  renamed: string[],
  newName: string
): string[] =>
  isUnder(path, renamed)
    ? path.map((name, i) => (i === renamed.length - 1 ? newName : name))
    : path;

/** What "Save current" can save from a tab: ranges (OOP or IP) or the tree config. */
/** A range to save: OOP (0), IP (1) or a bunching fold range (2–5); or the tree. */
export type SaveTarget = number | "tree";

/** What "Save current" offers; `foldPlayer` is the fold range being edited, if any. */
export const saveTargets = (
  store: SavedStore,
  foldPlayer: number | null = null
): { label: string; target: SaveTarget }[] =>
  store === "ranges"
    ? [
        { label: "OOP range", target: 0 },
        { label: "IP range", target: 1 },
        ...(foldPlayer === null
          ? []
          : [{ label: "Fold range", target: foldPlayer }]),
      ]
    : [{ label: "Tree config", target: "tree" }];

type Source = { path: string[]; modified: boolean } | null;

/**
 * Range sources after saving range `saved` over the item at `path`: that range now comes from
 * it, and another range that came from it no longer matches it.
 */
export const sourcesAfterOverwrite = (
  sources: Source[],
  saved: number,
  path: string[]
): Source[] =>
  sources.map((source, i) =>
    i === saved
      ? { path, modified: false }
      : source && JSON.stringify(source.path) === JSON.stringify(path)
        ? { ...source, modified: true }
        : source
  );
