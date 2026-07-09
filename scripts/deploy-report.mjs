#!/usr/bin/env node
// Deployment report synthesis (D19): a pure function from the deploy stage's events to
// deployment-report.json. The report is a fact — revision, migrations applied, verification
// results, and the rollback command with a REAL prior version id, all recorded from what
// happened, not narrated. The model does not author it.
//
// Usage:
//   node scripts/deploy-report.mjs --events=<events.jsonl> --stage=<stage> --env=<env>
//     [--out=<report.json>] [--register]
//
// Consumes events: deploy, live_verify, prior_version{version_id}, version_upload,
// version_promote{version_id,percentage}, approval{approver}, migration_applied{name}.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pure: (deploy-stage events, {env}) → deployment-report object. Exported for tests.
export function synthesizeReport(events, { env = 'local' } = {}) {
  const byType = (t) => events.filter((e) => e.type === t);
  const deploys = byType('deploy');
  const verifies = byType('live_verify');
  const promotes = byType('version_promote');
  const prior = byType('prior_version').pop();
  const migrations = byType('migration_applied').map((e) => e.name).filter(Boolean);

  const revision = promotes.pop()?.version_id ?? deploys.pop()?.revision ?? 'unknown';
  const verification = verifies.map((v) => ({
    check: `probe ${v.target}`,
    expected: 'reachable',
    actual: v.ok ? 'reachable' : 'unreachable',
    passed: !!v.ok,
  }));
  const allVerified = verification.length > 0 && verification.every((v) => v.passed);

  const issues = verifies.filter((v) => !v.ok).map((v) => ({
    description: `live probe ${v.target} did not pass`,
    impact: 'deployed behavior is unverified',
    action: 'rollback',
  }));

  const rollbackKnown = !!prior?.version_id;
  const rollback = {
    prior_revision: rollbackKnown ? prior.version_id : 'UNKNOWN (no prior version captured before promotion)',
    steps: rollbackKnown
      ? `wrangler versions deploy ${prior.version_id} --env ${env} --yes`
      : 'no prior version was recorded — rollback is not possible; investigate before promoting',
    ...(migrations.length ? { data_caveats: `Migrations applied to ${env} (${migrations.join(', ')}) are not reverted by a version rollback — review data impact before rolling back.` } : {}),
  };

  return {
    artifact_type: 'deployment-report',
    environment: env,
    revision,
    ...(migrations.length ? { migrations_applied: migrations } : {}),
    result: allVerified ? 'success' : 'failure',
    verification,
    issues,
    next_action: allVerified ? 'proceed' : 'rollback',
    rollback,
  };
}

// --- CLI -------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('='); return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }));
  if (!flags.events) { console.error('usage: deploy-report.mjs --events=<events.jsonl> --stage=<stage> --env=<env> [--out=] [--register]'); process.exit(2); }
  let events = readFileSync(flags.events, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (flags.stage) {
    const start = events.findIndex((e) => e.type === 'stage_start' && e.stage === flags.stage);
    const end = events.findIndex((e, i) => i > start && e.type === 'stage_end' && e.stage === flags.stage);
    if (start !== -1) events = events.slice(start, end === -1 ? undefined : end + 1);
  }
  const report = synthesizeReport(events, { env: flags.env ?? 'local' });
  const rendered = JSON.stringify(report, null, 2);
  console.log(rendered);
  if (flags.out) writeFileSync(flags.out, rendered);
  if (flags.register && flags.out) {
    execFileSync('node', [join(HERE, 'stage.mjs'), 'artifact', '--type=deployment-report', `--path=${flags.out}`], { stdio: 'ignore' });
  }
  process.exit(report.result === 'success' ? 0 : 1);
}
