//! Solution library: one `.plab` file per saved solution in a folder.
//!
//! Each file uses the engine's format (`save_data_to_file`). Its memo holds a [`SolutionMeta`]
//! as JSON, so listing the library only reads file headers. The displayed name is the file name.
//! All functions take the library folder as a parameter so they can be tested on a temporary one.

use postflop_solver::*;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

/// File extension of saved solutions.
pub const EXTENSION: &str = "plab";

/// Error returned when the target file already exists and `overwrite` is false. The front end
/// asks for confirmation, then retries with `overwrite = true`.
pub const ERR_EXISTS: &str = "exists";

/// Version of the [`SolutionMeta`] schema.
pub const META_SCHEMA: u32 = 2;

/// Largest metadata JSON a file can hold (the engine reads header fields up to 1 MiB).
pub const MAX_MEMO_BYTES: usize = 1_000_000;

/// zstd level used for saved solutions (fast, good ratio on solver data).
const COMPRESSION_LEVEL: i32 = 3;

/// Metadata saved in the header memo of each solution file.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SolutionMeta {
    pub schema: u32,
    pub app_version: String,
    /// Creation time, in seconds since the Unix epoch.
    pub created_at: u64,
    pub board: Vec<u8>,
    /// OOP and IP ranges, as range strings (for display).
    pub ranges: [String; 2],
    /// The tree configuration as the front end handles it.
    pub tree_config: serde_json::Value,
    /// Saved depth: "river" (complete), "turn" or "flop".
    pub depth: String,
    pub exploitability: f32,
    pub iterations: u32,
    /// "32" (32-bit floats) or "16" (16-bit integers).
    pub precision: String,
    pub summary: SolutionSummary,
    /// Locks the solution was solved with (schema 2; absent from schema 1 files).
    #[serde(default)]
    pub locks: Vec<crate::locks::NodeLock>,
}

/// Root summary, computed at save time so that aggregate reports never need to load the data.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct SolutionSummary {
    /// Average equity of OOP and IP at the root.
    pub equity: [f64; 2],
    /// Average EV of OOP and IP at the root.
    pub ev: [f64; 2],
    /// Player to act at the root ("oop" or "ip").
    pub root_player: String,
    /// Actions available at the root.
    pub root_actions: Vec<String>,
    /// Range-weighted frequency of each root action.
    pub root_frequencies: Vec<f64>,
}

/// One file of the library, readable or not.
#[derive(Serialize, Clone, Debug)]
pub struct LibraryEntry {
    pub name: String,
    pub file_size: u64,
    pub meta: Option<SolutionMeta>,
    pub error: Option<String>,
}

/// The library folder inside the user's documents folder.
pub fn library_dir_in(documents: &Path) -> PathBuf {
    documents.join("Postflop Lab").join("Solutions")
}

/// Turns a user-given name into a valid file name (without extension).
pub fn sanitize_name(name: &str) -> Result<String, String> {
    let replaced: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = replaced.trim().trim_end_matches(['.', ' ']).to_string();
    if trimmed.is_empty() {
        return Err("The name is empty".to_string());
    }
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.contains(&stem.as_str()) {
        return Err(format!("\"{trimmed}\" is reserved by Windows"));
    }
    Ok(trimmed)
}

/// Refuses a name that would reach a file outside the library folder. Names the app would
/// not write itself (a file renamed in the explorer) stay usable.
pub fn check_name(name: &str) -> Result<(), String> {
    let mut components = Path::new(name).components();
    let single = matches!(components.next(), Some(std::path::Component::Normal(_)))
        && components.next().is_none();
    if single && !name.contains(['/', '\\', '\0']) {
        Ok(())
    } else {
        Err(format!("Invalid solution name: \"{name}\""))
    }
}

fn file_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.{EXTENSION}"))
}

fn tmp_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(format!("{name}.{EXTENSION}.tmp"))
}

/// Writes `write` to a temporary file, then renames it to `dest`: `dest` is never partial.
fn write_atomically(
    dir: &Path,
    name: &str,
    write: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<PathBuf, String> {
    let tmp = tmp_path(dir, name);
    let dest = file_path(dir, name);
    if let Err(e) = write(&tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::rename(&tmp, &dest).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed to finish writing the file: {e}")
    })?;
    Ok(dest)
}

