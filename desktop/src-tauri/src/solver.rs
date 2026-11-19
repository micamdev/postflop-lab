use crate::library::{NodeFrequencies, SolutionSummary};
use crate::range::*;
use crate::session::{self, SubgameCache};
use postflop_solver::*;
use rayon::ThreadPool;
use serde::Serialize;
use std::sync::Mutex;

#[inline]
fn decode_action(action: &str) -> Action {
    match action {
        "F" => Action::Fold,
        "X" => Action::Check,
        "C" => Action::Call,
        _ => {
            let mut chars = action.chars();
            let first_char = chars.next().unwrap();
            let amount = chars.as_str().parse().unwrap();
            match first_char {
                'B' => Action::Bet(amount),
                'R' => Action::Raise(amount),
                'A' => Action::AllIn(amount),
                _ => unreachable!(),
            }
        }
    }
}

#[inline]
fn action_usize(action: isize) -> usize {
    match action {
        -1 => usize::MAX,
        a => a as usize,
    }
}

#[inline]
fn round(value: f64) -> f64 {
    if value < 1.0 {
        (value * 1000000.0).round() / 1000000.0
    } else if value < 10.0 {
        (value * 100000.0).round() / 100000.0
    } else if value < 100.0 {
        (value * 10000.0).round() / 10000.0
    } else if value < 1000.0 {
        (value * 1000.0).round() / 1000.0
    } else if value < 10000.0 {
        (value * 100.0).round() / 100.0
    } else {
        (value * 10.0).round() / 10.0
    }
}

#[inline]
fn round_iter<'a>(iter: impl Iterator<Item = &'a f32> + 'a) -> impl Iterator<Item = f64> + 'a {
    iter.map(|&x| round(x as f64))
}

#[inline]
pub fn weighted_average(slice: &[f32], weights: &[f32]) -> f64 {
    let mut sum = 0.0;
    let mut weight_sum = 0.0;
    for (&value, &weight) in slice.iter().zip(weights.iter()) {
        sum += value as f64 * weight as f64;
        weight_sum += weight as f64;
    }
    sum / weight_sum
}

/// The setup that defines a game tree, as sent by the front end (`gameTreeArgs`).
#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameTreeArgs {
    pub board: Vec<u8>,
    pub starting_pot: i32,
    pub effective_stack: i32,
    pub rake_rate: f64,
    pub rake_cap: f64,
    pub donk_option: bool,
    pub oop_flop_bet: String,
    pub oop_flop_raise: String,
    pub oop_turn_bet: String,
    pub oop_turn_raise: String,
    pub oop_turn_donk: String,
    pub oop_river_bet: String,
    pub oop_river_raise: String,
    pub oop_river_donk: String,
    pub ip_flop_bet: String,
    pub ip_flop_raise: String,
    pub ip_turn_bet: String,
    pub ip_turn_raise: String,
    pub ip_river_bet: String,
    pub ip_river_raise: String,
    pub add_allin_threshold: f64,
    pub force_allin_threshold: f64,
    pub merging_threshold: f64,
    pub added_lines: String,
    pub removed_lines: String,
}

fn bet_sizes(bet: &str, raise: &str) -> Result<BetSizeOptions, String> {
    BetSizeOptions::try_from((bet, raise)).map_err(|e| format!("Invalid bet sizes: {e}"))
}

/// Parses one encoded line ("X-B30|C") of added or removed lines.
fn parse_line(line: &str) -> Result<Vec<Action>, String> {
    line.split(&['-', '|'][..])
        .map(|action| {
            let valid = matches!(action, "F" | "X" | "C")
                || (action.len() > 1
                    && matches!(&action[..1], "B" | "R" | "A")
                    && action[1..].parse::<i32>().is_ok());
            if valid {
                Ok(decode_action(action))
            } else {
                Err("Invalid line (loaded broken tree?)".to_string())
            }
        })
        .collect()
}

/// Card configuration and action tree of a setup; every invalid input is an error.
pub fn build_game_inputs(
    ranges: &[Range; 2],
    args: &GameTreeArgs,
) -> Result<(CardConfig, ActionTree), String> {
    let board = &args.board;
    let (turn, river, state) = match board.len() {
        3 => (NOT_DEALT, NOT_DEALT, BoardState::Flop),
        4 => (board[3], NOT_DEALT, BoardState::Turn),
        5 => (board[3], board[4], BoardState::River),
        _ => return Err("Invalid board length".to_string()),
    };

    let card_config = CardConfig {
        range: *ranges,
        flop: board[..3].try_into().unwrap(),
        turn,
        river,
    };

    Ok((card_config, build_action_tree(args, state)?))
}

