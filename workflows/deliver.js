export const meta = {
  name: 'deliver',
  description: 'Judged delivery pipeline: readout → plan → review → build loop → gate → deploy',
  phases: [
    { title: 'Readout', detail: 'planner reads vision+spec' },
    { title: 'Plan', detail: 'task plan, judged until trusted' },
    { title: 'Review', detail: 'architect review, judged' },
    { title: 'Scaffold', detail: 'materialize the Workers-first target from the profile (code)' },
    { title: 'Build', detail: 'per-task build/judge/bounce loop' },
    { title: 'Test', detail: 'tester harness + release gate' },
    { title: 'Deploy', detail: 'gate-checked deploy + live verify' },
  ],
}

// args: { repo, plugin, vision, spec, maxRetries?, deployMode?, judgeModel? }
// State lives in <repo>/.delivery/ via scripts/stage.mjs — this script never touches
// files itself; small runner agents are its hands. Builds run SEQUENTIALLY because the
// boundary manifest (.delivery/boundary.json) is a per-run singleton by design.

const REPO = args.repo
const PLUGIN = args.plugin
const MAX_RETRIES = args.maxRetries ?? 2
const DEPLOY_MODE = args.deployMode ?? 'local'
const JUDGE_MODEL = args.judgeModel ?? 'haiku'
const BUILD_MODEL = args.buildModel // undefined → inherit session model
const roleOpts = (o) => (BUILD_MODEL ? { ...o, model: BUILD_MODEL } : o)
const STAGE = `node "${PLUGIN}/scripts/stage.mjs"`
const CHECKS = `node "${PLUGIN}/checks/run.mjs"`
const AGG = `node "${PLUGIN}/scripts/aggregate.mjs"`
const ART = '.delivery/artifacts'

const OK_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, output: { type: 'string' } }, required: ['ok'] }
const READOUT_SCHEMA = {
  type: 'object',
  properties: {
    blocking_ambiguities: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['blocking_ambiguities', 'summary'],
}
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, owner: { type: 'string' }, deliverable: { type: 'string' },
          depends_on: { type: 'array', items: { type: 'string' } },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          owned_surfaces: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'owner', 'deliverable', 'depends_on', 'acceptance_criteria', 'owned_surfaces'],
      },
    },
  },
  required: ['tasks'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string' }, finding_count: { type: 'number' } },
  required: ['verdict'],
}

// --- helpers -----------------------------------------------------------------

const run = (cmd, label, phase) =>
  agent(
    `Working directory: ${REPO}\nRun exactly this command from there and report faithfully:\n\n${cmd}\n\nReturn {ok: true} only if the command exited 0; on failure return {ok: false, output: <stderr/stdout tail>}. Do not fix anything.`,
    { label, phase, schema: OK_SCHEMA, model: 'haiku', effort: 'low' }
  )

const rolePreamble = (role, stage) => `You are the ${role.toUpperCase()} role in a judged delivery pipeline.
Working directory (run every command from here): ${REPO}
First: Read your role definition at "${PLUGIN}/agents/${role}.md" and follow its Mission, Core Behavior, and Must Not sections exactly.
The delivery run's constitution: policy before prompt; stable failure over clever recovery; small blast radius; explicit ownership; real evidence over confident narration; release gates matter.
Artifacts directory: ${REPO}/${ART}/ (JSON artifacts conforming to "${PLUGIN}/schemas/").
Whenever you execute code, tests, or probes, log it: ${STAGE} event --type=run_code --data='{"ref":"<what ran>","ok":true|false}' (run from ${REPO}).
Stage: ${stage}. Do not touch files outside your boundary; the boundary hook and post-hoc trajectory checks both watch.`