/// Counts the bytes written through it and reports the running total.
struct ProgressWriter<W: Write, F: FnMut(u64)> {
    inner: W,
    written: u64,
    progress: F,
}

impl<W: Write, F: FnMut(u64)> Write for ProgressWriter<W, F> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.inner.write(buf)?;
        self.written += n as u64;
        (self.progress)(self.written);
        Ok(n)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// Saves a solved game in the library under `name` (tests use it; the app reports progress).
#[cfg(test)]
pub fn save(
    dir: &Path,
    name: &str,
    game: &PostFlopGame,
    meta: &SolutionMeta,
    overwrite: bool,
) -> Result<String, String> {
    save_with_progress(dir, name, game, meta, overwrite, |_| {})
}

/// Like [`save`], calling `progress` with the number of bytes written so far.
pub fn save_with_progress(
    dir: &Path,
    name: &str,
    game: &PostFlopGame,
    meta: &SolutionMeta,
    overwrite: bool,
    progress: impl FnMut(u64),
) -> Result<String, String> {
    let name = sanitize_name(name)?;
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create the library folder: {e}"))?;
    if file_path(dir, &name).exists() && !overwrite {
        return Err(ERR_EXISTS.to_string());
    }
    let memo = serde_json::to_string(meta).map_err(|e| e.to_string())?;
    if memo.len() > MAX_MEMO_BYTES {
        return Err(
            "The tree configuration is too large to save (over 1 MB of metadata)".to_string(),
        );
    }
    write_atomically(dir, &name, |tmp| {
        let file = File::create(tmp).map_err(|e| format!("Failed to create file: {e}"))?;
        let mut writer = ProgressWriter {
            inner: BufWriter::new(file),
            written: 0,
            progress,
        };
        save_data_into_std_write(game, &memo, &mut writer, Some(COMPRESSION_LEVEL))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to write file: {e}"))
    })?;
    Ok(name)
}

fn read_meta(path: &Path) -> Result<SolutionMeta, String> {
    let header = load_header_from_file::<PostFlopGame, _>(path)?;
    serde_json::from_str(&header.memo).map_err(|e| format!("Unreadable metadata: {e}"))
}

/// Lists the library: newest first, unreadable files last.
pub fn list(dir: &Path) -> Vec<LibraryEntry> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut entries: Vec<LibraryEntry> = read_dir
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == EXTENSION))
        .map(|path| {
            let name = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            match read_meta(&path) {
                Ok(meta) => LibraryEntry {
                    name,
                    file_size,
                    meta: Some(meta),
                    error: None,
                },
                Err(e) => LibraryEntry {
                    name,
                    file_size,
                    meta: None,
                    error: Some(e),
                },
            }
        })
        .collect();
    entries.sort_by(|a, b| match (&a.meta, &b.meta) {
        (Some(ma), Some(mb)) => mb.created_at.cmp(&ma.created_at),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.name.cmp(&b.name),
    });
    entries
}

/// Loads a solution, refusing it if it needs more than `max_memory` bytes.
pub fn load(
    dir: &Path,
    name: &str,
    max_memory: u64,
) -> Result<(PostFlopGame, SolutionMeta), String> {
    check_name(name)?;
    let path = file_path(dir, name);
    let header = load_header_from_file::<PostFlopGame, _>(&path)?;
    if header.estimated_memory_usage > max_memory {
        return Err(format!(
            "Not enough memory: the solution needs {} bytes, {} available",
            header.estimated_memory_usage, max_memory
        ));
    }
    let meta: SolutionMeta =
        serde_json::from_str(&header.memo).map_err(|e| format!("Unreadable metadata: {e}"))?;
    let (game, _) = load_data_from_file::<PostFlopGame, _>(&path, Some(max_memory))?;
    Ok((game, meta))
}

/// Renames a solution; returns the new file name.
pub fn rename(dir: &Path, from: &str, to: &str) -> Result<String, String> {
    check_name(from)?;
    let to = sanitize_name(to)?;
    if to == from {
        return Ok(to);
    }
    let dest = file_path(dir, &to);
    // On Windows a case-only change (spot -> Spot) "exists": it is the same file. On a
    // case-sensitive file system, another file may have exactly the new name.
    let same_file = to.to_lowercase() == from.to_lowercase() && !has_exact_entry(dir, &dest);
    if dest.exists() && !same_file {
        return Err(ERR_EXISTS.to_string());
    }
    fs::rename(file_path(dir, from), dest).map_err(|e| format!("Failed to rename: {e}"))?;
    Ok(to)
}

