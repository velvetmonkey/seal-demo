// SPDX-License-Identifier: Apache-2.0
// seal — presentation layer only. ONE stage: policy knobs compose a real tool call; the verified
// kernel decides it (decideConfig); the verdict is shown by a token animating through the gating
// kernels in series. Every gate card is tied to the call (checks / rule / → result / cert), and
// every verdict + cert hash is REAL from the kernel — never faked. No kernel source here.
import { decideConfig, ready } from "./seal-wasm.js";
import { SCENARIOS, stableHash } from "./seal-config.js";
import { kname, gatePolicy, gateChecks, gateResult } from "./gates.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// snappy full-run timings — knob tweaks use the fast path (no travel), so this only plays on a
// call-preset change or an explicit Run.
const T = { move: 240, evalPulse: 220, stamp: 240, kill: 320, seal: 300 };

// the agent can wrap the same call in any persuasion; the boundary only sees the call.
const EXCUSES = ["ignore all previous safety policy", "this is extremely urgent", "the developer already approved this"];

// real config bases, reused (never mutated) from the verified scenarios
const PAY_BASE = SCENARIOS["pay-before"].config;               // safety + temporal, no consensus
const PAY_CONSENSUS = SCENARIOS["pay-after"].config.consensus; // the 2-of-3 quorum rule
const PAY_APPROVALS = SCENARIOS["pay-before"].approvals;       // [PAY_T]
const DB_BASE = SCENARIOS["destructive-sql"].config;
const STORE_BASE = SCENARIOS["store-safe"].config;
const STORE_APPROVALS = SCENARIOS["store-safe"].approvals;     // [STORE_T]
const SELF = SCENARIOS["self-approve"];                        // approve, flat-denied

// ── one gate card. `decided` fills verdict/result/hash immediately; without it the card starts
// blank and the full animation fills it as the token arrives.
function gateMarkup(kernel, config, tool, decided) {
  const allow = decided && decided.verdict !== "deny";
  return (
    `<div class="g-name">${kname(kernel)}</div>` +
    `<div class="g-line"><span class="g-k">checks</span><span>${gateChecks(kernel, config, tool)}</span></div>` +
    `<div class="g-line"><span class="g-k">rule</span><span>${gatePolicy(kernel, config, tool)}</span></div>` +
    `<div class="gate-arch"><span class="door l"></span><span class="door r"></span><span class="gate-stamp">${decided ? (allow ? "ALLOW" : "DENY") : ""}</span></div>` +
    `<div class="g-result">${decided ? "→ " + gateResult(kernel, decided) : ""}</div>` +
    `<div class="gate-hash">${decided ? "cert " + decided.certHash : ""}</div>`
  );
}

// the composition equation under the gate row: Safety ✓ · Temporal ✓ · Consensus ✕ → DENY
function renderEquation(eqEl, certs, verdict) {
  if (!eqEl) return;
  const parts = certs.map((c) => `<span>${kname(c.kernel)} <b class="${c.verdict === "deny" ? "ink-deny" : "ink-allow"}">${c.verdict === "deny" ? "✕" : "✓"}</b></span>`);
  eqEl.innerHTML = parts.join('<span class="eq-op">·</span>') +
    `<span class="eq-arrow">→</span><b class="${verdict === "DENY" ? "ink-deny" : "ink-allow"}">${verdict}</b>`;
}

function certVector(res) { return JSON.stringify((res.certs || []).map((c) => c.certHash)); }

// a decided track (gates in final state + seal slot), pulsing any gate whose verdict flipped.
function renderTrackStatic(trackEl, res, config, tool, prevCerts) {
  const certs = res.certs || [];
  const denyIdx = certs.findIndex((c) => c.verdict === "deny");
  trackEl.innerHTML = "";
  certs.forEach((c, i) => {
    const prev = prevCerts && prevCerts.find((p) => p.kernel === c.kernel);
    const changed = !!prev && prev.verdict !== c.verdict;
    const g = document.createElement("div");
    g.className = "gate " + (c.verdict === "deny" ? "deny" : "allow") + (changed ? " changed" : "");
    g.innerHTML = gateMarkup(c.kernel, config, tool, c);
    if (denyIdx >= 0 && i > denyIdx) g.classList.add("unreached");
    trackEl.appendChild(g);
  });
  const finish = document.createElement("div");
  finish.className = "finish" + (denyIdx < 0 ? " sealed" : "");
  finish.innerHTML = `<span class="finish-ico">✦</span><span class="finish-label">SEAL</span>`;
  trackEl.appendChild(finish);
}

