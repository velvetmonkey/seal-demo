// SPDX-License-Identifier: Apache-2.0
// audit.js — Act 3: the receipt audit. After the verdict beat, the run's
// decision receipt becomes the artifact: shown, re-checked on-device, compared
// against the authorized twin of the SAME request, diffed at the authorization
// surface, and tampered to show the checks fail.
//
// HONESTY REGISTER (load-bearing, do not weaken): everything here is
// SELF-CONSISTENCY — the demo re-derives its own decision through its own
// kernel and byte-compares against the receipt. It is not an independent
// audit by another party, and the tamper beat proves emitted-bytes integrity
// against this receipt, not that the decision was independently correct.
// All hashing/canonicalisation comes from the vendored canonical
// receipt-format.js; the diff semantics from receipt-diff.js (kit port).
// No new verification capability.
import * as F from "./receipt-format.js";
import { receiptDiff } from "./receipt-diff.js";
import { decideConfig, decideSeq, decideSignedRaw, kernelBytes } from "./seal-wasm.js";

// sha256 of public/wasm/seal.wasm, pinned at commit time. The page re-hashes
// the wasm it actually fetched and compares — this backs the README claim
// that the in-browser sha256 shows which binary ran (a trusted compile of the
// proved kernels; the compile itself is trusted, not proved).
export const SEAL_WASM_SHA256 = "ff1bfd68d7be51b6a395f94dfc46b2fb27ed11dc5833af6a84675f42f9730546";

let _identity = null;
async function kernelIdentity() {
  if (_identity) return _identity;
  const bytes = await kernelBytes(); // shared single fetch (also used to instantiate)
  let computed;
  if (globalThis.crypto?.subtle) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    computed = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    computed = F.sha256Hex(bytes);
  }
  _identity = { computed, pinned: SEAL_WASM_SHA256, match: computed === SEAL_WASM_SHA256 };
  return _identity;
}

const mapVerdict = (v) => F.HOST_AUDIT_VERDICT_MAP[String(v).toLowerCase()] || "ERROR";
const lastStep = (c) => c.seq ? c.seq[c.seq.length - 1] : { tool: c.tool, args: c.args, approvals: c.approvals || [] };

// Assemble the run's v2 decision receipt from data the run already produced.
// Sequences (the out-of-order call) are receipted at their LAST step in the
// schema's canonical id=1 pre-image; the full replay inputs ride in the
// producer-local demo_replay block (verifiers MUST ignore unknown top-level
// fields; the diff reports it under MINOR).
export async function buildRunReceipt(res, composed) {
  const ki = await kernelIdentity();
  const step = lastStep(composed);
  const verdict = mapVerdict(res.verdict);
  const fields = {
    tool: step.tool,
    arguments: step.args,
    now: 1000, // the fixed decision clock in buildStepInput — deterministic by construction
    canonical_request: F.canonicalRequest(step.tool, step.args),
    canonical_request_sha256: F.canonicalRequestSha256(step.tool, step.args),
    bypass: false,
    verdict,
    authorization: verdict === "ALLOW" ? ((step.approvals || []).length ? "approval" : "explicit_policy_allow") : undefined,
    reason: res.reason,
    deny_kernel: res.deny_kernel ?? null,
    certs: (res.certs || []).map((c) => ({ kernel: c.kernel, verdict: c.verdict, reason: c.reason, certHash: c.certHash })),
    emitted_bytes: res.emitted,
    kernel_identity: { wasm_sha256: ki.computed, self_verified: ki.match,
      note: "sha256 of the wasm this page fetched, compared to the commit-time pin" },
    asserted_provenance: { verified_in_browser: false,
      note: "compiled from the Lean-proved seal kernels; the compile (T3) is trusted, not proved — see README, The honest claim" },
    signed_config: res.signed_config,
    kernel_config: composed.config,
    granted_capabilities: (step.approvals || []).map((t) => ({ target: String(t) })),
  };
  if (verdict === "ALLOW" && (step.approvals || []).length)
    fields.approval = { approval_identity: { channel: "file" } };
  const r = F.assembleReceiptV2(fields);
  // producer-local replay inputs, attached AFTER canonical assembly (the fixed
  // v2 key order only carries schema fields; verifiers MUST ignore this block)
  r.demo_replay = {
    approvals: (composed.approvals || []).map(String),
    votes: composed.votes || "",
    seq: composed.seq
      ? composed.seq.map((s) => ({ tool: s.tool, args: s.args, approvals: (s.approvals || []).map(String) }))
      : null,
  };
  return r;
}

