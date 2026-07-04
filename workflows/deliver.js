export const meta = {
  name: 'deliver',
  description: 'Judged delivery pipeline: readout → plan → review → build loop → gate → deploy',
  phases: [
    { title: 'Readout', detail: 'planner reads vision+spec' },
    { title: 'Plan', detail: 'task plan, judged until trusted' },
    { title: 'Review', detail: 'architect review, judged' },
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
const DEPLOY_MODE = args.deployMode ?? 'mock'
const JUDGE_MODEL = args.judgeModel ?? 'haiku'
const BUILD_MODEL = args.buildModel // undefined → inherit session model
const THRESHOLD = args.threshold ?? 0.7
const roleOpts = (o) => (BUILD_MODEL ? { ...o, model: BUILD_MODEL } : o)
const STAGE = `node "${PLUGIN}/scripts/stage.mjs"`
const CHECKS = `node "${PLUGIN}/checks/run.mjs"`
const ART = '.delivery/artifacts'

const OK_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, output: { type: 'string' } }, required: ['ok'] }
const JUDGMENT_SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'number' }, passed: { type: 'boolean' },
    gates_failed: { type: 'array', items: { type: 'string' } },
    remediation: { type: 'array', items: { type: 'string' } },
  },
  required: ['overall', 'passed', 'gates_failed', 'remediation'],
}
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
const GATE_SCHEMA = {
  type: 'object',
  properties: { decision: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } },
  required: ['decision', 'blockers'],
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