/// The action tree of a setup (bet sizes, thresholds, added and removed lines), starting at
/// `state`; shared by the solve and the tree editor.
pub fn build_action_tree(args: &GameTreeArgs, state: BoardState) -> Result<ActionTree, String> {
    let donk = |sizes: &str| match args.donk_option {
        false => None,
        true => DonkSizeOptions::try_from(sizes).ok(),
    };

    let tree_config = TreeConfig {
        initial_state: state,
        starting_pot: args.starting_pot,
        effective_stack: args.effective_stack,
        rake_rate: args.rake_rate,
        rake_cap: args.rake_cap,
        flop_bet_sizes: [
            bet_sizes(&args.oop_flop_bet, &args.oop_flop_raise)?,
            bet_sizes(&args.ip_flop_bet, &args.ip_flop_raise)?,
        ],
        turn_bet_sizes: [
            bet_sizes(&args.oop_turn_bet, &args.oop_turn_raise)?,
            bet_sizes(&args.ip_turn_bet, &args.ip_turn_raise)?,
        ],
        river_bet_sizes: [
            bet_sizes(&args.oop_river_bet, &args.oop_river_raise)?,
            bet_sizes(&args.ip_river_bet, &args.ip_river_raise)?,
        ],
        turn_donk_sizes: donk(&args.oop_turn_donk),
        river_donk_sizes: donk(&args.oop_river_donk),
        add_allin_threshold: args.add_allin_threshold,
        force_allin_threshold: args.force_allin_threshold,
        merging_threshold: args.merging_threshold,
    };

    let mut action_tree = ActionTree::new(tree_config)?;

    if !args.added_lines.is_empty() {
        for added_line in args.added_lines.split(',') {
            if action_tree.add_line(&parse_line(added_line)?).is_err() {
                return Err("Failed to add line (loaded broken tree?)".to_string());
            }
        }
    }

    if !args.removed_lines.is_empty() {
        for removed_line in args.removed_lines.split(',') {
            if action_tree.remove_line(&parse_line(removed_line)?).is_err() {
                return Err("Failed to remove line (loaded broken tree?)".to_string());
            }
        }
    }

    Ok(action_tree)
}

/// Most nodes a tree may have to be estimated while the setup is edited: building it allocates
/// its node arena (64 bytes per node), so a larger tree would take gigabytes on every edit.
const MAX_ESTIMATE_NODES: u64 = 8_000_000;

/// Memory needed to solve a setup (32-bit, 16-bit), from a separate game.
fn estimate_memory(ranges: &[Range; 2], args: &GameTreeArgs) -> Result<(u64, u64), String> {
    estimate_memory_capped(ranges, args, MAX_ESTIMATE_NODES)
}

/// As `estimate_memory`, refusing (before building anything) a tree of more than `max_nodes`.
fn estimate_memory_capped(
    ranges: &[Range; 2],
    args: &GameTreeArgs,
    max_nodes: u64,
) -> Result<(u64, u64), String> {
    let (card_config, action_tree) = build_game_inputs(ranges, args)?;
    let mut game = PostFlopGame::new();
    game.update_config_checked(card_config, action_tree, |nodes| {
        if nodes > max_nodes {
            return Err(format!(
                "Tree too large to estimate while editing ({:.1} million nodes): fewer bet sizes would be needed to solve it on most computers",
                nodes as f64 / 1e6
            ));
        }
        Ok(())
    })?;
    Ok(game.memory_usage())
}

#[tauri::command(async)]
pub fn game_init(
    range_state: tauri::State<Mutex<RangeManager>>,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    locks_state: tauri::State<crate::lock_commands::CurrentLocks>,
    args: GameTreeArgs,
) -> Result<Option<String>, String> {
    crate::guard::guard(move || {
        Ok({
            let ranges: [Range; 2] = crate::guard::lock(&range_state).0[..2].try_into().unwrap();
            let (card_config, action_tree) = match build_game_inputs(&ranges, &args) {
                Ok(inputs) => inputs,
                Err(e) => return Ok(Some(e)),
            };

            let mut game = crate::guard::lock_or_reset(&game_state);
            // A new tree: subgames of the previous game no longer apply.
            crate::guard::lock(&cache_state).clear();
            crate::guard::lock(&locks_state.0).clear();
            game.update_config(card_config, action_tree).err()
        })
    })
}

/// Memory needed to solve the setup, without touching the game held by the app.
#[tauri::command(async)]
pub fn game_memory_estimate(
    range_state: tauri::State<Mutex<RangeManager>>,
    args: GameTreeArgs,
) -> Result<(u64, u64), String> {
    crate::guard::guard(move || {
        let ranges: [Range; 2] = crate::guard::lock(&range_state).0[..2].try_into().unwrap();
        estimate_memory(&ranges, &args)
    })
}

