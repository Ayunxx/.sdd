// Pure deterministic helpers for sdd-implement.js.
//
// Dynamic Workflow scripts must start with a literal `export const meta` and
// run inside a restricted runtime, so sdd-implement.js cannot safely import a
// sibling module.  The marked factory below is embedded verbatim in the
// Workflow; tests/workflow-sync.test.js prevents the two copies from drifting.

// SDD_WORKFLOW_CORE_START
function createSddWorkflowCore() {
  const REQUIRED_GATES = ['format', 'lint', 'typecheck', 'test']

  function normalizePath(value) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError('path must be a non-empty string')
    if (value.includes('\0')) throw new TypeError('path must not contain NUL')

    let path = value.normalize('NFC').replace(/\\/g, '/')
    while (path.startsWith('./')) path = path.slice(2)
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new TypeError('path must be relative')

    const keepTrailingSlash = path.endsWith('/')
    const segments = []
    for (const segment of path.split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') {
        if (segments.length === 0) throw new TypeError('path escapes the feature root')
        segments.pop()
      } else {
        segments.push(segment)
      }
    }

    if (segments.length === 0) throw new TypeError('path must name a file or directory')
    const normalized = segments.join('/')
    return keepTrailingSlash ? `${normalized}/` : normalized
  }

  function tryNormalizePath(value) {
    try {
      return { ok: true, path: normalizePath(value) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) }
    }
  }

  function isGlob(pattern) {
    return pattern.includes('*') || pattern.includes('?')
  }

  function globToRegExp(pattern) {
    const normalized = normalizePath(pattern)
    let source = ''
    for (let index = 0; index < normalized.length; index++) {
      const char = normalized[index]
      if (char === '*') {
        if (normalized[index + 1] === '*') {
          index += 1
          if (normalized[index + 1] === '/') {
            index += 1
            source += '(?:.*/)?'
          } else {
            source += '.*'
          }
        } else {
          source += '[^/]*'
        }
      } else if (char === '?') {
        source += '[^/]'
      } else {
        source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char
      }
    }
    return new RegExp(`^${source}$`)
  }

  function boundaryKind(pattern) {
    const normalized = normalizePath(pattern)
    if (normalized.endsWith('/')) return { kind: 'directory', pattern: normalized }
    if (isGlob(normalized)) return { kind: 'glob', pattern: normalized }
    return { kind: 'file', pattern: normalized }
  }

  function withinBoundary(file, boundary) {
    const candidate = tryNormalizePath(file)
    if (!candidate.ok) return false

    for (const rawPattern of boundary || []) {
      const parsed = tryNormalizePath(rawPattern)
      if (!parsed.ok) continue
      const descriptor = boundaryKind(parsed.path)
      if (descriptor.kind === 'file' && candidate.path === descriptor.pattern) return true
      if (descriptor.kind === 'directory' && candidate.path.startsWith(descriptor.pattern)) return true
      if (descriptor.kind === 'glob' && globToRegExp(descriptor.pattern).test(candidate.path)) return true
    }
    return false
  }

  function literalPrefix(pattern) {
    const wildcard = pattern.search(/[?*]/)
    return wildcard === -1 ? pattern : pattern.slice(0, wildcard)
  }

  // Glob/glob intersection is deliberately conservative. Comparable literal
  // prefixes may still be disjoint, but serializing them is safer than a false
  // negative that lets two implementers write the same file concurrently.
  function boundariesOverlap(left, right) {
    for (const rawLeft of left || []) {
      const parsedLeft = tryNormalizePath(rawLeft)
      if (!parsedLeft.ok) return true
      const a = boundaryKind(parsedLeft.path)
      const aFolded = { ...a, pattern: a.pattern.toLowerCase() }

      for (const rawRight of right || []) {
        const parsedRight = tryNormalizePath(rawRight)
        if (!parsedRight.ok) return true
        const b = boundaryKind(parsedRight.path)
        const bFolded = { ...b, pattern: b.pattern.toLowerCase() }
        if (aFolded.pattern === bFolded.pattern) return true
        if (aFolded.pattern.replace(/\/$/, '') === bFolded.pattern.replace(/\/$/, '')) return true

        const aStem = aFolded.pattern.replace(/\/$/, '')
        const bStem = bFolded.pattern.replace(/\/$/, '')
        // A path cannot safely be treated as an exact file in one task and as
        // a namespace in another.  Apart from platform file/dir ambiguity,
        // generators commonly replace the file with a directory (or vice
        // versa), so serialize every ancestor/descendant spelling.
        if (aStem.startsWith(`${bStem}/`) || bStem.startsWith(`${aStem}/`)) return true

        if (aFolded.kind === 'file' && bFolded.kind === 'file') continue
        if (aFolded.kind === 'file') {
          if (withinBoundary(aFolded.pattern, [bFolded.pattern])) return true
          if (literalPrefix(bFolded.pattern).startsWith(`${aStem}/`)) return true
          continue
        }
        if (bFolded.kind === 'file') {
          if (withinBoundary(bFolded.pattern, [aFolded.pattern])) return true
          if (literalPrefix(aFolded.pattern).startsWith(`${bStem}/`)) return true
          continue
        }

        const aPrefix = literalPrefix(aFolded.pattern)
        const bPrefix = literalPrefix(bFolded.pattern)
        if (aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix)) return true
      }
    }
    return false
  }

  function splitByBoundaryOverlap(taskIds, tasks) {
    const parallelizable = []
    const serialize = []
    for (const id of taskIds) {
      const task = tasks[id]
      if (!task || !Array.isArray(task.boundary) || task.boundary.length === 0) {
        serialize.push(id)
        continue
      }
      const conflicts = parallelizable.some(otherId => boundariesOverlap(task.boundary, tasks[otherId].boundary))
      if (conflicts) serialize.push(id)
      else parallelizable.push(id)
    }
    return { parallelizable, serialize }
  }

  function classifyWaveTasks(taskIds, tasks, results) {
    const runnable = []
    const blockedBy = {}
    for (const id of taskIds) {
      const dependencies = tasks[id] && Array.isArray(tasks[id].depends) ? tasks[id].depends : []
      const failed = dependencies.filter(dependency => !results[dependency] || results[dependency].state !== 'done')
      if (failed.length > 0) blockedBy[id] = failed
      else runnable.push(id)
    }
    return { runnable, blockedBy }
  }

  function validatePlan(waves, tasks, selection = {}) {
    const TASK_ID = /^T[1-9][0-9]*$/
    const errors = []
    const waveList = Array.isArray(waves) ? waves : []
    const taskTable = tasks && typeof tasks === 'object' && !Array.isArray(tasks) ? tasks : {}
    if (!Array.isArray(waves)) errors.push({ code: 'INVALID_WAVES', message: 'waves must be an array' })
    if (!tasks || typeof tasks !== 'object' || Array.isArray(tasks)) errors.push({ code: 'INVALID_TASKS', message: 'tasks must be an object map' })
    if (waveList.length === 0) errors.push({ code: 'EMPTY_PLAN', message: 'plan must contain at least one wave' })
    if (Object.keys(taskTable).length === 0) errors.push({ code: 'EMPTY_TASKS', message: 'plan must contain at least one task' })

    const completedTaskIds = []
    const completedTaskIdSet = new Set()
    const runTaskIds = []
    const runTaskIdSet = new Set()

    function collectSelectionIds(value, kind, target, seen) {
      const upper = kind.toUpperCase()
      if (!Array.isArray(value)) {
        errors.push({ code: `INVALID_${upper}_TASK_IDS`, message: `${kind}TaskIds must be an array` })
        return
      }
      for (let index = 0; index < value.length; index++) {
        const taskId = value[index]
        if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) {
          errors.push({ code: `INVALID_${upper}_TASK_ID`, taskId, index, message: `${kind}TaskIds contains an invalid task id` })
          continue
        }
        if (seen.has(taskId)) {
          errors.push({ code: `DUPLICATE_${upper}_TASK_ID`, taskId, index, message: `${kind}TaskIds repeats ${taskId}` })
          continue
        }
        seen.add(taskId)
        target.push(taskId)
        if (!Object.prototype.hasOwnProperty.call(taskTable, taskId)) {
          errors.push({ code: `UNKNOWN_${upper}_TASK`, taskId, index, message: `${kind}TaskIds references unknown task ${taskId}` })
        }
      }
    }

    collectSelectionIds(selection.completedTaskIds === undefined ? [] : selection.completedTaskIds, 'completed', completedTaskIds, completedTaskIdSet)
    const hasExplicitRunSelection = selection.runTaskIds !== undefined
    if (hasExplicitRunSelection) collectSelectionIds(selection.runTaskIds, 'run', runTaskIds, runTaskIdSet)
    for (const taskId of completedTaskIds) {
      if (runTaskIdSet.has(taskId)) {
        errors.push({ code: 'COMPLETED_RUN_OVERLAP', taskId, message: `task ${taskId} cannot be both completed and selected to run` })
      }
    }

    const waveIds = new Set()
    const taskWave = new Map()
    const scheduledTaskIds = []

    for (let waveIndex = 0; waveIndex < waveList.length; waveIndex++) {
      const wave = waveList[waveIndex]
      if (!wave || typeof wave !== 'object' || Array.isArray(wave)) {
        errors.push({ code: 'INVALID_WAVE', waveIndex, message: `wave at index ${waveIndex} must be an object` })
        continue
      }

      const rawWaveId = wave.id
      const waveIdValid = (typeof rawWaveId === 'string' && rawWaveId.trim().length > 0) || (typeof rawWaveId === 'number' && Number.isFinite(rawWaveId))
      const waveId = waveIdValid ? String(rawWaveId) : `#${waveIndex}`
      if (!waveIdValid) {
        errors.push({ code: 'INVALID_WAVE_ID', waveIndex, message: `wave at index ${waveIndex} has no valid id` })
      } else if (waveIds.has(waveId)) {
        errors.push({ code: 'DUPLICATE_WAVE_ID', waveId, waveIndex, message: `duplicate wave id: ${waveId}` })
      } else {
        waveIds.add(waveId)
      }

      if (!Array.isArray(wave.taskIds)) {
        errors.push({ code: 'INVALID_TASK_IDS', waveId, waveIndex, message: `wave ${waveId} taskIds must be an array` })
        continue
      }
      if (wave.taskIds.length === 0) {
        errors.push({ code: 'EMPTY_WAVE', waveId, waveIndex, message: `wave ${waveId} must contain at least one task` })
      }
      for (let taskIndex = 0; taskIndex < wave.taskIds.length; taskIndex++) {
        const taskId = wave.taskIds[taskIndex]
        if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) {
          errors.push({ code: 'INVALID_TASK_ID', waveId, waveIndex, taskIndex, message: `wave ${waveId} contains an invalid task id` })
          continue
        }
        scheduledTaskIds.push(taskId)
        if (taskWave.has(taskId)) {
          errors.push({ code: 'DUPLICATE_TASK_ID', taskId, waveId, waveIndex, message: `task ${taskId} is scheduled more than once` })
          continue
        }
        taskWave.set(taskId, { waveId, waveIndex })
        if (!Object.prototype.hasOwnProperty.call(taskTable, taskId)) {
          errors.push({ code: 'UNKNOWN_TASK', taskId, waveId, waveIndex, message: `wave ${waveId} references unknown task ${taskId}` })
        }
      }
    }

    if (scheduledTaskIds.length === 0) errors.push({ code: 'EMPTY_SCHEDULE', message: 'plan must schedule at least one task' })

    for (const taskId of Object.keys(taskTable).sort()) {
      if (!TASK_ID.test(taskId)) {
        errors.push({ code: 'INVALID_TASK_MAP_ID', taskId, message: `task map key must match T<positive integer>: ${taskId}` })
      }
      if (!taskWave.has(taskId)) {
        errors.push({ code: 'UNSCHEDULED_TASK', taskId, message: `task ${taskId} is not scheduled in any wave` })
        continue
      }
      const task = taskTable[taskId]
      if (!task || typeof task !== 'object' || Array.isArray(task)) {
        errors.push({ code: 'INVALID_TASK', taskId, message: `task ${taskId} must be an object` })
        continue
      }
      if (task.id !== undefined && task.id !== taskId) {
        errors.push({ code: 'TASK_ID_MISMATCH', taskId, message: `task map key ${taskId} does not match task.id ${task.id}` })
      }
      if (task.isolation === 'worktree') {
        errors.push({
          code: 'UNSUPPORTED_TASK_ISOLATION', taskId,
          message: `Workflow does not support task-level worktree isolation for ${taskId}; place it in its own Wave or use prompt orchestration`,
        })
      }
      for (const field of ['what', 'doneWhen', 'risk', 'review', 'testPolicy', 'gateIsolation']) {
        if (typeof task[field] !== 'string' || task[field].trim().length === 0) {
          errors.push({ code: 'MISSING_TASK_FIELD', taskId, field, message: `task ${taskId} requires non-empty ${field}` })
        }
      }
      if (!Array.isArray(task.resources)) {
        errors.push({ code: 'MISSING_TASK_FIELD', taskId, field: 'resources', message: `task ${taskId} requires a resources array` })
      } else {
        const seenResources = new Set()
        for (const resource of task.resources) {
          if (typeof resource !== 'string' || !resource.trim() || resource.includes('\0')) {
            errors.push({ code: 'INVALID_TASK_RESOURCE', taskId, resource, message: `task ${taskId} contains an invalid resource identifier` })
            continue
          }
          const normalizedResource = resource.normalize('NFC').trim().toLowerCase()
          if (seenResources.has(normalizedResource)) {
            errors.push({ code: 'DUPLICATE_TASK_RESOURCE', taskId, resource, message: `task ${taskId} repeats resource ${resource}` })
          }
          seenResources.add(normalizedResource)
        }
      }
      const policyPatterns = {
        risk: /^(?:low|medium|high)(?:$|[\s(（:：])/,
        review: /^required(?:$|[\s(（:：])/,
        testPolicy: /^(?:persistent|ephemeral|none)(?:$|[\s(（:：])/,
        gateIsolation: /^(?:scoped|wave-exclusive)(?:$|[\s(（:：])/,
      }
      for (const [field, pattern] of Object.entries(policyPatterns)) {
        if (typeof task[field] === 'string' && task[field].trim() && !pattern.test(task[field].trim().toLowerCase())) {
          errors.push({ code: 'INVALID_TASK_POLICY', taskId, field, value: task[field], message: `task ${taskId} has invalid ${field}: ${task[field]}` })
        }
      }
      if (typeof task.risk === 'string' && /^high(?:$|[\s(（:：])/i.test(task.risk.trim())
        && !(typeof task.review === 'string' && /^required(?:$|[\s(（:：])/i.test(task.review.trim()))) {
        errors.push({ code: 'HIGH_RISK_REVIEW_REQUIRED', taskId, message: `high-risk task ${taskId} must use Review: required` })
      }
      if (!Array.isArray(task.boundary) || task.boundary.length === 0) {
        errors.push({ code: 'INVALID_BOUNDARY', taskId, message: `task ${taskId} boundary must be a non-empty array` })
      } else {
        for (const pattern of task.boundary) {
          const parsed = tryNormalizePath(pattern)
          if (!parsed.ok) errors.push({ code: 'INVALID_BOUNDARY_PATH', taskId, pattern, message: `task ${taskId} has invalid Boundary ${String(pattern)}: ${parsed.error}` })
        }
      }
      if (!Array.isArray(task.depends)) {
        errors.push({ code: 'INVALID_DEPENDS', taskId, message: `task ${taskId} depends must be an array` })
        continue
      }

      const dependencies = task.depends
      const seenDependencies = new Set()
      for (const dependency of dependencies) {
        if (typeof dependency !== 'string' || !TASK_ID.test(dependency)) {
          errors.push({ code: 'INVALID_DEPENDENCY', taskId, dependency, message: `task ${taskId} contains an invalid dependency` })
          continue
        }
        if (seenDependencies.has(dependency)) {
          errors.push({ code: 'DUPLICATE_DEPENDENCY', taskId, dependency, message: `task ${taskId} repeats dependency ${dependency}` })
          continue
        }
        seenDependencies.add(dependency)
        if (!Object.prototype.hasOwnProperty.call(taskTable, dependency)) {
          errors.push({ code: 'UNKNOWN_DEPENDENCY', taskId, dependency, message: `task ${taskId} depends on unknown task ${dependency}` })
          continue
        }
        const owner = taskWave.get(taskId)
        const dependencyOwner = taskWave.get(dependency)
        if (!owner || !dependencyOwner || dependencyOwner.waveIndex >= owner.waveIndex) {
          errors.push({
            code: 'DEPENDENCY_NOT_EARLIER', taskId, dependency,
            waveId: owner && owner.waveId, dependencyWaveId: dependencyOwner && dependencyOwner.waveId,
            message: `task ${taskId} dependency ${dependency} must be in an earlier wave`,
          })
        }
      }
    }

    for (let waveIndex = 0; waveIndex < waveList.length; waveIndex++) {
      const wave = waveList[waveIndex]
      if (!wave || !Array.isArray(wave.taskIds)) continue
      const resourceOwners = new Map()
      for (const taskId of wave.taskIds) {
        const task = taskTable[taskId]
        if (!task || typeof task !== 'object') continue
        if (typeof task.gateIsolation === 'string' && /^wave-exclusive(?:$|[\s(（:：])/i.test(task.gateIsolation.trim())
          && wave.taskIds.length > 1) {
          errors.push({
            code: 'WAVE_EXCLUSIVE_GATE_CONFLICT', waveId: wave.id, waveIndex, taskId,
            message: `task ${taskId} uses a write-capable or package-wide gate and must be alone in its Wave`,
          })
        }
        for (const resource of Array.isArray(task.resources) ? task.resources : []) {
          if (typeof resource !== 'string' || !resource.trim()) continue
          const normalizedResource = resource.normalize('NFC').trim().toLowerCase()
          const owner = resourceOwners.get(normalizedResource)
          if (owner && owner !== taskId) {
            errors.push({
              code: 'SAME_WAVE_RESOURCE_OVERLAP', waveId: wave.id, waveIndex,
              taskId: owner, conflictingTaskId: taskId, resource,
              message: `wave ${wave.id} tasks ${owner} and ${taskId} share exclusive resource ${resource}`,
            })
          } else {
            resourceOwners.set(normalizedResource, taskId)
          }
        }
      }
      for (let leftIndex = 0; leftIndex < wave.taskIds.length; leftIndex++) {
        const leftId = wave.taskIds[leftIndex]
        const left = taskTable[leftId]
        if (!left || !Array.isArray(left.boundary) || left.boundary.length === 0) continue
        for (let rightIndex = leftIndex + 1; rightIndex < wave.taskIds.length; rightIndex++) {
          const rightId = wave.taskIds[rightIndex]
          const right = taskTable[rightId]
          if (!right || !Array.isArray(right.boundary) || right.boundary.length === 0) continue
          if (boundariesOverlap(left.boundary, right.boundary)) {
            errors.push({
              code: 'SAME_WAVE_BOUNDARY_OVERLAP', waveId: wave.id, waveIndex,
              taskId: leftId, conflictingTaskId: rightId,
              message: `wave ${wave.id} tasks ${leftId} and ${rightId} have overlapping Boundaries; move them to different waves`,
            })
          }
        }
      }
    }

    for (const taskId of completedTaskIds) {
      const task = taskTable[taskId]
      if (!task || !Array.isArray(task.depends)) continue
      for (const dependency of task.depends) {
        if (!completedTaskIdSet.has(dependency)) {
          errors.push({
            code: 'COMPLETED_DEPENDENCY_MISSING', taskId, dependency,
            message: `completed task ${taskId} requires completed dependency ${dependency}`,
          })
        }
      }
    }

    const uniqueScheduledTaskIds = [...new Set(scheduledTaskIds)]
    let normalizedRunTaskIds
    if (hasExplicitRunSelection) {
      if (runTaskIds.length === 0) {
        errors.push({ code: 'EMPTY_RUN_SELECTION', message: 'runTaskIds must select at least one task when provided' })
      }
      const selectedWaveIndexes = new Set(
        runTaskIds.map(taskId => taskWave.get(taskId)).filter(Boolean).map(owner => owner.waveIndex),
      )
      if (selectedWaveIndexes.size > 1) {
        errors.push({
          code: 'MULTI_WAVE_RUN_SELECTION',
          message: 'one Workflow invocation may execute exactly one Wave; review and checkpoint it before starting the next Wave',
        })
      }
      normalizedRunTaskIds = runTaskIds
    } else {
      const nextWave = waveList.find(wave => wave && Array.isArray(wave.taskIds)
        && wave.taskIds.some(taskId => !completedTaskIdSet.has(taskId)))
      normalizedRunTaskIds = nextWave
        ? nextWave.taskIds.filter(taskId => !completedTaskIdSet.has(taskId))
        : []
    }
    return {
      ok: errors.length === 0,
      errors,
      scheduledTaskIds: uniqueScheduledTaskIds,
      completedTaskIds,
      runTaskIds: normalizedRunTaskIds,
    }
  }

  function normalizeRoot(root) {
    if (typeof root !== 'string' || root.length === 0) return ''
    let path = root.normalize('NFC').replace(/\\/g, '/')
    let prefix = ''
    if (/^[A-Za-z]:\//.test(path)) {
      prefix = `${path.slice(0, 2).toLowerCase()}/`
      path = path.slice(3)
    } else if (path.startsWith('//')) {
      prefix = '//'
      path = path.slice(2)
    } else if (path.startsWith('/')) {
      prefix = '/'
      path = path.slice(1)
    }
    const segments = []
    for (const segment of path.split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') {
        if (segments.length === 0) return ''
        segments.pop()
      } else {
        segments.push(segment)
      }
    }
    let normalized = `${prefix}${segments.join('/')}`.replace(/\/+$/, '')
    if (normalized === '' && prefix === '/') normalized = '/'
    if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) normalized = normalized.toLowerCase()
    return normalized
  }

  function validateSnapshot(snapshot, expectedRoot) {
    const errors = []
    const entries = new Map()
    if (!snapshot || snapshot.status !== 'ok') {
      errors.push(`snapshot unavailable: ${(snapshot && snapshot.notes) || 'auditor did not return ok'}`)
      return { ok: false, errors, entries }
    }
    if (snapshot.protocol !== 'sdd-git-audit-v1') errors.push('snapshot protocol must be sdd-git-audit-v1')
    if (expectedRoot && normalizeRoot(snapshot.root) !== normalizeRoot(expectedRoot)) {
      errors.push(`auditor root mismatch: expected ${expectedRoot}, got ${snapshot.root || '(empty)'}`)
    }
    if (typeof snapshot.head !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(snapshot.head)) {
      errors.push('snapshot HEAD must be a full SHA-1 or SHA-256 object id')
    }

    const commands = Array.isArray(snapshot.commands) ? snapshot.commands : []
    if (commands.length === 0) errors.push('snapshot has no command evidence')
    const commandEvidence = new Map()
    for (const command of commands) {
      if (!command || typeof command.kind !== 'string' || typeof command.subject !== 'string' || !Array.isArray(command.argv)
        || command.argv.some(value => typeof value !== 'string')) {
        errors.push('audit command evidence has an invalid shape')
        continue
      }
      let subject = command.subject
      if (command.kind === 'root' || command.kind === 'head' || command.kind === 'status') {
        if (subject !== '') errors.push(`${command.kind} command subject must be empty`)
      } else {
        const parsedSubject = tryNormalizePath(subject)
        if (!parsedSubject.ok) {
          errors.push(`invalid audit command subject ${subject || '(empty)'}: ${parsedSubject.error}`)
          continue
        }
        subject = parsedSubject.path
      }
      const key = `${command.kind}:${subject}`
      if (commandEvidence.has(key)) errors.push(`duplicate audit command evidence: ${key}`)
      else commandEvidence.set(key, command)
      if (!Number.isInteger(command.exitCode) || command.exitCode !== 0) {
        errors.push(`audit command failed: ${(command && command.argv && command.argv.join(' ')) || '(unknown command)'}`)
      }
      const expectedArgv = {
        root: ['git', 'rev-parse', '--show-toplevel'],
        head: ['git', 'rev-parse', 'HEAD'],
        status: ['git', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'],
        'tracked-diff': ['git', '--literal-pathspecs', 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', subject],
        'tracked-fingerprint': ['git', 'hash-object', '--stdin'],
        'untracked-fingerprint': ['git', 'hash-object', '--no-filters', '--', subject],
      }[command.kind]
      if (!expectedArgv || JSON.stringify(command.argv) !== JSON.stringify(expectedArgv)) {
        errors.push(`audit argv does not match ${command.kind || '(unknown kind)'} protocol for ${subject || '(root)'}`)
      }
    }
    for (const kind of ['root', 'head', 'status']) {
      if (!commandEvidence.has(`${kind}:`)) errors.push(`snapshot is missing required ${kind} command evidence`)
    }

    const rawEntries = Array.isArray(snapshot.entries) ? snapshot.entries : []
    let priorPath = null
    for (const entry of rawEntries) {
      const parsed = tryNormalizePath(entry && entry.path)
      if (!parsed.ok) {
        errors.push(`invalid audited path ${(entry && entry.path) || '(empty)'}: ${parsed.error}`)
        continue
      }
      if (entries.has(parsed.path)) {
        errors.push(`duplicate audited path: ${parsed.path}`)
        continue
      }
      if (priorPath !== null && parsed.path.localeCompare(priorPath) < 0) errors.push('audit entries are not sorted')
      priorPath = parsed.path
      if (typeof entry.state !== 'string' || entry.state.length === 0) errors.push(`missing state for ${parsed.path}`)
      if (typeof entry.fingerprint !== 'string' || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i.test(entry.fingerprint)) {
        errors.push(`fingerprint for ${parsed.path} must be a full Git object id`)
      }
      const fingerprintKind = entry.state === '??' ? 'untracked-fingerprint' : 'tracked-fingerprint'
      if (!commandEvidence.has(`${fingerprintKind}:${parsed.path}`)) {
        errors.push(`missing ${fingerprintKind} command evidence for ${parsed.path}`)
      }
      if (entry.state !== '??' && !commandEvidence.has(`tracked-diff:${parsed.path}`)) {
        errors.push(`missing tracked-diff command evidence for ${parsed.path}`)
      }
      entries.set(parsed.path, { path: parsed.path, state: entry.state, fingerprint: entry.fingerprint })
    }
    return { ok: errors.length === 0, errors, entries }
  }

  function diffSnapshots(before, after) {
    const beforeEntries = before instanceof Map ? before : validateSnapshot(before).entries
    const afterEntries = after instanceof Map ? after : validateSnapshot(after).entries
    const paths = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])].sort()
    return paths
      .filter(path => {
        const left = beforeEntries.get(path)
        const right = afterEntries.get(path)
        return !left || !right || left.state !== right.state || left.fingerprint !== right.fingerprint
      })
      .map(path => ({ path, before: beforeEntries.get(path) || null, after: afterEntries.get(path) || null }))
  }

  function validateWaveAudit({ before, after, expectedRoot, taskIds, tasks, taskResults }) {
    const beforeCheck = validateSnapshot(before, expectedRoot)
    const afterCheck = validateSnapshot(after, expectedRoot)
    const errors = [...beforeCheck.errors, ...afterCheck.errors]
    if (beforeCheck.ok && afterCheck.ok && before.head !== after.head) {
      errors.push(`HEAD changed during wave: ${before.head} -> ${after.head}`)
    }

    const actualChanges = beforeCheck.ok && afterCheck.ok ? diffSnapshots(beforeCheck.entries, afterCheck.entries) : []
    const actualFiles = actualChanges.map(change => change.path)
    const boundaries = taskIds.flatMap(id => (tasks[id] && tasks[id].boundary) || [])
    const strayFiles = actualFiles.filter(path => !withinBoundary(path, boundaries))

    const reported = new Map()
    const invalidReports = []
    const ownerViolations = []
    const noChangeTasks = []
    for (const id of taskIds) {
      const result = taskResults[id] || {}
      if ((result.state === 'implemented' || result.state === 'done') && (!Array.isArray(result.files) || result.files.length === 0)) noChangeTasks.push(id)
      for (const rawPath of result.files || []) {
        const parsed = tryNormalizePath(rawPath)
        if (!parsed.ok) {
          invalidReports.push({ id, path: rawPath, reason: parsed.error })
          continue
        }
        if (!withinBoundary(parsed.path, (tasks[id] && tasks[id].boundary) || [])) {
          ownerViolations.push({ id, path: parsed.path })
        }
        if (!reported.has(parsed.path)) reported.set(parsed.path, [])
        reported.get(parsed.path).push(id)
      }
    }

    const reportedFiles = [...reported.keys()].sort()
    const actualSet = new Set(actualFiles)
    const reportedSet = new Set(reportedFiles)
    const unreportedFiles = actualFiles.filter(path => !reportedSet.has(path))
    const phantomFiles = reportedFiles.filter(path => !actualSet.has(path))

    if (strayFiles.length > 0) errors.push(`actual changes escaped Boundary: ${strayFiles.join(', ')}`)
    if (unreportedFiles.length > 0) errors.push(`implementers omitted actual changes: ${unreportedFiles.join(', ')}`)
    if (phantomFiles.length > 0) errors.push(`implementers reported unchanged files: ${phantomFiles.join(', ')}`)
    if (invalidReports.length > 0) errors.push(`implementers reported invalid paths: ${invalidReports.map(item => item.path).join(', ')}`)
    if (ownerViolations.length > 0) errors.push(`task reports escaped their own Boundary: ${ownerViolations.map(item => `${item.id}:${item.path}`).join(', ')}`)
    if (noChangeTasks.length > 0) errors.push(`done tasks reported no changed files: ${noChangeTasks.join(', ')}`)

    return {
      ok: errors.length === 0,
      errors,
      actualFiles,
      reportedFiles,
      strayFiles,
      unreportedFiles,
      phantomFiles,
      invalidReports,
      ownerViolations,
      noChangeTasks,
    }
  }

  function validateQualityEvidence(quality, evidence, requiredGates = REQUIRED_GATES) {
    const errors = []
    const records = Array.isArray(evidence) ? evidence : []
    for (const gate of requiredGates) {
      if (!records.some(record => record && record.gate === gate)) errors.push(`missing ${gate} command evidence`)
    }
    for (const record of records) {
      if (!record || !requiredGates.includes(record.gate)) {
        errors.push(`unknown quality gate: ${(record && record.gate) || '(empty)'}`)
        continue
      }
      if (typeof record.command !== 'string' || record.command.trim().length === 0) errors.push(`${record.gate} evidence has no command`)
      if (record.outcome !== 'pass' && record.outcome !== 'not_applicable') {
        errors.push(`${record.gate} evidence outcome is not successful: ${record.outcome || '(missing)'}`)
      }
      if (record.outcome === 'not_applicable' && !(typeof record.command === 'string' && /^N\/A\(.+\)$/i.test(record.command.trim()))) {
        errors.push(`${record.gate} not_applicable evidence requires command=N/A(<reason>)`)
      }
      if (!Number.isInteger(record.exitCode)) errors.push(`${record.gate} evidence has no integer exitCode`)
      else if (record.exitCode !== 0) errors.push(`${record.gate} failed with exitCode ${record.exitCode}`)
      if (typeof record.summary !== 'string' || record.summary.trim().length === 0) errors.push(`${record.gate} evidence has no summary`)
    }

    const explicitFailure = /(?:^|[\s,:;])(?:fail(?:ed|ure)?|not run|skipped)\b|\b[1-9]\d*\s+(?:tests?\s+)?failed\b|(?:失败|未通过|未运行|跳过)/i
    for (const record of records) {
      if (record && typeof record.summary === 'string' && explicitFailure.test(record.summary.trim())) {
        errors.push(`${record.gate || '(unknown)'} evidence summary explicitly reports failure: ${record.summary}`)
      }
    }
    for (const gate of requiredGates) {
      const legacy = quality && quality[gate]
      if (typeof legacy === 'string' && explicitFailure.test(legacy.trim())) errors.push(`${gate} legacy result explicitly reports failure: ${legacy}`)
    }
    return { ok: errors.length === 0, errors }
  }

  function validateAcceptanceEvidence(acceptance) {
    const errors = []
    const records = Array.isArray(acceptance) ? acceptance : []
    if (records.length === 0) errors.push('acceptance evidence must contain at least one Done when/AC record')
    const seen = new Set()
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        errors.push('acceptance evidence has an invalid record')
        continue
      }
      const criterion = typeof record.criterion === 'string' ? record.criterion.trim() : ''
      if (!criterion) errors.push('acceptance evidence has no criterion')
      else if (seen.has(criterion)) errors.push(`duplicate acceptance criterion: ${criterion}`)
      else seen.add(criterion)
      if (record.outcome !== 'pass') errors.push(`${criterion || '(unknown criterion)'} acceptance outcome is not pass: ${record.outcome || '(missing)'}`)
      if (typeof record.evidence !== 'string' || record.evidence.trim().length === 0) {
        errors.push(`${criterion || '(unknown criterion)'} acceptance evidence is empty`)
      }
    }
    return { ok: errors.length === 0, errors }
  }

  return {
    REQUIRED_GATES,
    normalizePath,
    tryNormalizePath,
    globToRegExp,
    withinBoundary,
    boundariesOverlap,
    splitByBoundaryOverlap,
    classifyWaveTasks,
    validatePlan,
    normalizeRoot,
    validateSnapshot,
    diffSnapshots,
    validateWaveAudit,
    validateQualityEvidence,
    validateAcceptanceEvidence,
  }
}
// SDD_WORKFLOW_CORE_END

export const sddWorkflowCore = createSddWorkflowCore()
export const {
  REQUIRED_GATES,
  normalizePath,
  tryNormalizePath,
  globToRegExp,
  withinBoundary,
  boundariesOverlap,
  splitByBoundaryOverlap,
  classifyWaveTasks,
  validatePlan,
  normalizeRoot,
  validateSnapshot,
  diffSnapshots,
  validateWaveAudit,
  validateQualityEvidence,
  validateAcceptanceEvidence,
} = sddWorkflowCore
