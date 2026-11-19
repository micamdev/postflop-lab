import { describe, expect, test } from "vitest";
import { Resource } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  rememberUpdate,
  updateBlocker,
  updateButtonText,
  updateState,
} from "./update";

describe("updateButtonText", () => {
  test("each phase", () => {
    expect(updateButtonText({ phase: "available", version: "1.1.0" })).toBe(
      "Update to 1.1.0"
    );
    expect(
      updateButtonText({
        phase: "downloading",
        version: "1.1.0",
        downloaded: 420,
        total: 1000,
      })
    ).toBe("Downloading 42%");
    expect(updateButtonText({ phase: "installing", version: "1.1.0" })).toBe(
      "Installing…"
    );
    expect(updateButtonText({ phase: "failed", version: "1.1.0" })).toBe(
      "Update failed: retry"
    );
  });

  test("an unknown size shows no percentage", () => {
    expect(
      updateButtonText({
        phase: "downloading",
        version: "1.1.0",
        downloaded: 5,
      })
    ).toBe("Downloading…");
  });
});

describe("updateBlocker", () => {
  test("never while the solver or a batch works", () => {
    expect(updateBlocker({ solverBusy: true, batchRunning: false })).toBe(
      "Finish or stop the solve first"
    );
    expect(updateBlocker({ solverBusy: false, batchRunning: true })).toBe(
      "Finish or stop the batch first"
    );
    expect(
      updateBlocker({ solverBusy: false, batchRunning: false })
    ).toBeNull();
  });
});

describe("updateState", () => {
  test("the update keeps working inside the reactive state (private fields)", () => {
    // Update extends Resource, whose rid is a private field: a Vue proxy breaks it.
    class FakeUpdate extends Resource {
      version = "1.1.0";
      ridValue() {
        return this.rid;
      }
    }
    rememberUpdate(new FakeUpdate(7) as unknown as Update);
    const kept = updateState.update as unknown as FakeUpdate;
    expect(kept.ridValue()).toBe(7);
    expect(updateState.phase).toBe("available");
  });
});
