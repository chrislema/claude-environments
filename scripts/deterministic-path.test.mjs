#!/usr/bin/env node
// P8 acceptance: the deterministic truth path is deterministic end-to-end (T2/D10).
//
// The det-results and judgment files are written by code (checks/run.mjs gate-set and
// scripts/aggregate.mjs), never by an agent. A runner agent only launches these commands
// and reports an exit code; its text output is not an input to any file. This test proves
// that by running the real commands twice over identical inputs and asserting the outputs
// are byte-identical — so no model words can be load-bearing.
//
// It also structurally guards the two judgment-loop repairs and the T2 rewrite in
// workflows/deliver.js, so a future edit cannot silently reintroduce the transcriber.

import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const dir = mkdtempSync(join(tmpdir(), 'detpath-'));

let failures = 0;
const expect = (label, cond) => {
  if (!cond) failures += 1;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
};

const node = (args) => {
  try { return { out: execFileSync('node', args, { encoding: 'utf8' }), code: 0 }; }
  catch (e) { return { out: e.stdout ?? '', code: e.status ?? 1 }; }
};

// --- Fixtures ---------------------------------------------------------------
const plan = {
  artifact_type: 'task-plan',
  scope: 'login feature',
  tasks: [
    { id: 'T1', owner: 'engineer', deliverable: 'sessions migration', depends_on: [], acceptance_criteria: ['applies cleanly'], owned_surfaces: ['migrations/0001_sessions.sql'] },
    { id: 'T2', owner: 'engineer', deliverable: 'POST /login returns cookie', depends_on: ['T1'], acceptance_criteria: ['200+cookie', '401 body'], owned_surfaces: ['src/routes/login.js'] },
  ],
  open_decisions: [],
  risks: ['rate-limit storage deferred to T2'],
};
writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2));

const judgeOut = {
  gates: [{ id: 'settled_policy_respected', passed: true, evidence: 'Workers-first per S-001; no policy re-decided' }],
  dimensions: [
    { id: 'task_concreteness', score: 5, evidence: 'named deliverables' },
    { id: 'acceptance_criteria_checkable', score: 5, evidence: 'pass/fail criteria' },
    { id: 'dependency_completeness', score: 5, evidence: 'T2 depends T1' },
    { id: 'owned_surfaces_named', score: 5, evidence: 'surfaces named' },
    { id: 'tech_decisions_rationale', score: 4, evidence: 'S-001/S-002/S-003 cited' },
    { id: 'open_decisions_hygiene', score: 5, evidence: 'only genuine blockers' },
  ],
};
writeFileSync(join(dir, 'judge.json'), JSON.stringify(judgeOut));

const RUN = join(REPO, 'checks', 'run.mjs');
const AGG = join(REPO, 'scripts', 'aggregate.mjs');
const RUBRIC = join(REPO, 'rubrics', 'task-plan.rubric.json');

// --- 1. gate-set is byte-identical across runs ------------------------------
node([RUN, 'gate-set', 'plan', `--artifact=${join(dir, 'plan.json')}`, `--out=${join(dir, 'det1.json')}`]);
node([RUN, 'gate-set', 'plan', `--artifact=${join(dir, 'plan.json')}`, `--out=${join(dir, 'det2.json')}`]);
const det1 = readFileSync(join(dir, 'det1.json'), 'utf8');
const det2 = readFileSync(join(dir, 'det2.json'), 'utf8');
expect('gate-set det file is byte-identical across runs', det1 === det2);
const detGates = JSON.parse(det1);
expect('every plan det gate passed on a clean plan', detGates.every((g) => g.passed) && detGates.length >= 3);

// --- 2. aggregate judgment is byte-identical across runs --------------------
node([AGG, RUBRIC, join(dir, 'judge.json'), `--deterministic=${join(dir, 'det1.json')}`, `--out=${join(dir, 'j1.json')}`]);
node([AGG, RUBRIC, join(dir, 'judge.json'), `--deterministic=${join(dir, 'det1.json')}`, `--out=${join(dir, 'j2.json')}`]);
const j1 = readFileSync(join(dir, 'j1.json'), 'utf8');
const j2 = readFileSync(join(dir, 'j2.json'), 'utf8');
expect('aggregate judgment file is byte-identical across runs', j1 === j2);
expect('clean plan judgment passes', JSON.parse(j1).passed === true);

// --- 3. deliver.js structural guards (T2 + the two loop repairs) ------------
const deliver = readFileSync(join(REPO, 'workflows', 'deliver.js'), 'utf8');
expect('T2: no agent transcribes check output (old collector phrase gone)',
  !deliver.includes('Collect each command'));
expect('T2: judgeArtifact runs the gate-set via run.mjs and self-registers',
  deliver.includes('gate-set ${gateSet}') && deliver.includes('--register'));
expect('T2: aggregate writes+registers its own judgment file',
  deliver.includes('--out=${judgmentFile}') && deliver.includes('--subject=${name}'));
expect('T2: pass/fail comes from aggregate exit code, not a transcribed field',
  deliver.includes('passed: !!agg?.ok'));
expect('Repair 1: review-report FAIL injects its remediation file into the architect re-run',
  deliver.includes('reviewRemediationFile') && deliver.includes('A prior judgment recorded remediation at'));
expect('Repair 2: the revised plan is re-gated + re-judged before review resumes',
  deliver.includes('task-plan-rev-a') && deliver.includes('planReadyForApproval'));
expect('Judge malfunction is respawned once then reported, never improvised',
  deliver.includes('respawn') && deliver.includes('parking rather than improvising'));

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
