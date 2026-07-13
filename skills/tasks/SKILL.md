---
description: 拆解 / Break design.md into atomic, independently-verifiable tasks with file Boundaries and a parallel Wave plan (tasks.md). 第三阶段：拆任务 + 标注文件领地 + 算出可并发的波次，喂给 /sdd:implement 做隔离并行实现。
argument-hint: "[可选：当前功能目录名，如 001-user-auth；省略则取当前 sdd 分支]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(ls *), Bash(cat *), Bash(git *)
---

# /sdd:tasks — 任务拆解 + 并行波次规划

你的任务：把 `design.md` 拆成**有序、原子、可独立验证**的任务，并为每个任务标注 **Boundary（独占文件领地）** 和 **Depends（依赖）**，最后算出一份 **Waves 并行计划**——让 `/sdd:implement` 能把相互独立的任务派给隔离子代理**并发执行**。

## 用户输入
$ARGUMENTS

## 执行步骤

0. **Feature 身份门禁**：读取当前分支与 `git worktree list --porcelain`。只有当前分支形如 `sdd/NNN-slug`、且当前目录正是该分支登记的 worktree 时才允许写任务；目标目录必须是该分支对应的 `specs/NNN-slug/`。在主 worktree、其他分支、detached HEAD 或显式参数指向别的 feature 时停止并引导进入正确目录。

1. **读上下文**：目标功能的 `design.md` + `requirements.md` + `specs/constitution.md`，以及宪法激活的 `specs/stacks/*.md` **能力包**（目标只取当前分支对应目录）。无 `design.md` 则提示先 `/sdd:plan`。

2. **拆解原则**：
   - **原子**：一个任务一件事，理想情况一次做完并验证。
  - **可验证**：每个任务有明确且可逐条取证的 `Done when`；禁止“代码完成”“测试通过”“功能正常”这类不可独立判定的空标准。
   - **可追溯**：标 `Refs` 指向 design/requirements 的具体章节。
   - **守纪律**：遵守宪法测试纪律（TDD 则"写测试"任务先行）。

3. **【关键】标注 Boundary 与 Depends**（这是并发的基础）：
   - **Boundary** = 该任务**唯一允许写**的文件/目录。粒度尽量不重叠。
   - **语法是硬契约**：无尾斜杠表示**精确文件**（`src/auth/login.ts`）；目录必须写尾斜杠（`src/screens/login/`）或显式 glob（`src/screens/login/**`）。`src/screens/login` 不代表目录，会被审计当成一个精确文件；生成后逐项检查目录 spelling。
   - **优先套用能力包的「Boundary 拆分模式」**：激活的 `specs/stacks/*.md` 第 3 节给出了该领域天然可并行的切分维度（如服务端按端点、小程序按页面、数据库按迁移、全栈按垂直切片）和易冲突的共享文件——照它切分能显著提高可并发度。
   - **Depends** = 必须先完成的任务。
   - **同一 Wave 内的任务，Boundary 必须互不重叠**——否则并发会撞车。若两个任务天然要改同一文件，让它们落到不同 Wave（串行），或合并成一个任务。

4. **算 Waves**：按依赖做拓扑分层——
   - Wave 1 = 没有任何依赖的任务；
   - Wave N = 依赖全部落在前 N-1 波的任务；
   - 同波内再按 Boundary 不重叠校验，重叠的拆到下一波。

5. **写入同目录 `tasks.md`**：

```markdown
# Tasks: <功能名称>

- **Feature ID:** NNN-slug
- **Based on:** design.md
- **Progress:** 0 / N done

## Legend
[ ] 未开始 · [~] 进行中 · [x] 完成 · [!] 阻塞(需人介入)
> `[x]` 只表示 passed：fresh Implementer 已实现、fresh Verifier 已提交验收/门禁证据且未修改工作树。实现期不派逐任务 Reviewer；整个 feature 的独立审查统一在 `/sdd:verify` 执行。

## Tasks
- [ ] **T1** <标题>
  - What: 做什么
  - Boundary: `src/db/schema.sql`（唯一可写范围）
  - Depends: —
  - Refs: design §3 / AC1
  - Risk: high（迁移；不可逆数据风险）
  - Review: feature-final（最终整体审查重点：迁移/回滚/数据兼容）
  - Test policy: persistent（迁移/契约回归；测试文件也必须列入 Boundary）
  - Resources: `db-schema:app`（端口/测试库/缓存/临时目录等独占资源；无则 `[]`）
  - Gate isolation: wave-exclusive（迁移或包级写门禁必须独占 Wave）
  - Done when: 迁移可执行且测试通过

- [ ] **T2** <标题>
  - What: …
  - Boundary: `src/auth/register.ts`, `tests/register.test.ts`
  - Depends: T1
  - Refs: design §4 / AC1
  - Risk: high（鉴权/公共 API）
  - Review: feature-final（最终整体审查重点：鉴权/公共 API）
  - Test policy: persistent（鉴权/公共 API）
  - Resources: `port:4173`, `test-db:auth-t2`
  - Gate isolation: scoped（Verifier 只运行本任务 Boundary 的非写入检查；禁止 `--write`/`--fix`）
  - Done when: …

## Waves / 并行计划
> 同一 Wave 内任务相互无依赖且 Boundary 不重叠 → /sdd:implement 会并发派发。
- **Wave 1**（并行）: T1, T3      — 无依赖，Boundary 不重叠
- **Wave 2**（并行）: T2, T4      — 依赖 Wave 1
- **Wave 3**: T5                 — 依赖 T2

## Traceability check / 覆盖核对
| Requirement (AC) | Task(s) |
|------------------|---------|
| AC1 | T1, T2 |

## Implementation Evidence / 实现证据（由 /sdd:implement 当场追加）
| Task/Wave | Transition / Verdict | Baseline | Actual diff | Acceptance | Gates |
|-----------|----------------------|----------|-------------|------------|-------|
```