// Deterministic truth path (T2/D10): run.mjs runs the gate-set and writes+registers the det
// file itself; the judge only scores LLM gates/dimensions into its own file; aggregate.mjs
// computes the judgment and writes+registers it itself. The workflow reads pass/fail from
// aggregate's EXIT CODE and passes the judgment FILE PATH into bounces — never a transcribed
// score. No model token generation sits between a check and the file a gate reads.
async function judgeArtifact({ name, rubricPath, subjectPath, gateSet, gateSetArgs = '', extraContext, phase }) {
  const detFile = `${ART}/judgments/${name}.det.json`
  const judgeOutFile = `${ART}/judgments/${name}.judge.json`
  const judgmentFile = `${ART}/judgments/${name}.judgment.json`

  if (gateSet) {
    await run(`${CHECKS} gate-set ${gateSet} ${gateSetArgs} --out=${detFile} --register`, `det:${name}`, phase)
  }

  const judgePrompt = `You are a rubric JUDGE — a measurement instrument. Read "${PLUGIN}/agents/judge.md" and follow it exactly (production mode: skip gates whose check is deterministic — they ran as code).
Rubric: read "${rubricPath}".
Subject: read ${subjectPath} (paths relative to ${REPO}).${extraContext ? `\nAdditional surfaces: ${extraContext}` : ''}
Write ONLY the judge output JSON ({"gates":[...],"dimensions":[...]}, LLM gates and all dimensions) to ${REPO}/${judgeOutFile} — raw JSON, no fences.`

  // Judge malfunction handling (commands/judge.md): a died judge is respawned once, then
  // reported — never improvised into a passing score.
  let judged = await agent(judgePrompt, { label: `judge:${name}`, phase, model: JUDGE_MODEL })
  if (judged === null) {
    judged = await agent(judgePrompt, { label: `judge:${name}#respawn`, phase, model: JUDGE_MODEL })
    if (judged === null) throw new Error(`judge malfunction for ${name}: no output after one respawn — parking rather than improvising a score`)
  }

  // aggregate.mjs exits 0 iff the judgment passed; the runner reports only that exit status.
  const agg = await run(
    `${AGG} "${rubricPath}" ${judgeOutFile}${gateSet ? ` --deterministic=${detFile}` : ''} --out=${judgmentFile} --register --subject=${name}`,
    `aggregate:${name}`, phase
  )
  return { passed: !!agg?.ok, judgmentFile }
}

// Classified retries (D16): a runner runs the deterministic classifier; deliver.js reshapes
// the retry by class. Returns one of no_writes | boundary_blocked | verification_failed |
// judge_rejected | infra_failure.
async function classifyFailure(stage, name, judgmentFile) {
  const c = await agent(
    `Working directory: ${REPO}\nRun exactly this and report the JSON it prints faithfully:\nnode "${PLUGIN}/scripts/classify-failure.mjs" --events=.delivery/events.jsonl --stage=${stage} --det=${ART}/judgments/${name}.det.json --judgment=${judgmentFile}\nReturn {class, reason}. Do not fix anything.`,
    { label: `classify:${name}`, phase: 'Build', model: 'haiku', effort: 'low', schema: { type: 'object', properties: { class: { type: 'string' }, reason: { type: 'string' } }, required: ['class'] } }
  )
  return c?.class ?? 'judge_rejected'
}

const bounceText = (shape, file, attempt) => {
  const head = `THIS IS A BOUNCE (attempt ${attempt + 1}). `
  if (shape === 'no_writes') return head + `The previous attempt wrote nothing. Restate your owned surfaces and write the smallest real change to them — do not explore.\n`
  if (shape === 'verification_failed') return head + `The previous attempt did not verify. Read the failing output in the judgment at ${file}, fix it, and RUN the acceptance checks — do not add new surfaces.\n`
  return head + (file ? `The judge rejected the previous attempt. Read the judgment at ${file} and fix exactly the items in its "remediation" array.\n` : `Rebuild and run the acceptance checks.\n`)
}

// Trajectory advisory (D18): score a stage's turn log against its trajectory rubric, record it,
// and NEVER bounce on it (activation.gating=false). Failures here are non-fatal by construction.
async function trajectoryAdvisory(role, stage, name) {
  try {
    await judgeArtifact({
      name: `traj-${name}`,
      rubricPath: `${PLUGIN}/rubrics/trajectory/${role}.rubric.json`,
      subjectPath: `the "${stage}" slice of .delivery/events.jsonl (the ${role}'s turn log — tool calls, escalations, artifact writes)`,
      phase: 'Advisory',
    })
  } catch { /* advisory only — never affects control flow */ }
}

function topoOrder(tasks) {
  const order = []
  const done = new Set()
  let progress = true
  while (order.length < tasks.length && progress) {
    progress = false
    for (const t of tasks) {
      if (done.has(t.id)) continue
      if ((t.depends_on ?? []).every((d) => done.has(d))) {
        order.push(t); done.add(t.id); progress = true
      }
    }
  }
  return order // acyclicity already gated by dependency_graph_acyclic
}

