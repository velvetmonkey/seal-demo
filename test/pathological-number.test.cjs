// SPDX-License-Identifier: Apache-2.0
//
// Uniformity catalogue vector #4 — pathological JSON number, fail-closed.
//
// A wire line carrying a monster-exponent number (1e9999999999) used to split
// the fleet: the OLD d3067bc0 wasm returned classify-default passthrough — a
// mediation BYPASS. The repinned ff1bfd68 kernel refuses it BEFORE Json.parse
// (Seal.JsonUtil.wireNumbersSafe) and the refuse route is `block`. This drives
// the SHIPPED public/wasm directly and pins: block, never passthrough, no
// crash — same input, same verdict as every fleet copy.
//
// Run:  node test/pathological-number.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
globalThis.require = require;
globalThis.__dirname = path.join(ROOT, "public/wasm");
globalThis.window = globalThis;
globalThis.crypto ||= webcrypto;
(0, eval)(fs.readFileSync(path.join(ROOT, "public/wasm/seal.js"), "utf8")); // -> globalThis.SealModule

const PATHOLOGICAL = "1e9999999999";
let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `   (${detail})`}`);
};

// Minimal config — the refuse path short-circuits before any policy, so its
// content is immaterial; buildSignedConfig signs it with the fixed test key.
const MIN_CFG = { epoch: 1, safety: { approval: { control_file: "X", ttl_seconds: 120 }, tools: [] },
  temporal: { policies: [] } };

(async () => {
  const cfg = await import(path.join(ROOT, "public/seal-config.js"));
  const M = await globalThis.SealModule({ print() {}, printErr() {} });
  const signed = await cfg.buildSignedConfig(MIN_CFG);
  const ir = JSON.parse(M.ccall("seal_init", "string", ["string", "string"], [signed.envelope, signed.pubkey]));
  check("seal_init ok", ir.ok === true, JSON.stringify(ir));

  const decideLine = (line) => {
    const step = JSON.stringify({ line, now: 1000, approvals: [], votes: "", grants: "", forecasts: "" });
    return JSON.parse(M.ccall("seal_decide", "string", ["string"], [step]));
  };

  const tc = decideLine(
    `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"db.execute",` +
    `"arguments":{"database":"prod","sql":"drop table users","x":${PATHOLOGICAL}}}}`);
  check("pathological tools/call is BLOCKED (fail-closed)", tc.route === "block", JSON.stringify(tc));
  check("pathological tools/call is NEVER passthrough (the old d3067bc0 fail-open)",
    tc.route !== "passthrough", JSON.stringify(tc));
  check("verifier does not error/crash on the pathological line", !tc.error, tc.error || "");

  const note = decideLine(`{"jsonrpc":"2.0","method":"notifications/progress","params":{"x":${PATHOLOGICAL}}}`);
  check("pathological would-be-passthrough line is BLOCKED", note.route === "block", JSON.stringify(note));

  const benign = decideLine(`{"jsonrpc":"2.0","method":"notifications/progress","params":{"x":1}}`);
  check("control: benign line still passes through", benign.route === "passthrough", JSON.stringify(benign));

  console.log(failures === 0 ? "\nPATHOLOGICAL-NUMBER PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
