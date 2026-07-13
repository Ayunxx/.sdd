import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const START = '// SDD_WORKFLOW_CORE_START'
const END = '// SDD_WORKFLOW_CORE_END'

function coreBlock(source) {
  const start = source.indexOf(START)
  const end = source.indexOf(END)
  assert.notEqual(start, -1, `missing ${START}`)
  assert.notEqual(end, -1, `missing ${END}`)
  return source.slice(start, end + END.length).replace(/\r\n/g, '\n')
}

async function compileWorkflow() {
  const workflow = await readFile(new URL('../workflows/sdd-implement.js', import.meta.url), 'utf8')
  const runtimeBody = workflow.replace('export const meta =', 'const meta =')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', runtimeBody)
}

function validSnapshot(entries = []) {
  return {
    status: 'ok',
    protocol: 'sdd-git-audit-v1',
    root: 'C:/repo',
    head: 'a'.repeat(40),
    entries,
    commands: [
      { kind: 'root', subject: '', argv: ['git', 'rev-parse', '--show-toplevel'], exitCode: 0 },
      { kind: 'head', subject: '', argv: ['git', 'rev-parse', 'HEAD'], exitCode: 0 },
      { kind: 'status', subject: '', argv: ['git', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], exitCode: 0 },
      ...entries.flatMap(entry => entry.state === '??'
        ? [{ kind: 'untracked-fingerprint', subject: entry.path, argv: ['git', 'hash-object', '--no-filters', '--', entry.path], exitCode: 0 }]
        : [
            { kind: 'tracked-diff', subject: entry.path, argv: ['git', '--literal-pathspecs', 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', entry.path], exitCode: 0 },
            { kind: 'tracked-fingerprint', subject: entry.path, argv: ['git', 'hash-object', '--stdin'], exitCode: 0 },
          ]),
    ],
    notes: '',
  }
}

function workflowTask(id, overrides = {}) {
  return {
    id,
    what: `implement ${id}`,
    boundary: [`src/${id.toLowerCase()}.js`],
    depends: [],
    doneWhen: `${id} behavior is verified`,
    risk: 'low',
    review: 'feature-final(api compatibility)',
    testPolicy: 'persistent',
    resources: [],
    gateIsolation: 'scoped',
    ...overrides,
  }
}

function validImplementer(files = []) {
  return { status: 'implemented', files, deviation: '', notes: '' }
}

function validVerifier(overrides = {}) {
  return {
    status: 'pass',
    quality: { format: 'pass', lint: 'pass', typecheck: 'pass', test: 'pass' },
    evidence: ['format', 'lint', 'typecheck', 'test'].map(gate => ({
      gate, outcome: 'pass', command: `run-${gate}`, exitCode: 0, summary: 'passed',
    })),
    acceptance: [{ criterion: 'Done when', outcome: 'pass', evidence: 'behavior test passed' }],
    worktreeUnchanged: true,
    notes: '',
    ...overrides,
  }
}

function twoWaveArgs() {
  return {
    featureDir: 'specs/001-runtime',
    featureRoot: 'C:/repo',
    constitutionPath: 'C:/repo/specs/constitution.md',
    waves: [
      { id: 'W1', taskIds: ['T1'] },
      { id: 'W2', taskIds: ['T2'] },
    ],
    tasks: {
      T1: workflowTask('T1', { what: 'first', boundary: ['src/a.js'] }),
      T2: workflowTask('T2', { what: 'second', boundary: ['src/b.js'], depends: ['T1'] }),
    },
  }
}

async function runThunks(thunks) {
  return Promise.all(thunks.map(thunk => thunk()))
}

test('embedded Workflow core stays byte-for-byte aligned with testable module', async () => {
  const [workflow, module] = await Promise.all([
    readFile(new URL('../workflows/sdd-implement.js', import.meta.url), 'utf8'),
    readFile(new URL('../workflows/sdd-implement-core.js', import.meta.url), 'utf8'),
  ])
  assert.equal(coreBlock(workflow), coreBlock(module))
})

test('Workflow body parses in the runtime async-function shape', async () => {
  const workflow = await readFile(new URL('../workflows/sdd-implement.js', import.meta.url), 'utf8')
  const runtimeBody = workflow.replace('export const meta =', 'const meta =')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  assert.doesNotThrow(() => new AsyncFunction(runtimeBody))
})

test('agent dispatch smoke fixture parses and preserves plain/structured results', async () => {
  const fixture = await readFile(new URL('./fixtures/workflow-agent-smoke.js', import.meta.url), 'utf8')
  const runtimeBody = fixture.replace('export const meta =', 'const meta =')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const run = new AsyncFunction('agent', 'parallel', 'phase', runtimeBody)
  const phases = []
  const result = await run(async (_prompt, options) => (
    options.label === 'plain-dispatch' ? 'READY' : { ok: true, message: 'READY' }
  ), runThunks, title => phases.push(title))
  assert.deepEqual(phases, ['dispatch'])
  assert.deepEqual(result, {
    plain: 'READY',
    structured: { ok: true, message: 'READY' },
    plainWasNull: false,
    structuredWasNull: false,
  })
})

test('invalid plan returns before any agent is started', async () => {
  const run = await compileWorkflow()
  let agentCalls = 0
  let phaseCalls = 0
  const result = await run({
    featureDir: 'specs/001-invalid',
    featureRoot: 'C:/repo',
    constitutionPath: 'C:/repo/specs/constitution.md',
    waves: [
      { id: 'W1', taskIds: ['T1'] },
      { id: 'W2', taskIds: ['T2'] },
    ],
    tasks: {
      T1: workflowTask('T1', { boundary: ['src/a.js'], depends: ['T2'] }),
      T2: workflowTask('T2', { boundary: ['src/b.js'] }),
    },
  }, async () => {
    agentCalls += 1
    throw new Error('agent must not run for an invalid plan')
  }, async () => [], () => {
    phaseCalls += 1
  }, () => {})

  assert.equal(agentCalls, 0)
  assert.equal(phaseCalls, 0)
  assert.equal(result.totals.done, 0)
  assert.equal(result.totals.blocked, 2)
  assert.equal(result.planErrors.some(error => error.code === 'DEPENDENCY_NOT_EARLIER'), true)
  assert.deepEqual(result.runtimeFailures, [])
  assert.equal(result.taskEvidence.every(task => task.state === 'blocked'), true)
})

test('missing args returns structured plan errors instead of throwing or dispatching', async () => {
  const run = await compileWorkflow()
  let agentCalls = 0
  let phaseCalls = 0
  const result = await run(undefined, async () => {
    agentCalls += 1
    return null
  }, runThunks, () => {
    phaseCalls += 1
  }, () => {})
  assert.equal(agentCalls, 0)
  assert.equal(phaseCalls, 0)
  assert.deepEqual(result.runtimeFailures, [])
  assert.equal(result.planErrors.some(error => error.code === 'EMPTY_PLAN'), true)
})

test('empty parsed plan is rejected before phase or agent dispatch', async () => {
  const run = await compileWorkflow()
  let agentCalls = 0
  let phaseCalls = 0
  const result = await run({
    featureDir: 'specs/001-empty',
    featureRoot: 'C:/repo',
    constitutionPath: 'C:/repo/specs/constitution.md',
    waves: [{ id: 'W1', taskIds: [] }],
    tasks: {},
  }, async () => {
    agentCalls += 1
    return null
  }, runThunks, () => {
    phaseCalls += 1
  }, () => {})
  assert.equal(agentCalls, 0)
  assert.equal(phaseCalls, 0)
  assert.equal(result.planErrors.some(error => error.code === 'EMPTY_TASKS'), true)
  assert.equal(result.planErrors.some(error => error.code === 'EMPTY_WAVE'), true)
  assert.equal(result.planErrors.some(error => error.code === 'EMPTY_SCHEDULE'), true)
})

test('agent null is a structured runtime failure and stops before after-audit or later waves', async () => {
  const run = await compileWorkflow()
  const labels = []
  const phases = []
  let implementerCalls = 0
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    if (options.label.startsWith('git-audit:')) return validSnapshot()
    implementerCalls += 1
    return null
  }, runThunks, title => phases.push(title), () => {})

  assert.equal(implementerCalls, 1, 'null dispatch must not be retried')
  assert.deepEqual(labels, ['git-audit:W1:before', 'impl:T1'])
  assert.deepEqual(phases, ['Wave W1'])
  assert.equal(result.runtimeFailures.length, 1)
  assert.deepEqual(result.runtimeFailures[0], {
    stage: 'implement',
    label: 'impl:T1',
    task: 'T1',
    wave: 'W1',
    code: 'AGENT_EMPTY_RESULT',
    message: 'Workflow agent impl:T1 returned an empty result; inspect the Workflow journal for a safety block, skipped dispatch, or terminal API error.',
  })
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').state, 'blocked')
  assert.equal(result.taskEvidence.find(task => task.id === 'T2').state, 'not_selected')
})

