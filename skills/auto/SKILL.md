---
description: 自动驾驶 / Drive the whole SDD pipeline from ONE command — auto-advances specify→clarify→plan→tasks→implement→verify, and STOPS at each human gate (via AskUserQuestion) to let you approve/revise/pause, then auto-continues. 全自动流程，但人工卡点处停下让你选。
argument-hint: "<一句话功能描述> [--lite] [resume <feature-slug> 从中断处继续]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---

# /sdd:auto — 全流程自动驾驶（人工卡点停下让你选）

你是**流水线驱动器**：从一条命令把整个 SDD 流程**自动跑下去，用户不用逐个敲命令**；但在每个**人工卡点**用 **AskUserQuestion** 停下让用户拍板，选完**自动续跑**下一阶段。

> 本质：不取消人工把关，而是把"用户记着敲下一个命令"换成"你主动停下问"。手动逐步用法（`/sdd:specify` 等）仍然保留，互不冲突。

## 用户输入
$ARGUMENTS

## 总原则
- **效率默认（高效姿态）**：① 入口**自动判功能大小**——琐碎→建议跳过 SDD、小功能→**默认走 lite**（单 spec.md，跳 clarify/plan），复杂才完整流程；在需求卡点把判断结果告诉用户、可一键改档。② 实现阶段由编排器**按任务结构自选**是否走 Workflow 确定性并行档（多波次/高并行更划算，选了一句话告知即开跑）——不再要 ultracode/§8（仅当 §8 显式禁用才一律提示词编排）。目标：**该轻就轻、能并行就并行**，把人的操作和等待都压到最小。
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

0. **隔离与安全编号前置（治"多终端各自 auto 撞 spec 编号 + 共享工作树互相 reset"）**
   > 为什么必须前置：auto 流水线**自己从不建 `sdd/*` 分支/worktree**，所以 specify 那套"扫 `sdd/*` 取号防撞"对 auto 直跑**会失效**——多终端会算出同一个号、撞同一个 `specs/NNN-*`；同目录还会共享工作树互相 reset。所以先把"占位 + 隔离"做掉。
   > **适用边界**：本机制只对**共享同一个 `.git` 的多终端/多 worktree** 成立（靠 git ref 锁串行）。各自独立 clone 之间不共享 ref，撞号只能靠合并解决，不在此范围。

   **0.1 检测站位**：`git rev-parse --abbrev-ref HEAD`。
   - **已在 `sdd/NNN-slug` 分支**（身处某 feature 隔离 worktree）→ **复用该号、绝不重新分配**，跳到 0.5 正常往下跑。`resume` 同理。
   - 在某个非主工作树但**分支名非 `sdd/NNN-slug`**（用户手建的非标准 worktree）→ 提示用户，**问要不要就在此处当作该 feature**，而非强行再套一层隔离。
   - 在 main/master/共享目录 → 进 0.2。

   **0.2 问意图（AskUserQuestion，先别动 git）**：告诉用户"当前在共享目录/主干，直跑 auto 会①与别终端**撞编号**②同目录多 auto **共享工作树互相 reset**"，让选：
   - **(a) 要并发 → 隔离后交接（默认推荐）**：auto 现在原子占号 + 建独立 worktree，再交接你去新终端续跑。
   - **(b) 只这一个、不并发 → 就地轻量做**：仍**原子占号**（见 0.3，只是不建独立 worktree 目录）。
   - **(c) 我自己先 `/sdd:worktree start`**：本会话停下，走单一前门。
   - 🚨 **始终警告一次**：**绝不在同一目录开多个终端各自 `/sdd:auto`**——共享工作树+HEAD 会互相 reset/切分支 clobber。要并发：**一 feature = 一 `sdd/NNN-slug` 分支 = 一独立 worktree 目录 = 一终端**。
   - 主动检测：若 `git branch --list 'sdd/*'` 已有在建 feature → 提示"检测到已有并发 feature，建议走 (a) 隔离，别选 (b)"。

   **0.3 原子占号（(a)(b) 都做——这是闭合碰撞的关键）**：
   1. 由想法生成 kebab-case `slug`。
   2. `NNN` = 对 `specs/NNN-*` + `specs/archive/NNN-*` + **嵌套归档 delta `specs/archive/*/deltas/NNN-*` 与 `specs/*/deltas/NNN-*`**（嵌进源里的 delta 也占全局号，必须递归扫到）+ `git branch --list 'sdd/*'`（共享 .git，**含别终端在建的号**）+ `git worktree list` **取并集 max+1**，零填充三位。
   3. **原子占位 = 建分支**（无论 a/b 都建，这就是别人扫得见的占位）：
      - **(a) 并发**：`git worktree add -b sdd/<NNN-slug> "../<repo>--<NNN-slug>" <base>`（建分支+独立目录）。
      - **(b) 就地**：`git branch sdd/<NNN-slug>`（**只建分支引用、不切换、不建目录**——原子占住号且并发可见，本会话仍在原地工作于 `specs/NNN-slug/`）。该分支只是**占号标记**，功能做完后 `git branch -d sdd/<NNN-slug>` 删掉即可（工作已在原分支上）。
      - **git 建分支是原子的 = 最终防线**：若因"分支已存在"失败（被并发抢先）→ **编号 +1 重试**该命令直到成功。

   **0.4（仅 (a)）交接**（建好 worktree 后停下，**绝不替用户跳进去续跑**——运行中的会话钉死在当前 cwd，搬不进新目录）：用 AskUserQuestion 告知：✅ 号 `NNN-slug` 已原子保留（别人不会再撞）· 📁 新目录绝对路径 · 👉 引导：①开新终端 ②`cd` 到该目录 ③启新 Claude ④跑 `/sdd:auto <原想法>`（0.1 会命中已在 worktree 内、复用号续跑）。本会话到此为止。

   **0.5 原有前置检查**（隔离/占号定了再做）：无 `specs/constitution.md` → 🚦 提示先 `/sdd:constitution`；无能力包 → 提示 `/sdd:stack add`；`resume <slug>` → 读现有产物定位断点。

   > 一句话纪律：**隔离/占号在前，auto 在后**。auto 能代劳"建分支占号 + 建 worktree"，但"进隔离目录续跑"这最后一跳跨会话边界，只能交接给用户。**碰撞闭合保证：仅在共享 .git 下、且每个 feature 都经 0.3 建了 `sdd/*` 分支占位时成立。**