#[tauri::command]
pub fn game_private_cards(game_state: tauri::State<Mutex<PostFlopGame>>) -> [Vec<u16>; 2] {
    let game = crate::guard::lock_or_reset(&game_state);
    let convert = |player: usize| {
        game.private_cards(player)
            .iter()
            .map(|&(c1, c2)| (c1 as u16) | (c2 as u16) << 8)
            .collect()
    };
    [convert(0), convert(1)]
}

#[tauri::command]
pub fn game_memory_usage(game_state: tauri::State<Mutex<PostFlopGame>>) -> (u64, u64) {
    let game = crate::guard::lock_or_reset(&game_state);
    game.memory_usage()
}

#[tauri::command]
pub fn game_memory_usage_bunching(game_state: tauri::State<Mutex<PostFlopGame>>) -> u64 {
    let game = crate::guard::lock_or_reset(&game_state);
    game.memory_usage_bunching()
}

#[tauri::command(async)]
pub fn game_allocate_memory(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    enable_compression: bool,
) -> Result<(), String> {
    crate::guard::guard(move || {
        let mut game = crate::guard::lock_or_reset(&game_state);
        game.allocate_memory(enable_compression);
        Ok(())
    })
}

#[tauri::command(async)]
pub fn game_set_bunching(
    bunching_state: tauri::State<Mutex<Option<BunchingData>>>,
    game_state: tauri::State<Mutex<PostFlopGame>>,
) -> Result<Option<String>, String> {
    crate::guard::guard(move || {
        Ok({
            let bunching_data = crate::guard::lock_or_reset(&bunching_state);
            let Some(bunching_data) = bunching_data.as_ref() else {
                return Err(ERR_BUNCHING_NOT_READY.to_string());
            };
            let mut game = crate::guard::lock_or_reset(&game_state);
            game.set_bunching_effect(bunching_data).err()
        })
    })
}

#[tauri::command(async)]
pub fn game_solve_step(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    pool_state: tauri::State<Mutex<std::sync::Arc<ThreadPool>>>,
    current_iteration: u32,
) -> Result<(), String> {
    crate::guard::guard(move || {
        let game = crate::guard::lock_or_reset(&game_state);
        let pool = crate::guard::lock(&pool_state);
        pool.install(|| solve_step(&*game, current_iteration));
        Ok(())
    })
}

#[tauri::command(async)]
pub fn game_exploitability(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    pool_state: tauri::State<Mutex<std::sync::Arc<ThreadPool>>>,
) -> Result<f32, String> {
    crate::guard::guard(move || {
        Ok({
            let game = crate::guard::lock_or_reset(&game_state);
            let pool = crate::guard::lock(&pool_state);
            pool.install(|| compute_exploitability(&*game))
        })
    })
}

#[tauri::command(async)]
pub fn game_finalize(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    pool_state: tauri::State<Mutex<std::sync::Arc<ThreadPool>>>,
) -> Result<(), String> {
    crate::guard::guard(move || {
        // Same lock order as the other game commands: game, then pool.
        let mut game = crate::guard::lock_or_reset(&game_state);
        let pool = crate::guard::lock(&pool_state).clone();
        let game: &mut PostFlopGame = &mut game;
        pool.install(|| finalize(game));
        Ok(())
    })
}

/// Error returned when a position needs a card that a truncated save does not store.
/// Error when the bunching data is missing (cleared, or reset after an internal error).
pub const ERR_BUNCHING_NOT_READY: &str =
    "The bunching data is not ready: run the precomputation again";

pub const ERR_BEYOND_DEPTH: &str = "beyond saved depth";

/// Plays `action`, refusing to deal a card past the saved depth (where `play` would panic and
/// poison the game's mutex).
pub(crate) fn play_checked(game: &mut PostFlopGame, action: usize) -> Result<(), String> {
    // Every case where `play` would panic (which aborts the app inside a command) is an error.
    if game.is_terminal_node() {
        return Err("No action after a terminal node".to_string());
    }
    if game.is_chance_node() {
        if !game.can_deal_card() {
            return Err(ERR_BEYOND_DEPTH.to_string());
        }
        if action != usize::MAX && (action >= 52 || game.possible_cards() & (1 << action) == 0) {
            return Err("This card cannot be dealt here".to_string());
        }
    } else if action >= game.available_actions().len() {
        return Err("Invalid action".to_string());
    }
    game.play(action);
    Ok(())
}

/// Plays `actions` from the current position; on failure, goes back to where it started.
fn play_all_checked(
    game: &mut PostFlopGame,
    actions: impl IntoIterator<Item = usize>,
) -> Result<(), String> {
    let start = game.history().to_vec();
    for action in actions {
        if let Err(e) = play_checked(game, action) {
            game.apply_history(&start);
            return Err(e);
        }
    }
    Ok(())
}

