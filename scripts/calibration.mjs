#!/usr/bin/env node
// Calibration report (D18): reads archived run histories and asks, per trajectory rubric,
// whether the advisory scores separate stages that bounced/parked from stages that passed.
// A trajectory rubric is eligible for promotion from advisory to gating once there are ≥10
// runs and the advisory means separate (passed-stage mean minus failed-stage mean ≥ 0.15).
//
// Usage: node scripts/calibration.mjs [<historyDir>]   (default .delivery/history)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(process.cwd(), '.delivery', 'history');
if (!existsSync(dir)) {
  console.log(`No run history at ${dir}. Complete at least 2 runs (they archive on finish) then re-run.`);
  process.exit(0);
}
const runs = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
if (runs.length < 2) {
  console.log(`Only ${runs.length} archived run(s) at ${dir}; the report needs ≥2. Complete more runs.`);
  process.exit(0);
}

// Pair each trajectory advisory (subject traj-<X>) with its artifact judgment (<X>) to learn
// whether that stage passed, then bucket the advisory score accordingly.
const PROMOTE_MIN_RUNS = 10;
const SEPARATION = 0.15;
const byRubric = new Map();

for (const run of runs) {
  const judgments = run.judgments ?? [];
  const artifactPass = new Map(judgments.filter((j) => !j.subject.startsWith('traj-')).map((j) => [j.subject, j.passed]));
  for (const j of judgments) {
    if (!j.subject.startsWith('traj-')) continue;
    const target = j.subject.slice('traj-'.length);
    const stagePassed = artifactPass.get(target);
    if (stagePassed === undefined) continue;
    if (!byRubric.has(j.rubric)) byRubric.set(j.rubric, { passed: [], failed: [] });
    byRubric.get(j.rubric)[stagePassed ? 'passed' : 'failed'].push(j.overall);
  }
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const rows = [];
for (const [rubric, { passed, failed }] of byRubric) {
  const mp = mean(passed);
  const mf = mean(failed);
  const separation = mp !== null && mf !== null ? mp - mf : null;
  const eligible = runs.length >= PROMOTE_MIN_RUNS && separation !== null && separation >= SEPARATION;
  rows.push({ rubric, n_pass: passed.length, n_fail: failed.length, mean_pass: mp, mean_fail: mf, separation, promote: eligible });
}
rows.sort((a, b) => a.rubric.localeCompare(b.rubric));

console.log(`Calibration over ${runs.length} archived run(s) — promotion needs ≥${PROMOTE_MIN_RUNS} runs and a passed−failed separation ≥ ${SEPARATION}.\n`);
const fmt = (x) => (x === null ? '  —  ' : x.toFixed(3));
for (const r of rows) {
  console.log(`${r.rubric.padEnd(22)} pass n=${String(r.n_pass).padEnd(3)} μ=${fmt(r.mean_pass)}  fail n=${String(r.n_fail).padEnd(3)} μ=${fmt(r.mean_fail)}  sep=${fmt(r.separation)}  → ${r.promote ? 'PROMOTE to gating' : 'stay advisory'}`);
}
if (!rows.length) console.log('No paired trajectory advisories found yet.');
