#!/usr/bin/env node
// Aggregates a judge's raw scores into a judgment per the rubric's aggregation block.
// The model scores; this code does all arithmetic (weights, normalization, gate caps,
// not_scored renormalization). Fail-closed: a gate with no result is a failed gate.
//
// Usage:
//   node scripts/aggregate.mjs <rubric.json> <judge-output.json> [--deterministic=<results.json>]
//     [--threshold=0.7] [--out=<judgment.json>] [--register --subject=<name>]
//
// judge-output.json: { gates: [{id, passed, evidence}], dimensions: [{id, score|null, evidence, not_scored_reason?}] }
// deterministic results file: [{ id | check, passed, reason }] — takes precedence for matching gate ids.
//
// Threshold precedence: --threshold flag > rubric.threshold field > 0.7.
// This script writes its own judgment file (--out) and registers it (--register via stage.mjs),
// so no model token generation sits between the computation and the file a gate reads (T2).
//
// Output: judgment JSON on stdout. Exit 0 if judgment.passed, 1 if not, 2 on usage error.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('='))
);
if (args.length < 2) {
  console.error('usage: aggregate.mjs <rubric.json> <judge-output.json> [--deterministic=<results.json>] [--threshold=0.7]');
  process.exit(2);
}

const rubric = JSON.parse(readFileSync(args[0], 'utf8'));
const judge = JSON.parse(readFileSync(args[1], 'utf8'));
const deterministic = flags.deterministic ? JSON.parse(readFileSync(flags.deterministic, 'utf8')) : [];
const threshold = flags.threshold !== undefined
  ? Number(flags.threshold)
  : (rubric.threshold !== undefined ? Number(rubric.threshold) : 0.7);

const { min, max } = rubric.scale;
const judgeGates = new Map((judge.gates ?? []).map((g) => [g.id, g]));
const detByGate = new Map(deterministic.map((d) => [d.id ?? d.check, d]));

// --- Gates: deterministic results win; missing evaluation fails closed. ---
const gates = (rubric.gates ?? []).map((g) => {
  const detName = typeof g.check === 'object' ? g.check.deterministic : null;
  const det = detByGate.get(g.id) ?? (detName ? detByGate.get(detName) : undefined);
  if (det) return { id: g.id, passed: !!det.passed, evidence: det.reason ?? 'deterministic check', source: 'deterministic' };
  const j = judgeGates.get(g.id);
  if (j) return { id: g.id, passed: !!j.passed, evidence: j.evidence ?? '', source: 'llm' };
  return { id: g.id, passed: false, evidence: 'gate was not evaluated — failing closed', source: 'missing' };
});
const gatesFailed = gates.filter((g) => !g.passed);

// --- Dimensions: not_scored excluded from both weight sums (renormalization). ---
const rubricDims = new Map((rubric.dimensions ?? []).map((d) => [d.id, d]));
const dimensions = (judge.dimensions ?? [])
  .filter((d) => rubricDims.has(d.id))
  .map((d) => ({ ...d, weight: rubricDims.get(d.id).weight }));
const scored = dimensions.filter((d) => typeof d.score === 'number');
for (const d of scored) {
  if (d.score < min || d.score > max) {
    console.error(`dimension ${d.id} score ${d.score} outside scale [${min},${max}]`);
    process.exit(2);
  }
}
const missingDims = [...rubricDims.keys()].filter((id) => !dimensions.some((d) => d.id === id));

const weightSum = scored.reduce((s, d) => s + d.weight, 0);
const overallUncapped = weightSum === 0
  ? 0
  : (scored.reduce((s, d) => s + d.weight * d.score, 0) / weightSum - min) / (max - min);

// --- Gate caps: lowest applicable cap wins, applied after normalization. ---
const caps = gatesFailed.map((g) => {
  const def = rubric.gates.find((r) => r.id === g.id);
  return def?.on_fail === 'cap' ? def.cap_value : 0;
});
const overall = Math.min(overallUncapped, ...(caps.length ? caps : [Infinity]));

// --- Remediation: failed gates first, then weak dimensions. ---
const remediation = [
  ...gatesFailed.map((g) => {
    const def = rubric.gates.find((r) => r.id === g.id);
    return `GATE ${g.id} failed: ${g.evidence || def.description}`;
  }),
  ...scored
    .filter((d) => d.score <= 2)
    .map((d) => {
      const def = rubricDims.get(d.id);
      return `DIMENSION ${d.id} scored ${d.score}/5 (${d.evidence || 'no evidence cited'}). Target: ${def.anchors?.['5'] ?? def.description}`;
    }),
];

const judgment = {
  rubric: rubric.target?.name ?? 'unknown',
  overall: Math.round(overall * 1000) / 1000,
  overall_uncapped: Math.round(overallUncapped * 1000) / 1000,
  threshold,
  passed: gatesFailed.every((g) => (rubric.gates.find((r) => r.id === g.id)?.severity) !== 'critical')
    && overall >= threshold
    && missingDims.length === 0,
  gates,
  gates_failed: gatesFailed.map((g) => g.id),
  dimensions_scored: scored.map(({ id, score, weight, evidence }) => ({ id, score, weight, evidence })),
  dimensions_not_scored: dimensions
    .filter((d) => typeof d.score !== 'number')
    .map(({ id, not_scored_reason }) => ({ id, reason: not_scored_reason ?? 'not scored' })),
  dimensions_missing: missingDims,
  remediation,
};

const rendered = JSON.stringify(judgment, null, 2);
console.log(rendered);

// Self-write and self-register: the file a gate reads is code output, not agent text (T2).
if (flags.out) writeFileSync(flags.out, rendered);
if (flags.register) {
  if (!flags.out) { console.error('--register requires --out'); process.exit(2); }
  if (!flags.subject) { console.error('--register requires --subject'); process.exit(2); }
  execFileSync('node', [
    join(HERE, 'stage.mjs'), 'judgment',
    `--subject=${flags.subject}`,
    `--rubric=${rubric.target?.name ?? 'unknown'}`,
    `--path=${flags.out}`,
  ], { stdio: 'ignore' });
}

process.exit(judgment.passed ? 0 : 1);
