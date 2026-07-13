# SDD — Spec-Driven Development for Claude Code

一套**可复用、轻量**的规格驱动开发工作流，打包成 Claude Code 插件。核心理念：**文档即事实来源，AI 基于明确规格实现，阶段间设人工卡点**，杜绝"vibe coding"式的失控。

> 适用：以 Claude Code 为核心开发工具、希望把同一套纪律复用到多个项目。

**能力全景**（v0.29）—— 从一个想法到上线，全链路有据可依、并发安全、质量兜底：

| 维度 | 提供什么 |
|------|---------|
| **全流程驱动** | `/sdd:init` 一键初始化项目 · `/sdd:auto` 自动驾驶（人工卡点引导你选）或手动逐步：立宪→规格→设计→拆解→实现→验证→收尾 |
| **核心引擎**（防偏移·并发） | 🧊 实现期每任务 fresh Implementer→Verifier 双上下文隔离 · ⚡ Boundary+Waves 并发 · Git auditor 对实现/核对前后快照 fail closed |
| **质量 & 防全局偏移** | Verifier 提交 format/lint/typecheck/test 的命令+退出码证据 · `/sdd:verify` 对完整 feature diff 统一派一次 Reviewer · 关键回归持久化 · 合并门 |
| **并发协作** | **一 feature 一分支一 worktree**，规格/代码/进度/证据同源 · `/sdd:sync` 跨 feature 共享 · `/sdd:status` 派生式仪表盘 + 实时心跳 |
| **领域覆盖** | 能力包注入：全栈/移动/小程序/H5/PC/服务端/数据库/嵌入 + 任意 Claude Code skill |
| **知识辅助** | 24 种设计模式 + 工程原则(SOLID/Clean/DDD/12-Factor/高可用) 辅助 design 选型 |
| **可选加速** | 显式 `--workflow` 的动态 Workflow 编排（默认不自动拉起；§8 可彻底禁用） |
| **保持轻量** | lite 分级 / 完成即冻结归档 / 自动右尺寸——文档量随"在建功能数"走，不随项目历史膨胀 |

> 最初为解决"后期繁重 / 实现后偏移 / 不支持并发"三大痛点而生（核心引擎的隔离 + 并发两条），后续逐步补齐质量、并发协作、领域覆盖与知识层。

---

## 设计哲学 / Design Philosophy

整套框架在并发 + 长期演进下不崩，靠的是一条主线和几条原则：

> **拒绝"一份大家都来改的共享可变文档"**——它要么腐烂撒谎，要么冲突串行。
> 改成：**把真相锚定在对的地方（代码 / git），需要时"对账"或"派生"出视图。**

1. **文档即事实来源，但必须保持真实**：规格是权威，可一旦失真就毒害所有下游（隔离子代理、verify、analyze 都信它）。所以**冻结前先对账**（reconcile）把规格校准到"实际所建"，再封存——之后不追代码，要改就开新 delta。
2. **真相锚定，视图派生**：状态不存一份共享文件——**一功能一份**存各自目录（归属由 git worktree 唯一确定），**全局仪表盘实时派生、零落盘** → 多终端并发零冲突零串行。
3. **确定性工具 > AI 自觉**：风格/架构一致性靠 formatter/linter/typecheck/fitness；Boundary 用静态范围与独立 Git 快照对账，不只采信 implementer 的文件自报；最终 feature Reviewer 再检查整体 diff。Git auditor 是 agent 介导的证据源，不冒充文件系统沙箱。
4. **局部隔离，全局设门**：任务级隔离实现与核对；全部任务完成后，`/sdd:verify` 做一次 feature 级独立 code review 并逐条验证 AC；合并门再运行改动模块编译、架构 fitness 与受影响回归测试。
5. **双角色实现、统一终审**：实现期每任务只使用两个 fresh context——Implementer 只修改、Verifier 只核对；Verifier 通过即可完成任务，禁止紧接着派 Reviewer。所有任务完成后才用第三个 fresh context 审整个 feature；角色之间只传结构化工件，不共享聊天上下文。
6. **克制优先**：能跳过就跳过（trivial 不上 SDD）、小事走 `--lite`、完成即冻结归档、YAGNI 不为用而堆模式/架构——文档量随"在建功能数"走，不随项目历史无限涨。

---

## 工作流一览

```
 /sdd:constitution → /sdd:stack → /sdd:specify → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:verify
   立宪(一次性)        注入能力包    需求          消歧          设计        拆解         实现(编排)       行为验证
                       全栈/移动/小程序…                                  波次并发+隔离           ⇅
                                                                    /sdd:analyze  静态一致性自检(随时)
```

**两种用法**：① **手动逐步**——自己依次敲下面的命令，每步审完再敲下一个（最强把关）。② **自动驾驶**——`/sdd:auto <想法>` 一条命令把全流程跑下去，**只在人工卡点停下让你选**（省去逐个敲命令）。两者共用同一套规则与门禁。

