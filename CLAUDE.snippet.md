<!--
把下面这段粘进【使用本工作流的目标项目】根目录的 CLAUDE.md。
作用：让 Claude 每次会话都自动遵守"规格优先"纪律。SDD 命令本身由你手动触发，
这段只是强化全局约束，不是必需，但推荐。
-->

## 开发纪律 / Spec-Driven Development

本项目采用 SDD（规格驱动开发）。**文档即事实来源**，代码是规格的产物。

- 权威规格在 `specs/`：`constitution.md`（全局宪法）+ 每个功能二选一的事实源：full=`NNN-slug/{requirements,design,tasks}.md`，lite=`NNN-slug/spec.md`。不得要求 lite 同时存在 full 三件套。
- 动手实现前，full 必须已有经我确认的 requirements → design → tasks；lite 必须已有经我确认且含 What/How/Tasks/Quality 的 spec.md。缺失才提示走对应阶段，不要凭对话直接写功能代码。
- 任何代码改动都要能追溯到某条 requirement / 某个 task。想到规格外的改进，记下来告诉我，由我决定是否新开任务，不要擅自扩张范围。
- 一切实现必须遵守 `specs/constitution.md`；需偏离时先停下说明、等我批准。
- **文档自动评审（对齐把关）**：每出一份规格文档即**默认自动派评审**——`/sdd:specify`→`spec-reviewer`、`/sdd:plan`→`design-critic`、`/sdd:tasks`→design↔tasks 覆盖自检；评审 🔴 分两类：**歧义/需定夺的先转 `[NEEDS CLARIFICATION]` 走 `/sdd:clarify` 问我消歧（消歧优先、不许自己猜）**，只有机械类（措辞不可测、漏明显边界 AC、可追溯缺口、违宪格式）才**自修再评（最多 2 轮 bounce-back）**。**意图红线**：自修只动"说清楚/说完整"，绝不擅自改"做什么"（改 Goals/范围/技术方向/未定阈值的交我拍板）。`/sdd:auto` 各阶段卡点会带上评审 Verdict。
- 实现阶段（`/sdd:implement`）以**三角色隔离编排器**运行，状态只能按 pending→implementing→implemented→verifying→verified→reviewing→passed 推进。每个任务依次派三个互不共享上下文的 fresh agent：Implementer 只修改实现/测试代码，不执行完成门禁；Verifier 只运行非写入 format-check/lint/typecheck/test 并逐条提交 Done when/AC evidence，核对前后工作树必须一致；Reviewer 只读真实 diff、规格和 Verifier 工件。三者只通过结构化工件传递，禁止复用聊天历史或自签下一阶段。只有证据完整且 Reviewer `PASS` 才可标 `[x]`。
- **可选 Workflow 编排**：`/sdd:implement` 默认走提示词编排；只有本次显式传 `--workflow` 才启动动态 Workflow。启动前校验 tool allowlist 与 Git 可审计范围；任何 agent 空结果/`null`/异常立即终止并返回 `runtimeFailures`，不得合成成功或空转。只有 journal 证明未启动、Git 快照与 baseline 完全一致时才可由用户显式有界重试；最多 2 次，第三次 blocked。Workflow 只确定性控制调度/依赖，Git auditor 不是文件系统沙箱。
- **Feature 单一事实源（硬不变量）**：一个 feature = 一个 `sdd/NNN-slug` 分支 = 一个独立 worktree = 同一套规格、代码、任务状态文件（full=`tasks.md`；lite=`spec.md`）和 `COMPLETION.md` 验证证据。除 trivial 直改外，先从主 worktree 执行 `/sdd:worktree start <slug>`，再进入新目录；full 跑 specify→plan→tasks→implement→verify，lite 跑 specify→按需 clarify→implement→verify。**第一行规格就写在 Feature Worktree，不得把规格留主干、代码写旁路 worktree**。
- **防撞功能编号与分支复用**：NNN 由 `/sdd:worktree start`/`auto` 扫 `specs/`、archive/deltas、所有 `sdd/*` 分支和 worktree 后统一分配。已有 worktree 就复用；旧版只有分支没有 worktree 时，用 `git worktree add <path> sdd/NNN-slug` 附着，**不得再用 `-b` 重建同名分支**；已在 Feature Worktree 内就复用分支身份，不重新分配编号。
- **旧版 split-brain 迁移**：若规格只在主 worktree、代码在 Feature Worktree，`implement`/`verify` 必须停下；将完整 `specs/NNN-slug/` 转移到 feature 分支，核对 requirements/design/tasks/COMPLETION 与实现、提交后再继续。不得按时间戳猜新旧、不得静默覆盖或让两份长期共存。
- **跨 feature 共享信息**：只能共享**已提交**的内容（先 commit 再 `/sdd:sync`），共享契约以规格层为权威；可预见的公共部分先抽成 foundation feature 落 main。
- **Bash 执行纪律（降低命令报错/误判）**：① 找代码/路径/定义这类侦察优先用 Grep/Glob/Read 工具，不用 bash 的 `rg`/`find`/`cat`（无退出码噪音、跨平台稳）。② 一次 Bash 只干一件相关事；多个独立探测**拆成多次调用**，别用 `;` 串成一坨——一条踩雷会让整串标红且看不出是哪条。③ 不要 `2>/dev/null` 灭掉 stderr，出错时它是唯一线索。④ `rg`/`grep` 的退出码 `1`=无匹配、`2`=出错，**都不等于"我的命令失败"**；纯探测用 `|| true` 兜平、只看 stdout。⑤ 跨目录用 `git -C <dir>` 而非 `cd <dir> &&`；跑命令前自检不得残留 `<…>` 尖括号占位符（bash 会当重定向，直接语法错）。
- **代码质量门禁**：Implementer 不给自己验收；由 fresh Verifier 跑 constitution §3 的非写入 format-check/lint/typecheck/test 并逐条证明 Done when/AC，回报实际命令、退出码、摘要和日志位置。任一非零、`not_run`、证据缺失或 Verifier 导致工作树变化都不算完成。禁止用 skip/only、恒真断言、过宽 mock、禁用类型/lint、降低覆盖率或删除回归来换绿灯。
- **风险分层测试（§4）**：覆盖每条 AC，但"怎么覆盖"要相称、复用优先。历史 Bug、公共契约、鉴权安全、状态机/领域不变量、迁移、并发事务、共享核心能力必须留持久回归测试；探索、一次性诊断、硬件/外部探针才可 ephemeral。"每 AC 有覆盖" ≠ "每 AC 一个新测试类"：优先扩展既有 harness，小改只加少量聚焦用例，绝不删除高价值回归。
- **防全局功能偏移（大项目后期）**：① 写前先 Grep 复用既有代码、沿用既有命名与分层，绝不重复造轮子；② 合并到主干前必须过**合并门**——对改动模块跑编译（含类型检查）+ 架构 fitness（依赖方向/分层/重复率）+ **受影响的持久测试**，任一失败或证据不完整即禁止合并；共享核心/影响范围无法可靠收窄时扩大到对应完整套件。
- **保持轻量（防文档膨胀）**：① 分级——琐碎改动直接做不建规格；小功能用 `/sdd:specify --lite`（单文件）；只有较复杂的才走完整流程。**注意：分级省的是规格阶段、不是合并门——lite 一样 merge 进 main、一样能改坏别人，故 lite 照走 `/sdd:worktree finish` 合并门（凡入 main 必走、不按大小豁免；成本随改动范围由 cache 伸缩，lite 很便宜）。Trivial 直接改不经 finish 故无门，但碰共享/跨模块代码要升级到 lite 走门。**② 对账后冻结——合并前先 reconcile：把实现期偏移回填进规格、使"规格= 实际所建"（实现中偏离 design 要记入 `## Deviations`），**对账后才冻结**，之后不再同步代码（代码才是运行时真相）；要改已上线功能就**新开一份小规格(delta)**、头部标 `Delta-of: MMM-target`，不重写老文档。③ 归档——完成的 feature 移到 `specs/archive/NNN/`；**delta 归进源** `specs/archive/MMM-target/deltas/NNN/`（并在源 COMPLETION.md 记一行变更日志），让源功能历代变更集中可查、不散成孤立 NNN。
- **延后不丢（防功能漏掉）**：实现/推进中决定"现在不做、未来补"的范围 = **延后**（区别于"做成了别的样子"的偏移）。延后**必须一项一文件落到项目级 `specs/backlog/BL-*.md`**（`specs/BACKLOG.md` 仅索引/兼容旧条目），绝不只在对话里答应。`/sdd:status` 常驻聚合、`/sdd:specify` 回捞、`/sdd:verify`/`finish` 收尾更新状态。
- 项目首次用 SDD：先 `/sdd:init`（一次性建结构+生成宪法+激活能力包+接纪律）。
- **SDD 产物归 SDD**：规格/设计/任务一律按 SDD 模板生成，**不要转交其他插件/框架的 skill（如 Superpowers）来写**——它们模板与门禁不同，会破坏 SDD 结构与可追溯。
- 两种用法都先建立 Feature Worktree：**自动驾驶**从主 worktree 运行 `/sdd:auto <想法>` 创建/定位 worktree，进入新目录续跑；或手动 `/sdd:worktree start <slug>`，进入新目录后依次 `/sdd:specify` → `/sdd:clarify` → `/sdd:plan` → `/sdd:tasks` → `/sdd:implement` → `/sdd:verify`。完成后回主 worktree 串行 `finish`；随时可在主 worktree `/sdd:status`。
