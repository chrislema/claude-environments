#!/usr/bin/env node
// P10 acceptance (the parts provable without a live wrangler/npm): the scaffold materializes
// a valid Workers-first target with zero model involvement, is idempotent on re-run, passes
// its own hygiene checks and fails on seeded mutations, and its manifest becomes the readonly
// build baseline. `wrangler deploy --dry-run` and `npm test` are verified out-of-band (they
// need the wrangler CLI / npm install, which may be absent in CI).

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrangler_config_hygiene, queue_failure_policy, do_migration_declared } from '../checks/checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const SCAFFOLD = join(HERE, 'scaffold.mjs');
const STAGE = join(HERE, 'stage.mjs');

let failures = 0;
const expect = (label, cond) => { if (!cond) failures += 1; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const scaffold = (args) => execFileSync('node', [SCAFFOLD, ...args], { encoding: 'utf8' });

// --- 1. Kitchen-sink materialization ---------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'scaf-'));
const manifest = JSON.parse(scaffold([`--name=sink-app`, `--out=${dir}`, `--flags=d1,kv,r2,do,queues,workflows,ai,spa,custom-domain`, `--compat-date=2026-07-01`]));
expect('manifest lists generated files', manifest.generated.length >= 10);
expect('wrangler.jsonc generated', manifest.generated.includes('wrangler.jsonc'));
expect('DO source generated', manifest.generated.includes('src/do.js'));
expect('workflow source generated', manifest.generated.includes('src/workflow.js'));
expect('d1 migration generated', manifest.generated.includes('migrations/0001_init.sql'));

const cfg = JSON.parse(readFileSync(join(dir, 'wrangler.jsonc'), 'utf8'));
expect('wrangler.jsonc is comment-free valid JSON', typeof cfg === 'object');
expect('nodejs_compat flag set', (cfg.compatibility_flags ?? []).includes('nodejs_compat'));
expect('assets binding present', cfg.assets?.binding === 'ASSETS');
expect('spa not_found_handling set', cfg.assets?.not_found_handling === 'single-page-application');
expect('observability on', cfg.observability?.enabled === true);
expect('smart placement (backend-heavy)', cfg.placement?.mode === 'smart');
expect('DO migration declares new_sqlite_classes', (cfg.migrations ?? []).some((m) => (m.new_sqlite_classes ?? []).includes('Coordinator')));
expect('custom-domain route in production only', cfg.env.production.routes?.[0]?.custom_domain === true && !cfg.env.staging.routes);
// env mirror completeness
const names = (s) => JSON.stringify([
  ...(s.d1_databases ?? []).map((x) => x.binding),
  ...(s.kv_namespaces ?? []).map((x) => x.binding),
  ...(s.r2_buckets ?? []).map((x) => x.binding),
  ...(s.durable_objects?.bindings ?? []).map((x) => x.name),
  ...(s.queues?.producers ?? []).map((x) => x.binding),
  ...(s.workflows ?? []).map((x) => x.binding),
  ...(s.ai ? [s.ai.binding] : []),
].sort());
expect('staging mirrors dev bindings', names(cfg) === names(cfg.env.staging));
expect('production mirrors dev bindings', names(cfg) === names(cfg.env.production));

// --- 2. Hygiene passes on the scaffold output ------------------------------
expect('wrangler_config_hygiene passes on scaffold output', wrangler_config_hygiene(cfg).passed);
expect('queue_failure_policy passes on scaffold output', queue_failure_policy(cfg).passed);
expect('do_migration_declared passes on scaffold output', do_migration_declared(cfg).passed);

// --- 3. Hygiene fails on seeded mutations ----------------------------------
expect('hygiene fails when a staging mirror is stripped', !wrangler_config_hygiene({ ...cfg, env: { staging: {}, production: cfg.env.production } }).passed);
expect('queue policy fails when a DLQ is removed', !queue_failure_policy({ queues: { consumers: [{ queue: 'q', max_retries: 3 }] } }).passed);
expect('do migration fails when the migration is dropped', !do_migration_declared({ durable_objects: cfg.durable_objects, migrations: [] }).passed);

// --- 4. Idempotency: re-run changes nothing --------------------------------
const rerun = JSON.parse(scaffold([`--name=sink-app`, `--out=${dir}`, `--flags=d1,kv,r2,do,queues,workflows,ai,spa,custom-domain`, `--compat-date=2026-07-01`]));
expect('re-run generates nothing', rerun.generated.length === 0);
expect('re-run skips every existing file', rerun.skipped.length >= 10);

// --- 5. Manifest becomes the readonly build baseline (stage.mjs) -----------
const runRepo = mkdtempSync(join(tmpdir(), 'scaf-run-'));
mkdirSync(join(runRepo, '.delivery', 'artifacts'), { recursive: true });
writeFileSync(join(runRepo, '.delivery', 'run.json'), JSON.stringify({ run_id: 'r1', status: 'running', stage: 'review', tasks: {}, artifacts: {}, judgments: [], stuck: [] }));
writeFileSync(join(runRepo, '.delivery', 'artifacts', 'scaffold-manifest.json'), JSON.stringify({ generated: ['wrangler.jsonc', 'src/index.js', 'package.json'] }));
execFileSync('node', [STAGE, 'start', '--stage=build:T1', '--role=engineer'], { cwd: runRepo, encoding: 'utf8' });
const boundary = JSON.parse(readFileSync(join(runRepo, '.delivery', 'boundary.json'), 'utf8'));
expect('build boundary readonly includes scaffold-generated wrangler.jsonc', boundary.readonly.includes('wrangler.jsonc'));
expect('build boundary readonly includes scaffold-generated src/index.js', boundary.readonly.includes('src/index.js'));

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