// Self-consistency re-check, mirroring seal-check's verify orchestration over
// THIS demo's decide path: schema shape -> kernel binary hash -> canonical
// request hash -> re-derive the decision -> byte-compare emitted bytes.
export async function verifyRunReceipt(receipt) {
  const out = { checks: [], signature_valid: false, kernel_replay_consistent: false };
  const shape = F.validateReceipt(receipt);
  out.formatOk = shape.ok;
  out.checks.push({ ok: shape.ok, label: shape.ok
    ? "receipt shape valid (v2 schema; args_hash + policy_hash recomputed)"
    : "schema validation: " + shape.errors.join("; ") });

  const ki = await kernelIdentity();
  const shaMatch = typeof receipt.kernel_identity?.wasm_sha256 === "string" && ki.computed === receipt.kernel_identity.wasm_sha256;
  out.kernelSha = ki.computed;
  out.kernelShaMatch = shaMatch;
  out.checks.push({ ok: shaMatch, label: shaMatch
    ? `kernel binary re-hashed on-device (sha256 ${ki.computed.slice(0, 12)}… matches the receipt)`
    : "kernel binary hash does not match the receipt's kernel_identity" });

  const reqHash = (typeof receipt.tool === "string" && receipt.arguments && typeof receipt.arguments === "object")
    ? F.canonicalRequestSha256(receipt.tool, receipt.arguments) : null;
  const reqMatch = reqHash !== null && reqHash === receipt.canonical_request_sha256;
  out.requestHash = reqHash;
  out.requestHashMatch = reqMatch;
  out.checks.push({ ok: reqMatch, label: reqMatch
    ? `request bytes re-hashed — canonical_request_sha256 matches (${String(reqHash).slice(0, 12)}…)`
    : "canonical_request_sha256 does not match the hash of this receipt's own (tool, arguments)" });

  const bindingErrors = [];
  let signedPayload = null;
  try {
    signedPayload = JSON.parse(receipt.signed_config?.payload);
    if (JSON.stringify(signedPayload) !== receipt.signed_config?.payload)
      bindingErrors.push("signed_config.payload is not byte-identical compact JSON");
    if (JSON.stringify(receipt.kernel_config) !== receipt.signed_config?.payload)
      bindingErrors.push("kernel_config does not byte-equal signed_config.payload");
    if (receipt.approval && receipt.approval.policy_hash !== F.sha256Hex(new TextEncoder().encode(receipt.signed_config.payload)))
      bindingErrors.push("approval.policy_hash does not bind the exact signed payload bytes");
  } catch (e) { bindingErrors.push("signed_config.payload is not valid JSON: " + e.message); }
  const grants = F.capabilityTargetsFromPolicy(signedPayload, receipt.granted_capabilities);
  bindingErrors.push(...grants.errors);
  out.bindingOk = bindingErrors.length === 0;
  out.checks.push({ ok: out.bindingOk, label: out.bindingOk
    ? "signed payload bytes, policy hash, and capability grants are bound"
    : "signed-config binding: " + bindingErrors.join("; ") });

  let verdictMatch = false, bytesMatch = false, rederived = null;
  try {
    const rp = receipt.demo_replay || {};
    const res = out.bindingOk ? await decideSignedRaw(receipt.signed_config, {
      tool: receipt.tool, args: receipt.arguments, approvals: grants.approvals,
      now: receipt.now ?? 1000, votes: rp.votes || "", seq: rp.seq || null,
    }) : { signature_valid: false };
    out.signature_valid = res.signature_valid;
    if (!res.signature_valid) throw new Error("seal_init rejected the Ed25519 signature");
    rederived = mapVerdict(res.parsed.verdict);
    verdictMatch = rederived === receipt.verdict;
    bytesMatch = typeof res.raw === "string" && res.raw === receipt.emitted_bytes;
  } catch (e) {
    out.checks.push({ ok: false, label: "re-decide failed: " + (e?.message || e) });
  }
  out.rederived = rederived;
  out.verdictMatch = verdictMatch;
  out.emittedBytesMatch = bytesMatch;
  out.kernel_replay_consistent = verdictMatch && bytesMatch;
  out.checks.push({ ok: out.signature_valid, label: out.signature_valid
    ? "signature_valid: true (Ed25519 over the exact config payload bytes)"
    : "signature_valid: false" });
  out.checks.push({ ok: verdictMatch, label: verdictMatch
    ? `decision re-derived through this page's own kernel: ${rederived} (same inputs, same verdict)`
    : `re-derived verdict ${rederived ?? "(none)"} does not match the receipt's ${receipt.verdict}` });
  out.checks.push({ ok: bytesMatch, label: bytesMatch
    ? "emitted decision bytes byte-identical to the re-run"
    : "emitted decision bytes differ from the re-run" });

  out.allGood = out.formatOk && shaMatch && reqMatch && out.bindingOk && out.signature_valid && out.kernel_replay_consistent;
  return out;
}

