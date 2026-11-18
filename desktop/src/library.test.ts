import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  message: vi.fn(),
}));
vi.mock("./invokes", () => ({
  libraryCheckLoad: vi.fn(),
  libraryLoad: vi.fn(),
}));

import * as invokes from "./invokes";
import { loadSolution } from "./library";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

describe("loadSolution", () => {
  test("a double click loads the solution once", async () => {
    let release!: () => void;
    vi.mocked(invokes.libraryCheckLoad).mockReturnValue(
      new Promise<void>((r) => (release = r))
    );
    // The load itself fails right after the check: only the number of starts matters here.
    vi.mocked(invokes.libraryLoad).mockRejectedValue("stop here");

    const first = loadSolution("Jh 9d 4c");
    const second = loadSolution("Jh 9d 4c");
    release();
    await Promise.allSettled([first, second]);

    expect(invokes.libraryCheckLoad).toHaveBeenCalledTimes(1);
  });
});
