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

## Demos

1. **The determinism differential** (scaffolded, `public/index.html`). Same attack, three gates — raw model, an ML guardrail, seal — fired ten times. The probabilistic gates flicker. seal returns the same verdict and the same proof hash every run. Kills "guardrails already do this" in one image.
2. **Live policy swap** (planned). Edit the policy on stage, re-prove in seconds, watch the verdict flip. seal is a verified policy *compiler*, not one hand-proven wall.
3. **The confident hallucination** (planned). The agent isn't evil, it's confidently wrong (a subtle ESG/regulatory miscalculation). seal OFF: the wrong number ships. seal ON: the kernel catches what a human reviewer would have waved through.

## Delivery spectrum

One verified artifact, four modes (same WASM core):

- **browser** — this demo
- **embedded** — the licensed PDP component, dropped into the host process (lowest latency, no phone-home)
- **edge** — Cloudflare / Fastly / Vercel (all run WASM), sub-ms verdicts on the agent's hot path, no central chokepoint
- **native** — full production server

## Status

Scaffold. The front-end shell runs today with a **stubbed evaluator** (`public/index.html`, see the seam marked `sealEvaluate`). The real verified PDP compiles from the private `seal-host` kernels to WASM and plugs in at that seam. See [`docs/BUILD.md`](docs/BUILD.md).
