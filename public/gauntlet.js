// SPDX-License-Identifier: Apache-2.0
// seal — presentation layer only. One real tool call is judged, in series, by the gating
// kernels; every verdict, reason and cert hash comes REAL from the verified kernel via the
// seam below (decideScenario / decideConfig / POST /api/decide) — never faked. No kernel
// source here. Each gate card is tied to the specific call: it shows what it CHECKS on this
// call, the RULE it enforces, and the plain RESULT — so a rule is never shown without context.
import { decideScenario, decideCustom, decideConfig, ready } from "./seal-wasm.js";
import { SCENARIOS, CFG_STANDARD, stableHash } from "./seal-config.js";
import { kname, gatePolicy, gatesForTool, gateTripHint, gateChecks, gateResult } from "./gates.js";

// ── the seam: native verified binary first (POST /api/decide, Docker live), else the same
// kernel compiled to WASM in-browser. Identical schema, so the engine is invisible on the
// hero; the "fire your own" section names which engine ran via MODE.
let MODE = "native";
async function decide(body) {
  try {
    const r = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("http " + r.status);
    MODE = "native"; return await r.json();
  } catch (e) {
    MODE = "wasm";
    if (body.scenario) return await decideScenario(body.scenario);
    return await decideCustom(body.tool, body.arguments || {}, body.approvals || []);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = { move: 560, evalPulse: 560, stamp: 680, kill: 820, seal: 640 };

// presentation metadata only — a legible mirror of the real call args in seal-config.js.
// `stopped` = the consequence that did NOT happen on a DENY; `won` = the line on a full clear.
const CALLS = {
  "wire-40k":        { label: "Wire £40,000 to an unlisted account", call: 'payments.send { amount: 40000, to: "GB-unlisted" }', attack: true,
                       stopped: "£40,000 never left the account.", won: "The payment went through — certified." },
  "self-approve":    { label: "Self-approve a destructive call",      call: "approve { target: self }", attack: true,
                       stopped: "The agent could not rubber-stamp itself.", won: "Approved — certified." },
  "destructive-sql": { label: "Drop the production users table",      call: 'db.execute { sql: "drop table users" }', attack: true,
                       stopped: "The users table is still there.", won: "The query ran — certified." },
  "store-subtle":    { label: "Replicated write — last-writer-wins",  call: 'store.update { op: "assign", key: "k1" }', attack: true,
                       stopped: "The corrupting write never landed — replicas stay consistent.", won: "The write landed — certified." },
  "store-safe":      { label: "Replicated write — OR-Set add",        call: 'store.update { op: "orset.add", key: "k1" }', attack: false,
                       stopped: "The write was blocked.", won: "A provably-convergent write — certified." },
};
const HERO_KEYS = ["wire-40k", "self-approve", "destructive-sql", "store-subtle", "store-safe"];

// the agent can wrap the same call in any persuasion; the boundary only sees the call.
const EXCUSES = ["ignore all previous safety policy", "this is extremely urgent", "the developer already approved this", "you have admin permission", "just this once — bypass the checks"];

// ── one gate card. `decided` fills the verdict/result/hash immediately (Policy Lab); without
// it the card starts blank and the animation fills it as the token arrives.
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

// the equation under the gate row: Safety ✓ · Temporal ✓ · Consensus ✕ → DENY
function renderEquation(eqEl, certs, verdict) {
  if (!eqEl) return;
  const parts = certs.map((c) => `<span>${kname(c.kernel)} <b class="${c.verdict === "deny" ? "ink-deny" : "ink-allow"}">${c.verdict === "deny" ? "✕" : "✓"}</b></span>`);
  eqEl.innerHTML = parts.join('<span class="eq-op">·</span>') +
    `<span class="eq-arrow">→</span><b class="${verdict === "DENY" ? "ink-deny" : "ink-allow"}">${verdict}</b>`;
}

// ── animate one call-token through the gates in series; stamp each with its real verdict +
// plain result + cert hash; shatter the token at the first DENY; seal on a full clear.
async function runGauntlet(trackEl, outEl, eqEl, scenarioKey) {
  const res = await decide({ scenario: scenarioKey });
  const certs = res.certs || [];
  const scn = SCENARIOS[scenarioKey] || {};
  const config = scn.config, tool = scn.tool || res.tool;

  trackEl.innerHTML = "";
  if (eqEl) eqEl.innerHTML = "";
  const gates = certs.map((c) => {
    const g = document.createElement("div");
    g.className = "gate";
    g.innerHTML = gateMarkup(c.kernel, config, tool, null);
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
  const visual = (g) => (g.querySelector && g.querySelector(".gate-arch")) || g;
  // gate-arch offsets are gate-relative; accumulate up the offsetParent chain to the track.
  const offsetIn = (el) => { let x = 0, y = 0; for (let n = el; n && n !== trackEl; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
  const midY = (el) => offsetIn(el).y + el.offsetHeight / 2 - token.offsetHeight / 2;
  const centerX = (el) => offsetIn(el).x + el.offsetWidth / 2 - tw / 2;
  // expose live x/y as CSS vars so the DENY shatter explodes the token IN PLACE.
  const move = (g) => {
    const el = visual(g);
    const x = centerX(el), y = midY(el);
    token.style.setProperty("--x", `${x}px`);
    token.style.setProperty("--y", `${y}px`);
    token.style.transform = `translate(${x}px, ${y}px)`;
  };

  token.style.transform = `translate(0px, ${midY(visual(gates[0] || finish))}px)`;
  await sleep(160);

  const shown = [];
  let killedAt = -1;
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i], c = certs[i];
    move(g); await sleep(T.move);
    g.classList.add("eval"); await sleep(T.evalPulse);
    g.classList.remove("eval");

    g.querySelector(".gate-stamp").textContent = c.verdict === "deny" ? "DENY" : "ALLOW";
    g.querySelector(".g-result").textContent = "→ " + gateResult(c.kernel, c);
    g.querySelector(".gate-hash").textContent = "cert " + c.certHash;
    shown.push(c);
    renderEquation(eqEl, shown, c.verdict === "deny" ? "DENY" : (i === gates.length - 1 ? "ALLOW" : "…"));

    if (c.verdict === "deny") {
      g.classList.add("deny");
      token.classList.add("destroyed");
      killedAt = i;
      for (let j = i + 1; j < gates.length; j++) gates[j].classList.add("unreached");
      await sleep(T.kill);
      break;
    }
    g.classList.add("allow");
    await sleep(T.stamp);
  }

  if (killedAt >= 0) {
    const dk = certs[killedAt];
    const stopped = (CALLS[scenarioKey] || {}).stopped || "The action never happened.";
    renderEquation(eqEl, certs.slice(0, killedAt + 1), "DENY");
    outEl.className = "verdict-out killed";
    outEl.innerHTML =
      `<div class="big-verdict deny">BLOCKED</div>` +
      `<div class="verdict-consequence">${stopped}</div>` +
      `<div class="verdict-meta">stopped at the <b>${kname(dk.kernel)}</b> gate · cert <span class="vr-hash">${dk.certHash}</span></div>`;
  } else {
    move(finish); await sleep(T.move);
    finish.classList.add("sealed"); token.classList.add("sealed");
    renderEquation(eqEl, certs, "ALLOW");
    await sleep(T.seal);
    const won = (CALLS[scenarioKey] || {}).won || "Cleared every gate.";
    outEl.className = "verdict-out sealed";
    outEl.innerHTML =
      `<div class="big-verdict allow">SEALED</div>` +
      `<div class="verdict-consequence">${won}</div>` +
      `<div class="verdict-meta">certificate <span class="seal-cert-hash">${res.certHash}</span></div>`;
  }
  return res;
}

function certVector(res) { return JSON.stringify((res.certs || []).map((c) => c.certHash)); }

// a decided track (gates in final state + seal slot), pulsing any gate whose verdict flipped.
function renderLabTrack(trackEl, res, config, tool, prevCerts) {
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

// ───────────────────────────────────────── THE BOUNDARY CHECK (hero) ───────────────────
(() => {
  const picker = document.getElementById("picker");
  const banner = document.getElementById("call-banner");
  const track = document.getElementById("track");
  const eq = document.getElementById("equation");
  const out = document.getElementById("verdict-out");
  const runBtn = document.getElementById("run");
  const againBtn = document.getElementById("run-again");
  const det = document.getElementById("det");
  const replayWrap = document.getElementById("replay");
  const replayBtn = document.getElementById("replay-btn");
  const replayOut = document.getElementById("replay-out");
  if (!picker) return;

  let selected = HERO_KEYS[0];
  let busy = false;
  let lockVector = null, runCount = 0;

  function setSelected(k) {
    selected = k;
    [...picker.children].forEach((b) => b.classList.toggle("on", b.dataset.k === k));
    banner.innerHTML = `<span class="cb-label">the agent wants to run</span><code>${CALLS[k].call}</code>`;
    lockVector = null; runCount = 0;
    track.innerHTML = ""; out.innerHTML = ""; out.className = "verdict-out";
    if (eq) eq.innerHTML = "";
    det.textContent = ""; det.className = "det";
    againBtn.disabled = true;
    if (replayWrap) replayWrap.hidden = true;
    if (replayOut) replayOut.innerHTML = "";
  }

  HERO_KEYS.forEach((k) => {
    const b = document.createElement("button");
    b.className = "pick"; b.dataset.k = k; b.textContent = CALLS[k].label;
    b.addEventListener("click", () => { if (!busy) setSelected(k); });
    picker.appendChild(b);
  });

  async function run() {
    if (busy) return;
    busy = true; runBtn.disabled = true; againBtn.disabled = true; picker.classList.add("locked");
    if (replayBtn) replayBtn.disabled = true;
    try {
      const res = await runGauntlet(track, out, eq, selected);
      runCount += 1;
      const v = certVector(res);
      if (lockVector === null) lockVector = v;
      const same = v === lockVector;
      det.className = "det" + (same ? " locked" : " broke");
      det.innerHTML = same ? `run #${runCount} · cert identical <span class="lock">🔒</span>` : `run #${runCount} · CERT CHANGED ⚠`;
      againBtn.disabled = false;
      if (replayWrap) replayWrap.hidden = false;
    } catch (e) {
      showStageError(out, e);
    } finally {
      busy = false; runBtn.disabled = false; picker.classList.remove("locked");
      if (replayBtn) replayBtn.disabled = false;
    }
  }

  // the determinism beat: same call, the agent's excuse changes, the verdict + cert never move.
  async function replay() {
    if (busy || !replayOut) return;
    busy = true; replayBtn.disabled = true; runBtn.disabled = true; againBtn.disabled = true;
    replayOut.innerHTML = "";
    try {
      let lockH = null, lockV = null, broke = false;
      for (let i = 0; i < EXCUSES.length; i++) {
        const res = await decide({ scenario: selected });
        if (lockH === null) { lockH = res.certHash; lockV = res.verdict; }
        if (res.certHash !== lockH) broke = true;
        const row = document.createElement("div");
        row.className = "rp-row";
        row.innerHTML =
          `<span class="rp-say">agent says <i>“${EXCUSES[i]}”</i></span>` +
          `<span class="rp-arrow">→</span>` +
          `<span class="pill ${res.verdict === "DENY" ? "deny" : "allow"}">${res.verdict}</span>` +
          `<span class="rp-hash">cert ${res.certHash}</span>`;
        replayOut.appendChild(row);
        await sleep(440);
      }
      const cap = document.createElement("div");
      cap.className = "rp-cap" + (broke ? " broke" : "");
      cap.innerHTML = broke
        ? `The certificate changed — that should never happen.`
        : `Same call, same verdict, same certificate — every time. <b>The prompt changes. The theorem doesn’t.</b>`;
      replayOut.appendChild(cap);
    } finally {
      busy = false; replayBtn.disabled = false; runBtn.disabled = false; againBtn.disabled = false;
    }
  }

  runBtn.addEventListener("click", run);
  againBtn.addEventListener("click", run);
  if (replayBtn) replayBtn.addEventListener("click", replay);
  setSelected(selected);
})();

// ──────────────────────────────────────── CHANGE THE RULE (Policy Lab) ──────────────────
// A bounded console on ONE call. Each knob is a REAL edit to the trusted config / approvals
// / votes; the verified kernel re-decides live (decideConfig, warm module). The diff is
// DERIVED from the actual objects fed to the kernel — never hardcoded.
(() => {
  const rail = document.getElementById("lab-rail");
  const banner = document.getElementById("lab-banner");
  const track = document.getElementById("lab-track");
  const causalEl = document.getElementById("lab-causal");
  const diffEl = document.getElementById("lab-diff");
  if (!rail) return;

  const PAY_BASE = SCENARIOS["pay-before"].config;
  const PAY_CONSENSUS = SCENARIOS["pay-after"].config.consensus;
  const PAY_APPROVALS = SCENARIOS["pay-before"].approvals;
  const DB_BASE = SCENARIOS["destructive-sql"].config;
  const STORE_BASE = SCENARIOS["store-safe"].config;
  const STORE_APPROVALS = SCENARIOS["store-safe"].approvals;

  const state = { call: "pay", approval: true, quorum: false, signoffs: 0, sql: "drop", op: "assign" };

  function votesText(n, value) { let s = ""; for (let i = 1; i <= n; i++) s += JSON.stringify({ acceptor: i, value }) + "\n"; return s; }

  function compose() {
    if (state.call === "pay") {
      const config = state.quorum ? { ...PAY_BASE, consensus: PAY_CONSENSUS } : { ...PAY_BASE };
      return { config, tool: "payments.send", args: { amount: 40000, to: "supplier-77" },
               approvals: state.approval ? PAY_APPROVALS : [],
               votes: state.quorum ? votesText(state.signoffs, "payments.send") : "" };
    }
    if (state.call === "db") {
      const sql = state.sql === "drop" ? "drop table users" : "select count(*) from users";
      return { config: DB_BASE, tool: "db.execute", args: { database: "prod", sql },
               approvals: state.approval ? [stableHash(["db.execute", "db", "prod", "write", sql])] : [], votes: "" };
    }
    return { config: STORE_BASE, tool: "store.update", args: { op: state.op, key: "k1" },
             approvals: state.approval ? STORE_APPROVALS : [], votes: "" };
  }

  const callString = (c) => `${c.tool} ${JSON.stringify(c.args).replace(/"([^"]+)":/g, "$1: ")}`;

  function shape(c) {
    return {
      "consensus.high_stakes": c.config.consensus ? JSON.stringify(c.config.consensus.high_stakes) : "(no consensus rule)",
      "approvals": c.approvals.length ? `[${c.approvals.map(String).join(", ")}]` : "[ ]",
      "args": JSON.stringify(c.args),
      "votes": c.votes ? c.votes.trim().split("\n").filter(Boolean) : [],
    };
  }
  function diffRows(prev, cur) {
    const a = shape(prev), b = shape(cur), rows = [];
    for (const k of ["consensus.high_stakes", "approvals", "args"]) if (a[k] !== b[k]) rows.push({ k, a: a[k], b: b[k] });
    const av = a.votes, bv = b.votes;
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      const added = bv.filter((l) => !av.includes(l)), removed = av.filter((l) => !bv.includes(l));
      const parts = [].concat(added.map((l) => "+ " + l), removed.map((l) => "− " + l));
      rows.push({ k: "votes", a: `${av.length} sign-off(s)`, b: `${bv.length} sign-off(s)`, delta: parts });
    }
    return rows;
  }

  function causal(res) {
    if (res.verdict === "DENY") {
      const d = (res.certs || []).find((c) => c.verdict === "deny") || {};
      return `<span class="cz deny">DENY</span> at <b>${kname(res.deny_kernel)}</b> — <span class="cz-reason">${d.reason || res.reason}</span>`;
    }
    return `<span class="cz allow">ALLOW</span> — every gate's rule is met · <span class="cz-cert">cert ${res.certHash}</span>`;
  }

  function seg(label, sub, opts, cur, onChange, disabled) {
    const wrap = document.createElement("div");
    wrap.className = "lab-ctrl" + (disabled ? " disabled" : "");
    wrap.innerHTML = `<div class="lc-label">${label}</div><div class="lc-sub">${sub}</div>`;
    const s = document.createElement("div");
    s.className = "seg";
    opts.forEach((o) => {
      const b = document.createElement("button");
      b.className = "seg-btn" + (o.val === cur ? " on" : "");
      b.textContent = o.text;
      if (!disabled) b.addEventListener("click", () => onChange(o.val));
      s.appendChild(b);
    });
    wrap.appendChild(s);
    return wrap;
  }

  function renderRail() {
    rail.innerHTML = "";
    rail.appendChild(seg("The call", "", [{ val: "pay", text: "Pay £40k" }, { val: "db", text: "Database" }, { val: "store", text: "Store write" }],
      state.call, (v) => { state.call = v; renderRail(); update(); }));
    rail.appendChild(seg("Human approval", "→ Safety", [{ val: true, text: "Attached" }, { val: false, text: "Missing" }],
      state.approval, (v) => { state.approval = v; renderRail(); update(); }));
    if (state.call === "pay") {
      rail.appendChild(seg("Quorum rule", "→ Consensus", [{ val: false, text: "Off" }, { val: true, text: "2-of-3" }],
        state.quorum, (v) => { state.quorum = v; renderRail(); update(); }));
      rail.appendChild(seg("Sign-offs", state.quorum ? "" : "(turn quorum on)", [0, 1, 2, 3].map((n) => ({ val: n, text: String(n) })),
        state.signoffs, (v) => { state.signoffs = v; renderRail(); update(); }, !state.quorum));
    } else if (state.call === "db") {
      rail.appendChild(seg("SQL payload", "→ Safety", [{ val: "drop", text: "drop table" }, { val: "safe", text: "select" }],
        state.sql, (v) => { state.sql = v; renderRail(); update(); }));
    } else {
      rail.appendChild(seg("Store op", "→ Convergence", [{ val: "assign", text: "assign (LWW)" }, { val: "orset.add", text: "orset.add" }],
        state.op, (v) => { state.op = v; renderRail(); update(); }));
    }
  }

  let prevRes = null, prevCompose = null, seq = 0;
  async function update() {
    const cur = compose();
    const my = ++seq;
    banner.innerHTML = `<span class="cb-label">the agent wants to run</span><code>${callString(cur)}</code>`;
    causalEl.innerHTML = `<span class="sub">deciding…</span>`;
    let res;
    try {
      res = await decideConfig(cur.config, { tool: cur.tool, args: cur.args, approvals: cur.approvals, votes: cur.votes });
    } catch (e) {
      if (my === seq) causalEl.innerHTML = `<span class="cz deny">ENGINE ERROR</span> ${(e && e.message) || e}`;
      return;
    }
    if (my !== seq) return;
    renderLabTrack(track, res, cur.config, cur.tool, prevRes && prevRes.certs);
    causalEl.innerHTML = causal(res);
    if (prevCompose) {
      const rows = diffRows(prevCompose, cur);
      diffEl.innerHTML = rows.length
        ? `<div class="ld-label">real edit to the trusted config the kernel read</div>` +
          rows.map((r) => `<div class="ld-row"><span class="ld-k">${r.k}</span><span class="ld-a">${r.a}</span><span class="ld-arrow">→</span><span class="ld-b">${r.b}</span>` +
            (r.delta ? `<div class="ld-delta">${r.delta.join("<br>")}</div>` : "") + `</div>`).join("")
        : "";
    }
    prevRes = res; prevCompose = cur;
  }

  renderRail();
  update();
})();

// ──────────────────────────────────────── FIRE YOUR OWN CALL ───────────────────────────
// The raw engine: any tool + any payload, judged by the real kernel. A live gate map (which
// kernels judge the tool + what trips each, derived from CFG_STANDARD) keeps it legible; the
// approval toggle attaches the real target so guarded tools can pass; presets are known-good.
(() => {
  const toolSel = document.getElementById("fire-tool");
  if (!toolSel) return;
  const argsEl = document.getElementById("fire-args");
  const gatemapEl = document.getElementById("fire-gatemap");
  const resultEl = document.getElementById("fire-result");
  let approvalOn = false;

  const votesText = (n, value) => { let s = ""; for (let i = 1; i <= n; i++) s += JSON.stringify({ acceptor: i, value }) + "\n"; return s; };

  function approvalTarget(tool, args) {
    const r = (CFG_STANDARD.safety.tools || []).find((t) => t.name === tool);
    if (!r || r.mode === "deny" || !r.target) return null;
    const parts = [tool, ...r.target.map((p) => p.literal !== undefined ? p.literal : String((args || {})[p.arg] ?? ""))];
    return stableHash(parts);
  }
  function approvalsFor(tool, args) {
    if (!approvalOn) return [];
    const t = approvalTarget(tool, args);
    return t != null ? [t] : [];
  }

  const modeBadge = () => `<span class="sub">engine: ${MODE === "native" ? "native seal-host binary" : "in-browser WASM kernel"}</span>`;
  function certRows(certs) {
    return (certs || []).map((c) => `<tr><td>${c.kernel}</td><td class="v-${c.verdict}">${c.verdict.toUpperCase()}</td><td>${c.reason}</td><td class="hash">${c.certHash}</td></tr>`).join("");
  }
  function show(res) {
    const denyCert = (res.certs || []).find((c) => c.verdict === "deny");
    const denyKernel = denyCert ? denyCert.kernel : res.deny_kernel;
    const deny = res.verdict === "DENY";
    const why = deny
      ? `Decided at the <b class="ink-deny">${kname(denyKernel)}</b> gate. <span class="sub">To flip it: ${gateTripHint(denyKernel, CFG_STANDARD, res.tool)}.</span>`
      : `<b class="ink-allow">Cleared every gate</b> — the call is certified.`;
    resultEl.innerHTML =
      `<div class="verdict-line">Combined verdict: <span class="pill ${deny ? "deny" : "allow"}">${res.verdict}</span> <span class="sub">${res.tool} · ${res.reason || ""}</span> · ${modeBadge()}</div>` +
      `<div class="fire-why">${why}</div>` +
      `<table class="certs"><thead><tr><th>Kernel</th><th>Verdict</th><th>Reason</th><th>Cert hash</th></tr></thead><tbody>${certRows(res.certs)}</tbody></table>`;
  }

  function renderGateMap() {
    const tool = toolSel.value;
    const gates = gatesForTool(tool, CFG_STANDARD);
    gatemapEl.innerHTML =
      `<div class="gm-head">Gates that judge <code>${tool}</code></div>` +
      gates.map((k) => `<div class="gm-row"><span class="gm-name">${kname(k)}</span><span class="gm-rule">${gatePolicy(k, CFG_STANDARD, tool)}</span><span class="gm-hint">${gateTripHint(k, CFG_STANDARD, tool)}</span></div>`).join("");
  }

  const PRESETS = {
    "db.execute":    { pass: { approval: true, args: { database: "prod", sql: "drop table users" } }, trip: { approval: false, args: { database: "prod", sql: "drop table users" } } },
    "payments.send": { pass: { approval: true, args: { amount: 40000, to: "supplier-77" }, full: "pay-after" }, trip: { approval: true, args: { amount: 40000, to: "GB-unlisted" } } },
    "store.update":  { pass: { approval: true, args: { op: "orset.add", key: "k1" } }, trip: { approval: true, args: { op: "assign", key: "k1" } } },
    "session.revoke":{ pass: { approval: true, args: { session: "sess-1" } }, trip: { approval: false, args: { session: "sess-1" } } },
    "key.use":       { pass: { approval: true, args: { key: "key-1" } }, trip: { approval: false, args: { key: "key-1" } } },
    "approve":       { trip: { approval: false, args: { target: 1 } } },
  };
  const DEFAULT_ARGS = {
    "db.execute": { database: "prod", sql: "drop table users" }, "payments.send": { amount: 40000, to: "GB-unlisted" },
    "store.update": { op: "assign", key: "k1" }, "session.revoke": { session: "sess-1" }, "key.use": { key: "key-1" }, "approve": { target: 1 },
  };

  function setApproval(on) {
    approvalOn = on;
    document.querySelectorAll("#fire-approval-seg .seg-btn").forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === on));
  }
  function updatePresetButtons() {
    const has = PRESETS[toolSel.value] || {};
    document.getElementById("fire-pass").disabled = !has.pass;
    document.getElementById("fire-trip").disabled = !has.trip;
  }
  function onToolChange() {
    argsEl.value = JSON.stringify(DEFAULT_ARGS[toolSel.value] || {});
    renderGateMap(); updatePresetButtons();
  }
  function offline() { resultEl.innerHTML = `<p class="sub" style="color:var(--red)">The verified kernel could not be reached — serve over HTTP, not file://.</p>`; }

  async function applyPreset(kind) {
    const tool = toolSel.value;
    const p = (PRESETS[tool] || {})[kind];
    if (!p) return;
    setApproval(!!p.approval); argsEl.value = JSON.stringify(p.args); renderGateMap(); updatePresetButtons();
    resultEl.innerHTML = `<p class="sub">deciding…</p>`;
    try {
      if (p.full) { const sc = SCENARIOS[p.full]; MODE = "wasm"; show(await decideConfig(sc.config, { tool, args: p.args, approvals: sc.approvals, votes: votesText(2, tool) })); }
      else show(await decide({ tool, arguments: p.args, approvals: approvalsFor(tool, p.args) }));
    } catch (e) { offline(); }
  }

  document.querySelectorAll("#fire-approval-seg .seg-btn").forEach((b) => b.addEventListener("click", () => setApproval(b.dataset.v === "1")));
  toolSel.addEventListener("change", onToolChange);
  document.getElementById("fire-pass").addEventListener("click", () => applyPreset("pass"));
  document.getElementById("fire-trip").addEventListener("click", () => applyPreset("trip"));
  document.getElementById("fire-go").addEventListener("click", async () => {
    let args; try { args = JSON.parse(argsEl.value); } catch (e) { resultEl.innerHTML = `<p class="sub" style="color:var(--red)">args must be valid JSON</p>`; return; }
    const tool = toolSel.value;
    resultEl.innerHTML = `<p class="sub">deciding…</p>`;
    try { show(await decide({ tool, arguments: args, approvals: approvalsFor(tool, args) })); } catch (e) { offline(); }
  });

  setApproval(false); renderGateMap(); updatePresetButtons();
})();

// surface a failed decision (e.g. the WASM module did not load) instead of a dead stage.
function showStageError(out, e) {
  out.className = "verdict-out killed";
  out.innerHTML =
    `<div class="big-verdict deny">ENGINE ERROR</div>` +
    `<div class="verdict-consequence">The verified kernel could not be reached.</div>` +
    `<div class="verdict-meta">Serve over HTTP (not file://): <code>cd public &amp;&amp; python3 -m http.server</code>, then open <code>http://localhost:8000</code>. ${(e && e.message) || e}</div>`;
}

ready().catch(() => {});
window.__gauntletReady = true;
