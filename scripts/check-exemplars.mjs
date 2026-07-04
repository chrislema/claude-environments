#!/usr/bin/env node
// Verification contract from rubrics/README.md, executable: a rubric may not be trusted
// until its judge separates the embedded exemplars.
//
//   known-good: no critical gates failed AND overall >= expected.overall_min
//   known-bad:  expected.gates_failed all tripped, OR overall <= expected.overall_max
//
// Usage: node scripts/check-exemplars.mjs <rubric.json> <good-judgment.json> <bad-judgment.json>
// Output: {rubric, good: {...}, bad: {...}, trusted} — exit 0 iff trusted.

import { readFileSync } from 'node:fs';

const [rubricPath, goodPath, badPath] = process.argv.slice(2);
if (!badPath) {
  console.error('usage: check-exemplars.mjs <rubric.json> <good-judgment.json> <bad-judgment.json>');
  process.exit(2);
}

const rubric = JSON.parse(readFileSync(rubricPath, 'utf8'));
const good = JSON.parse(readFileSync(goodPath, 'utf8'));
const bad = JSON.parse(readFileSync(badPath, 'utf8'));
const exp = rubric.exemplars;

const goodExpected = exp.known_good.expected;
const goodGatesOk = (goodExpected.gates_failed ?? []).length === 0
  ? good.gates_failed.length === 0
  : goodExpected.gates_failed.every((g) => good.gates_failed.includes(g));
const goodScoreOk = good.overall >= (goodExpected.overall_min ?? 0);

const badExpected = exp.known_bad.expected;
const badGatesOk = (badExpected.gates_failed ?? []).length > 0
  && badExpected.gates_failed.every((g) => bad.gates_failed.includes(g));
const badScoreOk = badExpected.overall_max !== undefined && bad.overall <= badExpected.overall_max;
const badOk = badGatesOk || badScoreOk;

const result = {
  rubric: rubric.target?.name ?? rubricPath,
  good: {
    ok: goodGatesOk && goodScoreOk,
    overall: good.overall,
    required_min: goodExpected.overall_min ?? 0,
    gates_failed: good.gates_failed,
  },
  bad: {
    ok: badOk,
    overall: bad.overall,
    allowed_max: badExpected.overall_max,
    expected_gates: badExpected.gates_failed ?? [],
    gates_failed: bad.gates_failed,
    tripped_via: badGatesOk ? 'gates' : badScoreOk ? 'score' : 'neither',
  },
  trusted: goodGatesOk && goodScoreOk && badOk,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.trusted ? 0 : 1);
