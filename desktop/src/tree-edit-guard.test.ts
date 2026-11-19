import { afterEach, describe, expect, test, vi } from "vitest";
import { leaveTreeEdit, openTreeEdit } from "./tree-edit-guard";

describe("leaving the tree lines editor", () => {
  let close: (() => void) | null = null;
  afterEach(() => {
    close?.();
    close = null;
  });

  const edit = (dirty: boolean, canSave = true) => {
    const save = vi.fn();
    const discard = vi.fn();
    close = openTreeEdit({
      isDirty: () => dirty,
      canSave: () => canSave,
      save,
      discard,
    });
    return { save, discard };
  };

  test("no edit open, or nothing changed: leave without asking", async () => {
    const ask = vi.fn();
    expect(await leaveTreeEdit(ask)).toBe(true);
    const { discard } = edit(false);
    expect(await leaveTreeEdit(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    // The unchanged edit is closed the same way as Discard.
    expect(discard).toHaveBeenCalledOnce();
  });

  test("changed lines: Save keeps them, Discard drops them, Stay stays", async () => {
    const saved = edit(true);
    const ask = vi.fn(async () => "save" as const);
    expect(await leaveTreeEdit(ask)).toBe(true);
    expect(ask).toHaveBeenCalledWith("save");
    expect(saved.save).toHaveBeenCalledOnce();
    expect(saved.discard).not.toHaveBeenCalled();

    const dropped = edit(true);
    expect(await leaveTreeEdit(async () => "discard")).toBe(true);
    expect(dropped.discard).toHaveBeenCalledOnce();

    const kept = edit(true);
    expect(await leaveTreeEdit(async () => "stay")).toBe(false);
    expect(kept.save).not.toHaveBeenCalled();
    expect(kept.discard).not.toHaveBeenCalled();
  });

  test("invalid lines cannot be saved: only Discard or Stay is offered", async () => {
    edit(true, false);
    const ask = vi.fn(async () => "stay" as const);
    expect(await leaveTreeEdit(ask)).toBe(false);
    expect(ask).toHaveBeenCalledWith("invalid");
  });

  test("a load replaces the lines: only Discard or Stay, even for a valid edit", async () => {
    const { save, discard } = edit(true);
    const ask = vi.fn(async () => "discard" as const);
    expect(await leaveTreeEdit(ask, "load")).toBe(true);
    expect(ask).toHaveBeenCalledWith("replaced");
    expect(discard).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  test("a closed edit no longer asks", async () => {
    edit(true);
    close?.();
    close = null;
    const ask = vi.fn();
    expect(await leaveTreeEdit(ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});
