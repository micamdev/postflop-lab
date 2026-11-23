// [File format]
// The file consists of a header and a body. The header is as follows:
//  - Magic number (4 bytes): 90 57 f1 09
//  - Version number (1 byte): 1
//  - Compression type (1 byte): 0 (none), 1 (zstd)
//  - Data type (1 byte): 0 (game), 1 (bunching)
//  - Estimated memory usage (`VarIntEncoding`)
//  - Memo string
//
// `VarIntEncoding`: https://github.com/bincode-org/bincode/blob/trunk/docs/spec.md#varintencoding

use crate::bunching::*;
use crate::game::*;
use crate::interface::*;
use bincode::{Decode, Encode};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

const MAGIC: u32 = 0x09f15790;
const VERSION: u8 = 1;

#[doc(hidden)]
pub enum DataType {
    Game = 0,
    Bunching = 1,
}

/// A trait for data that can be saved into a file.
pub trait FileData: Decode<()> + Encode {
    #[doc(hidden)]
    fn data_type() -> DataType;
    #[doc(hidden)]
    fn is_ready_to_save(&self) -> bool;
    #[doc(hidden)]
    fn estimated_memory_usage(&self) -> u64;
}

fn encode_into_std_write<E: Encode, W: Write>(
    val: E,
    writer: &mut W,
    err_msg: &str,
) -> Result<usize, String> {
    bincode::encode_into_std_write(val, writer, bincode::config::standard())
        .map_err(|e| format!("{}: {}", err_msg, e))
}

/// Saves data into a standard writer.
///
/// This function serializes the `data` into the `writer`.
/// This is useful if you want to save the data into a custom writer like `Vec<u8>`, but if you want
/// to save the data into a file, use [`save_data_to_file`] instead.
///
/// # Arguments
///
/// - `data`: The data to be saved, which is either a [`PostFlopGame`] or a [`BunchingData`].
/// - `memo`: A memo string to be saved with the data.
/// - `writer`: The writer to write the data into.
/// - `compression_level`: The zstd compression level to use. If `None`, no compression is used.
///   `Some(level)` can only be specified if the `zstd` feature is enabled.
pub fn save_data_into_std_write<T: FileData, W: Write>(
    data: &T,
    memo: &str,
    writer: &mut W,
    compression_level: Option<i32>,
) -> Result<(), String> {
    if !data.is_ready_to_save() {
        return Err("Data is not ready to save".to_string());
    }

    #[cfg(not(feature = "zstd"))]
    if compression_level.is_some() {
        return Err("Compression is not supported".to_string());
    }

    encode_into_std_write(MAGIC, writer, "Failed to write magic number")?;
    encode_into_std_write(VERSION, writer, "Failed to write version number")?;

    let compression_type = compression_level.is_some() as u8;
    encode_into_std_write(compression_type, writer, "Failed to write compression type")?;

    encode_into_std_write(T::data_type() as u8, writer, "Failed to write data type")?;
    encode_into_std_write(
        data.estimated_memory_usage(),
        writer,
        "Failed to write memory usage",
    )?;

    encode_into_std_write(memo, writer, "Failed to write memo")?;

    if compression_level.is_none() {
        encode_into_std_write(data, writer, "Failed to write data")?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush writer: {}", e))?;
    }

    #[cfg(feature = "zstd")]
    if let Some(compression_level) = compression_level {
        let mut zstd_encoder = zstd::stream::Encoder::new(writer, compression_level)
            .map_err(|e| format!("Failed to create zstd encoder: {}", e))?;

        #[cfg(feature = "rayon")]
        zstd_encoder
            .multithread(rayon::current_num_threads() as u32)
            .map_err(|e| format!("Failed to enable multithreaded zstd encoder: {}", e))?;

        encode_into_std_write(data, &mut zstd_encoder, "Failed to write data")?;
        zstd_encoder
            .finish()
            .map_err(|e| format!("Failed to finish zstd encoder: {}", e))?
            .flush()
            .map_err(|e| format!("Failed to flush writer: {}", e))?;
    }

    Ok(())
}

/// Saves data into a file.
///
/// This function serializes the `data` into a file specified by `path`.
/// If the file already exists, it will be overwritten.
///
/// # Arguments
///
/// - `data`: The data to be saved, which is either a [`PostFlopGame`] or a [`BunchingData`].
/// - `memo`: A memo string to be saved with the data.
/// - `path`: The path to the file to save.
/// - `compression_level`: The zstd compression level to use. If `None`, no compression is used.
///   `Some(level)` can only be specified if the `zstd` feature is enabled.
pub fn save_data_to_file<T: FileData, P: AsRef<Path>>(
    data: &T,
    memo: &str,
    path: P,
    compression_level: Option<i32>,
) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    let mut writer = BufWriter::new(file);
    save_data_into_std_write(data, memo, &mut writer, compression_level)
}

