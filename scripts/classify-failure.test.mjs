#!/usr/bin/env node
// P13: the five-class failure taxonomy is deterministic (D16).

import { classifyFailure } from './classify-failure.mjs';

let failures = 0;
const expect = (label, got, want) => { const ok = got === want; if (!ok) failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` (got ${got}, want ${want})`}`); };

const write = { type: 'tool_use', tool: 'Write', paths: ['src/routes/login.js'] };
const code = { type: 'run_code', ref: 'probes', ok: true };
const rejected = { passed: false, gates_failed: ['no_silent_degradation'] };
const cls = (o) => classifyFailure(o).class;

expect('null judgment → infra_failure', cls({ judgment: null }), 'infra_failure');
expect('malformed judgment → infra_failure', cls({ judgment: { overall: 0.2 } }), 'infra_failure');
expect('no writes → no_writes', cls({ events: [code], det: [], judgment: rejected }), 'no_writes');
expect('write + file_ownership gate failed → boundary_blocked', cls({ events: [write, code], det: [{ id: 'file_ownership', passed: false }], judgment: rejected }), 'boundary_blocked');
expect('write, no code run → verification_failed', cls({ events: [write], det: [{ id: 'file_ownership', passed: true }], judgment: rejected }), 'verification_failed');
expect('write + module_loads failed → verification_failed', cls({ events: [write, code], det: [{ id: 'module_loads', passed: false }], judgment: rejected }), 'verification_failed');
expect('write + code + clean det + quality fail → judge_rejected', cls({ events: [write, code], det: [{ id: 'file_ownership', passed: true }, { id: 'module_loads', passed: true }], judgment: rejected }), 'judge_rejected');

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
