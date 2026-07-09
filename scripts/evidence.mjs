#!/usr/bin/env node
// Evidence engine (D12): runs the executable evidence chain against real Wrangler and appends
// structured results to evidence.jsonl. Every item carries exactly one honest status —
// executed_pass | executed_fail | not_executed | not_applicable — and there is NO mechanism
// for inferring a status. An area with no probe is not_executed, visibly; the gate synthesis
// fails closed on it. Honest gaps outrank flattering summaries.
//
// Usage:
//   node scripts/evidence.mjs --dir=<project> --probe-plan=<path> --out=<evidence.jsonl>
//     [--tier=smoke|api|e2e] [--skip-install]
//
// Chain: install → typecheck(TS) → wrangler deploy --dry-run → d1 migrations(local) →
//        vitest smoke (module loads in workerd + /health) → vitest api suite →
//        boot `wrangler dev` → execute the e2e probe plan → teardown.

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const i = a.indexOf('='); return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
}));
const dir = flags.dir ?? process.cwd();
const TIER_ORDER = ['smoke', 'api', 'e2e', 'full_matrix'];
const maxTier = TIER_ORDER.indexOf(flags.tier ?? 'e2e');
const out = flags.out ?? join(dir, '.delivery', 'evidence.jsonl');

const config = existsSync(join(dir, 'wrangler.jsonc')) ? JSON.parse(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8')) : {};
const isTs = String(config.main ?? '').endsWith('.ts');
const hasD1 = Array.isArray(config.d1_databases) && config.d1_databases.length > 0;
const probePlan = flags['probe-plan'] && existsSync(flags['probe-plan']) ? JSON.parse(readFileSync(flags['probe-plan'], 'utf8')) : { probes: [], unprobeable: [] };

const evidence = [];
const record = (o) => evidence.push(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function step(item, cmd, args, { tier, timeout = 120000 } = {}) {
  try {
    execFileSync(cmd, args, { cwd: dir, stdio: 'pipe', timeout, encoding: 'utf8' });
    record({ item, status: 'executed_pass', ...(tier ? { tier } : {}), detail: `${cmd} ${args.join(' ')} exit 0` });
    return true;
  } catch (e) {
    const tail = `${e.stdout ?? ''}${e.stderr ?? ''}`.slice(-400).replace(/\s+/g, ' ').trim();
    record({ item, status: 'executed_fail', ...(tier ? { tier } : {}), detail: `${cmd} ${args.join(' ')} failed (${e.code ?? e.signal ?? e.status}): ${tail}` });
    return false;
  }
}

function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

async function waitForReady(port, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }); return true; } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

async function runProbes() {
  const e2eProbes = (probePlan.probes ?? []).filter((p) => p.tier === 'e2e');
  if (!e2eProbes.length) return;
  const port = await freePort();
  const child = spawn('wrangler', ['dev', '--port', String(port)], { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  try { ready = await waitForReady(port, 45000); } catch { /* fall through */ }
  if (!ready) {
    for (const p of e2eProbes) record({ item: `probe:${p.id}`, status: 'not_executed', tier: 'e2e', critical_area: p.critical_area, probe_id: p.id, reason: 'wrangler dev did not become ready' });
  } else {
    for (const p of e2eProbes) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}${p.path}`, { method: p.method, headers: p.headers, body: p.body, signal: AbortSignal.timeout(10000) });
        let ok = res.status === p.expect.status;
        let note = `${p.method} ${p.path} → ${res.status} (expect ${p.expect.status})`;
        if (ok && p.expect.body_includes) { const t = await res.text(); ok = t.includes(p.expect.body_includes); note += ok ? '' : `; body missing "${p.expect.body_includes}"`; }
        record({ item: `probe:${p.id}`, status: ok ? 'executed_pass' : 'executed_fail', tier: 'e2e', critical_area: p.critical_area, probe_id: p.id, detail: note });
      } catch (e) {
        record({ item: `probe:${p.id}`, status: 'not_executed', tier: 'e2e', critical_area: p.critical_area, probe_id: p.id, reason: `probe error: ${e.message}` });
      }
    }
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  await sleep(500);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
}

// --- chain -----------------------------------------------------------------
const depsPresent = existsSync(join(dir, 'node_modules'));
if (flags['skip-install'] || depsPresent) {
  record({ item: 'install', status: 'not_applicable', reason: depsPresent ? 'node_modules already present' : 'install skipped' });
} else if (existsSync(join(dir, 'package.json'))) {
  step('install', 'npm', ['install', '--no-audit', '--no-fund'], { timeout: 300000 });
} else {
  record({ item: 'install', status: 'not_applicable', reason: 'no package.json' });
}

if (isTs) step('typecheck', 'npx', ['tsc', '--noEmit'], { timeout: 120000 });
else record({ item: 'typecheck', status: 'not_applicable', reason: 'vanilla JS project' });

step('deploy_dry_run', 'wrangler', ['deploy', '--dry-run']);

if (hasD1) step('d1_migrations_local', 'wrangler', ['d1', 'migrations', 'apply', config.d1_databases[0].binding, '--local']);
else record({ item: 'd1_migrations_local', status: 'not_applicable', reason: 'no D1 database' });

const canVitest = existsSync(join(dir, 'node_modules', 'vitest')) || existsSync(join(dir, 'node_modules', '.bin', 'vitest'));
if (maxTier >= 0) {
  if (canVitest) step('smoke', 'npx', ['vitest', 'run', 'smoke'], { tier: 'smoke', timeout: 180000 });
  else record({ item: 'smoke', status: 'not_executed', tier: 'smoke', reason: 'vitest not installed' });
}
if (maxTier >= 1) {
  if (canVitest) step('api', 'npx', ['vitest', 'run'], { tier: 'api', timeout: 180000 });
  else record({ item: 'api', status: 'not_executed', tier: 'api', reason: 'vitest not installed' });
}
if (maxTier >= 2) await runProbes();

writeFileSync(out, evidence.map((e) => JSON.stringify(e)).join('\n') + '\n');
console.log(JSON.stringify({ out, items: evidence.length, statuses: evidence.reduce((m, e) => ({ ...m, [e.status]: (m[e.status] ?? 0) + 1 }), {}) }));
