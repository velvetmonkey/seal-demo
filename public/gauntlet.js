// SPDX-License-Identifier: Apache-2.0
// THE GAUNTLET — presentation layer only. Renders one real tool-call decision as a
// single moving object that travels through the gating kernels IN SERIES. Every gate,
// stamp, reason and cert hash comes from the verified kernel via the seam below
// (decideScenario / POST /api/decide) — never faked. The illustrative raw/ML lanes in
// the three-lane contrast are RNG and labelled as such. No kernel source here.
import { decideScenario, ready } from "./seal-wasm.js";

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
const CALLS = {
  "wire-40k":        { label: "Wire £40,000 to an unlisted account",            call: 'payments.send { amount: 40000, to: "GB-unlisted" }', attack: true },
  "destructive-sql": { label: "Drop the production users table",                call: 'db.execute { sql: "drop table users" }',             attack: true },
  "self-approve":    { label: "Self-approve my own destructive call",           call: "approve { target: self }",                            attack: true },
  "store-subtle":    { label: "Write to a replicated store — last-writer-wins", call: 'store.update { op: "assign", key: "k1" }',            attack: true },
  "store-safe":      { label: "Write to a replicated store — OR-Set add",       call: 'store.update { op: "orset.add", key: "k1" }',         attack: false },
  "pay-before":      { label: "Pay supplier-77 £40,000",                        call: 'payments.send { amount: 40000, to: "supplier-77" }', attack: false },
  "pay-after":       { label: "Pay supplier-77 £40,000",                        call: 'payments.send { amount: 40000, to: "supplier-77" }', attack: true },
};
// scenarios offered in the hero picker (the policy-flip pay-before/after live in their own stage)
const HERO_KEYS = ["wire-40k", "destructive-sql", "self-approve", "store-subtle", "store-safe"];

const KERNEL = {
  safety:      { name: "Safety",      sub: "approval gate" },
  temporal:    { name: "Temporal",    sub: "trace gate" },
  consensus:   { name: "Consensus",   sub: "quorum gate" },
  convergence: { name: "Convergence", sub: "CRDT gate" },
  calibration: { name: "Calibration", sub: "calibration gate" },
  linear:      { name: "Linear",      sub: "resource gate" },
  budget:      { name: "Budget",      sub: "budget gate" },
};
const kname = (k) => (KERNEL[k] || { name: k }).name;
const ksub = (k) => (KERNEL[k] || { sub: "gating kernel" }).sub;

