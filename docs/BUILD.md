# Build guide

## The two-phase model

- **Prove at build time** (heavy, offline, on a dev box with the Lean toolchain). The Lean 4 kernel in `seal-host` proves the policy-evaluation decision procedure sound.
- **Run at runtime** (small, fast, WASM-friendly). Ship the *extracted* verified evaluator. At runtime you run the proven-correct program; you do not re-run the proof.

The browser demo only needs the runtime evaluator. The prover never ships to the browser. (Live policy-swap — Demo 2 — is the one beat that needs the prover, so it keeps a backend or pre-bakes N already-proven policies.)

## Toolchain (dev box, not the demo host)

Missing on the assistant box; install where `seal-host` is built:

- `rustc` + `cargo` (the seal runtime)
- `wasm-pack` / `wasm-bindgen` (Rust → wasm32)
- `clang` + Emscripten (`emcc`) (Lean → C → WASM path)
- `elan` / `lean` / `lake` (the proof side, already present on the prover box)

## Pipeline

1. In `seal-host`, extract the policy decision procedure (pure function: `request × policy → verdict + proof`) from the Lean kernel via the C backend, **or** expose it through the Rust runtime.
2. Compile to WASM:
   - Rust path: `wasm-pack build --target web` → `pkg/seal_pdp.wasm` + JS bindings.
   - Lean→C→WASM path: `emcc` the generated C with the Lean runtime, export the evaluator entrypoint.
3. Drop the `.wasm` + bindings into `public/`.
4. Replace the seam: in `public/index.html`, swap the stub `sealEvaluate()` for a call into the WASM module. Same signature: `(request, policy) → { verdict, proof }`.
5. Serve `public/` as a static site (GitHub Pages / Vercel). No backend, no AI.

## Recording fixtures (the "filmed" attacks)

1. Run the real frontier agent against the sandbox **offline, once**, with seal in observe mode.
2. Capture each attack: the agent's reasoning trace + the exact tool call it attempts.
3. Save as `fixtures/<id>.json` per `fixtures/schema.json`. Curate the good takes. These are the only AI that ever touches the demo.

The narrative is recorded input. Regenerate all kernel-derived verdict and cert
fields through the shipped browser evaluator with:

```sh
node scripts/regenerate-fixtures.cjs
node scripts/regenerate-fixtures.cjs --check
```
