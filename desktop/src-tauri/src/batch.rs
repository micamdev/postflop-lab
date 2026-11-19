//! Batch solving: the same spot solved on a list of flops, each saved in the library. Runs on
//! its own games, not the main one, so the open solution stays usable.

use crate::solver::{build_game_inputs, GameTreeArgs};
use postflop_solver::*;
use rayon::ThreadPool;
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};

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

    #[test]
    fn tree_config_gets_the_flop() {
        let config = serde_json::json!({ "board": [1, 2, 3, 4], "startingPot": 20 });
        assert_eq!(
            tree_config_for(&config, [40, 30, 20]),
            serde_json::json!({ "board": [40, 30, 20], "startingPot": 20 })
        );
    }
}
