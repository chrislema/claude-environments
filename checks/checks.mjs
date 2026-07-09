// The deterministic check registry referenced by rubrics/ `gates[].check.deterministic`.
// Every check is a pure function returning { passed, reason }. The CLI wrapper is run.mjs;
// the self-test harness is run-all.mjs.

import { matchesAny, validate, stageSlice, pass, fail } from './lib.mjs';

const CODE_EXEC = (e) =>
  e.type === 'run_code' || (e.type === 'tool_use' && e.tool === 'Bash');
const IS_WRITE = (e) =>
  e.type === 'tool_use' && (e.tool === 'Write' || e.tool === 'Edit' || e.tool === 'MultiEdit');
const DELIVERY_PATH = (p) => p.startsWith('.delivery/');

// ---------------------------------------------------------------------------
// Artifact checks
// ---------------------------------------------------------------------------

/**
 * release_blockers_zero — two modes:
 *  - "coherence" (default): a release gate may not be PASS while blockers exist or a
 *    critical area's evidence is missing ("known blockers must be fixed, not narrated away").
 *  - "deployable": the gate must be PASS with zero blockers and no missing critical areas
 *    (the deployer's precondition).
 */
export function release_blockers_zero(gate, { mode = 'coherence' } = {}) {
  const blockers = gate.blockers ?? [];
  const missing = (gate.critical_areas ?? []).filter((a) => a.status === 'missing');
  const clean = blockers.length === 0 && missing.length === 0;
  if (mode === 'deployable') {
    if (gate.decision !== 'pass') return fail(`gate decision is "${gate.decision}", not pass`);
    if (!clean) return fail(`open blockers: ${blockers.length}, missing critical areas: ${missing.length}`);
    return pass();
  }
  if (gate.decision === 'pass' && !clean) {
    return fail(
      `decision is PASS with ${blockers.length} open blocker(s) and ${missing.length} missing critical area(s)`
    );
  }
  return pass();
}

/** dependency_graph_acyclic — task-plan dependencies form a DAG and reference real tasks. */
export function dependency_graph_acyclic(plan) {
  const ids = new Set((plan.tasks ?? []).map((t) => t.id));
  for (const t of plan.tasks ?? []) {
    for (const d of t.depends_on ?? []) {
      if (!ids.has(d)) return fail(`${t.id} depends on unknown task "${d}"`);
    }
  }
  const indeg = new Map([...ids].map((id) => [id, 0]));
  for (const t of plan.tasks) for (const d of t.depends_on ?? []) indeg.set(t.id, indeg.get(t.id) + 1);
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift();
    seen += 1;
    for (const t of plan.tasks) {
      if ((t.depends_on ?? []).includes(id)) {
        indeg.set(t.id, indeg.get(t.id) - 1);
        if (indeg.get(t.id) === 0) queue.push(t.id);
      }
    }
  }
  if (seen !== ids.size) {
    const cyclic = [...indeg].filter(([, n]) => n > 0).map(([id]) => id);
    return fail(`dependency cycle involving: ${cyclic.join(', ')}`);
  }
  return pass();
}

/** plan_schema_complete — generic schema validation: the artifact matches its schema. */
export function plan_schema_complete(artifact, { schema }) {
  if (!schema) return fail('no schema provided for artifact_type ' + artifact.artifact_type);
  const errors = validate(artifact, schema);
  return errors.length ? fail(errors.slice(0, 5).join('; ')) : pass();
}

/**
 * topology_matches_policy — Workers-first (settled policy S-001). A task plan whose scaffold
 * profile requests Cloudflare Pages must be backed by a topology_exception that quotes a
 * source line; Workers (the default, or an absent profile) needs no justification. The
 * exception is read from the passed-in readout or, if the planner copied it forward, from the
 * plan itself. No inference over prose — the profile and the exception are structured fields
 * or they do not exist.
 */
