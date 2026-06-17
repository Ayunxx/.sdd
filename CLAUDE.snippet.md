<!--
把下面这段粘进【使用本工作流的目标项目】根目录的 CLAUDE.md。
作用：让 Claude 每次会话都自动遵守"规格优先"纪律。SDD 命令本身由你手动触发，
这段只是强化全局约束，不是必需，但推荐。
-->

## 开发纪律 / Spec-Driven Development

本项目采用 SDD（规格驱动开发）。**文档即事实来源**，代码是规格的产物。

- 权威规格在 `specs/`：`constitution.md`（全局宪法）+ 每个功能的 `NNN-slug/{requirements,design,tasks}.md`。
- 动手实现前，相关功能必须已有经我确认的 requirements → design → tasks。缺失就提示我先走对应阶段，不要凭对话直接写功能代码。
- 任何代码改动都要能追溯到某条 requirement / 某个 task。想到规格外的改进，记下来告诉我，由我决定是否新开任务，不要擅自扩张范围。
- 一切实现必须遵守 `specs/constitution.md`；需偏离时先停下说明、等我批准。
- **文档自动评审（对齐把关）**：每出一份规格文档即**默认自动派评审**——`/sdd:specify`→`spec-reviewer`、`/sdd:plan`→`design-critic`、`/sdd:tasks`→design↔tasks 覆盖自检；评审 🔴 分两类：**歧义/需定夺的先转 `[NEEDS CLARIFICATION]` 走 `/sdd:clarify` 问我消歧（消歧优先、不许自己猜）**，只有机械类（措辞不可测、漏明显边界 AC、可追溯缺口、违宪格式）才**自修再评（最多 2 轮，仿 verifier 反压）**。**意图红线**：自修只动"说清楚/说完整"，绝不擅自改"做什么"（改 Goals/范围/技术方向/未定阈值的交我拍板）。`/sdd:auto` 各阶段卡点会带上评审 Verdict。
- 实现阶段（`/sdd:implement`）以**编排器**方式运行：每个任务派隔离子代理实现（防偏移）、独立子代理验收（反压）、按 Boundary 不重叠的 Waves 并发。我无需手动调度子代理。
- **确定性 Workflow 编排**：`/sdd:implement` 的编排器**按任务结构自行决定**是否用 Workflow 跑本 feature（多波次/高并行更划算，波次并行+重试由代码保证；更费 token，走之前会一句话告知）。**无需 ultracode**；除非项目 constitution §8 显式"禁用 Workflow"。传 `--workflow` 可强制走确定性编排。
- **多终端并发安全（两种安全姿势，二选一）**：① **经典隔离**——每个 feature 开独立终端、cd 进各自 `/sdd:worktree start` 出的 worktree 目录，全程就地干。② **主目录 hub**——多个终端都在主目录驱动需求/文档（不同 feature 写不同 `specs/NNN/`，互不撞），**编码阶段 `/sdd:implement` 按当前分支自动判定 `FEATURE_ROOT`，把代码/门禁/提交全引流进该 feature 的 worktree，主工作树编码期只读**——这就是多终端并发不打架的根。**唯一禁忌**：在主目录里手动 `git commit/checkout/reset/切分支`，或并发跑 `/sdd:worktree finish` 合并——这些动主目录 HEAD/index 的操作必须串行、先确认（否则仍会互相 reset）。
- **防撞功能编号**：feature 的 NNN 编号要在 `/sdd:worktree start` 统一分配，且分配时扫**所有 `sdd/*` 分支**（共享 .git 能看见别终端在建的号）取 max+1；已在 worktree 里就**复用分支上的号、别重新分配**。绝不只扫本地 `specs/` 取号（多终端必撞）。
- **跨 feature 共享信息**：只能共享**已提交**的内容（先 commit 再 `/sdd:sync`），共享契约以规格层为权威；可预见的公共部分先抽成 foundation feature 落 main。
- **Bash 执行纪律（降低命令报错/误判）**：① 找代码/路径/定义这类侦察优先用 Grep/Glob/Read 工具，不用 bash 的 `rg`/`find`/`cat`（无退出码噪音、跨平台稳）。② 一次 Bash 只干一件相关事；多个独立探测**拆成多次调用**，别用 `;` 串成一坨——一条踩雷会让整串标红且看不出是哪条。③ 不要 `2>/dev/null` 灭掉 stderr，出错时它是唯一线索。④ `rg`/`grep` 的退出码 `1`=无匹配、`2`=出错，**都不等于"我的命令失败"**；纯探测用 `|| true` 兜平、只看 stdout。⑤ 跨目录用 `git -C <dir>` 而非 `cd <dir> &&`；跑命令前自检不得残留 `<…>` 尖括号占位符（bash 会当重定向，直接语法错）。
- **代码质量门禁**：风格一致性靠工具不靠自觉。实现任一任务后必须跑通 constitution §3 的 format/lint/typecheck/test，任一不过不算完成；遵守 §3 可维护性规则（命名、复杂度上限、复用优先、分层方向）。
- **防全局功能偏移（大项目后期）**：① 写前先 Grep 复用既有代码、沿用既有命名与分层，绝不重复造轮子；② 合并到主干前必须过**合并门**——全量测试套件 + lint/typecheck + 架构 fitness（依赖方向/分层/重复率），任何老功能测试报红就是改坏了它、禁止合并。
- **保持轻量（防文档膨胀）**：① 分级——琐碎改动直接做不建规格；小功能用 `/sdd:specify --lite`（单文件）；只有较复杂的才走完整流程。② 对账后冻结——合并前先 reconcile：把实现期偏移回填进规格、使"规格= 实际所建"（实现中偏离 design 要记入 `## Deviations`），**对账后才冻结**，之后不再同步代码（代码才是运行时真相）；要改已上线功能就**新开一份小规格(delta)**、头部标 `Delta-of: MMM-target`，不重写老文档。③ 归档——完成的 feature 移到 `specs/archive/NNN/`；**delta 归进源** `specs/archive/MMM-target/deltas/NNN/`（并在源 COMPLETION.md 记一行变更日志），让源功能历代变更集中可查、不散成孤立 NNN。
- **延后不丢（防功能漏掉）**：实现/推进中决定"现在不做、未来补"的范围 = **延后**（区别于"做成了别的样子"的偏移）。延后**必须落项目级 `specs/BACKLOG.md`**（不只记 Deviations——那会随归档沉底），绝不只在对话里答应。`/sdd:status` 常驻显示待补齐、`/sdd:specify` 起新功能时回捞、`/sdd:verify`/`finish` 收尾时勾掉或再提醒——全链路保证延后项不被漏。
- 项目首次用 SDD：先 `/sdd:init`（一次性建结构+生成宪法+激活能力包+接纪律）。
- **SDD 产物归 SDD**：规格/设计/任务一律按 SDD 模板生成，**不要转交其他插件/框架的 skill（如 Superpowers）来写**——它们模板与门禁不同，会破坏 SDD 结构与可追溯。
- 两种用法：**自动驾驶** `/sdd:auto <想法>`（一条命令跑全流程，只在人工卡点停下让我选）；或**手动逐步** `/sdd:specify` → `/sdd:clarify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` → `/sdd:verify`。并发用 `/sdd:worktree`、`/sdd:sync`，随时 `/sdd:analyze`、`/sdd:status`。
