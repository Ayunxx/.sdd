// SDD 实现阶段的【确定性编排】脚本（由 /sdd:implement 编排器按需调用，无需 ultracode）
//
// 把 /sdd:tasks 的 Waves 编译成确定性多代理流水线：波内并行派 implementer，
// implementer 自报 done + Boundary 守恒闸（越界带反馈打回重试≤2），波间硬屏障，依赖闸。
// 控制流是代码、不是提示词——这就是相对默认"提示词编排"硬化的部分。
//
// 用法：/sdd:implement 编排器判断要走确定性编排时（或用户传 --workflow），先把 tasks.md 解析成 args，再用 Workflow 工具跑本脚本：
//   Workflow({ scriptPath: ".../workflows/sdd-implement.js", args: { featureDir, featureRoot, constitutionPath,
//     waves:[{id,taskIds[]}], tasks:{T1:{id,what,boundary[],depends[],refs,doneWhen,domain,verify,isolation}},
//     // featureRoot = 该 feature 的 worktree 绝对路径（hub 模式代码全落这里；省略则回退 featureDir）；子代理被强制 cd 进去、只在此目录操作。
//     stackPacks:{domain:path}, injectSkills:[] } })
// 返回结构化汇总，交回 /sdd:implement 编排器回填 tasks.md / design.md ## Deviations / 转述 blocked。
//
// 写给真实 Workflow API：顶层脚本 + 全局 agent/parallel/phase/log/args/budget；phase(title) 无回调；
// 输入走 args；agent({schema}) 直接返回校验过的对象；parallel 中抛错的 thunk 解析为 null（不 reject）。
// 禁用时间/随机等不确定性 API。

export const meta = {
  name: 'sdd-implement',
  description: "Run a feature's tasks.md wave-by-wave: parallel implementer per task, deterministic Boundary/dependency gates.",
}

const ImplementerSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'files', 'quality', 'deviation', 'notes'],
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    files: { type: 'array', items: { type: 'string' } },
    quality: {
      type: 'object', additionalProperties: false,
      required: ['format', 'lint', 'typecheck', 'test'],
      properties: { format: { type: 'string' }, lint: { type: 'string' }, typecheck: { type: 'string' }, test: { type: 'string' } },
    },
    deviation: { type: 'string' },
    notes: { type: 'string' },
  },
}

// ---- 确定性纯函数（Boundary 集合运算）----
function normPath(p) { return String(p).replace(/\\/g, '/').replace(/^\.\//, '') }
function isGlobOrDir(p) { return p.includes('*') || p.includes('?') || p.endsWith('/') }
function globToRegExp(pattern) {
  const s = normPath(pattern); let re = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '*') { if (s[i + 1] === '*') { re += '[^]*'; i++; if (s[i + 1] === '/') i++ } else re += '[^/]*' }
    else if (c === '?') re += '[^/]'
    else if ('+.^$()[]{}|\\'.includes(c)) re += '\\' + c
    else re += c
  }
  return new RegExp('^' + re + '$')
}
function withinBoundary(file, boundary) {
  const f = normPath(file)
  for (const pat of (boundary || [])) {
    const p = normPath(pat)
    if (f === p) return true
    if (isGlobOrDir(p) && globToRegExp(p.endsWith('/') ? p + '**' : p).test(f)) return true
    const dir = p.endsWith('/') ? p : p + '/'
    if (f.startsWith(dir)) return true
  }
  return false
}
// 修复评审 suggestion①：两个【具体文件】只比相等，不比父目录（否则同目录兄弟文件被误判重叠、抹掉并行度）；
// 仅当一侧是目录/通配 Boundary 时才判包含关系。
function boundariesOverlap(a, b) {
  for (const pa of (a || []).map(normPath)) {
    for (const pb of (b || []).map(normPath)) {
      if (pa === pb) return true
      if (isGlobOrDir(pa) && withinBoundary(pb, [pa])) return true
      if (isGlobOrDir(pb) && withinBoundary(pa, [pb])) return true
    }
  }
  return false
}
function splitByBoundaryOverlap(taskIds, tasks) {
  const parallelizable = [], serialize = []
  for (const id of taskIds) {
    const conflict = parallelizable.some(pid => boundariesOverlap(tasks[id].boundary, tasks[pid].boundary))
    if (conflict) serialize.push(id); else parallelizable.push(id)
  }
  return { parallelizable, serialize }
}