1. **SPECIFY** → 按 specify 规则生成 `requirements.md`（`--lite` 则单 `spec.md`）。
   > 号已在步骤 0 定死并由 `sdd/NNN-slug` 分支占住：specify 命中 0.1"已在 sdd worktree 内"复用号，或沿用步骤 0 的 `NNN-slug`，**不再重新扫号**。
   - **自动评审（默认开）**：按 specify step 5b 派 `spec-reviewer` 反压自修（specify「## 规格反压评审协议」）。**评审发现的歧义/需定夺项 → 转 `[NEEDS CLARIFICATION]`，不自己猜**，交下一步 CLARIFY 消化（消歧优先于自修）；只有机械类问题在本步自修。
   🚦 **需求卡点**：报路径 + 要点 + `[NEEDS CLARIFICATION]` 数量（含评审新增的）**+ 评审 Verdict（🟢/🟡/🔴 + 自修/残留）** → AskUserQuestion。

2. **CLARIFY**（若有 `[NEEDS CLARIFICATION]`——**含评审转出的歧义**——或重大模糊）→ 按 clarify 规则提问。**有歧义必先在此消除，再进 PLAN**。
   🚦 这一步**本身即卡点**（批量 AskUserQuestion），答完回填 requirements。

3. **PLAN** → 按 plan 规则生成 `design.md`（遵循能力包；并按 plan step 1/3 **读 patterns/principles 目录、对本功能走一遍设计模式选型**，结论落 design §7.1）。
   - **自动评审（默认开）**：按 plan step 4c 派 `design-critic` 反压自修（查 design↔requirements↔宪法 对齐、可追溯缺口、过度/欠设计）。
   🚦 **设计卡点**：高亮"偏离宪法 / 新依赖"等需批准项 + 可追溯覆盖 **+ design-critic Verdict** → AskUserQuestion。

