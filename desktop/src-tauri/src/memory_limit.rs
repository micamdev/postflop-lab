//! How much memory a new game may use.

/// Memory a new game may use while games the app keeps take `in_use` bytes (the open
/// solution and its river cache): the available memory, or on macOS (which reports little
/// as available) 70% of the total less `in_use`. No limit if the memory cannot be read.
pub fn limit_from(available: u64, total: u64, in_use: u64, macos: bool) -> u64 {
    if total == 0 {
        u64::MAX
    } else if macos {
        (total / 10 * 7).saturating_sub(in_use)
    } else if available == 0 {
        u64::MAX
    } else {
        available
    }
}

/// [`limit_from`] for this machine.
pub fn memory_limit(in_use: u64) -> u64 {
    let (available, total) = crate::memory();
    limit_from(available, total, in_use, cfg!(target_os = "macos"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1 << 30;

    #[test]
    fn the_available_memory_outside_macos() {
        assert_eq!(limit_from(4 * GB, 16 * GB, 10 * GB, false), 4 * GB);
    }

    #[test]
    fn on_macos_70_percent_of_the_total_less_what_stays_loaded() {
        // macOS reports little memory as available: 70% of 16 GB, less a 10 GB open game.
        assert_eq!(
            limit_from(GB, 16 * GB, 10 * GB, true),
            16 * GB / 10 * 7 - 10 * GB
        );
        assert_eq!(limit_from(GB, 16 * GB, 20 * GB, true), 0);
    }

    #[test]
    fn no_limit_when_the_memory_cannot_be_read() {
        assert_eq!(limit_from(0, 0, 10 * GB, false), u64::MAX);
        assert_eq!(limit_from(0, 0, 10 * GB, true), u64::MAX);
        // Outside macOS, an unread available memory must not refuse every game.
        assert_eq!(limit_from(0, 16 * GB, 0, false), u64::MAX);
    }
}
