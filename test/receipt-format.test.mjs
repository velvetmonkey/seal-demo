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

// --- §11.1/§11.2 unparseable-request rule: validation ------------------------
const unp = F.assembleReceiptV2({ ...UNP_FIELDS });
let v = F.validateReceipt(unp);
check("unparseable-request receipt validates clean (§11.2)",
  JSON.stringify([v.ok, v.version, v.errors]), JSON.stringify([true, "v2", []]));
for (const [k, vv] of [["tool", "db.execute"], ["arguments", {}],
  ["args_hash", "0".repeat(64)], ["canonical_request", "{}"],
  ["canonical_request_sha256", "0".repeat(64)]]) {
  v = F.validateReceipt({ ...unp, [k]: vv });
  check(`unparseable + ${k} rejected (fabrication)`, v.ok, false);
}
v = F.validateReceipt({ ...unp, request_sha256: "nothex" });
check("unparseable non-hex request_sha256 rejected", v.ok, false);
const noRaw = { ...unp };
delete noRaw.request_sha256;
v = F.validateReceipt(noRaw);
check("unparseable without request_sha256 rejected", v.ok, false);
v = F.validateReceipt({ ...unp, bypass: true });
check("bypass + request_parse_error rejected (mediated receipts only)",
  v.errors.some((e) => e.includes("only a mediated receipt")), true);

// --- receipt-diff: raw-line identity, never a false "tampered" ---------------
const { receiptDiff } = await import("../public/receipt-diff.js");
const same = receiptDiff(unp, JSON.parse(JSON.stringify(unp)));
check("receipt-diff: identical unparseable receipts diff clean (no false 'tampered')",
  JSON.stringify([same.result, same.integrity, same.exit]),
  JSON.stringify(["NO AUTHORIZATION-SURFACE DRIFT", "clean", 0]));
const other = { ...unp, request_sha256: "d".repeat(64) };
const diff = receiptDiff(unp, other);
check("receipt-diff: differing raw lines are authorization drift",
  JSON.stringify([diff.result, JSON.stringify(diff.authorization).includes("raw line sha256")]),
  JSON.stringify(["AUTHORIZATION DRIFT", true]));

console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
