//! Routing between the main game and cached river subgames.
//!
//! A history from the front end is played on the main game until it reaches a river chance
//! node that a "turn" save cannot deal; the card and the rest of the history then belong to
//! the subgame resolved for that node and card. Per-hand results of a subgame are mapped back
//! to the main game's hand indices, the only ones the front end knows.

use crate::solver::{
    actions, apply_history_checked, results_of, GameResultsResponse, ERR_BEYOND_DEPTH,
};
use crate::subgame::{Subgame, SubgameKind};
use postflop_solver::*;
use std::collections::HashMap;

/// Error when a history needs a river subgame that has not been resolved yet.
pub const ERR_NOT_RESOLVED: &str = "river not resolved";

/// History up to the river chance node, and the river card.
pub type SubgameKey = (Vec<usize>, usize);

/// River subgames resolved for the current main game, and the current position.
#[derive(Default)]
pub struct SubgameCache {
    pub entries: HashMap<SubgameKey, Subgame>,
    /// Set when the current position is inside a subgame.
    pub active: Option<SubgameKey>,
    /// Full history of the current position, as the front end sees it.
    pub current: Vec<usize>,
    /// Incremented by `clear`: a subgame solved for an older main game is not inserted.
    pub generation: u64,
}

impl SubgameCache {
    /// Memory held by the cached subgames (freed when the main game is replaced).
    pub fn memory_usage(&self) -> u64 {
        self.entries
            .values()
            .map(|sub| {
                let (uncompressed, compressed) = sub.game.memory_usage();
                if sub.game.is_compression_enabled() {
                    compressed
                } else {
                    uncompressed
                }
            })
            .sum()
    }

    /// Forgets every subgame: the main game changed.
    pub fn clear(&mut self) {
        let generation = self.generation + 1;
        *self = Self::default();
        self.generation = generation;
    }
}

/// Plays `history` on `main` from the root and stops at the first river chance node it cannot
/// deal. Returns `(prefix, Some((card, rest)))` there, leaving `main` at the prefix; otherwise
/// `(history, None)` with `main` as far as the history could be played.
pub fn split_history(
    main: &mut PostFlopGame,
    history: &[usize],
) -> (Vec<usize>, Option<(usize, Vec<usize>)>) {
    main.back_to_root();
    for (i, &action) in history.iter().enumerate() {
        if main.is_terminal_node() {
            break;
        }
        if main.is_chance_node() && !main.can_deal_card() {
            if main.current_board().len() == 4 {
                return (
                    history[..i].to_vec(),
                    Some((action, history[i + 1..].to_vec())),
                );
            }
            break;
        }
        if !main.is_chance_node() && action >= main.available_actions().len() {
            break;
        }
        main.play(action);
    }
    (history.to_vec(), None)
}

/// Moves the current position to `history`, inside a subgame if needed.
pub fn apply(
    main: &mut PostFlopGame,
    cache: &mut SubgameCache,
    history: &[usize],
) -> Result<(), String> {
    let previous = main.history().to_vec();
    let (prefix, rest) = split_history(main, history);
    let Some((card, rest)) = rest else {
        main.apply_history(&previous);
        apply_history_checked(main, history)?;
        cache.active = None;
        cache.current = history.to_vec();
        return Ok(());
    };
    let key = (prefix, card);
    let Some(sub) = cache.entries.get_mut(&key) else {
        main.apply_history(&previous);
        return Err(ERR_NOT_RESOLVED.to_string());
    };
    if sub.kind == SubgameKind::Solve {
        if let Err(e) = apply_history_checked(&mut sub.game, &rest) {
            main.apply_history(&previous);
            return Err(e);
        }
    } else if !rest.is_empty() {
        main.apply_history(&previous);
        return Err(ERR_BEYOND_DEPTH.to_string());
    }
    cache.active = Some(key);
    cache.current = history.to_vec();
    Ok(())
}

/// Spreads per-hand values of a subgame over the main game's hands (zero where absent).
pub fn pad_per_hand(values: &[f64], hand_map: &[usize], main_len: usize) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }
    let mut out = vec![0.0; main_len];
    for (&value, &index) in values.iter().zip(hand_map) {
        out[index] = value;
    }
    out
}

/// Same as [`pad_per_hand`] for an `actions x hands` array.
pub fn pad_strategy(
    values: &[f64],
    num_actions: usize,
    hand_map: &[usize],
    main_len: usize,
) -> Vec<f64> {
    if values.is_empty() || num_actions == 0 {
        return Vec::new();
    }
    let sub_len = values.len() / num_actions;
    values
        .chunks_exact(sub_len)
        .flat_map(|row| pad_per_hand(row, hand_map, main_len))
        .collect()
}

