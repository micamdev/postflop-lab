#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod bunching;
mod guard;
mod library;
mod library_commands;
mod lock_commands;
mod locks;
mod range;
mod session;
mod solver;
mod subgame;
mod subgame_commands;
mod tree;
use crate::bunching::*;
use crate::library_commands::*;
use crate::range::*;
use crate::solver::*;
use crate::tree::*;

use postflop_solver::*;
use rayon::{ThreadPool, ThreadPoolBuilder};
use std::sync::Mutex;
use sysinfo::System;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(RangeManager::default()))
        .manage(Mutex::new(default_action_tree()))
        .manage(Mutex::new(None as Option<BunchingData>))
        .manage(Mutex::new(PostFlopGame::default()))
        .manage(Mutex::new(session::SubgameCache::default()))
        .manage(subgame_commands::SubgameControl::default())
        .manage(lock_commands::CurrentLocks::default())
        .manage(Mutex::new(std::sync::Arc::new(
            ThreadPoolBuilder::new().build().unwrap(),
        )))
        .setup(|app| {
            // Temporary files of saves interrupted by a crash (a running save keeps its file
            // fresh, and no save runs this early).
            if let Ok(dir) = library_commands::library_dir(app.handle()) {
                std::thread::spawn(move || {
                    library::remove_stale_tmp(&dir, std::time::Duration::from_secs(600))
                });
            }
            Ok(())
        })
        .invoke_handler(guarded(tauri::generate_handler![
            os_name,
            memory,
            set_num_threads,
            range_num_combos,
            range_clear,
            range_invert,
            range_update,
            range_from_string,
            range_to_string,
            range_get_weights,
            range_raw_data,
            tree_new,
            tree_added_lines,
            tree_removed_lines,
            tree_invalid_terminals,
            tree_actions,
            tree_is_terminal_node,
            tree_is_chance_node,
            tree_back_to_root,
            tree_apply_history,
            tree_play,
            tree_total_bet_amount,
            tree_add_bet_action,
            tree_remove_current_node,
            tree_delete_added_line,
            tree_delete_removed_line,
            bunching_init,
            bunching_clear,
            bunching_progress,
            game_init,
            game_memory_estimate,
            game_private_cards,
            game_memory_usage,
            game_memory_usage_bunching,
            game_allocate_memory,
            game_set_bunching,
            game_solve_step,
            game_exploitability,
            game_finalize,
            game_apply_history,
            game_total_bet_amount,
            game_actions_after,
            game_possible_cards,
            game_get_results,
            game_get_chance_reports,
            game_storage_mode,
            subgame_commands::game_resolve_subgame,
            subgame_commands::game_cancel_subgame,
            lock_commands::game_capture_lock,
            lock_commands::game_prepare_lock_solve,
            lock_commands::game_locks,
            library_list,
            library_save_estimate,
            library_save,
            library_check_load,
            library_load,
            library_rename,
            library_delete,
            library_import,
            library_export,
            library_open_folder
        ]))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn os_name() -> String {
    "windows".to_string()
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn os_name() -> String {
    "macos".to_string()
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn os_name() -> String {
    "linux".to_string()
}

/// A memory size in gigabytes, for messages ("1.25 GB").
pub fn gb(bytes: u64) -> String {
    format!("{:.2} GB", bytes as f64 / (1u64 << 30) as f64)
}

/// Returns `(available, total)` memory in bytes, or `(0, 0)` if it cannot be read
/// (sysinfo >= 0.40 can fail; a panic would abort the whole app in release).
#[tauri::command]
fn memory() -> (u64, u64) {
    System::new().map_or((0, 0), |mut system| {
        system.refresh_memory();
        (system.available_memory(), system.total_memory())
    })
}

#[tauri::command]
fn set_num_threads(
    pool_state: tauri::State<Mutex<std::sync::Arc<ThreadPool>>>,
    num_threads: usize,
) {
    *crate::guard::lock(&pool_state) = std::sync::Arc::new(
        ThreadPoolBuilder::new()
            .num_threads(num_threads)
            .build()
            .unwrap(),
    );
}

/// Wraps the command handler: a panic in a synchronous command is answered with an error
/// instead of closing the app (asynchronous commands guard their own body; see guard.rs).
fn guarded<R: tauri::Runtime>(
    handler: impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke| {
        let resolver = invoke.resolver.clone();
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| handler(invoke))).unwrap_or_else(
            |payload| {
                resolver.reject(guard::internal_error(&*payload));
                true
            },
        )
    }
}