| 命令 | 阶段 | 产出 | 只回答 |
|------|------|------|--------|
| `/sdd:init [--vendor]` | **项目初始化（一次性）** | specs/ 结构 + 宪法 + CLAUDE.md | 一条命令把 SDD 装进当前目录：建结构+自动生成宪法+激活能力包+接纪律 |
| `/sdd:auto <想法>` | **全流程驱动** | 串起下列全部 | 自动推进 + 卡点停下让你选（approve/改/暂停），可 `resume` 续跑 |
| `/sdd:constitution` | 立宪（一次性） | `specs/constitution.md` | **自动扫项目（任意语言）**识别技术栈+采用已有门禁命令，生成宪法草稿供确认 |
| `/sdd:stack [list\|add\|new\|skill]` | 能力注入 | `specs/stacks/*.md` | 注入领域能力包（全栈/移动/小程序/H5/PC/服务端/数据库）与 skill |
| `/sdd:specify <想法> [--lite]` | 需求 | full=`requirements.md`；lite=`spec.md` | 做什么、为谁、可度量成功标准；lite 同文件含 How/Tasks/Quality |
| `/sdd:clarify` | 消歧 | 回填 requirements | 把模糊点逼出来再设计 |
| `/sdd:plan` | 设计 | `specs/NNN-slug/design.md` | 怎么做：架构/数据/接口/选型（遵循能力包约定） |
| `/sdd:patterns [问题]` | 设计选型参考 | 推荐/详解 | 24 种设计模式的适用场景/解决的问题/慎用，辅助 plan 选型 |
| `/sdd:principles [问题]` | 工程原则参考 | 推荐/详解 | 设计原则(SOLID…)/架构方法(Clean/DDD…)/12-Factor/高可用，辅助 plan 选型 |
| `/sdd:tasks` | 拆解 | `specs/NNN-slug/tasks.md` | 原子任务 + Boundary + Waves + `Risk/Review/Test policy` |
| `/sdd:implement [next\|T1\|wave 2\|--workflow]` | 实现（**编排器**） | 代码 + evidence + 评审记录 + 任务状态 | 默认提示词编排；显式 flag 才用 Workflow；Git-visible diff 对账 Boundary；高风险/偏移/共享边界必审 |
| `/sdd:verify` | 行为验证 | punch list + `COMPLETION.md` | 按 AC 实跑，保留命令/退出码/日志；关键行为缺持久测试即不通过 |
| `/sdd:analyze` | 静态自检 | 一致性报告 | 需求↔设计↔任务↔代码 有无脱节（静态） |
| `/sdd:status [mine]` | 项目仪表盘 | 派生只读总览 | 各 feature 归哪个终端、进度、门禁健康（多终端并发安全） |
| `/sdd:worktree [start\|list\|finish\|abort]` | Feature 生命周期 | git worktree | 非 trivial feature 的单一入口；finish 事务化执行门禁、合并、归档与安全清理 |
| `/sdd:sync [main\|from <feature>] [--rebase]` | 跨终端同步 | 合并/变基 | 把别的 feature 已提交成果或最新 main 拉进当前 worktree |
| `/sdd:version` | 查看版本 | 只读输出 | 报告当前 SDD 插件版本号、安装位置与本版要点 |

**人工卡点**：所有命令都设了 `disable-model-invocation: true`，**只能你手动触发**——AI 不会自己跳阶段。每个阶段写完即停，等你审阅再敲下一个命令。

附带**五个子代理**：
- `implementer` — fresh context，只修改单个任务的实现与测试，不执行完成门禁
- `verifier` — fresh context，只运行非写入门禁并提交 Done when/AC 证据，不修改代码
- `code-reviewer` — `/sdd:verify` 中唯一的 fresh context，只读完整 feature diff、规格与全部 Verifier 工件，审查整体实现质量
- `spec-reviewer` — 审 requirements（歧义、不可测、漏边界、范围蔓延）
- `design-critic` — 审 design（过度/欠设计、漏失败模式、违宪、可追溯缺口）
- `api-tester` — 基于 OpenAPI/设计契约/AC 做接口级测试与证据采集

这些代理由对应阶段自动调度；通常不需要手动调用。

---

## 安装（三选一）

仓库同时是插件和 marketplace。推荐使用 Claude Code 的标准插件管理，不要把整个插件复制进 `~/.claude/skills`（那会丢失插件命名空间、hooks、agents 与升级能力）。CI 以 Claude Code `2.1.205` 严格模式验证。

### 方式 A：从 GitHub marketplace 安装（推荐）

在 Claude Code 中运行：

```text
/plugin marketplace add Ayunxx/.sdd
/plugin install sdd@ayunxx-sdd
/reload-plugins
```