/// Like `PostFlopGame::apply_history`, but refuses positions past the saved depth: the game is
/// then left at its previous position.
pub fn apply_history_checked(game: &mut PostFlopGame, history: &[usize]) -> Result<(), String> {
    let previous = game.history().to_vec();
    game.back_to_root();
    if let Err(e) = play_all_checked(game, history.iter().copied()) {
        game.apply_history(&previous);
        return Err(e);
    }
    Ok(())
}

/// Root summary of a solved game (equity, EV, root action frequencies), saved in the library
/// metadata. Leaves the game at its current position.
pub fn compute_summary(game: &mut PostFlopGame) -> SolutionSummary {
    let history = game.history().to_vec();
    game.back_to_root();
    game.cache_normalized_weights();

    let mut summary = SolutionSummary::default();
    let mut buckets = [[0.0; 4]; 2];
    for player in 0..2 {
        let weights = game.normalized_weights(player);
        let equity = game.equity(player);
        summary.equity[player] = weighted_average(&equity, weights);
        summary.ev[player] = weighted_average(&game.expected_values(player), weights);
        buckets[player] = equity_buckets(&equity, weights);
    }

    // An empty range has no tranches (NaN cannot be saved as JSON).
    if buckets.iter().flatten().all(|x| x.is_finite()) {
        summary.equity_buckets = Some(buckets);
    }

    summary.root_player = current_player(game);
    if let Some(root) = node_frequencies(game) {
        // OOP first, and a check: IP's strategy after it (the usual c-bet node).
        if game.current_player() == 0 && root.actions.first().is_some_and(|a| a == "Check:0") {
            game.play(0);
            game.cache_normalized_weights();
            if game.current_player() == 1 {
                summary.ip_after_check = node_frequencies(game).and_then(finite);
            }
            game.back_to_root();
        }
        summary.root_actions = root.actions;
        summary.root_frequencies = root.frequencies;
    }

    game.apply_history(&history);
    summary
}

/// Actions of the current node and the range-weighted frequency of each (None at a terminal
/// or chance node). Weights must be cached.
fn node_frequencies(game: &PostFlopGame) -> Option<NodeFrequencies> {
    if game.is_terminal_node() || game.is_chance_node() {
        return None;
    }
    let player = game.current_player();
    let weights = game.normalized_weights(player);
    let num_hands = game.private_cards(player).len();
    let frequencies = game
        .strategy()
        .chunks_exact(num_hands)
        .map(|row| weighted_average(row, weights))
        .collect();
    Some(NodeFrequencies {
        actions: actions(game),
        frequencies,
    })
}

/// The node's frequencies if they are all defined: a node no hand reaches (OOP never checks)
/// has 0 / 0 frequencies, which cannot be saved (NaN becomes null in JSON).
fn finite(node: NodeFrequencies) -> Option<NodeFrequencies> {
    node.frequencies
        .iter()
        .all(|f| f.is_finite())
        .then_some(node)
}

/// Equity tranches, highest first: a hand is in the first one whose bound its equity reaches.
const EQUITY_BUCKET_BOUNDS: [f32; 4] = [0.9, 0.75, 0.5, 0.0];

/// Share of a range (weighted like the average equity) in each equity tranche: >= 90%,
/// 75-90%, 50-75%, < 50%, as `equityBuckets` in the front end. All NaN for an empty range.
pub fn equity_buckets(equity: &[f32], weights: &[f32]) -> [f64; 4] {
    let mut sums = [0.0f64; 4];
    for (&e, &w) in equity.iter().zip(weights) {
        if w == 0.0 {
            continue;
        }
        let bucket = EQUITY_BUCKET_BOUNDS
            .iter()
            .position(|&b| e >= b)
            .unwrap_or(3);
        sums[bucket] += w as f64;
    }
    let total: f64 = sums.iter().sum();
    sums.map(|s| if total > 0.0 { s / total } else { f64::NAN })
}

#[tauri::command]
pub fn game_apply_history(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    history: Vec<usize>,
) -> Result<(), String> {
    let mut game = crate::guard::lock_or_reset(&game_state);
    let mut cache = crate::guard::lock(&cache_state);
    session::apply(&mut game, &mut cache, &history)
}

#[tauri::command]
pub fn game_total_bet_amount(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    append: Vec<isize>,
) -> Result<[i32; 2], String> {
    let mut game = crate::guard::lock_or_reset(&game_state);
    let mut cache = crate::guard::lock(&cache_state);
    let append: Vec<usize> = append.iter().map(|&a| action_usize(a)).collect();
    session::total_bet_amount(&mut game, &mut cache, &append)
}

