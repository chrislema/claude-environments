#!/usr/bin/env node
// Scaffold engine (D11): materializes the Workers-first Target Shape from a profile — a set
// of composable feature flags the planner chose. The model decides the profile; this code
// builds the files. Product-blind: it knows Cloudflare/Wrangler/HTTP/SQL and its own
// vocabulary, never a product's routes, tables, or nouns.
//
// Usage:
//   node scripts/scaffold.mjs --name=<name> --out=<dir> [--flags=d1,kv,...]
//        [--compat-date=YYYY-MM-DD] [--description="..."] [--topology=workers]
//
// Writes files under <out> (never overwriting existing ones), writes <out>/scaffold-manifest.json,
// and prints the manifest JSON to stdout. Exit 0 on success, 2 on a bad profile.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'scaffold', 'profiles', 'flags.json'), 'utf8'));

const flags = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)=(.*)$/);
  if (m) flags[m[1]] = m[2];
}
const die = (msg) => { console.error(msg); process.exit(2); };

const name = flags.name;
const out = flags.out;
if (!name || !out) die('scaffold requires --name and --out');
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) die(`--name "${name}" must be a lowercase Worker name (a-z0-9-)`);
const topology = flags.topology ?? 'workers';
if (!REGISTRY.topologies.includes(topology)) die(`--topology "${topology}" is not one of ${REGISTRY.topologies.join(', ')}`);

const flagList = (flags.flags ? flags.flags.split(',').map((s) => s.trim()).filter(Boolean) : []);
for (const f of flagList) if (!REGISTRY.flags[f]) die(`unknown scaffold flag "${f}" — valid: ${Object.keys(REGISTRY.flags).join(', ')}`);
const has = (f) => flagList.includes(f);

// scaffold.mjs runs as a subprocess (not a workflow), so Date is available; --compat-date
// keeps tests deterministic.
const compatDate = flags['compat-date'] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(compatDate)) die(`--compat-date "${compatDate}" must be YYYY-MM-DD`);

const ts = has('typescript');
const ext = ts ? 'ts' : 'js';
const imp = (p) => `./${p}`; // esbuild (wrangler) resolves extensionless relative imports

// --- wrangler.jsonc binding set for one environment ------------------------
function envBindings(env) {
  const sfx = env === 'dev' ? '' : `-${env}`;
  const id = (kind) => (env === 'dev' ? `local_${kind}` : `REPLACE_WITH_${env.toUpperCase()}_${kind.toUpperCase()}_ID`);
  const b = {};
  if (has('d1')) b.d1_databases = [{ binding: 'DB', database_name: `${name}${sfx}`, database_id: id('d1') }];
  if (has('kv')) b.kv_namespaces = [{ binding: 'CACHE', id: id('kv') }];
  if (has('r2')) b.r2_buckets = [{ binding: 'BUCKET', bucket_name: `${name}${sfx}` }];
  if (has('do')) b.durable_objects = { bindings: [{ name: 'COORDINATOR', class_name: 'Coordinator' }] };
  if (has('queues')) b.queues = {
    producers: [{ binding: 'TASK_QUEUE', queue: `${name}-tasks${sfx}` }],
    consumers: [{ queue: `${name}-tasks${sfx}`, max_retries: 3, dead_letter_queue: `${name}-tasks-dlq${sfx}` }],
  };
  if (has('workflows')) b.workflows = [{ name: `${name}-workflow${sfx}`, binding: 'WORKFLOW', class_name: 'OrchestratorWorkflow' }];
  if (has('ai')) b.ai = { binding: 'AI' };
  return b;
}

const backendHeavy = has('d1') || has('do') || has('queues');
const wrangler = {
  $schema: 'node_modules/wrangler/config-schema.json',
  name,
  main: `src/index.${ext}`,
  compatibility_date: compatDate,
  compatibility_flags: ['nodejs_compat'],
  observability: { enabled: true, head_sampling_rate: 1 },
  assets: { directory: './public', binding: 'ASSETS', ...(has('spa') ? { not_found_handling: 'single-page-application' } : {}) },
  ...(backendHeavy ? { placement: { mode: 'smart' } } : {}),
  ...envBindings('dev'),
  ...(has('do') ? { migrations: [{ tag: 'v1', new_sqlite_classes: ['Coordinator'] }] } : {}),
  env: {
    staging: envBindings('staging'),
    production: {
      ...envBindings('production'),
      ...(has('custom-domain') ? { routes: [{ pattern: 'REPLACE_WITH_PRODUCTION_DOMAIN', custom_domain: true }] } : {}),
    },
  },
};