async function judgeArtifact({ name, rubricPath, subjectPath, detCommands, extraContext, phase }) {
  const detFile = `${ART}/judgments/${name}.det.json`
  if (detCommands.length) {
    await run(
      `${detCommands.join(' ; ')} ; true` +
      `\n\nCollect each command's single-line JSON output into a JSON array, rewriting each entry to {"id": <gate id per mapping below>, "passed": <passed>, "reason": <reason>}, and write that array to ${REPO}/${detFile}. Mapping (command order → gate id): ${detCommands.map((c, i) => `#${i + 1}=${c.gateId ?? ''}`).join(' ')}`,
      `det:${name}`, phase
    )
  }
  const judgeOutFile = `${ART}/judgments/${name}.judge.json`
  await agent(
    `You are a rubric JUDGE — a measurement instrument. Read "${PLUGIN}/agents/judge.md" and follow it exactly (production mode: skip gates whose check is deterministic — they ran as code).
Rubric: read "${rubricPath}".
Subject: read ${subjectPath} (paths relative to ${REPO}).${extraContext ? `\nAdditional surfaces: ${extraContext}` : ''}
Write ONLY the judge output JSON ({"gates":[...],"dimensions":[...]}, LLM gates and all dimensions) to ${REPO}/${judgeOutFile} — raw JSON, no fences.`,
    { label: `judge:${name}`, phase, model: JUDGE_MODEL }
  )
  const aggregated = await agent(
    `Working directory: ${REPO}\nRun: node "${PLUGIN}/scripts/aggregate.mjs" "${rubricPath}" "${judgeOutFile}"${detCommands.length ? ` --deterministic="${detFile}"` : ''} --threshold=${THRESHOLD} > "${ART}/judgments/${name}.judgment.json"; then run ${STAGE} judgment --subject=${name} --rubric=${rubricPath.split('/').pop()} --path=${ART}/judgments/${name}.judgment.json\nReturn the judgment's overall, passed, gates_failed, and remediation fields faithfully from the judgment file.`,
    { label: `aggregate:${name}`, phase, schema: JUDGMENT_SCHEMA, model: 'haiku', effort: 'low' }
  )
  return aggregated
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
let planRemediation = []
for (let attempt = 0; attempt <= MAX_RETRIES && !plan; attempt++) {
  const candidate = await agent(
    `${rolePreamble('planner', 'plan')}
Run: ${STAGE} start --stage=plan --role=planner
Read ${ART}/readout.json, the vision and spec, and the skills "${PLUGIN}/skills/decompose-tasks/SKILL.md" and "${PLUGIN}/skills/select-cloudflare-components/SKILL.md" BEFORE deciding anything (policy before prompt).
Produce a task plan per "${PLUGIN}/schemas/task-plan.schema.json". Task owners must be engineer or designer (verification is a dedicated pipeline stage — do not emit tester tasks). Every task names owned_surfaces. Write to ${ART}/task-plan.json; register: ${STAGE} artifact --type=task-plan --path=${ART}/task-plan.json
${attempt > 0 ? `THIS IS A BOUNCE (attempt ${attempt + 1}). The judge rejected the previous plan. Fix exactly these findings:\n${planRemediation.map((r) => `- ${r}`).join('\n')}\n` : ''}Finish with: ${STAGE} end --stage=plan --reason=complete_stage
Return {tasks} matching the artifact.`,
    roleOpts({ label: `planner:plan#${attempt + 1}`, schema: PLAN_SCHEMA })
  )
  if (!candidate) throw new Error('planner agent failed')
  const detCommands = [
    Object.assign(`${CHECKS} plan_schema_complete ${ART}/task-plan.json`, { gateId: 'tasks_structurally_complete' }),
    Object.assign(`${CHECKS} dependency_graph_acyclic ${ART}/task-plan.json`, { gateId: 'no_circular_dependencies' }),
  ]
  const judgment = await judgeArtifact({
    name: `task-plan-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/task-plan.rubric.json`,
    subjectPath: `${ART}/task-plan.json`,
    detCommands, phase: 'Plan',
  })
  if (judgment?.passed) plan = candidate
  else {
    planRemediation = judgment?.remediation ?? ['judge unavailable — replan conservatively']
    log(`Plan judged FAIL (overall ${judgment?.overall}) — ${attempt < MAX_RETRIES ? 'bouncing to planner' : 'out of retries'}`)
  }
}
if (!plan) {
  await run(`${STAGE} finish --status=stuck`, 'finish:plan-stuck', 'Plan')
  return { status: 'stuck', where: 'plan', remediation: planRemediation }
}

phase('Review')
let approved = false
let reviewRemediation = []
for (let attempt = 0; attempt <= MAX_RETRIES && !approved; attempt++) {
  const review = await agent(
    `${rolePreamble('architect', 'review')}
Run: ${STAGE} start --stage=review --role=architect
Read ${ART}/task-plan.json and ${ART}/readout.json. Work your full 8-point Review Checklist. Read the skills your role file names when relevant.
Produce a review-report per "${PLUGIN}/schemas/review-report.schema.json"; write to ${ART}/review-report.json; register: ${STAGE} artifact --type=review-report --path=${ART}/review-report.json
You write NO code and NO plan edits — findings only.
Finish with: ${STAGE} end --stage=review --reason=complete_stage
Return {verdict, finding_count}.`,
    roleOpts({ label: `architect:review#${attempt + 1}`, schema: VERDICT_SCHEMA })
  )
  if (!review) throw new Error('architect agent failed')
  const judgment = await judgeArtifact({
    name: `review-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/review-report.rubric.json`,
    subjectPath: `${ART}/review-report.json (and the reviewed plan at ${ART}/task-plan.json)`,
    detCommands: [], phase: 'Review',
  })
  if (!judgment?.passed) {
    log(`Review report judged FAIL — re-running architect`)
    continue
  }
  if (review.verdict === 'blocked') {
    // Cross-stage bounce: plan must absorb the findings, then review re-runs.
    reviewRemediation = [`Architect blocked the plan — read ${ART}/review-report.json and remediate every High finding`]
    const revised = await agent(
      `${rolePreamble('planner', 'plan')}
Run: ${STAGE} start --stage=plan --role=planner
The architect BLOCKED your plan. Read ${ART}/review-report.json and revise ${ART}/task-plan.json to remediate every finding (write the revised plan to the same path; re-register: ${STAGE} artifact --type=task-plan --path=${ART}/task-plan.json).
Finish with: ${STAGE} end --stage=plan --reason=complete_stage
Return {tasks} matching the revised artifact.`,
      roleOpts({ label: `planner:revise#${attempt + 1}`, phase: 'Review', schema: PLAN_SCHEMA })
    )
    if (revised) plan = revised
  } else {
    approved = true
  }
}
if (!approved) {
  await run(`${STAGE} finish --status=stuck`, 'finish:review-stuck', 'Review')
  return { status: 'stuck', where: 'review', remediation: reviewRemediation }
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
  let remediation = []
  for (let attempt = 0; attempt <= MAX_RETRIES && !done; attempt++) {
    const stage = `build:${task.id}`
    await run(`${STAGE} task --id=${task.id} --status=building --owner=${role}${attempt > 0 ? ' --bump-retries' : ''} && ${STAGE} start --stage=${stage} --role=${role} --surfaces=${task.owned_surfaces.join(',')}`, `state:${task.id}:start#${attempt + 1}`, 'Build')
    const note = await agent(
      `${rolePreamble(role, stage)}
Task ${task.id}: ${task.deliverable}
Acceptance criteria (each must be checkably met):\n${task.acceptance_criteria.map((c) => `- ${c}`).join('\n')}
Owned surfaces (write ONLY these files): ${task.owned_surfaces.join(', ')}
Context artifacts: ${ART}/task-plan.json, ${ART}/readout.json, and any prior implementation notes in ${ART}/.
${remediation.length ? `THIS IS A BOUNCE (attempt ${attempt + 1}). The judge rejected the previous attempt. Fix exactly these findings:\n${remediation.map((r) => `- ${r}`).join('\n')}\n` : ''}Implement the smallest coherent change. RUN the code to verify each acceptance criterion (log each run: ${STAGE} event --type=run_code --data='{"ref":"...","ok":true}').
Write an implementation note per "${PLUGIN}/schemas/implementation-note.schema.json" to ${ART}/note-${task.id}.json; register: ${STAGE} artifact --type=note-${task.id} --path=${ART}/note-${task.id}.json
Finish with: ${STAGE} end --stage=${stage} --reason=complete_stage
Return {ok: true} when the note is written and verification ran.`,
      roleOpts({ label: `${role}:${task.id}#${attempt + 1}`, phase: 'Build', schema: OK_SCHEMA })
    )
    if (!note?.ok) { remediation = ['builder agent failed or did not verify — rebuild and run the acceptance checks']; continue }
    const detCommands = [
      Object.assign(`${CHECKS} write_paths_in_boundary .delivery/events.jsonl --stage=${stage} --role=${role}`, { gateId: 'file_ownership' }),
      Object.assign(`${CHECKS} ran_code_before_complete .delivery/events.jsonl --stage=${stage}`, { gateId: 'module_loads' }),
    ]
    const judgment = await judgeArtifact({
      name: `${task.id}-a${attempt + 1}`,
      rubricPath: `${PLUGIN}/rubrics/implementation.rubric.json`,
      subjectPath: `${ART}/note-${task.id}.json — also run \`git -C ${REPO} diff\` and \`git -C ${REPO} status -s\` to inspect the actual code, and read the changed files`,
      detCommands, phase: 'Build',
      extraContext: `${ART}/task-plan.json (task ${task.id})`,
    })
    if (judgment?.passed) {
      done = true
      taskState[task.id] = 'complete'
      await run(`${STAGE} task --id=${task.id} --status=complete`, `state:${task.id}:complete`, 'Build')
      log(`${task.id} complete (judged ${judgment.overall})`)
    } else {
      remediation = judgment?.remediation ?? ['judge unavailable']
      log(`${task.id} judged FAIL (overall ${judgment?.overall}) — ${attempt < MAX_RETRIES ? 'bouncing' : 'marking STUCK'}`)
    }
  }
  if (!done) {
    taskState[task.id] = 'stuck'
    await run(`${STAGE} task --id=${task.id} --status=stuck --note="${remediation.join(' | ').replace(/"/g, "'").slice(0, 300)}"`, `state:${task.id}:stuck`, 'Build')
  }
}
const stuckTasks = Object.entries(taskState).filter(([, s]) => s === 'stuck' || s === 'blocked').map(([id]) => id)

phase('Test')
let gate = null
let gateRemediation = []
for (let attempt = 0; attempt <= MAX_RETRIES && !gate; attempt++) {
  const result = await agent(
    `${rolePreamble('tester', 'test')}
Run: ${STAGE} start --stage=test --role=tester
Read ${ART}/task-plan.json and every ${ART}/note-*.json. Write tests under tests/ covering the coverage requirements in your role file. RUN them against the real code (log runs: ${STAGE} event --type=run_code --data='{"ref":"...","ok":...}').
Stuck/blocked tasks in this run: ${stuckTasks.length ? stuckTasks.join(', ') : 'none'} — anything they were meant to deliver is missing evidence and fails closed.
Produce a release gate per "${PLUGIN}/schemas/release-gate.schema.json" (event_type: pre_deployment; every critical area verified-with-evidence, missing, or N/A-with-reason). Write to ${ART}/release-gate.json; register: ${STAGE} artifact --type=release-gate --path=${ART}/release-gate.json
${attempt > 0 ? `THIS IS A BOUNCE. Fix exactly these findings:\n${gateRemediation.map((r) => `- ${r}`).join('\n')}\n` : ''}Finish with: ${STAGE} end --stage=test --reason=complete_stage
Return {decision, blockers} matching the artifact.`,
    roleOpts({ label: `tester:gate#${attempt + 1}`, phase: 'Test', schema: GATE_SCHEMA })
  )
  if (!result) throw new Error('tester agent failed')
  const detCommands = [
    Object.assign(`${CHECKS} plan_schema_complete ${ART}/release-gate.json`, { gateId: 'decision_explicit' }),
    Object.assign(`${CHECKS} tier_order ${ART}/release-gate.json`, { gateId: 'tier_order' }),
    Object.assign(`${CHECKS} release_blockers_zero ${ART}/release-gate.json`, { gateId: 'pass_with_open_blockers' }),
    Object.assign(`${CHECKS} harness_run_before_findings .delivery/events.jsonl --stage=test`, { gateId: 'critical_area_evidence_trajectory' }),
  ]
  const judgment = await judgeArtifact({
    name: `release-gate-a${attempt + 1}`,
    rubricPath: `${PLUGIN}/rubrics/release-gate.rubric.json`,
    subjectPath: `${ART}/release-gate.json (evidence: .delivery/events.jsonl and tests/ — read both)`,
    detCommands, phase: 'Test',
  })
  if (judgment?.passed) gate = result
  else {
    gateRemediation = judgment?.remediation ?? ['judge unavailable']
    log(`Release gate judged FAIL — ${attempt < MAX_RETRIES ? 'bouncing tester' : 'out of retries'}`)
  }
}
if (!gate) {
  await run(`${STAGE} finish --status=stuck`, 'finish:test-stuck', 'Test')
  return { status: 'stuck', where: 'test', stuck_tasks: stuckTasks, remediation: gateRemediation }
}
if (gate.decision !== 'pass') {
  await run(`${STAGE} finish --status=failed`, 'finish:gate-fail', 'Test')
  return { status: 'gate_failed', blockers: gate.blockers, stuck_tasks: stuckTasks }
}

phase('Deploy')
const report = await agent(
  `${rolePreamble('deployer', 'deploy')}
Run: ${STAGE} start --stage=deploy --role=deployer
FIRST read the release gate: ${ART}/release-gate.json, and log it: ${STAGE} event --type=artifact_read --data='{"artifact_type":"release-gate","path":"${ART}/release-gate.json"}'
Deploy mode: ${DEPLOY_MODE}. ${DEPLOY_MODE === 'mock'
    ? `Mock deploy: start the application locally (or its closest runnable form), log ${STAGE} event --type=deploy --data='{"target":"local","revision":"<git rev-parse --short HEAD>"}', then probe it directly (health/main path AND one error path), logging each probe: ${STAGE} event --type=live_verify --data='{"target":"<url or cmd>","ok":true|false}'. Stop the app afterwards.`
    : `Real deploy: use the project's deploy command; log deploy and live_verify events as above with real targets.`}
Write a deployment report per "${PLUGIN}/schemas/deployment-report.schema.json" to ${ART}/deployment-report.json; register: ${STAGE} artifact --type=deployment-report --path=${ART}/deployment-report.json
Finish with: ${STAGE} end --stage=deploy --reason=complete_stage
Return {ok: true} only when verification actually ran.`,
  roleOpts({ label: 'deployer:deploy', schema: OK_SCHEMA })
)
const deployDet = [
  Object.assign(`${CHECKS} release_gate_read_before_deploy .delivery/events.jsonl --stage=deploy`, { gateId: 'no_deploy_through_blockers_trajectory' }),
  Object.assign(`${CHECKS} live_verify_after_deploy .delivery/events.jsonl --stage=deploy`, { gateId: 'verification_evidence_present_trajectory' }),
  Object.assign(`${CHECKS} release_blockers_zero ${ART}/release-gate.json --mode=deployable`, { gateId: 'no_deploy_through_blockers' }),
]
const deployJudgment = await judgeArtifact({
  name: 'deployment-report',
  rubricPath: `${PLUGIN}/rubrics/deployment-report.rubric.json`,
  subjectPath: `${ART}/deployment-report.json (evidence: .delivery/events.jsonl deploy stage)`,
  detCommands: deployDet, phase: 'Deploy',
})

const finalStatus = stuckTasks.length ? 'stuck' : (report?.ok && deployJudgment?.passed ? 'complete' : 'failed')
await run(`${STAGE} finish --status=${finalStatus}`, 'finish', 'Deploy')
return {
  status: finalStatus,
  tasks: taskState,
  stuck_tasks: stuckTasks,
  gate: gate.decision,
  deploy_judged: deployJudgment ? { overall: deployJudgment.overall, passed: deployJudgment.passed } : null,
}