export function topology_matches_policy(plan, { readout } = {}) {
  const wantsPages = plan?.scaffold_profile?.topology === 'pages';
  if (!wantsPages) return pass('Workers-first — no topology exception required');
  const exc = readout?.topology_exception ?? plan?.topology_exception;
  if (!exc || !exc.quote || !exc.source) {
    return fail('scaffold profile requests Cloudflare Pages but no topology_exception quoting a source line exists (S-001: Workers-first)');
  }
  return pass('Pages requested with a declared, source-quoted exception');
}

/** tier_order — required tiers for the event type all passed, in order, none skipped. */
const TIER_ORDER = ['smoke', 'api', 'e2e', 'full_matrix'];
const REQUIRED_TIERS = {
  commit: ['smoke'],
  push: ['smoke', 'api', 'e2e'],
  pull_request: ['smoke', 'api', 'e2e'],
  pre_deployment: ['smoke', 'api', 'e2e', 'full_matrix'],
  production_deploy: ['smoke'],
};
export function tier_order(gate) {
  const required = REQUIRED_TIERS[gate.event_type];
  if (!required) return fail(`unknown event_type "${gate.event_type}"`);
  const status = Object.fromEntries((gate.tiers ?? []).map((t) => [t.tier, t.status]));
  for (const tier of required) {
    if (status[tier] !== 'passed') {
      return fail(`required tier "${tier}" is ${status[tier] ?? 'absent'} for event_type ${gate.event_type}`);
    }
  }
  // A later tier may not have run while an earlier one is failed/skipped/absent.
  let earlierOk = true;
  for (const tier of TIER_ORDER) {
    const s = status[tier];
    if (s === 'passed' || s === 'failed') {
      if (!earlierOk) return fail(`tier "${tier}" ran out of order — an earlier tier did not pass`);
    }
    if (s !== 'passed') earlierOk = earlierOk && (s === 'not_required' || s === undefined);
  }
  return pass();
}

