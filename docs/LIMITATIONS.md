# Limitations — trust boundaries

Canonical copy of the trust-boundary text mirrored in the README. Edit this file
first, then mirror it verbatim; `scripts/claims-drift.mjs` fails the build if the
two diverge. This block adds no claim the README did not already make — it only
locks the existing wording so it cannot drift silently.

## Trust boundaries

<!-- trust-boundaries:begin -->
These are the four explicit places where Seal's proofs stop. They are strengths because the boundaries are known and each is closed by a named, auditable mechanism outside the kernel.

1. Byzantine / non-participating replica — non-bypass proven for replicas that RUN the gate; a replica not running seal is outside the TCB by definition. Closes via: attestation of the sealed core.
2. Egress after allow (P6) — seal mediates the DECISION and records it, not the downstream effect. Closes via: compose with an egress proxy; decision gate by design. (Already in RUST_BRIDGE.md.)
3. Model vs compiled binary — proofs bind the routing core the code delegates to (Ffi.stepImpl → composed kernels), not a byte-for-byte proof of the compiled wasm; strongest in category. Closes via: the binary differential (Lane C), a wasm-vs-Lean-decide oracle.
4. Partition liveness — safety (no double-spend) holds unconditionally under partition; liveness is conditional, inherited from crdt-lean. The correct safety-over-availability tradeoff.
<!-- trust-boundaries:end -->
