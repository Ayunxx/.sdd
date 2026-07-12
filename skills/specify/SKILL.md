---
description: 规格 / Turn a one-line feature idea into a structured requirements.md (WHAT & WHY only). 第一阶段：生成需求规格，含用户故事与验收标准，不做设计、不写代码。支持 --lite 轻量分级。
argument-hint: "<一句话功能描述> [--lite 小功能走单文件精简路径]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(ls *), Bash(cat *), Bash(git *), Task
---

# /sdd:specify — 需求规格

你的任务：把用户的一句话功能想法，收敛成一份结构化的 `requirements.md`。本阶段**只回答"做什么 / 为谁 / 怎样算做对"，绝不涉及"怎么做"**。

## 用户输入
$ARGUMENTS

## 执行步骤

0. **先判分级（防止小事过度规格化）**：
   - **Trivial**（单文件改 / 格式 / 一目了然的小改）→ 建议**直接跳过 SDD**，对话里做掉即可，不必建规格。**但有安全闸**：若它**碰到共享/跨模块代码**（公共工具、共享类型/模型、路由/入口、被多处依赖的核心）——改一行也可能炸别人——**别走 trivial 直跑，升级到至少 lite、经合并门进 main**。"小"是文件数小，不是风险小。
   - **Small**（1–3 文件、单一明确、无需多轮澄清）→ 走 **`--lite`**：只产**一份 `spec.md`**（需求要点+简要设计+任务三合一），跳过独立的 clarify/plan/tasks 文档阶段，直接 `/sdd:implement`，完成后仍跑一次与改动范围相称的 `/sdd:verify`。
   - **Normal/Large**（多文件、有不确定性、需设计）→ 走完整流程（本命令默认）。
   - 用户带了 `--lite`、或你判断属 Small → 进 lite 分支（见步骤 4b）。**修改一个已上线/已归档的功能**：不要回去重写老规格——**新建一个小规格记录这次变更（delta）**（规格是决策记录，合并后冻结）。
   - **delta 必须标源（关键，否则归档时归不回源）**：识别出本规格是 delta 时，在它的头部写 **`Delta-of: MMM-target-slug`**（被修改的目标功能 ID，到 `specs/` 或 `specs/archive/` 里找）。delta **优先走 `--lite`**。这条标记是 `/sdd:worktree finish` 把 delta **物理归档进源目录** `specs/archive/MMM-target/deltas/` 的唯一依据——漏标 = 又散落成孤立 NNN。
   - **delta 测试要克制但不能丢回归**：只为本次新增/改变的行为补聚焦用例，优先复用源功能现有 harness。若修 Bug、改变公共契约/鉴权/状态机/迁移等高风险行为，新增测试必须持久化；纯探索证据才允许临时删除（§4）。

1. **读约束**：先读 `specs/constitution.md`（若存在）。需求不得违背宪法。若不存在，提示用户最好先 `/sdd:constitution`，但仍可继续。

