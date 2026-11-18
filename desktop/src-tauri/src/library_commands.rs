//! Tauri commands of the solution library. File handling lives in `library`.

use crate::library::{self, LibraryEntry, SolutionMeta, META_SCHEMA};
use crate::lock_commands::CurrentLocks;
use crate::range::RangeManager;
use crate::session::SubgameCache;
use crate::solver::{compute_summary, depth_from_name, depth_name};
use postflop_solver::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

pub fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Documents folder not found: {e}"))?;
    Ok(library::library_dir_in(&documents))
}

/// Front-end fields saved in the metadata.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontMeta {
    tree_config: serde_json::Value,
    iterations: u32,
    exploitability: f32,
}

#[derive(Serialize, Clone)]
struct SaveProgress {
    written: u64,
}

#[tauri::command]
pub fn library_list(app: AppHandle) -> Result<Vec<LibraryEntry>, String> {
    Ok(library::list(&library_dir(&app)?))
}

/// For each depth the tree allows, the memory needed to reload a save at that depth.
#[tauri::command]
pub fn library_save_estimate(
    game_state: tauri::State<Mutex<PostFlopGame>>,
) -> Result<Vec<(String, u64)>, String> {
    let mut game = game_state.lock().unwrap();
    let initial = game.tree_config().initial_state;
    let mut estimates = Vec::new();
    for mode in [BoardState::River, BoardState::Turn, BoardState::Flop] {
        if mode >= initial {
            game.set_target_storage_mode(mode)?;
            estimates.push((depth_name(mode).to_string(), game.target_memory_usage()));
        }
    }
    game.set_target_storage_mode(BoardState::River)?;
    Ok(estimates)
}

#[tauri::command(async)]
pub fn library_save(
    app: AppHandle,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    locks_state: tauri::State<CurrentLocks>,
    name: String,
    depth: String,
    overwrite: bool,
    front_meta: FrontMeta,
) -> Result<String, String> {
    let dir = library_dir(&app)?;
    let mut game = game_state.lock().unwrap();
    if !game.is_solved() {
        return Err("The solver has not finished".to_string());
    }
    if game.is_bunching_enabled() {
        return Err("Solutions computed with the bunching effect cannot be saved".to_string());
    }

    let card_config = game.card_config().clone();
    let mut board = card_config.flop.to_vec();
    board.extend(
        [card_config.turn, card_config.river]
            .into_iter()
            .filter(|&c| c != NOT_DEALT),
    );
    let meta = SolutionMeta {
        schema: META_SCHEMA,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs()),
        board,
        ranges: [
            card_config.range[0].to_string(),
            card_config.range[1].to_string(),
        ],
        tree_config: front_meta.tree_config,
        depth: depth.clone(),
        exploitability: front_meta.exploitability,
        iterations: front_meta.iterations,
        precision: if game.is_compression_enabled() {
            "16"
        } else {
            "32"
        }
        .to_string(),
        summary: compute_summary(&mut game),
        locks: locks_state.0.lock().unwrap().clone(),
    };

    game.set_target_storage_mode(depth_from_name(&depth)?)?;
    let mut last_emit = Instant::now();
    let result = library::save_with_progress(&dir, &name, &game, &meta, overwrite, |written| {
        if last_emit.elapsed() >= Duration::from_millis(100) {
            last_emit = Instant::now();
            let _ = app.emit("library-save-progress", SaveProgress { written });
        }
    });
    game.set_target_storage_mode(BoardState::River)?;
    result
}

/// Error prefix of `library_load` when the current game was freed before the load failed: the
/// front end must then forget the current tree and results.
pub const ERR_GAME_FREED: &str = "game freed";

/// Memory the current game frees when replaced (0 if it holds no solution). For a solved or
/// loaded game this is the memory its stored data needs (`target_memory_usage`), which also
/// fits partial saves; `memory_usage` would over-count those.
fn current_game_memory(game: &PostFlopGame) -> u64 {
    if game.is_solved() || game.is_ready() {
        game.target_memory_usage()
    } else {
        0
    }
}

