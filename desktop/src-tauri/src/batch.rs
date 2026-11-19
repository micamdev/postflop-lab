//! Batch solving: the same spot solved on a list of flops, each saved in the library. Runs on
//! its own games, not the main one, so the open solution stays usable.

use crate::library;
use crate::range::RangeManager;
use crate::solver::{build_game_inputs, depth_from_name, GameTreeArgs};
use postflop_solver::*;
use rayon::ThreadPool;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Solve settings of a batch (as the Run Solver settings).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchSettings {
    /// "32" (16-bit only if 32-bit does not fit) or "16".
    pub precision: String,
    /// Target exploitability, in % of the starting pot.
    pub target_exploitability: f32,
    pub max_iterations: u32,
}

/// Error of a flop whose name is already taken in the library.
const ERR_NAME_TAKEN: &str = "a solution with this name already exists";

/// Error when the batch was stopped.
pub const ERR_CANCELLED: &str = "cancelled";

/// A solved flop, with how far it was solved.
pub struct SolvedFlop {
    pub game: PostFlopGame,
    pub iterations: u32,
    pub exploitability: f32,
}

/// Builds and solves the spot on `board` (`args.board` is ignored). Refused when even 16-bit
/// does not fit in `available_memory`. `progress` gets the iteration and, every 10
/// iterations, the exploitability.
#[allow(clippy::too_many_arguments)]
pub fn solve_flop(
    ranges: &[Range; 2],
    args: &GameTreeArgs,
    board: [u8; 3],
    settings: &BatchSettings,
    available_memory: u64,
    cancel: &AtomicBool,
    pool: &ThreadPool,
    mut progress: impl FnMut(u32, f32),
) -> Result<SolvedFlop, String> {
    let args = GameTreeArgs {
        board: board.to_vec(),
        ..args.clone()
    };
    let (card_config, action_tree) = build_game_inputs(ranges, &args)?;
    let mut game = PostFlopGame::with_config(card_config, action_tree)?;

    let (uncompressed, compressed) = game.memory_usage();
    let compression = if settings.precision != "16" && uncompressed <= available_memory {
        false
    } else if compressed <= available_memory {
        true
    } else {
        return Err(format!(
            "Not enough memory: {} needed, {} available",
            crate::gb(compressed),
            crate::gb(available_memory)
        ));
    };
    game.allocate_memory(compression);

    let target = args.starting_pot as f32 * settings.target_exploitability / 100.0;
    let mut exploitability = pool.install(|| compute_exploitability(&game));
    let mut iterations = 0;
    while iterations < settings.max_iterations && exploitability > target {
        if cancel.load(Ordering::Relaxed) {
            return Err(ERR_CANCELLED.to_string());
        }
        pool.install(|| solve_step(&game, iterations));
        iterations += 1;
        if iterations % 10 == 0 || iterations == settings.max_iterations {
            exploitability = pool.install(|| compute_exploitability(&game));
        }
        progress(iterations, exploitability);
    }
    pool.install(|| finalize(&mut game));
    Ok(SolvedFlop {
        game,
        iterations,
        exploitability: exploitability.max(0.0),
    })
}

/// One flop of a batch: its board, its weight in the subset and the name to save it under.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchFlop {
    pub board: [u8; 3],
    pub weight: f64,
    pub name: String,
}

/// A batch: the Setup (its board ignored), the flops and how to solve and save them.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchRequest {
    pub args: GameTreeArgs,
    /// The tree configuration as the front end saves it (the board is set per flop).
    pub tree_config: serde_json::Value,
    pub flops: Vec<BatchFlop>,
    /// Size of the subset the flops come from (saved with each flop).
    pub subset_size: u32,
    pub settings: BatchSettings,
    /// Save depth: "flop", "turn" or "river".
    pub depth: String,
}

/// Progress of a batch: the flop being solved and how far.
#[derive(Serialize, Clone, Debug)]
pub struct BatchProgress {
    pub index: usize,
    pub total: usize,
    pub name: String,
    pub iteration: u32,
}

/// Outcome of a batch: flops saved, flops that failed ("name: error"), whether it was stopped.
#[derive(Serialize, Clone, Debug, Default)]
pub struct BatchResult {
    pub solved: usize,
    pub failed: Vec<String>,
    pub cancelled: bool,
}

