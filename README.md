# Postflop Lab

Open-source postflop GTO solver for desktop, focused on study workflows:
saved solutions, node locking and a modern interface.

## Repository layout

- `desktop/` — desktop app (Tauri + Vue)
- `engine/` — solver engine (Rust)

## Development

Prerequisites (Windows): [rustup](https://rustup.rs/), Visual Studio Build
Tools with the "Desktop development with C++" workload, Node.js 24+, pnpm
(`corepack enable` installs the version pinned in `desktop/package.json`).
The Rust version is pinned in `rust-toolchain.toml` and installed by rustup
automatically.

```sh
# The Tauri build embeds desktop/dist: build the front end before any cargo build.
cd desktop
pnpm install
pnpm build

# Run the app in development mode
pnpm tauri dev

# Installers (pnpm tauri build) are signed for the in-app updater: set
# TAURI_SIGNING_PRIVATE_KEY (the key's content) and TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# first. The release workflow reads them from the repository secrets. Unsigned local build:
# pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'

# End-to-end smoke test, before a release (Windows): starts the app in a temporary
# library, then setup, solve, navigation, save and load. Exit code 0 when it passes.
# Close any running `pnpm tauri dev` first (ports 5392 and 9223, same executable). The
# first run compiles for a few minutes. On failure, the printed temporary folder keeps
# app.log and failure.png.
pnpm e2e

# Rust checks (from the repository root)
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
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

## Website

`site/` is the landing page at https://postflop.mica.app (Astro, deployed to Cloudflare
Workers): `cd site && pnpm install && pnpm dev`, then `pnpm run deploy` to publish.
The hero's strategy grid is real solver output (`site/src/data/strategy.json`).