/// Whether `dir` holds an entry named exactly like `path` (case included).
fn has_exact_entry(dir: &Path, path: &Path) -> bool {
    let Some(wanted) = path.file_name() else {
        return false;
    };
    fs::read_dir(dir).is_ok_and(|entries| {
        entries
            .filter_map(Result::ok)
            .any(|entry| entry.file_name() == wanted)
    })
}

/// Deletes a solution.
pub fn delete(dir: &Path, name: &str) -> Result<(), String> {
    check_name(name)?;
    fs::remove_file(file_path(dir, name)).map_err(|e| format!("Failed to delete: {e}"))
}

/// Deletes the temporary files of saves interrupted by a crash (possibly several GB), if not
/// modified for `max_age`: a recent one may belong to a save in progress.
pub fn remove_stale_tmp(dir: &Path, max_age: std::time::Duration) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };
    for path in read_dir.filter_map(Result::ok).map(|e| e.path()) {
        let is_tmp = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with(&format!(".{EXTENSION}.tmp")));
        let age = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok());
        if is_tmp && age.is_some_and(|age| age >= max_age) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Copies an external `.plab` file into the library, after checking its header.
/// Returns the name it was imported under.
pub fn import(dir: &Path, src: &Path, overwrite: bool) -> Result<String, String> {
    read_meta(src)?;
    let stem = src
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let name = sanitize_name(&stem)?;
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create the library folder: {e}"))?;
    if file_path(dir, &name).exists() && !overwrite {
        return Err(ERR_EXISTS.to_string());
    }
    write_atomically(dir, &name, |tmp| {
        fs::copy(src, tmp)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy: {e}"))
    })?;
    Ok(name)
}