/// Solves and saves each flop of `request` in `dir`, one after the other. A flop that fails
/// (not enough memory, name taken) is reported and the batch goes on; a stop ends it, the flop
/// being solved not saved. `available_memory` is asked before each flop.
pub fn run_batch(
    dir: &Path,
    ranges: &[Range; 2],
    request: &BatchRequest,
    available_memory: impl Fn() -> u64,
    cancel: &AtomicBool,
    pool: &ThreadPool,
    mut progress: impl FnMut(BatchProgress),
) -> BatchResult {
    let mut result = BatchResult::default();
    let total = request.flops.len();
    for (index, flop) in request.flops.iter().enumerate() {
        // Stopped while the previous flop was finalized or saved: do not start another.
        if cancel.load(Ordering::Relaxed) {
            result.cancelled = true;
            break;
        }
        let mut report = |iteration, _exploitability| {
            progress(BatchProgress {
                index,
                total,
                name: flop.name.clone(),
                iteration,
            })
        };
        // A taken name is found now, not after minutes of solving.
        if library::exists(dir, &flop.name) {
            result
                .failed
                .push(format!("{}: {}", flop.name, ERR_NAME_TAKEN));
            continue;
        }
        report(0, f32::INFINITY);
        let outcome = solve_flop(
            ranges,
            &request.args,
            flop.board,
            &request.settings,
            available_memory(),
            cancel,
            pool,
            &mut report,
        )
        // Stopped during the last iteration or the finalization: not saved either.
        .and_then(|solved| {
            if cancel.load(Ordering::Relaxed) {
                Err(ERR_CANCELLED.to_string())
            } else {
                save_flop(dir, request, flop, solved)
            }
        });
        match outcome {
            Ok(()) => result.solved += 1,
            Err(e) if e == ERR_CANCELLED => {
                result.cancelled = true;
                break;
            }
            Err(e) => result.failed.push(format!("{}: {e}", flop.name)),
        }
    }
    result
}

/// Saves a solved flop of a batch, with its weight in the subset.
fn save_flop(
    dir: &Path,
    request: &BatchRequest,
    flop: &BatchFlop,
    solved: SolvedFlop,
) -> Result<(), String> {
    let mut game = solved.game;
    let mut meta = crate::library_commands::solution_meta(
        &mut game,
        tree_config_for(&request.tree_config, flop.board),
        &request.depth,
        solved.exploitability,
        solved.iterations,
        Vec::new(),
    );
    meta.flop_weight = Some(flop.weight);
    meta.batch_size = Some(request.subset_size);
    game.set_target_storage_mode(depth_from_name(&request.depth)?)?;
    library::save_with_progress(dir, &flop.name, &game, &meta, false, |_| {})
        .map(|_| ())
        .map_err(|e| {
            if e == library::ERR_EXISTS {
                ERR_NAME_TAKEN.to_string()
            } else {
                e
            }
        })
}

/// Cancellation flag of the batch in progress, if any.
#[derive(Default)]
pub struct BatchControl(Mutex<Option<Arc<AtomicBool>>>);

/// Solves the Setup's spot on each flop of the request and saves them in the library, on its
/// own games (the open solution stays usable). Emits "batch-progress".
#[tauri::command(async)]
pub fn batch_solve(
    app: AppHandle,
    range_state: tauri::State<Mutex<RangeManager>>,
    pool_state: tauri::State<Mutex<Arc<ThreadPool>>>,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<crate::session::SubgameCache>>,
    control: tauri::State<BatchControl>,
    request: BatchRequest,
) -> Result<BatchResult, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut current = crate::guard::lock(&control.0);
        if current.is_some() {
            return Err("A batch is already running".to_string());
        }
        *current = Some(cancel.clone());
    }
    let result = crate::guard::guard(|| {
        let dir = crate::library_commands::library_dir(&app)?;
        let ranges: [Range; 2] = crate::guard::lock(&range_state).0[..2]
            .try_into()
            .map_err(|_| "No ranges".to_string())?;
        // Cloned so that the thread setting can change meanwhile.
        let pool = crate::guard::lock(&pool_state).clone();
        let mut last_emit = Instant::now();
        Ok(run_batch(
            &dir,
            &ranges,
            &request,
            // The open solution and its river cache stay loaded during the batch.
            || {
                let in_use = crate::library_commands::loaded_memory(&game_state, &cache_state);
                crate::memory_limit::memory_limit(in_use)
            },
            &cancel,
            &pool,
            |p| {
                if p.iteration == 0 || last_emit.elapsed() >= Duration::from_millis(200) {
                    last_emit = Instant::now();
                    let _ = app.emit("batch-progress", p);
                }
            },
        ))
    });
    *crate::guard::lock(&control.0) = None;
    result
}

