# seal-demo — Claim Audit Findings

Sampled from README, "The honest claim", "How it works", non-claims.

Backed by: public/wasm (conformance), fixtures/, server/, test vectors in family.

All honesty ("proves the decision not the stack", "trusted compile + differential", "compatible") preserved.

## Sampled

| Claim | Backed? | Evidence | Action |
|-------|---------|----------|--------|
| Live kernel in browser decides the gauntlet calls (ALLOW/DENY computed on page). | Yes (runnable) | public/wasm/seal.wasm + gauntlet code; conformance to model | keep |
| Pre-scripted attacks (fixtures); kernel live, no real model call. | Yes | fixtures/, README "How it works" | keep |
| Proves the *decision*, not the whole stack. | Yes (documented) | "honest claim" + non-claims (verbatim) | keep |
| Wasm is trusted compile + differential, not proven equal to model. | Yes (documented) | README T3 caveat | keep |

## NEEDS BEN
- Live docker mode full run (static + code provide showcase).

See family matrix.