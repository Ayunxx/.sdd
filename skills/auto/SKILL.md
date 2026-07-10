---
description: 自动驾驶 / Drive the whole SDD pipeline from ONE command — auto-advances specify→clarify→plan→tasks→implement→verify, and STOPS at each human gate (via AskUserQuestion) to let you approve/revise/pause, then auto-continues. 全自动流程，但人工卡点处停下让你选。
argument-hint: "<一句话功能描述> [--lite] [--workflow] [resume <feature-slug> 从中断处继续]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, Workflow
---

# /sdd:auto — 全流程自动驾驶（人工卡点停下让你选）

你是**流水线驱动器**：从一条命令把整个 SDD 流程**自动跑下去，用户不用逐个敲命令**；但在每个**人工卡点**用 **AskUserQuestion** 停下让用户拍板，选完**自动续跑**下一阶段。

> 本质：不取消人工把关，而是把"用户记着敲下一个命令"换成"你主动停下问"。手动逐步用法（`/sdd:specify` 等）仍然保留，互不冲突。

## 用户输入
$ARGUMENTS

## 总原则
- **效率默认（高效姿态）**：① 入口**自动判功能大小**——琐碎→建议跳过 SDD、小功能→**默认走 lite**（单 spec.md，跳 plan/tasks），复杂才完整流程；在需求卡点把判断结果告诉用户、可一键改档。② 实现阶段默认使用提示词编排并按 Boundary/Waves 并发普通 implementer；只有用户在本次调用中显式传 `--workflow` 才使用动态 Workflow。目标：**该轻就轻、能并行就并行**，同时不隐式拉起更高成本、权限更宽的运行时。
- **自动推进**：阶段之间你自己往下走，别要求用户记命令。
- **卡点必停 + 引导**：在下列 🚦 处停下，**不是只问"通过吗"，而是引导用户完成这一步的人工操作**——见下方「引导式卡点」。拿到答复再继续；**绝不替用户拍板通过**。
- **每阶段遵循对应命令的规则与模板**（specify/clarify/plan/tasks/implement/verify 的定义你已加载，照它们产出，别另起一套）。
- **可续跑**：`resume <slug>` 时读该 feature 现有产物，定位断点，从下一步接着跑。
- **不降门槛**：质量门禁、Boundary、对账、测试纪律全程照旧——auto 只负责串流程。

## 引导式卡点（每个 🚦 必须做到三件事，再 AskUserQuestion）
1. **告诉用户看什么**：产出物路径 + 一句话摘要 + **重点该审的地方**（具体到文件章节/某几条，别让用户自己大海捞针）。
2. **点明只有用户能决定的事**：把需要人拍板的项**逐条列出**（如待澄清问题、偏离宪法的决策、验收是否接受、manual-HW 实测证据、合并冲突如何取舍、破坏性操作是否执行）。
3. **引导对应操作**：告诉用户**这一步具体要做什么**——是审阅确认 / 回答几个问题 / 提供硬件实测值 / 解决某处冲突 / 确认删库跑迁移，把"动作"讲清楚。
> 然后才用 AskUserQuestion 给选项。目标：用户**不用懂 SDD 内部，也知道此刻该干嘛**。

## 流水线（🚦 = 停下让用户选）