fn decode_from_std_read<D: Decode<()>, R: Read>(
    reader: &mut R,
    err_msg: &str,
) -> Result<D, String> {
    bincode::decode_from_std_read(reader, bincode::config::standard())
        .map_err(|e| format!("{}: {}", err_msg, e))
}

/// Maximum size of a header field, the memo included. A corrupt or foreign file cannot make the
/// header decoder allocate more than this. (The app's memo holds the node locks: about 100 KB
/// each.)
pub const HEADER_FIELD_LIMIT: usize = 64 << 20;

fn decode_header_field<D: Decode<()>, R: Read>(reader: &mut R, err_msg: &str) -> Result<D, String> {
    let config = bincode::config::standard().with_limit::<HEADER_FIELD_LIMIT>();
    bincode::decode_from_std_read(reader, config).map_err(|e| format!("{}: {}", err_msg, e))
}

/// The header of a saved file: everything before the data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileHeader {
    /// Whether the data is compressed with zstd.
    pub compression: bool,
    /// The memory needed to load the data (in bytes).
    pub estimated_memory_usage: u64,
    /// The memo string saved with the data.
    pub memo: String,
}

/// Reads and validates the header; the reader is left at the start of the data.
fn read_header<T: FileData, R: Read>(
    reader: &mut R,
    max_memory_usage: Option<u64>,
) -> Result<FileHeader, String> {
    let magic: u32 = decode_header_field(reader, "Failed to read magic number")?;
    if magic != MAGIC {
        return Err("Magic number is invalid".to_string());
    }

    let version: u8 = decode_header_field(reader, "Failed to read version number")?;
    if version != VERSION {
        return Err("Version number is invalid".to_string());
    }

    let compression_type: u8 = decode_header_field(reader, "Failed to read compression type")?;
    if compression_type > 1 {
        return Err("Compression type is invalid".to_string());
    }

    let data_type: u8 = decode_header_field(reader, "Failed to read data type")?;
    if data_type != T::data_type() as u8 {
        return Err("Data type is invalid".to_string());
    }

    let estimated_memory_usage: u64 = decode_header_field(reader, "Failed to read memory usage")?;
    if let Some(max_memory_usage) = max_memory_usage {
        if estimated_memory_usage > max_memory_usage {
            return Err("Estimated memory usage is too large".to_string());
        }
    }

    let memo: String = decode_header_field(reader, "Failed to read memo")?;

    Ok(FileHeader {
        compression: compression_type == 1,
        estimated_memory_usage,
        memo,
    })
}

/// Reads the header of a saved file from a standard reader, without reading the data.
///
/// This is cheap even for very large files: use it to list saved files.
pub fn load_header_from_std_read<T: FileData, R: Read>(
    reader: &mut R,
) -> Result<FileHeader, String> {
    read_header::<T, R>(reader, None)
}

/// Reads the header of a saved file, without reading the data.
///
/// This is cheap even for very large files: use it to list saved files.
pub fn load_header_from_file<T: FileData, P: AsRef<Path>>(path: P) -> Result<FileHeader, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);
    load_header_from_std_read::<T, _>(&mut reader)
}

/// Loads data from a standard reader.
///
/// This function deserializes the data from the `reader`.
/// This is useful if you want to load the data from a custom reader like `Vec<u8>`, but if you want
/// to load the data from a file, use [`load_data_from_file`] instead.
///
/// # Arguments
///
/// - `reader`: The reader to read the data from.
/// - `max_memory_usage`: The maximum memory usage allowed for the data (in bytes). If `None`, no
///   limit is set. If the estimated memory usage exceeds this value, `Err` is returned.
///
/// # Returns
///
/// A tuple of the deserialized data (either a [`PostFlopGame`] or a [`BunchingData`]) and the memo
/// string.
pub fn load_data_from_std_read<T: FileData, R: Read>(
    reader: &mut R,
    max_memory_usage: Option<u64>,
) -> Result<(T, String), String> {
    let FileHeader {
        compression, memo, ..
    } = read_header::<T, R>(reader, max_memory_usage)?;

    #[cfg(not(feature = "zstd"))]
    if compression {
        return Err("Compression is not supported".to_string());
    }

    // The header estimate is only a number stated by the file: the data is decoded with a
    // limit derived from `max_memory_usage` too, so a corrupt length inside the data cannot
    // trigger an allocation larger than the memory the caller allows.
    #[cfg(not(feature = "zstd"))]
    let data: T = decode_bounded(reader, max_memory_usage, "Failed to read data")?;
    #[cfg(feature = "zstd")]
    let data: T = if !compression {
        decode_bounded(reader, max_memory_usage, "Failed to read data")?
    } else {
        let mut zstd_decoder = zstd::stream::Decoder::new(reader)
            .map_err(|e| format!("Failed to create zstd decoder: {}", e))?;
        decode_bounded(&mut zstd_decoder, max_memory_usage, "Failed to read data")?
    };

    Ok((data, memo))
}