// --- pipeline ----------------------------------------------------------------

phase('Readout')
const readout = await agent(
  `${rolePreamble('planner', 'readout')}
Run: ${STAGE} start --stage=readout --role=planner
Read the vision ("${REPO}/${args.vision}") and spec ("${REPO}/${args.spec}").
Produce a readout per "${PLUGIN}/schemas/readout.schema.json"; write it to ${ART}/readout.json; register it: ${STAGE} artifact --type=readout --path=${ART}/readout.json
Finish with: ${STAGE} end --stage=readout --reason=complete_stage
Return {blocking_ambiguities, summary} matching the artifact. Only genuine blockers belong in blocking_ambiguities — prefer safe assumptions, recorded in the artifact.`,
  roleOpts({ label: 'planner:readout', schema: READOUT_SCHEMA })
)
if (!readout) throw new Error('readout agent failed')
if (readout.blocking_ambiguities.length > 0) {
  await run(`${STAGE} finish --status=stuck`, 'finish:blocked', 'Readout')
  return { status: 'blocked_on_questions', questions: readout.blocking_ambiguities, summary: readout.summary }
}

phase('Plan')
let plan = null
let planRemediationFile = null
for (let attempt = 0; attempt <= MAX_RETRIES && !plan; attempt++) {
  const candidate = await agent(
    `${rolePreamble('planner', 'plan')}
Run: ${STAGE} start --stage=plan --role=planner
Read ${ART}/readout.json, the vision and spec, and the skills "${PLUGIN}/skills/decompose-tasks/SKILL.md" and "${PLUGIN}/skills/select-cloudflare-components/SKILL.md" BEFORE deciding anything (policy before prompt).
Produce a task plan per "${PLUGIN}/schemas/task-plan.schema.json". Task owners must be engineer or designer (verification is a dedicated pipeline stage — do not emit tester tasks). Every task names owned_surfaces. Write to ${ART}/task-plan.json; register: ${STAGE} artifact --type=task-plan --path=${ART}/task-plan.json
${attempt > 0 && planRemediationFile ? `THIS IS A BOUNCE (attempt ${attempt + 1}). The judge rejected the previous plan. Read the judgment at ${planRemediationFile} and fix exactly the items in its "remediation" array.\n` : ''}Finish with: ${STAGE} end --stage=plan --reason=complete_stage
Return {tasks} matching the artifact.`,
    roleOpts({ label: `planner:plan#${attempt + 1}`, schema: PLAN_SCHEMA })
  )
  if (!candidate) throw new Error('planner agent failed')
  const judgment = await judgeArtifact({
    name: `task-plan-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/task-plan.rubric.json`,
    subjectPath: `${ART}/task-plan.json`,
    gateSet: 'plan',
    gateSetArgs: `--artifact=${ART}/task-plan.json --readout=${ART}/readout.json`,
    phase: 'Plan',
  })
  if (judgment.passed) plan = candidate
  else {
    planRemediationFile = judgment.judgmentFile
    log(`Plan judged FAIL — ${attempt < MAX_RETRIES ? 'bouncing to planner with remediation' : 'out of retries'}`)
  }
}
if (!plan) {
  await run(`${STAGE} finish --status=stuck`, 'finish:plan-stuck', 'Plan')
  return { status: 'stuck', where: 'plan', remediation_file: planRemediationFile }
}
await trajectoryAdvisory('planner', 'plan', 'plan')