/// Copies a solution out of the library.
pub fn export(dir: &Path, name: &str, dest: &Path) -> Result<(), String> {
    check_name(name)?;
    fs::copy(file_path(dir, name), dest)
        .map(|_| ())
        .map_err(|e| format!("Failed to export: {e}"))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A small river game, solved in a few iterations.
    pub(crate) fn small_game(solve: bool) -> PostFlopGame {
        let card_config = CardConfig {
            range: [
                "AA,KK,QQ,AK".parse().unwrap(),
                "QQ-99,AQ,KQ".parse().unwrap(),
            ],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: card_from_str("2s").unwrap(),
        };
        let tree_config = TreeConfig {
            initial_state: BoardState::River,
            starting_pot: 60,
            effective_stack: 970,
            river_bet_sizes: [
                ("50%", "").try_into().unwrap(),
                ("50%", "").try_into().unwrap(),
            ],
            ..Default::default()
        };
        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();
        game.allocate_memory(false);
        if solve {
            solve_game(&mut game);
        }
        game
    }

    fn solve_game(game: &mut PostFlopGame) {
        for i in 0..50 {
            solve_step(game, i);
        }
        finalize(game);
    }

    pub(crate) fn meta(created_at: u64) -> SolutionMeta {
        SolutionMeta {
            schema: META_SCHEMA,
            app_version: "test".to_string(),
            created_at,
            board: vec![1, 2, 3, 4, 5],
            ranges: ["AA,KK,QQ,AK".to_string(), "QQ-99,AQ,KQ".to_string()],
            tree_config: serde_json::json!({ "startingPot": 60 }),
            depth: "river".to_string(),
            exploitability: 0.1,
            iterations: 50,
            precision: "32".to_string(),
            summary: SolutionSummary::default(),
            locks: Vec::new(),
        }
    }

    fn root_strategy(game: &mut PostFlopGame) -> Vec<f32> {
        game.back_to_root();
        game.cache_normalized_weights();
        game.strategy()
    }

    #[test]
    fn save_then_list_then_load() {
        let dir = tempfile::tempdir().unwrap();
        let mut game = small_game(true);
        save(dir.path(), "spot", &game, &meta(10), false).unwrap();

        let entries = list(dir.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "spot");
        assert_eq!(entries[0].meta.as_ref(), Some(&meta(10)));
        assert!(entries[0].file_size > 0);

        let (mut loaded, loaded_meta) = load(dir.path(), "spot", u64::MAX).unwrap();
        assert_eq!(loaded_meta, meta(10));
        assert_eq!(loaded.private_cards(0), game.private_cards(0));
        assert_eq!(root_strategy(&mut loaded), root_strategy(&mut game));
    }

    #[test]
    fn save_refuses_existing_without_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let game = small_game(true);
        save(dir.path(), "spot", &game, &meta(1), false).unwrap();
        assert_eq!(
            save(dir.path(), "spot", &game, &meta(2), false).unwrap_err(),
            ERR_EXISTS
        );
        save(dir.path(), "spot", &game, &meta(2), true).unwrap();
        assert_eq!(list(dir.path())[0].meta.as_ref().unwrap().created_at, 2);
    }

    #[test]
    fn no_partial_file_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let unsolved = small_game(false);
        assert!(save(dir.path(), "spot", &unsolved, &meta(1), false).is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn list_marks_unreadable_files() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), "good", &small_game(true), &meta(1), false).unwrap();
        fs::write(dir.path().join("bad.plab"), [7u8; 64]).unwrap();
        save_data_to_file(
            &small_game(true),
            "not json",
            dir.path().join("old.plab"),
            None,
        )
        .unwrap();

        let entries = list(dir.path());
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "good");
        assert!(entries[0].error.is_none());
        let unreadable: Vec<_> = entries[1..].iter().map(|e| e.name.as_str()).collect();
        assert_eq!(unreadable, ["bad", "old"]);
        assert!(entries[1..]
            .iter()
            .all(|e| e.meta.is_none() && e.error.is_some()));
    }

    #[test]
    fn list_ignores_tmp_and_other_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("spot.plab.tmp"), [0u8; 8]).unwrap();
        fs::write(dir.path().join("notes.txt"), "x").unwrap();
        assert!(list(dir.path()).is_empty());
        assert!(list(&dir.path().join("missing")).is_empty());
    }

    #[test]
    fn sanitize_name_cases() {
        assert_eq!(sanitize_name("K/T:6?").unwrap(), "K_T_6_");
        assert_eq!(sanitize_name("  Kh Td 6d  ").unwrap(), "Kh Td 6d");
        assert_eq!(sanitize_name("spot. ").unwrap(), "spot");
        assert!(sanitize_name("  ").is_err());
        assert!(sanitize_name("CON").is_err());
        assert!(sanitize_name("nul.txt").is_err());
    }

    #[test]
    fn rename_and_delete() {
        let dir = tempfile::tempdir().unwrap();
        let game = small_game(true);
        save(dir.path(), "a", &game, &meta(1), false).unwrap();
        save(dir.path(), "b", &game, &meta(2), false).unwrap();
        assert_eq!(rename(dir.path(), "a", "b").unwrap_err(), ERR_EXISTS);
        rename(dir.path(), "a", "c").unwrap();
        delete(dir.path(), "b").unwrap();
        let names: Vec<_> = list(dir.path()).into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["c"]);
    }

    #[test]
    fn import_validates_header() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let foreign = outside.path().join("foreign.plab");
        fs::write(&foreign, [9u8; 64]).unwrap();
        assert!(import(dir.path(), &foreign, false).is_err());
        assert!(list(dir.path()).is_empty());

        save(outside.path(), "shared", &small_game(true), &meta(3), false).unwrap();
        let src = outside.path().join("shared.plab");
        assert_eq!(import(dir.path(), &src, false).unwrap(), "shared");
        assert_eq!(import(dir.path(), &src, false).unwrap_err(), ERR_EXISTS);

        let exported = outside.path().join("copy.plab");
        export(dir.path(), "shared", &exported).unwrap();
        assert_eq!(read_meta(&exported).unwrap(), meta(3));
    }

    #[test]
    fn load_refuses_when_too_big() {
        let dir = tempfile::tempdir().unwrap();
        let game = small_game(true);
        save(dir.path(), "spot", &game, &meta(1), false).unwrap();
        let err = load(dir.path(), "spot", 1).err().unwrap();
        assert!(
            err.contains(&game.target_memory_usage().to_string()),
            "{err}"
        );
    }
}

#[cfg(test)]
mod schema_tests {
    use super::*;

