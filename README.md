# seal-demo

A public-facing, browser-runnable demo of **seal** — a verified **Policy Decision Point (PDP)** that mediates an LLM agent's tool calls. A Lean 4 kernel proves the policy-evaluation logic is sound.

> Everyone else makes the model safer. seal makes the model irrelevant to safety.
> The boundary is a theorem, and theorems don't get jailbroken.

## The honest claim

seal proves the **decision**, not the whole stack. The kernel guarantees: *for this canonical request and this policy, the verdict is DENY, by theorem X.* It does **not** claim the proxy, auth, sandbox, or parser are unbypassable. The demo shows the real guarantee with the Trusted Computing Base named on screen. Honesty is the pitch, not a footnote.

## How it works — AI is filmed, not live

A public demo must not run a live frontier model (cost, abuse, nondeterminism, and the night it refuses to misbehave on cue it dies on stage). So:

- **Attacks are pre-captured offline** by a human, once, as static fixtures (`fixtures/`). That's the agent's reasoning plus the exact tool call it attempts.
- **The kernel runs live and deterministic** on replay. Each fixture is fed to the verified evaluator, which returns ALLOW/DENY plus the proof, identically every time.

The AI was always just the narrative wrapper. The kernel is the substance, and the substance is the AI-free part.

## Demos (v1 — all three built, real verdicts)

1. **The determinism differential** (`public/demo1.html`). Same attack, three gates — raw model, an ML guardrail, seal — fired ten times. The probabilistic gates flicker. seal returns the same verdict and the same cert hash every run.
2. **Live policy swap** (`public/demo2.html`). The same approved payment. Add a 2-of-3 quorum rule and the identical call flips ALLOW → DENY. Safety still allows it; consensus now vetoes. A verified policy *compiler*, not a hand-proven wall.
3. **The confident hallucination** (`public/demo3.html`). The agent isn't evil, it's plausibly wrong: a non-convergent `assign` on a replicated store. Safety and temporal allow it; only the convergence kernel (grounded in `crdt-lean`) catches it.

Every verdict on every page is **real**, captured from the verified `seal-host` (`fixtures/captured.json`). Reproduce via `build/capture*.py`.

## Delivery spectrum

One verified artifact, four modes (same WASM core):

- **browser** — this demo
- **embedded** — the licensed PDP component, dropped into the host process (lowest latency, no phone-home)
- **edge** — Cloudflare / Fastly / Vercel (all run WASM), sub-ms verdicts on the agent's hot path, no central chokepoint
- **native** — full production server

## Publication boundary (read before flipping public)

This repo is **private pre-award**. The `seal-host` kernels carry an ARIA Track 1 covenant: only the **spec layer** (theorem statements, threat model, TCB) publishes ahead of submission; **proof sources at grant kickoff**; the **implementation stays under a 12-month commercialisation clawback**. When this demo goes public it ships only the **compiled black-box evaluator + this shell** — never the kernel or host source.

## Status

**v1 complete.** Landing page + three demos, all driven by real captured kernel verdicts. Open `public/index.html` in a browser — no build step, no backend, no AI.

**v1.1 (next): live WASM compute.** Today the verdicts are replayed from genuine recorded output (authentic "filmed not live"). The next step compiles the verified `decide` core from the private `seal-host` kernels to WASM (Lean → C → emscripten) and plugs it in at the `sealEvaluate` seam, so the kernel computes verdicts live in the browser. See [`docs/BUILD.md`](docs/BUILD.md).