// ── rendering ──────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const chip = (ok, text) => `<span class="a-chip ${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"}</span> ${esc(text)}`;
const checkLines = (v) => v.checks.map((c) => `<div class="a-check ${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✕"} ${esc(c.label)}</div>`).join("");

let auditToken = 0;

// The five beats, one message each. `twinComposed` is the SAME tool+args with
// the approval-surface knobs set to the opposite outcome (null when the call
// has no such knob, e.g. self-approve).
export async function renderAudit(res, composed, twinComposed) {
  const body = document.getElementById("audit-body");
  if (!body || res.verdict === "ERROR") return;
  const my = ++auditToken;

  const receipt = await buildRunReceipt(res, composed);
  if (my !== auditToken) return;
  const receiptJson = JSON.stringify(receipt, null, 2);

  // beat 2 — re-check on-device (self-consistency, not independent audit)
  const v = await verifyRunReceipt(receipt);
  if (my !== auditToken) return;

  // beat 3/4 — the authorized twin of the same request
  let twin = null, twinReceipt = null, sameHash = null;
  if (twinComposed) {
    try {
      const twinRes = twinComposed.seq
        ? await decideSeq(twinComposed.config, twinComposed.seq, twinComposed.tool)
        : await decideConfig(twinComposed.config, { tool: twinComposed.tool, args: twinComposed.args, approvals: twinComposed.approvals, votes: twinComposed.votes });
      if (my !== auditToken) return;
      if (mapVerdict(twinRes.verdict) !== receipt.verdict) {
        twin = twinRes;
        twinReceipt = await buildRunReceipt(twinRes, twinComposed);
        if (my !== auditToken) return;
        sameHash = twinReceipt.canonical_request_sha256 === receipt.canonical_request_sha256;
      }
    } catch { /* twin is best-effort; the beat reports honestly below */ }
  }

  const h = receipt.canonical_request_sha256;
  let b3, b4;
  if (twinReceipt) {
    const [blocked, allowed] = receipt.verdict === "BLOCK" ? [receipt, twinReceipt] : [twinReceipt, receipt];
    b3 = `<div class="a-msg">The same request, decided both ways — the request fingerprint is <b>identical</b>; only the decision differs.</div>
      <div class="a-hashpair">
        <div class="a-hrow"><span class="a-vtag block">BLOCK</span><code>${esc(blocked.canonical_request_sha256)}</code></div>
        <div class="a-hrow"><span class="a-vtag allow">ALLOW</span><code>${esc(allowed.canonical_request_sha256)}</code></div>
        <div class="a-hnote">${sameHash ? "canonical_request_sha256 equal — byte-identical request" : "hashes differ — twin construction error (report this)"}</div>
      </div>`;
    const d = receiptDiff(blocked, allowed, { nameA: "BLOCK run", nameB: "ALLOW run" });
    const authRows = (d.authorization || []).map((x) =>
      `<div class="a-diff-row auth"><b>${esc(x.field)}</b> ${esc(shorten(x.a))} → ${esc(shorten(x.b))}${x.note ? ` <i>${esc(x.note)}</i>` : ""}</div>`).join("");
    const minorRows = (d.minor || []).map((x) =>
      `<div class="a-diff-row minor">${esc(x.field)}${x.note ? ` <i>${esc(x.note)}</i>` : ""}</div>`).join("");
    b4 = `<div class="a-msg">What moved between the two receipts is exactly the <b>approval surface</b> — receipt-diff (kit semantics), integrity checked before diffing.</div>
      <div class="a-diff">${authRows || '<div class="a-diff-row">(no authorization-surface drift)</div>'}
      <details class="a-minor"><summary>minor / producer-local (${(d.minor || []).length})</summary>${minorRows || "(none)"}</details>
      <div class="a-hnote">${esc(d.result)} — reports what changed, not whether either receipt is sufficient to authorize the effect</div></div>`;
  } else {
    const why = composed.tool === "approve"
      ? "approve is flat-denied — no approval-surface setting authorizes this request, so there is no twin to compare."
      : "no approval-surface setting flips this verdict for this exact request — there is no authorized twin to compare.";
    b3 = `<div class="a-msg">${esc(why)}</div>`;
    b4 = "";
  }

  body.innerHTML =
    `<div class="a-beat"><div class="a-title">1 · the receipt</div>
       <div class="a-msg">Every run emits a decision receipt — the evidence the animation narrates.</div>
       <details class="a-json"><summary>receipt JSON (${esc(receipt.verdict)} · ${esc(String(h).slice(0, 12))}…)</summary><pre>${esc(receiptJson)}</pre></details></div>
     <div class="a-beat"><div class="a-title">2 · re-check on-device</div>
       <div class="a-msg">${chip(v.allGood, v.allGood
         ? "re-derived on-device — decision and emitted bytes match this receipt (self-consistency, not an independent audit)"
         : "a check failed — treat this receipt with suspicion")}</div>
       <div class="a-hash">canonical_request_sha256 <code>${esc(h)}</code></div>
       <div class="a-hash">signature_valid <code>${esc(v.signature_valid)}</code> · kernel_replay_consistent <code>${esc(v.kernel_replay_consistent)}</code></div>
       <details class="a-json"><summary>verification checks</summary>${checkLines(v)}</details></div>
     <div class="a-beat"><div class="a-title">3 · same request, two decisions</div>${b3}</div>
     ${b4 ? `<div class="a-beat"><div class="a-title">4 · what changed</div>${b4}</div>` : ""}
     <div class="a-beat"><div class="a-title">${b4 ? "5" : "4"} · tamper with it</div>
       <div class="a-msg">Flip one byte of the receipt and the re-check must fail.</div>
       <button class="a-tamper" id="a-tamper">Flip one byte → re-check</button>
       <div class="a-tamper-out" id="a-tamper-out"></div></div>`;

  const btn = document.getElementById("a-tamper");
  if (btn) btn.addEventListener("click", async () => {
    const t = JSON.parse(receiptJson);
    const orig = t.args_hash[0];
    const flipped = orig === "0" ? "1" : "0";
    t.args_hash = flipped + t.args_hash.slice(1);
    const tv = await verifyRunReceipt(t);
    const failing = tv.checks.filter((c) => !c.ok);
    document.getElementById("a-tamper-out").innerHTML =
      `<div class="a-hnote">args_hash byte 1: <code>${esc(orig)}</code> → <code>${esc(flipped)}</code></div>
       <div class="a-msg">${chip(false, "the tampered receipt no longer matches its own bytes")}</div>` +
      failing.map((c) => `<div class="a-check bad">✕ ${esc(c.label)}</div>`).join("");
  });
}

function shorten(v) {
  if (v === undefined) return "(absent)";
  const s = JSON.stringify(v);
  return s.length <= 64 ? s : s.slice(0, 64) + "…";
}