/// Stops the batch in progress (the flop being solved is not saved).
#[tauri::command]
pub fn batch_cancel(control: tauri::State<BatchControl>) {
    if let Some(cancel) = crate::guard::lock(&control.0).as_ref() {
        cancel.store(true, Ordering::Relaxed);
    }
}

/// The front end's tree configuration with `board` in place of the Setup's.
pub fn tree_config_for(tree_config: &serde_json::Value, board: [u8; 3]) -> serde_json::Value {
    let mut config = tree_config.clone();
    if let Some(object) = config.as_object_mut() {
        object.insert("board".to_string(), serde_json::json!(board));
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::solver::tests::{setup_args, setup_ranges};

    fn settings(target: f32) -> BatchSettings {
        BatchSettings {
            precision: "32".to_string(),
            target_exploitability: target,
            max_iterations: 200,
        }
    }

    fn pool() -> ThreadPool {
        rayon::ThreadPoolBuilder::new().build().unwrap()
    }

    fn flop(text: &str) -> [u8; 3] {
        flop_from_str(text).unwrap()
    }

    #[test]
    fn solves_the_spot_on_the_given_flop() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        // The Setup board is ignored: the batch flop is used.
        let args = setup_args("2c3d4h", "50%");
        let mut last = (0, f32::INFINITY);
        let solved = solve_flop(
            &ranges,
            &args,
            flop("Td9d6h"),
            &settings(1.0),
            u64::MAX,
            &AtomicBool::new(false),
            &pool(),
            |i, e| last = (i, e),
        )
        .unwrap();
        assert_eq!(solved.game.card_config().flop, flop("Td9d6h"));
        assert!(solved.game.is_solved());
        assert!(!solved.game.is_compression_enabled());
        // Stopped at the target (1% of the 60 pot), reported to the progress.
        assert!(solved.exploitability <= 0.6, "{}", solved.exploitability);
        assert_eq!(last, (solved.iterations, solved.exploitability));
    }

    #[test]
    fn falls_back_to_16_bit_when_32_does_not_fit() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        let args = setup_args("", "50%");
        let (card_config, tree) = build_game_inputs(
            &ranges,
            &GameTreeArgs {
                board: flop("Td9d6h").to_vec(),
                ..args.clone()
            },
        )
        .unwrap();
        let (uncompressed, compressed) = PostFlopGame::with_config(card_config, tree)
            .unwrap()
            .memory_usage();
        let between = (uncompressed + compressed) / 2;
        let solved = solve_flop(
            &ranges,
            &args,
            flop("Td9d6h"),
            &settings(5.0),
            between,
            &AtomicBool::new(false),
            &pool(),
            |_, _| {},
        )
        .unwrap();
        assert!(solved.game.is_compression_enabled());

        let err = solve_flop(
            &ranges,
            &args,
            flop("Td9d6h"),
            &settings(5.0),
            compressed - 1,
            &AtomicBool::new(false),
            &pool(),
            |_, _| {},
        );
        assert!(err.err().unwrap().starts_with("Not enough memory"));
    }

    #[test]
    fn a_stopped_batch_returns_cancelled() {
        let err = solve_flop(
            &setup_ranges("AA,KK", "QQ,JJ"),
            &setup_args("", "50%"),
            flop("Td9d6h"),
            &settings(0.0),
            u64::MAX,
            &AtomicBool::new(true),
            &pool(),
            |_, _| {},
        );
        assert_eq!(err.err().unwrap(), ERR_CANCELLED);
    }

    fn request(names: &[(&str, &str)]) -> BatchRequest {
        BatchRequest {
            args: setup_args("", "50%"),
            tree_config: serde_json::json!({ "board": [], "startingPot": 60 }),
            flops: names
                .iter()
                .map(|(name, board)| BatchFlop {
                    board: flop(board),
                    weight: 100.0,
                    name: name.to_string(),
                })
                .collect(),
            subset_size: 25,
            settings: settings(5.0),
            depth: "flop".to_string(),
        }
    }

    #[test]
    fn a_batch_saves_each_flop_with_its_weight() {
        let dir = tempfile::tempdir().unwrap();
        let mut seen = Vec::new();
        let result = run_batch(
            dir.path(),
            &setup_ranges("AA,KK", "QQ,JJ"),
            &request(&[("s Td9d6h", "Td9d6h"), ("s As7c2d", "As7c2d")]),
            || u64::MAX,
            &AtomicBool::new(false),
            &pool(),
            |p| seen.push((p.index, p.total)),
        );
        assert_eq!(result.solved, 2);
        assert!(result.failed.is_empty() && !result.cancelled);
        assert_eq!(seen.first(), Some(&(0, 2)));
        assert_eq!(seen.last(), Some(&(1, 2)));

        let entries = crate::library::list(dir.path());
        assert_eq!(entries.len(), 2);
        let meta = entries
            .iter()
            .find(|e| e.name == "s Td9d6h")
            .unwrap()
            .meta
            .clone()
            .unwrap();
        assert_eq!(meta.board, flop("Td9d6h").to_vec());
        assert_eq!(meta.flop_weight, Some(100.0));
        assert_eq!(meta.batch_size, Some(25));
        assert_eq!(meta.depth, "flop");
        assert_eq!(meta.tree_config["board"], serde_json::json!(flop("Td9d6h")));
        assert_eq!(meta.schema, crate::library::META_SCHEMA);
        assert!(meta.summary.ip_after_check.is_some());
    }

    #[test]
    fn a_failed_flop_does_not_stop_the_batch() {
        let dir = tempfile::tempdir().unwrap();
        // Already saved under that name: not overwritten.
        run_batch(
            dir.path(),
            &setup_ranges("AA,KK", "QQ,JJ"),
            &request(&[("taken", "Td9d6h")]),
            || u64::MAX,
            &AtomicBool::new(false),
            &pool(),
            |_| {},
        );
        let mut solved_flops = Vec::new();
        let result = run_batch(
            dir.path(),
            &setup_ranges("AA,KK", "QQ,JJ"),
            &request(&[("taken", "As7c2d"), ("free", "As7c2d")]),
            || u64::MAX,
            &AtomicBool::new(false),
            &pool(),
            |p| {
                if p.iteration > 0 {
                    solved_flops.push(p.name.clone());
                }
            },
        );
        // The taken name is found before solving: no time spent on it.
        assert!(!solved_flops.contains(&"taken".to_string()));
        assert_eq!(result.solved, 1);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(
            result.failed,
            ["taken: a solution with this name already exists"]
        );
    }

    #[test]
    fn a_stop_during_the_last_iteration_saves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let cancel = AtomicBool::new(false);
        let mut req = request(&[("a", "Td9d6h")]);
        req.settings = BatchSettings {
            target_exploitability: 0.0,
            max_iterations: 20,
            ..req.settings
        };
        let result = run_batch(
            dir.path(),
            &setup_ranges("AA,KK", "QQ,JJ"),
            &req,
            || u64::MAX,
            &cancel,
            &pool(),
            // Stop pressed during the last iteration: the solve loop is already over.
            |p| {
                if p.iteration == 20 {
                    cancel.store(true, Ordering::Relaxed);
                }
            },
        );
        assert!(result.cancelled);
        assert_eq!(result.solved, 0);
        assert!(crate::library::list(dir.path()).is_empty());
    }

    #[test]
    fn a_stopped_batch_saves_nothing_more() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_batch(
            dir.path(),
            &setup_ranges("AA,KK", "QQ,JJ"),
            &request(&[("a", "Td9d6h")]),
            || u64::MAX,
            &AtomicBool::new(true),
            &pool(),
            |_| {},
        );
        assert!(result.cancelled);
        assert_eq!(result.solved, 0);
        assert!(crate::library::list(dir.path()).is_empty());
    }

    #[test]
    fn tree_config_gets_the_flop() {
        let config = serde_json::json!({ "board": [1, 2, 3, 4], "startingPot": 20 });
        assert_eq!(
            tree_config_for(&config, [40, 30, 20]),
            serde_json::json!({ "board": [40, 30, 20], "startingPot": 20 })
        );
    }
}
