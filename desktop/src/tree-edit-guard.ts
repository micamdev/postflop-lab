// An open edit of the tree lines: leaving it (Back to setup, loading a solution) asks first
// when lines changed, instead of dropping them silently.

import { message } from "@tauri-apps/plugin-dialog";

export type LeaveChoice = "save" | "discard" | "stay";

type TreeEdit = {
  /** Lines differ from the Setup's (what Save would write). */
  isDirty: () => boolean;
  /** The edited tree is valid (Save is allowed). */
  canSave: () => boolean;
  save: () => void;
  discard: () => void;
};

let current: TreeEdit | null = null;

/** Registers the open edit; returns the function to call when it closes. */
export const openTreeEdit = (edit: TreeEdit): (() => void) => {
  current = edit;
  return () => {
    if (current === edit) current = null;
  };
};

const askInDialog = async (canSave: boolean): Promise<LeaveChoice> => {
  if (!canSave) {
    const buttons = { ok: "Discard", cancel: "Stay" };
    const answer = await message(
      "The edited tree has invalid lines and cannot be saved. Discard the edit?",
      { title: "Postflop Lab", kind: "warning", buttons }
    );
    return answer === buttons.ok ? "discard" : "stay";
  }
  const buttons = { yes: "Save", no: "Discard", cancel: "Stay" };
  const answer = await message(
    "The tree lines were edited but not saved. Save them before leaving?",
    { title: "Postflop Lab", kind: "warning", buttons }
  );
  if (answer === buttons.yes) return "save";
  if (answer === buttons.no) return "discard";
  return "stay";
};

/**
 * Ends the open edit before leaving it: saves or discards it, after asking when lines
 * changed. False when the user chose to stay (the caller does not leave).
 */
export const leaveTreeEdit = async (
  ask: (canSave: boolean) => Promise<LeaveChoice> = askInDialog
): Promise<boolean> => {
  const edit = current;
  if (!edit) return true;
  const canSave = edit.canSave();
  const choice = edit.isDirty() ? await ask(canSave) : "discard";
  if (choice === "stay") return false;
  if (choice === "save" && canSave) edit.save();
  else edit.discard();
  return true;
};
