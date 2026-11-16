//! Node locks: freeze a whole node's strategy (edited hands at chosen frequencies, the others at
//! their current strategy), rebuild the solution's tree unsolved and re-solve it with the locks.

use crate::solver::{actions, apply_history_checked};
use postflop_solver::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A lock on one player node: the full strategy of every hand at the node.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NodeLock {
    /// Line to the node, as played (actions and actual cards).
    pub history: Vec<usize>,
    /// Same line with the turn card replaced by its representative (and later cards' suits
    /// swapped accordingly): locks with the same key target the same engine node.
    pub key: Vec<usize>,
    /// "oop" or "ip".
    pub player: String,
    /// Actions of the node, as `solver::actions` names them.
    pub actions: Vec<String>,
    /// For each hand at the node (combo string), the frequency of each action (sum 1).
    pub hands: BTreeMap<String, Vec<f32>>,
    /// Combos edited by the user (the others keep their strategy at capture time).
    pub edited: Vec<String>,
}

fn combo_strings(game: &PostFlopGame, player: usize) -> Result<Vec<String>, String> {
    holes_to_strings(game.private_cards(player))
}

fn swap_suits(card: usize, a: usize, b: usize) -> usize {
    match card & 3 {
        s if s == a => card - a + b,
        s if s == b => card - b + a,
        _ => card,
    }
}

/// The identity of the node reached by `history`: the turn card is replaced by its
/// representative and the suits of later cards are swapped the same way.
pub fn canonical_history(game: &mut PostFlopGame, history: &[usize]) -> Result<Vec<usize>, String> {
    let saved = game.history().to_vec();
    game.back_to_root();
    let mut key = Vec::with_capacity(history.len());
    let mut swap: Option<(usize, usize)> = None;
    let mut result = Ok(());
    for &action in history {
        if game.is_chance_node() {
            let is_turn = game.current_board().len() == 3;
            let mut card = action;
            if is_turn && action < 52 {
                match game.turn_representative(action as Card) {
                    Ok(rep) => {
                        let rep = rep as usize;
                        if rep != action {
                            swap = Some((action & 3, rep & 3));
                        }
                        card = rep;
                    }
                    Err(e) => {
                        result = Err(e);
                        break;
                    }
                }
            } else if let Some((a, b)) = swap {
                card = swap_suits(action, a, b);
            }
            key.push(card);
        } else {
            key.push(action);
        }
        if let Err(e) =
            apply_history_checked(game, &[game.history().to_vec(), vec![action]].concat())
        {
            result = Err(e);
            break;
        }
    }
    game.apply_history(&saved);
    result.map(|_| key)
}

/// Captures a lock at `history` on a solved game: the strategy of every hand at the node, with
/// `edits` (combo -> frequency per action) replacing the edited hands. Leaves the game where it
/// was.
pub fn capture_lock(
    game: &mut PostFlopGame,
    history: &[usize],
    edits: &BTreeMap<String, Vec<f32>>,
) -> Result<NodeLock, String> {
    if !game.is_solved() {
        return Err("The solution is not solved".to_string());
    }
    let saved = game.history().to_vec();
    let result = (|| {
        apply_history_checked(game, history)?;
        if game.is_terminal_node() || game.is_chance_node() {
            return Err("Only a player's decision can be locked".to_string());
        }
        let player = game.current_player();
        let node_actions = actions(game);
        let num_actions = node_actions.len();
        let combos = combo_strings(game, player)?;
        let strategy = game.strategy();
        let num_hands = combos.len();

        for (combo, freqs) in edits {
            if !combos.contains(combo) {
                return Err(format!("{combo} is not in the range at this node"));
            }
            if freqs.len() != num_actions {
                return Err(format!("{combo}: expected {num_actions} frequencies"));
            }
            if freqs.iter().any(|f| !f.is_finite() || *f < 0.0) {
                return Err(format!("{combo}: frequencies must be non-negative"));
            }
            let sum: f32 = freqs.iter().sum();
            if (sum - 1.0).abs() > 1e-3 {
                return Err(format!("{combo}: frequencies must sum to 100%"));
            }
        }

        let hands = combos
            .iter()
            .enumerate()
            .map(|(j, combo)| {
                let freqs = match edits.get(combo) {
                    Some(f) => {
                        let sum: f32 = f.iter().sum();
                        f.iter().map(|x| x / sum).collect()
                    }
                    None => (0..num_actions)
                        .map(|i| strategy[i * num_hands + j])
                        .collect(),
                };
                (combo.clone(), freqs)
            })
            .collect();

        Ok(NodeLock {
            history: history.to_vec(),
            key: Vec::new(),
            player: if player == 0 { "oop" } else { "ip" }.to_string(),
            actions: node_actions,
            hands,
            edited: edits.keys().cloned().collect(),
        })
    })();
    game.apply_history(&saved);
    let mut lock = result?;
    lock.key = canonical_history(game, history)?;
    Ok(lock)
}