test('agent rejection preserves its task context and fails fast without retry', async () => {
  const run = await compileWorkflow()
  const labels = []
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    if (options.label.startsWith('git-audit:')) return validSnapshot()
    throw new Error('dispatch API unavailable')
  }, runThunks, () => {}, () => {})

  assert.deepEqual(labels, ['git-audit:W1:before', 'impl:T1'])
  assert.equal(result.runtimeFailures.length, 1)
  assert.equal(result.runtimeFailures[0].code, 'AGENT_THROW')
  assert.equal(result.runtimeFailures[0].stage, 'implement')
  assert.equal(result.runtimeFailures[0].task, 'T1')
  assert.match(result.runtimeFailures[0].message, /dispatch API unavailable/)
})

test('empty-string dispatch result fails closed instead of entering an idle loop', async () => {
  const run = await compileWorkflow()
  let implementerCalls = 0
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    if (options.label.startsWith('git-audit:')) return validSnapshot()
    implementerCalls += 1
    return '   '
  }, runThunks, () => {}, () => {})

  assert.equal(implementerCalls, 1)
  assert.equal(result.runtimeFailures[0].code, 'AGENT_EMPTY_RESULT')
  assert.equal(result.taskEvidence.find(item => item.id === 'T1').state, 'blocked')
})

