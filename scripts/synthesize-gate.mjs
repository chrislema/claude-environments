#!/usr/bin/env node
// Release-gate synthesis (D9/D13): a pure function from executed evidence + the probe plan
// to release-gate.json. The tester authored the probe plan (judgment: what to prove); this
// code reports what the proof said (fact). No model token generation sits between the
// evidence and the decision, and the decision fails closed on any unproven critical area.
//
// Usage:
//   node scripts/synthesize-gate.mjs <evidence.jsonl> <probe-plan.json>
//     [--event-type=pull_request] [--out=release-gate.json] [--register]
//
// evidence.jsonl item: { item, status, tier?, critical_area?, probe_id?, detail?, reason? }
//   status ∈ executed_pass | executed_fail | not_executed | not_applicable
// Exit 0 iff the synthesized gate decision is "pass".

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIERS = ['smoke', 'api', 'e2e', 'full_matrix'];

// Pure: (evidence items, probe plan, event type) → release-gate object. Exported for tests.
export function synthesize(evidence, probePlan, eventType = 'pull_request') {
  const tiers = TIERS.map((tier) => {
    const items = evidence.filter((e) => e.tier === tier);
    let status;
    if (!items.length) status = 'not_required';
    else if (items.some((e) => e.status === 'executed_fail')) status = 'failed';
    else if (items.some((e) => e.status === 'not_executed')) status = 'skipped';
    else if (items.some((e) => e.status === 'executed_pass')) status = 'passed';
    else status = 'skipped';
    const run_ref = items.map((e) => e.probe_id ?? e.item).filter(Boolean).join(',');
    return run_ref ? { tier, status, run_ref } : { tier, status };
  });

  const unprobeable = new Map((probePlan.unprobeable ?? []).map((u) => [u.critical_area, u.reason]));
  const areasInScope = [...new Set([...(probePlan.probes ?? []).map((p) => p.critical_area), ...unprobeable.keys()])];
  const critical_areas = areasInScope.map((area) => {
    if (unprobeable.has(area)) return { area, status: 'not_applicable', reason: unprobeable.get(area) };
    const ev = evidence.filter((e) => e.critical_area === area && e.probe_id);
    if (!ev.length) return { area, status: 'missing', evidence: 'no probe evidence recorded' };
    const failed = ev.filter((e) => e.status === 'executed_fail').map((e) => e.probe_id);
    if (failed.length) return { area, status: 'missing', evidence: `probe(s) failed: ${failed.join(',')}` };
    const notRun = ev.filter((e) => e.status === 'not_executed').map((e) => e.probe_id);
    if (notRun.length) return { area, status: 'missing', evidence: `probe(s) not executed: ${notRun.join(',')}` };
    return { area, status: 'verified', evidence: ev.map((e) => e.probe_id).join(',') };
  });

  const blockers = [
    ...evidence.filter((e) => e.status === 'executed_fail' && !e.probe_id).map((e) => `${e.item} failed: ${e.detail ?? 'no detail'}`),
    ...critical_areas.filter((a) => a.status === 'missing').map((a) => `critical area "${a.area}": ${a.evidence}`),
  ];

  const clean = blockers.length === 0;
  const verified = critical_areas.filter((a) => a.status === 'verified').length;
  const missing = critical_areas.filter((a) => a.status === 'missing').length;
  return {
    artifact_type: 'release-gate',
    decision: clean ? 'pass' : 'fail',
    event_type: eventType,
    tiers,
    critical_areas,
    blockers,
    cosmetic_issues: [],
    summary: `${clean ? 'PASS' : 'FAIL'}: synthesized from ${evidence.length} evidence item(s) — ${verified} area(s) verified, ${missing} missing, ${blockers.length} blocker(s).`,
  };
}

// --- CLI -------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  if (positional.length < 2) { console.error('usage: synthesize-gate.mjs <evidence.jsonl> <probe-plan.json> [--event-type=] [--out=] [--register]'); process.exit(2); }
  const evidence = readFileSync(positional[0], 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const probePlan = JSON.parse(readFileSync(positional[1], 'utf8'));
  const gate = synthesize(evidence, probePlan, flags['event-type'] ?? 'pull_request');
  const rendered = JSON.stringify(gate, null, 2);
  console.log(rendered);
  if (flags.out) writeFileSync(flags.out, rendered);
  if (flags.register) {
    if (!flags.out) { console.error('--register requires --out'); process.exit(2); }
    execFileSync('node', [join(HERE, 'stage.mjs'), 'artifact', '--type=release-gate', `--path=${flags.out}`], { stdio: 'ignore' });
  }
  process.exit(gate.decision === 'pass' ? 0 : 1);
}
