# Limitations — trust boundaries

Canonical copy of the trust-boundary text mirrored in the README. Edit this file
first, then mirror it verbatim; `scripts/claims-drift.mjs` fails the build if the
two diverge. This block adds no claim the README did not already make — it only
locks the existing wording so it cannot drift silently.

## Trust boundaries

<!-- trust-boundaries:begin -->
These are the four explicit places where Seal's proofs stop. They are strengths because the boundaries are known and each has a named closure path outside the kernel — closed where stated, still open where stated.

1. Byzantine / non-participating replica — non-bypass proven for replicas that RUN the gate; a replica not running seal is outside the TCB by definition. Named closure path (not yet implemented): attestation of the sealed core.
2. Egress after allow (P6) — seal mediates the DECISION and records it, not the downstream effect. Closes via: compose with an egress proxy; decision gate by design. (Already in seal-host's RUST_BRIDGE.md.)
3. Model vs compiled binary — proofs bind the routing core the code delegates to (Ffi.stepImpl → composed kernels), not a byte-for-byte proof of the compiled wasm. Lane C runs a wasm-vs-interpreted-Lean differential in seal-host CI over a fixed corpus; it is evidence over that corpus, not a universal binary-equals-model proof.
4. Partition liveness — safety (no double-spend) holds unconditionally under partition; liveness is conditional, inherited from crdt-lean. The correct safety-over-availability tradeoff.
<!-- trust-boundaries:end -->