test('missing acceptance evidence cannot pass even when all quality gates are green', async () => {
  const run = await compileWorkflow()
  let implementerCalls = 0
  let verifierCalls = 0
  const changed = validSnapshot([{ path: 'src/a.js', state: '??', fingerprint: 'e'.repeat(40) }])
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    if (options.label === 'git-audit:W1:before') return validSnapshot()
    if (options.label.startsWith('git-audit:W1:')) return changed
    if (options.label === 'impl:T1') {
      implementerCalls += 1
      return validImplementer(['src/a.js'])
    }
    verifierCalls += 1
    return validVerifier({ acceptance: [], status: 'fail' })
  }, runThunks, () => {}, () => {})

  assert.equal(implementerCalls, 1)
  assert.equal(verifierCalls, 1, 'verification runs in a separate fresh agent call')
  assert.deepEqual(result.runtimeFailures, [])
  const task = result.taskEvidence.find(item => item.id === 'T1')
  assert.equal(task.state, 'blocked')
  assert.equal(task.attempts, 1)
  assert.match(task.reason, /独立核对未通过.*验收证据不合格/)
})

test('verifier worktree side effects block the whole Wave even when it reports pass', async () => {
  const run = await compileWorkflow()
  const implemented = validSnapshot([{ path: 'src/a.js', state: '??', fingerprint: '1'.repeat(40) }])
  const mutated = validSnapshot([{ path: 'src/a.js', state: '??', fingerprint: '2'.repeat(40) }])
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    if (options.label === 'git-audit:W1:before') return validSnapshot()
    if (options.label === 'git-audit:W1:implemented') return implemented
    if (options.label === 'git-audit:W1:verified') return mutated
    if (options.label === 'impl:T1') return validImplementer(['src/a.js'])
    return validVerifier()
  }, runThunks, () => {}, () => {})

  const task = result.taskEvidence.find(item => item.id === 'T1')
  assert.equal(task.state, 'blocked')
  assert.match(task.reason, /Verifier 只读隔离失败.*Verifier changed worktree/)
})

test('parallel null fails fast without invoking task thunks', async () => {
  const run = await compileWorkflow()
  const labels = []
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    return validSnapshot()
  }, async () => null, () => {}, () => {})

  assert.deepEqual(labels, ['git-audit:W1:before'])
  assert.equal(result.runtimeFailures.length, 1)
  assert.deepEqual(result.runtimeFailures[0], {
    stage: 'parallel',
    label: 'parallel:W1',
    task: null,
    wave: 'W1',
    code: 'PARALLEL_NULL',
    message: 'Workflow parallel returned null instead of task results; inspect the Workflow journal.',
  })
})

test('parallel missing item identifies the omitted task and stops before after-audit', async () => {
  const run = await compileWorkflow()
  const labels = []
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    return validSnapshot()
  }, async () => [], () => {}, () => {})

  assert.deepEqual(labels, ['git-audit:W1:before'])
  assert.equal(result.runtimeFailures.length, 1)
  assert.equal(result.runtimeFailures[0].code, 'PARALLEL_RESULT_MISSING')
  assert.equal(result.runtimeFailures[0].task, 'T1')
  assert.equal(result.runtimeFailures[0].wave, 'W1')
})