5b. **自动对齐自检 + 反压自修（任务层把关，默认开）**：tasks.md 写完后，对照 design/requirements 做一遍**覆盖与对齐自检**（即 `/sdd:analyze` 的 design↔tasks 部分），按 `/sdd:specify` 的「## 规格反压评审协议」精神处理：
   - **覆盖**：每条 AC / 每个 design 元素是否都有任务承接？**有缺口 = blocking** → 补任务，再自检（最多 2 轮）。
   - **不越界**：有没有任务做了 design 之外的事（范围蔓延）？标出来。
   - **Boundary/资源健全**：先验证 Boundary 语法（精确文件无尾斜，目录必须 `dir/` 或 `dir/**`），再确认同一 Wave 内 Boundary 与 `Resources` 均不得重叠；使用 `Gate isolation: wave-exclusive` 的任务必须独占 Wave。端口、测试库/schema、缓存、临时目录、浏览器 profile 等共享状态须按 task 唯一命名；做不到就重切/串行。
   - **证据落点**：必须保留空的 `## Implementation Evidence` 固定表头，持久化双角色状态流转、实现/核对快照、Done when/AC 与门禁。Feature Reviewer verdict 由 `/sdd:verify` 统一写入 `COMPLETION.md`，不在每任务重复记录。
   - 2 轮仍有覆盖缺口 → 停下报用户（可能是 design 本身缺，需回 `/sdd:plan`）。**意图红线**：只补"漏拆的任务/修边界"，不擅自加 design 没有的功能范围。
   - 更深的跨产物一致性（含已有代码）由独立的 `/sdd:analyze` 兜底——本步是生成即查的轻量前哨。

6. **完成后**：
   - 报告任务总数与 Wave 数，并给**并行度指标 = 任务数 / Wave 数**（越高越并行；接近 1 说明几乎串行，需按下方技巧重切）。
   - 报告**对齐自检结果**（覆盖缺口/越界/Boundary 问题 + 自修了什么）。
   - 提示下一步：`/sdd:implement`（默认按波次并行跑），或 `/sdd:implement T1` 指定任务。

## 最大化并行度（拆分技巧 — 提效核心）
> 理论最短耗时 = **Wave 数（关键路径深度）**，不是任务数。目标：**波尽量少、每波尽量宽**。
1. **一文件一主人**：每个任务 Boundary 互不重叠，两任务别写同一文件 → 同波可并行。
2. **拆共享热点**（并行头号杀手：路由表 / `app.json` / store 入口 / 上帝 service）：
   - 拆成 per-feature 模块（`register.service` + `login.service`，而非一个 `auth.service`）；
   - 或追加式（各任务加自己的模块文件，**最后一个串行"接线"任务**统一注册/聚合）。
3. **契约先行、扇出在后**：先一个任务定类型/接口/契约（地基），之后只依赖契约的任务全进**同一宽波**并行。避免 `A→B→C→D` 长链(=4 波)，改成 `地基 → [B,C,D,E]` 一波扇出。
4. **每个任务显式标风险、评审与测试策略**：
   - `Risk: high|medium|low（理由）`；鉴权/安全、公共契约、迁移、状态机/领域不变量、并发事务、共享核心、不可逆操作或跨模块热点一律 high。
   - `Review: feature-final（<关注点>）`：只标记该任务在功能最终整体审查中的风险关注点，**不是实现期派发指令**。`/sdd:implement` 不为单任务派 Reviewer；所有任务完成后由 `/sdd:verify` 对完整 feature diff 只派一次 fresh `code-reviewer`。旧规格的 `Review: required` 按同义兼容。
   - `Test policy: persistent|ephemeral|none(<理由>)`。
   - 历史 Bug、公共契约、鉴权安全、状态机/不变量、迁移、并发事务、共享核心能力 → 必须 `persistent`，并把测试文件加入 Boundary。
   - 探索、一次性诊断、硬件/外部环境探针 → 可 `ephemeral`，但要记录命令证据。
   - 纯文档/注释才可 `none`。测试通常随实现任务一起做；只有 TDD 契约先行或共享测试基座时才拆成独立任务。
   - 测试相称且复用优先：小改写少量聚焦用例，优先扩展既有测试，不为每条 AC 新建一个测试类，也不删除高价值回归。
   - `Resources: []|<资源标识...>` 必须列出会独占/写入的端口、测试数据库/schema、缓存、临时目录、模拟器/浏览器 profile；同 Wave 标识不得重复。
   - `Gate isolation: scoped|wave-exclusive`：worker 只可对 Boundary/实际 changed files 运行写入型 formatter/fixer；必须扫写整个 package/repo 的 gate 标 `wave-exclusive` 并独占 Wave，或移到 Wave 完成后的串行 checkpoint barrier。
5. **全栈用垂直切片**：一个功能的 db/api/ui 各为独立 Boundary 任务，跨层并行。
6. **照能力包的 Boundary 模式切**：server 按端点、前端按页面/组件、db 按迁移——天然不重叠的缝。
7. **宽而浅 > 窄而深**：宁可一波多任务，别多波单任务。
> 自检：若大多任务挤在一条串行长链 → 回头按 2/3 拆热点、提契约，把链压成扇出。

## 纪律
- ❌ 不写实现代码。
- ✅ Boundary 宁可拆细，让更多任务能进同一波并行——这是提速的关键。
- ✅ 拆完即**停**，等用户审阅。