    #[test]
    fn v1_metadata_still_loads() {
        let mut value = serde_json::to_value(tests::meta(1)).unwrap();
        value.as_object_mut().unwrap().remove("locks");
        value["schema"] = serde_json::json!(1);
        let meta: SolutionMeta = serde_json::from_value(value).unwrap();
        assert!(meta.locks.is_empty());
    }
}

#[cfg(test)]
mod followup_tests {
    use super::tests::{meta, small_game};
    use super::*;
    use std::time::Duration;

    #[test]
    fn save_and_rename_return_the_file_name() {
        let dir = tempfile::tempdir().unwrap();
        let game = small_game(true);
        let name = save(dir.path(), "K/T 6", &game, &meta(1), false).unwrap();
        assert_eq!(name, "K_T 6");
        assert_eq!(rename(dir.path(), "K_T 6", "a:b").unwrap(), "a_b");
        assert_eq!(list(dir.path())[0].name, "a_b");
    }

    #[test]
    fn case_only_rename() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), "spot", &small_game(true), &meta(1), false).unwrap();
        assert_eq!(rename(dir.path(), "spot", "Spot").unwrap(), "Spot");
        let names: Vec<_> = list(dir.path()).into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Spot"]);
    }

    #[test]
    fn stale_tmp_files_are_removed() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("old.plab.tmp"), [0u8; 8]).unwrap();
        fs::write(dir.path().join("notes.txt"), "x").unwrap();
        // A recent temporary file may belong to a save in progress.
        remove_stale_tmp(dir.path(), Duration::from_secs(3600));
        assert!(dir.path().join("old.plab.tmp").exists());
        remove_stale_tmp(dir.path(), Duration::ZERO);
        assert!(!dir.path().join("old.plab.tmp").exists());
        assert!(dir.path().join("notes.txt").exists());
        remove_stale_tmp(&dir.path().join("missing"), Duration::ZERO);
    }

    #[test]
    fn too_large_metadata_is_refused_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        let mut big = meta(1);
        big.tree_config = serde_json::Value::String("x".repeat(MAX_MEMO_BYTES + 1));
        let err = save(dir.path(), "spot", &small_game(true), &big, false).unwrap_err();
        assert!(err.contains("too large"), "{err}");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn invalid_names_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        save(dir.path(), "spot", &small_game(true), &meta(1), false).unwrap();
        for bad in ["../spot", "a/b", r"a\b", "", "..", "."] {
            assert!(load(dir.path(), bad, u64::MAX).is_err(), "load {bad}");
            assert!(delete(dir.path(), bad).is_err(), "delete {bad}");
            assert!(rename(dir.path(), bad, "x").is_err(), "rename {bad}");
            assert!(
                export(dir.path(), bad, &outside.path().join("x.plab")).is_err(),
                "export {bad}"
            );
        }
        assert_eq!(list(dir.path()).len(), 1);
    }
}

#[cfg(test)]
mod review_tests {
    use super::tests::{meta, small_game};
    use super::*;

    #[test]
    fn files_named_outside_the_app_stay_usable() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        save(dir.path(), "spot", &small_game(true), &meta(1), false).unwrap();
        // Renamed in the file explorer: a name the app would not write itself.
        fs::rename(dir.path().join("spot.plab"), dir.path().join("spot .plab")).unwrap();
        assert_eq!(list(dir.path())[0].name, "spot ");
        assert!(load(dir.path(), "spot ", u64::MAX).is_ok());
        export(dir.path(), "spot ", &outside.path().join("x.plab")).unwrap();
        assert_eq!(rename(dir.path(), "spot ", "fixed").unwrap(), "fixed");
        delete(dir.path(), "fixed").unwrap();
        assert!(list(dir.path()).is_empty());
    }

    #[test]
    fn case_only_rename_never_overwrites_another_file() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), "spot", &small_game(true), &meta(1), false).unwrap();
        if dir.path().join("SPOT.plab").exists() {
            return; // Case-insensitive file system: two such files cannot coexist.
        }
        save(dir.path(), "Spot", &small_game(true), &meta(2), false).unwrap();
        assert_eq!(rename(dir.path(), "spot", "Spot").unwrap_err(), ERR_EXISTS);
        assert_eq!(list(dir.path()).len(), 2);
    }
}