phase('Review')
let approved = false
let reviewRemediationFile = null
let planReadyForApproval = true // the current task-plan.json passed its plan judge in the Plan phase
for (let attempt = 0; attempt <= MAX_RETRIES && !approved; attempt++) {
  const review = await agent(
    `${rolePreamble('architect', 'review')}
Run: ${STAGE} start --stage=review --role=architect
Read ${ART}/task-plan.json and ${ART}/readout.json. Work your full 8-point Review Checklist. Read the skills your role file names when relevant.
${reviewRemediationFile ? `THIS IS A BOUNCE (attempt ${attempt + 1}). A prior judgment recorded remediation at ${reviewRemediationFile} — read it and make sure your review addresses those items.\n` : ''}Produce a review-report per "${PLUGIN}/schemas/review-report.schema.json"; write to ${ART}/review-report.json; register: ${STAGE} artifact --type=review-report --path=${ART}/review-report.json
You write NO code and NO plan edits — findings only.
Finish with: ${STAGE} end --stage=review --reason=complete_stage
Return {verdict, finding_count}.`,
    roleOpts({ label: `architect:review#${attempt + 1}`, schema: VERDICT_SCHEMA })
  )
  if (!review) throw new Error('architect agent failed')
  const reviewJudgment = await judgeArtifact({
    name: `review-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/review-report.rubric.json`,
    subjectPath: `${ART}/review-report.json (and the reviewed plan at ${ART}/task-plan.json)`,
    phase: 'Review',
  })
  if (!reviewJudgment.passed) {
    // Repair 1: the review-report's own remediation is injected into the architect re-run.
    reviewRemediationFile = reviewJudgment.judgmentFile
    log(`Review report judged FAIL — re-running architect with its remediation`)
    continue
  }
  if (review.verdict !== 'blocked') {
    if (planReadyForApproval) { approved = true; break }
    log(`Review clean but the revised plan is not judge-ready — re-reviewing (bounded to STUCK)`)
    continue
  }
  // Architect BLOCKED. Repair 2: the planner revises, then the revised plan is RE-GATED and
  // RE-JUDGED before review resumes — a revision is never silently accepted as the plan.
  const revised = await agent(
    `${rolePreamble('planner', 'plan')}
Run: ${STAGE} start --stage=plan --role=planner
The architect BLOCKED your plan. Read ${ART}/review-report.json and revise ${ART}/task-plan.json to remediate every finding (write the revised plan to the same path; re-register: ${STAGE} artifact --type=task-plan --path=${ART}/task-plan.json).
Finish with: ${STAGE} end --stage=plan --reason=complete_stage
Return {tasks} matching the revised artifact.`,
    roleOpts({ label: `planner:revise#${attempt + 1}`, phase: 'Review', schema: PLAN_SCHEMA })
  )
  if (!revised) throw new Error('planner revise agent failed')
  plan = revised // keep the in-script plan in sync with the rewritten file
  const revisedJudgment = await judgeArtifact({
    name: `task-plan-rev-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/task-plan.rubric.json`,
    subjectPath: `${ART}/task-plan.json`,
    gateSet: 'plan',
    gateSetArgs: `--artifact=${ART}/task-plan.json --readout=${ART}/readout.json`,
    phase: 'Review',
  })
  planReadyForApproval = revisedJudgment.passed
  reviewRemediationFile = revisedJudgment.passed ? null : revisedJudgment.judgmentFile
  log(revisedJudgment.passed ? `Revised plan re-gated + re-judged PASS — re-reviewing` : `Revised plan re-gated FAIL — re-reviewing (bounded to STUCK)`)
}
if (!approved) {
  await run(`${STAGE} finish --status=stuck`, 'finish:review-stuck', 'Review')
  return { status: 'stuck', where: 'review', remediation_file: reviewRemediationFile }
}
await trajectoryAdvisory('architect', 'review', 'review')

// Scaffold (CODE, D11): greenfield plans carry a profile; scaffold.mjs materializes the
// Workers-first target, its manifest becomes the readonly baseline for build stages
// (stage.mjs reads it), and a deterministic hygiene gate guards the generated config.
if (plan.scaffold_profile) {
  phase('Scaffold')
  const prof = plan.scaffold_profile
  const flagArg = (prof.flags ?? []).length ? ` --flags=${prof.flags.join(',')}` : ''
  const descArg = prof.description ? ` --description=${JSON.stringify(prof.description)}` : ''
  await run(`${STAGE} start --stage=scaffold --role=engineer`, 'scaffold:start', 'Scaffold')
  await run(`node "${PLUGIN}/scripts/scaffold.mjs" --name=${prof.name} --out=.${flagArg}${descArg} > ${ART}/scaffold-manifest.json`, 'scaffold:materialize', 'Scaffold')
  await run(`${STAGE} artifact --type=scaffold-manifest --path=${ART}/scaffold-manifest.json`, 'scaffold:register', 'Scaffold')
  const hygiene = await run(`${CHECKS} gate-set scaffold --config=wrangler.jsonc --out=${ART}/judgments/scaffold.det.json --register`, 'scaffold:hygiene', 'Scaffold')
  await run(`${STAGE} end --stage=scaffold --reason=complete_stage`, 'scaffold:end', 'Scaffold')
  if (!hygiene?.ok) {
    await run(`${STAGE} finish --status=stuck`, 'finish:scaffold-stuck', 'Scaffold')
    return { status: 'stuck', where: 'scaffold', detail: 'wrangler config hygiene failed on the materialized scaffold' }
  }
}

