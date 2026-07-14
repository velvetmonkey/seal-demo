// SPDX-License-Identifier: Apache-2.0
// Shared gate-derivation helpers — the single source of truth for how a gating kernel
// is named and what RULE it enforces for a given call, derived straight from the trusted
// config (SCENARIOS[*].config / CFG_STANDARD). Imported by both the Gauntlet (gauntlet.js)
// and the Live console (live.html) so the two pages describe the gates identically.
// Presentation only — it explains the policy the verified kernel consumes; it never
// changes a verdict.

// `stake` = the BIG plain-English line (what's at risk / why a human cares); `name`+`sub`
// the kernel identity. Dual-register: layman reads the stake, techie reads the rule+hash.
export const KERNEL = {
  safety:      { name: "Safety",      sub: "approval gate",        stake: "Could move money or wreck data — needs a human's say-so." },
  temporal:    { name: "Temporal",    sub: "trace gate",           stake: "Replayed or out-of-order actions get caught here." },
  consensus:   { name: "Consensus",   sub: "quorum gate",          stake: "A big action — needs a quorum of people, not one, to agree this tool may run." },
  convergence: { name: "Convergence", sub: "CRDT gate",            stake: "A write to shared data — must be provably safe to merge." },
  calibration: { name: "Calibration", sub: "calibration gate",     stake: "The claim must be as confident as the evidence allows." },
  linear:      { name: "Linear",      sub: "resource gate",        stake: "A one-time resource can't be spent twice." },
  budget:      { name: "Budget",      sub: "budget gate",          stake: "The action must stay within budget." },
};
export const kname = (k) => (KERNEL[k] || { name: k }).name;
export const ksub = (k) => (KERNEL[k] || { sub: "gating kernel" }).sub;
export const kstake = (k) => (KERNEL[k] || { stake: "" }).stake;

// Derive the human-readable RULE a gate enforces for THIS call, straight from the real
// trusted config (config). Presentation only — it explains the policy the kernel consumes;
// it never changes a verdict. Returns "" if the config is unavailable.
export function gatePolicy(kernel, config, tool) {
  if (!config) return "";
  switch (kernel) {
    case "safety": {
      const r = (config.safety && config.safety.tools || []).find((t) => t.name === tool);
      if (!r) return "guarded tools need a valid human approval";
      if (r.mode === "deny") return `${tool} is flat-denied — never permitted`;
      if (r.match && r.match.type === "contains_any_ci")
        return `needs a human approval when ${r.match.arg} contains “${(r.match.needles || []).join(" / ")}”`;
      return `${tool} is guarded — needs a valid human approval`;
    }
    case "temporal": {
      const ps = (config.temporal && config.temporal.policies) || [];
      if (!ps.length) return "the event trace must contain no forbidden sequence";
      const p = ps[0];
      if (p.type === "no_after") return `no ${(p.forbidden || []).join(" / ")} after a ${(p.trigger || []).join(" / ")}`;
      return "the event trace must satisfy the temporal policy";
    }
    case "consensus": {
      const c = config.consensus || {};
      const hs = c.high_stakes || [];
      if (hs.includes(tool))
        return `high-stakes — needs a 2-of-3 sign-off on the tool name (roster ${(c.roster || []).join("/")})`;
      return "high-stakes tools need a 2-of-3 quorum sign-off on the tool name";
    }
    case "convergence": {
      const t = (config.convergence && config.convergence.tools || []).find((x) => x.tool === tool);
      if (t) return `the “${t.op_arg}” op must be a proven-convergent CRDT operation`;
      return "replicated-store writes must be convergence-safe";
    }
    default:
      return "a verified gating kernel";
  }
}

// The ordered list of kernel keys that gate this tool under `config`, matching the order
// the kernel emits certs in: every mediated call hits safety + temporal, plus consensus if
// the tool is high-stakes and convergence if it is a registered replicated-store write.
export function gatesForTool(tool, config) {
  const gates = ["safety", "temporal"];
  const hs = (config && config.consensus && config.consensus.high_stakes) || [];
  if (hs.includes(tool)) gates.push("consensus");
  const cv = (config && config.convergence && config.convergence.tools) || [];
  if (cv.some((x) => x.tool === tool)) gates.push("convergence");
  return gates;
}

// A short "trips when … · passes when …" hint for one gate, so a viewer knows exactly what
// flips the verdict. Derived from the trusted config; never a hardcoded per-call string.
export function gateTripHint(kernel, config, tool) {
  switch (kernel) {
    case "safety": {
      const r = (config && config.safety && config.safety.tools || []).find((t) => t.name === tool);
      if (!r) return "passthrough — not a guarded tool";
      if (r.mode === "deny") return "always denied — never permitted";
      if (r.match && r.match.type === "contains_any_ci")
        return `trips without a human approval · passes with one attached (a ${r.match.arg} that matches no guarded policy is denied outright as “unmatched”)`;
      return "trips without a human approval · passes with one attached";
    }
    case "temporal":
      return "passes — no forbidden sequence in the event trace";
    case "consensus":
      return "trips below a 2-of-3 quorum · passes when the quorum signs off";
    case "convergence":
      return "trips on a non-convergent op (assign / LWW) · passes on a proven-convergent op (orset.add)";
    default:
      return "";
  }
}

// What this gate actually inspects on THIS call — so the rule is never shown without a
// referent. Pairs with gatePolicy (the rule) and gateResult (the outcome) to render a
// gate card that is always tied to the specific call.
export function gateChecks(kernel, config, tool) {
  switch (kernel) {
    case "safety":
      return tool === "approve" ? "the approve call's target" : `the human approval for ${tool}`;
    case "temporal":
      return "the event trace";
    case "consensus":
      return "the 2-of-3 quorum sign-off on the tool name";
    case "convergence": {
      const t = (config && config.convergence && config.convergence.tools || []).find((x) => x.tool === tool);
      return t ? `the “${t.op_arg}” operation` : "the replicated-store write";
    }
    default:
      return "the call";
  }
}

// A plain one-line outcome for this gate's verdict on this call, translated from the real
// cert (verdict + machine reason) — names what happened, no kernel jargon.
export function gateResult(kernel, cert) {
  const allow = cert.verdict !== "deny";
  const r = cert.reason || "";
  switch (kernel) {
    case "safety":
      if (allow) return "a valid human approval is attached";
      if (/flat deny/i.test(r)) return "an agent can’t rubber-stamp its own action";
      if (/unmatched/i.test(r)) return "no guarded policy matches this call";
      return "no valid human approval was supplied";
    case "temporal":
      return allow ? "the event trace is clean" : "a forbidden sequence appears in the trace";
    case "consensus":
      return allow ? "the 2-of-3 quorum signed off — on the tool name, not this call's bytes" : "the 2-of-3 quorum is missing";
    case "convergence":
      return allow ? "a provably-convergent operation" : "a non-convergent op (last-writer-wins)";
    default:
      return allow ? "passes" : "blocked";
  }
}
