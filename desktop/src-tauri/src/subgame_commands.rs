//! Tauri commands that re-solve river subgames on demand.

use crate::session::SubgameCache;
use crate::solver::apply_history_checked;
use crate::subgame::{build_subgame, solve_subgame, subgame_target, SubgameKind};
use postflop_solver::*;
use rayon::ThreadPool;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Error when the main game changed (new tree, loaded solution) during a re-solve.
pub const ERR_STALE: &str = "The solution changed during the re-solve";

/// Maximum number of iterations of a river re-solve.
const MAX_ITERATIONS: u32 = 1000;

/// Cancellation flag of the re-solve in progress, if any.
#[derive(Default)]
pub struct SubgameControl(Mutex<Option<Arc<AtomicBool>>>);

fn gb(bytes: u64) -> String {
    format!("{:.2} GB", bytes as f64 / (1u64 << 30) as f64)
}

/// Builds and solves the river subgame for `card` at `history` (a river chance node past the
/// saved depth) and inserts it in the cache. Neither lock is held while solving.
#[allow(clippy::too_many_arguments)]
pub fn resolve_into_cache(
    main: &Mutex<PostFlopGame>,
    cache: &Mutex<SubgameCache>,
    history: &[usize],
    card: usize,
    reached_exploitability: Option<f32>,
    cancel: &AtomicBool,
    available_memory: u64,
    pool: &ThreadPool,
    progress: impl FnMut(u32, f32) + Send,
) -> Result<SubgameKind, String> {
    let key = (history.to_vec(), card);
    let generation = {
        let cache = cache.lock().unwrap();
        if let Some(sub) = cache.entries.get(&key) {
            return Ok(sub.kind);
        }
        cache.generation
    };

    let (mut sub, root_pot) = {
        let mut game = main.lock().unwrap();
        let saved = game.history().to_vec();
        apply_history_checked(&mut game, history)?;
        let built = build_subgame(&mut game, card as Card);
        game.apply_history(&saved);
        (built?, game.tree_config().starting_pot)
    };

    let compression = if sub.kind == SubgameKind::Empty {
        false
    } else {
        let (uncompressed, compressed) = sub.game.memory_usage();
        if uncompressed <= available_memory {
            false
        } else if compressed <= available_memory {
            true
        } else {
            return Err(format!(
                "Not enough memory to re-solve this river: {} needed, {} available",
                gb(compressed),
                gb(available_memory)
            ));
        }
    };

    let sub_pot = sub.game.tree_config().starting_pot;
    let target = subgame_target(sub_pot, root_pot, reached_exploitability);
    // On the user's thread setting, like the main solve.
    pool.install(|| {
        solve_subgame(
            &mut sub,
            target,
            MAX_ITERATIONS,
            compression,
            cancel,
            progress,
        )
    })?;

    let mut cache = cache.lock().unwrap();
    if cache.generation != generation {
        return Err(ERR_STALE.to_string());
    }
    let kind = sub.kind;
    cache.entries.insert(key, sub);
    Ok(kind)
}

#[derive(Serialize, Clone)]
struct SubgameProgress {
    iteration: u32,
    exploitability: f32,
}

/// Re-solves the river `card` at `history` if not cached yet. Returns "solve" or "empty".
/// Starting a re-solve cancels the one in progress.
#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn game_resolve_subgame(
    app: AppHandle,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    pool_state: tauri::State<Mutex<Arc<ThreadPool>>>,
    control: tauri::State<SubgameControl>,
    history: Vec<usize>,
    card: usize,
    reached_exploitability: Option<f32>,
) -> Result<String, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    if let Some(previous) = control.0.lock().unwrap().replace(cancel.clone()) {
        previous.store(true, Ordering::Relaxed);
    }
    let (available, _) = crate::memory();
    // Cloned so that the thread setting can change (and the main solve run) meanwhile.
    let pool = pool_state.lock().unwrap().clone();
    let mut last_emit = Instant::now();
    let kind = resolve_into_cache(
        &game_state,
        &cache_state,
        &history,
        card,
        reached_exploitability,
        &cancel,
        available,
        &pool,
        |iteration, exploitability| {
            if last_emit.elapsed() >= Duration::from_millis(100) {
                last_emit = Instant::now();
                let progress = SubgameProgress {
                    iteration,
                    exploitability,
                };
                let _ = app.emit("subgame-progress", progress);
            }
        },
    )?;
    Ok(match kind {
        SubgameKind::Solve => "solve",
        SubgameKind::Empty => "empty",
    }
    .to_string())
}

