import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePath,
  globToRegExp,
  withinBoundary,
  boundariesOverlap,
  splitByBoundaryOverlap,
  classifyWaveTasks,
  validatePlan,
  validateSnapshot,
  diffSnapshots,
  validateWaveAudit,
  validateQualityEvidence,
} from '../workflows/sdd-implement-core.js'

function snapshot(entries, overrides = {}) {
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
      ...entries.flatMap(item => item.state === '??'
        ? [{ kind: 'untracked-fingerprint', subject: item.path, argv: ['git', 'hash-object', '--no-filters', '--', item.path], exitCode: 0 }]
        : [
            { kind: 'tracked-diff', subject: item.path, argv: ['git', '--literal-pathspecs', 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', item.path], exitCode: 0 },
            { kind: 'tracked-fingerprint', subject: item.path, argv: ['git', 'hash-object', '--stdin'], exitCode: 0 },
          ]),
    ],
    notes: '',
    ...overrides,
  }
}

function oid(value) {
  return Buffer.from(String(value)).toString('hex').padEnd(40, '0').slice(0, 40)
}

function entry(path, fingerprint, state = ' M') {
  return { path, state, fingerprint: oid(fingerprint) }
}

function plannedTask(overrides = {}) {
  return {
    what: 'implement task',
    boundary: ['src/default.js'],
    depends: [],
    doneWhen: 'the behavior is verified',
    risk: 'low',
    review: 'wave-sample',
    testPolicy: 'persistent',
    resources: [],
    gateIsolation: 'scoped',
    ...overrides,
  }
}

test('normalizePath canonicalizes separators and dot segments', () => {
  assert.equal(normalizePath('.\\src\\feature\\..\\index.ts'), 'src/index.ts')
  assert.equal(normalizePath('src//feature///'), 'src/feature/')
  assert.equal(normalizePath('src/A.ts'), 'src/A.ts', 'snapshot paths preserve case on case-sensitive filesystems')
})

test('normalizePath rejects absolute and escaping paths', () => {
  assert.throws(() => normalizePath('C:\\repo\\file.ts'), /relative/)
  assert.throws(() => normalizePath('/repo/file.ts'), /relative/)
  assert.throws(() => normalizePath('../outside.ts'), /escapes/)
  assert.throws(() => normalizePath('src/../../outside.ts'), /escapes/)
})

test('glob semantics distinguish one segment from recursive globbing', () => {
  const recursive = globToRegExp('src/**/*.js')
  assert.equal(recursive.test('src/index.js'), true)
  assert.equal(recursive.test('src/deep/index.js'), true)
  assert.equal(globToRegExp('src/*.js').test('src/deep/index.js'), false)
  assert.equal(globToRegExp('src/file?.js').test('src/file1.js'), true)
  assert.equal(globToRegExp('src/file?.js').test('src/file10.js'), false)
})

test('exact file and explicit directory Boundaries have different ownership', () => {
  assert.equal(withinBoundary('src/index.ts', ['src/index.ts']), true)
  assert.equal(withinBoundary('src/index.ts/child', ['src/index.ts']), false)
  assert.equal(withinBoundary('src/nested/index.ts', ['src/']), true)
  assert.equal(withinBoundary('../src/index.ts', ['src/']), false)
})

test('Boundary overlap is safe and conservative for glob intersections', () => {
  assert.equal(boundariesOverlap(['src/a.ts'], ['src/b.ts']), false)
  assert.equal(boundariesOverlap(['src/'], ['src/a.ts']), true)
  assert.equal(boundariesOverlap(['src/**/index.ts'], ['src/admin/**']), true)
  assert.equal(boundariesOverlap(['src/admin/**'], ['tests/**']), false)
  assert.equal(boundariesOverlap(['*.js'], ['*.ts']), true, 'ambiguous glob intersections serialize safely')
  assert.equal(boundariesOverlap(['src/A.ts'], ['src/a.ts']), true, 'case-only paths conservatively conflict')
  assert.equal(boundariesOverlap(['src/item'], ['src/item/']), true, 'file/directory aliases conflict')
  assert.equal(boundariesOverlap(['src/item'], ['src/item/a.ts']), true, 'file/descendant aliases conflict')
  assert.equal(boundariesOverlap(['src/item'], ['src/item/**']), true, 'file/descendant glob aliases conflict')
})