2. **确认 Feature 身份（硬门禁）+ 检查交叉**：
   - 读取 `git rev-parse --abbrev-ref HEAD` 与 `git worktree list --porcelain`。只有同时满足以下两项才允许写规格：① 当前分支形如 `sdd/NNN-slug`；② 当前目录正是该分支登记的 worktree。此时 **Feature ID 直接复用分支的 `NNN-slug`**，目录固定为 `specs/NNN-slug/`，不得重新扫号或改 slug。
   - **若当前在 main/master/base 主 worktree**：不得在主干直接分配编号、创建 `specs/NNN-slug/` 或继续生成规格。先按 `/sdd:worktree start <slug>` 的协议原子创建 `sdd/NNN-slug` 分支及其独立 worktree，然后停下并报告其绝对路径；请用户进入该目录重新运行 `/sdd:specify <原想法>`。运行中的会话不得假装已经切换 cwd 后继续写。
   - **若当前是其他分支、detached HEAD，或分支与登记目录不匹配**：停止写入，说明 Feature 身份不合法，引导迁移/重建为标准 `sdd/NNN-slug` worktree；不得猜测目标目录。
   - **旧版 split-brain 迁移闸**：如果主分支已有 `specs/NNN-slug/`、但对应 Feature Worktree 中没有，先按 `/sdd:worktree` 的迁移协议把规格与相关历史转移到 feature 分支并核对，迁移完成前不得继续 specify/implement。规格、代码、任务进度与验证证据必须从第一行起同处一个 Feature Worktree。
   - 编号只由 `/sdd:worktree start` 分配：它把规格/归档/delta/分支/worktree 与永久 `refs/sdd/feature-ids/NNN` reservation 取并集，并以 expected-absent CAS 原子保留纯 NNN；不同 slug 也不能共享编号。`/sdd:specify` **只消费已分配的 Feature 身份**，不再拥有第二套编号算法。
   - **扫一眼已有 feature 是否与本功能交叉**（共享 model/类型/契约/热点文件）。若有明显共享底座，**建议先抽一个 foundation feature（如 `000-shared-<thing>`）落 main，再做本功能**（见 `/sdd:worktree` 跨 feature 协调），并在下方 `## 11 Dependencies` 记录依赖。
   - **回捞待补齐（必做）**：扫描 `specs/backlog/BL-*.md` 的 canonical items，并兼容读取旧 `specs/BACKLOG.md` 条目；挑出与本功能相关或 Target 指向本次的 open 项，主动问是否纳入。纳入后在规格转成正式 US/AC，并只编辑对应 item 为 `Status: scheduled`、`Scheduled-in: NNN-slug`。同 ID 多文件、owner ref 不匹配或跨 ref 内容冲突先报错，不得猜。没有相关项就跳过。

3. **充分发现（高质量的前提）**：把输入扩成完整需求前，**主动按维度过一遍**，缺一个维度规格就缺一块——
   - **角色与权限**：谁用？什么权限/身份下？
   - **数据**：关键实体的字段、校验规则、唯一性、必填、格式/长度上限。
   - **状态与生命周期**：实体有哪些状态、如何流转。
   - **happy path + 边界 + 错误**：正常流、空/超限/并发/网络失败/权限不足时怎样。
   - **非功能**：性能目标、并发量级、安全/合规、可用性。
   - **依赖与集成**：第三方、外部系统、其他 feature 的契约。
   - **成功度量**：怎样算这功能成功（可量化）。
   **模糊或缺失处不要替用户臆断**——用 `[NEEDS CLARIFICATION: 具体问题]` 行内标记，留给 `/sdd:clarify`。

4. **写入 `specs/NNN-slug/requirements.md`**，使用以下结构：

