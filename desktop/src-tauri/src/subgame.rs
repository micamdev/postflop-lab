//! River subgames: re-solving a river past the saved depth of a partial save.
//!
//! At a river chance node that a "turn" save cannot deal, the subgame starts on the river with
//! both players' ranges weighted by their probability of reaching the node, the pot and stacks
//! at the node, and the river bet sizes of the solution's tree configuration.

use postflop_solver::*;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

/// What a subgame needs before its results can be shown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubgameKind {
    /// Decisions remain: solve it.
    Solve,
    /// A player reaches the node with no weight: nothing to show.
    Empty,
}

/// A river subgame and how it maps onto the main game.
pub struct Subgame {
    pub game: PostFlopGame,
    pub kind: SubgameKind,
    /// For each player, the main game's hand index of each subgame hand.
    pub hand_map: [Vec<usize>; 2],
    /// Amount each player had put in before the chance node.
    pub bet_offset: i32,
}

/// The kind of subgame given both players' weights at the node.
///
/// All-in lines never reach a river chance node: the engine integrates the runouts at their
/// terminal node, so a subgame always has stack left.
pub fn classify(weights: [&[f32]; 2]) -> SubgameKind {
    if weights.iter().any(|w| w.iter().all(|&x| x <= 0.0)) {
        SubgameKind::Empty
    } else {
        SubgameKind::Solve
    }
}

/// Exploitability target (in chips) of a subgame: 0.3% of its pot, or the exploitability the
/// solution reached (as a share of the root pot) if that is looser.
pub fn subgame_target(sub_pot: i32, root_pot: i32, reached_exploitability: Option<f32>) -> f32 {
    let base = 0.003 * sub_pot as f32;
    match reached_exploitability {
        Some(reached) if root_pot > 0 => base.max(reached / root_pot as f32 * sub_pot as f32),
        _ => base,
    }
}

/// Player who made the last bet or raise on the current street, replaying the history.
fn last_aggressor_this_street(main: &mut PostFlopGame) -> Option<usize> {
    let history = main.history().to_vec();
    main.back_to_root();
    let mut aggressor = None;
    for &action in &history {
        if main.is_chance_node() {
            aggressor = None;
        } else {
            let player = main.current_player();
            if matches!(
                main.available_actions()[action],
                Action::Bet(_) | Action::Raise(_) | Action::AllIn(_)
            ) {
                aggressor = Some(player);
            }
        }
        main.play(action);
    }
    aggressor
}

/// Actions from the root to the current node of `main`, chance cards left out (the form of
/// the added and removed lines). `main` is left where it was.
fn line_to_node(main: &mut PostFlopGame) -> Vec<Action> {
    let history = main.history().to_vec();
    main.back_to_root();
    let mut line = Vec::new();
    for &index in &history {
        if !main.is_chance_node() {
            line.push(main.available_actions()[index]);
        }
        main.play(index);
    }
    line
}

/// `weights` with the hands containing `card` (the river being dealt) set to 0.
pub fn weights_without_card(hands: &[(Card, Card)], weights: &[f32], card: Card) -> Vec<f32> {
    hands
        .iter()
        .zip(weights)
        .map(|(&(c1, c2), &w)| if c1 == card || c2 == card { 0.0 } else { w })
        .collect()
}