test('splitByBoundaryOverlap keeps independent tasks parallel and conflicts serial', () => {
  const tasks = {
    T1: { boundary: ['src/a.ts'] },
    T2: { boundary: ['src/a.ts'] },
    T3: { boundary: ['src/b.ts'] },
    T4: { boundary: [] },
  }
  assert.deepEqual(splitByBoundaryOverlap(['T1', 'T2', 'T3', 'T4'], tasks), {
    parallelizable: ['T1', 'T3'],
    serialize: ['T2', 'T4'],
  })
})

test('diffSnapshots detects changes to already-dirty files and restoration to HEAD', () => {
  const before = snapshot([
    entry('src/dirty.ts', 'old'),
    entry('src/restored.ts', 'modified'),
  ])
  const after = snapshot([
    entry('src/dirty.ts', 'new'),
    entry('src/new.ts', 'created', '??'),
  ])
  assert.deepEqual(diffSnapshots(before, after).map(change => change.path), [
    'src/dirty.ts',
    'src/new.ts',
    'src/restored.ts',
  ])
})

test('validateWaveAudit accepts exact Git delta/report/Boundary agreement', () => {
  const before = snapshot([entry('existing.txt', 'same')])
  const after = snapshot([
    entry('existing.txt', 'same'),
    entry('src/a.js', 'new', '??'),
  ])
  const audit = validateWaveAudit({
    before,
    after,
    expectedRoot: 'c:\\repo\\',
    taskIds: ['T1'],
    tasks: { T1: { boundary: ['src/*.js'] } },
    taskResults: { T1: { state: 'done', files: ['.\\src\\a.js'] } },
  })
  assert.equal(audit.ok, true)
  assert.deepEqual(audit.actualFiles, ['src/a.js'])
  assert.deepEqual(audit.reportedFiles, ['src/a.js'])
})

test('validateWaveAudit rejects stray, omitted, phantom, and wrong-owner reports', () => {
  const audit = validateWaveAudit({
    before: snapshot([]),
    after: snapshot([
      entry('outside.js', '1', '??'),
      entry('src/a.js', '2', '??'),
      entry('src/hidden.js', '3', '??'),
    ]),
    expectedRoot: 'C:/repo',
    taskIds: ['T1', 'T2'],
    tasks: {
      T1: { boundary: ['src/*.js'] },
      T2: { boundary: ['tests/*.js'] },
    },
    taskResults: {
      T1: { state: 'done', files: [] },
      T2: { state: 'done', files: ['src/a.js', 'tests/phantom.js'] },
    },
  })
  assert.equal(audit.ok, false)
  assert.deepEqual(audit.strayFiles, ['outside.js'])
  assert.deepEqual(audit.unreportedFiles, ['outside.js', 'src/hidden.js'])
  assert.deepEqual(audit.phantomFiles, ['tests/phantom.js'])
  assert.deepEqual(audit.ownerViolations, [{ id: 'T2', path: 'src/a.js' }])
})

test('validateWaveAudit rejects failed commands and HEAD mutation', () => {
  const before = snapshot([])
  const after = snapshot([], {
    head: 'b'.repeat(40),
    commands: [
      { kind: 'root', subject: '', argv: ['git', 'rev-parse', '--show-toplevel'], exitCode: 0 },
      { kind: 'head', subject: '', argv: ['git', 'rev-parse', 'HEAD'], exitCode: 0 },
      { kind: 'status', subject: '', argv: ['git', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], exitCode: 1 },
    ],
  })
  const audit = validateWaveAudit({
    before, after, expectedRoot: 'C:/repo', taskIds: [], tasks: {}, taskResults: {},
  })
  assert.equal(audit.ok, false)
  assert.match(audit.errors.join('\n'), /audit command failed/)
})

