# Build guide

## The two-phase model

- **Prove at build time** (heavy, offline, on a dev box with the Lean toolchain). The Lean 4 kernel in `seal-host` proves the policy-evaluation decision procedure sound.
- **Run at runtime** (small, fast, WASM-friendly). Ship the *extracted* verified evaluator. At runtime you run the proven-correct program; you do not re-run the proof.

The browser demo only needs the runtime evaluator. The prover never ships to the browser. (Live policy-swap — Demo 2 — is the one beat that needs the prover, so it keeps a backend or pre-bakes N already-proven policies.)

## Toolchain (dev box, not the demo host)

Install where `seal-host` is built (never needed to run this demo):

- `clang` + Emscripten (`emcc`) — the Lean → C → WASM path that produces the shipped evaluator
- `elan` / `lean` / `lake` — the proof side
- `rustc` + `cargo` — only for the native Target B binary, not for the WASM build

## Pipeline (the one that ships)

1. In the private `seal-host` repo, `wasm-spike/build_closure.sh` then `build_wasm.sh`
   compile the Lean kernel via the C backend with Emscripten, producing
   `build-core/seal.{js,wasm}` (see `seal-host/wasm-spike/RESUME.md`).
2. Copy both into `public/wasm/`. `public/seal-wasm.js` pins the wasm's SHA-256 and
   calls the exported `seal_decide` entry point via `ccall` — that integration shipped;
   there is no stub left to replace.
3. Regenerate the verdict fixtures through the copied artifact
   (`node scripts/regenerate-fixtures.cjs`; `--check` in CI).
4. Serve `public/` as a static site. No backend, no AI.

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