默认是用户级安装，所有项目可用 `/sdd:*`。详见 [Claude Code 官方插件安装文档](https://code.claude.com/docs/en/discover-plugins)。

### 方式 B：本地开发/试用

```bash
git clone https://github.com/Ayunxx/.sdd.git Ayunxx-sdd
claude --plugin-dir "/absolute/path/to/Ayunxx-sdd"
```

`--plugin-dir` 直接加载当前工作副本，适合开发插件；改完可 `/reload-plugins`。

### 方式 C：项目级共享安装

在项目根目录执行：

```bash
claude plugin marketplace add Ayunxx/.sdd --scope project
claude plugin install sdd@ayunxx-sdd --scope project
```

这会把启用信息写入项目配置，团队成员信任仓库后可获得一致的插件来源。安装后若命令没出现，运行 `/reload-plugins` 或重启 Claude Code。

需要把命令与 Workflow 运行时直接提交进仓库时，可在初始化时显式使用 `/sdd:init --vendor`。固定布局为 `.claude/skills/`、`.claude/agents/`、`.claude/sdd/workflows/` 与 `.claude/sdd/stacks/`；其中 `workflows/` 必须整体同步，不能只复制入口脚本。vendored 命令不带 `sdd:` 前缀，插件升级后需重新同步并评审差异。

---

## 在新项目里怎么用

```
1. cd 到你的新项目，启动 claude
2. /sdd:init                    # 一次性：建 specs/ 结构 + 自动生成宪法 + 激活能力包 + 接上 CLAUDE.md 纪律
3. /sdd:auto 用户能用邮箱密码注册登录   # 在主 worktree 创建/定位 Feature Worktree，然后给出绝对路径并停下
4. cd ../<repo>--001-user-auth && claude
5. /sdd:auto 用户能用邮箱密码注册登录   # 新 worktree 尚无规格，重输原想法；已有产物时才用 resume
6. 回主 worktree：/sdd:worktree finish 001-user-auth
```
> 手动模式：先在主 worktree `/sdd:worktree start <slug>`，进入返回的新目录后依次运行 `/sdd:specify → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:verify`。功能规格第一行起就与代码处在同一 feature 分支；主 worktree 只维护已提交的项目级 init/constitution/stack 基线、全局 `/sdd:status` 与串行 `finish`。

**推荐**：把 `CLAUDE.snippet.md` 的内容粘进目标项目的 `CLAUDE.md`，强化"规格优先"纪律。

**可选 · 自动反压**：把 `hooks/hooks.example.json` 里的 `<YOUR_TEST_CMD>` 换成你项目的快速测试命令，启用后每次落地编辑就自动跑测试、失败回灌让 Claude 当场自纠（详见该文件注释）。

产出物结构：
```
your-project/
├── CLAUDE.md                       # 粘入 SDD 片段
└── specs/
    ├── constitution.md             # 项目宪法
    └── 001-user-auth/
        ├── requirements.md
        ├── design.md
        ├── tasks.md
        └── COMPLETION.md   # /sdd:verify 生成的功能完成度报告（AC/任务/偏移/遗留）
```

---

## 两大机制如何落地

**🧊 双角色实现隔离 + feature 统一终审（防偏移）** — `/sdd:implement` 为每个任务只派 fresh Implementer 与 fresh Verifier，两者通过结构化 files/evidence 交接，不共享会话历史；Verifier 通过即完成任务，禁止立即派单任务 Reviewer。全部任务完成后，`/sdd:verify` 才派一个 fresh `code-reviewer` 审完整 feature diff。

**⚡ 波次并发** — `/sdd:tasks` 给每个任务标 `Boundary`（独占文件领地）和 `Depends`，并算出 `Waves`：同一波内相互独立、Boundary 不重叠的任务，编排器**在一条消息里并行派多个子代理**同时干。理论最短轮数 = Wave 数，而非任务数。
> 并发安全靠 Boundary 与独占 Resources 不重叠保证。若两任务必须改同一文件/资源 → 让它们落到不同 Wave。任务级 `isolation: "worktree"` 只可用于默认提示词编排，且必须提前在 design/tasks 写明合并协议并获用户批准；确定性 Workflow 会以 `UNSUPPORTED_TASK_ISOLATION` 拒绝，绝不运行中临时切换。

> **质量怎么保证** — Implementer 只返回实际 changed files；随后 fresh Verifier 运行非写入 format-check/lint/typecheck/test，并返回 Done when/AC `acceptance[]` 与结构化 evidence。显式 Workflow 在 Implementer 后、Verifier 后各取 Git 快照，Verifier 产生任何写入都会让整 Wave fail closed。所有任务完成后，`/sdd:verify` 只派一次 fresh `code-reviewer` 审完整 feature diff、规格和全部 Verifier 工件，并检查 skip/only、恒真断言、过宽 mock、禁用检查、覆盖率下降和回归删除；随后功能级复验 AC，`finish` 再跑合并门。

## 多终端并发安全 / Git Worktree（v0.4）

**问题**：一台电脑开多个终端跑 Claude，若都在**同一个目录**，它们共享同一个工作树和 HEAD——A 终端 `git checkout/reset/切分支` 会改写整个目录，**把 B 终端没提交的改动 reset 掉**。⚠️ 光"新建分支"救不了：同目录里工作树只有一个。

**正解**：`git worktree` —— 从同一仓库长出多个物理隔离目录，各挂各的分支、共享同一个 `.git`。v0.29 把它提升为生命周期硬不变量：**一个 feature = 一个 `sdd/NNN-slug` 分支 = 一个 worktree = 同一套规格、代码、任务状态与验证证据**。

编号不是“先扫 `max+1` 再碰运气”：`start` 会用永久 `refs/sdd/feature-ids/NNN` 做 expected-absent CAS，先原子占住**纯 NNN**再建分支；因此两个终端同时创建 `005-a`/`005-b` 也只能一个拿到 005，显式复用已被别的 slug 占用的编号同样会被拒绝。

```
/sdd:worktree start user-auth         # 原子分配编号 + 建 sdd/001-user-auth + sibling worktree
#   → 进入返回的绝对路径，在那里从 specify 跑到 verify
/sdd:worktree list                    # 看所有 worktree 及对应 feature
/sdd:worktree finish 001-user-auth    # 在主 worktree 串行：预检→证据门→合并→归档提交→最后清理
/sdd:worktree abort 001-user-auth     # 不合并直接丢弃（确认后）
```

**两级并发，各管各的：**
- **跨 feature**（多终端/多人同时做不同功能）→ 用 **worktree**（本节）。
- **单 feature 内**（一个功能拆出的多任务）→ 用 `/sdd:implement` 的 **Boundary + Waves**，并行子代理在同一个 worktree 内按文件领地不重叠并行，不碰 git（只有编排器提交）。

**两个 feature 有交叉怎么共享信息？** 核心原则：**跨终端只能共享已提交的内容**（未提交的工作互相不可见），共享的契约以**规格层**为权威。
- **① 共享底座（最佳）**：可预见的公共部分抽成 `000-shared-*` foundation feature，**先落 main**，A/B 再从更新后的 main 起步——交叉消失在源头。
- **② 临时取用**：B 要用 A 已提交的成果 → 在 B 里 `/sdd:sync from <A-slug>`（共享 `.git`，无需网络，秒级合入）。
- **③ 跟进主干**：A 已并入 main → `/sdd:sync` 拉最新 main。
- **④ 抢热点文件**（路由表/`app.json`/store 入口）：定单一 owner 改，或设计成追加式，合并时局部解冲突。
> ⚠️ 想共享，就**小步早提交**——未提交的改动其它 worktree 永远看不到。

> 不想用 worktree 的替代方案：要么每个并发任务单独 clone 一份仓库（重）；要么同一时刻只允许一个终端动 git（退化为串行）。worktree 是隔离与开销的最佳平衡。

## 大项目防全局偏移 / Anti-Drift at Scale（v0.8）

> 局部门禁（每个任务/功能写对）≠ 全局健康。后期"新功能与最初对不上、代码越来越冗余"是**跨功能、随时间累积**的全局问题，要靠下面三道全局防线：

**① 合并门 = 改动模块编译 + 架构 fitness + 受影响持久测试**
- `/sdd:worktree finish` 依据 `base...feature` diff 定位改动模块，三类门禁全部有实际命令、被测 SHA、退出码与摘要才准合并。
- gate 前要求 feature 已包含当前 base；gate 期间若 base SHA 变化则停止并重新同步/验证，避免“在旧主干上全绿、合到新主干后出错”。
- 测试采用 affected 范围：正常只跑改动模块及依赖范围；触及共享核心/公共契约或无法可靠收窄时扩大到对应完整套件。全量回归可放 PR/nightly，但不能把“不跑测试”当成本地默认。
- 成本随改动范围伸缩；Maven/Gradle/Nx/Turbo/pytest 等可用缓存与并行。纯 docs/注释允许 `N/A(理由)`，不允许空证据。

**② 架构适应度函数**（防架构侵蚀 + 治冗余）
- 宪法 §3 声明、自动跑：依赖方向 / 禁止 import / 分层边界 / 复杂度上限 / **重复率阈值（jscpd）**。
- 工具：dependency-cruiser、import-linter、eslint-boundaries、jscpd。**架构靠工具守，不靠 AI 记忆。**

**③ 源头防冗余/防"对不上"**（在写之前）
- implementer 动手前**先 Grep 既有代码复用**、沿用既有命名与分层，绝不重复造轮子（隔离子代理最容易各写各的）。
- 架构 fitness 的**重复率阈值（jscpd）**把"重复造轮子"钉成合并门硬指标；风格脱节由 formatter/linter 统一归一化。

> 链路：写前复用发现 → 真实 diff Boundary 审计 → 独立风险 review → `/sdd:verify` AC 证据 → **合并门编译 + fitness + affected tests**。各层解决不同失效模式。

## 保持轻量 / Keeping it Lean（v0.7）

> 直面"文档会不会越来越重、越来越难维护"——会，除非刻意踩刹车。本框架用三条规矩控重：

**① 分级，别什么都上完整流程**
| 规模 | 走法 | 产物 |
|------|------|------|
| Trivial（单文件改/格式/明确小改） | **跳过 SDD**，直接对话做 | 无 |
| Small（1–3 文件、单一明确） | `/sdd:specify --lite` → `/sdd:implement` → scoped `/sdd:verify` | **单个 `spec.md`** + COMPLETION |
| Normal/Large（多文件、有不确定性） | 完整流程 | requirements/design/tasks |

> ⚠️ **分级省的是"规格阶段"，不是"合并门"**：lite 一样会 merge 进 main、一样能改坏别的功能，所以 **lite 照走合并门**（凡入 main 必走，不按大小豁免）——别怕慢，门成本随改动范围由 cache 自动伸缩，lite 只动一两个模块、门很便宜。Trivial 直接改不经 finish 故无门，但**若碰到共享/跨模块代码就该升级到 lite 走门**（"小"是文件数小，不是风险小）。

**② 对账后冻结，别永远同步老文档**
- 实现期难免有业务/技术偏移——这些偏移**当场记入 design 的 `## Deviations` 段**，别让文档默默停更。
- 合并前做一次 **reconcile（对账）**：把偏移回填进 requirements/design，使**冻结的规格 = 实际所建**（`/sdd:worktree finish` 已内置这步）。
- **对账后才冻结**：之后不再回头改它去追代码（代码才是运行时真相）；要改已上线功能 → **新开一份小规格(delta)**，不重写整篇老文档。delta 头部用 **`Delta-of: MMM-target`** 标明改的是谁——这样它合并后会**物理归档进源** `specs/archive/MMM-target/deltas/`，源功能历代变更集中一处可查，不再散成孤立 NNN。
- 这样既不"永远同步"（卸掉维护噩梦），又保证冻结那刻规格是真的（借鉴 cc-sdd「code is source of truth」+ OpenSpec delta）。

**③ 归档，别让活跃集无限膨胀**
- 完成（合并）的 feature → `specs/archive/NNN-slug/`，Status 改 `Archived`（`/sdd:worktree finish` 会询问归档）。**delta 则归进源** `specs/archive/MMM-target/deltas/NNN-slug/`，并在源 COMPLETION.md 的 `## Change Log / Deltas` 记一行。
- 活跃 `specs/` 只剩在建功能 + constitution + stacks；历史在 archive/ 和 git 里随时可查。

> 一句话：**小事走 lite、老规格冻结归档、改动用 delta**——文档量随"在建功能数"走，而不是随"项目历史长度"无限累积。

## 延后不丢 / Deferred-Work Backlog（v0.25）

> 治一个真实的漏：实现/推进中决定"**这块现在不做、未来补**"，过去只在对话里答应一句、或顶多记进 `design §11 Deviations`——而 Deviations 随 feature 归档沉底，到该补的时候**直接漏掉**。

- **专用台账**：项目级一项一文件 `specs/backlog/BL-<featureNNN>-<seq>.md`（`/sdd:init` 建目录）；`specs/BACKLOG.md` 只作索引/旧版兼容。跨 feature 添加不同文件，避免所有分支同时改一个列表尾部。
- **延后 ≠ 偏移**：偏移（"做成了别的样子"）记 `Deviations`、对账后冻结；延后（"没做、要以后做"）进 BACKLOG、会被**主动回捞**。两者语义不同、落点不同。
- **全链路防漏（写入 → 常驻 → 回捞 → 关闭）**：
  - **写入**：`/sdd:implement`、`/sdd:auto` 对 Source/AC/Content/Reason/Target 的 canonical JSON 算稳定 decision digest，再用永久 backlog-id ref CAS 原子占号并新建 item；同 Source 的不同内容/原因不会误当中断恢复。
  - **常驻**：`/sdd:status` 永远显示"📌 待补齐"段——谁打开看板都看得见还欠什么，这是"绝不静默漏掉"的硬保证。
  - **回捞**：`/sdd:specify` 起新功能时扫 items，把相关/Target 指向本次的项主动列出；纳入即把对应文件改为 `Status: scheduled` 并记录 `Scheduled-in`。
  - **关闭**：`/sdd:verify` / `worktree finish` 收尾时把本功能补齐的项标 `[x] 已补齐`，仍开着的再提醒一次。
- **老项目兼容**：旧 `specs/BACKLOG.md` 条目继续只读展示；新条目一律写 item 文件，可在实际处理旧条目时有意迁移。再跑 `/sdd:init` 只补 `specs/backlog/` 与索引说明，不覆盖旧内容。

## 文档自动评审 / Auto-Review & Alignment（v0.26）

> 评审能力（`spec-reviewer`/`design-critic`/`/sdd:analyze`）一直都有，但过去是"**建议你跑**"——漏跑就没把关。v0.26 把它升级成**默认自动派发 + 反压自修**：每出一份规格文档，自动派评审 agent 查对齐，评审出 blocking 就按需自修再评（bounce-back，最多 2 轮）。

- **每阶段生成即评审**：`specify`→`spec-reviewer`（requirements）、`plan`→`design-critic`（design，专查偏离 requirements/宪法、可追溯缺口、过度/欠设计）、`tasks`→design↔tasks 覆盖/越界/Boundary 自检。`--lite` 也跑一轮轻量评审。
- **反压自修（bounce-back）**：评审回 Verdict（🟢/🟡/🔴）。🔴 → **只针对 blocking 项自修文档 → 再评**，最多 2 轮；2 轮仍 🔴 → 停下报用户，不无限磨。
- **歧义走消歧、不自己猜（关键）**：评审的 blocking 分两类——**歧义/未定阈值/产品决策**这类 → 转 `[NEEDS CLARIFICATION]`、**先走 `/sdd:clarify` 问你**（消歧优先于自修，猜歧义=制造意图偏移）；只有**机械类**（措辞不可测但有明确写法、漏掉的明显边界 AC、可追溯缺口、违宪格式）才自修。
- **意图红线（关键）**：自修**只动"怎么把它说清楚/说完整"**，**绝不擅自改"做什么"**——凡涉及改 Goals/范围/技术方向/未定阈值的，交用户拍板。评审是质量把关，不是替你重定义需求。
- **全自动也不漏审**：`/sdd:auto` 各阶段在 🚦 卡点前自动评审，把 Verdict 折进卡点让你看到——以前全自动反而跳过评审的盲区补上了。

## 代码风格一致性与可维护性 / Code Quality Gate（v0.6）

**为什么需要**：风格一致性靠 LLM"自觉"保证不了——而本框架用**隔离子代理并行**实现，更放大了风格漂移风险（多个 fresh worker 习惯各异）。答案是**确定性工具统一强制**：formatter + linter + type-checker 在宪法里钉一次、每个任务自动跑。

**五层防御（配置一次，按风险自动伸缩）：**
1. **声明层** `constitution.md §3/§4`：钉死真实门禁命令、架构规则、持久/临时测试边界与 affected suite 策略。
2. **实现层** fresh Implementer：只修改 Boundary 内实现与测试，只返回 changed files，不执行完成门禁。
3. **核对层** fresh Verifier + Git auditor：Verifier 运行非写入门禁并返回 `{gate, outcome, command, exitCode, summary}` 与 acceptance；auditor 比较实现后/核对后快照，核对者产生写入即失败。
4. **功能级统一审查层** `/sdd:verify` 只派一次 fresh `code-reviewer`：只读完整 feature diff、规格与全部 Verifier 工件，对正确性、安全、兼容性和测试充分性做对抗审查；不复用前两者上下文。
5. **行为/合并层** `/sdd:verify` 逐 AC 实跑；`finish` 对改动模块编译 + fitness + 受影响持久测试，并把结果写回 COMPLETION 后再合并。

> 可维护性（语义层）还靠：能力包的布局约定与红线、implementer"复用优先"、`/sdd:analyze` 的可维护性审计维度。也可 `/sdd:stack skill` 注入 Claude Code 自带的 `/code-review`、`/simplify`。

## 可选动态 Workflow 编排（仅显式 opt-in）

普通 `/sdd:implement` 默认使用提示词编排，不会隐式拉起 Workflow。对多波次、大 fan-out 场景，用户可显式选择动态 Workflow，把 fan-out、波间屏障、依赖 blocked 传播和返回值校验放进可复跑脚本。

**它确定性控制什么：**
- ⚡ 同 Wave 的并发调度与完整任务图上的依赖传播；发现同 Wave Boundary 重叠会在启动 agent 前拒绝计划，要求拆到不同 Wave，避免共享快照下的覆盖/撤销误判。
- 🛑 `agent()` 返回空结果/`null`/throw 或 `parallel()` 缺项时立即终止当前 run，返回带 `stage/label/wave/task` 的 `runtimeFailures`，不合成成功、不继续空转；只有 journal 证明未启动且 Git 快照仍等于 baseline 时才允许用户显式有界重试，最多 2 次，第三次 blocked。
- ♻️ `completedTaskIds` + `runTaskIds` 支持 `next`/指定任务/指定 Wave 的部分运行；已完成任务不重跑，依赖上下文不丢失。
- 🧾 Workflow 顺序固定为 fresh Implementer → 实现后快照 → fresh Verifier → 只读副作用快照。Implementer 不能提交 evidence，Verifier 不能改代码；双角色工件齐全后任务进入 passed，Workflow 不派 Reviewer。

**怎么用：**
```
/sdd:implement                   # 默认：提示词编排，仍按 Boundary + Waves 并发普通 implementer
/sdd:implement --workflow        # 显式：从干净 checkpoint 只跑下一未完成 Wave
```
> ⚙️ Workflow agent 继承当前会话 tool allowlist；启动前要允许 Implementer 编辑能力、Verifier 非写入 Bash 和 Git auditor 固定只读 helper。每次调用只跑一个 Wave：Implementer→快照→Verifier→快照→checkpoint；实现期不派 Reviewer。所有 Wave 完成后再由 `/sdd:verify` 统一派一次 feature Reviewer。
> ⚠️ **务必用内置脚本（任务走 `args` 传入），别现场即兴另写工作流**：Workflow 校验器会文本扫描脚本，发现 `Date.now/Math.random/new Date/setTimeout` 字面量（哪怕在注释/prompt 里）就拒绝启动（报 determinism 错）。内置脚本已合规。要时间戳走 args 或工作流返回后再盖；要 ID 用 index 派生。
> 试点只落 `implement`（fan-out 最受益）；`analyze --deep`（对抗式 fan-out）、`plan --candidates`（多方案 judge panel）标为**未来可选、暂未实现**，避免一次性铺开违背"轻量但稳"。

> 诚实边界：Workflow script 本身无直接 FS/shell，但它派生的 agent 能读写和运行命令。Git snapshot 由固定、无 shell 拼接的 helper 采集并做结构校验，仍只能验证 tracked/untracked 的前后净变化，看不到 ignored 文件、`.git`/git-common-dir、FEATURE_ROOT 外路径，也看不到“写入后恢复”的瞬时副作用；模型仍负责转运 helper 的 JSON。需要强隔离时，必须使用路径级 PreToolUse hook、OS sandbox 或独立 feature worktree，不能把这里的 Git 对账当成安全边界；Workflow 明确拒绝 task-level `isolation: worktree`，需改用默认提示词编排并预先设计合并协议。

## 门禁自动提醒 / Stop Hook（v0.15，判断层）

把"会不会忘了验收"从靠 LLM 自觉，升级成**由 hook 确定性触发**：插件自带一个 `Stop` hook，**随插件自动激活、零接入**。Claude 收工前它会被触发——

- 仅在 **SDD 项目**（有 `specs/constitution.md`）且**有未提交改动**时唤醒；
- 灌回提醒："收工前请跑 constitution §3 门禁 + 对受影响 AC 跑 `/sdd:verify` + 偏离 design 就回填 `## Deviations` 对账"；
- **循环安全**（`stop_hook_active` 守卫）+ **按改动状态节流**（同一状态只提醒一次）+ **出错一律放行**（绝不卡住会话）。
- 关掉：删 `hooks/hooks.json` 的 Stop 段。需保证 `node` 在 PATH 上（脚本为 Node.js，无外部依赖）。

> ⚠️ 诚实边界：**它只保证"触发确定"，执行仍靠 LLM**（判断层）。要"执行也确定、且挡住绕过 Claude 的提交"，需要**命令层硬门禁**（git hook / CI 直接跑校验，零 LLM）。提交信息这一层已补上 ↓；测试/CI 那层仍建议按项目自接。

## 提交规范硬门禁 / commit-msg Gate（v0.23，命令层，零 LLM）

把"commit message 规不规范"从靠自觉，升级成**git 命令层硬门禁**：插件自带 [hooks/commit-msg](hooks/commit-msg)，git 每次提交写完信息必跑它，不符合 [Conventional Commits](https://www.conventionalcommits.org) 直接**拒绝提交**——即使绕过 Claude 手敲 `git commit` 也挡得住（这正是上面那条"最强一环"）。

**规范：** `<type>(<scope>)?: <subject>`，`type ∈ feat fix docs style refactor perf test build ci chore revert`；破坏性变更加 `!`。
```
feat(auth): 增加手机号登录
fix: 修正空购物车结算崩溃
refactor(api)!: 重命名 user 字段（破坏性变更）
```

**安装（拷进目标项目，git hook 不随插件自动装）：**
```bash
# 在项目根目录执行（任选其一）
cp "$CLAUDE_PLUGIN_ROOT/hooks/commit-msg" .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
# 或软链，便于跟随框架更新：
ln -sf "$CLAUDE_PLUGIN_ROOT/hooks/commit-msg" .git/hooks/commit-msg
```
> Marketplace 插件位于 Claude Code 管理的版本化缓存中，不要硬编码缓存路径。在已加载本插件的 Claude Code 会话内使用 `$CLAUDE_PLUGIN_ROOT`；在普通外部终端则把它替换为本地 checkout/plugin 根的绝对路径。Windows 可用 Git Bash 执行。本 hook 依赖 PATH 中的 Node.js，无外部包。

**安全设计（fail-open）：** merge / revert / fixup! / squash! 自动放行；空消息交给 git 处理；脚本自身异常一律放行——门禁绝不无故卡住正常提交。**关闭：** 删 `.git/hooks/commit-msg`，或单次 `git commit --no-verify`。

## 多终端实时心跳 / Live Heartbeat（v0.24）

多终端并发跑任务时，想一眼看清"**每个终端此刻在做哪个 feature、第几个任务、忙还是闲、还活着吗**"——靠 [hooks/status_report.js](hooks/status_report.js) 自动上报，[/sdd:status](skills/status/SKILL.md) 聚合成实时看板。**随插件自动激活、零接入**。

- **自动上报（hook，零 LLM）**：`SessionStart`/`UserPromptSubmit`/`Stop` 管回合边界，`PostToolUse` 管回合中途刷新（修长回合/编排器盲区）；非 `sdd/*` 分支立刻空跑退出。
- **长 workflow / 子代理期间靠"子代理自己续心跳"**：插件 hook **会在子代理上下文里运行**（官方文档确认，输入带子代理自己的 cwd/agent 身份）。所以 workflow/子代理在本 worktree 调工具时，它们的 `PostToolUse` 会刷新自己的会话心跳；父会话的 `delegating` 记录不会被覆盖。
- **双层保险**：① 子代理在本 worktree 干活 → 自动刷成 `working`（主路径）；② 万一不刷新（worktree 隔离的 agent 在别的分支/detached，或 workflow runtime 不跑插件 hook）→ `PostToolUse` 在 workflow 启动那刻打的 `delegating` 标兜底，`/sdd:status` 显示"🟢 委派中（自 HH:MM）"且**不按 5 分钟判死**，`Stop` 后自动恢复。
  > 诚实边界：Task/Agent 子代理触发 hook 是文档确认的；Workflow 工具派生的 agent 是否触发文档未明说（极可能）。但两种情况设计都不崩——要 100% 确认，在真实会话跑个含 Bash 调用的小 workflow、看心跳文件时间戳有没有在 workflow 期间走动即可。
- **一会话/agent 一文件、原子发布**：文件名为 `<branch>-<session-key>.json`，key 由 session/transcript + agent 身份稳定派生；同分支多个终端不会互相覆盖，单文件通过 temp+rename 发布，读者不会看到半截 JSON。所有 worktree 共享一个 `.git`，但运行时文件不进版本库。
- **读层只读**：`/sdd:status` 按 branch 聚合全部 session，不覆盖同分支的并发终端；摘要显示最新会话与活跃数，必要时展开每个 session。终端关闭不主动清文件，靠 `lastActivity` 时间戳判**过期**（>5 分钟标"可能已关闭"）。
- **定位**：尽力而为的**可观测性**，不是协调/加锁——协调仍靠 git 分支占号 + Boundary；派生事实（worktree/specs/git）永远权威，心跳与之冲突以派生为准。
- **关闭**：删 `hooks/hooks.json` 里的 `SessionStart`/`UserPromptSubmit` 段与 `Stop` 段中的 status_report 那条。

## 能力注入系统 / Stack Packs & Skill Injection（v0.3）

让同一套 SDD 覆盖**全栈 / 移动端 / 小程序 / H5 / PC / 服务端 / 数据库**——靠"注入领域能力包"，而不是把领域知识写死在命令里。

**内置 7 个能力包**（`stacks/`）：`server` `database` `mobile` `miniprogram` `h5` `pc` `fullstack`。每个包含：默认技术栈 · 目录布局 · **Boundary 拆分模式**（直接喂给波次并发）· 测试策略 · 领域红线 · 验收要点。

**怎么用：**
```
/sdd:stack list                         # 看内置 + 已激活
/sdd:stack add server database h5       # 落到 specs/stacks/ 并登记进宪法
/sdd:stack new my-game-backend          # 按模板生成空白包 → 注入你自己的新领域
/sdd:stack skill anthropic-skills:xlsx  # 注入一个 Claude Code skill
```

**注入点（自动生效）：**
- `/sdd:plan` 按能力包的技术栈/布局约定做设计；
- `/sdd:tasks` 用能力包的 Boundary 拆分模式切任务，**提高可并发度**；
- `/sdd:implement` 编排器把对应能力包路径 + 注入 skill 名单**传给每个隔离子代理**，让 worker 也具备领域知识。

**可扩展：** 复制 [stacks/_TEMPLATE.md](stacks/_TEMPLATE.md) 改名即成新领域包；填实第 3 节"Boundary 拆分模式"是关键（决定并发质量）。也可直接 `/sdd:stack new <name>`。

> 落地的包写在项目 `specs/stacks/*.md`，**项目可改**——按团队规范微调即可，不影响框架本体。

## 设计取舍说明

- **为什么用插件而非散装命令**：插件是 Claude Code 官方的可复用打包机制，命令自动带 `sdd:` 命名空间，一处维护、处处可用。
- **为什么命令自包含（模板内联）**：无论全局装还是拷进项目，都不依赖外部模板路径，不会失效。
- **为什么禁用模型自动调用**：SDD 的价值在"人在每个阶段把关"。手动触发 = 天然卡点。
- **轻量如何与机制兼得**：你仍只敲 `/sdd:implement` 一条命令，并发/隔离全在底层自动发生——表面更省事，过程更稳，返工更少。简单任务（单文件改 bug）可跳过 SDD，直接对话即可。

## 仓库自身质量检查

```bash
npm test                             # core/workflow/hook runtime 的 node:test 回归
claude plugin validate . --strict    # plugin + marketplace + skills/agents/hooks schema
```

GitHub Actions 会并行执行 JS 语法、JSON 解析、`npm test` 与固定版本的 Claude Code 插件校验。发布前还应运行 `git diff --check`，并在真实 Claude Code 会话做一个最小 smoke test（加载插件、创建 feature worktree、运行一个含 Workflow 的小任务）。

## 迭代这套框架本身

本仓库是源。开发时用 `claude --plugin-dir <仓库绝对路径>` 加载工作副本；修改 skills/agents/hooks 后运行 `/reload-plugins`（必要时重启）。发布时同步更新 `.claude-plugin/plugin.json` 与 `package.json` 版本，并让 CI 全绿。

## License

[MIT](LICENSE)