phase('Build')
const ordered = topoOrder(plan.tasks)
const taskState = {}
for (const task of ordered) {
  const blockedBy = (task.depends_on ?? []).filter((d) => taskState[d] !== 'complete')
  if (blockedBy.length) {
    taskState[task.id] = 'blocked'
    await run(`${STAGE} task --id=${task.id} --status=blocked --note="blocked by stuck dependency ${blockedBy.join(',')}"`, `state:${task.id}:blocked`, 'Build')
    log(`${task.id} blocked by ${blockedBy.join(', ')} — skipping`)
    continue
  }
  const role = task.owner === 'designer' ? 'designer' : 'engineer'
  let done = false
  let remediationFile = null
  let retryShape = null
  let infraRetries = 0
  for (let attempt = 0; attempt <= MAX_RETRIES && !done; attempt++) {
    const stage = `build:${task.id}`
    await run(`${STAGE} task --id=${task.id} --status=building --owner=${role}${attempt > 0 ? ' --bump-retries' : ''} && ${STAGE} start --stage=${stage} --role=${role} --surfaces=${task.owned_surfaces.join(',')}`, `state:${task.id}:start#${attempt + 1}`, 'Build')
    const note = await agent(
      `${rolePreamble(role, stage)}
Task ${task.id}: ${task.deliverable}
Acceptance criteria (each must be checkably met):\n${task.acceptance_criteria.map((c) => `- ${c}`).join('\n')}
Owned surfaces (write ONLY these files): ${task.owned_surfaces.join(', ')}
Context artifacts: ${ART}/task-plan.json, ${ART}/readout.json, and any prior implementation notes in ${ART}/.
${attempt > 0 ? bounceText(retryShape, remediationFile, attempt) : ''}Implement the smallest coherent change. RUN the code to verify each acceptance criterion (log each run: ${STAGE} event --type=run_code --data='{"ref":"...","ok":true}').
Write an implementation note per "${PLUGIN}/schemas/implementation-note.schema.json" to ${ART}/note-${task.id}.json; register: ${STAGE} artifact --type=note-${task.id} --path=${ART}/note-${task.id}.json
Finish with: ${STAGE} end --stage=${stage} --reason=complete_stage
Return {ok: true} when the note is written and verification ran.`,
      roleOpts({ label: `${role}:${task.id}#${attempt + 1}`, phase: 'Build', schema: OK_SCHEMA })
    )
    if (!note?.ok) { remediationFile = null; continue }
    const judgment = await judgeArtifact({
      name: `${task.id}-a${attempt + 1}`,
      rubricPath: `${PLUGIN}/rubrics/implementation.rubric.json`,
      subjectPath: `${ART}/note-${task.id}.json — also run \`git -C ${REPO} diff\` and \`git -C ${REPO} status -s\` to inspect the actual code, and read the changed files`,
      gateSet: 'build',
      gateSetArgs: `--events=.delivery/events.jsonl --stage=${stage} --role=${role} --files=${task.owned_surfaces.join(',')}`,
      phase: 'Build',
      extraContext: `${ART}/task-plan.json (task ${task.id})`,
    })
    await trajectoryAdvisory(role, stage, `${task.id}-a${attempt + 1}`)
    if (judgment.passed) {
      done = true
      taskState[task.id] = 'complete'
      await run(`${STAGE} task --id=${task.id} --status=complete`, `state:${task.id}:complete`, 'Build')
      log(`${task.id} complete`)
    } else {
      remediationFile = judgment.judgmentFile
      const klass = await classifyFailure(stage, `${task.id}-a${attempt + 1}`, remediationFile)
      if (klass === 'boundary_blocked') {
        log(`${task.id}: boundary_blocked — task surfaces likely wrong; escalating to STUCK without burning retries`)
        break
      }
      if (klass === 'infra_failure' && infraRetries < 1) {
        infraRetries += 1; attempt -= 1
        log(`${task.id}: infra_failure — retrying once without consuming the retry budget`)
        continue
      }
      retryShape = klass
      log(`${task.id} judged FAIL (${klass}) — ${attempt < MAX_RETRIES ? 'bouncing with a shaped retry' : 'marking STUCK'}`)
    }
  }
  if (!done) {
    taskState[task.id] = 'stuck'
    await run(`${STAGE} task --id=${task.id} --status=stuck --note="see judgment ${remediationFile ?? '(builder never verified)'}"`, `state:${task.id}:stuck`, 'Build')
  }
}
const stuckTasks = Object.entries(taskState).filter(([, s]) => s === 'stuck' || s === 'blocked').map(([id]) => id)