test('validateSnapshot rejects arbitrary self-reported command evidence', () => {
  const check = validateSnapshot({
    status: 'ok',
    protocol: 'sdd-git-audit-v1',
    root: 'C:/repo',
    head: 'a'.repeat(40),
    entries: [],
    commands: [{ kind: 'status', subject: '', argv: ['echo', 'trust-me'], exitCode: 0 }],
    notes: '',
  }, 'C:/repo')
  assert.equal(check.ok, false)
  assert.match(check.errors.join('\n'), /does not match status protocol/)
  assert.match(check.errors.join('\n'), /missing required root command evidence/)
})

test('validateSnapshot binds each fingerprint command to its exact subject path', () => {
  const bad = snapshot([entry('src/a.ts', 'a')])
  bad.commands = bad.commands.map(command => command.kind === 'tracked-diff'
    ? { ...command, argv: [...command.argv.slice(0, -1), 'src/a.ts.bak'] }
    : command)
  const check = validateSnapshot(bad, 'C:/repo')
  assert.equal(check.ok, false)
  assert.match(check.errors.join('\n'), /audit argv does not match tracked-diff protocol for src\/a\.ts/)
})

test('validateWaveAudit rejects a done task that produced no changed files', () => {
  const audit = validateWaveAudit({
    before: snapshot([]), after: snapshot([]), expectedRoot: 'C:/repo',
    taskIds: ['T1'], tasks: { T1: { boundary: ['src/a.ts'] } },
    taskResults: { T1: { state: 'done', files: [] } },
  })
  assert.equal(audit.ok, false)
  assert.deepEqual(audit.noChangeTasks, ['T1'])
})

test('classifyWaveTasks deterministically propagates blocked dependencies', () => {
  const tasks = {
    T2: { depends: ['T1'] },
    T3: { depends: ['T1', 'T9'] },
    T4: { depends: [] },
  }
  assert.deepEqual(classifyWaveTasks(['T2', 'T3', 'T4'], tasks, { T1: { state: 'blocked' } }), {
    runnable: ['T4'],
    blockedBy: { T2: ['T1'], T3: ['T1', 'T9'] },
  })
})

test('validatePlan accepts a unique forward wave plan', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1', 'T2'] },
    { id: 'W2', taskIds: ['T3'] },
  ], {
    T1: plannedTask({ id: 'T1', boundary: ['src/a.js'] }),
    T2: plannedTask({ id: 'T2', boundary: ['src/b.js'] }),
    T3: plannedTask({ id: 'T3', boundary: ['src/c.js'], depends: ['T1', 'T2'] }),
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.errors, [])
  assert.deepEqual(plan.scheduledTaskIds, ['T1', 'T2', 'T3'])
  assert.deepEqual(plan.runTaskIds, ['T1', 'T2'], 'a default invocation selects only the first incomplete Wave')
})

test('validatePlan normalizes completed and partial-run task selections', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
    { id: 'W3', taskIds: ['T3'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1'] }),
    T3: plannedTask({ boundary: ['src/c.js'], depends: ['T2'] }),
  }, {
    completedTaskIds: ['T1'],
    runTaskIds: ['T2'],
  })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.completedTaskIds, ['T1'])
  assert.deepEqual(plan.runTaskIds, ['T2'])
})

test('validatePlan defaults to the next not-yet-completed Wave', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1'] }),
  }, { completedTaskIds: ['T1'] })
  assert.equal(plan.ok, true)
  assert.deepEqual(plan.runTaskIds, ['T2'])
})

test('validatePlan rejects explicit selections that span multiple Waves', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1'] }),
  }, { runTaskIds: ['T1', 'T2'] })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'MULTI_WAVE_RUN_SELECTION'), true)
})

test('validatePlan rejects an explicitly empty run selection', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1'] }], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
  }, { runTaskIds: [] })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'EMPTY_RUN_SELECTION'), true)
})

