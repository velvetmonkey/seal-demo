// SPDX-License-Identifier: Apache-2.0
// §11.1 unparseable-request rule (normative: seal-host docs/DECISION-RECEIPT-SCHEMA.md,
// producer: seal-host main @ 3a74dbf) against public/receipt-format.js. Lines
// exist that the kernel mediates and serde cannot re-parse; their receipts carry
// request_sha256 + request_parse_error and omit the structured request fields.
//
// Run:  node test/receipt-format.test.mjs   (this repo has no CI; run manually)
import * as F from "../public/receipt-format.js";

let failures = 0;
function check(name, got, want) {
  const pass = got === want;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : `\n      got  ${got}\n      want ${want}`}`);
}

const UNP_FIELDS = {
  now: 1000,
  request_sha256: "c".repeat(64),
  request_parse_error: "cannot parse mediated request for receipt: number out of range at line 1 column 145",
  bypass: false, verdict: "BLOCK", reason: "safety kernel: cert", deny_kernel: "safety",
  certs: [], emitted_bytes: "{}",
  kernel_identity: { wasm_sha256: "0".repeat(64), self_verified: true },
  signed_config: { payload: "{\"epoch\":1}", signature: "a".repeat(128), pubkey: "b".repeat(64) },
  kernel_config: { epoch: 1 }, granted_capabilities: [],
};

const asm = F.assembleReceiptV2({ ...UNP_FIELDS });
check("assembleReceiptV2 preserves request_sha256 + request_parse_error (§11.5)",
  JSON.stringify(Object.keys(asm)),
  JSON.stringify(["seal_receipt", "now", "request_sha256", "request_parse_error", "bypass",
    "verdict", "reason", "deny_kernel", "certs", "emitted_bytes", "kernel_identity",
    "signed_config", "kernel_config", "granted_capabilities"]));
check("unparseable-request roundtrip byte-identical",
  JSON.stringify(F.assembleReceiptV2(JSON.parse(JSON.stringify(asm)))), JSON.stringify(asm));

const args = { operation: "insert", table: "t" };
const withBoth = F.assembleReceiptV2({
  tool: "db.execute", arguments: args, now: 1000,
  canonical_request_sha256: F.canonicalRequestSha256("db.execute", args),
  request_sha256: "c".repeat(64),
  bypass: false, verdict: "BLOCK", reason: "r", deny_kernel: "safety",
  certs: [], emitted_bytes: "{}",
  kernel_identity: { wasm_sha256: "0".repeat(64), self_verified: true },
  signed_config: { payload: "{\"epoch\":1}", signature: "a".repeat(128), pubkey: "b".repeat(64) },
  kernel_config: { epoch: 1 }, granted_capabilities: [],
});
const keys = Object.keys(withBoth);
check("request_sha256 sits between canonical_request_sha256 and bypass (§11.5 order)",
  JSON.stringify(keys.slice(keys.indexOf("canonical_request_sha256"), keys.indexOf("bypass") + 1)),
  JSON.stringify(["canonical_request_sha256", "request_sha256", "bypass"]));

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
