//! A panic inside a command must not close the app (issue #38): it becomes an error for the
//! front end, and the shared state it left half-updated is reset at once.

use crate::lock_commands::CurrentLocks;
use crate::session::SubgameCache;
use postflop_solver::{BunchingData, PostFlopGame};
use std::any::Any;
use std::cell::RefCell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Manager};

/// Prefix of the error a command returns after a panic.
pub const ERR_INTERNAL: &str = "Internal error";
/// In the error after a panic: the game in memory was reset (the front end drops its results).
pub const TAG_SOLUTION_RESET: &str = "(solution reset)";
/// In the error after a panic: the bunching data was cleared.
pub const TAG_BUNCHING_RESET: &str = "(bunching data reset)";

/// The app, to reach the shared state when recovering from a panic (unset in unit tests).
static APP: OnceLock<AppHandle> = OnceLock::new();

thread_local! {
    /// Where the last panic of this thread happened ("solver.rs:120"), for the report.
    static PANIC_LOCATION: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Remembers the app and records where panics happen (the default report still runs).
pub fn install(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()));
        PANIC_LOCATION.with(|cell| *cell.borrow_mut() = location);
        previous(info);
    }));
}

/// The message carried by a panic payload.
pub fn panic_message(payload: &(dyn Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic".to_string()
    }
}

/// Resets the state a panic may have left half-updated; returns the tags of what was reset.
///
/// The game is reset if its mutex is poisoned (a panic while it was locked): an empty game,
/// with the river subgames and the locks that belonged to it. The bunching data likewise.
pub fn recover_states(
    game: &Mutex<PostFlopGame>,
    cache: &Mutex<SubgameCache>,
    locks: &Mutex<Vec<crate::locks::NodeLock>>,
    bunching: &Mutex<Option<BunchingData>>,
) -> Vec<&'static str> {
    let mut tags = Vec::new();
    if game.is_poisoned() {
        drop(lock_or_reset(game));
        lock(cache).clear();
        lock(locks).clear();
        tags.push(TAG_SOLUTION_RESET);
    }
    if bunching.is_poisoned() {
        drop(lock_or_reset(bunching));
        tags.push(TAG_BUNCHING_RESET);
    }
    tags
}

/// The error returned for a panic, after the state it touched was reset.
pub fn internal_error(payload: &(dyn Any + Send)) -> String {
    let tags = APP.get().map_or_else(Vec::new, |app| {
        recover_states(
            &app.state::<Mutex<PostFlopGame>>(),
            &app.state::<Mutex<SubgameCache>>(),
            &app.state::<CurrentLocks>().0,
            &app.state::<Mutex<Option<BunchingData>>>(),
        )
    });
    let location = PANIC_LOCATION
        .with(|cell| cell.borrow_mut().take())
        .map_or_else(String::new, |l| format!(" at {l}"));
    let tags = tags.iter().map(|t| format!(" {t}")).collect::<String>();
    format!(
        "{ERR_INTERNAL}{tags}: {}{location}. Please report this.",
        panic_message(payload)
    )
}

/// Runs a command body, turning a panic into an error.
pub fn guard<T>(body: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(body)).unwrap_or_else(|payload| Err(internal_error(&*payload)))
}

/// Locks `mutex`; if a panic poisoned it, resets its value to the default (for the game: an
/// empty game). Reached only when a panic was not recovered at once (see `recover_states`).
pub fn lock_or_reset<T: Default>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        mutex.clear_poison();
        let mut guard = poisoned.into_inner();
        *guard = T::default();
        guard
    })
}

/// Locks `mutex`; if a panic poisoned it, keeps its value. For state the front end rebuilds
/// or that is replaced as a whole (ranges, tree editor, settings, caches cleared with the game).
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        mutex.clear_poison();
        poisoned.into_inner()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use postflop_solver::Game;

    fn poison<T>(mutex: &Mutex<T>) {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            let _guard = mutex.lock().unwrap();
            panic!("half-updated");
        }));
        assert!(mutex.is_poisoned());
    }

    #[test]
    fn a_panic_becomes_an_error() {
        let result: Result<(), String> = guard(|| panic!("boom at node 3"));
        let err = result.unwrap_err();
        assert!(err.starts_with(ERR_INTERNAL), "{err}");
        assert!(err.contains("boom at node 3"), "{err}");
        assert_eq!(guard(|| Ok(7)), Ok(7));
        assert_eq!(
            guard::<()>(|| Err("refused".to_string())),
            Err("refused".to_string())
        );
    }

    #[test]
    fn a_poisoned_lock_is_recovered() {
        let state = Mutex::new(vec![1, 2, 3]);
        poison(&state);
        assert_eq!(*lock(&state), vec![1, 2, 3]);
        poison(&state);
        assert!(lock_or_reset(&state).is_empty());
        assert!(!state.is_poisoned());
    }

    #[test]
    fn only_the_state_a_panic_touched_is_reset() {
        let game = Mutex::new(crate::session::tests::turn_only_game());
        let cache = Mutex::new(SubgameCache::default());
        let locks = Mutex::new(Vec::new());
        let bunching = Mutex::new(None);
        // A panic outside the game (e.g. listing the library): nothing is reset.
        assert!(recover_states(&game, &cache, &locks, &bunching).is_empty());
        assert!(lock(&game).is_ready() || lock(&game).is_solved());

        poison(&game);
        assert_eq!(
            recover_states(&game, &cache, &locks, &bunching),
            vec![TAG_SOLUTION_RESET]
        );
        assert!(!game.is_poisoned());
        assert!(!lock(&game).is_solved());

        poison(&bunching);
        assert_eq!(
            recover_states(&game, &cache, &locks, &bunching),
            vec![TAG_BUNCHING_RESET]
        );
    }
}
