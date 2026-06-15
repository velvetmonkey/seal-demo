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

## Run it

Two flavours.

### Live — the real verified kernel decides

The actual `seal-host` binary runs behind `POST /api/decide`. Verdicts are computed live by the Lean-verified kernels: open the **Live console** (`/live.html`) and fire your own tool calls. Bundles the private binary, so this is **local only — do not publish this image**.

```sh
scripts/prepare-runtime.sh        # copies the seal-host binary into runtime/ (build it first)
docker compose up --build         # then open http://localhost:8080/live.html
```

### Static — replay, public-safe, deployable

Pure HTML/JS with pre-captured verdicts. No binary, no backend, no Rust/Lean/Mathlib. Safe to publish.

```sh
docker build -t seal-demo .       # the plain Dockerfile
docker run --rm -p 8080:80 seal-demo
```

or just open `public/index.html` in a browser.

The heavy dependencies (Rust + Lean + Mathlib) belong only to *building* the verified host and capturing fixtures, never to running either demo. See `docs/BUILD.md`.

## Delivery spectrum

One verified artifact, four modes (same WASM core):

- **browser** — this demo
- **embedded** — the licensed PDP component, dropped into the host process (lowest latency, no phone-home)
- **edge** — Cloudflare / Fastly / Vercel (all run WASM), sub-ms verdicts on the agent's hot path, no central chokepoint
- **native** — full production server

## Publication boundary (read before flipping public)

This repo is **private pre-award**. The `seal-host` kernels carry an ARIA Track 1 covenant: only the **spec layer** (theorem statements, threat model, TCB) publishes ahead of submission; **proof sources at grant kickoff**; the **implementation stays under a 12-month commercialisation clawback**. When this demo goes public it ships only the **compiled black-box evaluator + this shell** — never the kernel or host source.

## Status

**v1 complete**, two ways to run:
- **Static** (`public/index.html`): landing + three demos on pre-captured verdicts. No backend, public-safe, deployable.
- **Live** (`/live.html`, `Dockerfile.live`): the real `seal-host` binary decides behind `/api/decide`. Genuine verdicts, including a "fire your own tool call" box. Local only (bundles the private binary).

**Next: WASM in-browser compute.** Live mode needs the binary plus a backend. Compiling the verified `decide` core to WASM (Lean → C → emscripten) would put live verdicts in the browser with no backend at all, at the `sealEvaluate` seam. See [`docs/BUILD.md`](docs/BUILD.md).