```markdown
# Requirements: <功能名称>

- **Feature ID:** NNN-slug
- **Status:** Draft
- **Created:** [日期]
- **Delta-of:** [仅 delta 填：被修改的目标功能 ID，如 003-user-auth；非 delta 删掉此行]

## 1. Problem & Context / 问题与背景
> 先讲问题，别上来就讲方案（PRD 最佳实践）。
- **问题**：当前谁、在什么场景下、遇到什么痛点？
- **为谁**：目标用户/角色（personas）。
- **为何现在 / 证据**：为什么值得做（数据/反馈/业务驱动，有就附）。

## 2. Goals & Non-Goals / 目标与非目标
**Goals:**
- G1: …
**Non-Goals（明确不做，划清边界）:**
- NG1: …

## 3. User Stories / 用户故事（带优先级）
> 每个故事标优先级、为何此优先级、且应能**独立交付价值**（先跑 MVP）。
- **US1 (P1):** 作为 <角色>，我想要 <能力>，以便 <价值>。
  - _为何 P1：<理由>_ · _独立交付：<如何单独验证它有价值>_
- **US2 (P2):** …

## 4. Acceptance Criteria / 验收标准
> 可测试、无歧义，每条挂到某个 US。两种写法择一或混用：
> - **EARS**（按场景选模板）：`WHEN <触发>, THE SYSTEM SHALL <行为>` · `IF <异常>, THEN THE SYSTEM SHALL <行为>` · `WHILE <持续状态>, THE SYSTEM SHALL <行为>` · `WHERE <某配置存在>, THE SYSTEM SHALL <行为>` · 无条件普遍约束直接 `THE SYSTEM SHALL <行为>`
> - **Given-When-Then**：`Given <前置>, When <动作>, Then <结果>`
> **每条 AC 必须标验证方法 `Verify:`** — `auto`(CI 测试) · `sim`(仿真) · `manual-HW`(人工/硬件，出证据清单)；有阈值加 `· 标准: <值>`。
- **AC1** (US1): WHEN …, THE SYSTEM SHALL …. · Verify: auto · 标准: <如有>
- **AC2** (US1): Given …, When …, Then …. · Verify: manual-HW · 标准: ≤50ms

## 5. Success Criteria / 成功标准（可度量、技术无关）
> 不提实现，只给**可量化**结果，用于客观验收。
- **SC1:** <如 注册请求 p95 < 500ms>
- **SC2:** <如 密码 100% 哈希存储；核心流程成功率 ≥ 99%>

## 6. Key Entities / 关键实体（数据类功能填，否则写"无"）
> 只列"是什么"，不写 schema/类型（那是 design 的事）。实体 + 关键属性 + 关系。
- **<实体>**: 关键属性（如 唯一性/必填的语义层面），与其他实体的关系。

## 7. Assumptions / 假设前提
> 我们**默认成立但未必有保证**的前提（与约束不同）。
- 如：用户有网络；上游 X 接口已就绪；单服务部署。

## 8. Edge Cases & Errors / 边界与错误场景
- 空输入 / 并发 / 超限 / 网络失败 / 权限不足 / 异常状态……

## 9. Constraints (incl. Non-Functional) / 约束（含非功能）
- 性能、安全、合规、兼容性、可用性等硬性限制（来自宪法或业务）。

## 10. Open Questions / 待澄清
- [NEEDS CLARIFICATION: …]

## 11. Dependencies / 跨功能依赖（如有则填，否则写"无"）
- 依赖/共享：<如 依赖 000-shared-user；与 002-profile 共享 User 模型>
```

4b. **lite 模式**（`--lite` 或判定为 Small）：**不**产 requirements/design/tasks 三件套，只写一份 `specs/NNN-slug/spec.md`：