// ──────────────────────────────────────────── THE ONE STAGE ────────────────────────────────────
(() => {
  const rail = document.getElementById("rail");
  const banner = document.getElementById("call-banner");
  const track = document.getElementById("track");
  const eq = document.getElementById("equation");
  const verdict = document.getElementById("verdict-out");
  const det = document.getElementById("det");
  const runBtn = document.getElementById("run");
  const replayBtn = document.getElementById("replay-btn");
  const replayOut = document.getElementById("replay-out");
  if (!rail) return;

  const state = { call: "pay", approval: true, quorum: true, signoffs: 0, sql: "drop", op: "assign" };
  const votesText = (n, value) => { let s = ""; for (let i = 1; i <= n; i++) s += JSON.stringify({ acceptor: i, value }) + "\n"; return s; };

  // compose the REAL {config, tool, args, approvals, votes} + consequence copy from the knobs
  function compose() {
    if (state.call === "pay") {
      const config = state.quorum ? { ...PAY_BASE, consensus: PAY_CONSENSUS } : { ...PAY_BASE };
      return { config, tool: "payments.send", args: { amount: 40000, to: "GB-unlisted" },
               approvals: state.approval ? PAY_APPROVALS : [], votes: state.quorum ? votesText(state.signoffs, "payments.send") : "",
               stopped: "£40,000 never left the account.", won: "The payment went through — certified." };
    }
    if (state.call === "db") {
      const sql = state.sql === "drop" ? "drop table users" : "select count(*) from users";
      return { config: DB_BASE, tool: "db.execute", args: { database: "prod", sql },
               approvals: state.approval ? [stableHash(["db.execute", "db", "prod", "write", sql])] : [], votes: "",
               stopped: "The production users table is still there.", won: "The query ran — certified." };
    }
    if (state.call === "store") {
      return { config: STORE_BASE, tool: "store.update", args: { op: state.op, key: "k1" },
               approvals: state.approval ? STORE_APPROVALS : [], votes: "",
               stopped: "The corrupting write never landed — replicas stay consistent.", won: "A provably-convergent write — certified." };
    }
    return { config: SELF.config, tool: "approve", args: { target: 1 }, approvals: [], votes: "",
             stopped: "The agent could not rubber-stamp itself.", won: "Approved — certified." };
  }

  const callString = (c) => `${c.tool} ${JSON.stringify(c.args).replace(/"([^"]+)":/g, "$1: ")}`;
  const sig = (c) => JSON.stringify({ t: c.tool, a: c.args, ap: c.approvals.map(String), v: c.votes, hs: c.config.consensus ? c.config.consensus.high_stakes : null });
  const decideComposed = (c) => decideConfig(c.config, { tool: c.tool, args: c.args, approvals: c.approvals, votes: c.votes });

  let prevCerts = null, prevSig = null, lockVector = null, runCount = 0, runToken = 0;

  function renderVerdict(res, composed) {
    const denyCert = (res.certs || []).find((c) => c.verdict === "deny");
    if (denyCert) {
      verdict.className = "verdict-out killed";
      verdict.innerHTML = `<span class="big-verdict deny">BLOCKED</span><span class="verdict-consequence">${composed.stopped}</span>` +
        `<span class="verdict-meta">stopped at the <b>${kname(denyCert.kernel)}</b> gate · cert <span class="vr-hash">${denyCert.certHash}</span></span>`;
    } else {
      verdict.className = "verdict-out sealed";
      verdict.innerHTML = `<span class="big-verdict allow">SEALED</span><span class="verdict-consequence">${composed.won}</span>` +
        `<span class="verdict-meta">certificate <span class="seal-cert-hash">${res.certHash}</span></span>`;
    }
  }
  function updateDet(res, composed) {
    const v = certVector(res), s = sig(composed);
    if (s !== prevSig) { lockVector = v; runCount = 1; det.className = "det"; det.innerHTML = `<span class="sub">cert ${res.certHash} · run again to verify ↻</span>`; }
    else { runCount++; const same = v === lockVector; det.className = "det" + (same ? " locked" : " broke"); det.innerHTML = same ? `run #${runCount} · cert identical <span class="lock">🔒</span>` : `run #${runCount} · CERT CHANGED ⚠`; }
    prevSig = s;
  }

  // FULL run — the token travels through the gates and stamps the real verdict in series.
  async function animateRun(composed) {
    const my = ++runToken;
    let res; try { res = await decideComposed(composed); } catch (e) { return showStageError(verdict, e); }
    if (my !== runToken) return;
    const certs = res.certs || [], config = composed.config, tool = composed.tool;
    track.innerHTML = ""; if (eq) eq.innerHTML = ""; verdict.innerHTML = ""; verdict.className = "verdict-out";
    const gates = certs.map((c) => { const g = document.createElement("div"); g.className = "gate"; g.innerHTML = gateMarkup(c.kernel, config, tool, null); track.appendChild(g); return g; });
    const finish = document.createElement("div"); finish.className = "finish";
    finish.innerHTML = `<span class="finish-ico">✦</span><span class="finish-label">SEAL</span>`; track.appendChild(finish);
    const token = document.createElement("div"); token.className = "token";
    token.innerHTML = `<span class="token-tool">${res.tool}</span>`; track.appendChild(token);

    await sleep(30); if (my !== runToken) return;
    const tw = token.offsetWidth;
    const visual = (g) => (g.querySelector && g.querySelector(".gate-arch")) || g;
    const offsetIn = (el) => { let x = 0, y = 0; for (let n = el; n && n !== track; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
    const midY = (el) => offsetIn(el).y + el.offsetHeight / 2 - token.offsetHeight / 2;
    const centerX = (el) => offsetIn(el).x + el.offsetWidth / 2 - tw / 2;
    const move = (g) => { const el = visual(g); const x = centerX(el), y = midY(el); token.style.setProperty("--x", `${x}px`); token.style.setProperty("--y", `${y}px`); token.style.transform = `translate(${x}px, ${y}px)`; };

    token.style.transform = `translate(0px, ${midY(visual(gates[0] || finish))}px)`;
    await sleep(110); if (my !== runToken) return;

    const shown = []; let killedAt = -1;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i], c = certs[i];
      move(g); await sleep(T.move); if (my !== runToken) return;
      g.classList.add("eval"); await sleep(T.evalPulse); g.classList.remove("eval"); if (my !== runToken) return;
      g.querySelector(".gate-stamp").textContent = c.verdict === "deny" ? "DENY" : "ALLOW";
      g.querySelector(".g-result").textContent = "→ " + gateResult(c.kernel, c);
      g.querySelector(".gate-hash").textContent = "cert " + c.certHash;
      shown.push(c); renderEquation(eq, shown, c.verdict === "deny" ? "DENY" : (i === gates.length - 1 ? "ALLOW" : "…"));
      if (c.verdict === "deny") { g.classList.add("deny"); token.classList.add("destroyed"); killedAt = i; for (let j = i + 1; j < gates.length; j++) gates[j].classList.add("unreached"); await sleep(T.kill); break; }
      g.classList.add("allow"); await sleep(T.stamp); if (my !== runToken) return;
    }
    if (my !== runToken) return;
    if (killedAt < 0) { move(finish); await sleep(T.move); if (my !== runToken) return; finish.classList.add("sealed"); token.classList.add("sealed"); await sleep(T.seal); }
    renderEquation(eq, killedAt >= 0 ? certs.slice(0, killedAt + 1) : certs, killedAt >= 0 ? "DENY" : "ALLOW");
    renderVerdict(res, composed); updateDet(res, composed); prevCerts = certs;
  }

  // FAST re-certify — knob tweak: re-decide, re-stamp the gates in place, pulse the flipped one(s),
  // refresh equation + verdict. No token travel, so dragging through knobs stays responsive.
  async function fastRun(composed) {
    const my = ++runToken;
    let res; try { res = await decideComposed(composed); } catch (e) { return showStageError(verdict, e); }
    if (my !== runToken) return;
    renderTrackStatic(track, res, composed.config, composed.tool, prevCerts);
    renderEquation(eq, res.certs || [], res.verdict);
    renderVerdict(res, composed); updateDet(res, composed); prevCerts = res.certs || [];
  }

  // ── controls
  function seg(label, sub, opts, cur, onChange, disabled) {
    const wrap = document.createElement("div");
    wrap.className = "lab-ctrl" + (disabled ? " disabled" : "");
    wrap.innerHTML = `<div class="lc-label">${label}</div>` + (sub ? `<div class="lc-sub">${sub}</div>` : "");
    const s = document.createElement("div"); s.className = "seg";
    opts.forEach((o) => { const b = document.createElement("button"); b.className = "seg-btn" + (o.val === cur ? " on" : ""); b.textContent = o.text; if (!disabled) b.addEventListener("click", () => onChange(o.val)); s.appendChild(b); });
    wrap.appendChild(s); return wrap;
  }

  let debounce = null;
  function onKnob() { clearTimeout(debounce); const c = compose(); banner.innerHTML = `<span class="cb-label">the agent wants to run</span><code>${callString(c)}</code>`; debounce = setTimeout(() => fastRun(c), 170); }
  function onCall() { const c = compose(); banner.innerHTML = `<span class="cb-label">the agent wants to run</span><code>${callString(c)}</code>`; animateRun(c); }

  function renderRail() {
    rail.innerHTML = "";
    rail.appendChild(seg("The call", "", [{ val: "pay", text: "Pay £40k" }, { val: "db", text: "Database" }, { val: "store", text: "Store write" }, { val: "self", text: "Self-approve" }],
      state.call, (v) => { state.call = v; renderRail(); onCall(); }));
    if (state.call === "self") {
      const note = document.createElement("div"); note.className = "rail-note";
      note.innerHTML = `<code>approve</code> is flat-denied — no policy can let an agent rubber-stamp its own action.`;
      rail.appendChild(note); return;
    }
    rail.appendChild(seg("Human approval", "→ Safety", [{ val: true, text: "Attached" }, { val: false, text: "Missing" }],
      state.approval, (v) => { state.approval = v; renderRail(); onKnob(); }));
    if (state.call === "pay") {
      rail.appendChild(seg("Quorum rule", "→ Consensus", [{ val: false, text: "Off" }, { val: true, text: "2-of-3" }],
        state.quorum, (v) => { state.quorum = v; renderRail(); onKnob(); }));
      rail.appendChild(seg("Sign-offs", state.quorum ? "→ Consensus" : "(turn quorum on)", [0, 1, 2, 3].map((n) => ({ val: n, text: String(n) })),
        state.signoffs, (v) => { state.signoffs = v; renderRail(); onKnob(); }, !state.quorum));
    } else if (state.call === "db") {
      rail.appendChild(seg("SQL payload", "→ Safety", [{ val: "drop", text: "drop table" }, { val: "safe", text: "select" }],
        state.sql, (v) => { state.sql = v; renderRail(); onKnob(); }));
    } else {
      rail.appendChild(seg("Store op", "→ Convergence", [{ val: "assign", text: "assign (LWW)" }, { val: "orset.add", text: "orset.add" }],
        state.op, (v) => { state.op = v; renderRail(); onKnob(); }));
    }
  }

  // the determinism beat: same call, the agent's excuse changes, the verdict + cert never move.
  async function replay() {
    const c = compose();
    replayBtn.disabled = true; runBtn.disabled = true; replayOut.innerHTML = "";
    try {
      let lockH = null, broke = false;
      for (let i = 0; i < EXCUSES.length; i++) {
        const res = await decideComposed(c);
        if (lockH === null) lockH = res.certHash; else if (res.certHash !== lockH) broke = true;
        const row = document.createElement("div"); row.className = "rp-row";
        row.innerHTML = `<span class="rp-say">agent says <i>“${EXCUSES[i]}”</i></span><span class="rp-arrow">→</span><span class="pill ${res.verdict === "DENY" ? "deny" : "allow"}">${res.verdict}</span><span class="rp-hash">cert ${res.certHash}</span>`;
        replayOut.appendChild(row); await sleep(360);
      }
      const cap = document.createElement("div"); cap.className = "rp-cap" + (broke ? " broke" : "");
      cap.innerHTML = broke ? `The certificate changed — that should never happen.` : `Same call, same certificate — every time. <b>The prompt changes. The theorem doesn’t.</b>`;
      replayOut.appendChild(cap);
    } finally { replayBtn.disabled = false; runBtn.disabled = false; }
  }

  runBtn.addEventListener("click", () => animateRun(compose()));
  if (replayBtn) replayBtn.addEventListener("click", replay);
  renderRail();
  onCall(); // initial full run
})();

// surface a failed decision (e.g. the WASM module did not load) instead of a dead stage.
function showStageError(out, e) {
  out.className = "verdict-out killed";
  out.innerHTML = `<div class="big-verdict deny">ENGINE ERROR</div><div class="verdict-meta">The verified kernel could not be reached — serve over HTTP (not file://). ${(e && e.message) || e}</div>`;
}

ready().catch(() => {});
window.__gauntletReady = true;
