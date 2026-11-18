//! Tauri commands of node locking: capture a lock on the displayed node, then re-solve the
//! current solution with its locks. The locks of the current solution live next to the game.

use crate::locks::{apply_locks, capture_lock, merge_lock, rebuild_unsolved, NodeLock};
use crate::session::SubgameCache;
use postflop_solver::*;
use std::collections::BTreeMap;
use std::sync::Mutex;

/// Locks of the current solution (empty for a solution solved without locks).
#[derive(Default)]
pub struct CurrentLocks(pub Mutex<Vec<NodeLock>>);

/// Builds the solution's tree again, allocates it and places `locks`. Only if all of this
/// succeeds is `game` replaced: on error the reference solution is untouched. `max_memory` is
/// the memory the new tree may use (both games coexist while the locks are checked).
pub fn prepare_lock_solve(
    game: &mut PostFlopGame,
    locks: &[NodeLock],
    compression: bool,
    max_memory: u64,
) -> Result<(), String> {
    if !game.is_ready() && !game.is_solved() {
        return Err("No solution to re-solve".to_string());
    }
    if game.is_bunching_enabled() {
        return Err("Locks are not available with the bunching effect".to_string());
    }
    let mut next = rebuild_unsolved(game)?;
    let (uncompressed, compressed) = next.memory_usage();
    let needed = if compression {
        compressed
    } else {
        uncompressed
    };
    if needed > max_memory {
        return Err(format!(
            "Not enough memory: the re-solve needs {}, {} available",
            crate::gb(needed),
            crate::gb(max_memory)
        ));
    }
    next.allocate_memory(compression);
    apply_locks(&mut next, locks)?;
    *game = next;
    Ok(())
}

/// Memory the re-solve may use. On macOS, as in the Run Solver screen, the limit is 70% of the
/// total memory; if the memory cannot be read, no limit is applied.
fn max_prepare_memory() -> u64 {
    let (available, total) = crate::memory();
    if total == 0 {
        u64::MAX
    } else if cfg!(target_os = "macos") {
        total / 10 * 7
    } else {
        available
    }
}

/// Captures a lock on the node at `history` of the current solution, with `edits` applied.
#[tauri::command]
pub fn game_capture_lock(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    history: Vec<usize>,
    edits: BTreeMap<String, Vec<f32>>,
) -> Result<NodeLock, String> {
    let mut game = game_state.lock().unwrap();
    if cache_state.lock().unwrap().active.is_some() {
        return Err("Locks are not available in a re-solved river".to_string());
    }
    if game.is_bunching_enabled() {
        return Err("Locks are not available with the bunching effect".to_string());
    }
    capture_lock(&mut game, &history, &edits)
}

/// Replaces the current solution by its tree, rebuilt unsolved with `locks` placed. The front
/// end then runs the usual solve loop (without allocating again). `locks` lists the locks to
/// keep and the new ones, in order. Returns whether the 16-bit precision is used.
#[tauri::command(async)]
pub fn game_prepare_lock_solve(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    locks_state: tauri::State<CurrentLocks>,
    locks: Vec<NodeLock>,
) -> Result<bool, String> {
    // One lock per engine node: a later lock on the same node replaces the earlier one.
    let locks = locks.into_iter().fold(Vec::new(), |mut all, lock| {
        merge_lock(&mut all, lock);
        all
    });
    let mut game = game_state.lock().unwrap();
    // Same precision as the reference solution.
    let compression = game.is_compression_enabled();
    prepare_lock_solve(&mut game, &locks, compression, max_prepare_memory())?;
    cache_state.lock().unwrap().clear();
    *locks_state.0.lock().unwrap() = locks;
    Ok(compression)
}

/// Locks of the current solution.
#[tauri::command]
pub fn game_locks(locks_state: tauri::State<CurrentLocks>) -> Vec<NodeLock> {
    locks_state.0.lock().unwrap().clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::{self, tests::meta};
    use crate::library_commands::ERR_GAME_FREED;
    use crate::locks::tests::{flop_game, solve_it};

    const FACING_CBET: [usize; 2] = [0, 1];

    #[test]
    fn invalid_lock_keeps_reference() {
        let mut game = flop_game();
        solve_it(&mut game, 30);
        let mut lock = capture_lock(&mut game, &FACING_CBET, &BTreeMap::new()).unwrap();
        lock.actions.pop();
        let err = prepare_lock_solve(&mut game, &[lock], false, u64::MAX).unwrap_err();
        assert!(!err.starts_with(ERR_GAME_FREED), "{err}");
        assert!(game.is_solved(), "the reference solution must be intact");
    }

    #[test]
    fn not_enough_memory_keeps_reference() {
        let mut game = flop_game();
        solve_it(&mut game, 30);
        let lock = capture_lock(&mut game, &FACING_CBET, &BTreeMap::new()).unwrap();
        assert!(prepare_lock_solve(&mut game, &[lock], false, 1).is_err());
        assert!(game.is_solved());
    }

    #[test]
    fn locks_survive_save_and_load() {
        let mut game = flop_game();
        solve_it(&mut game, 30);
        game.apply_history(&FACING_CBET);
        let combo = holes_to_strings(game.private_cards(0)).unwrap()[0].clone();
        game.back_to_root();
        let edits = BTreeMap::from([(combo, vec![0.9, 0.0, 0.1])]);
        let lock = capture_lock(&mut game, &FACING_CBET, &edits).unwrap();

        prepare_lock_solve(&mut game, std::slice::from_ref(&lock), false, u64::MAX).unwrap();
        for i in 0..30 {
            solve_step(&game, i);
        }
        finalize(&mut game);

        let dir = tempfile::tempdir().unwrap();
        let mut m = meta(1);
        m.locks = vec![lock.clone()];
        library::save(dir.path(), "locked", &game, &m, false).unwrap();
        let (mut loaded, loaded_meta) = library::load(dir.path(), "locked", u64::MAX).unwrap();
        assert_eq!(loaded_meta.locks, vec![lock.clone()]);

        loaded.apply_history(&FACING_CBET);
        let locking = loaded.current_locking_strategy().expect("node is locked");
        let combos = holes_to_strings(loaded.private_cards(0)).unwrap();
        let n = combos.len();
        for (j, c) in combos.iter().enumerate() {
            for (i, &f) in lock.hands[c].iter().enumerate() {
                assert!((locking[i * n + j] - f).abs() < 1e-6, "{c} action {i}");
            }
        }
    }
}