/// Builds (without solving) the river subgame for `card`. `main` must be at a river chance
/// node it cannot deal (`!can_deal_card()`); it is left at that position.
pub fn build_subgame(main: &mut PostFlopGame, card: Card) -> Result<Subgame, String> {
    if !main.is_chance_node() || main.can_deal_card() || main.current_board().len() != 4 {
        return Err("Not a river past the saved depth".to_string());
    }
    if main.possible_cards() & (1u64 << card) == 0 {
        return Err("This card cannot be dealt here".to_string());
    }

    let bet_offset = main.total_bet_amount()[0];
    let config = main.tree_config().clone();
    let pot = config.starting_pot + 2 * bet_offset;
    let stack = config.effective_stack - bet_offset;
    let weights = [main.weights(0).to_vec(), main.weights(1).to_vec()];
    if stack <= 0 {
        return Err("No stack left at this node".to_string());
    }
    let hands = [
        main.private_cards(0).to_vec(),
        main.private_cards(1).to_vec(),
    ];
    // The river card removes the hands it blocks: a player may have none left.
    let kind = classify([
        &weights_without_card(&hands[0], &weights[0], card),
        &weights_without_card(&hands[1], &weights[1], card),
    ]);
    if kind == SubgameKind::Empty {
        return Ok(Subgame {
            game: PostFlopGame::new(),
            kind,
            hand_map: [Vec::new(), Vec::new()],
            bet_offset,
        });
    }

    let ranges = [
        Range::from_hands_weights(&hands[0], &weights[0])?,
        Range::from_hands_weights(&hands[1], &weights[1])?,
    ];
    let board = main.current_board();
    let card_config = CardConfig {
        range: ranges,
        flop: [board[0], board[1], board[2]],
        turn: board[3],
        river: card,
    };

    let mut river_bet_sizes = config.river_bet_sizes.clone();
    // River donk sizes apply when OOP opens the river after IP was the turn aggressor.
    if let Some(donk) = &config.river_donk_sizes {
        if last_aggressor_this_street(main) == Some(1) {
            river_bet_sizes[0].bet = donk.donk.clone();
        }
    }
    let tree_config = TreeConfig {
        initial_state: BoardState::River,
        starting_pot: pot,
        effective_stack: stack,
        rake_rate: config.rake_rate,
        rake_cap: config.rake_cap,
        river_bet_sizes,
        add_allin_threshold: config.add_allin_threshold,
        force_allin_threshold: config.force_allin_threshold,
        merging_threshold: config.merging_threshold,
        ..Default::default()
    };
    let mut tree = ActionTree::new(tree_config)?;
    // Lines the user added or removed in the tree editor that go through this node.
    let prefix = line_to_node(main);
    let tails = |lines: &[Vec<Action>]| -> Vec<Vec<Action>> {
        lines
            .iter()
            .filter(|line| line.len() > prefix.len() && line.starts_with(&prefix))
            .map(|line| line[prefix.len()..].to_vec())
            .collect()
    };
    for line in tails(main.added_lines()) {
        tree.add_line(&line)?;
    }
    for line in tails(main.removed_lines()) {
        tree.remove_line(&line)?;
    }
    let game = PostFlopGame::with_config(card_config, tree)?;

    let index: [HashMap<(Card, Card), usize>; 2] =
        [0, 1].map(|p| hands[p].iter().enumerate().map(|(i, &h)| (h, i)).collect());
    let [map_oop, map_ip] = [0, 1].map(|p| {
        game.private_cards(p)
            .iter()
            .map(|h| index[p].get(h).copied())
            .collect::<Option<Vec<_>>>()
    });
    let hand_map = [
        map_oop.ok_or("Subgame hands do not match the solution")?,
        map_ip.ok_or("Subgame hands do not match the solution")?,
    ];

    Ok(Subgame {
        game,
        kind,
        hand_map,
        bet_offset,
    })
}