/** no_bcrypt_weak_hash — files: [{path, content}]. Enforces the PBKDF2-100k policy. */
export function no_bcrypt_weak_hash(files) {
  for (const { path, content } of files) {
    if (/\bbcrypt\b/i.test(content)) return fail(`${path}: bcrypt is banned — use PBKDF2 100k via Web Crypto`);
    if (/createHash\(\s*['"]md5['"]\s*\)|\bmd5\s*\(/i.test(content)) {
      return fail(`${path}: MD5 is banned for any security purpose`);
    }
    const mentionsPassword = /password/i.test(content);
    const usesSha256 = /createHash\(\s*['"]sha-?256['"]\s*\)|digest\(\s*['"]SHA-256['"]/i.test(content);
    const usesPbkdf2 = /PBKDF2/i.test(content);
    if (mentionsPassword && usesSha256 && !usesPbkdf2) {
      return fail(`${path}: unsalted/plain SHA-256 near password handling — use PBKDF2 100k`);
    }
  }
  return pass();
}

/** file_ownership — every path is writable by the role per policy/boundaries.json. */
export function file_ownership({ role, paths, boundaries }) {
  const b = boundaries[role];
  if (!b) return fail(`unknown role "${role}"`);
  for (const p of paths) {
    if (DELIVERY_PATH(p)) continue; // artifact bookkeeping is always allowed
    if (matchesAny(p, b.forbidden ?? [])) return fail(`${role} may not write ${p} (forbidden glob)`);
    if ((b.owned ?? []).length === 0) return fail(`${role} owns no files but wrote ${p}`);
    if (!matchesAny(p, b.owned)) return fail(`${p} is outside ${role}'s owned globs`);
  }
  return pass();
}

// ---------------------------------------------------------------------------
// Trajectory checks (over .delivery/events.jsonl)
// ---------------------------------------------------------------------------

/** write_paths_in_boundary — all observed writes in the stage respect the role's globs. */
export function write_paths_in_boundary(events, { stage, role, boundaries }) {
  const slice = stageSlice(events, stage);
  const written = slice.filter(IS_WRITE).flatMap((e) => e.paths ?? []);
  return file_ownership({ role, paths: written, boundaries });
}

/** ran_code_before_complete — at least one code execution precedes stage_end. */
export function ran_code_before_complete(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const end = slice.findIndex((e) => e.type === 'stage_end');
  const window = end === -1 ? slice : slice.slice(0, end);
  return window.some(CODE_EXEC)
    ? pass()
    : fail('stage completed without any code execution — confidence is not evidence');
}

/** no_code_artifacts_written — the role wrote nothing outside .delivery/ (planner/architect/deployer). */
export function no_code_artifacts_written(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const offending = slice
    .filter(IS_WRITE)
    .flatMap((e) => e.paths ?? [])
    .filter((p) => !DELIVERY_PATH(p));
  return offending.length
    ? fail(`wrote non-artifact files: ${offending.join(', ')}`)
    : pass();
}

/** harness_run_before_findings — findings/gates written only after code actually ran. */
export function harness_run_before_findings(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const firstFinding = slice.findIndex(
    (e) => e.type === 'artifact_write' && ['review-report', 'release-gate'].includes(e.artifact_type)
  );
  if (firstFinding === -1) return pass('no findings written');
  const ranBefore = slice.slice(0, firstFinding).some(CODE_EXEC);
  return ranBefore ? pass() : fail('findings/gate written before any harness execution');
}

/** release_gate_read_before_deploy — the gate artifact was read before any deploy. */
export function release_gate_read_before_deploy(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const firstDeploy = slice.findIndex((e) => e.type === 'deploy');
  if (firstDeploy === -1) return pass('no deploy occurred');
  const readBefore = slice
    .slice(0, firstDeploy)
    .some((e) => e.type === 'artifact_read' && e.artifact_type === 'release-gate');
  return readBefore ? pass() : fail('deployed without reading the release gate — deploying on optimism');
}

/** live_verify_after_deploy — every deploy is followed by at least one live probe. */
export function live_verify_after_deploy(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const deploys = slice.map((e, i) => (e.type === 'deploy' ? i : -1)).filter((i) => i !== -1);
  if (!deploys.length) return pass('no deploy occurred');
  for (const i of deploys) {
    if (!slice.slice(i + 1).some((e) => e.type === 'live_verify')) {
      return fail('deploy has no subsequent live_verify — success was not verified');
    }
  }
  return pass();
}

/** ended_explicitly — the stage ended via complete_stage or escalation, not max_turns. */
export function ended_explicitly(events, { stage } = {}) {
  const slice = stageSlice(events, stage);
  const ends = slice.filter((e) => e.type === 'stage_end');
  if (!ends.length) return fail('no stage_end event — the stage never ended explicitly');
  const reason = ends[ends.length - 1].reason;
  return ['complete_stage', 'escalation'].includes(reason)
    ? pass()
    : fail(`stage ended by "${reason}" — thrash-to-timeout is a stability failure`);
}

// ---------------------------------------------------------------------------
// Designer teeth + shell-escape backstop (D15, S-004/S-006)
// ---------------------------------------------------------------------------

const APPROVED_FONTS = ['inter', 'archivo narrow', 'dm sans', 'space grotesk', 'libre franklin', 'source sans pro'];
const GENERIC_FONTS = ['sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'cursive', 'fantasy', 'inherit', 'initial', 'unset', '-apple-system', 'blinkmacsystemfont'];
const isUiFile = (p) => /(^|\/)public\//.test(p.replace(/^\.\//, ''));

/**
 * no_banned_ui_patterns — the visual system, enforced (S-006/S-004). Scans designer-owned
 * (public/**) files for gradients, alert/confirm/prompt dialogs, framework/library use, and
 * non-approved fonts. Non-UI files are skipped, so it passes vacuously for backend tasks.
 * files: [{path, content}].
 */
export function no_banned_ui_patterns(files) {
  for (const { path, content } of files) {
    if (!isUiFile(path)) continue;
    if (/(linear|radial|conic)-gradient\s*\(/i.test(content)) {
      return fail(`${path}: gradients are banned (S-006) — solid colors only`);
    }
    const dlg = content.match(/\b(alert|confirm|prompt)\s*\(/);
    if (dlg) return fail(`${path}: ${dlg[1]}() dialog is banned (S-006) — use inline expandable sections or a dedicated page`);
    const fw = content.match(/\b(react-dom|react|vue|angular|tailwind|bootstrap|jquery|svelte|alpinejs)\b/i);
    if (fw) return fail(`${path}: framework/library "${fw[1]}" is banned (S-004) — vanilla HTML/CSS/JS only`);
    for (const m of content.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
      for (const fam of m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase()).filter(Boolean)) {
        if (fam.startsWith('var(')) continue;
        if (!APPROVED_FONTS.includes(fam) && !GENERIC_FONTS.includes(fam)) {
          return fail(`${path}: font "${fam}" is not on the approved list (S-006): ${APPROVED_FONTS.join(', ')}`);
        }
      }
    }
    for (const m of content.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"')\s]+)/gi)) {
      const fam = decodeURIComponent(m[1].replace(/\+/g, ' ')).split(':')[0].trim().toLowerCase();
      if (!APPROVED_FONTS.includes(fam)) return fail(`${path}: Google Font "${fam}" is not on the approved list (S-006)`);
    }
  }
  return pass();
}

/** Parse `git status --porcelain` into the list of affected paths (handles renames/quotes). */
function parsePorcelain(text) {
  return (text ?? '').split('\n').filter((l) => l.trim()).map((l) => {
    const body = l.slice(3);
    const arrow = body.indexOf(' -> ');
    return (arrow !== -1 ? body.slice(arrow + 4) : body).replace(/^"|"$/g, '');
  });
}

/**
 * worktree_clean_outside_boundary — the real guarantee behind D15. `git status --porcelain`
 * at stage end, diffed against the stage-start baseline, gives the paths THIS stage dirtied
 * (cross-role prior work is excluded by the delta). Any newly-dirty path that is readonly,
 * forbidden, or outside the role's owned globs fails the gate — catching whatever the
 * shell-parse in the PreToolUse hook missed (e.g. `bash -c 'cat > public/x'`).
 * current/before: raw porcelain text.
 */
export function worktree_clean_outside_boundary(current, { before = '', role, boundaries, readonly = [] } = {}) {
  const b = boundaries?.[role];
  if (!b) return fail(`unknown role "${role}"`);
  const beforeSet = new Set(parsePorcelain(before));
  const newly = parsePorcelain(current).filter((p) => !beforeSet.has(p) && !p.startsWith('.delivery/'));
  for (const p of newly) {
    if (matchesAny(p, readonly)) return fail(`${p} is a readonly scaffold surface — role "${role}" may not modify it (worktree cross-check)`);
    if (matchesAny(p, b.forbidden ?? [])) return fail(`${p} was modified outside role "${role}" boundary (forbidden glob) — worktree cross-check caught a write the parser missed`);
    if ((b.owned ?? []).length === 0) return fail(`role "${role}" owns no files but ${p} was modified (worktree cross-check)`);
    if (!matchesAny(p, b.owned)) return fail(`${p} was modified outside role "${role}" owned globs — worktree cross-check caught a write the parser missed`);
  }
  return pass();
}

export const REGISTRY = {
  release_blockers_zero,
  dependency_graph_acyclic,
  plan_schema_complete,
  topology_matches_policy,
  tier_order,
  no_bcrypt_weak_hash,
  no_banned_ui_patterns,
  file_ownership,
  write_paths_in_boundary,
  worktree_clean_outside_boundary,
  ran_code_before_complete,
  no_code_artifacts_written,
  harness_run_before_findings,
  release_gate_read_before_deploy,
  live_verify_after_deploy,
  ended_explicitly,
};
