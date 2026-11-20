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
  rangeGetWeights: vi.fn(),
  ERR_INTERNAL: "Internal error",
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

describe("an internal error while loading", () => {
  test("does not bring back the results of a game Rust reset", async () => {
    const store = useStore();
    Object.assign(store, {
      isSolverFinished: true,
      isSolutionSaved: true,
      solutionInfo: {
        name: "old",
        loaded: true,
        iterations: 1,
        exploitability: 0,
      },
    });
    vi.mocked(invokes.libraryCheckLoad).mockResolvedValue(undefined);
    vi.mocked(invokes.libraryLoad).mockRejectedValue(
      "Internal error (solution reset): boom."
    );
    await loadSolution("new");
    expect(store.isSolverFinished).toBe(false);
    expect(store.solutionInfo).toBeNull();
  });
});

describe("a solution's spot", () => {
  const metaWith = (spot: unknown) => ({
    schema: 3,
    app_version: "test",
    created_at: 0,
    board: [0, 5, 10],
    ranges: ["AA", "KK"],
    tree_config: {
      board: [0, 5, 10],
      startingPot: 20,
      effectiveStack: 90,
      ...(spot === undefined ? {} : { spot }),
    },
    depth: "river",
    exploitability: 0.1,
    iterations: 10,
    precision: "32",
    locks: [],
    summary: {},
  });

  const load = async (spot: unknown) => {
    vi.mocked(invokes.libraryCheckLoad).mockResolvedValue(undefined);
    vi.mocked(invokes.libraryLoad).mockResolvedValue(metaWith(spot) as never);
    vi.mocked(invokes.rangeGetWeights).mockResolvedValue(Array(169).fill(0));
    await loadSolution("Jh 9d 4c");
  };

  test("is shown again, and the loaded spot is dropped", async () => {
    const store = useStore();
    store.spot = {
      path: ["S"],
      name: "S",
      value: {} as never,
      rangesEdited: false,
    };
    const record = {
      name: "S",
      line: "BTN 2.5 · BB call",
      positions: ["BB", "BTN"],
      modified: false,
    };
    await load(record);
    expect(store.solvedSpot).toEqual(record);
    expect(store.spot).toBeNull();
  });

  test("an older solution has none", async () => {
    const store = useStore();
    store.solvedSpot = {
      name: "old",
      line: "",
      positions: ["BB", "BTN"],
      modified: false,
    };
    await load(undefined);
    expect(store.solvedSpot).toBeNull();
  });
});