0. **Feature Worktree 前门（先确定唯一事实源，再产出任何规格）**
   > 硬不变量：**一 feature = 一 `sdd/NNN-slug` 分支 = 一独立 worktree = 同一处规格、代码、任务进度与验证证据**。主 worktree 对 feature 只做 `/sdd:status` 等全局只读查看与串行 `/sdd:worktree finish`；项目级 init/constitution/stack 可串行维护，但必须提交到 base 后再建 feature。不得在主干上创建或推进 feature 规格。
   > 本机制只对共享同一个 `.git` 的本机 worktree 成立；独立 clone 不共享 ref，编号冲突只能在合并时解决。

   **0.1 检测站位**：读取当前分支与 `git worktree list --porcelain`。
   - **当前分支为 `sdd/NNN-slug`，且当前目录正是该分支登记的 worktree** → `FEATURE_ROOT = 当前目录`，复用分支中的编号和 slug，直接进 0.5。若输入是 `resume <target>`，必须先规范化并要求 target 与当前 `NNN-slug` **精确一致**；不一致立即停止，定位目标 worktree 并交接，绝不让 cwd 静默覆盖显式参数。后续所有 `specs/NNN-slug/*`、代码、`tasks.md` 与 `COMPLETION.md` 都只在这里读写。
   - **当前在 main/master/base 主 worktree** → 进入 0.2；此时不创建 `specs/NNN-slug/`、不运行 SPECIFY。
   - **当前在非标准分支或 detached worktree** → 停下说明该目录不满足 Feature 身份；引导先迁移/重建为 `sdd/NNN-slug` worktree，绝不在非标准目录继续写规格。

   **0.2 解析新建或续跑目标**：
   - 新功能：先确认主 worktree `git status --porcelain` 为空，且 `specs/constitution.md`、已激活的 `specs/stacks/*` 等共享基线已提交到 base；否则停止，要求用户先提交/自行暂存，**不得自动 stash 或从看不到初始化文件的旧 base 创建 worktree**。然后由想法生成 kebab-case `slug`，并硬校验 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；生成值含路径分隔符、`..`、空白、shell 元字符或不匹配就停止，不能“清洗后继续”。编号分配与显式 ID 校验必须逐字复用 `/sdd:worktree start` 的永久 `refs/sdd/feature-ids/NNN` expected-absent CAS 协议；auto 不维护第二套 `max+1` 算法。最终 branch 再用参数数组调用 `git check-ref-format --branch`。
   - `resume <slug>`：先从 `git worktree list` 与 `git branch --list 'sdd/*'` 找精确目标。已有 worktree 就复用并交接；已有分支但没有 worktree 属旧版遗留，按 0.3 的“附着已有分支”处理，**不得再用 `-b`**。
   - 若只在主 worktree 发现 `specs/NNN-slug/`、而 Feature Worktree 内没有，判定为**旧版 split-brain**：暂停流水线，按 `/sdd:worktree` 的迁移协议先把规格转移到 feature 分支并核对，不能让实现继续引用主干规格。

   **0.3 原子创建或复用真实 Worktree**：
   - 先把仓库根与目标 `../<repo>--<NNN-slug>` 解析成规范绝对路径，断言目标父目录严格等于仓库父目录、basename 精确匹配且不在仓库内部。所有 Git 调用使用独立 argv 参数，不把 slug/base/路径拼成 shell 字符串。
   - **全新目标（分支不存在）**：先成功持有与 slug 精确匹配的永久 `refs/sdd/feature-ids/NNN` reservation，再 `git worktree add -b sdd/<NNN-slug> "../<repo>--<NNN-slug>" <BASE_SHA>`；创建失败时 reservation 不释放，只允许同 slug 恢复。reservation CAS 被别的 slug 抢先时重新扫描并取下一号，不能只等完整 branch 名冲突。
   - **已有分支但没有 worktree（旧版占号分支）**：`git worktree add "../<repo>--<NNN-slug>" sdd/<NNN-slug>`，直接附着已有分支，**不使用 `-b`，不重建同名分支**。
   - **已有分支且已有 worktree**：不创建任何东西，直接取其绝对路径。
   - 不再提供“只建占号分支、留在主目录就地做”的路径；分支引用和真实 worktree 必须一起成为 Feature 身份。

   **0.4 交接到 Feature Worktree**：若本命令从主 worktree 发起，创建/定位完成后必须停下并告知：✅ `NNN-slug` 已保留 · 📁 Feature Worktree 绝对路径 · 👉 在该目录启动新终端/Claude。若这是刚创建、尚无规格产物的空目标，**只可重新运行 `/sdd:auto <原想法> [原 flags]`**；原想法尚未持久化，不能推荐 `resume`。只有目标已存在 `requirements.md`/`spec.md` 等可验证产物时，才可用 `/sdd:auto resume <NNN-slug>`。运行中的会话不能可靠改变自己的 cwd，因此**主会话不代跑后续规格阶段**。

   **0.5 Feature 内前置检查**：只在 `FEATURE_ROOT` 内检查 `specs/constitution.md`、能力包与目标 `specs/NNN-slug/`。无宪法 → 🚦 提示先处理项目初始化；无能力包 → 提示 `/sdd:stack add`；`resume` → 必须先找到至少一份属于该 feature 的规格/阶段产物再定位断点，空目录或只有分支身份时 fail closed，要求用户重输原想法，不得凭 slug 反推需求。

   > 一句话纪律：**先进入 Feature Worktree，再写第一行功能规格**。主 worktree 维护已提交的项目级基线、看全局并串行 finish；Feature Worktree 承载从 specify 到 verify 的完整生命周期。

