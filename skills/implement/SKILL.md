---
description: 实现（编排器）/ Orchestrate task implementation wave-by-wave with isolated implementers, evidence-backed gates, independent risk-based code review, and fail-closed Boundary reconciliation.
argument-hint: "[省略=按波次跑全部 / 'next'=下一波 / 'T1 T2'=指定任务 / 'wave 2'=指定波 / '--workflow'=强制走确定性 Workflow 编排]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, Workflow
---

# /sdd:implement — 编排器（隔离 · 并发）

你是**编排器（Coordinator）**，不亲自写功能代码。你读任务计划，把每个任务派给一个**全新隔离上下文的 implementer 子代理**去实现；其 `done` 只表示“实现者自检完成”，还必须通过适用的独立评审才可成为任务完成。两大机制由你统一调度：

- **上下文隔离**（防偏移）：每任务一个 fresh implementer，只喂它本任务相关的 spec 切片——避免长会话上下文退化导致跑偏。
- **波次并发**：同一 Wave 内、Boundary 不重叠的任务，**在一条消息里并行派发多个 implementer 子代理**。

> 质量由四层共同兜底：**implementer 报告前自跑门禁** + **基于真实 Git diff 的独立 `code-reviewer` 风险评审/波次抽样** + **合并门** + 功能级 **`/sdd:verify`**。implementer 的 `done` 只是“待评审完成”，命中评审策略的任务只有 reviewer `PASS` 后才能标 `[x]`。

## 用户输入
$ARGUMENTS

## 单一工作根前置闸（FEATURE_ROOT）
**本命令只在目标 Feature Worktree 内运行。** 规格、代码、任务进度、门禁输出与验证证据必须处于同一个 `sdd/NNN-slug` 分支，禁止从主 worktree 远程驱动实现。

1. 读取当前分支、仓库根与 `git worktree list --porcelain`：
   - **当前分支为 `sdd/NNN-slug`，且当前目录是该分支登记的 worktree** → `FEATURE_ROOT = 当前仓库根`、`FEATURE_DIR = FEATURE_ROOT/specs/NNN-slug`，继续。
   - **当前在 main/master/base 主 worktree** → **拒绝实现，不自动创建 worktree，也不使用 `git worktree add -b`**。若目标已有 worktree，报告其绝对路径并引导用户在该目录重新运行 `/sdd:implement`；若只有旧版 `sdd/NNN-slug` 占号分支，先用 `/sdd:worktree start NNN-slug` 将已有分支附着为 worktree；若两者都没有，先创建 Feature Worktree 并在其中完成 specify→tasks。
   - 其它非标准分支或 detached HEAD → 拒绝并提示迁移到标准 `sdd/NNN-slug` worktree，**不擅自猜目标**。
2. **完整性检查**：`FEATURE_DIR` 必须存在，且 full 模式含 `requirements.md`、`design.md`、`tasks.md`，lite 模式含 `spec.md`。若规格只存在于主 worktree、当前 Feature Worktree 不存在，判为旧版 split-brain，暂停并按 `/sdd:worktree` 的迁移协议转移/核对，禁止跨工作树读取主干规格继续实现。
3. 后续所有规格读取、状态回填、代码读写、搜索、门禁和提交都以 `FEATURE_ROOT` 为唯一锚点；子代理收到的规格路径也必须位于 `FEATURE_ROOT`。**不得在主 worktree 留第二份规格或任务状态。**

## 独立代码评审门（完成状态的硬条件）

