// SPDX-License-Identifier: Apache-2.0
// In-browser WASM evaluator adapter. Loads the compiled black-box seal kernel
// (wasm/seal.js, set up by a classic <script> tag as window.SealModule) and
// decides tool calls entirely in the browser — no backend.
import { SCENARIOS, CFG_STANDARD, buildSignedConfig, buildStepInput, parseVerdict } from "./seal-config.js";

export const KERNEL_WASM_SHA256 = "d3067bc07e74977dedf6bb96d79a710c4b61143f6e8db151655bc88ece8b9d66";

let _modPromise = null;
let _kernelBytesPromise = null;
// Fetch the compiled kernel bytes exactly once and share them: emscripten
// instantiates from these bytes (via Module.wasmBinary, no second network round),
// and audit.js re-hashes the SAME bytes for the "which binary ran" identity — so
// the bytes hashed are literally the bytes run, on a single download.
//
// Both memoise the PROMISE, not the resolved value: at load, ready() and an
// in-flight decide call mod() concurrently, and a resolved-value guard (`if (_mod)`)
// lets both race past before either sets it, instantiating the kernel twice and
// fetching the wasm twice. Caching the in-flight promise collapses them to one.
export function kernelBytes() {
  if (!_kernelBytesPromise) {
    _kernelBytesPromise = (async () =>
      new Uint8Array(await (await fetch("wasm/seal.wasm")).arrayBuffer()))();
  }
  return _kernelBytesPromise;
}
function mod() {
  if (!_modPromise) {
    _modPromise = (async () => {
      if (!window.SealModule) throw new Error("wasm/seal.js not loaded (need <script src=\"wasm/seal.js\">)");
      // Pass a copy so emscripten can never detach the buffer audit.js hashes.
      return window.SealModule({ wasmBinary: (await kernelBytes()).slice(), print: () => {}, printErr: () => {} });
    })();
  }
  return _modPromise;
}

// Load the session config, then decide one step. seal_init is cheap and resets
// kernel state, so each decision is self-contained and deterministic.
async function decideWith(config, step, tool) {
  const M = await mod();
  const signedConfig = await buildSignedConfig(config);
  const ir = JSON.parse(M.ccall("seal_init", "string", ["string", "string"], [signedConfig.envelope, signedConfig.pubkey]));
  if (ir.ok !== true) throw new Error("seal_init failed: " + (ir.error || JSON.stringify(ir)));
  const raw = M.ccall("seal_decide", "string", ["string"], [step]);
  return { ...parseVerdict(raw, tool), signed_config: {
    payload: signedConfig.payload, signature: signedConfig.signature, pubkey: signedConfig.pubkey,
  } };
}

// Receipt verification path: replay the exact authenticated bytes from the
// receipt. This path never invokes the local test signer.
export async function decideSignedRaw(signedConfig, { tool, args = {}, approvals = [], now = 1000, votes = "", seq = null }) {
  const M = await mod();
  const envelope = JSON.stringify({ payload: signedConfig.payload, signature: signedConfig.signature });
  const ir = JSON.parse(M.ccall("seal_init", "string", ["string", "string"], [envelope, signedConfig.pubkey]));
  if (ir.ok !== true) return { signature_valid: false, initError: ir.error || JSON.stringify(ir) };
  let raw, step;
  if (seq) {
    seq.forEach((s, i) => {
      step = buildStepInput({ ...s, id: i + 1 });
      raw = M.ccall("seal_decide", "string", ["string"], [step]);
    });
  } else {
    step = buildStepInput({ tool, args, approvals, now, votes });
    raw = M.ccall("seal_decide", "string", ["string"], [step]);
  }
  return { signature_valid: true, raw, step, parsed: parseVerdict(raw, tool) };
}

// Decide a curated demo scenario by key (destructive-sql, wire-40k, pay-after, ...).
export async function decideScenario(key) {
  const s = SCENARIOS[key];
  if (!s) throw new Error("unknown scenario: " + key);
  return decideWith(s.config, buildStepInput(s), s.tool);
}

// Decide an audience-typed custom tool call (uses the rich standard config).
export async function decideCustom(tool, args, approvals = []) {
  return decideWith(CFG_STANDARD, buildStepInput({ tool, args, approvals }), tool);
}

// Decide an arbitrary trusted-config + tool call composed live by the presentation
// layer (the Policy Lab). seal_init accepts any trusted config, so this is a thin
// adapter over decideWith — no kernel logic. Reuses the WARM module singleton via
// mod(): the 617-module runtime instantiates once; each call does only the cheap
// seal_init(config) reset + seal_decide(step), so live re-decide has no cold re-init.
export async function decideConfig(config, { tool, args = {}, approvals = [], votes = "" }) {
  return decideWith(config, buildStepInput({ tool, args, approvals, votes }), tool);
}

// Decide an ORDERED sequence of calls in ONE session: seal_init once, then a seal_decide per step,
// so the kernel accumulates a REAL event trace across the steps (the stateful kernels — temporal,
// budget, linear — only fire on a sequence). Returns the verdict of the LAST step. Used to break
// the Temporal gate (a destructive db.execute after a session.revoke). `steps` = [{tool,args,approvals}].
export async function decideSeq(config, steps, tool) {
  const M = await mod();
  const signedConfig = await buildSignedConfig(config);
  const ir = JSON.parse(M.ccall("seal_init", "string", ["string", "string"], [signedConfig.envelope, signedConfig.pubkey]));
  if (ir.ok !== true) throw new Error("seal_init failed: " + (ir.error || JSON.stringify(ir)));
  let raw;
  steps.forEach((s, i) => { raw = M.ccall("seal_decide", "string", ["string"], [buildStepInput({ ...s, id: i + 1 })]); });
  return { ...parseVerdict(raw, tool), signed_config: {
    payload: signedConfig.payload, signature: signedConfig.signature, pubkey: signedConfig.pubkey,
  } };
}

// Warm the module (so first real decision is instant) and report readiness.
export async function ready() { await mod(); return true; }