```markdown
# Spec (lite): <功能名称>
- **Feature ID:** NNN-slug · **Status:** Draft · **Mode:** lite
- **Progress:** 0 / N done
- **Delta-of:** [仅 delta 填：被修改的目标功能 ID，如 003-user-auth；非 delta 删掉此行]

## What & Done / 目标与验收
- 做什么（1–2 句） + 关键 AC（可测试/可度量） + 边界

## How / 简要设计
- 技术要点、文件布局、接口/数据（几行，遵循激活的能力包约定）

## Tasks（含 Boundary + 简单 Waves）
- Boundary 语法：精确文件写 `src/a.ts`；目录必须写 `src/screens/login/` 或 `src/screens/login/**`。无尾斜的 `src/screens/login` 会被当成精确文件，不得用来表示目录。
- [ ] **T1** <标题> · Boundary: `<精确文件或带 / 的目录>` · Depends: — · Risk: low|medium|high(<理由>) · Review: required（每任务 fresh Reviewer） · Test policy: persistent|ephemeral|none(<理由>) · Resources: `[]`|`port:...`|`test-db:...` · Gate isolation: scoped|wave-exclusive · Done when: <判据>
- [ ] **T2** … · Boundary: … · Depends: T1 · Risk: … · Review: … · Test policy: … · Resources: … · Gate isolation: … · Done when: …
- Waves: W1(并行) T1,T?；W2 T2 …

## Implementation Evidence / 实现证据（由 /sdd:implement 当场追加）
| Task/Wave | State/Verdict | Baseline | Actual diff | Gates | Reviewer / Residual risk |
|-----------|---------------|----------|-------------|-------|--------------------------|

## Quality / 质量门禁
- 遵循 constitution §3/§4：format/lint/typecheck/test 给出命令与退出码证据；高风险/偏移/共享边界任务独立 review；合并门跑编译 + fitness + 受影响持久测试
```
> lite 若没有 `[NEEDS CLARIFICATION]`，完成后直接 `/sdd:implement`（它会从 spec.md 的 `## Tasks` 段取任务），无需 plan/tasks；若轻量评审留下歧义，先跑 `/sdd:clarify`，它会直接回填 spec.md。实现完成后仍跑 scoped `/sdd:verify` 生成证据与 COMPLETION。功能若中途变复杂，再“升级”为完整三件套。
> ⚠️ **lite 省的是规格阶段，不是合并门**：lite 一样会 merge 进 main → 一样能改坏别的功能 → **合并时照走 `/sdd:worktree finish` 的合并门**（凡入 main 必走，不按功能大小豁免）。别担心慢——合并门成本随改动范围由 build-cache 自动伸缩，lite 只动一两个模块、门只重跑那点、很便宜。唯一近乎免门的是**纯非代码改动**（docs/注释/无测试覆盖的配置），那种情况门本身就没东西可跑。

5. **质量自检（写完必做，逐项对照下方 Rubric）**：把刚写的规格对照 `## 质量自检清单` 逐条打勾；**任一不过 → 当场补/改或标 `[NEEDS CLARIFICATION]`**，别把不达标的规格交出去。lite 还必须检查固定 `Progress: 0 / N done`、每任务 `Boundary/Depends/Risk/Review/Test policy/Resources/Gate isolation/Done when`、Waves 与空的 `Implementation Evidence` 表头都存在；Boundary 中目录均以 `/` 或 `/**` 结尾，同 Wave 的 Boundary/Resources 不重叠且 `wave-exclusive` 任务独占 Wave。报告自检结果（X/N 项通过 + 未过项）。

5b. **自动评审 + 反压自修（规格层把关，默认开，别跳过）**：用 `Task` 派 **`spec-reviewer`** 子代理（独立干净上下文），显式传 `MODE=full|lite` 与 `SPEC_SOURCE=requirements.md|spec.md`，按下方协议处理 Verdict。
   - **full 模式**：完整反压——**歧义/需定夺类 blocking 转 `[NEEDS CLARIFICATION]` 走 `/sdd:clarify` 问用户（消歧优先）**，机械类 blocking 自修→再评（最多 2 轮）。
   - **lite 模式**：对 `spec.md` 跑**一轮**轻量评审（只报 Verdict + blocking，不自动多轮——lite 保持轻量）；有歧义同样转 `[NEEDS CLARIFICATION]` 提醒用户先消歧。

6. **完成后**：
   - 报告文件路径、模式（full / lite）、**质量自检结果 + 评审 Verdict**（🟢/🟡/🔴 + 自修了什么 + 残留问题）。
   - full：列出 `[NEEDS CLARIFICATION]` 数量；提示下一步（有待澄清 → `/sdd:clarify`，否则 → `/sdd:plan`）。
   - lite：有 `[NEEDS CLARIFICATION]` 就提示 `/sdd:clarify`；否则提示可直接 `/sdd:implement`，完成后跑 scoped `/sdd:verify`。

## 规格反压评审协议 / Spec Bounce-back Review（specify·plan·tasks·auto 共用）
> 把"文档生成 → 自动评审 → 按需自修 → 再评审"做成默认 bounce-back 机制，对齐不再靠人记得手动派。
1. **派评审**：用 `Task` 派对应评审 agent（requirements→`spec-reviewer`；design→`design-critic`），或对 tasks 跑覆盖自检（见 /sdd:tasks）。评审 agent 只读、回结构化 Verdict（🟢 Ready/Sound · 🟡 Minor · 🔴 Needs rework）+ blocking/should-fix 清单。
2. **按 Verdict 处理——先把 blocking 分两类（关键）**：
   - **🟢** → 通过，报 Verdict 即可。
   - **🟡** → 把**清晰、安全的** should-fix 当场改掉，其余记下，**不为 🟡 反复循环**，proceed。
   - **🔴** → 把 blocking **分两类**走不同路：
     - **(a) 歧义 / 需用户定夺**（模糊措辞、未定阈值、"X 时该怎样"这类**产品/意图决策**）→ **绝不自己猜值自修**（猜歧义 = 制造意图偏移）。把每条转成 `[NEEDS CLARIFICATION: 具体问题]` 标记，**先走 `/sdd:clarify` 问用户**消歧、把答案回填，再继续。**消歧优先于自修。**
     - **(b) 可机械修正**（措辞不可测但有明确可测写法、漏掉的明显边界/错误路径 AC、可追溯缺口、违宪的格式问题）→ 自修文档 → **重新派评审**。最多 **2 轮**；2 轮仍 🔴 → 停止循环，原样报用户。
3. **意图红线（关键，防自修把规格改偏）**：自修**只动"怎么把它说清楚/说完整"**（即上面的 (b) 类），**绝不擅自改"做什么"**——凡涉及 Goals/范围/功能意图/未定阈值的（(a) 类），**一律不自修**：能问就走 `/sdd:clarify`，不能问就标出来交用户拍板。评审是质量把关，不是替用户重新定义需求。
4. **留痕**：最终 Verdict、自修摘要、转出的 `[NEEDS CLARIFICATION]` 都在完成报告里说明；auto 流程中折进对应 🚦 卡点（歧义类会在 CLARIFY 阶段被消化）。

## 质量自检清单 / Spec Quality Rubric
> 一份"高质量功能说明清单"必须全过。这是规格层的"门禁"——质量靠清单，不靠手感。
> （为何较真：业界数据，**60–80% 的开发成本花在返工，而好需求能消除 50–80% 的缺陷**——源头省的，下游加倍还。）
1. **问题导向**：先讲问题/为谁/为何现在（最好有证据），不是上来就讲方案。
2. **完整性**：happy path + 边界/异常 + 错误处理 + 非功能(性能/安全/合规) + 依赖/集成 都覆盖。
3. **可测试**：每条 AC 无歧义、能写成通过/失败的测试；无"快/友好/适当/尽量"等模糊词。
4. **可度量**：Success Criteria 量化且技术无关（如 p95<500ms、成功率≥99%）。
5. **正确海拔**：只说 WHAT/WHY，**没漏进 HOW**（架构/库/数据结构）。
6. **优先级清晰**：用户故事标 P1/P2/P3 + 为何此优先级，P1 = 可独立上线的最小价值。
7. **角色明确**：每个能力说清"谁、在什么权限下"用。
8. **数据明确**：关键实体 + 关键属性/唯一性/必填讲清（数据类功能；或标待澄清）。
9. **状态明确**：实体有状态流转的，列清状态与流转。
10. **假设显式**：默认成立但无保证的前提都写进 Assumptions，不藏着。
11. **有示例**：关键 AC 至少配一个 Given-When-Then 具体例子，消歧。
12. **可追溯**：每条 AC 挂到某个 US；每个 US 都有 AC。
13. **无悬空未决**：不确定项都显式标成 `[NEEDS CLARIFICATION]`，不臆断。

## 纪律
- ✅ **按本命令的 SDD 模板由你直接产出**，不要转交其他插件/框架的 skill（如 Superpowers）来写——模板与门禁不同会破坏结构。
- ❌ 不写任何技术方案、架构、库选型、数据结构——那是 `/sdd:plan` 的事。
- ❌ 不写代码。
- ✅ 验收标准必须可测试；Success Criteria 必须**可度量且不含实现细节**。写不出来，说明需求没想清，标 `[NEEDS CLARIFICATION]`。
- ✅ 用户故事按 P1/P2/P3 排序，P1 应能独立构成可上线的最小价值。
- 写完即**停**，等用户审阅。