/// Results at the current position, in the main game's hand indices.
pub fn results(main: &mut PostFlopGame, cache: &mut SubgameCache) -> GameResultsResponse {
    let Some(key) = cache.active.clone() else {
        return results_of(main);
    };
    let lens = [main.private_cards(0).len(), main.private_cards(1).len()];
    let Some(sub) = cache.entries.get_mut(&key) else {
        cache.active = None;
        return results_of(main);
    };
    if sub.kind == SubgameKind::Empty {
        return GameResultsResponse {
            current_player: "terminal".to_string(),
            num_actions: 0,
            is_empty: 3,
            eqr_base: [0, 0],
            weights: lens.map(|n| vec![0.0; n]),
            normalizer: lens.map(|n| vec![0.0; n]),
            equity: [Vec::new(), Vec::new()],
            ev: [Vec::new(), Vec::new()],
            eqr: [Vec::new(), Vec::new()],
            strategy: Vec::new(),
            action_ev: Vec::new(),
        };
    }
    let mut r = results_of(&mut sub.game);
    let map = &sub.hand_map;
    for p in 0..2 {
        r.weights[p] = pad_per_hand(&r.weights[p], &map[p], lens[p]);
        r.normalizer[p] = pad_per_hand(&r.normalizer[p], &map[p], lens[p]);
        r.equity[p] = pad_per_hand(&r.equity[p], &map[p], lens[p]);
        r.ev[p] = pad_per_hand(&r.ev[p], &map[p], lens[p]);
        r.eqr[p] = pad_per_hand(&r.eqr[p], &map[p], lens[p]);
    }
    let player = match r.current_player.as_str() {
        "oop" => Some(0),
        "ip" => Some(1),
        _ => None,
    };
    if let Some(p) = player {
        r.strategy = pad_strategy(&r.strategy, r.num_actions, &map[p], lens[p]);
        r.action_ev = pad_strategy(&r.action_ev, r.num_actions, &map[p], lens[p]);
    }
    r
}

/// Evaluates at `current + append` without moving the current position. `on_game` receives
/// the game holding that position and the bet offset to add; `on_empty` handles a subgame with
/// an empty range.
fn at_position<R>(
    main: &mut PostFlopGame,
    cache: &mut SubgameCache,
    append: &[usize],
    on_game: impl FnOnce(&mut PostFlopGame, i32) -> R,
    on_empty: impl FnOnce(i32) -> R,
) -> Result<R, String> {
    let full: Vec<usize> = cache.current.iter().chain(append).copied().collect();
    let saved_main = main.history().to_vec();
    let (prefix, rest) = split_history(main, &full);
    let result = match rest {
        None if main.history() == full.as_slice() => Ok(on_game(main, 0)),
        None => Err(ERR_BEYOND_DEPTH.to_string()),
        Some((card, rest)) => match cache.entries.get_mut(&(prefix, card)) {
            None => Err(ERR_NOT_RESOLVED.to_string()),
            Some(sub) if sub.kind == SubgameKind::Empty => Ok(on_empty(sub.bet_offset)),
            Some(sub) => {
                let saved_sub = sub.game.history().to_vec();
                let r = apply_history_checked(&mut sub.game, &rest)
                    .map(|_| on_game(&mut sub.game, sub.bet_offset));
                sub.game.apply_history(&saved_sub);
                r
            }
        },
    };
    main.apply_history(&saved_main);
    result
}

/// Actions available at `current + append`.
pub fn actions_after(
    main: &mut PostFlopGame,
    cache: &mut SubgameCache,
    append: &[usize],
) -> Result<Vec<String>, String> {
    at_position(
        main,
        cache,
        append,
        |game, _| actions(game),
        |_| vec!["terminal".to_string()],
    )
}

