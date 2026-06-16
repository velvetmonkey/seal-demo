# seal-demo

A public-facing, browser-runnable demo of **seal** — a verified **Policy Decision Point (PDP)** that mediates an LLM agent's tool calls. A Lean 4 kernel proves the policy-evaluation logic is sound.

> Everyone else makes the model safer. seal makes the model irrelevant to safety.
> The boundary is a theorem, and theorems don't get jailbroken.

## The honest claim

seal proves the **decision**, not the whole stack. The kernel guarantees: *for this canonical request and this policy, the verdict is DENY, by theorem X.* It does **not** claim the proxy, auth, sandbox, or parser are unbypassable. The demo shows the real guarantee with the Trusted Computing Base named on screen. Honesty is the pitch, not a footnote.

## How it works — AI is filmed, the kernel decides live

A public demo must not run a live frontier model (cost, abuse, nondeterminism, and the night it refuses to misbehave on cue it dies on stage). So:

- **Attacks are pre-scripted offline** by a human, once (`fixtures/`). That's the agent's reasoning plus the exact tool call it attempts.
- **The kernel decides live, in your browser.** The verified `seal-host` kernel is compiled to WebAssembly (`public/wasm/seal.wasm`) and runs the real `seal_decide` at the `sealEvaluate` seam — **no backend, no replay**. Every ALLOW/DENY and every cert hash on the page is computed live by the proven decision procedure, identically every run. The same kernel also runs natively behind `POST /api/decide` (Docker live mode); the two engines are **conformance-gated** to return byte-identical verdicts and certs.

The AI was always just the narrative wrapper. The kernel is the substance, and the substance is the AI-free part.

## The Gauntlet (`public/index.html`)

One guided page. You watch a single tool call get **judged gate by gate**, instead of reading a verdict table. The call travels through the gating kernels in series; each gate stamps it ALLOW (green, with the real one-line reason) and passes it on, or slams it DENY (red, with the reason) and destroys it on the spot. Clear every gate and the call leaves as a sealed certificate showing its real cert hash. The page folds the old three demos into one stage show:

1. **The Gauntlet + determinism.** Pick a call, send it, watch it run the gates. Re-run it: the path is the same and the certificate locks to the **same hash every time** — proof that does not flicker.
2. **The policy flip.** The same approved payment. Add one 2-of-3 quorum rule and re-run: the call that sailed through now visibly walls at the consensus gate. Safety still allows it; consensus now vetoes. A verified policy *compiler*, not a hand-proven wall.
3. **Probability leaks, proof holds.** The same attack dropped into three lanes at once — a raw model and an ML guardrail (illustrative, labelled) leak; seal's lane (the real kernel) blocks every run.

The plumbing (WASM-vs-native, conformance, the TCB) lives in one collapsible **Under the hood** panel, off the hero path. The interactive **Live console** (`public/live.html`) lets you fire your own tool calls at the real binary.

Every verdict in seal's gates and lane is **real**, computed live by the verified `seal-host` kernel (WASM in the browser, or the native binary in Docker). `fixtures/captured.json` is the conformance fixture both engines are checked against.

## Run it

Two targets. Both decide live with the real verified kernel.

### Target A — in-browser WASM (no backend) — the default

The verified kernel compiled to WebAssembly decides entirely in the browser. No
server, no binary, no Rust/Lean/Mathlib. This is what `public/` serves; just host
the static files (the `.wasm` needs an HTTP origin — `file://` won't fetch it):

```sh
cd public && python3 -m http.server 8080      # then open http://localhost:8080/
```

The Gauntlet (`/`) and the Live console (`/live.html`) compute real verdicts via
`public/wasm/seal.{js,wasm}` at the decision seam — including the
"fire your own tool call" box (audience-typed calls decided live).

### Target B — native binary behind /api/decide (Docker live)

The actual `seal-host` binary runs behind `POST /api/decide`; the Live console
prefers it and falls back to WASM if it's absent. Bundles the private binary, so
this image is **local only — do not publish it**.

```sh
scripts/prepare-runtime.sh        # copies the seal-host binary into runtime/ (build it first)
docker compose up --build         # then open http://localhost:8080/live.html
```

Run it locally without Docker (point it at a built host):

```sh
SEAL_BIN=/path/to/seal-host/.lake/build/bin/seal-host \
SEAL_MOCK=/path/to/seal-host/test/integration/mock_mcp_server.py \
SEAL_PUBLIC=$PWD/public PORT=8080 python3 server/decide_server.py
```

### Rebuilding the WASM evaluator

`public/wasm/seal.{js,wasm}` is the compiled black-box evaluator — built from the
**private** `seal-host` repo, never from source here. To regenerate (from a clean
`seal-host` checkout): see `seal-host/wasm-spike/RESUME.md` — `build_closure.sh`
then `build_wasm.sh` produce `build-core/seal.{js,wasm}`; copy them into
`public/wasm/`. Conformance (WASM == native == `captured.json`) is gated by
`seal-host/wasm-spike/{conformance,demo_conformance}.mjs`.

The heavy dependencies (Rust + Lean + Mathlib) belong only to *building* the
verified host, never to running either target. See `docs/BUILD.md`.

## Delivery spectrum

One verified artifact, four modes (same WASM core):

- **browser** — this demo
- **embedded** — the licensed PDP component, dropped into the host process (lowest latency, no phone-home)
- **edge** — Cloudflare / Fastly / Vercel (all run WASM), sub-ms verdicts on the agent's hot path, no central chokepoint
- **native** — full production server

## Publication boundary (read before flipping public)

This repo is **private pre-award**. The `seal-host` kernels carry an ARIA Track 1 covenant: only the **spec layer** (theorem statements, threat model, TCB) publishes ahead of submission; **proof sources at grant kickoff**; the **implementation stays under a 12-month commercialisation clawback**. When this demo goes public it ships only the **compiled black-box evaluator + this shell** — never the kernel or host source.

## Status

**v2 complete — live verdicts on both targets:**
- **WASM in-browser** (`public/`, `public/wasm/seal.{js,wasm}`): the Gauntlet + the Live console + the "fire your own tool call" box compute real verdicts from the verified kernel, in the browser, no backend. The three-lane contrast runs genuine WASM decisions per fire for seal's lane; the re-run lock proves determinism live.
- **Native** (`/live.html`, `Dockerfile.live`): the real `seal-host` binary decides behind `/api/decide`; the Live console prefers it and falls back to WASM.
- **Conformance-gated:** WASM verdict == native verdict == `fixtures/captured.json` for every demo scenario, cert hashes included (`seal-host/wasm-spike/demo_conformance.mjs`, 7/7; kernel-level 25/25).

The Lean → C → emscripten WASM port lives in the private `seal-host` repo (`wasm-spike/`); only the compiled `.wasm`/`.js` + this shell are exposed.
