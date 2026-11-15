//! Reference-spot benchmark with mimalloc as the global allocator.
//!
//! `cargo bench -p postflop-solver --bench reference_spot_mimalloc`

mod common;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn main() {
    let variant = if cfg!(feature = "custom-alloc") {
        "mimalloc+custom-alloc"
    } else {
        "mimalloc+system"
    };
    common::run(variant);
}
