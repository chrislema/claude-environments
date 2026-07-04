#!/usr/bin/env node
// Run-state CLI for /deliver: all .delivery/ state transitions happen here, in code —
// agents invoke this instead of hand-editing state (state authoritative and visible).
//
// Usage (always from the target repo root):
//   node scripts/stage.mjs init --vision=<path> --spec=<path>
//   node scripts/stage.mjs start --stage=build:T2 --role=engineer [--surfaces=a.js,b.sql]
//   node scripts/stage.mjs end --stage=build:T2 --reason=complete_stage|escalation|max_turns
//   node scripts/stage.mjs task --id=T2 --status=pending|building|judging|complete|stuck|blocked [--bump-retries]
//   node scripts/stage.mjs artifact --type=task-plan --path=.delivery/artifacts/task-plan.json
//   node scripts/stage.mjs event --type=artifact_read --data='{"artifact_type":"release-gate","path":"..."}'
//   node scripts/stage.mjs status
//
// `start` materializes the role's boundary manifest (globs from policy/boundaries.json,
// narrowed by --surfaces) so the PreToolUse boundary hook enforces it; `end` removes it.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const CWD = process.cwd();
const DELIVERY = join(CWD, '.delivery');
const RUN = join(DELIVERY, 'run.json');

const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(
  rest.filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('=');
    return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);

const die = (msg) => { console.error(msg); process.exit(2); };
const loadRun = () => {
  if (!existsSync(RUN)) die('no active run — run `stage.mjs init` first');
  return JSON.parse(readFileSync(RUN, 'utf8'));
};
const saveRun = (run) => writeFileSync(RUN, JSON.stringify(run, null, 2));
const logEvent = (event) => appendFileSync(
  join(DELIVERY, 'events.jsonl'),
  JSON.stringify({ ts: new Date().toISOString(), source: 'orchestrator', ...event }) + '\n'
);

switch (cmd) {
  case 'init': {
    if (!flags.vision || !flags.spec) die('init requires --vision and --spec');
    if (!existsSync(flags.vision) || !existsSync(flags.spec)) die('vision/spec file not found');
    if (existsSync(RUN)) {
      const existing = JSON.parse(readFileSync(RUN, 'utf8'));
      if (existing.status === 'running') die(`a run is already active (started ${existing.started_at}) — finish or abandon it first`);
    }
    mkdirSync(join(DELIVERY, 'artifacts', 'judgments'), { recursive: true });
    const run = {
      run_id: `run-${Date.now().toString(36)}`,
      started_at: new Date().toISOString(),
      vision: flags.vision,
      spec: flags.spec,
      status: 'running',
      stage: 'readout',
      tasks: {},
      artifacts: {},
      judgments: [],
      stuck: [],
    };
    saveRun(run);
    logEvent({ type: 'run_init', run_id: run.run_id, vision: flags.vision, spec: flags.spec });
    console.log(JSON.stringify({ ok: true, run_id: run.run_id }));
    break;
  }

  case 'start': {
    if (!flags.stage || !flags.role) die('start requires --stage and --role');
    const boundaries = JSON.parse(readFileSync(join(PLUGIN, 'policy', 'boundaries.json'), 'utf8'));
    const b = boundaries[flags.role];
    if (!b) die(`unknown role "${flags.role}"`);
    const boundary = {
      role: flags.role,
      stage: flags.stage,
      owned: b.owned,
      forbidden: b.forbidden,
    };
    if (flags.surfaces) boundary.task_surfaces = flags.surfaces.split(',').map((s) => s.trim());
    writeFileSync(join(DELIVERY, 'boundary.json'), JSON.stringify(boundary, null, 2));
    const run = loadRun();
    run.stage = flags.stage;
    saveRun(run);
    logEvent({ type: 'stage_start', stage: flags.stage, role: flags.role });
    console.log(JSON.stringify({ ok: true, boundary }));
    break;
  }

  case 'end': {
    if (!flags.stage || !flags.reason) die('end requires --stage and --reason');
    if (!['complete_stage', 'escalation', 'max_turns'].includes(flags.reason)) die('invalid --reason');
    rmSync(join(DELIVERY, 'boundary.json'), { force: true });
    logEvent({ type: 'stage_end', stage: flags.stage, reason: flags.reason });
    console.log(JSON.stringify({ ok: true }));
    break;
  }

  case 'task': {
    if (!flags.id || !flags.status) die('task requires --id and --status');
    const valid = ['pending', 'building', 'judging', 'complete', 'stuck', 'blocked'];
    if (!valid.includes(flags.status)) die(`invalid status — one of ${valid.join(', ')}`);
    const run = loadRun();
    const task = run.tasks[flags.id] ?? { status: 'pending', retries: 0 };
    task.status = flags.status;
    if (flags['bump-retries']) task.retries = (task.retries ?? 0) + 1;
    if (flags.owner) task.owner = flags.owner;
    if (flags.note) task.note = flags.note;
    run.tasks[flags.id] = task;
    if (flags.status === 'stuck' && !run.stuck.some((s) => s.task === flags.id)) {
      run.stuck.push({ task: flags.id, note: flags.note ?? 'no diagnostics recorded' });
    }
    saveRun(run);
    console.log(JSON.stringify({ ok: true, task: { id: flags.id, ...task } }));
    break;
  }

  case 'artifact': {
    if (!flags.type || !flags.path) die('artifact requires --type and --path');
    const run = loadRun();
    run.artifacts[flags.type] = flags.path;
    saveRun(run);
    logEvent({ type: 'artifact_write', artifact_type: flags.type, path: flags.path });
    console.log(JSON.stringify({ ok: true }));
    break;
  }

  case 'judgment': {
    if (!flags.subject || !flags.rubric || !flags.path) die('judgment requires --subject, --rubric, --path');
    const run = loadRun();
    const j = JSON.parse(readFileSync(flags.path, 'utf8'));
    run.judgments.push({ subject: flags.subject, rubric: flags.rubric, overall: j.overall, passed: j.passed, path: flags.path });
    saveRun(run);
    console.log(JSON.stringify({ ok: true, overall: j.overall, passed: j.passed }));
    break;
  }

  case 'event': {
    if (!flags.type) die('event requires --type');
    logEvent({ type: flags.type, ...(flags.data ? JSON.parse(flags.data) : {}) });
    console.log(JSON.stringify({ ok: true }));
    break;
  }

  case 'finish': {
    if (!flags.status) die('finish requires --status=complete|failed|stuck');
    const run = loadRun();
    run.status = flags.status;
    run.finished_at = new Date().toISOString();
    run.stage = 'done';
    saveRun(run);
    rmSync(join(DELIVERY, 'boundary.json'), { force: true });
    logEvent({ type: 'run_finish', status: flags.status });
    console.log(JSON.stringify({ ok: true, status: flags.status }));
    break;
  }

  case 'status': {
    const run = loadRun();
    const tasks = Object.entries(run.tasks).map(([id, t]) => `${id}:${t.status}${t.retries ? `(r${t.retries})` : ''}`);
    console.log(JSON.stringify({
      run_id: run.run_id, status: run.status, stage: run.stage,
      tasks, stuck: run.stuck, judgments: run.judgments.length, artifacts: Object.keys(run.artifacts),
    }, null, 2));
    break;
  }

  default:
    die('usage: stage.mjs init|start|end|task|artifact|judgment|event|finish|status');
}
