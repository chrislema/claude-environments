#!/usr/bin/env node
// P12: the deployment report is synthesized from deploy-stage events by a pure function (D19).
// Rollback is a recorded fact (real prior version id); a promote without prior-version capture
// is impossible by construction — the report cannot claim a rollback it does not have.

import { synthesizeReport } from './deploy-report.mjs';
import { rollback_recorded, post_promote_verified } from '../checks/checks.mjs';

let failures = 0;
const expect = (label, cond) => { if (!cond) failures += 1; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const ev = (o) => ({ ts: '2026-07-09T00:00:00Z', source: 'orchestrator', ...o });

// 1. Production promote with prior version + passing probes → success, real rollback.
const prod = [
  ev({ type: 'prior_version', version_id: 'v-old' }),
  ev({ type: 'version_upload', version_id: 'v-new', preview_url: 'https://preview' }),
  ev({ type: 'approval', approver: 'chris', decision: 'approve' }),
  ev({ type: 'version_promote', version_id: 'v-new', percentage: 100 }),
  ev({ type: 'migration_applied', name: '0001_init.sql' }),
  ev({ type: 'live_verify', target: 'https://prod/health', ok: true }),
];
let r = synthesizeReport(prod, { env: 'production' });
expect('production result success when probes pass', r.result === 'success');
expect('revision is the promoted version', r.revision === 'v-new');
expect('rollback prior_revision is the captured prior version', r.rollback.prior_revision === 'v-old');
expect('rollback steps name a real command', /wrangler versions deploy v-old/.test(r.rollback.steps));
expect('migrations recorded', (r.migrations_applied ?? []).includes('0001_init.sql'));
expect('data_caveats surfaced for applied migrations', /not reverted/.test(r.rollback.data_caveats ?? ''));
expect('next_action proceed on success', r.next_action === 'proceed');
expect('rollback_recorded passes on a real prior version', rollback_recorded(r).passed);

// 2. Promote WITHOUT prior version → rollback impossible → the check fails closed.
const noPrior = [ev({ type: 'version_promote', version_id: 'v-new', percentage: 100 }), ev({ type: 'live_verify', target: 'https://prod', ok: true })];
r = synthesizeReport(noPrior, { env: 'production' });
expect('no prior version → rollback prior_revision is UNKNOWN', r.rollback.prior_revision.startsWith('UNKNOWN'));
expect('rollback_recorded FAILS when no prior version captured', !rollback_recorded(r).passed);

// 3. Failed probe → failure + rollback next_action.
r = synthesizeReport([ev({ type: 'prior_version', version_id: 'v-old' }), ev({ type: 'version_promote', version_id: 'v-new' }), ev({ type: 'live_verify', target: 'https://prod', ok: false })], { env: 'production' });
expect('failed probe → result failure', r.result === 'failure');
expect('failed probe → next_action rollback', r.next_action === 'rollback');
expect('failed probe → issue recorded', r.issues.length === 1);

// 4. Local mode is exempt from versioned rollback.
r = synthesizeReport([ev({ type: 'deploy', target: 'local', revision: 'abc' }), ev({ type: 'live_verify', target: 'http://127.0.0.1/health', ok: true })], { env: 'local' });
expect('local report success', r.result === 'success');
expect('rollback_recorded passes for local (exempt)', rollback_recorded(r).passed);

// 5. post_promote_verified over events.
expect('post_promote_verified passes when promote is followed by live_verify',
  post_promote_verified([ev({ type: 'stage_start', stage: 'deploy' }), ev({ type: 'version_promote', version_id: 'v' }), ev({ type: 'live_verify', target: 'x', ok: true }), ev({ type: 'stage_end', stage: 'deploy' })], { stage: 'deploy' }).passed);
expect('post_promote_verified fails when a promote has no live_verify',
  !post_promote_verified([ev({ type: 'stage_start', stage: 'deploy' }), ev({ type: 'version_promote', version_id: 'v' }), ev({ type: 'stage_end', stage: 'deploy' })], { stage: 'deploy' }).passed);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
