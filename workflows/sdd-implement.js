// SDD 实现阶段的【可复现编排】脚本（仅在用户显式传 --workflow 时调用）
//
// 把 /sdd:tasks 的下一 Wave 编译成可复现多代理流水线：波内并行派 implementer，
// 结构化门禁证据 + 独立 Git 前后快照对账。跨 Wave 的评审/提交屏障由外层编排器控制。
// 控制流是代码、不是提示词——这就是相对默认"提示词编排"硬化的部分。
//
// 用法：用户传 --workflow 后，/sdd:implement 先把完整 tasks.md 解析成 args，再用 Workflow 工具跑本脚本：
//   Workflow({ scriptPath: ".../workflows/sdd-implement.js", args: { featureDir, featureRoot, constitutionPath,
//     waves:[{id,taskIds[]}], tasks:{T1:{id,what,boundary[],depends[],refs,doneWhen,domain,verify,isolation,risk,review,testPolicy,resources[],gateIsolation}},
//     // featureRoot = 当前 Feature Worktree 的唯一绝对根（省略则回退 featureDir）；子代理被强制 cd 进去、只在此目录操作。
//     completedTaskIds:[], runTaskIds:[], stackPacks:{domain:path}, injectSkills:[] } })
// 返回结构化汇总，交回 /sdd:implement 编排器回填 tasks.md / design.md ## Deviations / 转述 blocked。
//
// 写给真实 Workflow API：顶层脚本 + 全局 agent/parallel/phase/log/args/budget；phase(title) 无回调；
// 输入走 args；agent({schema}) 直接返回校验过的对象；parallel 中抛错的 thunk 解析为 null（不 reject）。
// 禁用时间/随机等不确定性 API。

export const meta = {
  name: 'sdd-implement',
  description: "Run exactly one selected feature Wave with fail-fast dispatch, dependency gates, and Git-visible Boundary reconciliation.",
  phases: [
    { title: 'implement', detail: 'Dispatch fresh Implementers and freeze their Git-visible changes.' },
    { title: 'verify', detail: 'Dispatch fresh non-mutating Verifiers and reject any verification side effect.' },
  ],
}

const ImplementerSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'files', 'deviation', 'notes'],
  properties: {
    status: { type: 'string', enum: ['implemented', 'blocked'] },
    files: { type: 'array', items: { type: 'string' } },
    deviation: { type: 'string' },
    notes: { type: 'string' },
  },
}

const VerifierSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'quality', 'evidence', 'acceptance', 'worktreeUnchanged', 'notes'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    quality: {
      type: 'object', additionalProperties: false,
      required: ['format', 'lint', 'typecheck', 'test'],
      properties: { format: { type: 'string' }, lint: { type: 'string' }, typecheck: { type: 'string' }, test: { type: 'string' } },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['gate', 'outcome', 'command', 'exitCode', 'summary'],
        properties: {
          gate: { type: 'string', enum: ['format', 'lint', 'typecheck', 'test'] },
          outcome: { type: 'string', enum: ['pass', 'fail', 'not_applicable', 'not_run'] },
          command: { type: 'string' },
          exitCode: { type: 'integer' },
          summary: { type: 'string' },
          logPath: { type: 'string' },
        },
      },
    },
    acceptance: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        required: ['criterion', 'outcome', 'evidence'],
        properties: {
          criterion: { type: 'string', minLength: 1 },
          outcome: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
          evidence: { type: 'string', minLength: 1 },
        },
      },
    },
    worktreeUnchanged: { type: 'boolean' },
    notes: { type: 'string' },
  },
}

const AuditSnapshotSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'protocol', 'root', 'head', 'entries', 'commands', 'notes'],
  properties: {
    status: { type: 'string', enum: ['ok', 'blocked'] },
    protocol: { type: 'string', enum: ['sdd-git-audit-v1'] },
    root: { type: 'string' },
    head: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['path', 'state', 'fingerprint'],
        properties: { path: { type: 'string' }, state: { type: 'string' }, fingerprint: { type: 'string' } },
      },
    },
    commands: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'subject', 'argv', 'exitCode'],
        properties: {
          kind: { type: 'string', enum: ['root', 'head', 'status', 'tracked-diff', 'tracked-fingerprint', 'untracked-fingerprint'] },
          subject: { type: 'string' },
          argv: { type: 'array', items: { type: 'string' } },
          exitCode: { type: 'integer' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

// Dynamic Workflow scripts must begin with meta and cannot reliably import a
// sibling module. This factory is embedded verbatim from sdd-implement-core.js;
// tests/workflow-sync.test.js fails if the copies drift.
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
const {
  tryNormalizePath,
  withinBoundary,
  splitByBoundaryOverlap,
  classifyWaveTasks,
  validatePlan,
  normalizeRoot,
  validateSnapshot,
  diffSnapshots,
  validateWaveAudit,
  validateQualityEvidence,
  validateAcceptanceEvidence,
} = createSddWorkflowCore()

function implPrompt(t, feedback, ctx) {
  const pack = ctx.stackPacks && ctx.stackPacks[t.domain] ? ctx.stackPacks[t.domain] : '（本领域无能力包，按 constitution §3 默认门禁）'
  const skills = ctx.injectSkills && ctx.injectSkills.length ? ctx.injectSkills.join(', ') : '（无）'
  return [
    '你是全新上下文的 implementer，只实现【这一个】SDD 任务。只修改实现与必要测试，严守 Boundary；不得执行 format/lint/typecheck/test/build/coverage 门禁，不得自报 PASS。按 ImplementerSchema 返回 status/files/deviation/notes。',
    `工作根 FEATURE_ROOT（唯一可操作目录，绝不碰其它目录尤其主目录）: ${ctx.featureRoot}`,
    '硬规则：只在上面的 FEATURE_ROOT 内读/写/搜索；禁止运行完成门禁，禁止 git add/commit/reset/checkout/clean。files 只列本次执行产生净变化的相对路径，不得漏报或把未变化文件算进去。本任务规格内容已在本 prompt 给全，不要读取其它角色的会话或结论。',
    `功能目录(规格参考,只读): ${ctx.featureDir}`, `宪法: ${ctx.constitutionPath}`,
    `任务 ${t.id}: ${t.what}`,
    `Boundary（唯一可写范围，越界=失败）: ${(t.boundary || []).join(', ')}`,
    `Refs: ${t.refs || '（无）'} · Done when: ${t.doneWhen || '见 Refs'}`,
    `Risk: ${t.risk || '未标注（按实际影响保守判断）'} · Review: ${t.review || 'missing (block)'} · Test policy: ${t.testPolicy || '按 constitution §4 风险分层'}`,
    `Exclusive resources: ${(t.resources || []).join(', ') || 'none'} · Gate isolation: ${t.gateIsolation || 'missing (block)'}`,
    `领域能力包 specs/stacks/${t.domain}.md: ${pack}（优先用其 §7 本层门禁，否则 constitution §3）`,
    `注入 skill: ${skills}`,
    t.isolation === 'worktree' ? '隔离: 在独立 worktree 实现，事后由编排器合并。' : '隔离: 当前工作树，绝不碰 Boundary 外文件。',
    '关键契约/安全/历史缺陷所需回归测试必须作为实现资产写入 Boundary；禁止 skip/only、恒真断言、过宽 mock、禁用检查、降低覆盖率或删除既有回归。完成代码修改后只报 implemented，门禁由另一个 fresh verifier 执行。',
    feedback ? `\n## 编排器转述的结构化返工项（来自独立 Verifier/Reviewer）\n${feedback}` : '',
  ].join('\n')
}

function verifierPrompt(t, implementation, ctx) {
  const pack = ctx.stackPacks && ctx.stackPacks[t.domain] ? ctx.stackPacks[t.domain] : '（本领域无能力包，按 constitution §3 默认门禁）'
  return [
    '你是全新上下文的 verifier，只核对【这一个】SDD 任务。不得修改代码、测试、规格、配置、快照或任务状态；不得修 bug；不得采信 implementer 的完成结论。按 VerifierSchema 返回 status/quality/evidence/acceptance/worktreeUnchanged/notes。',
    `工作根 FEATURE_ROOT: ${ctx.featureRoot}`,
    `功能目录(规格参考,只读): ${ctx.featureDir} · 宪法: ${ctx.constitutionPath}`,
    `任务 ${t.id}: ${t.what}`,
    `Boundary: ${(t.boundary || []).join(', ')} · Implementer 声明 files（只作对账线索）: ${(implementation.files || []).join(', ')}`,
    `Refs: ${t.refs || '（无）'} · Done when: ${t.doneWhen || '见 Refs'}`,
    `Test policy: ${t.testPolicy} · Resources: ${(t.resources || []).join(', ') || 'none'} · Gate isolation: ${t.gateIsolation}`,
    `能力包: ${pack}（优先读取 §7 非写入门禁，否则 constitution §3）`,
    '独立读取真实 git status/diff；只执行非写入 format-check/lint(no fix)/typecheck/相关 test。禁止 --write、--fix、更新快照、生成锁文件或任何会改变工作树的命令。只有写入型门禁时 status=blocked。',
    '四类 evidence 逐项提供 gate/outcome/command/exitCode/summary；不适用项用 not_applicable + N/A(<理由>)。acceptance 逐条覆盖 Done when/相关 AC，给测试名、输出或实测值。任一 not_run/fail/空证据/非零必须 status=fail 或 blocked。运行前后核对 Git；若工作树发生任何额外变化，worktreeUnchanged=false 且 status=blocked。',
  ].join('\n')
}

function auditPrompt(stage, waveId, featureRoot, auditHelperCommand) {
  return [
    '你是只读 Git 审计子代理。不得 Edit/Write，不得自行拼装 Git 命令，也不得运行任何会改变工作树、索引、分支或 HEAD 的命令。',
    `FEATURE_ROOT: ${featureRoot}`,
    `采样点: Wave ${waveId} ${stage}`,
    '当前工作目录必须已经是 FEATURE_ROOT；禁止 cd，也禁止把 FEATURE_ROOT、文件名或其它 prompt 内容插入 shell。工作目录不对时，固定 helper 会由返回 root 触发 fail-closed。',
    `只运行这一条固定命令一次，逐字保持不变：${auditHelperCommand}`,
    '读取该 helper 的单个 JSON 输出，并按 AuditSnapshotSchema 原样返回所有字段；不得重算、删改或补造 entries/commands。helper 返回 status=blocked、输出不可解析、root 不等于 FEATURE_ROOT 或命令无法执行时，返回 status=blocked 并在 notes 写明原因。',
  ].join('\n')
}

function runtimeFailure({ stage, label, task = null, wave = null, code, message }) {
  return { stage, label, task, wave, code, message }
}

function printableError(error) {
  return error && error.message ? error.message : String(error)
}

async function callWorkflowAgent(prompt, options, context) {
  try {
    const value = await agent(prompt, options)
    if (value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
      return {
        ok: false,
        failure: runtimeFailure({
          ...context,
          code: 'AGENT_EMPTY_RESULT',
          message: `Workflow agent ${context.label} returned an empty result; inspect the Workflow journal for a safety block, skipped dispatch, or terminal API error.`,
        }),
      }
    }
    return { ok: true, value }
  } catch (error) {
    return {
      ok: false,
      failure: runtimeFailure({
        ...context,
        code: 'AGENT_THROW',
        message: `Workflow agent ${context.label} threw: ${printableError(error)}`,
      }),
    }
  }
}

async function takeAuditSnapshot(stage, waveId) {
  const label = `git-audit:${waveId}:${stage}`
  return callWorkflowAgent(auditPrompt(stage, waveId, ctx.featureRoot, ctx.auditHelperCommand), {
    schema: AuditSnapshotSchema,
    label,
    phase: `Wave ${waveId}`,
  }, {
    stage: `audit:${stage}`,
    label,
    wave: waveId,
  })
}

// ---- 主流程 ----
const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
const ctx = {
  featureDir: input.featureDir,
  featureRoot: input.featureRoot || input.featureDir,
  constitutionPath: input.constitutionPath,
  stackPacks: input.stackPacks || {},
  injectSkills: input.injectSkills || [],
  auditHelperCommand: input.auditHelperCommand || 'node "$CLAUDE_PLUGIN_ROOT/workflows/git-audit.cjs"',
}
const waves = input.waves || []
const tasks = input.tasks || {}
const results = {}
const auditTrail = []
const runtimeFailures = []

// 在任何 agent/phase 启动前验证完整计划。计划图不可信时整体 fail closed；
// 这样重复 task、未知依赖、同波/未来波依赖都不会造成重跑或部分执行。
const planCheck = validatePlan(waves, tasks, {
  completedTaskIds: input.completedTaskIds,
  runTaskIds: input.runTaskIds,
})
const contextErrors = []
function isAbsoluteContextPath(value) {
  return typeof value === 'string' && (
    /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')
  )
}
function hasTraversalSegment(value) {
  return typeof value === 'string' && value.replace(/\\/g, '/').split('/').some(segment => segment === '.' || segment === '..')
}
const absoluteRoot = isAbsoluteContextPath(ctx.featureRoot)
const normalizedFeatureRoot = absoluteRoot && !hasTraversalSegment(ctx.featureRoot) ? normalizeRoot(ctx.featureRoot) : ''
if (!absoluteRoot || !normalizedFeatureRoot) {
  contextErrors.push({ code: 'INVALID_FEATURE_ROOT', message: 'featureRoot must be an absolute Feature Worktree path' })
}
function contextPathIsInsideRoot(value) {
  if (typeof value !== 'string' || value.length === 0 || hasTraversalSegment(value)) return false
  if (!isAbsoluteContextPath(value)) return tryNormalizePath(value).ok
  const normalized = normalizeRoot(value)
  return Boolean(normalizedFeatureRoot && normalized) && (
    normalized === normalizedFeatureRoot || normalized.startsWith(`${normalizedFeatureRoot}/`)
  )
}
if (!contextPathIsInsideRoot(ctx.featureDir)) {
  contextErrors.push({ code: 'INVALID_FEATURE_DIR', message: 'featureDir must be a safe relative path or an absolute path inside featureRoot' })
}
if (!contextPathIsInsideRoot(ctx.constitutionPath)) {
  contextErrors.push({ code: 'INVALID_CONSTITUTION_PATH', message: 'constitutionPath must resolve inside featureRoot' })
}
if (!ctx.stackPacks || typeof ctx.stackPacks !== 'object' || Array.isArray(ctx.stackPacks)) {
  contextErrors.push({ code: 'INVALID_STACK_PACKS', message: 'stackPacks must be an object map' })
} else {
  for (const [domain, packPath] of Object.entries(ctx.stackPacks)) {
    if (!contextPathIsInsideRoot(packPath)) {
      contextErrors.push({ code: 'INVALID_STACK_PACK_PATH', domain, message: `stack pack ${domain} must resolve inside featureRoot` })
    }
  }
}
if (!Array.isArray(ctx.injectSkills) || ctx.injectSkills.some(skill => typeof skill !== 'string' || skill.trim().length === 0)) {
  contextErrors.push({ code: 'INVALID_INJECT_SKILLS', message: 'injectSkills must be an array of non-empty skill names' })
}
const allowedAuditHelperCommands = [
  'node "$CLAUDE_PLUGIN_ROOT/workflows/git-audit.cjs"',
  'node .claude/sdd/workflows/git-audit.cjs',
]
if (!allowedAuditHelperCommands.includes(ctx.auditHelperCommand)) {
  contextErrors.push({ code: 'INVALID_AUDIT_HELPER', message: 'auditHelperCommand must be one of the two fixed plugin/vendored helper commands' })
}
const planErrors = [...planCheck.errors, ...contextErrors]
if (planErrors.length > 0) {
  const taskTable = tasks && typeof tasks === 'object' && !Array.isArray(tasks) ? tasks : {}
  const planTaskIds = [...new Set([...planCheck.scheduledTaskIds, ...Object.keys(taskTable)])]
  const reason = `计划输入无效，未启动任何 agent: ${planErrors.map(error => `[${error.code}] ${error.message}`).join(' | ')}`
  for (const id of planTaskIds) results[id] = { state: 'blocked', reason, attempts: 0 }

  return {
    feature: ctx.featureDir,
    planErrors,
    runtimeFailures: [],
    totals: { tasks: planTaskIds.length, done: 0, retriedPass: 0, blocked: planTaskIds.length, auditFailedWaves: 0 },
    waves: (Array.isArray(waves) ? waves : []).map((wave, index) => ({
      wave: wave && wave.id !== undefined ? wave.id : `#${index}`,
      done: [],
      blocked: wave && Array.isArray(wave.taskIds) ? [...new Set(wave.taskIds.filter(id => typeof id === 'string'))] : [],
    })),
    audits: [],
    taskEvidence: planTaskIds.map(id => ({
      id, state: 'blocked', reason, files: [], quality: null, evidence: [], attempts: 0,
    })),
    deviations: [],
    needsHumanDecision: [{ id: 'PLAN', reason, action: '修复 Waves/Tasks/Depends 计划输入后重新运行；本次没有启动任何 agent' }],
  }
}

const completedTaskIdSet = new Set(planCheck.completedTaskIds)
const runTaskIdSet = new Set(planCheck.runTaskIds)
for (const id of planCheck.scheduledTaskIds) {
  if (completedTaskIdSet.has(id)) {
    results[id] = { state: 'done', reason: '调用前已完成', attempts: 0, source: 'completedTaskIds' }
  } else if (runTaskIdSet.has(id)) {
    results[id] = { state: 'pending', attempts: 0 }
  } else {
    results[id] = { state: 'not_selected', reason: '未纳入本次 runTaskIds', attempts: 0 }
  }
}

async function runTask(t) {
  try {
    const label = `impl:${t.id}`
    const invocation = await callWorkflowAgent(implPrompt(t, null, ctx), {
      schema: ImplementerSchema,
      label,
      phase: `Wave ${t.waveId} implement`,
    }, {
      stage: 'implement', label, task: t.id, wave: t.waveId,
    })
    if (!invocation.ok) return { runtimeFailure: invocation.failure }
    const impl = invocation.value
    if (!impl || typeof impl !== 'object' || Array.isArray(impl)) {
      return { runtimeFailure: runtimeFailure({
        stage: 'implement', label, task: t.id, wave: t.waveId, code: 'AGENT_INVALID_RESULT',
        message: `Workflow agent ${label} returned a non-object result.`,
      }) }
    }
    if (impl.status === 'blocked') return {
      state: 'blocked', reason: (impl.deviation && impl.deviation.trim()) || impl.notes || 'implementer 自报 blocked',
      files: impl.files || [], deviation: impl.deviation, attempts: 1,
    }
    const stray = (impl.files || []).filter(f => !withinBoundary(f, t.boundary))
    if (stray.length > 0) return {
      state: 'blocked', reason: `Implementer 自报越界改动 ${stray.join(', ')}（仅可改 ${(t.boundary || []).join(', ')}）`,
      files: impl.files || [], deviation: impl.deviation, attempts: 1,
    }
    return { state: 'implemented', files: impl.files || [], deviation: impl.deviation, attempts: 1 }
  } catch (error) {
    return {
      runtimeFailure: runtimeFailure({
        stage: 'implement', label: `impl:${t.id}`, task: t.id, wave: t.waveId,
        code: 'TASK_RUNTIME_THROW',
        message: `Workflow task wrapper threw: ${printableError(error)}`,
      }),
    }
  }
}

async function runVerifier(t, implementation) {
  try {
    const label = `verify:${t.id}`
    const invocation = await callWorkflowAgent(verifierPrompt(t, implementation, ctx), {
      schema: VerifierSchema,
      label,
      phase: `Wave ${t.waveId} verify`,
    }, {
      stage: 'verify', label, task: t.id, wave: t.waveId,
    })
    if (!invocation.ok) return { runtimeFailure: invocation.failure }
    const verification = invocation.value
    if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
      return { runtimeFailure: runtimeFailure({
        stage: 'verify', label, task: t.id, wave: t.waveId, code: 'AGENT_INVALID_RESULT',
        message: `Workflow agent ${label} returned a non-object result.`,
      }) }
    }
    const qualityCheck = validateQualityEvidence(verification.quality, verification.evidence)
    const acceptanceCheck = validateAcceptanceEvidence(verification.acceptance)
    const violations = []
    if (verification.status !== 'pass') violations.push(`Verifier status=${verification.status}: ${verification.notes || '无说明'}`)
    if (verification.worktreeUnchanged !== true) violations.push('Verifier 报告核对前后工作树发生变化')
    if (!qualityCheck.ok) violations.push(`质量证据不合格: ${qualityCheck.errors.join('; ')}`)
    if (!acceptanceCheck.ok) violations.push(`验收证据不合格: ${acceptanceCheck.errors.join('; ')}`)
    if (violations.length > 0) return {
      ...implementation, state: 'blocked', reason: `独立核对未通过: ${violations.join(' | ')}`,
      quality: verification.quality, evidence: verification.evidence, acceptance: verification.acceptance,
      verifierNotes: verification.notes,
    }
    return {
      ...implementation, state: 'done', quality: verification.quality,
      evidence: verification.evidence, acceptance: verification.acceptance,
      verifierNotes: verification.notes,
    }
  } catch (error) {
    return { runtimeFailure: runtimeFailure({
      stage: 'verify', label: `verify:${t.id}`, task: t.id, wave: t.waveId,
      code: 'VERIFIER_RUNTIME_THROW', message: `Workflow verifier wrapper threw: ${printableError(error)}`,
    }) }
  }
}

function stopForRuntimeFailures(failures, waveId, taskIds) {
  runtimeFailures.push(...failures)
  const detail = failures.map(failure => `[${failure.code}] ${failure.label}: ${failure.message}`).join(' | ')
  const reason = `Wave ${waveId} Workflow 运行时失败，已停止后续调度: ${detail}`
  for (const id of taskIds) {
    const prior = results[id] || {}
    results[id] = { ...prior, state: 'blocked', reason }
  }
  auditTrail.push({ wave: waveId, ok: false, stage: 'runtime', errors: failures.map(failure => failure.message), runtimeFailures: failures })
  log(reason)
  return reason
}

let abortReason = ''
waveLoop: for (const wave of waves) {
  const selectedTaskIds = wave.taskIds.filter(id => runTaskIdSet.has(id) && !completedTaskIdSet.has(id))
  if (selectedTaskIds.length === 0) continue
  phase(`Wave ${wave.id}`)

  // 依赖闸 + blocked 传播由纯函数控制，不依赖 implementer 判断。
  const classification = classifyWaveTasks(selectedTaskIds, tasks, results)
  for (const [id, bad] of Object.entries(classification.blockedBy)) {
    const omitted = bad.filter(dependency => results[dependency] && results[dependency].state === 'not_selected')
    const reason = omitted.length > 0
      ? `依赖未完成且未纳入 runTaskIds: ${omitted.join(', ')}`
      : `上游未完成/blocked: ${bad.join(', ')}`
    results[id] = { state: 'blocked', reason, attempts: 0 }
    log(`T${id} 依赖未满足，传播 blocked: ${bad.join(', ')}`)
  }

  // 缺失、空或不安全的 Boundary 绝不能以“无改动”方式绕过闸门。
  const runnable = []
  for (const id of classification.runnable) {
    const boundary = tasks[id] && tasks[id].boundary
    const invalid = !Array.isArray(boundary) || boundary.length === 0 || boundary.some(pattern => !tryNormalizePath(pattern).ok)
    if (invalid) {
      results[id] = { state: 'blocked', reason: 'Boundary 缺失、为空或包含绝对/越根路径', attempts: 0 }
      log(`T${id} Boundary 无效，阻止执行`)
    } else {
      runnable.push(id)
    }
  }
  if (runnable.length === 0) continue

  // Workflow 本身不能访问 FS/shell，因此由独立只读 auditor 在 Wave 前后
  // 读取 Git，并用 fingerprint 快照计算真实净改动；implementer 的 files 只作对账输入。
  const beforeInvocation = await takeAuditSnapshot('before', wave.id)
  if (!beforeInvocation.ok) {
    abortReason = stopForRuntimeFailures([beforeInvocation.failure], wave.id, runnable)
    break waveLoop
  }
  const before = beforeInvocation.value
  const beforeCheck = validateSnapshot(before, ctx.featureRoot)
  if (!beforeCheck.ok) {
    const reason = `Wave ${wave.id} 前置 Git 审计失败: ${beforeCheck.errors.join(' | ')}`
    for (const id of runnable) results[id] = { state: 'blocked', reason, attempts: 0 }
    auditTrail.push({ wave: wave.id, ok: false, stage: 'before', errors: beforeCheck.errors })
    log(reason)
    abortReason = reason
    break waveLoop
  }
  if (beforeCheck.entries.size !== 0) {
    const reason = `Wave ${wave.id} 前置工作树非空；Workflow 只能从已评审并提交的干净 Wave 检查点启动`
    for (const id of runnable) results[id] = { state: 'blocked', reason, attempts: 0 }
    auditTrail.push({
      wave: wave.id, ok: false, stage: 'before',
      errors: [reason], actualFiles: [...beforeCheck.entries.keys()],
    })
    log(reason)
    abortReason = reason
    break waveLoop
  }

  // 防御性分组：validatePlan 已拒绝同波重叠；有效计划应全部可并行。
  const { parallelizable, serialize } = splitByBoundaryOverlap(runnable, tasks)
  if (serialize.length) log(`Wave ${wave.id} Boundary 重叠，降级串行: ${serialize.join(', ')}`)

  const parallelFailures = []
  let out
  try {
    out = await parallel(parallelizable.map(id => () => runTask({ ...tasks[id], waveId: wave.id })))
  } catch (error) {
    parallelFailures.push(runtimeFailure({
      stage: 'parallel', label: `parallel:${wave.id}`, wave: wave.id, code: 'PARALLEL_THROW',
      message: `Workflow parallel threw: ${printableError(error)}`,
    }))
  }

  if (parallelFailures.length === 0 && (out === null || out === undefined)) {
    parallelFailures.push(runtimeFailure({
      stage: 'parallel', label: `parallel:${wave.id}`, wave: wave.id, code: 'PARALLEL_NULL',
      message: 'Workflow parallel returned null instead of task results; inspect the Workflow journal.',
    }))
  } else if (parallelFailures.length === 0 && !Array.isArray(out)) {
    parallelFailures.push(runtimeFailure({
      stage: 'parallel', label: `parallel:${wave.id}`, wave: wave.id, code: 'PARALLEL_INVALID_RESULT',
      message: `Workflow parallel returned ${typeof out}, expected an array.`,
    }))
  } else if (parallelFailures.length === 0) {
    for (let index = 0; index < parallelizable.length; index++) {
      const id = parallelizable[index]
      if (index >= out.length) {
        parallelFailures.push(runtimeFailure({
          stage: 'parallel', label: `impl:${id}`, task: id, wave: wave.id, code: 'PARALLEL_RESULT_MISSING',
          message: `Workflow parallel omitted result ${index} for task ${id}.`,
        }))
        continue
      }
      const taskResult = out[index]
      if (taskResult === null || taskResult === undefined) {
        parallelFailures.push(runtimeFailure({
          stage: 'parallel', label: `impl:${id}`, task: id, wave: wave.id, code: 'PARALLEL_RESULT_NULL',
          message: `Workflow parallel returned null for task ${id}; inspect the Workflow journal for the swallowed thunk failure.`,
        }))
      } else if (taskResult.runtimeFailure) {
        parallelFailures.push(taskResult.runtimeFailure)
      } else {
        results[id] = taskResult
      }
    }
    if (out.length > parallelizable.length) {
      parallelFailures.push(runtimeFailure({
        stage: 'parallel', label: `parallel:${wave.id}`, wave: wave.id, code: 'PARALLEL_RESULT_COUNT',
        message: `Workflow parallel returned ${out.length} results for ${parallelizable.length} tasks.`,
      }))
    }
  }

  if (parallelFailures.length > 0) {
    abortReason = stopForRuntimeFailures(parallelFailures, wave.id, runnable)
    break waveLoop
  }

  // Boundary 重叠的少数任务串行执行；任一运行时故障立即停止。
  for (const id of serialize) {
    const taskResult = await runTask({ ...tasks[id], waveId: wave.id })
    if (taskResult === null || taskResult === undefined) {
      abortReason = stopForRuntimeFailures([runtimeFailure({
        stage: 'implement', label: `impl:${id}`, task: id, wave: wave.id, code: 'TASK_RESULT_NULL',
        message: `Task wrapper for ${id} returned null.`,
      })], wave.id, runnable)
      break waveLoop
    }
    if (taskResult.runtimeFailure) {
      abortReason = stopForRuntimeFailures([taskResult.runtimeFailure], wave.id, runnable)
      break waveLoop
    }
    results[id] = taskResult
  }

  // 先冻结 Implementer 结束后的真实快照。Verifier 必须从这个快照开始，且不得改变它。
  const implementedInvocation = await takeAuditSnapshot('implemented', wave.id)
  if (!implementedInvocation.ok) {
    abortReason = stopForRuntimeFailures([implementedInvocation.failure], wave.id, runnable)
    break waveLoop
  }
  const implemented = implementedInvocation.value
  const implementationAudit = validateWaveAudit({
    before, after: implemented, expectedRoot: ctx.featureRoot,
    taskIds: runnable, tasks, taskResults: results,
  })
  auditTrail.push({
    wave: wave.id, ok: implementationAudit.ok, stage: 'implemented', errors: implementationAudit.errors,
    actualFiles: implementationAudit.actualFiles, reportedFiles: implementationAudit.reportedFiles,
  })
  if (!implementationAudit.ok) {
    const reason = `Wave ${wave.id} Implementer 真实 Git 变更审计失败: ${implementationAudit.errors.join(' | ')}`
    for (const id of runnable) results[id] = { ...results[id], state: 'blocked', reason }
    log(reason)
    abortReason = reason
    break waveLoop
  }

  const verifierIds = runnable.filter(id => results[id] && results[id].state === 'implemented')
  if (verifierIds.length > 0) {
    let verifierOut
    const verifierFailures = []
    try {
      verifierOut = await parallel(verifierIds.map(id => () => runVerifier({ ...tasks[id], waveId: wave.id }, results[id])))
    } catch (error) {
      verifierFailures.push(runtimeFailure({
        stage: 'verify:parallel', label: `verify-parallel:${wave.id}`, wave: wave.id,
        code: 'VERIFIER_PARALLEL_THROW', message: `Verifier parallel threw: ${printableError(error)}`,
      }))
    }
    if (verifierFailures.length === 0 && !Array.isArray(verifierOut)) {
      verifierFailures.push(runtimeFailure({
        stage: 'verify:parallel', label: `verify-parallel:${wave.id}`, wave: wave.id,
        code: 'VERIFIER_PARALLEL_INVALID_RESULT', message: 'Verifier parallel did not return an array.',
      }))
    } else if (verifierFailures.length === 0) {
      for (let index = 0; index < verifierIds.length; index++) {
        const id = verifierIds[index]
        const verifierResult = verifierOut[index]
        if (!verifierResult) {
          verifierFailures.push(runtimeFailure({
            stage: 'verify:parallel', label: `verify:${id}`, task: id, wave: wave.id,
            code: 'VERIFIER_RESULT_MISSING', message: `Verifier result missing for task ${id}.`,
          }))
        } else if (verifierResult.runtimeFailure) verifierFailures.push(verifierResult.runtimeFailure)
        else results[id] = verifierResult
      }
      if (verifierOut.length !== verifierIds.length) verifierFailures.push(runtimeFailure({
        stage: 'verify:parallel', label: `verify-parallel:${wave.id}`, wave: wave.id,
        code: 'VERIFIER_RESULT_COUNT', message: `Verifier parallel returned ${verifierOut.length} results for ${verifierIds.length} tasks.`,
      }))
    }
    if (verifierFailures.length > 0) {
      abortReason = stopForRuntimeFailures(verifierFailures, wave.id, runnable)
      break waveLoop
    }
  }

  const afterInvocation = await takeAuditSnapshot('verified', wave.id)
  if (!afterInvocation.ok) {
    abortReason = stopForRuntimeFailures([afterInvocation.failure], wave.id, runnable)
    break waveLoop
  }
  const after = afterInvocation.value
  const implementedCheck = validateSnapshot(implemented, ctx.featureRoot)
  const afterCheck = validateSnapshot(after, ctx.featureRoot)
  const verifierChanges = implementedCheck.ok && afterCheck.ok ? diffSnapshots(implementedCheck.entries, afterCheck.entries) : []
  const verifierAuditErrors = [...implementedCheck.errors, ...afterCheck.errors]
  if (implementedCheck.ok && afterCheck.ok && implemented.head !== after.head) verifierAuditErrors.push(`HEAD changed during verification: ${implemented.head} -> ${after.head}`)
  if (verifierChanges.length > 0) verifierAuditErrors.push(`Verifier changed worktree: ${verifierChanges.map(change => change.path).join(', ')}`)
  if (verifierAuditErrors.length > 0) {
    const reason = `Wave ${wave.id} Verifier 只读隔离失败: ${verifierAuditErrors.join(' | ')}`
    for (const id of runnable) results[id] = { ...results[id], state: 'blocked', reason }
    auditTrail.push({ wave: wave.id, ok: false, stage: 'verified', errors: verifierAuditErrors })
    log(reason)
    abortReason = reason
    break waveLoop
  }

  const audit = validateWaveAudit({ before, after, expectedRoot: ctx.featureRoot, taskIds: runnable, tasks, taskResults: results })
  auditTrail.push({
    wave: wave.id, ok: audit.ok, stage: 'verified', errors: audit.errors,
    actualFiles: audit.actualFiles, reportedFiles: audit.reportedFiles,
  })
  if (!audit.ok) {
    const reason = `Wave ${wave.id} 真实 Git 变更审计失败: ${audit.errors.join(' | ')}`
    // 共享工作树中的越界/漏报无法可靠归因到某一个并发 agent；为避免误放行，
    // 本 Wave 全部已执行任务一起 blocked，并阻断依赖链。
    for (const id of runnable) {
      const prior = results[id] || {}
      results[id] = {
        ...prior,
        state: 'blocked',
        reason,
        audit: { actualFiles: audit.actualFiles, reportedFiles: audit.reportedFiles, errors: audit.errors },
      }
    }
    log(reason)
    abortReason = reason
    break waveLoop
  }
}

if (abortReason) {
  for (const id of runTaskIdSet) {
    if (completedTaskIdSet.has(id) || !results[id] || results[id].state !== 'pending') continue
    results[id] = { state: 'blocked', reason: `Workflow 已在更早阶段 fail-fast: ${abortReason}`, attempts: 0 }
  }
}

// 汇总（交回 /sdd:implement 编排器据此回填 tasks.md 状态/Progress、回填 design.md ## Deviations、转述 blocked）
const all = waves.flatMap(w => w.taskIds.map(id => ({ id, ...(results[id] || { state: 'missing' }), what: tasks[id] && tasks[id].what })))
return {
  feature: ctx.featureDir,
  planErrors: [],
  runtimeFailures,
  totals: {
    tasks: all.length,
    done: all.filter(i => i.state === 'done').length,
    retriedPass: all.filter(i => i.state === 'done' && i.attempts > 1).length,
    blocked: all.filter(i => i.state === 'blocked').length,
    notSelected: all.filter(i => i.state === 'not_selected').length,
    auditFailedWaves: auditTrail.filter(item => !item.ok).length,
  },
  waves: waves.map(w => ({
    wave: w.id,
    done: w.taskIds.filter(id => results[id] && results[id].state === 'done'),
    blocked: w.taskIds.filter(id => results[id] && results[id].state === 'blocked'),
    notSelected: w.taskIds.filter(id => results[id] && results[id].state === 'not_selected'),
  })),
  audits: auditTrail,
  taskEvidence: all.map(item => ({
    id: item.id, state: item.state, reason: item.reason || '', files: item.files || [],
    quality: item.quality || null, evidence: item.evidence || [], acceptance: item.acceptance || [], attempts: item.attempts || 0,
    source: item.source || '',
  })),
  deviations: all.filter(i => i.deviation && i.deviation.trim() && i.deviation.trim() !== '无').map(i => ({ id: i.id, deviation: i.deviation })),
  needsHumanDecision: all.filter(i => i.state === 'blocked').map(i => ({ id: i.id, reason: i.reason || 'blocked', action: '需人工裁决：修 design / 拆 Boundary / 解依赖后重跑' })),
}