test('partial run accepts a completed dependency and does not rerun it', async () => {
  const run = await compileWorkflow()
  const labels = []
  const phases = []
  const args = {
    featureDir: 'specs/001-partial',
    featureRoot: 'C:/repo',
    constitutionPath: 'C:/repo/specs/constitution.md',
    completedTaskIds: ['T1'],
    runTaskIds: ['T2'],
    waves: [
      { id: 'W1', taskIds: ['T1'] },
      { id: 'W2', taskIds: ['T2'] },
      { id: 'W3', taskIds: ['T3'] },
    ],
    tasks: {
      T1: workflowTask('T1', { boundary: ['src/a.js'] }),
      T2: workflowTask('T2', { boundary: ['src/b.js'], depends: ['T1'] }),
      T3: workflowTask('T3', { boundary: ['src/c.js'], depends: ['T2'] }),
    },
  }
  const result = await run(args, async (_prompt, options) => {
    labels.push(options.label)
    if (options.label === 'git-audit:W2:before') return validSnapshot()
    if (options.label === 'git-audit:W2:implemented' || options.label === 'git-audit:W2:verified') {
      return validSnapshot([{ path: 'src/b.js', state: '??', fingerprint: 'b'.repeat(40) }])
    }
    if (options.label === 'impl:T2') return validImplementer(['src/b.js'])
    return validVerifier()
  }, runThunks, title => phases.push(title), () => {})

  assert.deepEqual(labels, ['git-audit:W2:before', 'impl:T2', 'git-audit:W2:implemented', 'verify:T2', 'git-audit:W2:verified'])
  assert.deepEqual(phases, ['Wave W2'])
  assert.deepEqual(result.runtimeFailures, [])
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').state, 'done')
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').source, 'completedTaskIds')
  assert.equal(result.taskEvidence.find(task => task.id === 'T2').state, 'done')
  assert.equal(result.taskEvidence.find(task => task.id === 'T3').state, 'not_selected')
})

test('default Workflow invocation executes only the first incomplete Wave', async () => {
  const run = await compileWorkflow()
  const labels = []
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    if (options.label === 'git-audit:W1:before') return validSnapshot()
    if (options.label === 'git-audit:W1:implemented' || options.label === 'git-audit:W1:verified') {
      return validSnapshot([{ path: 'src/a.js', state: '??', fingerprint: 'c'.repeat(40) }])
    }
    if (options.label === 'impl:T1') return validImplementer(['src/a.js'])
    return validVerifier()
  }, runThunks, () => {}, () => {})

  assert.deepEqual(labels, ['git-audit:W1:before', 'impl:T1', 'git-audit:W1:implemented', 'verify:T1', 'git-audit:W1:verified'])
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').state, 'done')
  assert.equal(result.taskEvidence.find(task => task.id === 'T2').state, 'not_selected')
})

test('Workflow refuses to start a Wave from a dirty baseline', async () => {
  const run = await compileWorkflow()
  const labels = []
  const result = await run(twoWaveArgs(), async (_prompt, options) => {
    labels.push(options.label)
    return validSnapshot([{ path: 'existing.txt', state: '??', fingerprint: 'd'.repeat(40) }])
  }, runThunks, () => {}, () => {})

  assert.deepEqual(labels, ['git-audit:W1:before'])
  assert.deepEqual(result.runtimeFailures, [])
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').state, 'blocked')
  assert.match(result.taskEvidence.find(task => task.id === 'T1').reason, /前置工作树非空/)
  assert.equal(result.taskEvidence.find(task => task.id === 'T2').state, 'not_selected')
})

test('Workflow rejects a multi-Wave explicit run before dispatch', async () => {
  const run = await compileWorkflow()
  let agentCalls = 0
  const result = await run({ ...twoWaveArgs(), runTaskIds: ['T1', 'T2'] }, async () => {
    agentCalls += 1
    return null
  }, runThunks, () => {}, () => {})

  assert.equal(agentCalls, 0)
  assert.equal(result.planErrors.some(error => error.code === 'MULTI_WAVE_RUN_SELECTION'), true)
})

test('partial run blocks a selected task whose unfinished dependency was not selected', async () => {
  const run = await compileWorkflow()
  let agentCalls = 0
  const args = { ...twoWaveArgs(), runTaskIds: ['T2'], completedTaskIds: [] }
  const result = await run(args, async () => {
    agentCalls += 1
    return validImplementer()
  }, runThunks, () => {}, () => {})

  assert.equal(agentCalls, 0)
  assert.deepEqual(result.runtimeFailures, [])
  assert.equal(result.taskEvidence.find(task => task.id === 'T1').state, 'not_selected')
  const selected = result.taskEvidence.find(task => task.id === 'T2')
  assert.equal(selected.state, 'blocked')
  assert.match(selected.reason, /未纳入 runTaskIds: T1/)
})