/// Exponents of the bincode limits `decode_bounded` can use. Bincode takes the limit as a const
/// parameter, so each one is a separate copy of the decoder: a few coarse steps, not every power
/// of two. Beyond the last one (or on 32-bit targets), the address space is the limit.
#[cfg(target_pointer_width = "64")]
const DECODE_LIMIT_EXPS: [u32; 5] = [27, 30, 33, 36, 39];
#[cfg(not(target_pointer_width = "64"))]
const DECODE_LIMIT_EXPS: [u32; 2] = [27, 30];

/// The smallest decode limit (as an exponent of two) of at least twice `max_memory_usage`;
/// `None` means no limit.
fn decode_limit_exp(max_memory_usage: u64) -> Option<u32> {
    let wanted = max_memory_usage.saturating_mul(2);
    DECODE_LIMIT_EXPS
        .into_iter()
        .find(|&exp| (1u64 << exp) >= wanted)
}

/// Decodes with a bincode limit of at least twice `max_memory_usage` (see `decode_limit_exp`);
/// without `max_memory_usage`, no limit.
fn decode_bounded<D: Decode<()>, R: Read>(
    reader: &mut R,
    max_memory_usage: Option<u64>,
    err_msg: &str,
) -> Result<D, String> {
    let Some(max_memory_usage) = max_memory_usage else {
        return decode_from_std_read(reader, err_msg);
    };
    let standard = bincode::config::standard();
    let result = match decode_limit_exp(max_memory_usage) {
        Some(27) => bincode::decode_from_std_read(reader, standard.with_limit::<{ 1 << 27 }>()),
        Some(30) => bincode::decode_from_std_read(reader, standard.with_limit::<{ 1 << 30 }>()),
        #[cfg(target_pointer_width = "64")]
        Some(33) => bincode::decode_from_std_read(reader, standard.with_limit::<{ 1 << 33 }>()),
        #[cfg(target_pointer_width = "64")]
        Some(36) => bincode::decode_from_std_read(reader, standard.with_limit::<{ 1 << 36 }>()),
        #[cfg(target_pointer_width = "64")]
        Some(39) => bincode::decode_from_std_read(reader, standard.with_limit::<{ 1 << 39 }>()),
        _ => bincode::decode_from_std_read(reader, standard),
    };
    result.map_err(|e| format!("{}: {}", err_msg, e))
}

/// Loads data from a file.
///
/// This function deserializes the data from a file specified by `path`.
///
/// # Arguments
///
/// - `path`: The path to the file to load.
/// - `max_memory_usage`: The maximum memory usage allowed for the data (in bytes). If `None`, no
///   limit is set. If the estimated memory usage exceeds this value, `Err` is returned.
///
/// # Returns
///
/// A tuple of the deserialized data (either a [`PostFlopGame`] or a [`BunchingData`]) and the memo
/// string.
pub fn load_data_from_file<T: FileData, P: AsRef<Path>>(
    path: P,
    max_memory_usage: Option<u64>,
) -> Result<(T, String), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);
    load_data_from_std_read(&mut reader, max_memory_usage)
}

impl FileData for PostFlopGame {
    fn data_type() -> DataType {
        DataType::Game
    }

    fn is_ready_to_save(&self) -> bool {
        self.is_solved()
    }

    fn estimated_memory_usage(&self) -> u64 {
        self.target_memory_usage()
    }
}

impl FileData for BunchingData {
    fn data_type() -> DataType {
        DataType::Bunching
    }

    fn is_ready_to_save(&self) -> bool {
        self.is_ready()
    }