4. **TASKS** → 按 tasks 规则生成 `tasks.md`（Boundary + Waves）。
   - **自动对齐自检（默认开）**：按 tasks step 5b 做 design↔tasks 覆盖/越界/Boundary 反压自修。
   🚦 **拆解卡点**：报任务数 / Wave 数 **+ 覆盖自检结果** → AskUserQuestion（✅ 开始实现 / ✏️ 调整 / ⏸）。

5. **IMPLEMENT** → 按 implement 编排器规则跑（波次并发、隔离子代理、verifier 反压）。
   - **（确定性并行档 · 编排器自选）** 进入实现时按 implement 的「模式选择」**自行判断**是否用 Workflow 确定性编排（多波次/高并行更划算）；选了**先一句话告知再开跑**——这是编排机制选择、非人工卡点，**不为它停**。不再要 ultracode、不再要 §8 放行（仅 constitution §8 显式"禁用"时一律提示词编排）。合规依据：用户调用 `/sdd:auto`（其指令要求你按需调 Workflow）本身即 Claude Code opt-in。
   - 正常完成的任务**自动续跑下一波，不打扰用户**。
   - **记录偏移（与 /sdd:implement 一致，别丢）**：凡 implementer 回报的 `DEVIATION` 非"无"、或实现与 design 不符——**不管是否阻塞**，都**立即追加到 `design.md`（lite 则 `spec.md`）的 `## Deviations / 实现偏移` 段**（`原 X → 实际 Y · 原因 · 影响的 AC`）。小偏移自动记下不打断；须改方向的（blocked）才停下问。
   - **记录延后（与 /sdd:implement 一致，防漏掉）**：凡决定"这块现在不做、未来补"——**立即追加一条进 `specs/BACKLOG.md` 的 `## 待补齐` 段**（`BL-NNN · 来源 · 内容 · 因 · 目标 · 记于`；文件不存在则先按 init 骨架建）。延后 ≠ 偏移：偏移记 Deviations（冻结），延后进长存台账（会被回捞）。**绝不只在对话里答应**。
   - 仅在**异常**时 🚦 停下 AskUserQuestion：verifier 连续打回升级、implementer 报 `blocked`（须偏离 design）、要延后某范围、或要做破坏性操作 → 让用户决定（改设计 / 接受偏移(记 Deviations) / **延后补齐(记 BACKLOG)** / 跳过不做(记 Non-Goals) / 停）。

6. **VERIFY** → 按 verify 规则出 punch list（按 AC 的 `Verify` 标签）。
   🚦 **验收卡点**：AskUserQuestion（✅ 通过去收尾 / 🔧 修问题回 implement / ⏸）。

7. **收尾** → 🚦 **确认**是否 `/sdd:worktree finish`（对账 + 合并门 + 自动删 worktree，破坏性，必单独确认）。

## 卡点标准选项（AskUserQuestion）
每个 🚦 至少给：`✅ 通过，继续下一阶段` / `✏️ 我要改（我会说明）` / `⏸ 暂停（保留产物，之后 resume 续跑）`。按阶段加特有项（如设计阶段"批准偏离宪法"、验收阶段"接受 manual-HW 待背书"）。

## 纪律
- ✅ **产物归 SDD**：所有规格/设计/任务/代码**由你严格按 SDD 模板与规则直接生成**，**不得转交其他插件/框架的 skill（如 Superpowers）来写**——它们的模板、风格、门禁与 SDD 不同，会破坏结构与可追溯。需要专项能力时，仅用 `/sdd:stack skill` 显式注入的那些。
- ✅ 卡点**真停下等用户**；破坏性操作（finish 合并、删文件、改 schema、跑迁移）一律单独确认。
- ✅ 全程仍守质量门禁 / Boundary / 对账 / 测试纪律——auto 不降低任何门槛。
- ❌ **绝不一口气跑到底不停**——那就成了无人把关的 vibe coding，违背 SDD 初衷。
- ✅ 用户选 ✏️ 改 → 改完**回到该卡点再问一次**，确认后才继续。