/// Cancels the re-solve in progress, if any.
#[tauri::command]
pub fn game_cancel_subgame(control: tauri::State<SubgameControl>) {
    if let Some(cancel) = control.0.lock().unwrap().as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::tests::turn_only_game;
    use std::sync::Mutex;

    fn river() -> usize {
        card_from_str("2s").unwrap() as usize
    }

    #[test]
    fn resolve_inserts_in_cache() {
        let main = Mutex::new(turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let cancel = AtomicBool::new(false);
        let kind = resolve_into_cache(
            &main,
            &cache,
            &[0, 0],
            river(),
            None,
            &cancel,
            u64::MAX,
            &rayon::ThreadPoolBuilder::new().build().unwrap(),
            |_, _| {},
        )
        .unwrap();
        assert_eq!(kind, SubgameKind::Solve);
        assert!(cache
            .lock()
            .unwrap()
            .entries
            .contains_key(&(vec![0, 0], river())));
        // The main game is back where it was.
        assert_eq!(main.lock().unwrap().history(), &[] as &[usize]);
    }

    #[test]
    fn cancelled_solve_is_not_cached() {
        let main = Mutex::new(turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let cancel = AtomicBool::new(true);
        let err = resolve_into_cache(
            &main,
            &cache,
            &[0, 0],
            river(),
            None,
            &cancel,
            u64::MAX,
            &rayon::ThreadPoolBuilder::new().build().unwrap(),
            |_, _| {},
        )
        .unwrap_err();
        assert_eq!(err, "cancelled");
        assert!(cache.lock().unwrap().entries.is_empty());
    }

    #[test]
    fn stale_result_is_not_cached() {
        let main = Mutex::new(turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let cancel = AtomicBool::new(false);
        // The solution changes while the subgame is being solved.
        let err = resolve_into_cache(
            &main,
            &cache,
            &[0, 0],
            river(),
            None,
            &cancel,
            u64::MAX,
            &rayon::ThreadPoolBuilder::new().build().unwrap(),
            |_, _| {
                cache.lock().unwrap().clear();
            },
        )
        .unwrap_err();
        assert_eq!(err, ERR_STALE);
        assert!(cache.lock().unwrap().entries.is_empty());
    }

    #[test]
    fn resolve_uses_the_given_thread_pool() {
        let main = Mutex::new(turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let cancel = AtomicBool::new(false);
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(1)
            .build()
            .unwrap();
        let mut threads = Vec::new();
        resolve_into_cache(
            &main,
            &cache,
            &[0, 0],
            river(),
            None,
            &cancel,
            u64::MAX,
            &pool,
            |_, _| threads.push(rayon::current_num_threads()),
        )
        .unwrap();
        assert!(!threads.is_empty());
        assert!(threads.iter().all(|&n| n == 1), "{threads:?}");
        // The cache counts the memory of its subgames (freed before a load).
        assert!(cache.lock().unwrap().memory_usage() > 0);
        assert_eq!(SubgameCache::default().memory_usage(), 0);
    }

    #[test]
    fn not_enough_memory_is_refused() {
        let main = Mutex::new(turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let cancel = AtomicBool::new(false);
        let pool = rayon::ThreadPoolBuilder::new().build().unwrap();
        let err = resolve_into_cache(
            &main,
            &cache,
            &[0, 0],
            river(),
            None,
            &cancel,
            1,
            &pool,
            |_, _| {},
        )
        .unwrap_err();
        assert!(err.starts_with("Not enough memory"), "{err}");
    }
}
