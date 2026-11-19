// In-app updates: a background check of the latest GitHub release at startup, then on the
// user's request a download, the install and a restart (Tauri updater, signed packages).

import { markRaw, reactive } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdatePhase = "available" | "downloading" | "installing" | "failed";

/** Text of the top bar button. */
export const updateButtonText = (state: {
  phase: UpdatePhase;
  version: string;
  downloaded?: number;
  total?: number;
}): string => {
  switch (state.phase) {
    case "available":
      return `Update to ${state.version}`;
    case "downloading":
      return state.total
        ? `Downloading ${Math.floor(((state.downloaded ?? 0) / state.total) * 100)}%`
        : "Downloading…";
    case "installing":
      return "Installing…";
    case "failed":
      return "Update failed: retry";
  }
};

/** Why the update cannot start now (installing closes the app), or null. */
export const updateBlocker = (busy: {
  solverBusy: boolean;
  batchRunning: boolean;
}): string | null => {
  if (busy.solverBusy) return "Finish or stop the solve first";
  if (busy.batchRunning) return "Finish or stop the batch first";
  return null;
};

/** The update found at startup, if any, and how far its install is. */
export const updateState = reactive({
  update: null as Update | null,
  phase: "available" as UpdatePhase,
  downloaded: 0,
  total: undefined as number | undefined,
  error: "",
});

/** Keeps the update found, ready to install. */
export const rememberUpdate = (update: Update): void => {
  // Not proxied: Update keeps its resource id in a private field a Vue proxy cannot read.
  updateState.update = markRaw(update);
  updateState.phase = "available";
};

/**
 * Looks for a newer release. Silent on failure (offline, GitHub unreachable): the app works
 * the same without it. Skipped in development (`tauri dev`, the end-to-end test).
 */
export const checkForUpdate = async (): Promise<void> => {
  if (import.meta.env.DEV) return;
  try {
    const update = await check();
    if (update) rememberUpdate(update);
  } catch (e) {
    console.warn("Update check failed:", e);
  }
};

/** Downloads, verifies (signature), installs, then restarts the app. */
export const installUpdate = async (): Promise<void> => {
  const update = updateState.update;
  if (!update) return;
  updateState.phase = "downloading";
  updateState.downloaded = 0;
  updateState.total = undefined;
  updateState.error = "";
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        updateState.total = event.data.contentLength;
      } else if (event.event === "Progress") {
        updateState.downloaded += event.data.chunkLength;
      } else {
        updateState.phase = "installing";
      }
    });
    // On Windows the installer has already closed the app; elsewhere, restart it.
    await relaunch();
  } catch (e) {
    updateState.phase = "failed";
    updateState.error = String(e);
  }
};
