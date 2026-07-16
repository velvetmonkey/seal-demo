#!/usr/bin/env node
// Profile self-check (seal-assurance-kit docs/VERIFY-PROFILES.md): this
// repo's verifier copy (public/audit.js verifyRunReceipt) declares
// VERIFY_PROFILE = "P-SELFAUDIT" — producer self-audit — and behaves per
// that profile's row:
//   own fresh receipt              -> allGood (self-consistency; no authority claim)
//   tampered bound field           -> allGood=false           (U3 / SELF-5)
//   config-less mediated           -> allGood=false           (binding checked)
//   §11.1-shaped / foreign receipt -> never the success surface (U2/U4 via SELF-4)
// Run: node test/verify-profile.test.mjs  (wired into CI).
//
// A red leg here means the copy is OFF ITS DECLARED PROFILE — a finding to
// report, not a test to re-green by editing the declaration.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// Browser loading seams shimmed, same as scripts/verify-migration.cjs
// (globalThis.crypto is already WebCrypto on Node >= 19 and is getter-only
// under ESM, so unlike the CJS harness it is not reassigned here).
globalThis.require = require;
globalThis.__dirname = path.join(ROOT, "public/wasm");
globalThis.window = globalThis;
globalThis.fetch = async (name) => {
  const bytes = fs.readFileSync(path.join(ROOT, "public", String(name)));
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
(0, eval)(fs.readFileSync(path.join(ROOT, "public/wasm/seal.js"), "utf8"));

let failed = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
};

const C = await import(path.join(ROOT, "public/seal-config.js"));
const W = await import(path.join(ROOT, "public/seal-wasm.js"));
const A = await import(path.join(ROOT, "public/audit.js"));

// --- declaration ---
const src = fs.readFileSync(path.join(ROOT, "public/audit.js"), "utf8");
const m = src.match(/VERIFY_PROFILE[^"']*["'](P-[A-Z]+)["']/);
check("declaration: public/audit.js declares a spec-grammar VERIFY_PROFILE", !!m);
check("declaration: profile is P-SELFAUDIT", m && m[1] === "P-SELFAUDIT", m && m[1]);
check("declaration: exported constant agrees", A.VERIFY_PROFILE === "P-SELFAUDIT",
  String(A.VERIFY_PROFILE));

// --- P-SELFAUDIT behaviour ---
// Own fresh receipt: self-consistent, and the result makes NO authority claim
// (SELF-3: no authority_trusted, no unpinned state — self-consistency only).
const allow = await W.decideScenario("store-safe");
const composed = C.SCENARIOS["store-safe"];
const receipt = await A.buildRunReceipt(allow, composed);
const verified = await A.verifyRunReceipt(receipt);
check("P-SELFAUDIT: own fresh receipt is self-consistent (allGood)", verified.allGood === true);
check("P-SELFAUDIT: no authority claim in the result (SELF-3)",
  !("authority_trusted" in verified), Object.keys(verified).join(","));

// Tamper beat (SELF-5 / U3): a mutated bound field flips to FAIL.
const tampered = JSON.parse(JSON.stringify(receipt));
tampered.args_hash = (tampered.args_hash[0] === "0" ? "1" : "0") + tampered.args_hash.slice(1);
const rejected = await A.verifyRunReceipt(tampered);
check("P-SELFAUDIT: tampered bound field -> not self-consistent (U3)", rejected.allGood === false);

// Config-less mediated receipt: binding is checked (SELF-2) -> never success.
const configless = JSON.parse(JSON.stringify(receipt));
delete configless.signed_config;
const noConfig = await A.verifyRunReceipt(configless);
check("P-SELFAUDIT: config-less mediated -> not self-consistent (SELF-2)",
  noConfig.allGood === false);

// §11.1-shaped input (SELF-4 / U2 / U4): out of the advertised scope — this
// producer never mints one — but if one arrives it must NEVER reach the
// success surface. Shape it per §11.1 (raw-line hash + parse error, no
// structured request fields).
const foreign = JSON.parse(JSON.stringify(receipt));
delete foreign.tool;
delete foreign.arguments;
delete foreign.args_hash;
delete foreign.canonical_request;
delete foreign.canonical_request_sha256;
foreign.request_parse_error = "cannot parse mediated request for receipt: foreign unparseable line";
foreign.request_sha256 = "a".repeat(64);
const reducedShaped = await A.verifyRunReceipt(foreign);
check("P-SELFAUDIT: §11.1-shaped input never reaches the success surface (SELF-4)",
  reducedShaped.allGood === false);

console.log(failed === 0
  ? "\nVERIFY-PROFILE SELF-CHECK PASS — this copy is on its declared P-SELFAUDIT profile"
  : `\n${failed} FAILURE(S) — this copy is off its declared profile; report as a finding`);
process.exit(failed === 0 ? 0 : 1);
