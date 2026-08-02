#!/usr/bin/env node
// Browser-path acceptance harness: same modules, signer, wasm and receipt replay
// as the page, run under Node with only the browser loading seams shimmed.
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const ROOT = path.resolve(__dirname, "..");

globalThis.require = require;
globalThis.__dirname = path.join(ROOT, "public/wasm");
globalThis.crypto = webcrypto;
globalThis.window = globalThis;
globalThis.fetch = async (name) => {
  const bytes = fs.readFileSync(path.join(ROOT, "public", String(name)));
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
(0, eval)(fs.readFileSync(path.join(ROOT, "public/wasm/seal.js"), "utf8"));

let failed = 0;
const check = (label, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const C = await import(path.join(ROOT, "public/seal-config.js"));
  const W = await import(path.join(ROOT, "public/seal-wasm.js"));
  const A = await import(path.join(ROOT, "public/audit.js"));

  const signed = await C.buildSignedConfig(C.SCENARIOS["store-safe"].config);
  const publicKey = await webcrypto.subtle.importKey("raw", Buffer.from(signed.pubkey, "hex"), { name: "Ed25519" }, false, ["verify"]);
  check("RFC 8032 WebCrypto signature verifies over exact payload bytes", await webcrypto.subtle.verify(
    "Ed25519", publicKey, Buffer.from(signed.signature, "hex"), new TextEncoder().encode(signed.payload)));

  const block = await W.decideScenario("destructive-sql");
  const allow = await W.decideScenario("store-safe");
  check("df42 attack scenario BLOCK", block.verdict === "DENY");
  check("df42 benign scenario ALLOW", allow.verdict === "ALLOW");

  const composed = C.SCENARIOS["store-safe"];
  const receipt = await A.buildRunReceipt(allow, composed);
  const verified = await A.verifyRunReceipt(receipt);
  check("receipt signature_valid", verified.signature_valid === true);
  check("receipt kernel_replay_consistent", verified.kernel_replay_consistent === true);
  check("receipt display has no authority claim", !("authority_trusted" in verified));

  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.signed_config.signature = (tampered.signed_config.signature[0] === "0" ? "1" : "0") + tampered.signed_config.signature.slice(1);
  const rejected = await A.verifyRunReceipt(tampered);
  check("tampered signature rejected", rejected.signature_valid === false && rejected.allGood === false);

  const dbA = C.guardTarget("db.execute", { database: "prod", sql: "drop table users" });
  const revokeA = C.guardTarget("session.revoke", {});
  const seq = [
    { tool: "session.revoke", args: {}, approvals: [revokeA] },
    { tool: "db.execute", args: { database: "prod", sql: "drop table users" }, approvals: [dbA] },
  ];
  const temporal = await W.decideSeq(C.CFG_TEMPORAL, seq, "db.execute");
  const temporalComposed = { config: C.CFG_TEMPORAL, tool: "db.execute", args: seq[1].args, seq };
  const temporalReceipt = await A.buildRunReceipt(temporal, temporalComposed);
  const temporalVerified = await A.verifyRunReceipt(temporalReceipt);
  check("ordered temporal receipt replays exact signed config", temporal.verdict === "DENY" && temporalVerified.allGood);

  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exit(1); });
