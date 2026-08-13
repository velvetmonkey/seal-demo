#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Claims drift guard. The trust-boundary text is credibility-critical and is
// mirrored in the README; this asserts the mirror is a verbatim copy of the
// canonical block in docs/LIMITATIONS.md, so drift fails loudly instead of
// shipping silently. It adds no new claim — it locks existing wording.
//
// Guarded block:
//   trust-boundaries (<!-- trust-boundaries:begin --> ... <!-- ...:end -->)
//   canonical docs/LIMITATIONS.md, mirror README.md
//
// Exit codes: 0 in sync · 1 drift (diff printed) · 2 markers missing/malformed.
// Node only, no dependencies. Run: node scripts/claims-drift.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BLOCKS = [
  { begin: "<!-- trust-boundaries:begin -->", end: "<!-- trust-boundaries:end -->",
    canonical: "docs/LIMITATIONS.md", mirrors: ["README.md"] },
];

const CLAIM_MANIFEST = [
  ["README.md", "each boundary is known and has a named closure path outside the kernel, closed or open as stated below."],
  ["docs/LIMITATIONS.md", "Lane C runs a wasm-vs-interpreted-Lean differential in seal-host CI over a fixed corpus; it is evidence over that corpus, not a universal binary-equals-model proof."],
];

function extract(file, begin, end) {
  let text;
  try {
    text = readFileSync(resolve(ROOT, file), "utf8");
  } catch (e) {
    console.error(`ERROR  ${file}: ${e.message}`);
    process.exit(2);
  }
  const i = text.indexOf(begin);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) {
    console.error(`ERROR  ${file}: markers missing or malformed (need ${begin} ... ${end})`);
    process.exit(2);
  }
  if (text.indexOf(begin, i + 1) !== -1 || text.indexOf(end, j + 1) !== -1) {
    console.error(`ERROR  ${file}: multiple ${begin} pairs — exactly one region per file`);
    process.exit(2);
  }
  return text.slice(i + begin.length, j);
}

// Per-line trim + drop blanks. The claim text contains no HTML tags.
function normalise(block) {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

let drift = false;
for (const blk of BLOCKS) {
  const canonical = normalise(extract(blk.canonical, blk.begin, blk.end));
  if (!canonical) {
    console.error(`ERROR  ${blk.canonical}: canonical block is empty`);
    process.exit(2);
  }
  for (const file of blk.mirrors) {
    const got = normalise(extract(file, blk.begin, blk.end));
    if (got === canonical) {
      console.log(`PASS  ${file} matches ${blk.canonical}`);
      continue;
    }
    drift = true;
    console.error(`FAIL  ${file} diverges from ${blk.canonical}:`);
    const a = canonical.split("\n");
    const b = got.split("\n");
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      if (a[k] !== b[k]) {
        console.error(`  line ${k + 1}:`);
        console.error(`    canonical : ${a[k] ?? "<missing>"}`);
        console.error(`    ${file.padEnd(12)}: ${b[k] ?? "<missing>"}`);
      }
    }
  }
}

for (const [file, claim] of CLAIM_MANIFEST) {
  let text;
  try { text = readFileSync(resolve(ROOT, file), "utf8"); }
  catch (e) { console.error(`ERROR  ${file}: ${e.message}`); process.exit(2); }
  if (text.includes(claim)) console.log(`PASS  ${file} contains repaired claim`);
  else { drift = true; console.error(`FAIL  ${file} missing repaired claim: ${claim}`); }
}

if (drift) {
  console.error("\nCLAIMS DRIFT — edit the canonical file first, then mirror verbatim.");
  process.exit(1);
}
console.log("all claim blocks in sync across all surfaces");
