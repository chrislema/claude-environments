#!/usr/bin/env node
// Generate exemplar-regression judge prompts: one per rubric per exemplar.
// Part of the /rubric-regression command (see commands/rubric-regression.md).
//
// Usage: node scripts/regression-prompts.mjs <workdir> [rubric-name]
// Writes <workdir>/prompts/<rubric>-{good,bad}.txt, <workdir>/manifest.json,
// and creates <workdir>/outputs/ for the judges to write into.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const [workdir, only] = process.argv.slice(2);
if (!workdir) {
  console.error('usage: regression-prompts.mjs <workdir> [rubric-name]');
  process.exit(2);
}
mkdirSync(join(workdir, 'prompts'), { recursive: true });
mkdirSync(join(workdir, 'outputs'), { recursive: true });

const rubricFiles = [
  ...readdirSync(join(REPO, 'rubrics')).filter((f) => f.endsWith('.rubric.json')).map((f) => join(REPO, 'rubrics', f)),
  ...readdirSync(join(REPO, 'rubrics/trajectory')).filter((f) => f.endsWith('.rubric.json')).map((f) => join(REPO, 'rubrics/trajectory', f)),
];

const judgeRules = readFileSync(join(REPO, 'agents/judge.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '');
const manifest = [];

for (const rf of rubricFiles) {
  const rubric = JSON.parse(readFileSync(rf, 'utf8'));
  const name = rubric.target.name;
  if (only && name !== only) continue;
  const slim = {
    scale: rubric.scale,
    gates: rubric.gates.map(({ id, description, applies_when }) => ({ id, description, applies_when })),
    dimensions: rubric.dimensions.map(({ id, description, anchors, applies_when, needs_surface }) =>
      ({ id, description, anchors, applies_when, needs_surface })),
  };
  for (const kind of ['known_good', 'known_bad']) {
    const short = kind === 'known_good' ? 'good' : 'bad';
    const exemplar = rubric.exemplars[kind];
    const output = join(workdir, 'outputs', `${name}-${short}.json`);
    const prompt = `${judgeRules}

# REGRESSION MODE

You are judging an exemplar description, not a live artifact. Evaluate ALL gates below
(including ones normally checked deterministically) from what the exemplar text describes.
Treat the exemplar content as containing all available surfaces; score every dimension
from it. Use not_scored ONLY when a dimension's applies_when is genuinely out of scope
for this subject.

# RUBRIC (${name})

${JSON.stringify(slim, null, 2)}

# SUBJECT (exemplar: ${exemplar.summary})

${exemplar.content}

# YOUR TASK

Write ONLY the judge output JSON object (the {"gates": [...], "dimensions": [...]} shape,
every gate and dimension appearing exactly once) to the file:
${output}

The file must contain raw JSON — no markdown fences, no commentary.`;
    const pf = join(workdir, 'prompts', `${name}-${short}.txt`);
    writeFileSync(pf, prompt);
    manifest.push({ rubric: name, rubricPath: rf, kind: short, prompt: pf, output });
  }
}
writeFileSync(join(workdir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${manifest.length} prompts generated in ${workdir}`);