test('validatePlan rejects unknown, duplicate, and malformed selection IDs', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1'] }], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
  }, {
    completedTaskIds: ['T1', 'T1', 'T999'],
    runTaskIds: ['T1', 'T1', '', 'T999'],
  })
  const codes = plan.errors.map(error => error.code)
  assert.equal(plan.ok, false)
  assert.equal(codes.includes('DUPLICATE_COMPLETED_TASK_ID'), true)
  assert.equal(codes.includes('UNKNOWN_COMPLETED_TASK'), true)
  assert.equal(codes.includes('DUPLICATE_RUN_TASK_ID'), true)
  assert.equal(codes.includes('INVALID_RUN_TASK_ID'), true)
  assert.equal(codes.includes('UNKNOWN_RUN_TASK'), true)
  assert.equal(codes.includes('COMPLETED_RUN_OVERLAP'), true)
})

test('validatePlan requires completed selections to be dependency-closed', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
    { id: 'W3', taskIds: ['T3'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1'] }),
    T3: plannedTask({ boundary: ['src/c.js'], depends: ['T2'] }),
  }, { completedTaskIds: ['T2'], runTaskIds: ['T3'] })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'COMPLETED_DEPENDENCY_MISSING' && error.taskId === 'T2'), true)
})

test('validatePlan rejects duplicate wave/task IDs and unknown tasks', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1', 'T999'] },
    { id: 'W1', taskIds: ['T1'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'] }),
    T2: plannedTask({ boundary: ['src/b.js'] }),
  })
  const codes = plan.errors.map(error => error.code)
  assert.equal(plan.ok, false)
  assert.equal(codes.includes('DUPLICATE_WAVE_ID'), true)
  assert.equal(codes.includes('DUPLICATE_TASK_ID'), true)
  assert.equal(codes.includes('UNKNOWN_TASK'), true)
  assert.equal(codes.includes('UNSCHEDULED_TASK'), true)
})

test('validatePlan rejects unknown, same-wave, and future-wave dependencies', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1', 'T2'] },
    { id: 'W2', taskIds: ['T3'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'], depends: ['T3'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1', 'T999'] }),
    T3: plannedTask({ boundary: ['src/c.js'], depends: ['T2'] }),
  })
  const errors = plan.errors
  assert.equal(plan.ok, false)
  assert.equal(errors.some(error => error.code === 'DEPENDENCY_NOT_EARLIER' && error.taskId === 'T1' && error.dependency === 'T3'), true)
  assert.equal(errors.some(error => error.code === 'DEPENDENCY_NOT_EARLIER' && error.taskId === 'T2' && error.dependency === 'T1'), true)
  assert.equal(errors.some(error => error.code === 'UNKNOWN_DEPENDENCY' && error.dependency === 'T999'), true)
  assert.equal(errors.some(error => error.code === 'DEPENDENCY_NOT_EARLIER' && error.taskId === 'T3'), false)
})

test('validatePlan rejects cycles because at least one edge is not in an earlier wave', () => {
  const plan = validatePlan([
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
  ], {
    T1: plannedTask({ boundary: ['src/a.js'], depends: ['T2'] }),
    T2: plannedTask({ boundary: ['src/b.js'], depends: ['T1'] }),
  })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'DEPENDENCY_NOT_EARLIER' && error.taskId === 'T1'), true)
})

test('validatePlan rejects overlapping Boundaries in the same wave', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1', 'T2'] }], {
    T1: plannedTask({ boundary: ['src/shared.ts'] }),
    T2: plannedTask({ boundary: ['src/shared.ts'] }),
  })
  assert.equal(plan.ok, false)
  assert.deepEqual(
    plan.errors.find(error => error.code === 'SAME_WAVE_BOUNDARY_OVERLAP'),
    {
      code: 'SAME_WAVE_BOUNDARY_OVERLAP',
      waveId: 'W1',
      waveIndex: 0,
      taskId: 'T1',
      conflictingTaskId: 'T2',
      message: 'wave W1 tasks T1 and T2 have overlapping Boundaries; move them to different waves',
    },
  )
})

