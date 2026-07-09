#!/usr/bin/env node
// P11: the release gate is synthesized from executed evidence by a pure function — no model
// in the loop from evidence to decision (D13), and the decision fails closed. Also exercises
// the anti-laundering check (D12).

import { synthesize } from './synthesize-gate.mjs';
import { evidence_statuses_honest } from '../checks/checks.mjs';

let failures = 0;
const expect = (label, cond) => { if (!cond) failures += 1; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); };

const probePlan = {
  artifact_type: 'probe-plan',
  probes: [
    { id: 'p1', tier: 'e2e', method: 'GET', path: '/health', expect: { status: 200 }, critical_area: 'deployment_correctness', source_ref: { quote: 'health', source: 'spec.md', line: 1 } },
    { id: 'p2', tier: 'api', method: 'POST', path: '/login', expect: { status: 401 }, critical_area: 'auth', source_ref: { quote: 'auth', source: 'spec.md', line: 2 } },
  ],
  unprobeable: [{ critical_area: 'billing', reason: 'no billing surface in scope' }],
};
const clean = [
  { item: 'install', status: 'executed_pass' },
  { item: 'deploy_dry_run', status: 'executed_pass' },
  { item: 'smoke', status: 'executed_pass', tier: 'smoke' },
  { item: 'probe:p1', status: 'executed_pass', tier: 'e2e', critical_area: 'deployment_correctness', probe_id: 'p1' },
  { item: 'probe:p2', status: 'executed_pass', tier: 'api', critical_area: 'auth', probe_id: 'p2' },
];
const area = (g, a) => g.critical_areas.find((x) => x.area === a)?.status;
const tier = (g, t) => g.tiers.find((x) => x.tier === t)?.status;

// 1. Clean evidence → pass, areas verified, billing N/A.
let g = synthesize(clean, probePlan, 'pull_request');
expect('clean evidence → decision pass', g.decision === 'pass');
expect('deployment area verified', area(g, 'deployment_correctness') === 'verified');
expect('auth area verified', area(g, 'auth') === 'verified');
expect('billing declared not_applicable', area(g, 'billing') === 'not_applicable');
expect('e2e tier passed', tier(g, 'e2e') === 'passed');
expect('full_matrix not_required (no evidence)', tier(g, 'full_matrix') === 'not_required');
expect('no blockers on a clean run', g.blockers.length === 0);

// 2. A failed probe flips its area to missing and fails closed.
g = synthesize(clean.map((e) => (e.probe_id === 'p2' ? { ...e, status: 'executed_fail' } : e)), probePlan, 'pull_request');
expect('failed probe → decision fail', g.decision === 'fail');
expect('failed probe → auth area missing', area(g, 'auth') === 'missing');
expect('failed probe → auth blocker present', g.blockers.some((b) => b.includes('auth')));

// 3. A deleted probe (no evidence at all) flips its area to missing — the "delete a probe → gate fail" acceptance.
g = synthesize(clean.filter((e) => e.probe_id !== 'p1'), probePlan, 'pull_request');
expect('missing probe evidence → deployment area missing', area(g, 'deployment_correctness') === 'missing');
expect('missing probe evidence → decision fail', g.decision === 'fail');

// 4. A failed chain step is a verbatim blocker.
g = synthesize(clean.map((e) => (e.item === 'deploy_dry_run' ? { ...e, status: 'executed_fail', detail: 'config parse error' } : e)), probePlan, 'pull_request');
expect('failed chain step → blocker with its detail', g.blockers.some((b) => b.includes('deploy_dry_run') && b.includes('config parse error')));

// 5. Anti-laundering: an honest synthesized gate passes; a tampered "verified" fails.
expect('honest synthesized gate passes evidence_statuses_honest', evidence_statuses_honest(synthesize(clean, probePlan), { evidence: clean }).passed);
const tampered = synthesize(clean, probePlan);
tampered.critical_areas.find((a) => a.area === 'auth').evidence = 'p99';
expect('tampered verified status (cites non-passed probe) fails honesty check', !evidence_statuses_honest(tampered, { evidence: clean }).passed);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
