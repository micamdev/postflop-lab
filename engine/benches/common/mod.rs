//! Reference spot used to compare memory allocator options.
//!
//! The spot is the one of `examples/basic.rs`. Only the solving iterations are
//! timed; tree construction, memory allocation and exploitability computation
//! are left out of the measurement.

use postflop_solver::*;
use std::time::Instant;

const ITERATIONS: u32 = 500;
const RUNS: usize = 5;

fn build_game() -> PostFlopGame {
    let oop_range = "66+,A8s+,A5s-A4s,AJo+,K9s+,KQo,QTs+,JTs,96s+,85s+,75s+,65s,54s";
    let ip_range = "QQ-22,AQs-A2s,ATo+,K5s+,KJo+,Q8s+,J8s+,T7s+,96s+,86s+,75s+,64s+,53s+";

    let card_config = CardConfig {
        range: [oop_range.parse().unwrap(), ip_range.parse().unwrap()],
        flop: flop_from_str("Td9d6h").unwrap(),
        turn: card_from_str("Qc").unwrap(),
        river: NOT_DEALT,
    };

    let bet_sizes = BetSizeOptions::try_from(("60%, e, a", "2.5x")).unwrap();
    let tree_config = TreeConfig {
        initial_state: BoardState::Turn,
        starting_pot: 200,
        effective_stack: 900,
        rake_rate: 0.0,
        rake_cap: 0.0,
        flop_bet_sizes: [bet_sizes.clone(), bet_sizes.clone()],
        turn_bet_sizes: [bet_sizes.clone(), bet_sizes.clone()],
        river_bet_sizes: [bet_sizes.clone(), bet_sizes],
        turn_donk_sizes: None,
        river_donk_sizes: Some(DonkSizeOptions::try_from("50%").unwrap()),
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.15,
        merging_threshold: 0.1,
    };

    let action_tree = ActionTree::new(tree_config).unwrap();
    let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();
    game.allocate_memory(false);
    game
}

/// Solves the reference spot `RUNS` times and prints one summary line.
pub fn run(variant: &str) {
    let mut times_ms = Vec::with_capacity(RUNS);
    let mut exploitability = 0.0;

    for _ in 0..RUNS {
        let game = build_game();
        let start = Instant::now();
        for i in 0..ITERATIONS {
            solve_step(&game, i);
        }
        times_ms.push(start.elapsed().as_millis());
        exploitability = compute_exploitability(&game);
    }

    times_ms.sort_unstable();
    println!(
        "variant={variant} iterations={ITERATIONS} runs={RUNS} median_ms={} min_ms={} max_ms={} exploitability={exploitability:.4}",
        times_ms[RUNS / 2],
        times_ms[0],
        times_ms[RUNS - 1],
    );
}