1. **先建立可复核基线**：每个 Wave 开始前记录 `HEAD` ref、`git status --porcelain`、已存在 diff/untracked 清单；最好先提交已批准的规格和前序 Wave，使本 Wave 从干净基线开始。若无法得到可区分本任务变化的基线，reviewer 必须返回 `INCONCLUSIVE`，任务不能完成。
2. **必须逐任务评审**：任务 `Risk: high`、`Review: required`、implementer 报告任何 `DEVIATION`，或实际 diff 触及共享边界/公共契约/跨模块热点时，必须在标 `[x]` 前派全新独立 `code-reviewer`。
3. **Wave 抽样下限**：除上述必审任务外，每个 Wave 至少从实际有 diff 的任务中抽 1 个派 `code-reviewer`；优先选择风险较高、改动面较大或证据较弱者。若 Wave 只有一个有 diff 的任务，就审它。已命中必审的任务可计入该 Wave 抽样下限。
4. **评审输入不得只靠自报**：传 Feature Worktree 绝对路径、基线 ref/快照、任务完整块（Boundary/Done when/Refs/AC/Risk/Review/Test policy）、本任务实际 diff 路径、implementer changed files 与结构化 evidence。reviewer 必须自行读取 `git status` 和相对基线的 `git diff`；缺关键输入即 `INCONCLUSIVE`。
5. **Verdict 闸**：只有 `PASS` 可进入完成回填；`BLOCK`、`REVISE`、`INCONCLUSIVE` 一律不得标 `[x]`。把 findings 交回 implementer 在原 Boundary 内修复，再以新 diff/evidence 派**新的 reviewer 上下文**重审，最多 2 轮；第 2 轮仍非 `PASS` → 标 `[!] blocked` 并交用户决策，不得降级放行。
6. **评审证据随 Feature 保存**：在任务/Wave 汇报与后续 `COMPLETION.md` 中记录 reviewer verdict、审查基线、实际 diff 范围、finding 修复结果和剩余风险，保证评审与同一 Feature commit 可追溯。

## 模式选择（默认提示词编排，Workflow 仅显式 opt-in）
- **未传 `--workflow`**：一律走下方默认提示词编排；`next`/`T1`/`wave 2` 只限定范围，不会隐式拉起 Workflow。多波次仍可通过同一条消息并发派多个普通 implementer。
- **用户显式传 `--workflow`**：constitution §8 未禁用时才进入下方 Workflow 模式。先用一句话说明本次任务/波次数、额外 token 与权限要求，随即执行，不再二次询问。
- **为什么不自动切档**：Workflow agent 固定运行在 `acceptEdits`，继承当前会话的 tool allowlist；Shell/MCP 未预授权时可能在中途失败。它适合用户明确选择的大批量编排，不应成为普通 `/sdd:implement` 的隐式默认。
- **可用性兜底**：Workflow 工具不可用或预检不通过时，`--workflow` 应明确报出原因并停止；不得悄悄改成另一种执行模式。用户去掉 `--workflow` 重跑即可选择提示词编排。