function implPrompt(t, feedback, ctx) {
  const pack = ctx.stackPacks && ctx.stackPacks[t.domain] ? ctx.stackPacks[t.domain] : '（本领域无能力包，按 constitution §3 默认门禁）'
  const skills = ctx.injectSkills && ctx.injectSkills.length ? ctx.injectSkills.join(', ') : '（无）'
  return [
    '你是 implementer 子代理，只实现【这一个】SDD 任务，先 Grep 复用既有代码、严守 Boundary，按 ImplementerSchema 结构化返回（status/files/quality/deviation/notes）。',
    `工作根 FEATURE_ROOT（唯一可操作目录，绝不碰其它目录尤其主目录）: ${ctx.featureRoot}`,
    '硬规则：所有 shell/门禁命令第一步必须先 `cd` 进上面的 FEATURE_ROOT；只在此目录内读/写/搜索/跑测试；report 的 files 用相对 FEATURE_ROOT 的路径。本任务规格内容已在本 prompt 给全，不要去读主目录的 specs。',
    `功能目录(规格参考,只读): ${ctx.featureDir}`, `宪法: ${ctx.constitutionPath}`,
    `任务 ${t.id}: ${t.what}`,
    `Boundary（唯一可写范围，越界=失败）: ${(t.boundary || []).join(', ')}`,
    `Refs: ${t.refs || '（无）'} · Done when: ${t.doneWhen || '见 Refs'}`,
    `领域能力包 specs/stacks/${t.domain}.md: ${pack}（优先用其 §7 本层门禁，否则 constitution §3）`,
    `注入 skill: ${skills}`,
    t.isolation === 'worktree' ? '隔离: 在独立 worktree 实现，事后由编排器合并。' : '隔离: 当前工作树，绝不碰 Boundary 外文件。',
    '报告前自跑门禁的 format+lint+typecheck+相关 test 并填 quality；任一不过或须偏离 design 则 status=blocked 写清原因。',
    feedback ? `\n## 上一轮被打回（必须修复后再报 done）\n${feedback}` : '',
  ].join('\n')
}

// ---- 主流程 ----
const ctx = {
  featureDir: args.featureDir,
  featureRoot: args.featureRoot || args.featureDir,
  constitutionPath: args.constitutionPath,
  stackPacks: args.stackPacks || {},
  injectSkills: args.injectSkills || [],
}
const waves = args.waves || []
const tasks = args.tasks || {}
const results = {}

// 廉价不变量（评审 suggestion②）：依赖不应指向同波任务，否则解析层漂移会静默吞任务。
for (const w of waves) {
  for (const id of w.taskIds) {
    const sameWave = (tasks[id].depends || []).filter(d => w.taskIds.includes(d))
    if (sameWave.length) log(`⚠️ 解析告警：T${id} 依赖同波任务 ${sameWave.join(',')}（Depends 应落前序波），可能导致误 blocked`)
  }
}