1. **SPECIFY** → 在 `FEATURE_ROOT/specs/NNN-slug/` 按 specify 规则生成 `requirements.md`（`--lite` 则单 `spec.md`）。立刻定义 `TARGET_SPEC = lite ? spec.md : requirements.md`、`TASK_STATE_FILE = lite ? spec.md : tasks.md`，后续不得再把 lite 硬编码回 full 文件。
   > 号已在步骤 0 由真实 `sdd/NNN-slug` worktree 定死；specify 必须复用分支身份，**不再重新扫号，也不向主 worktree 写副本**。
   - **自动评审（默认开）**：按 specify step 5b 派 `spec-reviewer` 反压自修（specify「## 规格反压评审协议」）。**评审发现的歧义/需定夺项 → 转 `[NEEDS CLARIFICATION]`，不自己猜**，交下一步 CLARIFY 消化（消歧优先于自修）；只有机械类问题在本步自修。
   🚦 **需求卡点**：报路径 + 要点 + `[NEEDS CLARIFICATION]` 数量（含评审新增的）**+ 评审 Verdict（🟢/🟡/🔴 + 自修/残留）** → AskUserQuestion。

2. **CLARIFY**（若 `TARGET_SPEC` 有 `[NEEDS CLARIFICATION]`——**含评审转出的歧义**——或重大模糊）→ 按 clarify 规则提问并回填同一个 `TARGET_SPEC`。有歧义必须先消除；**lite 消歧完成后跳过 PLAN/TASKS，直接进入 IMPLEMENT**，full 才继续第 3 步。
   🚦 这一步**本身即卡点**（批量 AskUserQuestion）。

3. **PLAN（仅 full）** → 按 plan 规则生成 `design.md`（遵循能力包；并按 plan step 1/3 **读 patterns/principles 目录、对本功能走一遍设计模式选型**，结论落 design §7.1）。lite 严禁生成 design.md。
   - **自动评审（默认开）**：按 plan step 4c 派 `design-critic` 反压自修（查 design↔requirements↔宪法 对齐、可追溯缺口、过度/欠设计）。
   🚦 **设计卡点**：高亮"偏离宪法 / 新依赖"等需批准项 + 可追溯覆盖 **+ design-critic Verdict** → AskUserQuestion。

4. **TASKS（仅 full）** → 按 tasks 规则生成 `tasks.md`（Boundary + Waves）。lite 的任务/Waves 已在 spec.md，严禁另建 tasks.md。
   - **自动对齐自检（默认开）**：按 tasks step 5b 做 design↔tasks 覆盖/越界/Boundary 反压自修。
   🚦 **拆解卡点**：报任务数 / Wave 数 **+ 覆盖自检结果** → AskUserQuestion（✅ 开始实现 / ✏️ 调整 / ⏸）。

4.5 **Workflow 首 Wave checkpoint（仅显式 `--workflow`）**：需求/消歧（lite）或拆解（full）获批后，展示本 feature 的规格/计划 diff 与待提交路径，AskUserQuestion 请求“提交批准后的规格 checkpoint 并启动首 Wave / 继续修改 / 暂停”。只有用户明确授权后，才精确 stage `TARGET_SPEC` 及 full 的 design/tasks 等本 feature 产物，检查 staged diff 无其它文件，提交 Conventional Commit，并确认 `FEATURE_ROOT` clean。未授权、提交失败或仍脏都暂停；不得直接进入 Workflow 后再让 clean-baseline 审计失败。