// --- source + config file contents -----------------------------------------
const reExports = [
  has('do') ? `export { Coordinator } from '${imp('do')}';` : '',
  has('workflows') ? `export { OrchestratorWorkflow } from '${imp('workflow')}';` : '',
].filter(Boolean).join('\n');

const queueHandler = has('queues') ? `,
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        // process message.body
        message.ack();
      } catch {
        message.retry();
      }
    }
  }` : '';

const indexSrc = `${reExports ? reExports + '\n\n' : ''}const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', name: '${name}' });
    return env.ASSETS.fetch(request);
  }${queueHandler}
};
`;

const doSrc = `import { DurableObject } from 'cloudflare:workers';

// SQLite-backed Durable Object — per-object relational state via ctx.storage.sql.
export class Coordinator extends DurableObject {
  async fetch() {
    return new Response('ok');
  }
}
`;

const workflowSrc = `import { WorkflowEntrypoint } from 'cloudflare:workers';

// Each step must be idempotent — Workflows for A-then-B-then-C dependency chains.
export class OrchestratorWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do('first-step', async () => ({ ok: true }));
  }
}
`;

const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>Static assets served from the ASSETS binding.</p>
  </main>
</body>
</html>
`;

const stylesCss = `:root { --brand: #1d6e5a; --contrast: #12201b; --base: #ffffff; }
* { box-sizing: border-box; }
body { font-family: Inter, sans-serif; color: var(--contrast); background: var(--base); margin: 0; padding: 2rem; }
h1 { font-weight: 800; }
`;

const smokeTest = `import { SELF } from 'cloudflare:test';
import { it, expect } from 'vitest';

// The executable meaning of the smoke tier: the Worker loads in workerd and /health answers 200.
it('health endpoint answers 200', async () => {
  const res = await SELF.fetch('http://example.com/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});
`;

const vitestConfig = `import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
});
`;

const pkg = {
  name,
  ...(flags.description ? { description: flags.description } : {}),
  private: true,
  type: 'module',
  scripts: {
    dev: 'wrangler dev',
    test: 'vitest run',
    ...(ts ? { typecheck: 'wrangler types && tsc --noEmit' } : {}),
    deploy: 'wrangler deploy --env production',
  },
  devDependencies: {
    wrangler: '^4.0.0',
    vitest: '^2.1.0',
    '@cloudflare/vitest-pool-workers': '^0.8.0',
    ...(ts ? { typescript: '^5.6.0', '@cloudflare/workers-types': '^4.20240000.0' } : {}),
  },
};

const tsconfig = {
  compilerOptions: {
    target: 'esnext',
    module: 'esnext',
    moduleResolution: 'bundler',
    lib: ['esnext'],
    types: ['@cloudflare/workers-types', './worker-configuration.d.ts'],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
  include: ['src/**/*.ts', 'tests/**/*.ts'],
};

const gitignore = ['node_modules/', '.wrangler/', '.dev.vars', 'dist/', ts ? 'worker-configuration.d.ts' : '']
  .filter(Boolean).join('\n') + '\n';

// --- materialize -----------------------------------------------------------
const generated = [];
const skipped = [];
function write(rel, content) {
  const abs = join(out, rel);
  if (existsSync(abs)) { skipped.push(rel); return; }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  generated.push(rel);
}

write('wrangler.jsonc', JSON.stringify(wrangler, null, 2) + '\n');
write('package.json', JSON.stringify(pkg, null, 2) + '\n');
write(`src/index.${ext}`, indexSrc);
if (has('do')) write(`src/do.${ext}`, doSrc);
if (has('workflows')) write(`src/workflow.${ext}`, workflowSrc);
write('public/index.html', indexHtml);
write('public/styles.css', stylesCss);
write(`tests/smoke.test.${ext}`, smokeTest);
write(`vitest.config.${ext}`, vitestConfig);
write('.dev.vars', '# Local secrets — gitignored, never committed. Use `wrangler secret put` for staging/production.\n');
write('.gitignore', gitignore);
if (ts) write('tsconfig.json', JSON.stringify(tsconfig, null, 2) + '\n');
if (has('d1')) write('migrations/0001_init.sql', '-- Initial migration. Add tables here; apply with `wrangler d1 migrations apply`.\n');

const manifest = {
  artifact_type: 'scaffold-manifest',
  profile: { name, flags: flagList, topology, ...(flags.description ? { description: flags.description } : {}) },
  compatibility_date: compatDate,
  generated: generated.sort(),
  skipped: skipped.sort(),
};
writeFileSync(join(out, 'scaffold-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