## Workflow 模式（显式 `--workflow` · 可复现调度）
Workflow 把单个 Wave 的 fan-out、屏障、依赖传播和返回值校验写进代码；**它不是文件系统沙箱，也不会在一次调用里跨过评审屏障连续跑多个 Wave**：
1. **前置解析**：始终把完整任务图解析成 `args = { featureDir, featureRoot, constitutionPath, waves:[{id,taskIds[]}], tasks:{Tn:{id,what,boundary[],depends[],refs,doneWhen,domain,verify,isolation,risk,review,testPolicy,resources[],gateIsolation}}, completedTaskIds, runTaskIds, stackPacks, injectSkills, auditHelperCommand }`；不得只传截断后的 Wave，否则恢复运行会丢失依赖上下文。`completedTaskIds` 只来自已有 `[x]`、证据完整且已经进入前序 Wave checkpoint commit 的任务。未给 selector/`runTaskIds` 时只选择**下一未完成 Wave**；`next` 同义，`T1 T2` 或 `wave 2` 也必须完整落在同一个 Wave。显式选择跨 Wave 任务会以 `MULTI_WAVE_RUN_SELECTION` 拒绝，不能拆成多次内部循环。Task 缺 `Boundary/Depends/Risk/Review/Test policy/Resources/Gate isolation/Done when` 任一字段都视为计划输入无效，不得用默认值放行；同 Wave `Resources` 重复或 `wave-exclusive` 与其它任务同波也会在启动 agent 前拒绝。
2. **权限、提交与可审计范围预检**：确认 Workflow 已启用，当前 allowlist 至少允许 implementer 所需的 Read/Grep/Glob/Edit/Write/Bash 及 Git auditor 的只读 Bash 命令；无交互环境中无法临时授权，缺权限就不要启动。首次 Wave 前，已批准的规格/计划必须已提交；后续 Wave 前，前序 Wave 必须完成 reviewer、证据回填和 checkpoint commit。启动 auditor 前要求 `FEATURE_ROOT` 的 Git 可见工作区为空，脏基线直接停止，不得靠共享快照猜归属。若任务 Boundary 涉及 ignored 文件、`.git`/git-common-dir、FEATURE_ROOT 外路径、task-level `isolation: worktree` 或无法由 Git status/diff 覆盖的生成物，拒绝 Workflow 模式；需要路径级 hook、OS sandbox 或独立任务 worktree 时改用默认提示词编排，并先把隔离/合并协议写入 design/tasks 获用户批准。
3. **解析并运行固定脚本**：只允许下面两套成对路径；先验证入口、core 与 helper 都存在，再调用 `Workflow({ scriptPath: WORKFLOW_SCRIPT, args })`，不得从别处猜路径或现场生成脚本：
   - 插件模式：`WORKFLOW_SCRIPT = ${CLAUDE_PLUGIN_ROOT}/workflows/sdd-implement.js`，并把 `args.auditHelperCommand` 设为精确字符串 `node "$CLAUDE_PLUGIN_ROOT/workflows/git-audit.cjs"`。
   - vendored 模式（插件根不可用时）：`WORKFLOW_SCRIPT = FEATURE_ROOT/.claude/sdd/workflows/sdd-implement.js`，并把 `args.auditHelperCommand` 设为精确字符串 `node .claude/sdd/workflows/git-audit.cjs`。

   两个 helper 命令是 Workflow 运行时允许的固定枚举：不得插入 `FEATURE_ROOT`、文件路径、`cd`、shell 拼接或额外参数。auditor 的当前工作目录必须已经是 `FEATURE_ROOT`；若脚本与 helper 不能来自同一套插件/vendored 布局，预检失败并停止。代码确定性控制并发/依赖/null 传播；同 Wave 任意 Boundary 重叠会在启动 agent 前以 `SAME_WAVE_BOUNDARY_OVERLAP` 拒绝，必须回 tasks 拆 Wave，不在共享快照中假装串行安全。Git snapshot 由独立 auditor agent 采集，脚本只会对其结构化证据做 fail-closed 对账，不能把 auditor 自报当成安全边界。
4. **基础设施失败立即停**：返回缺失、`runtimeFailures` 非空、任一 `agent` 为 `null`/throw 或 `parallel` 缺项时，整个当前 Wave 立即停止，后续 Wave 不启动，也不做自动重试。输出中的 `code/stage/label/wave/task/message` 原样转述，并让用户在 `/workflows` 打开对应 agent detail/journal；常见类别是安全分类器拦截、用户跳过、API/限流错误或工具权限不足，但**没有 journal 证据不得猜具体原因**。
5. **禁止空转式降级**：基础设施失败后先用独立 Git status/diff 对账本次 run 是否留下改动。存在任何改动就停止并人工 reconcile，禁止再派一批 agent 覆盖现场；确认没有改动时，也不在同一命令中循环重跑。用户可去掉 `--workflow` 后显式重试提示词编排。
6. **评审、checkpoint、再调用**：脚本返回的 `done` 仍只是 provisional。按「独立代码评审门」补齐 required review 与 Wave 抽样，只有 reviewer `PASS` 后才回填 `[x]`/`Progress` 与 `Implementation Evidence`；`needsHumanDecision`、`planErrors`、`runtimeFailures` 原样保存和转述。本 Wave 全绿后，经用户明确授权提交包含代码、状态与证据的 Wave checkpoint；未获提交授权就暂停，不启动下一个 Wave。下一次 Workflow 调用重新读取完整任务图，并通过 `completedTaskIds` 带入已提交 checkpoint 的任务。所有 Wave 完成后仍跑 `/sdd:verify`。
> Git 仍留在脚本外（子代理不提交）；Workflow script 本身不能直接访问 FS/shell，实际文件操作由 agent 完成。Boundary snapshot 能发现 Git 可见的净变化，但看不到 ignored 文件、git 元数据、工作根外路径或“改后恢复”的瞬时副作用。