5. **IMPLEMENT** → 按 implement 编排器规则从 `TASK_STATE_FILE` 读取任务并回填同一文件（full=`tasks.md`，lite=`spec.md`）；执行波次并发、隔离 implementer、独立 `code-reviewer` 风险门/波次抽样，最后由合并门与 `/sdd:verify` 共同兜底。
   - **（默认提示词编排）** 进入实现时按 implement 的 Boundary/Waves 规则并发普通 implementer，不自动切到动态 Workflow。只有用户显式以 `/sdd:auto --workflow ...` 调用时才把该 flag 传给 implement；启动前执行工具权限/Git 可审计范围预检，失败立即停止并报告，不得空转或静默降级。
   - **评审门不得省略**：每 Wave 开始先记录独立 Git 基线/工作区快照。`Risk: high`、`Review: required`、发生任何 `DEVIATION` 或实际 diff 触及共享边界的任务，必须在标 `[x]` 前派全新 `code-reviewer`；其余每 Wave 至少抽样 1 个实际有 diff 的任务。reviewer 自行核对真实 `git diff` 与 evidence，不能采信 implementer 自报。
   - 只有 reviewer `PASS` 才能放行被审任务；`BLOCK`/`REVISE`/`INCONCLUSIVE` 均回 implementer 修复后用新 reviewer 上下文重审，最多 2 轮，仍未 PASS → 标 `[!] blocked` 并进入异常卡点。默认提示词编排满足任务门禁与 Wave 抽样后可自动续跑下一波；**显式 `--workflow` 不可自动跨 Wave**：每 Wave 回填 `TASK_STATE_FILE`/Evidence 后展示真实 diff、review verdict 与四类 gate，AskUserQuestion 请求授权精确提交该 Wave checkpoint。只有提交成功且工作树 clean，才重新解析完整任务图并调用下一 Wave；拒绝/失败就暂停，不得越权 commit 或空转重试。
   - **记录偏移（与 /sdd:implement 一致，别丢）**：凡 implementer 回报的 `DEVIATION` 非"无"、或实现与 design 不符——**不管是否阻塞**，都**立即追加到 `design.md`（lite 则 `spec.md`）的 `## Deviations / 实现偏移` 段**（`原 X → 实际 Y · 原因 · 影响的 AC`）。小偏移自动记下不打断；须改方向的（blocked）才停下问。
   - **记录延后（与 /sdd:implement 一致，防漏掉）**：对规范化 `Source/AC/Content/Reason/Target` 算稳定 `decisionDigest`，按 init 的永久 backlog-id ref CAS 原子占 ID并新建 item；禁止追加共享 BACKLOG.md。CAS 失败取下一 seq，只有 blob/request/item 三方 digest 一致才恢复，Source 相同但 Content/Reason 不同不得复用。
   - 仅在**异常**时 🚦 停下 AskUserQuestion：implementer 报 `blocked`（须偏离 design）、反复越界 Boundary、要延后某范围、或要做破坏性操作 → 让用户决定（改设计 / 接受偏移(记 Deviations) / **延后补齐(记 BACKLOG)** / 跳过不做(记 Non-Goals) / 停）。

6. **VERIFY** → 按 verify 规则出 punch list（按 AC 的 `Verify` 标签）。
   🚦 **验收卡点**：AskUserQuestion（✅ 通过去收尾 / 🔧 修问题回 implement / ⏸）。

7. **收尾** → 🚦 提示先提交 Feature Worktree 中同一批规格、代码、任务进度与验证证据，再回到**主 worktree 串行执行** `/sdd:worktree finish <NNN-slug>`（对账 + 合并门 + 合并 + 清理，破坏性，必单独确认）。

## 卡点标准选项（AskUserQuestion）
每个 🚦 至少给：`✅ 通过，继续下一阶段` / `✏️ 我要改（我会说明）` / `⏸ 暂停（保留产物，之后 resume 续跑）`。按阶段加特有项（如设计阶段"批准偏离宪法"、验收阶段"接受 manual-HW 待背书"）。

## 纪律
- ✅ **产物归 SDD**：所有规格/设计/任务/代码**由你严格按 SDD 模板与规则直接生成**，**不得转交其他插件/框架的 skill（如 Superpowers）来写**——它们的模板、风格、门禁与 SDD 不同，会破坏结构与可追溯。需要专项能力时，仅用 `/sdd:stack skill` 显式注入的那些。
- ✅ 卡点**真停下等用户**；破坏性操作（finish 合并、删文件、改 schema、跑迁移）一律单独确认。
- ✅ 全程仍守质量门禁 / Boundary / 对账 / 测试纪律——auto 不降低任何门槛。
- ❌ **绝不一口气跑到底不停**——那就成了无人把关的 vibe coding，违背 SDD 初衷。
- ✅ 用户选 ✏️ 改 → 改完**回到该卡点再问一次**，确认后才继续。