/// Solves a subgame until `target` exploitability (chips) or `max_iterations`, reporting
/// `(iteration, exploitability)`. Returns `Err("cancelled")` as soon as `cancel` is set.
pub fn solve_subgame(
    sub: &mut Subgame,
    target: f32,
    max_iterations: u32,
    compression: bool,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u32, f32),
) -> Result<(), String> {
    if sub.kind == SubgameKind::Empty {
        return Ok(());
    }
    sub.game.allocate_memory(compression);
    for i in 0..max_iterations {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }
        solve_step(&sub.game, i);
        if (i + 1) % 10 == 0 || i + 1 == max_iterations {
            let exploitability = compute_exploitability(&sub.game);
            progress(i + 1, exploitability);
            if exploitability <= target {
                break;
            }
        }
    }
    finalize(&mut sub.game);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A game starting on the turn (Td9d6h Qc), solved to near equilibrium.
    fn turn_game() -> PostFlopGame {
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
        let turn_bet: BetSizeOptions = ("50%", "a").try_into().unwrap();
        let tree_config = TreeConfig {
            initial_state: BoardState::Turn,
            starting_pot: 60,
            effective_stack: 300,
            turn_bet_sizes: [turn_bet.clone(), turn_bet],
            river_bet_sizes: [bet.clone(), bet],
            add_allin_threshold: 1.5,
            force_allin_threshold: 0.15,
            merging_threshold: 0.1,
            ..Default::default()
        };
        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();
        game.allocate_memory(false);
        for i in 0..300 {
            solve_step(&game, i);
        }
        finalize(&mut game);
        game
    }

    /// Same game, saved "up to the turn" and reloaded: rivers cannot be dealt.
    fn turn_only(game: &PostFlopGame) -> PostFlopGame {
        let dir = tempfile::tempdir().unwrap();
        let mut game_copy = {
            let path = dir.path().join("full.plab");
            save_data_to_file(game, "", &path, None).unwrap();
            load_data_from_file::<PostFlopGame, _>(&path, None)
                .unwrap()
                .0
        };
        game_copy.set_target_storage_mode(BoardState::Turn).unwrap();
        let path = dir.path().join("turn.plab");
        save_data_to_file(&game_copy, "", &path, None).unwrap();
        load_data_from_file::<PostFlopGame, _>(&path, None)
            .unwrap()
            .0
    }

    const RIVER: &str = "2s";

    fn averages(game: &mut PostFlopGame) -> [[f64; 2]; 2] {
        game.cache_normalized_weights();
        [0, 1].map(|p| {
            let w = game.normalized_weights(p);
            [
                compute_average(&game.equity(p), w) as f64,
                compute_average(&game.expected_values(p), w) as f64,
            ]
        })
    }

    #[test]
    fn ranges_are_node_weights() {
        let full = turn_game();
        let mut main = turn_only(&full);
        main.apply_history(&[0, 0]); // check, check: river chance node
        assert!(main.is_chance_node() && !main.can_deal_card());
        let card = card_from_str(RIVER).unwrap();
        let sub = build_subgame(&mut main, card).unwrap();
        assert!(matches!(sub.kind, SubgameKind::Solve));
        for p in 0..2 {
            let main_hands = main.private_cards(p);
            let main_weights = main.weights(p);
            let range = sub.game.card_config().range[p];
            for (i, &main_index) in sub.hand_map[p].iter().enumerate() {
                let (c1, c2) = sub.game.private_cards(p)[i];
                assert_eq!(main_hands[main_index], (c1, c2));
                let w = range.get_weight_by_cards(c1, c2);
                assert!((w - main_weights[main_index]).abs() < 1e-6);
            }
        }
    }

    #[test]
    fn pot_and_stack_after_bet_call() {
        let full = turn_game();
        let mut main = turn_only(&full);
        main.apply_history(&[1, 1]); // OOP bets 30 (50%), IP calls
        assert!(main.is_chance_node());
        let sub = build_subgame(&mut main, card_from_str(RIVER).unwrap()).unwrap();
        assert_eq!(sub.bet_offset, 30);
        assert_eq!(sub.game.tree_config().starting_pot, 120);
        assert_eq!(sub.game.tree_config().effective_stack, 270);
    }

    #[test]
    fn river_matches_full_solution() {
        let mut full = turn_game();
        let mut main = turn_only(&full);
        let card = card_from_str(RIVER).unwrap();
        main.apply_history(&[0, 0]);
        let mut sub = build_subgame(&mut main, card).unwrap();
        let target = 0.001 * sub.game.tree_config().starting_pot as f32;
        solve_subgame(
            &mut sub,
            target,
            1000,
            false,
            &AtomicBool::new(false),
            |_, _| {},
        )
        .unwrap();

        full.apply_history(&[0, 0, card as usize]);
        let expected = averages(&mut full);
        let got = averages(&mut sub.game);
        let pot = 60.0;
        for p in 0..2 {
            assert!(
                (got[p][0] - expected[p][0]).abs() < 0.01,
                "equity {p}: {got:?} vs {expected:?}"
            );
            assert!(
                (got[p][1] - expected[p][1]).abs() < 0.01 * pot,
                "ev {p}: {got:?} vs {expected:?}"
            );
        }
    }

    #[test]
    fn allin_line_is_terminal_and_matches_full_solution() {
        // The engine integrates the river runouts at the terminal node of an all-in line: no
        // river chance node, so a "turn" save shows all-in lines without any re-solve.
        let mut full = turn_game();
        let mut main = turn_only(&full);
        main.apply_history(&[1]);
        let raise_allin = main.available_actions().len() - 1;
        assert!(matches!(
            main.available_actions()[raise_allin],
            Action::AllIn(_)
        ));
        let line = [1, raise_allin, 1];
        main.apply_history(&line);
        assert!(main.is_terminal_node() && !main.is_chance_node());
        full.apply_history(&line);
        let expected = averages(&mut full);
        let got = averages(&mut main);
        for p in 0..2 {
            assert!((got[p][0] - expected[p][0]).abs() < 1e-4, "equity {p}");
            assert!((got[p][1] - expected[p][1]).abs() < 1e-3, "ev {p}");
        }
    }

    #[test]
    fn empty_range_is_empty_result() {
        let some = [0.0f32, 0.4];
        let none = [0.0f32, 0.0];
        assert!(matches!(classify([&none, &some]), SubgameKind::Empty));
        assert!(matches!(classify([&some, &none]), SubgameKind::Empty));
        assert!(matches!(classify([&some, &some]), SubgameKind::Solve));
    }

    #[test]
    fn target_rule() {
        assert!((subgame_target(120, 60, None) - 0.36).abs() < 1e-6);
        // 0.3 chips on a 60 root pot is 0.5%: 0.5% of 120 = 0.6 > 0.36.
        assert!((subgame_target(120, 60, Some(0.3)) - 0.6).abs() < 1e-6);
    }
}