    fn estimated_memory_usage(&self) -> u64 {
        self.memory_usage()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action_tree::*;
    use crate::card::*;
    use crate::range::*;
    use crate::utility::*;

    #[test]
    fn save_and_load_file() {
        let card_config = CardConfig {
            range: [Range::ones(); 2],
            flop: flop_from_str("Td9d6h").unwrap(),
            ..Default::default()
        };

        let tree_config = TreeConfig {
            starting_pot: 60,
            effective_stack: 970,
            flop_bet_sizes: [("50%", "").try_into().unwrap(), Default::default()],
            turn_bet_sizes: [("50%", "").try_into().unwrap(), Default::default()],
            ..Default::default()
        };

        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();

        game.allocate_memory(false);
        finalize(&mut game);

        // save
        save_data_to_file(&game, "", "tmpfile.flop", None).unwrap();

        // load
        let mut game: PostFlopGame = load_data_from_file("tmpfile.flop", None).unwrap().0;

        // save (turn)
        game.set_target_storage_mode(BoardState::Turn).unwrap();
        save_data_to_file(&game, "", "tmpfile.flop", None).unwrap();

        // load (turn)
        let mut game: PostFlopGame = load_data_from_file("tmpfile.flop", None).unwrap().0;

        // save (flop)
        game.set_target_storage_mode(BoardState::Flop).unwrap();
        save_data_to_file(&game, "", "tmpfile.flop", None).unwrap();

        // load (flop)
        let mut game: PostFlopGame = load_data_from_file("tmpfile.flop", None).unwrap().0;

        // remove tmpfile
        std::fs::remove_file("tmpfile.flop").unwrap();

        game.cache_normalized_weights();
        let weights_oop = game.normalized_weights(0);
        let weights_ip = game.normalized_weights(1);
        let root_equity_oop = compute_average(&game.equity(0), weights_oop);
        let root_equity_ip = compute_average(&game.equity(1), weights_ip);
        let root_ev_oop = compute_average(&game.expected_values(0), weights_oop);
        let root_ev_ip = compute_average(&game.expected_values(1), weights_ip);

        assert!((root_equity_oop - 0.5).abs() < 1e-5);
        assert!((root_equity_ip - 0.5).abs() < 1e-5);
        assert!((root_ev_oop - 45.0).abs() < 1e-4);
        assert!((root_ev_ip - 15.0).abs() < 1e-4);
    }

    #[test]
    #[cfg(feature = "zstd")]
    fn save_and_load_file_compressed() {
        let card_config = CardConfig {
            range: [Range::ones(); 2],
            flop: flop_from_str("Td9d6h").unwrap(),
            ..Default::default()
        };

        let tree_config = TreeConfig {
            starting_pot: 60,
            effective_stack: 970,
            flop_bet_sizes: [("50%", "").try_into().unwrap(), Default::default()],
            turn_bet_sizes: [("50%", "").try_into().unwrap(), Default::default()],
            ..Default::default()
        };

        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();

        game.allocate_memory(false);
        finalize(&mut game);

        // save
        save_data_to_file(&game, "", "tmpfile-zstd.flop", Some(3)).unwrap();

        // load
        let mut game: PostFlopGame = load_data_from_file("tmpfile-zstd.flop", None).unwrap().0;

        // remove tmpfile
        std::fs::remove_file("tmpfile-zstd.flop").unwrap();

        game.cache_normalized_weights();
        let weights_oop = game.normalized_weights(0);
        let weights_ip = game.normalized_weights(1);
        let root_equity_oop = compute_average(&game.equity(0), weights_oop);
        let root_equity_ip = compute_average(&game.equity(1), weights_ip);
        let root_ev_oop = compute_average(&game.expected_values(0), weights_oop);
        let root_ev_ip = compute_average(&game.expected_values(1), weights_ip);

        assert!((root_equity_oop - 0.5).abs() < 1e-5);
        assert!((root_equity_ip - 0.5).abs() < 1e-5);
        assert!((root_ev_oop - 45.0).abs() < 1e-4);
        assert!((root_ev_ip - 15.0).abs() < 1e-4);
    }

    fn tmp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("postflop-lab-test-{}-{}", std::process::id(), name))
    }

    fn small_solved_game() -> PostFlopGame {
        let card_config = CardConfig {
            range: [Range::ones(); 2],
            flop: flop_from_str("Td9d6h").unwrap(),
            turn: card_from_str("Qc").unwrap(),
            river: card_from_str("2s").unwrap(),
        };
        let tree_config = TreeConfig {
            initial_state: BoardState::River,
            starting_pot: 60,
            effective_stack: 970,
            river_bet_sizes: [("50%", "").try_into().unwrap(), Default::default()],
            ..Default::default()
        };
        let action_tree = ActionTree::new(tree_config).unwrap();
        let mut game = PostFlopGame::with_config(card_config, action_tree).unwrap();
        game.allocate_memory(false);
        finalize(&mut game);
        game
    }

    #[test]
    fn header_roundtrip() {
        let game = small_solved_game();
        let path = tmp_path("header.plab");
        save_data_to_file(&game, "{\"k\":1}", &path, None).unwrap();
        let header = load_header_from_file::<PostFlopGame, _>(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert_eq!(header.memo, "{\"k\":1}");
        assert!(!header.compression);
        assert_eq!(header.estimated_memory_usage, game.target_memory_usage());
    }

    #[test]
    #[cfg(feature = "zstd")]
    fn header_roundtrip_compressed() {
        let game = small_solved_game();
        let path = tmp_path("header-zstd.plab");
        save_data_to_file(&game, "memo", &path, Some(3)).unwrap();
        let header = load_header_from_file::<PostFlopGame, _>(&path).unwrap();
        let (_, memo) = load_data_from_file::<PostFlopGame, _>(&path, None).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(header.compression);
        assert_eq!(header.memo, "memo");
        assert_eq!(memo, "memo");
    }

    #[test]
    fn header_rejects_foreign_file() {
        let path = tmp_path("foreign.plab");
        let bytes: Vec<u8> = (0..100u32).map(|i| (i * 37 + 11) as u8).collect();
        std::fs::write(&path, bytes).unwrap();
        let result = load_header_from_file::<PostFlopGame, _>(&path);
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_err());
    }

    #[test]
    fn header_rejects_truncated() {
        let game = small_solved_game();
        let path = tmp_path("truncated.plab");
        save_data_to_file(
            &game,
            "a memo long enough to be cut in the middle",
            &path,
            None,
        )
        .unwrap();
        let bytes = std::fs::read(&path).unwrap();
        std::fs::write(&path, &bytes[..20]).unwrap();
        let result = load_header_from_file::<PostFlopGame, _>(&path);
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_err());
    }

    #[test]
    fn memo_length_is_bounded() {
        // Valid header fields, then a memo claiming 4 GiB.
        let mut bytes = Vec::new();
        let config = bincode::config::standard();
        bincode::encode_into_std_write(MAGIC, &mut bytes, config).unwrap();
        bincode::encode_into_std_write(VERSION, &mut bytes, config).unwrap();
        bincode::encode_into_std_write(0u8, &mut bytes, config).unwrap();
        bincode::encode_into_std_write(DataType::Game as u8, &mut bytes, config).unwrap();
        bincode::encode_into_std_write(0u64, &mut bytes, config).unwrap();
        bincode::encode_into_std_write(1u64 << 32, &mut bytes, config).unwrap();
        let path = tmp_path("huge-memo.plab");
        std::fs::write(&path, bytes).unwrap();
        let result = load_header_from_file::<PostFlopGame, _>(&path);
        std::fs::remove_file(&path).unwrap();
        let err = result.unwrap_err();
        assert!(err.contains("memo"), "{err}");
        assert!(err.contains("LimitExceeded"), "{err}");
    }

    #[test]
    fn bunching_flag() {
        let game = small_solved_game();
        assert!(!game.is_bunching_enabled());
    }

    #[test]
    fn bounded_decode_rejects_huge_length() {
        // A byte vector claiming 1 TiB, as a corrupt storage length would.
        let mut bytes = Vec::new();
        bincode::encode_into_std_write(1u64 << 40, &mut bytes, bincode::config::standard())
            .unwrap();
        let result: Result<Vec<u8>, String> =
            decode_bounded(&mut bytes.as_slice(), Some(1 << 20), "Failed to read data");
        let err = result.unwrap_err();
        assert!(err.contains("LimitExceeded"), "{err}");
    }

    #[test]
    fn load_with_estimated_limit_succeeds() {
        // The body limit derived from max_memory_usage must not reject a valid file.
        let game = small_solved_game();
        let path = tmp_path("exact-limit.plab");
        save_data_to_file(&game, "", &path, None).unwrap();
        let limit = game.target_memory_usage();
        let result = load_data_from_file::<PostFlopGame, _>(&path, Some(limit));
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_ok(), "{:?}", result.err());
    }

    #[test]
    fn decode_limit_is_a_coarse_step_at_least_twice_the_budget() {
        assert_eq!(decode_limit_exp(0), Some(27));
        assert_eq!(decode_limit_exp(1 << 26), Some(27));
        assert_eq!(decode_limit_exp((1 << 26) + 1), Some(30));
        if cfg!(target_pointer_width = "64") {
            assert_eq!(decode_limit_exp(3 << 30), Some(33));
            assert_eq!(decode_limit_exp(1 << 38), Some(39));
            assert_eq!(decode_limit_exp((1 << 38) + 1), None);
        }
        assert_eq!(decode_limit_exp(u64::MAX), None);
    }
}
