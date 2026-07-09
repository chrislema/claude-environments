#!/usr/bin/env node
// Self-test for aggregate.mjs arithmetic: weighting, normalization, gate caps,
// not_scored renormalization, fail-closed on missing gates/dimensions.

import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'agg-test-'));

const rubric = {
  target: { name: 'test-rubric' },
  scale: { min: 1, max: 5 },
  gates: [
    { id: 'g_critical', severity: 'critical', on_fail: 'cap', cap_value: 0.0, check: 'llm' },
    { id: 'g_minor', severity: 'minor', on_fail: 'cap', cap_value: 0.5, check: { deterministic: 'some_check' } },
  ],
  dimensions: [
    { id: 'a', weight: 10, anchors: { 5: 'perfect a' } },
    { id: 'b', weight: 5, anchors: { 5: 'perfect b' } },
    { id: 'c', weight: 5, anchors: { 5: 'perfect c' } },
  ],
};
writeFileSync(join(dir, 'rubric.json'), JSON.stringify(rubric));

function run(judgeOut, det, extra = []) {
  writeFileSync(join(dir, 'judge.json'), JSON.stringify(judgeOut));
  const args = [join(HERE, 'aggregate.mjs'), join(dir, 'rubric.json'), join(dir, 'judge.json'), ...extra];
  if (det) {
    writeFileSync(join(dir, 'det.json'), JSON.stringify(det));
    args.push(`--deterministic=${join(dir, 'det.json')}`);
  }
  let out; let code = 0;
  try { out = execFileSync('node', args, { encoding: 'utf8' }); }
  catch (e) { out = e.stdout; code = e.status; }
  return { j: JSON.parse(out), code };
}

const allPass = {
  gates: [{ id: 'g_critical', passed: true, evidence: 'x' }],
  dimensions: [
    { id: 'a', score: 5, evidence: 'x' },
    { id: 'b', score: 5, evidence: 'x' },
    { id: 'c', score: 5, evidence: 'x' },
  ],
};
const detPass = [{ id: 'g_minor', passed: true, reason: 'ok' }];

let failures = 0;
const expect = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

// 1. Perfect scores, all gates pass → overall 1.0, passed.
let r = run(allPass, detPass);
expect('perfect → overall 1.0', r.j.overall, 1);
expect('perfect → passed', r.j.passed, true);

// 2. All 1s → overall 0.0.
r = run({ ...allPass, dimensions: allPass.dimensions.map((d) => ({ ...d, score: 1 })) }, detPass);
expect('floor → overall 0.0', r.j.overall, 0);
expect('floor → not passed', r.j.passed, false);

// 3. Weighted mix: a=5(w10), b=3(w5), c=1(w5) → (50+15+5)/20=3.5 → (3.5-1)/4 = 0.625.
r = run({ ...allPass, dimensions: [
  { id: 'a', score: 5, evidence: 'x' }, { id: 'b', score: 3, evidence: 'x' }, { id: 'c', score: 1, evidence: 'x' },
] }, detPass);
expect('weighted mix → 0.625', r.j.overall, 0.625);

// 4. Critical gate fails → capped to 0 regardless of dimensions.
r = run({ ...allPass, gates: [{ id: 'g_critical', passed: false, evidence: 'violated' }] }, detPass);
expect('critical gate cap → 0', r.j.overall, 0);
expect('critical gate → not passed', r.j.passed, false);
expect('uncapped still 1.0', r.j.overall_uncapped, 1);

// 5. Minor deterministic gate fails → capped to 0.5.
r = run(allPass, [{ id: 'g_minor', passed: false, reason: 'incomplete' }]);
expect('minor gate cap → 0.5', r.j.overall, 0.5);

// 6. not_scored renormalizes: a=5, b not_scored, c=3 → (50+15)/15 ≈ 4.333 → 0.833.
r = run({ ...allPass, dimensions: [
  { id: 'a', score: 5, evidence: 'x' },
  { id: 'b', score: null, not_scored_reason: 'out of scope', evidence: '' },
  { id: 'c', score: 3, evidence: 'x' },
] }, detPass);
expect('renormalized → 0.833', r.j.overall, 0.833);
expect('not_scored listed', r.j.dimensions_not_scored.length, 1);

// 7. Missing gate evaluation fails closed.
r = run({ ...allPass, gates: [] }, detPass);
expect('missing gate → failed closed', r.j.gates_failed, ['g_critical']);
expect('missing gate → overall 0', r.j.overall, 0);

// 8. Missing dimension entirely → not passed, listed.
r = run({ ...allPass, dimensions: allPass.dimensions.slice(0, 2) }, detPass);
expect('missing dimension listed', r.j.dimensions_missing, ['c']);
expect('missing dimension → not passed', r.j.passed, false);

// 9. Remediation content: failed gate + weak dimension both present.
r = run({ gates: [{ id: 'g_critical', passed: false, evidence: 'bad' }], dimensions: [
  { id: 'a', score: 2, evidence: 'thin' }, { id: 'b', score: 5, evidence: 'x' }, { id: 'c', score: 5, evidence: 'x' },
] }, detPass);
expect('remediation count', r.j.remediation.length, 2);

// --- Per-rubric threshold (P8): --threshold flag > rubric.threshold field > 0.7 ---
const mix = { ...allPass, dimensions: [
  { id: 'a', score: 5, evidence: 'x' }, { id: 'b', score: 3, evidence: 'x' }, { id: 'c', score: 1, evidence: 'x' },
] }; // overall 0.625, all gates pass
writeFileSync(join(dir, 'judge.json'), JSON.stringify(mix));
writeFileSync(join(dir, 'det.json'), JSON.stringify(detPass));
const detArg = `--deterministic=${join(dir, 'det.json')}`;
writeFileSync(join(dir, 'rubric-t.json'), JSON.stringify({ ...rubric, threshold: 0.6 }));

const agg = (rubricFile, ...extra) => {
  const a = [join(HERE, 'aggregate.mjs'), join(dir, rubricFile), join(dir, 'judge.json'), detArg, ...extra];
  let out; let code = 0;
  try { out = execFileSync('node', a, { encoding: 'utf8' }); } catch (e) { out = e.stdout; code = e.status; }
  return { j: JSON.parse(out), code };
};

let t = agg('rubric.json');
expect('default threshold 0.7 recorded', t.j.threshold, 0.7);
expect('0.625 < default 0.7 → not passed', t.j.passed, false);

t = agg('rubric-t.json');
expect('rubric.threshold 0.6 honored (recorded)', t.j.threshold, 0.6);
expect('0.625 ≥ rubric.threshold 0.6 → passed', t.j.passed, true);

t = agg('rubric-t.json', '--threshold=0.9');
expect('--threshold flag overrides rubric.threshold', t.j.threshold, 0.9);
expect('0.625 < flag 0.9 → not passed', t.j.passed, false);

// --- Self-write (P8): --out writes the judgment file, byte-identical to stdout ---
const outPath = join(dir, 'judgment.json');
t = agg('rubric.json', `--out=${outPath}`);
const written = JSON.parse(readFileSync(outPath, 'utf8'));
expect('--out file overall matches stdout', written.overall, t.j.overall);
expect('--out file passed matches stdout', written.passed, t.j.passed);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