/// Builds an unsolved, unallocated game identical to `game`'s (same cards, ranges, tree,
/// added and removed lines): same nodes and action indices.
pub fn rebuild_unsolved(game: &PostFlopGame) -> Result<PostFlopGame, String> {
    let mut tree = ActionTree::new(game.tree_config().clone())?;
    for line in game.added_lines() {
        tree.add_line(line)?;
    }
    for line in game.removed_lines() {
        tree.remove_line(line)?;
    }
    PostFlopGame::with_config(game.card_config().clone(), tree)
}

/// Places `locks` on an allocated, unsolved game. Returns `Err` (without panicking) if a lock
/// does not match the game; the game is then back at its root.
pub fn apply_locks(game: &mut PostFlopGame, locks: &[NodeLock]) -> Result<(), String> {
    if !game.is_ready() || game.is_solved() {
        return Err("Locks need an allocated, unsolved game".to_string());
    }
    let result = locks.iter().try_for_each(|lock| {
        apply_history_checked(game, &lock.history)?;
        if game.is_terminal_node() || game.is_chance_node() {
            return Err("A lock does not point at a player's decision".to_string());
        }
        let player = game.current_player();
        let expected = if player == 0 { "oop" } else { "ip" };
        if lock.player != expected || actions(game) != lock.actions {
            return Err("A lock does not match this solution's tree".to_string());
        }
        let combos = combo_strings(game, player)?;
        let num_hands = combos.len();
        let mut strategy = vec![0.0; lock.actions.len() * num_hands];
        for (j, combo) in combos.iter().enumerate() {
            let freqs = lock
                .hands
                .get(combo)
                .ok_or("A lock does not match this solution's hands")?;
            for (i, &f) in freqs.iter().enumerate() {
                strategy[i * num_hands + j] = f;
            }
        }
        game.lock_current_strategy(&strategy);
        Ok(())
    });
    game.back_to_root();
    result
}

