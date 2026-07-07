export const meta = {
  name: 'sdd-implement',
  description: 'SDD wave-by-wave implement: parallel implementer per task, with Boundary/dependency gates',
  phases: [
    { title: 'implement', detail: 'per-wave: parallel implementer subagents' },
  ],
}

// 通用·确定性合规（无取时间/随机数 API）。
// 优先用 Workflow 工具传入的全局 args；该通道在本环境取不到时回退到下方 INLINE 配置。
const INLINE = {
  featureRoot: 'C:\\Users\\yun\\Desktop\\code\\brar-code--051-member-catalog-cend-readonly',
  featureDir: 'specs/051-member-catalog-cend-readonly',
  apiDir: 'brar-api',
  designPath: 'specs/051-member-catalog-cend-readonly/design.md',
  requirementsPath: 'specs/051-member-catalog-cend-readonly/requirements.md',
  constitutionPath: 'specs/constitution.md',
  stackPackPath: 'specs/stacks/brar-api.md',
  injectSkills: [],
  waves: [
    { id: 'W1', taskIds: ['T1'] },
    { id: 'W2', taskIds: ['T2'] },
  ],
  tasks: {
    T1: {
      id: 'T1',
      title: 'MemberCatalogReadService（三目录读 + jsonb 解析）+ 三只读 VO + 单测',
      anchor: '### T1 — MemberCatalogReadService（三目录读 + jsonb 解析）+ 三只读 VO + 单测',
      domain: 'brar-api',
      boundary: [
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/application/read/MemberCatalogReadService.java（新建）',
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/application/read/SubscriptionPlanCatalogView.java（新建）',
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/application/read/SubscriptionAddonCatalogView.java（新建）',
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/application/read/LevelCatalogView.java（新建）',
        'brar-api/brar-platform/brar-member/src/test/java/com/brar/member/application/read/MemberCatalogReadServiceTest.java（新建·jsonb parse 纯逻辑单测）',
      ],
    },
    T2: {
      id: 'T2',
      title: 'MemberCatalogController（薄·不取主体）+ MemberCatalogPublicPaths（匿名放行）+ 真库 IT',
      anchor: '### T2 — MemberCatalogController（薄·不取主体）+ MemberCatalogPublicPaths（匿名放行）+ 真库 IT',
      domain: 'brar-api',
      boundary: [
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/rest/app/MemberCatalogController.java（新建）',
        'brar-api/brar-platform/brar-member/src/main/java/com/brar/member/rest/app/MemberCatalogPublicPaths.java（新建·PublicPathContributor SPI 实现）',
        'brar-api/brar-platform/brar-member/src/test/java/com/brar/member/rest/app/MemberCatalogEndpointsIntegrationTest.java（新建·Testcontainers PG·覆盖全 AC）',
      ],
    },
  },
}

const cfg = (typeof args !== 'undefined' && args && args.waves) ? args : INLINE

const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    changedFiles: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    deviation: { type: 'string' },
    notes: { type: 'string' },
    gateResults: { type: 'string' },
  },
  required: ['status', 'changedFiles', 'summary', 'deviation', 'notes', 'gateResults'],
}

const apiDir = cfg.apiDir || ''
const skills = (cfg.injectSkills && cfg.injectSkills.length) ? cfg.injectSkills.join(', ') : '[暂无]'

function specBlock(task) {
  return `权威规格（自行 Read 相关切片，勿臆造）：
- 任务计划：${cfg.featureDir}/tasks.md —— 精读本任务小节：「${task.anchor}」
- 设计 design：${cfg.designPath}
- 需求 requirements：${cfg.requirementsPath}
- 宪法 constitution：${cfg.constitutionPath}
- 领域能力包（含 §7 门禁 / §8 分层）：${cfg.stackPackPath}
- 需注入调用的 skill：${skills}`
}

function implPrompt(task) {
  return `你是 SDD implementer 子代理，实现【单个】任务 ${task.id}（${task.title}）。只回结构化摘要，不与用户对话。

== 工作根（强制）==
FEATURE_ROOT = ${cfg.featureRoot}
第一步先 cd 进该目录。所有读/写/搜索/门禁命令都只在此目录内执行；report 的 changedFiles 用相对 FEATURE_ROOT 的路径。${apiDir ? `所有 maven 门禁命令在 ${apiDir}/ 子目录内执行。` : ''}

== 规格 ==
${specBlock(task)}
Read tasks.md 并精读该小节（含 Boundary / Depends / 实现要点 / Done-when / 测试 / 可追溯）。

== 边界（精确·不重叠·只动这些文件，全为新建）==
${task.boundary.map((b) => '  - ' + b).join('\n')}
严禁改既有类 / 端点 / 写侧 / 状态机 / 既有 VO / 聚合 pom / brar-events / brar-boot 装配 / SaTokenConfig / 任何迁移 SQL。需要既有符号就只读引用。

== 纪律 ==
- 先 Grep 复用既有同包范式（参照任务块点名的既有类，如 MemberLevelReadService / RedemptionReadService / MemberLoginPublicPaths / MemberReadEndpointsIntegrationTest）再写，沿用既有命名/分层，不造轮子。
- 按宪法与能力包 §3/§8：record 作 VO、@RequiredArgsConstructor 注入、@Slf4j 日志、APT TableDef 常量禁硬编码列名、中文克制注释、公共 VO 契约面中文 Javadoc。
- 跑通本任务门禁：spotless:check + 编译 + 相关 test（既有套件不得报红）。把命令与结果填进 gateResults。
== 回报 ==
status: done=已完成且门禁过；blocked=必须偏离 design 才能完成（在 notes 说明原因，不要擅自偏离实现）。
changedFiles: 相对 FEATURE_ROOT 的改动文件清单。
deviation: 与 design 的实现偏移（无则填「无」）。
notes: 延后/范围建议或 blocked 原因（无则填「无」）。`
}

const results = {}
let stopped = false

for (const wave of cfg.waves) {
  if (stopped) break
  phase('implement')
  log(`Wave ${wave.id} 开始：任务 ${wave.taskIds.join(', ')}`)

  const waveResults = await parallel(
    wave.taskIds.map((tid) => async () => {
      const task = cfg.tasks[tid]
      // implementer 自报 done 即完成（无独立验收子代理）；质量靠 implementer 报告前自跑门禁 + 合并门编译改动模块+fitness 兜底。
      const impl = await agent(implPrompt(task), {
        label: `impl:${tid}`,
        phase: 'implement',
        schema: IMPL_SCHEMA,
        agentType: 'sdd:implementer',
      })
      if (!impl) {
        return { tid, state: 'error', detail: 'implementer 子代理无返回', attempts: 1 }
      }
      if (impl.status === 'blocked') {
        return { tid, state: 'blocked', impl, detail: impl.notes, attempts: 1 }
      }
      return { tid, state: 'pass', impl, attempts: 1 }
    })
  )

  let waveOk = true
  for (const r of waveResults) {
    const key = r && r.tid ? r.tid : 'unknown'
    results[key] = r
    if (!r || r.state !== 'pass') waveOk = false
  }
  if (!waveOk) {
    stopped = true
    log(`Wave ${wave.id} 有任务未完成（blocked/error）—— 停止依赖它的下游波次`)
  }
}

return results
