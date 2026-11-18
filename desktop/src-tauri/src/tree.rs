use postflop_solver::*;
use std::sync::Mutex;

#[inline]
fn action_to_string(action: Action) -> String {
    match action {
        Action::Fold => "Fold:0".to_string(),
        Action::Check => "Check:0".to_string(),
        Action::Call => "Call:0".to_string(),
        Action::Bet(amount) => format!("Bet:{amount}"),
        Action::Raise(amount) => format!("Raise:{amount}"),
        Action::AllIn(amount) => format!("Allin:{amount}"),
        _ => unreachable!(),
    }
}

#[inline]
fn encode_action(action: Action) -> String {
    match action {
        Action::Fold => "F".to_string(),
        Action::Check => "X".to_string(),
        Action::Call => "C".to_string(),
        Action::Bet(amount) => format!("B{amount}"),
        Action::Raise(amount) => format!("R{amount}"),
        Action::AllIn(amount) => format!("A{amount}"),
        _ => unreachable!(),
    }
}

fn encode_line(line: &[Action]) -> String {
    let mut flag = 0;
    let mut encoded = String::new();

    if line.is_empty() {
        return "(Root)".to_string();
    }

    for &action in line {
        if !encoded.is_empty() {
            let delimiter = if flag == 2 { "|" } else { "-" };
            flag = if flag == 2 { 0 } else { flag };
            encoded.push_str(delimiter);
        }
        match action {
            Action::Check => flag += 1,
            Action::Call => flag = 2,
            _ => flag = 0,
        }
        encoded.push_str(&encode_action(action));
    }

    encoded
}

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

pub fn default_action_tree() -> ActionTree {
    let tree_config = TreeConfig {
        starting_pot: 1,
        effective_stack: 1,
        ..Default::default()
    };
    ActionTree::new(tree_config).unwrap()
}

/// Builds the tree to edit from the setup; `board_len` (3 to 5) is the street it starts on.
/// Returns false if the setup does not make a valid tree.
#[tauri::command]
pub fn tree_new(
    tree_state: tauri::State<Mutex<ActionTree>>,
    args: crate::solver::GameTreeArgs,
    board_len: usize,
) -> bool {
    let state = match board_len {
        3 => BoardState::Flop,
        4 => BoardState::Turn,
        5 => BoardState::River,
        _ => return false,
    };
    match crate::solver::build_action_tree(&args, state) {
        Ok(tree) => {
            *crate::guard::lock(&tree_state) = tree;
            true
        }
        Err(_) => false,
    }
}

#[tauri::command]
pub fn tree_added_lines(tree_state: tauri::State<Mutex<ActionTree>>) -> String {
    let tree = crate::guard::lock(&tree_state);
    tree.added_lines()
        .iter()
        .map(|l| encode_line(l))
        .collect::<Vec<_>>()
        .join(",")
}

#[tauri::command]
pub fn tree_removed_lines(tree_state: tauri::State<Mutex<ActionTree>>) -> String {
    let tree = crate::guard::lock(&tree_state);
    tree.removed_lines()
        .iter()
        .map(|l| encode_line(l))
        .collect::<Vec<_>>()
        .join(",")
}

#[tauri::command]
pub fn tree_invalid_terminals(tree_state: tauri::State<Mutex<ActionTree>>) -> String {
    let tree = crate::guard::lock(&tree_state);
    tree.invalid_terminals()
        .iter()
        .map(|l| encode_line(l))
        .collect::<Vec<_>>()
        .join(",")
}

#[tauri::command]
pub fn tree_actions(tree_state: tauri::State<Mutex<ActionTree>>) -> Vec<String> {
    let tree = crate::guard::lock(&tree_state);
    tree.available_actions()
        .iter()
        .cloned()
        .map(action_to_string)
        .collect()
}

#[tauri::command]
pub fn tree_is_terminal_node(tree_state: tauri::State<Mutex<ActionTree>>) -> bool {
    let tree = crate::guard::lock(&tree_state);
    tree.is_terminal_node()
}

#[tauri::command]
pub fn tree_is_chance_node(tree_state: tauri::State<Mutex<ActionTree>>) -> bool {
    let tree = crate::guard::lock(&tree_state);
    tree.is_chance_node()
}

#[tauri::command]
pub fn tree_back_to_root(tree_state: tauri::State<Mutex<ActionTree>>) {
    let mut tree = crate::guard::lock(&tree_state);
    tree.back_to_root();
}

#[tauri::command]
pub fn tree_apply_history(tree_state: tauri::State<Mutex<ActionTree>>, line: Vec<String>) {
    let mut tree = crate::guard::lock(&tree_state);
    let line = line
        .iter()
        .map(|l| decode_action(l.as_str()))
        .collect::<Vec<_>>();
    tree.apply_history(&line).unwrap();
}

#[tauri::command]
pub fn tree_play(tree_state: tauri::State<Mutex<ActionTree>>, action: String) -> i32 {
    let mut tree = crate::guard::lock(&tree_state);
    let action = decode_action(&action);
    let available_actions = tree.available_actions();
    if let Some(index) = available_actions.iter().position(|&a| a == action) {
        tree.play(action).unwrap();
        index as i32
    } else {
        -1
    }
}

#[tauri::command]
pub fn tree_total_bet_amount(tree_state: tauri::State<Mutex<ActionTree>>) -> [i32; 2] {
    let tree = crate::guard::lock(&tree_state);
    tree.total_bet_amount()
}

#[tauri::command]
pub fn tree_add_bet_action(
    tree_state: tauri::State<Mutex<ActionTree>>,
    amount: i32,
    is_raise: bool,
) {
    let mut tree = crate::guard::lock(&tree_state);
    let action = match is_raise {
        false => Action::Bet(amount),
        true => Action::Raise(amount),
    };
    tree.add_action(action).unwrap();
}

#[tauri::command]
pub fn tree_remove_current_node(tree_state: tauri::State<Mutex<ActionTree>>) {
    let mut tree = crate::guard::lock(&tree_state);
    tree.remove_current_node().unwrap();
}

#[tauri::command]
pub fn tree_delete_added_line(tree_state: tauri::State<Mutex<ActionTree>>, line: String) {
    let mut tree = crate::guard::lock(&tree_state);
    let line = line
        .split(&['-', '|'][..])
        .map(decode_action)
        .collect::<Vec<_>>();
    tree.remove_line(&line).unwrap();
}

#[tauri::command]
pub fn tree_delete_removed_line(tree_state: tauri::State<Mutex<ActionTree>>, line: String) {
    let mut tree = crate::guard::lock(&tree_state);
    let line = line
        .split(&['-', '|'][..])
        .map(decode_action)
        .collect::<Vec<_>>();
    tree.add_line(&line).unwrap();
}
