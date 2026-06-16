// SPDX-License-Identifier: Apache-2.0
// THE GAUNTLET — presentation layer only. Renders one real tool-call decision as a
// single moving object that travels through the gating kernels IN SERIES. Every gate,
// stamp, reason and cert hash comes from the verified kernel via the seam below
// (decideScenario / POST /api/decide) — never faked. The illustrative raw/ML lanes in
// the three-lane contrast are RNG and labelled as such. No kernel source here.
import { decideScenario, ready } from "./seal-wasm.js";
// read-only: the real trusted-config payloads each scenario is judged under, so each
// gate can show the actual rule it enforces (never modified here — just read).
import { SCENARIOS } from "./seal-config.js";

// ── the seam: native verified binary first (POST /api/decide, Docker live), else the
// same kernel compiled to WASM in-browser. Same schema both ways, so the animation is
// identical and the engine is invisible to the audience. Lifted from live.html.
async function decide(body) {
  try {
    const r = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("http " + r.status);
    return await r.json();
  } catch (e) {
    return await decideScenario(body.scenario);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// timings (ms) — paced for the back of a room, not for speed
const T = { move: 620, evalPulse: 620, stamp: 760, kill: 900, seal: 700 };

// presentation metadata only — human-readable mirror of the real call args in
// seal-config.js (honest, just legible). Kernel verdicts come from the seam.
// `stopped` = the plain-English counterfactual shown when the call is DENIED (the
// consequence that did NOT happen). `won` = the plain line when it clears every gate.
const CALLS = {
  "wire-40k":        { label: "Wire £40,000 to an unlisted account",            call: 'payments.send { amount: 40000, to: "GB-unlisted" }', attack: true,
                       stopped: "£40,000 never left the account.", won: "The payment went through — and it's certified." },
  "destructive-sql": { label: "Drop the production users table",                call: 'db.execute { sql: "drop table users" }',             attack: true,
                       stopped: "The production users table is still there.", won: "The query ran — and it's certified." },
  "self-approve":    { label: "Self-approve my own destructive call",           call: "approve { target: self }",                            attack: true,
                       stopped: "The agent could not rubber-stamp itself.", won: "Approved — and it's certified." },
  "store-subtle":    { label: "Write to a replicated store — last-writer-wins", call: 'store.update { op: "assign", key: "k1" }',            attack: true,
                       stopped: "The corrupting write never landed — replicas stay consistent.", won: "The write landed — and it's certified." },
  "store-safe":      { label: "Write to a replicated store — OR-Set add",       call: 'store.update { op: "orset.add", key: "k1" }',         attack: false,
                       stopped: "The write was blocked.", won: "A provably-convergent write — certified." },
  "pay-before":      { label: "Pay supplier-77 £40,000",                        call: 'payments.send { amount: 40000, to: "supplier-77" }', attack: false,
                       stopped: "£40,000 never left the account.", won: "The payment went through — and it's certified." },
  "pay-after":       { label: "Pay supplier-77 £40,000",                        call: 'payments.send { amount: 40000, to: "supplier-77" }', attack: true,
                       stopped: "£40,000 never left the account.", won: "The payment went through — and it's certified." },
};
// scenarios offered in the hero picker (the policy-flip pay-before/after live in their own stage)
const HERO_KEYS = ["wire-40k", "destructive-sql", "self-approve", "store-subtle", "store-safe"];

// `stake` = the BIG plain-English line (what's at risk / why a human cares); `name`+`sub`
// the kernel identity. Dual-register: layman reads the stake, techie reads the rule+hash.
const KERNEL = {
  safety:      { name: "Safety",      sub: "approval gate",        stake: "Could move money or wreck data — needs a human's say-so." },
  temporal:    { name: "Temporal",    sub: "trace gate",           stake: "Replayed or out-of-order actions get caught here." },
  consensus:   { name: "Consensus",   sub: "quorum gate",          stake: "A big action — needs a quorum of people, not one." },
  convergence: { name: "Convergence", sub: "CRDT gate",            stake: "A write to shared data — must be provably safe to merge." },
  calibration: { name: "Calibration", sub: "calibration gate",     stake: "The claim must be as confident as the evidence allows." },
  linear:      { name: "Linear",      sub: "resource gate",        stake: "A one-time resource can't be spent twice." },
  budget:      { name: "Budget",      sub: "budget gate",          stake: "The action must stay within budget." },
};
const kname = (k) => (KERNEL[k] || { name: k }).name;
const ksub = (k) => (KERNEL[k] || { sub: "gating kernel" }).sub;
const kstake = (k) => (KERNEL[k] || { stake: "" }).stake;

// Derive the human-readable RULE a gate enforces for THIS call, straight from the real
// trusted config (SCENARIOS[key].config). Presentation only — it explains the policy the
// kernel consumes; it never changes a verdict. Returns "" if the config is unavailable.
function gatePolicy(kernel, config, tool) {
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
    case "temporal":
      return (config.temporal && (config.temporal.policies || []).length)
        ? "the event trace must satisfy the temporal policy"
        : "the event trace must contain no forbidden sequence";
    case "consensus": {
      const c = config.consensus || {};
      const hs = c.high_stakes || [];
      if (hs.includes(tool))
        return `high-stakes — needs a 2-of-3 sign-off (roster ${(c.roster || []).join("/")})`;
      return "high-stakes tools need a 2-of-3 quorum sign-off";
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

// ── the gate track. Builds gates from the REAL certs array (only the kernels that
// gated this call), animates one call-token through them in series, stamps each gate
// with its real verdict/reason/hash, kills the token at the first deny, seals on a
// full clear. Returns the raw decision so callers can do determinism bookkeeping.
async function runGauntlet(trackEl, outEl, scenarioKey) {
  const res = await decide({ scenario: scenarioKey });
  const certs = res.certs || [];
  const scn = SCENARIOS[scenarioKey] || {};
  const config = scn.config, tool = scn.tool || res.tool;

  // build track: gates + finish slot + the moving token. Each gate shows the real RULE
  // it enforces (from the trusted config) so the verdict is legible, not arbitrary.
  trackEl.innerHTML = "";
  const gates = certs.map((c, i) => {
    const g = document.createElement("div");
    g.className = "gate";
    const rule = gatePolicy(c.kernel, config, tool);
    g.innerHTML =
      `<div class="gate-head"><span class="gate-name">${kname(c.kernel)}</span><span class="gate-sub">${ksub(c.kernel)}</span></div>` +
      `<div class="gate-stake">${kstake(c.kernel)}</div>` +
      (rule ? `<div class="gate-policy"><span class="gp-label">RULE</span><span class="gp-text">${rule}</span></div>` : `<div class="gate-policy"></div>`) +
      `<div class="gate-arch"><span class="door l"></span><span class="door r"></span><span class="gate-stamp"></span></div>` +
      `<div class="gate-reason"></div><div class="gate-hash"></div>`;
    trackEl.appendChild(g);
    return g;
  });
  const finish = document.createElement("div");
  finish.className = "finish";
  finish.innerHTML = `<span class="finish-ico">✦</span><span class="finish-label">SEAL</span>`;
  trackEl.appendChild(finish);

  const token = document.createElement("div");
  token.className = "token";
  token.innerHTML = `<span class="token-tool">${res.tool}</span>`;
  trackEl.appendChild(token);

  outEl.innerHTML = "";
  await sleep(40); // let layout settle so offsets are real
  const tw = token.offsetWidth;
  // align the token to the gate's ARCH (the visual doorway), not the whole column, so it
  // stays centred on the gate even though the rule caption makes the column taller.
  const visual = (g) => (g.querySelector && g.querySelector(".gate-arch")) || g;
  const midY = (el) => el.offsetTop + el.offsetHeight / 2 - token.offsetHeight / 2;
  const centerX = (el) => el.offsetLeft + el.offsetWidth / 2 - tw / 2;
  const move = (g) => { const el = visual(g); token.style.transform = `translate(${centerX(el)}px, ${midY(el)}px)`; };

  // park token at the start (left of gate 0)
  token.style.transform = `translate(0px, ${midY(visual(gates[0] || finish))}px)`;
  await sleep(160);

  let killedAt = -1;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i], c = certs[i];
    move(g); await sleep(T.move);
    g.classList.add("eval"); await sleep(T.evalPulse);
    g.classList.remove("eval");

    const stamp = g.querySelector(".gate-stamp");
    const reason = g.querySelector(".gate-reason");
    const hash = g.querySelector(".gate-hash");
    reason.textContent = c.reason;
    // a bare-integer reason is a real kernel id (e.g. the approval target safety matched);
    // style it as an identifier so it doesn't read like a glitch next to prose reasons.
    if (/^\d+$/.test(c.reason)) reason.classList.add("idval");
    hash.textContent = "cert " + c.certHash;

    if (c.verdict === "deny") {
      g.classList.add("deny");
      stamp.textContent = "DENY";
      token.classList.add("destroyed");
      killedAt = i;
      for (let j = i + 1; j < gates.length; j++) gates[j].classList.add("unreached");
      await sleep(T.kill);
      break;
    }
    g.classList.add("allow");
    stamp.textContent = "ALLOW";
    await sleep(T.stamp);
  }

  if (killedAt >= 0) {
    const dk = certs[killedAt];
    const drule = gatePolicy(dk.kernel, config, tool);
    const stopped = (CALLS[scenarioKey] || {}).stopped || "The action never happened.";
    outEl.className = "verdict-out killed";
    outEl.innerHTML =
      `<div class="big-verdict deny">DENY · BLOCKED</div>` +
      `<div class="verdict-consequence">${stopped} <span class="vc-tail">The model asked; the boundary said no.</span></div>` +
      `<div class="verdict-rule">Stopped at the <b>${kname(dk.kernel)} gate</b>${drule ? " — " + drule : ""} · <span class="vr-reason">${dk.reason}</span> · <span class="vr-hash">cert ${dk.certHash}</span></div>`;
  } else {
    move(finish); await sleep(T.move);
    finish.classList.add("sealed"); token.classList.add("sealed");
    await sleep(T.seal);
    const vector = certs.map((c) => c.certHash);
    const won = (CALLS[scenarioKey] || {}).won || "Cleared every gate.";
    outEl.className = "verdict-out sealed";
    outEl.innerHTML =
      `<div class="big-verdict allow">ALLOW · SEALED</div>` +
      `<div class="verdict-consequence">${won} <span class="vc-tail">Every gate's rule was met.</span></div>` +
      `<div class="seal-cert"><span class="seal-cert-label">certificate</span>` +
      `<span class="seal-cert-hash">${res.certHash}</span></div>` +
      `<div class="seal-vector">${vector.map((h, i) => `<span>${kname(certs[i].kernel)}: ${h}</span>`).join("")}</div>`;
  }
  return res;
}

// determinism bookkeeping: the full cert-hash vector must lock identical every run.
function certVector(res) { return JSON.stringify((res.certs || []).map((c) => c.certHash)); }

// ───────────────────────────────────────────── HERO STAGE ─────────────────────────
const hero = (() => {
  const picker = document.getElementById("picker");
  const banner = document.getElementById("call-banner");
  const track = document.getElementById("track");
  const out = document.getElementById("verdict-out");
  const runBtn = document.getElementById("run");
  const againBtn = document.getElementById("run-again");
  const det = document.getElementById("det");
  if (!picker) return null;

  let selected = HERO_KEYS[0];
  let busy = false;
  let lockVector = null, runCount = 0;

  function setSelected(k) {
    selected = k;
    [...picker.children].forEach((b) => b.classList.toggle("on", b.dataset.k === k));
    banner.innerHTML = `<span class="cb-label">the agent wants to:</span> <code>${CALLS[k].call}</code>`;
    // reset stage + determinism state for the new call
    lockVector = null; runCount = 0;
    track.innerHTML = ""; out.innerHTML = ""; out.className = "verdict-out";
    det.textContent = ""; det.className = "det";
    againBtn.disabled = true;
  }

  HERO_KEYS.forEach((k) => {
    const b = document.createElement("button");
    b.className = "pick"; b.dataset.k = k; b.textContent = CALLS[k].label;
    b.addEventListener("click", () => { if (!busy) setSelected(k); });
    picker.appendChild(b);
  });

  async function run() {
    if (busy) return;
    busy = true; runBtn.disabled = true; againBtn.disabled = true;
    picker.classList.add("locked");
    try {
      const res = await runGauntlet(track, out, selected);
      runCount += 1;
      const v = certVector(res);
      if (lockVector === null) lockVector = v;
      const same = v === lockVector;
      det.className = "det" + (same ? " locked" : " broke");
      det.innerHTML = same
        ? `run #${runCount} · cert identical <span class="lock">🔒</span>`
        : `run #${runCount} · CERT CHANGED ⚠`;
      againBtn.disabled = false;
      // reveal the "try another call" picker only after the first run — the opening
      // screen is one preselected attack + one button, no choose-first friction.
      const ta = document.getElementById("try-another");
      if (ta) ta.hidden = false;
    } catch (e) {
      showStageError(out, e);
    } finally {
      busy = false; runBtn.disabled = false; picker.classList.remove("locked");
    }
  }

  runBtn.addEventListener("click", run);
  againBtn.addEventListener("click", run);
  setSelected(selected);
  return { getSelected: () => selected };
})();

// ──────────────────────────────────────── POLICY-FLIP STAGE ───────────────────────
(() => {
  const toggle = document.getElementById("quorum-toggle");
  const track = document.getElementById("pf-track");
  const out = document.getElementById("pf-out");
  const runBtn = document.getElementById("pf-run");
  const ruleEl = document.getElementById("pf-rule");
  if (!toggle) return;

  let quorumOn = false, busy = false;
  const scenario = () => (quorumOn ? "pay-after" : "pay-before");

  function paint() {
    toggle.classList.toggle("on", quorumOn);
    toggle.textContent = quorumOn ? "✓ 2-of-3 quorum rule ADDED — remove it" : "+ Add the 2-of-3 quorum rule";
    ruleEl.innerHTML = quorumOn
      ? `<code>consensus.high_stakes = [ "payments.send" ]</code> <span class="sub">— the one new rule</span>`
      : `<code>consensus.high_stakes = [ ]</code> <span class="sub">— no quorum rule</span>`;
    track.innerHTML = ""; out.innerHTML = ""; out.className = "verdict-out";
  }

  toggle.addEventListener("click", () => { if (!busy) { quorumOn = !quorumOn; paint(); } });
  runBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true; runBtn.disabled = true; toggle.disabled = true;
    try { await runGauntlet(track, out, scenario()); }
    catch (e) { showStageError(out, e); }
    finally { busy = false; runBtn.disabled = false; toggle.disabled = false; }
  });
  paint();
})();

// (The three-lane contrast was cut: two of its lanes were illustrative RNG, and
// invented leak rates next to real verdicts read as rigged. The Policy Lab's live
// DENY→ALLOW makes the "proof holds" point truthfully, with no invented numbers.)

// surface a failed decision (e.g. the WASM module did not load) instead of a dead stage.
function showStageError(out, e) {
  out.className = "verdict-out killed";
  out.innerHTML =
    `<div class="big-verdict deny">ENGINE ERROR</div>` +
    `<div class="verdict-why">${(e && e.message) || e}</div>` +
    `<div class="verdict-tag">The verified kernel could not be reached. Serve this over HTTP (not file://) so the WASM module can load — e.g. <code>cd public &amp;&amp; python3 -m http.server</code>, then open <code>http://localhost:8000</code>.</div>`;
}

// warm the WASM module so the first decision is instant; works with no backend, so we
// do not flag offline merely because /api/decide is absent.
ready().catch(() => {});

// signal that the module evaluated and wired its listeners; index.html shows a boot
// banner if this never flips (the usual cause is opening the file as file://).
window.__gauntletReady = true;