pub(crate) fn actions(game: &PostFlopGame) -> Vec<String> {
    if game.is_terminal_node() {
        vec!["terminal".to_string()]
    } else if game.is_chance_node() {
        vec!["chance".to_string()]
    } else {
        game.available_actions()
            .iter()
            .map(|&x| match x {
                Action::Fold => "Fold:0".to_string(),
                Action::Check => "Check:0".to_string(),
                Action::Call => "Call:0".to_string(),
                Action::Bet(amount) => format!("Bet:{amount}"),
                Action::Raise(amount) => format!("Raise:{amount}"),
                Action::AllIn(amount) => format!("Allin:{amount}"),
                _ => unreachable!(),
            })
            .collect()
    }
}

#[tauri::command]
pub fn game_actions_after(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    append: Vec<isize>,
) -> Result<Vec<String>, String> {
    let mut game = crate::guard::lock_or_reset(&game_state);
    let mut cache = crate::guard::lock(&cache_state);
    let append: Vec<usize> = append.iter().map(|&a| action_usize(a)).collect();
    session::actions_after(&mut game, &mut cache, &append)
}

/// Saved depth of the current game: "river" (complete), "turn" or "flop".
#[tauri::command]
pub fn game_storage_mode(game_state: tauri::State<Mutex<PostFlopGame>>) -> String {
    let game = crate::guard::lock_or_reset(&game_state);
    depth_name(game.storage_mode()).to_string()
}

pub fn depth_name(mode: BoardState) -> &'static str {
    match mode {
        BoardState::Flop => "flop",
        BoardState::Turn => "turn",
        BoardState::River => "river",
    }
}

pub fn depth_from_name(name: &str) -> Result<BoardState, String> {
    match name {
        "flop" => Ok(BoardState::Flop),
        "turn" => Ok(BoardState::Turn),
        "river" => Ok(BoardState::River),
        _ => Err(format!("Unknown depth: {name}")),
    }
}

#[tauri::command]
pub fn game_possible_cards(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
) -> u64 {
    let game = crate::guard::lock_or_reset(&game_state);
    let cache = crate::guard::lock(&cache_state);
    // Cards are dealt only at chance nodes of the main game; subgames start on the river.
    if cache.active.is_some() || !game.is_chance_node() {
        return 0;
    }
    game.possible_cards()
}

fn current_player(game: &PostFlopGame) -> String {
    if game.is_terminal_node() {
        "terminal".to_string()
    } else if game.is_chance_node() {
        "chance".to_string()
    } else if game.current_player() == 0 {
        "oop".to_string()
    } else {
        "ip".to_string()
    }
}

pub fn num_actions(game: &PostFlopGame) -> usize {
    match game.is_chance_node() {
        true => 0,
        false => game.available_actions().len(),
    }
}

#[derive(Serialize)]
pub struct GameResultsResponse {
    pub(crate) current_player: String,
    pub(crate) num_actions: usize,
    pub(crate) is_empty: i32,
    pub(crate) eqr_base: [i32; 2],
    pub(crate) weights: [Vec<f64>; 2],
    pub(crate) normalizer: [Vec<f64>; 2],
    pub(crate) equity: [Vec<f64>; 2],
    pub(crate) ev: [Vec<f64>; 2],
    pub(crate) eqr: [Vec<f64>; 2],
    pub(crate) strategy: Vec<f64>,
    pub(crate) action_ev: Vec<f64>,
}

/// Results at the current position, in a river subgame if needed.
#[tauri::command]
pub fn game_get_results(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
) -> GameResultsResponse {
    let mut game = crate::guard::lock_or_reset(&game_state);
    let mut cache = crate::guard::lock(&cache_state);
    session::results(&mut game, &mut cache)
}

