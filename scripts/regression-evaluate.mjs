#!/usr/bin/env node
// Aggregate all regression judge outputs and run the exemplar verification contract
// per rubric. Part of the /rubric-regression command.
//
// Usage: node scripts/regression-evaluate.mjs <workdir>
// Expects <workdir>/manifest.json from regression-prompts.mjs and judge outputs in
// <workdir>/outputs/. Exit 0 iff every rubric is TRUSTED.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [workdir] = process.argv.slice(2);
if (!workdir) {
  console.error('usage: regression-evaluate.mjs <workdir>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(workdir, 'manifest.json'), 'utf8'));

const byRubric = new Map();
for (const m of manifest) {
  if (!byRubric.has(m.rubric)) byRubric.set(m.rubric, { rubricPath: m.rubricPath });
  byRubric.get(m.rubric)[m.kind] = m.output;
}

const rows = [];
let missing = 0;
for (const [name, r] of byRubric) {
  if (!existsSync(r.good) || !existsSync(r.bad)) {
    rows.push({ rubric: name, status: 'MISSING', detail: `awaiting judge output: ${!existsSync(r.good) ? 'good ' : ''}${!existsSync(r.bad) ? 'bad' : ''}` });
    missing += 1;
    continue;
  }
  const judgments = {};
  let aggFailed = null;
  for (const kind of ['good', 'bad']) {
    const jPath = join(workdir, 'outputs', `${name}-${kind}.judgment.json`);
    try {
      let out;
      try {
        out = execFileSync('node', [join(HERE, 'aggregate.mjs'), r.rubricPath, r[kind]], { encoding: 'utf8' });
      } catch (e) {
        if (e.stdout && e.status === 1) out = e.stdout; // judgment produced, just below threshold
        else throw e;
      }
      writeFileSync(jPath, out);
      judgments[kind] = jPath;
    } catch (e) {
      aggFailed = `${kind}: ${(e.stderr || e.message).toString().slice(0, 200)}`;
      break;
    }
  }
  if (aggFailed) {
    rows.push({ rubric: name, status: 'AGG ERROR', detail: aggFailed });
    continue;
  }
  let res; let trusted = false;
  try {
    res = JSON.parse(execFileSync('node', [join(HERE, 'check-exemplars.mjs'), r.rubricPath, judgments.good, judgments.bad], { encoding: 'utf8' }));
    trusted = true;
  } catch (e) {
    res = JSON.parse(e.stdout);
  }
  rows.push({
    rubric: name,
    status: trusted ? 'TRUSTED' : 'UNTRUSTED',
    detail: `good ${res.good.overall} (min ${res.good.required_min})${res.good.gates_failed.length ? ' gates:' + res.good.gates_failed.join(',') : ''} | bad ${res.bad.overall} (max ${res.bad.allowed_max}) via ${res.bad.tripped_via}`,
  });
}

const width = Math.max(...rows.map((r) => r.rubric.length));
for (const r of rows) console.log(`${r.status.padEnd(10)} ${r.rubric.padEnd(width)}  ${r.detail}`);
const untrusted = rows.filter((r) => r.status !== 'TRUSTED');
console.log(`\n${rows.length - untrusted.length}/${rows.length} rubrics trusted${missing ? ` (${missing} awaiting judge output)` : ''}`);
process.exit(untrusted.length ? 1 : 0);