phase('Test')
// The tester authors the plan of proof + the vitest suite (judged); code executes the chain
// and synthesizes the gate — the model specifies what to prove, code reports what was proven.
let probePlanOk = false
let probeRemediationFile = null
for (let attempt = 0; attempt <= MAX_RETRIES && !probePlanOk; attempt++) {
  const result = await agent(
    `${rolePreamble('tester', 'test')}
Run: ${STAGE} start --stage=test --role=tester
Read ${ART}/task-plan.json, every ${ART}/note-*.json, the vision ("${REPO}/${args.vision}"), and the spec ("${REPO}/${args.spec}").
Author TWO artifacts:
1) A probe plan per "${PLUGIN}/schemas/probe-plan.schema.json": one probe per behavior that must be proven — each with tier, method, path, expect (status AND the body/header shape where that is the contract), the critical_area it evidences, and a source_ref quoting the exact vision/spec line that motivates it. Cover auth (401/403), error responses (the Level-4 error shape on at least one path), and limit enforcement (429) wherever surfaces exist. Declare any critical area with no surface in scope as unprobeable, with a reason. Write to ${ART}/probe-plan.json; register: ${STAGE} artifact --type=probe-plan --path=${ART}/probe-plan.json
2) The vitest integration suite under tests/ (the api tier), designed for the Workers pool. Log runs: ${STAGE} event --type=run_code --data='{"ref":"...","ok":...}'.
Stuck/blocked tasks in this run: ${stuckTasks.length ? stuckTasks.join(', ') : 'none'} — anything they were meant to deliver is missing evidence; its critical area will fail closed.
You DO NOT author the release gate — code synthesizes it from executed evidence.
${attempt > 0 && probeRemediationFile ? `THIS IS A BOUNCE. Read the judgment at ${probeRemediationFile} and fix exactly the items in its "remediation" array.\n` : ''}Finish with: ${STAGE} end --stage=test --reason=complete_stage
Return {ok: true} when the probe plan and the vitest suite are both written.`,
    roleOpts({ label: `tester:probe-plan#${attempt + 1}`, phase: 'Test', schema: OK_SCHEMA })
  )
  if (!result) throw new Error('tester agent failed')
  const judgment = await judgeArtifact({
    name: `probe-plan-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/probe-plan.rubric.json`,
    subjectPath: `${ART}/probe-plan.json — trace each source_ref against the vision (${args.vision}) and spec (${args.spec})`,
    gateSet: 'probe-plan',
    gateSetArgs: `--artifact=${ART}/probe-plan.json --sources=${args.vision},${args.spec}`,
    phase: 'Test',
  })
  if (judgment.passed) probePlanOk = true
  else {
    probeRemediationFile = judgment.judgmentFile
    log(`Probe plan judged FAIL — ${attempt < MAX_RETRIES ? 'bouncing tester with remediation' : 'out of retries'}`)
  }
}
if (!probePlanOk) {
  await run(`${STAGE} finish --status=stuck`, 'finish:probe-stuck', 'Test')
  return { status: 'stuck', where: 'probe-plan', stuck_tasks: stuckTasks, remediation_file: probeRemediationFile }
}
await trajectoryAdvisory('tester', 'test', 'test')

// Evidence engine (CODE, D12/D13): run the chain, synthesize the gate, gate it deterministically.
// No model token generation sits between the executed evidence and the release decision.
await run(`${STAGE} start --stage=evidence --role=tester`, 'evidence:start', 'Test')
await run(`node "${PLUGIN}/scripts/evidence.mjs" --dir=. --probe-plan=${ART}/probe-plan.json --out=.delivery/evidence.jsonl --tier=e2e`, 'evidence:run', 'Test')
await run(`node "${PLUGIN}/scripts/synthesize-gate.mjs" .delivery/evidence.jsonl ${ART}/probe-plan.json --event-type=pull_request --out=${ART}/release-gate.json --register`, 'synthesize:gate', 'Test')
const releaseGate = await run(`${CHECKS} gate-set release --artifact=${ART}/release-gate.json --evidence=.delivery/evidence.jsonl --out=${ART}/judgments/release.det.json --register`, 'release:gate', 'Test')
await run(`${STAGE} end --stage=evidence --reason=complete_stage`, 'evidence:end', 'Test')
if (!releaseGate?.ok) {
  await run(`${STAGE} finish --status=failed`, 'finish:gate-fail', 'Test')
  return { status: 'gate_failed', where: 'release', stuck_tasks: stuckTasks, gate_file: `${ART}/release-gate.json` }
}

