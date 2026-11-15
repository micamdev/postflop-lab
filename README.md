# Postflop Lab

Open-source postflop GTO solver for desktop, focused on study workflows:
saved solutions, node locking and a modern interface.

## Repository layout

- `desktop/` — desktop app (Tauri + Vue)
- `engine/` — solver engine (Rust)

## Development

Prerequisites (Windows): [rustup](https://rustup.rs/), Visual Studio Build
Tools with the "Desktop development with C++" workload, Node.js 22+.
The Rust version is pinned in `rust-toolchain.toml` and installed by rustup
automatically.

```sh
# The Tauri build embeds desktop/dist: build the front end before any cargo build.
cd desktop
npm ci
npm run build

# Run the app in development mode
npm run tauri dev

# Rust checks (from the repository root)
cargo fmt --all --check
cargo clippy --workspace --all-targets
cargo test --workspace --release

# Allocator benchmark (see docs/benchmarks/allocateur.md)
cargo bench -p postflop-solver --bench reference_spot
```

## Credits

Postflop Lab is a continuation of the work of Wataru Inariba (b-inary):

- [desktop-postflop](https://github.com/b-inary/desktop-postflop) — imported in `desktop/`
- [postflop-solver](https://github.com/b-inary/postflop-solver) — imported in `engine/`

Both projects' full git histories are preserved in this repository.

## License

[AGPL-3.0-or-later](LICENSE), as the original projects.
