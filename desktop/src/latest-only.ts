/**
 * Wraps an async task so that only one run is in flight: calls made meanwhile are dropped
 * except the latest, which runs once the current run ends.
 */
export const latestOnly = <A extends unknown[]>(
  task: (...args: A) => Promise<void>
) => {
  let running = false;
  let pending: A | null = null;

  const run = async (...args: A): Promise<void> => {
    if (running) {
      pending = args;
      return;
    }
    running = true;
    try {
      await task(...args);
    } finally {
      running = false;
      const next = pending;
      pending = null;
      if (next) void run(...next);
    }
  };
  return run;
};