phase('Deploy')
// Versioned deploy (D19): the deployer performs the mode's actions and logs events; code
// synthesizes the report (rollback = a recorded prior version id) and the gate is deterministic.
// Gradual promotion is the production default; prior-version capture is required before promote.
const deployerNote = await agent(
  `${rolePreamble('deployer', 'deploy')}
Run: ${STAGE} start --stage=deploy --role=deployer
FIRST read the release gate: ${ART}/release-gate.json, and log it: ${STAGE} event --type=artifact_read --data='{"artifact_type":"release-gate","path":"${ART}/release-gate.json"}'
Deploy mode: ${DEPLOY_MODE}.
${DEPLOY_MODE === 'local'
    ? `LOCAL: the evidence engine already probed the Worker against a live \`wrangler dev\` in the Test stage. Log a deploy marker: ${STAGE} event --type=deploy --data='{"target":"local","revision":"'$(git rev-parse --short HEAD)'"}'; boot \`wrangler dev\` briefly, probe /health, log ${STAGE} event --type=live_verify --data='{"target":"http://127.0.0.1:<port>/health","ok":true}'; stop it.`
    : DEPLOY_MODE === 'staging'
    ? `STAGING: apply D1 migrations to staging (log each: ${STAGE} event --type=migration_applied --data='{"name":"<file>"}'); \`wrangler deploy --env staging\`; log ${STAGE} event --type=deploy --data='{"target":"staging","revision":"<version id>"}'; probe the deployed URL, log live_verify events. Requires Cloudflare credentials; if unavailable, log a live_verify with ok:false and stop — never fake success.`
    : `PRODUCTION: staging first, then the versioned path. Capture the prior version BEFORE promoting: from \`wrangler deployments list --env production\` log ${STAGE} event --type=prior_version --data='{"version_id":"<id>"}' (if none, STOP — a promote without a prior version is forbidden). \`wrangler versions upload --env production\` → log version_upload with the preview URL; probe the preview (live_verify). Record approval: ${STAGE} event --type=approval --data='{"approver":"<name>","decision":"approve"}'. Then \`wrangler versions deploy --env production\` GRADUALLY (10% → observe → 100%) unless the profile opts out — log ${STAGE} event --type=version_promote --data='{"version_id":"<id>","percentage":100}'; re-probe and log live_verify. Requires credentials and recorded approval; without them, stop honestly.`}
Do NOT write the deployment report — code synthesizes it from your events.
Finish with: ${STAGE} end --stage=deploy --reason=complete_stage
Return {ok: true} only when the mode's verification actually ran.`,
  roleOpts({ label: 'deployer:deploy', schema: OK_SCHEMA })
)
await trajectoryAdvisory('deployer', 'deploy', 'deploy')
// Synthesize the deployment report from events (CODE, D19), then gate it deterministically.
await run(`node "${PLUGIN}/scripts/deploy-report.mjs" --events=.delivery/events.jsonl --stage=deploy --env=${DEPLOY_MODE} --out=${ART}/deployment-report.json --register`, 'deploy:report', 'Deploy')
const deployGate = await run(`${CHECKS} gate-set deploy --artifact=${ART}/release-gate.json --report=${ART}/deployment-report.json --events=.delivery/events.jsonl --stage=deploy --out=${ART}/judgments/deploy.det.json --register`, 'deploy:gate', 'Deploy')

const finalStatus = stuckTasks.length ? 'stuck' : (deployerNote?.ok && deployGate?.ok ? 'complete' : 'failed')
await run(`${STAGE} finish --status=${finalStatus}`, 'finish', 'Deploy')
return {
  status: finalStatus,
  tasks: taskState,
  stuck_tasks: stuckTasks,
  gate: 'pass',
  deploy: { mode: DEPLOY_MODE, report: `${ART}/deployment-report.json`, gate_passed: !!deployGate?.ok },
}