/// Results at the current position of `game`.
pub fn results_of(game: &mut PostFlopGame) -> GameResultsResponse {
    let total_bet_amount = game.total_bet_amount();
    let pot_base = game.tree_config().starting_pot + total_bet_amount.iter().min().unwrap();
    let eqr_base = [
        pot_base + total_bet_amount[0],
        pot_base + total_bet_amount[1],
    ];

    let trunc = |&w: &f32| if w < 0.0005 { 0.0 } else { round(w as f64) };
    let weights = [
        game.weights(0).iter().map(trunc).collect::<Vec<_>>(),
        game.weights(1).iter().map(trunc).collect::<Vec<_>>(),
    ];

    let is_empty = |player: usize| weights[player].iter().all(|&w| w == 0.0);
    let is_empty_flag = is_empty(0) as i32 + 2 * is_empty(1) as i32;

    let mut normalizer = [Vec::new(), Vec::new()];
    let mut equity = [Vec::new(), Vec::new()];
    let mut ev = [Vec::new(), Vec::new()];
    let mut eqr = [Vec::new(), Vec::new()];

    if is_empty_flag > 0 {
        normalizer[0].extend(weights[0].iter());
        normalizer[1].extend(weights[1].iter());
    } else {
        game.cache_normalized_weights();

        normalizer[0].extend(round_iter(game.normalized_weights(0).iter()));
        normalizer[1].extend(round_iter(game.normalized_weights(1).iter()));

        let equity_raw = [game.equity(0), game.equity(1)];
        let ev_raw = [game.expected_values(0), game.expected_values(1)];

        equity[0].extend(round_iter(equity_raw[0].iter()));
        equity[1].extend(round_iter(equity_raw[1].iter()));
        ev[0].extend(round_iter(ev_raw[0].iter()));
        ev[1].extend(round_iter(ev_raw[1].iter()));

        for player in 0..2 {
            let pot = eqr_base[player] as f64;
            for (&eq, &ev) in equity_raw[player].iter().zip(ev_raw[player].iter()) {
                let (eq, ev) = (eq as f64, ev as f64);
                if eq < 5e-7 {
                    eqr[player].push(ev / 0.0);
                } else {
                    eqr[player].push(round(ev / (pot * eq)));
                }
            }
        }
    }

    let mut strategy = Vec::new();
    let mut action_ev = Vec::new();

    if !game.is_terminal_node() && !game.is_chance_node() {
        strategy.extend(round_iter(game.strategy().iter()));
        if is_empty_flag == 0 {
            action_ev.extend(round_iter(
                game.expected_values_detail(game.current_player()).iter(),
            ));
        }
    }

    GameResultsResponse {
        current_player: current_player(game),
        num_actions: num_actions(game),
        is_empty: is_empty_flag,
        eqr_base,
        weights,
        normalizer,
        equity,
        ev,
        eqr,
        strategy,
        action_ev,
    }
}

#[derive(Serialize)]
pub struct GameChanceReportsResponse {
    status: Vec<i32>,
    combos: [Vec<f64>; 2],
    equity: [Vec<f64>; 2],
    ev: [Vec<f64>; 2],
    eqr: [Vec<f64>; 2],
    strategy: Vec<f64>,
}