### Workflow 合规须知（避开"determinism"启动报错）
Workflow 校验器会**文本扫描**脚本，一旦发现禁用 token 就**拒绝启动**（报 `Date.now()/Math.random()/new Date() are unavailable`）。所以**任何**要交给 Workflow 跑的脚本：
- ❌ **任何位置**（含注释、字符串、agent 的 prompt 文本）都不得出现 `Date.now`、`Math.random`、`new Date`、`setTimeout` 这些**字面量**——连"提到"都会被拒。要在 prompt 里说明这条，改写成"不确定性 API（取时间/随机数）"等不含字面 token 的措辞。
- ⏱ **要时间戳** → 通过 `args` 传进去，或**工作流返回后**在主会话盖章。
- 🔑 **要唯一 ID** → 用任务 `index`/`label` 派生，不要随机。
- ✅ 用内置 `workflows/sdd-implement.js`（已合规）就天然避开这一切——这也是上面要求"别现场另写"的原因。

## 执行步骤

1. **读计划**：读取当前 `FEATURE_DIR/tasks.md`。解析任务块（含 Boundary/Depends/Refs/Done when）和 **Waves 并行计划**；不得从主 worktree 或其他分支补读另一份同名规格。
   - **lite 模式兼容**：若该 feature 目录没有 `tasks.md` 但有 `spec.md`（`Mode: lite`），就从 `spec.md` 的 `## Tasks` 段解析任务与 Waves，规格切片也指向 `spec.md`。
   - 定义唯一状态文件：`TASK_STATE_FILE = full ? FEATURE_DIR/tasks.md : FEATURE_DIR/spec.md`。从解析、勾选、Progress、blocked 到收尾复查都只读写它；lite 不得凭空创建或扫描 `tasks.md`。
   - 也确认 `FEATURE_ROOT/specs/constitution.md`、`FEATURE_DIR/design.md`、`FEATURE_DIR/requirements.md`（或 lite 的 `FEATURE_DIR/spec.md`）路径，以及本分支宪法 `## Stacks & Skills` 声明的**激活能力包**（`FEATURE_ROOT/specs/stacks/*.md`）与**注入的 skill 名单**——但**你自己不要通读全部内容，把相关切片交给子代理去读**（省你的上下文）。

2. **定范围**（按 $ARGUMENTS）：
   - 省略 → 从第一个未完成的 Wave 开始，按波次依次跑到底。
   - `next` → 只跑下一个未完成的 Wave。
   - `T1 T2` → 只跑指定任务（仍校验其依赖已完成）。
   - `wave 2` → 只跑该波。

3. **校验可并行性**：对要跑的 Wave，确认同波任务的 **Boundary 与独占 Resources 都互不重叠**，且 `Gate isolation: wave-exclusive` 的任务独占 Wave。若冲突（含 Boundary 大小写折叠/file-dir 别名，或端口/测试库/schema/缓存/临时目录/profile 复用），本次计划 fail closed，停止并回 `TASK_STATE_FILE` 重排；不得在共享现场“降级串行”后继续。

