//! A panic inside a command must not close the app (issue #38): it becomes an error for the
//! front end, and the shared state it may have left half-updated is recovered.

use std::any::Any;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Mutex, MutexGuard};

/// Prefix of the error a command returns after a panic. The front end then drops the
/// results it shows (the game may have been reset).
pub const ERR_INTERNAL: &str = "Internal error";

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

/// The error returned for a panic.
pub fn internal_error(payload: &(dyn Any + Send)) -> String {
    format!(
        "{ERR_INTERNAL}: {}. Please report this.",
        panic_message(payload)
    )
}

/// Runs a command body, turning a panic into an error.
pub fn guard<T>(body: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    catch_unwind(AssertUnwindSafe(body)).unwrap_or_else(|payload| Err(internal_error(&*payload)))
}

/// Locks `mutex`; if a panic poisoned it, its value may be half-updated and is reset to the
/// default (for the game: an empty game, which every command refuses cleanly).
pub fn lock_or_reset<T: Default>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        mutex.clear_poison();
        let mut guard = poisoned.into_inner();
        *guard = T::default();
        guard
    })
}

/// Locks `mutex`; if a panic poisoned it, its value is kept (it is replaced as a whole, never
/// left half-updated: settings, caches, the lock list).
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| {
        mutex.clear_poison();
        poisoned.into_inner()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let mut guard = state.lock().unwrap();
            guard.push(4);
            panic!("half-updated");
        }));
        assert!(state.is_poisoned());
        // Kept as is, or reset to the default.
        assert_eq!(*lock(&state), vec![1, 2, 3, 4]);
        let _ = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let _guard = state.lock().unwrap();
            panic!("again");
        }));
        assert!(lock_or_reset(&state).is_empty());
        assert!(!state.is_poisoned());
    }
}