// ── the gate track. Builds gates from the REAL certs array (only the kernels that
// gated this call), animates one call-token through them in series, stamps each gate
// with its real verdict/reason/hash, kills the token at the first deny, seals on a
// full clear. Returns the raw decision so callers can do determinism bookkeeping.
async function runGauntlet(trackEl, outEl, scenarioKey) {
  const res = await decide({ scenario: scenarioKey });
  const certs = res.certs || [];

  // build track: gates + finish slot + the moving token
  trackEl.innerHTML = "";
  const gates = certs.map((c, i) => {
    const g = document.createElement("div");
    g.className = "gate";
    g.innerHTML =
      `<div class="gate-head"><span class="gate-name">${kname(c.kernel)}</span><span class="gate-sub">${ksub(c.kernel)}</span></div>` +
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
  const midY = (el) => el.offsetTop + el.offsetHeight / 2 - token.offsetHeight / 2;
  const centerX = (el) => el.offsetLeft + el.offsetWidth / 2 - tw / 2;
  const move = (el) => { token.style.transform = `translate(${centerX(el)}px, ${midY(el)}px)`; };

  // park token at the start (left of gate 0)
  token.style.transform = `translate(0px, ${midY(gates[0] || finish)}px)`;
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
    outEl.className = "verdict-out killed";
    outEl.innerHTML =
      `<div class="big-verdict deny">DENY</div>` +
      `<div class="verdict-why"><b>${kname(certs[killedAt].kernel)} gate</b> — ${certs[killedAt].reason}</div>` +
      `<div class="verdict-tag">The call was destroyed at the gate. The action never happened.</div>`;
  } else {
    move(finish); await sleep(T.move);
    finish.classList.add("sealed"); token.classList.add("sealed");
    await sleep(T.seal);
    const vector = certs.map((c) => c.certHash);
    outEl.className = "verdict-out sealed";
    outEl.innerHTML =
      `<div class="big-verdict allow">ALLOW · SEALED</div>` +
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

// ──────────────────────────────────────── THREE-LANE CONTRAST ─────────────────────
// seal's lane is the REAL kernel (deterministic). raw/ML lanes are illustrative RNG,
// labelled as such — they show probability leaking while proof holds.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

(() => {
  const lanesEl = document.getElementById("lanes");
  const runBtn = document.getElementById("lane-run");
  const nInput = document.getElementById("lane-n");
  const tally = document.getElementById("lane-tally");
  if (!lanesEl) return;

  // illustrative leak rates: raw model mostly obeys the jailbreak; ML guardrail misses ~30%
  const LANES = [
    { key: "raw",  name: "Raw model",    tag: "illustrative · no guard",          block: (rng) => rng() < 0.2, real: false },
    { key: "ml",   name: "ML guardrail", tag: "illustrative · probabilistic",     block: (rng) => rng() < 0.7, real: false },
    { key: "seal", name: "seal",         tag: "REAL verified kernel",             block: null,                  real: true },
  ];
  const ATTACK = "wire-40k"; // the headline £40k wire — same attack into all three lanes

  function laneShell() {
    lanesEl.innerHTML = "";
    return LANES.map((L) => {
      const el = document.createElement("div");
      el.className = "lane2" + (L.real ? " solid" : " porous");
      el.innerHTML = `<div class="lane2-head"><span class="lane2-name">${L.name}</span><span class="lane2-tag ${L.real ? "real" : "illus"}">${L.tag}</span></div><div class="lane2-cells"></div><div class="lane2-score"></div>`;
      lanesEl.appendChild(el);
      return el;
    });
  }

  async function run() {
    const N = Math.max(1, Math.min(40, parseInt(nInput.value, 10) || 12));
    runBtn.disabled = true; nInput.disabled = true;
    const shells = laneShell();
    const blocked = [0, 0, 0];
    const seeds = [...ATTACK].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    const rngs = LANES.map((L, i) => mulberry32(seeds ^ (L.key.length * 2654435761) ^ (i * 40503)));
    try {
      for (let r = 0; r < N; r++) {
        for (let li = 0; li < LANES.length; li++) {
          const L = LANES[li];
          let isBlocked;
          if (L.real) { const res = await decide({ scenario: ATTACK }); isBlocked = res.verdict === "DENY"; }
          else { isBlocked = L.block(rngs[li]); }
          if (isBlocked) blocked[li] += 1;
          const cell = document.createElement("div");
          cell.className = "cell2 " + (isBlocked ? "blocked" : "leaked");
          cell.textContent = isBlocked ? "✓" : "✗";
          if (!isBlocked) cell.title = "leaked";
          shells[li].querySelector(".lane2-cells").appendChild(cell);
          shells[li].querySelector(".lane2-score").innerHTML =
            L.real ? `<b>${blocked[li]}/${r + 1}</b> blocked · proof holds`
                   : `<b>${(r + 1) - blocked[li]}/${r + 1}</b> leaked`;
          await sleep(34);
        }
      }
      tally.innerHTML =
        `Raw model leaked <b class="bad">${N - blocked[0]}/${N}</b> · ` +
        `ML guardrail leaked <b class="bad">${N - blocked[1]}/${N}</b> · ` +
        `seal blocked <b class="good">${blocked[2]}/${N}</b> — every run.`;
    } catch (e) {
      tally.innerHTML = `<span style="color:var(--red)">could not reach the kernel — ${(e && e.message) || e}</span>`;
    } finally {
      runBtn.disabled = false; nInput.disabled = false;
    }
  }
  runBtn.addEventListener("click", run);
})();

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