4. **逐波执行**：对每个 Wave：
   - 确认它依赖的前序波都已 `[x]`（没完成就先做前序波）。
   - **冻结 Wave 基线**：按「独立代码评审门」记录 ref/工作区快照；无法区分前序未提交改动时先整理/提交，不带着未知脏状态开始评审。
   - **并行派发**：在**同一条消息里**对该波的每个任务各发一个 `implementer` 子代理（用 Task 工具，subagent_type 选 implementer / 插件内为 `sdd:implementer`）。给每个子代理传：功能目录路径、该任务的**完整任务块**、它的 Boundary、Refs，**以及该任务所属领域的能力包路径 `specs/stacks/<domain>.md` 和需注入调用的 skill 名单**（让隔离子代理也具备领域知识与注入能力）。
     - **强制工作根（防写漏主目录）**：明确告诉每个子代理「你的工作根是 `<FEATURE_ROOT 绝对路径>`；所有 shell/门禁命令**第一步先 `cd "$FEATURE_ROOT"`**；只在此目录内读、写、搜索、跑测试；report 的改动文件用相对 FEATURE_ROOT 的路径」。**绝不让子代理在主目录跑门禁/写代码**（否则测的是主干、改的是主目录，静默打架）。
     - 同波 Boundary 无法不重叠时必须重排 Wave；若业务上确需任务级独立 worktree，先把隔离/合并策略写进 design 与任务计划并取得用户批准，不在执行中临时切换。
     - 每个子代理只使用任务声明的 `Resources`；端口、测试 DB/schema、缓存、临时目录和浏览器 profile 均按 task 唯一。写入型 formatter/fixer 只接收本任务 Boundary/实际改动文件的显式 argv；包级/仓库级写门禁只能在 implementer 全部结束后的 Wave checkpoint 串行运行。
   - 收齐该波所有 implementer 的结构化回报。

5. **评审并回填状态**（每个回报的任务）：
   - **done**（implementer 已自跑门禁通过、守住 Boundary）→ 先标为“待评审”，核对真实 diff 与任务的 `Risk/Review/Test policy`。命中 required 条件就立即派独立 `code-reviewer`；非必审任务暂候本 Wave 抽样选择。**只有 reviewer `PASS`，或该任务未被抽中且本 Wave 已满足抽样下限后，才用 Edit 在 `TASK_STATE_FILE` 把 `[ ]`/`[~]` 改成 `[x]` 并更新 `Progress: X / N`。** `BLOCK/REVISE/INCONCLUSIVE` 按评审门修复重审，绝不先勾选再补审。
     - **证据先于结论**：检查 implementer 的结构化 `evidence[]` 是否包含每个实际门禁的命令、退出码、摘要与日志位置；缺失、命令不适用或任一非零都视为未完成，先补跑/修复。不得把 `quality: passed` 之类自报字符串当证据。
   - **implementer 回报 `blocked`（须偏离 design）** → 标 `[!]`，**停止该任务的下游链**，把 implementer 的原因**原样转述给用户**，等决定（可能要回 `/sdd:plan` 改设计）。不要自己擅自改方向、也不要跳过继续。
   - **记录偏移（防文档停更）**：凡 implementer 回报的 `DEVIATION` 非"无"、或用户拍板接受了与 design 不同的做法，**立即把它追加到 design.md（lite 则 spec.md）的 `## Deviations / 实现偏移` 段**（`原 X → 实际 Y · 原因 · 影响的 AC`）。别让偏移只留在对话里——这是冻结前对账的依据。
   - **记录延后（防功能漏掉，关键）**："做成了别的样子"是偏移；"现在不做、未来补"是延后。新延后项必须按 `/sdd:init` 的规范化 `Source/AC/Content/Reason/Target` canonical JSON 算稳定 `decisionDigest`，再以 owner blob + permanent `refs/sdd/backlog-ids/<ID>` expected-absent CAS 原子占 ID，并新建唯一 `FEATURE_ROOT/specs/backlog/BL-<featureNNN>-<seq>.md`。CAS 被抢通常取下一 seq；只有 blob/request/item 三方 digest 一致才可恢复，不能因 Source 相同就覆盖另一条 Content/Reason。**禁止向共享 `specs/BACKLOG.md` 尾部追加**。
   - **遇到延后/跳过决策必停下问**：当 implementer 的 `NOTES` 建议某范围本期不做、或你判断某任务该延后 → 用 AskUserQuestion 给选项：**改设计 / 接受偏移(记 Deviations) / 延后补齐(记 BACKLOG) / 跳过不做(记 Non-Goals) / 停**。选"延后补齐"就按上一条落台账，**绝不只在对话里答应一句就过去**。

