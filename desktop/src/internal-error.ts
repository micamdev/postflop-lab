// After an internal error in a Rust command (a panic caught there), the app tells the user. If
// the command used the game, the game in memory was reset (guard.rs): the app stops showing it.

import { useStore, setSolutionLocks } from "./store";

/** Commands that use the game: after a panic in one, the game was reset. */
const usesGame = (command: string) =>
  command.startsWith("game_") || command.startsWith("library_");

export const handleInternalError = (message: string, command: string) => {
  const store = useStore();
  if (!usesGame(command)) {
    store.appError = message;
    return;
  }
  store.isSolverRunning = false;
  store.isSolverPaused = false;
  store.isFinalizing = false;
  store.isSolveStarting = false;
  store.isSolverFinished = false;
  store.isLibraryBusy = false;
  store.solutionInfo = null;
  store.isSolutionSaved = false;
  setSolutionLocks([]);
  store.treeResetCount++;
  store.appError = `${message} The solution in memory was reset.`;
};