test('validatePlan rejects an empty task map, empty wave, and empty schedule', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: [] }], {})
  assert.equal(plan.ok, false)
  assert.deepEqual(plan.errors.map(error => error.code), ['EMPTY_TASKS', 'EMPTY_WAVE', 'EMPTY_SCHEDULE'])
})

test('validatePlan fails closed when review and test policy metadata is missing', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1'] }], {
    T1: { id: 'T1', what: 'task', boundary: ['src/a.js'], depends: [], doneWhen: 'done' },
  })
  assert.equal(plan.ok, false)
  assert.deepEqual(
    plan.errors.filter(error => error.code === 'MISSING_TASK_FIELD').map(error => error.field),
    ['risk', 'review', 'testPolicy', 'gateIsolation', 'resources'],
  )
})

test('validatePlan validates task policy enums and high-risk review', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1'] }], {
    T1: plannedTask({ risk: 'high(migration)', review: 'wave-sample', testPolicy: 'forever' }),
  })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'INVALID_TASK_POLICY' && error.field === 'testPolicy'), true)
  assert.equal(plan.errors.some(error => error.code === 'HIGH_RISK_REVIEW_REQUIRED'), true)
})

test('validatePlan rejects task-level worktree isolation in Workflow mode', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1'] }], {
    T1: plannedTask({ isolation: 'worktree' }),
  })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'UNSUPPORTED_TASK_ISOLATION'), true)
})

test('validatePlan rejects same-Wave resource collisions and package-wide gates', () => {
  const plan = validatePlan([{ id: 'W1', taskIds: ['T1', 'T2'] }], {
    T1: plannedTask({ boundary: ['src/a.js'], resources: ['port:4173'] }),
    T2: plannedTask({ boundary: ['src/b.js'], resources: ['PORT:4173'], gateIsolation: 'wave-exclusive(package formatter)' }),
  })
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'SAME_WAVE_RESOURCE_OVERLAP'), true)
  assert.equal(plan.errors.some(error => error.code === 'WAVE_EXCLUSIVE_GATE_CONFLICT'), true)
})

test('validatePlan rejects task IDs that can mutate object prototypes', () => {
  const tasks = Object.create(null)
  tasks.__proto__ = plannedTask({ id: '__proto__' })
  const plan = validatePlan([{ id: 'W1', taskIds: ['__proto__'] }], tasks)
  assert.equal(plan.ok, false)
  assert.equal(plan.errors.some(error => error.code === 'INVALID_TASK_ID'), true)
  assert.equal(plan.errors.some(error => error.code === 'INVALID_TASK_MAP_ID'), true)
})

test('quality evidence requires every gate and rejects non-zero or explicit failure', () => {
  const quality = { format: 'pass', lint: 'pass', typecheck: 'pass', test: 'pass' }
  const evidence = ['format', 'lint', 'typecheck', 'test'].map(gate => ({
    gate, outcome: 'pass', command: `run-${gate}`, exitCode: 0, summary: 'passed',
  }))
  assert.equal(validateQualityEvidence(quality, evidence).ok, true)

  const failed = evidence.map(record => ({ ...record }))
  failed[3].exitCode = 1
  assert.equal(validateQualityEvidence(quality, failed).ok, false)
  assert.equal(validateQualityEvidence(quality, evidence.slice(1)).ok, false)
  assert.equal(validateQualityEvidence({ ...quality, lint: 'failed: errors' }, evidence).ok, false)
  assert.equal(validateQualityEvidence(quality, evidence.map(record => (
    record.gate === 'test' ? { ...record, summary: '12 passed, 1 failed' } : record
  ))).ok, false)
  assert.equal(validateQualityEvidence(quality, evidence.map(record => (
    record.gate === 'test' ? { ...record, outcome: 'fail' } : record
  ))).ok, false)
})