#[tauri::command]
pub fn game_get_chance_reports(
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    append: Vec<isize>,
    num_actions: usize,
) -> Result<GameChanceReportsResponse, String> {
    let mut game = crate::guard::lock_or_reset(&game_state);
    // Inside a river subgame there is no chance node left to report on.
    if crate::guard::lock(&cache_state).active.is_some() {
        return Err(ERR_BEYOND_DEPTH.to_string());
    }
    if append.is_empty() {
        return Err("No card to report on".to_string());
    }
    let history = game.history().to_vec();
    if !game.can_deal_card() {
        return Err(ERR_BEYOND_DEPTH.to_string());
    }

    let mut status = vec![0; 52]; // 0: not possible, 1: empty, 2: not empty
    let mut combos = [vec![0.0; 52], vec![0.0; 52]];
    let mut equity = [vec![0.0; 52], vec![0.0; 52]];
    let mut ev = [vec![0.0; 52], vec![0.0; 52]];
    let mut eqr = [vec![0.0; 52], vec![0.0; 52]];
    let mut strategy = vec![0.0; num_actions * 52];

    let possible_cards = game.possible_cards();
    for chance in 0..52 {
        if possible_cards & (1 << chance) == 0 {
            continue;
        }

        game.play(chance);
        let after = append[1..].iter().map(|&a| action_usize(a));
        if let Err(e) = play_all_checked(&mut game, after) {
            game.apply_history(&history);
            return Err(e);
        }

        let trunc = |&w: &f32| if w < 0.0005 { 0.0 } else { w };
        let weights = [
            game.weights(0).iter().map(trunc).collect::<Vec<_>>(),
            game.weights(1).iter().map(trunc).collect::<Vec<_>>(),
        ];

        combos[0][chance] = round(weights[0].iter().fold(0.0, |acc, &w| acc + w as f64));
        combos[1][chance] = round(weights[1].iter().fold(0.0, |acc, &w| acc + w as f64));

        let is_empty = |player: usize| weights[player].iter().all(|&w| w == 0.0);
        let is_empty_flag = [is_empty(0), is_empty(1)];

        game.cache_normalized_weights();
        let normalizer = [game.normalized_weights(0), game.normalized_weights(1)];

        if !game.is_terminal_node() {
            let current_player = game.current_player();
            if !is_empty_flag[current_player] {
                let strategy_tmp = game.strategy();
                let num_hands = game.private_cards(current_player).len();
                let ws = if is_empty_flag[current_player ^ 1] {
                    &weights[current_player]
                } else {
                    normalizer[current_player]
                };
                for action in 0..num_actions {
                    let slice = &strategy_tmp[action * num_hands..(action + 1) * num_hands];
                    let strategy_summary = weighted_average(slice, ws);
                    strategy[action * 52 + chance] = round(strategy_summary);
                }
            }
        }

        if is_empty_flag[0] || is_empty_flag[1] {
            status[chance] = 1;
            game.apply_history(&history);
            continue;
        }

        status[chance] = 2;

        let total_bet_amount = game.total_bet_amount();
        let pot_base = game.tree_config().starting_pot + total_bet_amount.iter().min().unwrap();

        for player in 0..2 {
            let pot = (pot_base + total_bet_amount[player]) as f32;
            let equity_tmp = weighted_average(&game.equity(player), normalizer[player]);
            let ev_tmp = weighted_average(&game.expected_values(player), normalizer[player]);
            equity[player][chance] = round(equity_tmp);
            ev[player][chance] = round(ev_tmp);
            eqr[player][chance] = round(ev_tmp / (pot as f64 * equity_tmp));
        }

        game.apply_history(&history);
    }

    Ok(GameChanceReportsResponse {
        status,
        combos,
        equity,
        ev,
        eqr,
        strategy,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::library;

    /// A small game starting on the turn, solved in a few iterations.
    fn turn_game() -> PostFlopGame {
        let card_config = CardConfig {
            range: ["AA,KK,QQ".parse().unwrap(), "QQ-TT,AQs".parse().unwrap()],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: NOT_DEALT,
        };
        let bet = ("50%", "").try_into().unwrap();
        let tree_config = TreeConfig {
            initial_state: BoardState::Turn,
            starting_pot: 60,
            effective_stack: 300,
            turn_bet_sizes: [bet, Default::default()],
            ..Default::default()
        };
        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();
        game.allocate_memory(false);
        for i in 0..30 {
            solve_step(&game, i);
        }
        finalize(&mut game);
        game
    }

    #[test]
    fn apply_history_beyond_turn_save_is_err() {
        let dir = tempfile::tempdir().unwrap();
        let mut game = turn_game();
        game.set_target_storage_mode(BoardState::Turn).unwrap();
        let mut meta = library::tests::meta(1);
        meta.depth = "turn".to_string();
        library::save(dir.path(), "turn-only", &game, &meta, false).unwrap();
        let (mut loaded, _) = library::load(dir.path(), "turn-only", u64::MAX).unwrap();

        // Check, check: the river chance node, which a turn-only save cannot deal.
        apply_history_checked(&mut loaded, &[0, 0]).unwrap();
        assert!(loaded.is_chance_node());
        let river = loaded.possible_cards().trailing_zeros() as usize;
        assert_eq!(
            apply_history_checked(&mut loaded, &[0, 0, river]).unwrap_err(),
            ERR_BEYOND_DEPTH
        );
        // The game is still usable, at the last valid position.
        assert_eq!(loaded.history(), &[0, 0]);
        apply_history_checked(&mut loaded, &[]).unwrap();
        assert!(!loaded.is_chance_node());
    }

    #[test]
    fn invalid_action_is_err_not_panic() {
        let mut game = turn_game();
        // Out-of-range action index at the root (OOP has 2 actions).
        assert!(apply_history_checked(&mut game, &[99]).is_err());
        // Action after a terminal node (check, bet, fold).
        assert!(apply_history_checked(&mut game, &[1, 0, 0]).is_err());
        // A card that cannot be dealt (the turn card itself).
        let turn = card_from_str("Qc").unwrap() as usize;
        assert!(apply_history_checked(&mut game, &[0, 0, turn]).is_err());
        // The game is still usable and at the root.
        assert_eq!(game.history(), &[] as &[usize]);
        apply_history_checked(&mut game, &[0, 0, usize::MAX]).unwrap();
    }

    #[test]
    fn apply_history_on_complete_game_is_unchanged() {
        let mut game = turn_game();
        apply_history_checked(&mut game, &[0, 0, usize::MAX]).unwrap();
        assert_eq!(game.current_board().len(), 5);
    }

    #[test]
    fn summary_frequencies_sum_to_one() {
        let mut game = turn_game();
        game.apply_history(&[0]);
        let summary = compute_summary(&mut game);
        let total: f64 = summary.root_frequencies.iter().sum();
        assert!((total - 1.0).abs() < 1e-4, "{total}");
        assert_eq!(summary.root_player, "oop");
        assert_eq!(summary.root_actions.len(), summary.root_frequencies.len());
        assert!(summary.equity.iter().all(|e| (0.0..=1.0).contains(e)));
        // compute_summary leaves the game where it was.
        assert_eq!(game.history(), &[0]);
    }

    #[test]
    fn summary_has_equity_buckets_and_ip_after_check() {
        let mut game = turn_game();
        let summary = compute_summary(&mut game);
        for buckets in summary.equity_buckets.expect("equity buckets") {
            let total: f64 = buckets.iter().sum();
            assert!((total - 1.0).abs() < 1e-6, "{total}");
        }
        // OOP acts first at the root and can check: IP's strategy after the check.
        assert_eq!(summary.root_actions[0], "Check:0");
        let after = summary.ip_after_check.expect("IP after check");
        assert_eq!(after.actions.len(), after.frequencies.len());
        let total: f64 = after.frequencies.iter().sum();
        assert!((total - 1.0).abs() < 1e-4, "{total}");
        assert_eq!(game.history(), &[] as &[usize]);
    }

    #[test]
    fn frequencies_without_weight_are_not_recorded() {
        // IP never reaches the node (OOP never checks): 0 / 0 for every action.
        let node = NodeFrequencies {
            actions: vec!["Check:0".to_string(), "Bet:7".to_string()],
            frequencies: vec![f64::NAN, f64::NAN],
        };
        assert_eq!(finite(node), None);
        let node = NodeFrequencies {
            actions: vec!["Check:0".to_string()],
            frequencies: vec![1.0],
        };
        assert!(finite(node).is_some());
    }

    #[test]
    fn equity_buckets_like_the_compare_tab() {
        // Equities 0.95, 0.8, 0.6, 0.1 with weights 1, 1, 2, 0 (a hand without weight).
        let b = equity_buckets(&[0.95, 0.8, 0.6, 0.1], &[1.0, 1.0, 2.0, 0.0]);
        assert_eq!(b, [0.25, 0.25, 0.5, 0.0]);
        // Bounds belong to the higher tranche.
        assert_eq!(
            equity_buckets(&[0.9, 0.75, 0.5], &[1.0, 1.0, 2.0]),
            [0.25, 0.25, 0.5, 0.0]
        );
        assert!(equity_buckets(&[0.5], &[0.0]).iter().all(|x| x.is_nan()));
    }

    /// Setup arguments: `board`, OOP and IP flop bets `bet`, nothing else.
    pub(crate) fn setup_args(board: &str, bet: &str) -> GameTreeArgs {
        let board_cards = (0..board.len())
            .step_by(2)
            .map(|i| card_from_str(&board[i..i + 2]).unwrap())
            .collect();
        GameTreeArgs {
            board: board_cards,
            starting_pot: 60,
            effective_stack: 300,
            oop_flop_bet: bet.to_string(),
            ip_flop_bet: bet.to_string(),
            add_allin_threshold: 1.5,
            force_allin_threshold: 0.2,
            merging_threshold: 0.1,
            ..Default::default()
        }
    }

    pub(crate) fn setup_ranges(oop: &str, ip: &str) -> [Range; 2] {
        [oop.parse().unwrap(), ip.parse().unwrap()]
    }

    #[test]
    fn action_tree_errors_are_returned_not_panicked() {
        assert!(build_action_tree(&setup_args("Td9d6h", "50%"), BoardState::Flop).is_ok());
        assert!(build_action_tree(&setup_args("Td9d6h", "fifty"), BoardState::Flop).is_err());
        let mut broken = setup_args("Td9d6h", "50%");
        broken.added_lines = "X-Z".to_string();
        assert!(build_action_tree(&broken, BoardState::Flop).is_err());
    }

    #[test]
    fn estimate_matches_built_game() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        let args = setup_args("Td9d6h", "50%");
        let (raw, compressed) = estimate_memory(&ranges, &args).unwrap();

        let (card_config, action_tree) = build_game_inputs(&ranges, &args).unwrap();
        let mut game = PostFlopGame::new();
        game.update_config(card_config, action_tree).unwrap();
        assert_eq!((raw, compressed), game.memory_usage());
        assert!(raw > compressed && compressed > 0);
    }

    #[test]
    fn estimate_rejects_bad_bet_size() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        assert!(estimate_memory(&ranges, &setup_args("Td9d6h", "50%, abc")).is_err());
    }

    #[test]
    fn estimate_rejects_empty_range() {
        let ranges = setup_ranges("", "QQ,JJ");
        assert!(estimate_memory(&ranges, &setup_args("Td9d6h", "50%")).is_err());
    }

    #[test]
    fn estimate_rejects_short_board() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        assert!(estimate_memory(&ranges, &setup_args("Td9d", "50%")).is_err());
    }

    #[test]
    fn estimate_refuses_a_tree_too_large_to_build() {
        let ranges = setup_ranges("AA,KK", "QQ,JJ");
        let args = setup_args("Td9d6h", "50%");
        let (card_config, action_tree) = build_game_inputs(&ranges, &args).unwrap();
        let mut nodes = 0;
        PostFlopGame::new()
            .update_config_checked(card_config, action_tree, |n| {
                nodes = n;
                Ok(())
            })
            .unwrap();
        assert!(nodes > 1);

        // Just enough nodes: estimated; one fewer allowed: refused before building.
        assert!(estimate_memory_capped(&ranges, &args, nodes).is_ok());
        let err = estimate_memory_capped(&ranges, &args, nodes - 1).unwrap_err();
        assert!(err.contains("too large"), "{err}");
    }
}
