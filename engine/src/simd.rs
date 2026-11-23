//! Runtime CPU feature dispatch.
//!
//! The release is built for any x86-64 CPU. The solver's recursive passes check once whether
//! the CPU has AVX2 and, if so, run a copy of the same code compiled with AVX2 enabled: it is
//! faster (mostly with compressed memory) and gives the same results bit for bit, since only
//! the vector width changes, not the order of the floating-point operations.

#[cfg(test)]
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

/// Tests only: forces the portable code path.
#[cfg(test)]
pub(crate) static PORTABLE_ONLY: AtomicBool = AtomicBool::new(false);

/// Tests only: how many times an AVX2 copy was entered.
#[cfg(test)]
pub(crate) static AVX2_CALLS: AtomicUsize = AtomicUsize::new(0);

/// Whether the AVX2 copies may run on this CPU.
#[cfg_attr(
    not(any(target_arch = "x86", target_arch = "x86_64")),
    allow(dead_code)
)]
#[inline]
pub(crate) fn has_avx2() -> bool {
    #[cfg(test)]
    if PORTABLE_ONLY.load(Ordering::Relaxed) {
        return false;
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        std::is_x86_feature_detected!("avx2")
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        false
    }
}

/// Counts an entry into an AVX2 copy (tests only).
#[cfg_attr(
    not(any(target_arch = "x86", target_arch = "x86_64")),
    allow(dead_code)
)]
#[inline(always)]
pub(crate) fn note_avx2_call() {
    #[cfg(test)]
    AVX2_CALLS.fetch_add(1, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*;
    use std::sync::Mutex;

    static SERIAL: Mutex<()> = Mutex::new(());

    /// Solves a small river spot and returns the bits of its exploitability and root EVs.
    fn solve_bits(compression: bool, portable: bool) -> (Vec<u32>, usize) {
        let _guard = SERIAL.lock().unwrap();
        PORTABLE_ONLY.store(portable, Ordering::Relaxed);
        let before = AVX2_CALLS.load(Ordering::Relaxed);
        let bets = |b: &str, r: &str| BetSizeOptions::try_from((b, r)).unwrap();
        let card_config = CardConfig {
            range: [
                "66+,A8s+,K9s+,QTs+,AJo+".parse().unwrap(),
                "22+,A2s+,K7s+,Q9s+,J9s+,T8s+,ATo+,KJo+".parse().unwrap(),
            ],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: NOT_DEALT,
        };
        let tree_config = TreeConfig {
            initial_state: BoardState::Turn,
            starting_pot: 200,
            effective_stack: 900,
            rake_rate: 0.05,
            rake_cap: 60.0,
            turn_bet_sizes: [bets("50%, 100%", "60%"), bets("50%, 100%", "60%")],
            river_bet_sizes: [bets("33%, 125%", "3x"), bets("33%, 125%", "3x")],
            ..Default::default()
        };
        let tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
        game.allocate_memory(compression);
        for i in 0..20 {
            solve_step(&game, i);
        }
        let expl = compute_exploitability(&game);
        finalize(&mut game);
        game.cache_normalized_weights();
        let mut bits = vec![expl.to_bits()];
        for player in 0..2 {
            let ev = compute_average(
                &game.expected_values(player),
                game.normalized_weights(player),
            );
            bits.push(ev.to_bits());
            bits.extend(game.strategy().iter().take(64).map(|x| x.to_bits()));
        }
        PORTABLE_ONLY.store(false, Ordering::Relaxed);
        (bits, AVX2_CALLS.load(Ordering::Relaxed) - before)
    }

    #[test]
    fn avx2_and_portable_give_the_same_results() {
        for compression in [false, true] {
            let (portable, _) = solve_bits(compression, true);
            let (dispatched, avx2_calls) = solve_bits(compression, false);
            assert_eq!(portable, dispatched, "compression {compression}");
            if has_avx2() {
                assert!(avx2_calls > 0, "the AVX2 copies did not run");
            }
        }
    }
}