/// Total amount each player has bet at `current + append`, counted from the main game's root.
pub fn total_bet_amount(
    main: &mut PostFlopGame,
    cache: &mut SubgameCache,
    append: &[usize],
) -> Result<[i32; 2], String> {
    at_position(
        main,
        cache,
        append,
        |game, offset| game.total_bet_amount().map(|b| b + offset),
        |offset| [offset, offset],
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::subgame::{build_subgame, solve_subgame};
    use std::sync::atomic::AtomicBool;

    /// Turn game (Td9d6h Qc) solved, then saved "up to the turn" and reloaded.
    pub(crate) fn turn_only_game() -> PostFlopGame {
        let card_config = CardConfig {
            range: [
                "AA,KK,QQ,AK".parse().unwrap(),
                "QQ-99,AQ,KQ".parse().unwrap(),
            ],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: NOT_DEALT,
        };
        let bet: BetSizeOptions = ("50%", "").try_into().unwrap();
        let tree_config = TreeConfig {
            initial_state: BoardState::Turn,
            starting_pot: 60,
            effective_stack: 300,
            turn_bet_sizes: [bet.clone(), bet.clone()],
            river_bet_sizes: [bet.clone(), bet],
            ..Default::default()
        };
        let mut game =
            PostFlopGame::with_config(card_config, ActionTree::new(tree_config).unwrap()).unwrap();
        game.allocate_memory(false);
        for i in 0..50 {
            solve_step(&game, i);
        }
        finalize(&mut game);
        game.set_target_storage_mode(BoardState::Turn).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("turn.plab");
        save_data_to_file(&game, "", &path, None).unwrap();
        load_data_from_file::<PostFlopGame, _>(&path, None)
            .unwrap()
            .0
    }

    /// Resolves the river `card` after `prefix` and inserts it in the cache.
    fn resolve(main: &mut PostFlopGame, cache: &mut SubgameCache, prefix: &[usize], card: usize) {
        main.apply_history(prefix);
        let mut sub = build_subgame(main, card as u8).unwrap();
        solve_subgame(&mut sub, 0.5, 50, false, &AtomicBool::new(false), |_, _| {}).unwrap();
        cache.entries.insert((prefix.to_vec(), card), sub);
    }

    #[test]
    fn split_history_cases() {
        let mut main = turn_only_game();
        assert_eq!(split_history(&mut main, &[0]), (vec![0], None));
        assert_eq!(split_history(&mut main, &[0, 0]), (vec![0, 0], None));
        let card = card_from_str("2s").unwrap() as usize;
        assert_eq!(
            split_history(&mut main, &[0, 0, card, 0]),
            (vec![0, 0], Some((card, vec![0])))
        );
        // `main` is left at the prefix position: the river chance node.
        assert!(main.is_chance_node());
    }

    #[test]
    fn apply_needs_a_resolved_subgame() {
        let mut main = turn_only_game();
        let mut cache = SubgameCache::default();
        let card = card_from_str("2s").unwrap() as usize;
        assert_eq!(
            apply(&mut main, &mut cache, &[0, 0, card]).unwrap_err(),
            ERR_NOT_RESOLVED
        );
        resolve(&mut main, &mut cache, &[0, 0], card);
        apply(&mut main, &mut cache, &[0, 0, card]).unwrap();
        assert!(cache.active.is_some());
        apply(&mut main, &mut cache, &[0]).unwrap();
        assert!(cache.active.is_none());
    }

    #[test]
    fn results_are_padded_to_main_hands() {
        let mut main = turn_only_game();
        let mut cache = SubgameCache::default();
        let card = card_from_str("2s").unwrap();
        resolve(&mut main, &mut cache, &[0, 0], card as usize);
        apply(&mut main, &mut cache, &[0, 0, card as usize]).unwrap();
        let r = results(&mut main, &mut cache);
        for p in 0..2 {
            let hands = main.private_cards(p);
            assert_eq!(r.weights[p].len(), hands.len());
            assert_eq!(r.equity[p].len(), hands.len());
            for (i, &(c1, c2)) in hands.iter().enumerate() {
                if c1 == card || c2 == card {
                    assert_eq!(r.weights[p][i], 0.0, "blocked hand {i} must be zero");
                }
            }
        }
        // OOP acts first on the river: strategy is actions x OOP's main hands.
        assert_eq!(r.current_player, "oop");
        assert_eq!(
            r.strategy.len(),
            r.num_actions * main.private_cards(0).len()
        );
    }

    #[test]
    fn bets_include_offset() {
        let mut main = turn_only_game();
        let mut cache = SubgameCache::default();
        let card = card_from_str("2s").unwrap() as usize;
        resolve(&mut main, &mut cache, &[1, 1], card); // OOP bets 30, IP calls
        apply(&mut main, &mut cache, &[1, 1, card]).unwrap();
        assert_eq!(
            total_bet_amount(&mut main, &mut cache, &[]).unwrap(),
            [30, 30]
        );
        // OOP bets 50% of the 120 pot on the river: 30 + 60.
        assert_eq!(
            total_bet_amount(&mut main, &mut cache, &[1]).unwrap(),
            [90, 30]
        );
        let after = actions_after(&mut main, &mut cache, &[1]).unwrap();
        assert_eq!(after[0], "Fold:0");
    }

    #[test]
    fn cache_cleared_on_new_game() {
        let mut main = turn_only_game();
        let mut cache = SubgameCache::default();
        let card = card_from_str("2s").unwrap() as usize;
        resolve(&mut main, &mut cache, &[0, 0], card);
        apply(&mut main, &mut cache, &[0, 0, card]).unwrap();
        cache.clear();
        assert!(cache.entries.is_empty());
        assert!(cache.active.is_none());
        assert!(cache.current.is_empty());
    }
}
