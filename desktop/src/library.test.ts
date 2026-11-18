import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  message: vi.fn(),
}));
vi.mock("./invokes", () => ({
  libraryCheckLoad: vi.fn(),
  libraryLoad: vi.fn(),
  libraryDelete: vi.fn(),
  libraryRename: vi.fn(),
  libraryImport: vi.fn(),
}));

import * as invokes from "./invokes";
import {
  deleteSolution,
  importSolution,
  loadSolution,
  renameSolution,
} from "./library";
import { useStore } from "./store";

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

describe("deleting and renaming", () => {
  const loaded = () => {
    const store = useStore();
    store.solutionInfo = {
      name: "spot",
      loaded: true,
      iterations: 1,
      exploitability: 0,
    };
    store.isSolutionSaved = true;
    return store;
  };

  test("deleting the loaded solution marks it unsaved", async () => {
    const store = loaded();
    await deleteSolution("other");
    expect(store.isSolutionSaved).toBe(true);
    await deleteSolution("spot");
    expect(invokes.libraryDelete).toHaveBeenCalledWith("spot");
    expect(store.isSolutionSaved).toBe(false);
  });

  test("renaming shows the file name the library used", async () => {
    const store = loaded();
    vi.mocked(invokes.libraryRename).mockResolvedValue("K_T");
    expect(await renameSolution("spot", "K/T")).toBe("K_T");
    expect(store.solutionInfo?.name).toBe("K_T");
  });
});

describe("importing", () => {
  test("replacing the loaded solution's file marks it unsaved", async () => {
    const store = useStore();
    store.solutionInfo = {
      name: "spot",
      loaded: true,
      iterations: 1,
      exploitability: 0,
    };
    store.isSolutionSaved = true;
    vi.mocked(invokes.libraryImport).mockResolvedValue("other");
    await importSolution("C:/x/other.plab", false);
    expect(store.isSolutionSaved).toBe(true);
    vi.mocked(invokes.libraryImport).mockResolvedValue("spot");
    await importSolution("C:/x/spot.plab", true);
    expect(store.isSolutionSaved).toBe(false);
  });
});