async function runTask(t) {
  try {
    let feedback = null, attempt = 0
    while (true) {
      const impl = await agent(implPrompt(t, feedback, ctx), { schema: ImplementerSchema, label: `impl:${t.id}`, phase: `Wave ${t.waveId}` })
      if (impl.status === 'blocked')
        return { state: 'blocked', reason: (impl.deviation && impl.deviation.trim()) || impl.notes || 'implementer 自报 blocked', files: impl.files, attempts: attempt + 1 }

      const stray = (impl.files || []).filter(f => !withinBoundary(f, t.boundary))
      if (stray.length) {
        if (attempt >= 2) return { state: 'blocked', reason: `反复越界 Boundary：${stray.join(', ')}（仅可改 ${(t.boundary || []).join(', ')}）`, files: impl.files, attempts: attempt + 1 }
        attempt++; feedback = `越界改动 ${stray.join(', ')}，仅可改 ${(t.boundary || []).join(', ')}，请收回 Boundary 内重报。`
        log(`T${t.id} 越界，第${attempt}次返工`); continue
      }

      // implementer 自报 done 且守住 Boundary → 完成（无独立验收子代理；质量靠 implementer 报告前自跑门禁 + 合并门编译改动模块+fitness 兜底）
      return { state: 'done', files: impl.files, deviation: impl.deviation, attempts: attempt + 1 }
    }
  } catch (e) {
    // 评审 blocking②：单任务异常不冒泡毁全 run，转成 blocked
    return { state: 'blocked', reason: 'workflow 执行异常: ' + ((e && e.message) || String(e)), attempts: 0 }
  }
}

for (const wave of waves) {
  phase(`Wave ${wave.id}`)
  // 依赖闸 + blocked 传播（评审 blocking②：用代码保证，不靠提示词）
  const runnable = wave.taskIds.filter(id => (tasks[id].depends || []).every(d => results[d] && results[d].state === 'done'))
  for (const id of wave.taskIds) {
    if (runnable.includes(id)) continue
    const bad = (tasks[id].depends || []).filter(d => !results[d] || results[d].state !== 'done')
    results[id] = { state: 'blocked', reason: `上游未完成/blocked: ${bad.join(', ')}`, attempts: 0 }
    log(`T${id} 依赖未满足，传播 blocked: ${bad.join(', ')}`)
  }
  // Boundary 静态闸：同波重叠降级串行
  const { parallelizable, serialize } = splitByBoundaryOverlap(runnable, tasks)
  if (serialize.length) log(`Wave ${wave.id} Boundary 重叠，降级串行: ${serialize.join(', ')}`)
  // 波内并行（屏障）；parallel 中抛错的 thunk 解析为 null → 兜底成 blocked（评审 blocking②）
  const out = await parallel(parallelizable.map(id => () => runTask({ ...tasks[id], waveId: wave.id })))
  parallelizable.forEach((id, i) => { results[id] = out[i] || { state: 'blocked', reason: 'parallel 返回 null（子代理异常/被跳过）', attempts: 0 } })
  // 串行的少数
  for (const id of serialize) results[id] = await runTask({ ...tasks[id], waveId: wave.id })
}

// 汇总（交回 /sdd:implement 编排器据此回填 tasks.md 状态/Progress、回填 design.md ## Deviations、转述 blocked）
const all = waves.flatMap(w => w.taskIds.map(id => ({ id, ...(results[id] || { state: 'missing' }), what: tasks[id] && tasks[id].what })))
return {
  feature: ctx.featureDir,
  totals: {
    tasks: all.length,
    done: all.filter(i => i.state === 'done').length,
    retriedPass: all.filter(i => i.state === 'done' && i.attempts > 1).length,
    blocked: all.filter(i => i.state === 'blocked').length,
  },
  waves: waves.map(w => ({
    wave: w.id,
    done: w.taskIds.filter(id => results[id] && results[id].state === 'done'),
    blocked: w.taskIds.filter(id => results[id] && results[id].state === 'blocked'),
  })),
  deviations: all.filter(i => i.deviation && i.deviation.trim() && i.deviation.trim() !== '无').map(i => ({ id: i.id, deviation: i.deviation })),
  needsHumanDecision: all.filter(i => i.state === 'blocked').map(i => ({ id: i.id, reason: i.reason || 'blocked', action: '需人工裁决：修 design / 拆 Boundary / 解依赖后重跑' })),
}