/// Adds `lock` to `locks`, replacing a lock on the same engine node.
pub fn merge_lock(locks: &mut Vec<NodeLock>, lock: NodeLock) {
    locks.retain(|l| l.key != lock.key);
    locks.push(lock);
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Flop game with a check-raise option for OOP; turn and river checked down.
    pub(crate) fn flop_game() -> PostFlopGame {
        let card_config = CardConfig {
            range: [
                "AA,KK,QQ,AK,96s,87s,T9s".parse().unwrap(),
                "TT,99,AQ,KQ,QJs,JTs".parse().unwrap(),
            ],
            flop: flop_from_str("Td9d6h").unwrap(),
            ..Default::default()
        };
        let flop: BetSizeOptions = ("50%", "100%").try_into().unwrap();
        let tree_config = TreeConfig {
            starting_pot: 60,
            effective_stack: 300,
            flop_bet_sizes: [flop.clone(), flop],
            ..Default::default()
        };
        let tree = ActionTree::new(tree_config).unwrap();
        PostFlopGame::with_config(card_config, tree).unwrap()
    }

    pub(crate) fn solve_it(game: &mut PostFlopGame, iterations: u32) {
        if !game.is_ready() {
            game.allocate_memory(false);
        }
        for i in 0..iterations {
            solve_step(game, i);
        }
        finalize(game);
    }

    /// Range-weighted frequency of each action at `history`.
    fn frequencies(game: &mut PostFlopGame, history: &[usize]) -> Vec<f64> {
        game.apply_history(history);
        game.cache_normalized_weights();
        let player = game.current_player();
        let weights = game.normalized_weights(player).to_vec();
        let strategy = game.strategy();
        let n = weights.len();
        let out = strategy
            .chunks_exact(n)
            .map(|row| compute_average(row, &weights) as f64)
            .collect();
        game.back_to_root();
        out
    }

    // OOP checks, IP bets 50%: OOP faces the c-bet (fold, call, raise).
    const FACING_CBET: [usize; 2] = [0, 1];

    #[test]
    fn full_node_lock_is_exact() {
        let mut game = flop_game();
        solve_it(&mut game, 150);
        game.apply_history(&FACING_CBET);
        let combo = combo_strings(&game, 0).unwrap()[0].clone();
        game.back_to_root();
        let edits = BTreeMap::from([(combo.clone(), vec![0.9, 0.0, 0.1])]);
        let lock = capture_lock(&mut game, &FACING_CBET, &edits).unwrap();
        assert_eq!(lock.hands[&combo], vec![0.9, 0.0, 0.1]);

        let mut relocked = rebuild_unsolved(&game).unwrap();
        relocked.allocate_memory(false);
        apply_locks(&mut relocked, std::slice::from_ref(&lock)).unwrap();
        solve_it(&mut relocked, 100);

        relocked.apply_history(&FACING_CBET);
        let combos = combo_strings(&relocked, 0).unwrap();
        let strategy = relocked.strategy();
        let n = combos.len();
        for (j, c) in combos.iter().enumerate() {
            for (i, &f) in lock.hands[c].iter().enumerate() {
                assert!((strategy[i * n + j] - f).abs() < 1e-4, "{c} action {i}");
            }
        }
    }

    #[test]
    fn symmetric_turns_share_one_lock() {
        // Hearts and diamonds absent from the flop and the (suitless) ranges.
        let card_config = CardConfig {
            range: ["AA,KK,QQ".parse().unwrap(), "JJ,TT,99".parse().unwrap()],
            flop: flop_from_str("Ks7c2s").unwrap(),
            ..Default::default()
        };
        let bet: BetSizeOptions = ("50%", "").try_into().unwrap();
        let tree_config = TreeConfig {
            starting_pot: 60,
            effective_stack: 300,
            turn_bet_sizes: [bet.clone(), bet],
            ..Default::default()
        };
        let tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
        solve_it(&mut game, 30);

        let th = card_from_str("Th").unwrap() as usize;
        let td = card_from_str("Td").unwrap() as usize;
        let none = BTreeMap::new();
        let a = capture_lock(&mut game, &[0, 0, th], &none).unwrap();
        let b = capture_lock(&mut game, &[0, 0, td], &none).unwrap();
        assert_eq!(a.key, b.key);
        assert_ne!(a.history, b.history);
        let mut locks = vec![a];
        merge_lock(&mut locks, b.clone());
        assert_eq!(locks, vec![b]);
    }

    #[test]
    fn more_folds_more_cbet() {
        let mut game = flop_game();
        solve_it(&mut game, 300);
        let cbet_before = frequencies(&mut game, &[0])[1];

        // OOP folds more against the c-bet: half of every hand's calls become folds. (On this
        // small spot OOP never check-raises at equilibrium, so a raise lock would change nothing.)
        game.apply_history(&FACING_CBET);
        let combos = combo_strings(&game, 0).unwrap();
        let strategy = game.strategy();
        let n = combos.len();
        game.back_to_root();
        let edits: BTreeMap<String, Vec<f32>> = combos
            .iter()
            .enumerate()
            .map(|(j, c)| {
                let (fold, call, raise) = (strategy[j], strategy[n + j], strategy[2 * n + j]);
                (c.clone(), vec![fold + call / 2.0, call / 2.0, raise])
            })
            .collect();
        let lock = capture_lock(&mut game, &FACING_CBET, &edits).unwrap();
        // Otherwise OOP adapts its root decision and stops checking: the population is assumed
        // to check like at equilibrium and only fold more afterwards.
        let root = capture_lock(&mut game, &[], &BTreeMap::new()).unwrap();

        let mut relocked = rebuild_unsolved(&game).unwrap();
        relocked.allocate_memory(false);
        apply_locks(&mut relocked, &[root, lock]).unwrap();
        solve_it(&mut relocked, 300);
        let cbet_after = frequencies(&mut relocked, &[0])[1];
        assert!(
            cbet_after > cbet_before + 0.01,
            "c-bet {cbet_before} -> {cbet_after}"
        );
    }

    #[test]
    fn invalid_edits_are_errors() {
        let mut game = flop_game();
        solve_it(&mut game, 20);
        game.apply_history(&FACING_CBET);
        let combo = combo_strings(&game, 0).unwrap()[0].clone();
        game.back_to_root();
        let cases = [
            ("XxYy".to_string(), vec![1.0, 0.0, 0.0]),
            (combo.clone(), vec![1.0, 0.0]),
            (combo.clone(), vec![1.5, -0.5, 0.0]),
            (combo.clone(), vec![1.0, 1.0, 0.0]),
        ];
        for (c, f) in cases {
            let edits = BTreeMap::from([(c.clone(), f.clone())]);
            assert!(
                capture_lock(&mut game, &FACING_CBET, &edits).is_err(),
                "{c} {f:?}"
            );
        }
        assert_eq!(game.history(), &[] as &[usize]);
    }

    #[test]
    fn lock_on_missing_node_is_error() {
        let mut game = flop_game();
        solve_it(&mut game, 20);
        let none = BTreeMap::new();
        assert!(capture_lock(&mut game, &[9, 9], &none).is_err());
        let lock = capture_lock(&mut game, &FACING_CBET, &none).unwrap();

        let mut other = rebuild_unsolved(&game).unwrap();
        other.allocate_memory(false);
        let mut broken = lock.clone();
        broken.history = vec![0, 0]; // the turn chance node
        assert!(apply_locks(&mut other, &[broken]).is_err());
        let mut wrong_actions = lock;
        wrong_actions.actions.pop();
        assert!(apply_locks(&mut other, &[wrong_actions]).is_err());
    }
}
