import { describe, expect, test } from "vitest";
import { latestOnly } from "./latest-only";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("latestOnly", () => {
  test("one run at a time, then once more with the latest call", async () => {
    const started: number[] = [];
    const runs: ReturnType<typeof deferred>[] = [];
    const run = latestOnly(async (n: number) => {
      started.push(n);
      const d = deferred();
      runs.push(d);
      await d.promise;
    });

    void run(1);
    void run(2);
    void run(3);
    await flush();
    expect(started).toEqual([1]);

    runs[0].resolve();
    await flush();
    expect(started).toEqual([1, 3]);

    runs[1].resolve();
    await flush();
    expect(started).toEqual([1, 3]);
  });

  test("a failed run does not block the next ones", async () => {
    const started: number[] = [];
    const run = latestOnly(async (n: number) => {
      started.push(n);
      if (n === 1) throw new Error("boom");
    });
    await run(1).catch(() => {});
    await run(2);
    expect(started).toEqual([1, 2]);
  });
});