#[cfg(test)]
mod river_card_tests {
    use super::*;

    #[test]
    fn river_card_removes_the_hands_it_blocks() {
        let card = |s: &str| card_from_str(s).unwrap();
        let hands = [(card("Ah"), card("As")), (card("Kh"), card("Ks"))];
        assert_eq!(
            weights_without_card(&hands, &[1.0, 0.5], card("As")),
            [0.0, 0.5]
        );
        // Every hand left contains the river card: nothing to solve.
        let blocked = weights_without_card(&hands[..1], &[1.0], card("As"));
        assert_eq!(classify([&blocked, &[1.0]]), SubgameKind::Empty);
    }
}

#[cfg(test)]
pub(crate) mod tree_edit_tests {
    use super::*;

    /// Turn game where the user removed OOP's 100% river bet after turn check-check.
    pub(crate) fn game_with_removed_river_line() -> PostFlopGame {
        let card_config = CardConfig {
            range: [
                "AA,KK,QQ,AK".parse().unwrap(),
                "QQ-99,AQ,KQ".parse().unwrap(),
            ],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: NOT_DEALT,
        };
        let bet: BetSizeOptions = ("50%, 100%", "").try_into().unwrap();
        let tree_config = TreeConfig {
            initial_state: BoardState::Turn,
            starting_pot: 60,
            effective_stack: 300,
            turn_bet_sizes: [bet.clone(), bet.clone()],
            river_bet_sizes: [bet.clone(), bet],
            ..Default::default()
        };
        let mut tree = ActionTree::new(tree_config).unwrap();
        tree.remove_line(&[Action::Check, Action::Check, Action::Bet(60)])
            .unwrap();
        let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
        game.allocate_memory(false);
        for i in 0..30 {
            solve_step(&game, i);
        }
        finalize(&mut game);
        game
    }

    #[test]
    fn river_subgame_keeps_the_tree_edits() {
        let mut full = game_with_removed_river_line();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.plab");
        full.set_target_storage_mode(BoardState::Turn).unwrap();
        save_data_to_file(&full, "", &path, None).unwrap();
        let mut main: PostFlopGame = load_data_from_file(&path, None).unwrap().0;
        main.apply_history(&[0, 0]);
        let card = card_from_str("2s").unwrap();
        let sub = build_subgame(&mut main, card).unwrap();
        // The main game is left where it was.
        assert_eq!(main.history(), &[0, 0]);
        full.apply_history(&[0, 0, card as usize]);
        assert_eq!(sub.game.available_actions(), full.available_actions());
    }
}
