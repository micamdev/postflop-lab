//! Reference-spot benchmark with the system allocator (or `custom-alloc`).
//!
//! `cargo bench -p postflop-solver --bench reference_spot [--features custom-alloc]`

mod common;

fn main() {
    let variant = if cfg!(feature = "custom-alloc") {
        "custom-alloc"
    } else {
        "system"
    };
    common::run(variant);
}