6. **波间纪律**：Wave 结束前确认所有 required review 已 `PASS`，且至少 1 个实际有 diff 的任务完成独立抽样评审；未满足则该 Wave 不算完成。上一波存在 `blocked` 或评审未通过，不开下一波依赖任务（失败不向下游扩散）。无依赖关系的其他分支可继续。
   - **当场持久化证据**：每个 task 定案、每次 reviewer verdict、每个 Wave 抽样完成时，立即在 `TASK_STATE_FILE / ## Implementation Evidence` 追加或更新一行：task/wave、state/verdict、baseline SHA/快照、实际 diff 路径、四类 gate 的 outcome/command/exit/摘要、reviewer 轮次/findings 修复与 residual risk。`COMPLETION.md` 后续只汇总/引用这里；会话结束前不得让证据只存在于聊天记录。

7. **完成后**：
   - **核对回填**：再扫一遍 `TASK_STATE_FILE`——每个 `[x]` 任务都满足门禁与适用的 reviewer `PASS`，每个 Wave 有抽样记录，`Progress` 与勾选数一致，评审两轮未过的是 `[!]`。缺评审时补审，**不能只补勾**。
   - **单根断言**：用当前 Feature Worktree 的 `git status --porcelain` 汇总改动，确认规格、`TASK_STATE_FILE` 回填、代码与证据都在同一工作树；若任何子代理报告了 `FEATURE_ROOT` 外路径，立即停下并列出越界文件，不能当作成功。
   - 按波汇报：哪些任务完成 / 阻塞，动了哪些文件，测试结果。
   - 若全部完成 → 提示 `/sdd:verify` 做功能级行为验收；仍有 `[!]` → 列出待人工决策项。
   - ⚠️ **本（feature）终端到此为止——不要在这里跑合并门**。各任务已按风险运行 scoped 门禁，关键回归测试已持久化，探索性探针才可临时清理；**合并门（改动模块编译 + fitness + 受影响持久测试）是 `/sdd:worktree finish` 在【主终端】的专属步骤**。Stop hook 提醒的是当前阶段尚缺的 scoped 证据，不是让你重复整套合并门。

## 纪律
- ✅ **并发隔离分两级**：单 feature 内的多任务靠 Boundary+Waves 在同一 **FEATURE_ROOT** 内并行（子代理只改文件、**不碰 git**，由编排器按需提交）；跨 feature/多终端的并行靠各自 worktree。主 worktree 不驱动 implement，只用于全局查看与串行 finish。
- ✅ 你只编排：读计划、派子代理、回填状态、转述阻塞。**不亲自写功能代码**（除非用户明确要你不开子代理直接做）。
- ✅ 一切改动可追溯到任务/需求；破坏性操作（删文件、改 schema、跑迁移）先确认。
- ✅ reviewer 必须是未参与实现的新上下文，以真实基线、Git diff 和 evidence 为准；implementer 自报 `done/passed` 不能替代评审证据。
- ❌ implementer 未回报 `done`（或自报门禁未过）不标完成；❌ 不偷偷扩大范围（额外改进记进汇报，由用户决定）。