/// Memory a loaded solution may use: what is available now plus what the current game and
/// its cached river subgames free.
/// On macOS, as in the Run Solver screen, the limit is 70% of the total memory.
fn max_load_memory(current_game: &PostFlopGame, cache: &SubgameCache) -> u64 {
    let (available, total) = crate::memory();
    if cfg!(target_os = "macos") {
        return total / 10 * 7;
    }
    available + current_game_memory(current_game) + cache.memory_usage()
}

fn gb(bytes: u64) -> String {
    format!("{:.2} GB", bytes as f64 / (1u64 << 30) as f64)
}

/// Checks that a solution can be loaded (readable header, enough memory), without touching
/// the current game.
fn check_load(dir: &std::path::Path, name: &str, max_memory: u64) -> Result<(), String> {
    library::check_name(name)?;
    let header = load_header_from_file::<PostFlopGame, _>(
        dir.join(format!("{name}.{}", library::EXTENSION)),
    )?;
    if header.estimated_memory_usage > max_memory {
        return Err(format!(
            "Not enough memory: this solution needs {}, {} available",
            gb(header.estimated_memory_usage),
            gb(max_memory)
        ));
    }
    Ok(())
}

/// Checks that a solution can be loaded, so the front end can keep the current results if not.
#[tauri::command]
pub fn library_check_load(
    app: AppHandle,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    name: String,
) -> Result<(), String> {
    let dir = library_dir(&app)?;
    let game = game_state.lock().unwrap();
    check_load(
        &dir,
        &name,
        max_load_memory(&game, &cache_state.lock().unwrap()),
    )
}

#[tauri::command(async)]
pub fn library_load(
    app: AppHandle,
    game_state: tauri::State<Mutex<PostFlopGame>>,
    range_state: tauri::State<Mutex<RangeManager>>,
    cache_state: tauri::State<Mutex<SubgameCache>>,
    locks_state: tauri::State<CurrentLocks>,
    name: String,
) -> Result<SolutionMeta, String> {
    let dir = library_dir(&app)?;
    let mut game = game_state.lock().unwrap();
    let max_memory = max_load_memory(&game, &cache_state.lock().unwrap());

    // Refuse before touching the current game if the solution cannot fit.
    check_load(&dir, &name, max_memory)?;

    // Free the current game (and its subgames) first so both never coexist in memory.
    cache_state.lock().unwrap().clear();
    *game = PostFlopGame::new();
    locks_state.0.lock().unwrap().clear();
    let (loaded, meta) =
        library::load(&dir, &name, max_memory).map_err(|e| format!("{ERR_GAME_FREED}: {e}"))?;
    let ranges = loaded.card_config().range;
    *game = loaded;
    *locks_state.0.lock().unwrap() = meta.locks.clone();
    let mut range_manager = range_state.lock().unwrap();
    range_manager.0[0] = ranges[0];
    range_manager.0[1] = ranges[1];
    Ok(meta)
}

#[tauri::command]
pub fn library_rename(app: AppHandle, from: String, to: String) -> Result<String, String> {
    library::rename(&library_dir(&app)?, &from, &to)
}

#[tauri::command]
pub fn library_delete(app: AppHandle, name: String) -> Result<(), String> {
    library::delete(&library_dir(&app)?, &name)
}

#[tauri::command(async)]
pub fn library_import(app: AppHandle, path: PathBuf, overwrite: bool) -> Result<String, String> {
    library::import(&library_dir(&app)?, &path, overwrite)
}

#[tauri::command(async)]
pub fn library_export(app: AppHandle, name: String, path: PathBuf) -> Result<(), String> {
    library::export(&library_dir(&app)?, &name, &path)
}

#[tauri::command]
pub fn library_open_folder(app: AppHandle) -> Result<(), String> {
    let dir = library_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create the folder: {e}"))?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Failed to open the folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::tests::small_game;

    #[test]
    fn solved_game_memory_is_counted() {
        let game = small_game(true);
        assert!(game.is_solved());
        assert_eq!(current_game_memory(&game), game.target_memory_usage());
        assert_eq!(current_game_memory(&PostFlopGame::new()), 0);
    }
}
