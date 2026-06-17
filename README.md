# SDD — Spec-Driven Development for Claude Code

一套**可复用、轻量**的规格驱动开发工作流，打包成 Claude Code 插件。核心理念：**文档即事实来源，AI 基于明确规格实现，阶段间设人工卡点**，杜绝"vibe coding"式的失控。

> 适用：以 Claude Code 为核心开发工具、希望把同一套纪律复用到多个项目。

**能力全景**（v0.27）—— 从一个想法到上线，全链路有据可依、并发安全、质量兜底：

| 维度 | 提供什么 |
|------|---------|
| **全流程驱动** | `/sdd:init` 一键初始化项目 · `/sdd:auto` 自动驾驶（人工卡点引导你选）或手动逐步：立宪→规格→设计→拆解→实现→验证→收尾 |
| **核心引擎**（防偏移·并发·反压） | 🧊 实现期每任务**隔离子代理**（不随长会话退化）· ⚡ Boundary+Waves **波次并发** · 🔁 独立 verifier **反压打回**（≤2 次再升级） |
| **质量 & 防全局偏移** | 代码质量门禁(format/lint/typecheck 硬强制) · 测试纪律 · **合并门全量回归** · 规格**对账后冻结** · 治"越做越偏/越冗余" |
| **并发协作** | `/sdd:worktree` 多终端物理隔离 · `/sdd:sync` 跨 feature 共享 · `/sdd:status` 派生式仪表盘 + **实时心跳**（hook 自动上报各终端在做哪个 feature/第几任务/忙闲存活，多终端零冲突） |
| **领域覆盖** | 能力包注入：全栈/移动/小程序/H5/PC/服务端/数据库/嵌入 + 任意 Claude Code skill |
| **知识辅助** | 24 种设计模式 + 工程原则(SOLID/Clean/DDD/12-Factor/高可用) 辅助 design 选型 |
| **可选加速** | 确定性 Workflow 编排（编排器按任务结构自选，无需 ultracode；§8 可禁用） |
| **保持轻量** | lite 分级 / 完成即冻结归档 / 自动右尺寸——文档量随"在建功能数"走，不随项目历史膨胀 |

> 最初为解决"后期繁重 / 实现后偏移 / 不支持并发"三大痛点而生（核心引擎那三条），后续逐步补齐质量、并发协作、领域覆盖与知识层。

---

## 设计哲学 / Design Philosophy

整套框架在并发 + 长期演进下不崩，靠的是一条主线和几条原则：

> **拒绝"一份大家都来改的共享可变文档"**——它要么腐烂撒谎，要么冲突串行。
> 改成：**把真相锚定在对的地方（代码 / git），需要时"对账"或"派生"出视图。**

1. **文档即事实来源，但必须保持真实**：规格是权威，可一旦失真就毒害所有下游（隔离子代理、verify、analyze 都信它）。所以**冻结前先对账**（reconcile）把规格校准到"实际所建"，再封存——之后不追代码，要改就开新 delta。
2. **真相锚定，视图派生**：状态不存一份共享文件——**一功能一份**存各自目录（归属由 git worktree 唯一确定），**全局仪表盘实时派生、零落盘** → 多终端并发零冲突零串行。
3. **确定性工具 > AI 自觉**：风格/架构一致性靠 formatter/linter/typecheck/fitness 强制（隔离子代理会放大漂移，只能靠统一工具抹平）。
4. **局部隔离，全局设门**：任务级隔离实现 + 反压验收；功能级合并门跑**全量回归**——局部写对 ≠ 全局健康，跨功能偏移由合并门兜底。
5. **跑了才算数**：verifier/verify 亲自跑测试、基于**实际运行证据**判定，不信口头声称。
6. **克制优先**：能跳过就跳过（trivial 不上 SDD）、小事走 `--lite`、完成即冻结归档、YAGNI 不为用而堆模式/架构——文档量随"在建功能数"走，不随项目历史无限涨。

---

## 工作流一览

```
 /sdd:constitution → /sdd:stack → /sdd:specify → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:verify
   立宪(一次性)        注入能力包    需求          消歧          设计        拆解         实现(编排)       行为验证
                       全栈/移动/小程序…                                  波次并发+隔离+反压        ⇅
                                                                    /sdd:analyze  静态一致性自检(随时)
```

**两种用法**：① **手动逐步**——自己依次敲下面的命令，每步审完再敲下一个（最强把关）。② **自动驾驶**——`/sdd:auto <想法>` 一条命令把全流程跑下去，**只在人工卡点停下让你选**（省去逐个敲命令）。两者共用同一套规则与门禁。

| 命令 | 阶段 | 产出 | 只回答 |
|------|------|------|--------|
| `/sdd:init [--vendor]` | **项目初始化（一次性）** | specs/ 结构 + 宪法 + CLAUDE.md | 一条命令把 SDD 装进当前目录：建结构+自动生成宪法+激活能力包+接纪律 |
| `/sdd:auto <想法>` | **全流程驱动** | 串起下列全部 | 自动推进 + 卡点停下让你选（approve/改/暂停），可 `resume` 续跑 |
| `/sdd:constitution` | 立宪（一次性） | `specs/constitution.md` | **自动扫项目（任意语言）**识别技术栈+采用已有门禁命令，生成宪法草稿供确认 |
| `/sdd:stack [list\|add\|new\|skill]` | 能力注入 | `specs/stacks/*.md` | 注入领域能力包（全栈/移动/小程序/H5/PC/服务端/数据库）与 skill |
| `/sdd:specify <想法>` | 需求 | `specs/NNN-slug/requirements.md` | 做什么、为谁、可度量成功标准、优先级 |
| `/sdd:clarify` | 消歧 | 回填 requirements | 把模糊点逼出来再设计 |
| `/sdd:plan` | 设计 | `specs/NNN-slug/design.md` | 怎么做：架构/数据/接口/选型（遵循能力包约定） |
| `/sdd:patterns [问题]` | 设计选型参考 | 推荐/详解 | 24 种设计模式的适用场景/解决的问题/慎用，辅助 plan 选型 |
| `/sdd:principles [问题]` | 工程原则参考 | 推荐/详解 | 设计原则(SOLID…)/架构方法(Clean/DDD…)/12-Factor/高可用，辅助 plan 选型 |
| `/sdd:tasks` | 拆解 | `specs/NNN-slug/tasks.md` | 原子任务 + Boundary + **Waves 并行计划** |
| `/sdd:implement [next\|T1\|wave 2\|--workflow]` | 实现（**编排器**） | 代码 + 勾选任务 | 波次并发派子代理、隔离实现+注入能力包、反压验收；编排器按任务结构自选是否用确定性 Workflow，`--workflow`=强制走 |
| `/sdd:verify` | 行为验证 | punch list | 按 AC 的 `Verify` 标签验（auto/sim 实跑；manual-HW 出人工证据清单） |
| `/sdd:analyze` | 静态自检 | 一致性报告 | 需求↔设计↔任务↔代码 有无脱节（静态） |
| `/sdd:status [mine]` | 项目仪表盘 | 派生只读总览 | 各 feature 归哪个终端、进度、门禁健康（多终端并发安全） |
| `/sdd:worktree [start\|list\|finish\|abort]` | 并发隔离 | git worktree | 多终端/多 feature 物理隔离，互不 reset |
| `/sdd:sync [main\|from <feature>] [--rebase]` | 跨终端同步 | 合并/变基 | 把别的 feature 已提交成果或最新 main 拉进当前 worktree |
| `/sdd:version` | 查看版本 | 只读输出 | 报告当前 SDD 插件版本号、安装位置与本版要点 |

**人工卡点**：所有命令都设了 `disable-model-invocation: true`，**只能你手动触发**——AI 不会自己跳阶段。每个阶段写完即停，等你审阅再敲下一个命令。

附带**四个子代理**：
- `implementer` — 隔离上下文里实现单个任务，严守 Boundary，只回结构化摘要（上下文隔离的执行单元）
- `verifier` — 独立验收单个任务，亲自跑测试，PASS/FAIL 裁决（反压的把关单元）
- `spec-reviewer` — 审 requirements（歧义、不可测、漏边界、范围蔓延）
- `design-critic` — 审 design（过度/欠设计、漏失败模式、违宪、可追溯缺口）

`implementer` / `verifier` 由 `/sdd:implement` 自动调度，你无需手动调用。`spec-reviewer` / `design-critic` 在 `/sdd:specify`、`/sdd:plan` 后让 Claude「用该子代理评审这份规格」。

---

## 安装（三选一）

本目录 `.sdd` 就是插件源。选一种方式部署：

### 方式 A：全局安装（推荐，所有项目可用）
把本插件放进用户级 skills 目录，下次启动 Claude Code 自动加载（无需 install 命令）：

```bash
# 把 .sdd 的内容复制为全局插件 sdd
cp -r "C:/Users/Administrator/Desktop/.sdd" "$HOME/.claude/skills/sdd"
# 或用软链（改动即时生效，便于继续迭代框架本身）
# Windows 需管理员: mklink /D "%USERPROFILE%\.claude\skills\sdd" "C:\Users\Administrator\Desktop\.sdd"
```

之后在**任何项目**里都能用 `/sdd:specify` 等命令。

### 方式 B：启动时挂载（临时/试用）
```bash
claude --plugin-dir "C:/Users/Administrator/Desktop/.sdd"
```

### 方式 C：拷进单个项目
把 `skills/` 和 `agents/` 复制到目标项目的 `.claude/` 下：
```bash
cp -r skills/* /path/to/project/.claude/skills/
cp -r agents/* /path/to/project/.claude/agents/
```
（此方式命令名不带 `sdd:` 前缀，直接是 `/specify`、`/plan` …）

> 安装后若命令没出现，运行 `/reload-plugins` 或重启 Claude Code。

---

## 在新项目里怎么用

```
1. cd 到你的新项目，启动 claude
2. /sdd:init                    # 一次性：建 specs/ 结构 + 自动生成宪法 + 激活能力包 + 接上 CLAUDE.md 纪律
3. /sdd:auto 用户能用邮箱密码注册登录   # 自动驾驶整条流程，到人工卡点停下引导你选
```
> 想手动逐步掌控，就把第 3 步换成依次敲：`/sdd:specify → /sdd:clarify → /sdd:plan → /sdd:tasks → /sdd:implement → /sdd:verify`；随时 `/sdd:analyze`、`/sdd:status`。多功能并行用 `/sdd:worktree`。

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

## 三大机制如何落地

**🧊 上下文隔离（防偏移）** — `/sdd:implement` 不再自己一路写到底，而是当**编排器**：每个任务派一个 `implementer` 子代理，在**全新干净上下文**里只读该任务相关的 spec 切片来实现。长会话上下文退化导致的"越写越跑偏"被根除——每个任务都是"第一天的状态"。

**⚡ 波次并发** — `/sdd:tasks` 给每个任务标 `Boundary`（独占文件领地）和 `Depends`，并算出 `Waves`：同一波内相互独立、Boundary 不重叠的任务，编排器**在一条消息里并行派多个子代理**同时干。理论最短轮数 = Wave 数，而非任务数。
> 并发安全靠 Boundary 不重叠保证。若两任务必须改同一文件 → 让它们落到不同 Wave（串行），或（高级）给子代理加 `isolation: "worktree"` 各自独立工作树再合并；拿不准时编排器会自动降级为串行。

**🔁 反压校验** — 每个任务一完成，立即派 `verifier` 子代理**独立验收**（亲自跑测试，不轻信实现工自述）；FAIL 当场带着修复指引打回重做，最多 2 次，再不行就标 `[!]` 升级给你。缺陷在产生处就被拦截，不会累积到后面集中爆发。`/sdd:verify` 则在功能完成后做一次整体行为验证兜底。

## 多终端并发安全 / Git Worktree（v0.4）

**问题**：一台电脑开多个终端跑 Claude，若都在**同一个目录**，它们共享同一个工作树和 HEAD——A 终端 `git checkout/reset/切分支` 会改写整个目录，**把 B 终端没提交的改动 reset 掉**。⚠️ 光"新建分支"救不了：同目录里工作树只有一个。

**正解**：`git worktree` —— 从同一仓库长出**多个物理隔离的工作目录**，各挂各的分支、共享同一个 `.git`。一个 feature = 一个分支 = 一个 worktree 目录 = 一个终端，彼此互不影响。

```
/sdd:worktree start 001-user-auth     # 建分支 sdd/001-user-auth + 目录 ../<repo>--001-user-auth
#   → 打开新终端 cd 到该目录启动 Claude，在那里跑完整 SDD 流程
/sdd:worktree list                    # 看所有 worktree 及对应 feature
/sdd:worktree finish 001-user-auth    # 在主 worktree：对账+合并门+合并 → 自动删 worktree+分支+prune（合并成功才删）
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

**① 合并门 = 全量回归**（防"新功能改坏老功能"）
- `/sdd:worktree finish` 合并前跑**完整测试套件**（不只本功能）+ lint + typecheck + 架构 fitness。
- **任何老功能测试报红 = 功能偏移被当场拦在合并前**，不准合并。前提：冻结的老功能留下了测试 → 它们就是回归护栏。
- **全量 ≠ 慢（v0.27，随规模可伸缩）**：模块一多，裸跑串行全量会让合并成关键路径瓶颈。§3「Merge gate 性能」要求合并门命令**自带"缓存跳过未变 + 并行"**（Maven `-T 1C`+`maven-build-cache-extension`、Gradle `--parallel --build-cache`、Nx/Turbo 缓存、pytest `-n auto`…）——**零安全损失**（跑的还是全部测试，只是没变的不重跑、能并行的并行）。`/sdd:constitution` 会按构建工具自动探测填入。愿牺牲一点安全换更快的可选 affected/分层，默认不启用。

**② 架构适应度函数**（防架构侵蚀 + 治冗余）
- 宪法 §3 声明、自动跑：依赖方向 / 禁止 import / 分层边界 / 复杂度上限 / **重复率阈值（jscpd）**。
- 工具：dependency-cruiser、import-linter、eslint-boundaries、jscpd。**架构靠工具守，不靠 AI 记忆。**

**③ 源头防冗余/防"对不上"**（在写之前）
- implementer 动手前**先 Grep 既有代码复用**、沿用既有命名与分层，绝不重复造轮子（隔离子代理最容易各写各的）。
- verifier 把"重复造轮子 / 与既有风格脱节"列为 **FAIL** 项。

> 链路：写前复用发现 → 任务级 verifier 防重复/守一致 → **合并门全量回归 + fitness 兜底全局**。三层一起，才压得住"项目越大越偏"。

## 保持轻量 / Keeping it Lean（v0.7）

> 直面"文档会不会越来越重、越来越难维护"——会，除非刻意踩刹车。本框架用三条规矩控重：

**① 分级，别什么都上完整流程**
| 规模 | 走法 | 产物 |
|------|------|------|
| Trivial（单文件改/格式/明确小改） | **跳过 SDD**，直接对话做 | 无 |
| Small（1–3 文件、单一明确） | `/sdd:specify --lite` → 直接 `/sdd:implement` | **单个 `spec.md`**（需求+设计+任务三合一） |
| Normal/Large（多文件、有不确定性） | 完整流程 | requirements/design/tasks |

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

- **专用台账**：项目级 `specs/BACKLOG.md`（`/sdd:init` 自动建）。跨 feature/epic 长存，**不放进任何 feature 目录**（否则随归档沉底）。
- **延后 ≠ 偏移**：偏移（"做成了别的样子"）记 `Deviations`、对账后冻结；延后（"没做、要以后做"）进 BACKLOG、会被**主动回捞**。两者语义不同、落点不同。
- **全链路防漏（写入 → 常驻 → 回捞 → 关闭）**：
  - **写入**：`/sdd:implement`、`/sdd:auto` 遇延后决策必停下问，选"延后补齐"就落台账（`BL-NNN · 来源 · 内容 · 因 · 目标 · 记于`），绝不只在对话里答应。
  - **常驻**：`/sdd:status` 永远显示"📌 待补齐"段——谁打开看板都看得见还欠什么，这是"绝不静默漏掉"的硬保证。
  - **回捞**：`/sdd:specify` 起新功能时扫台账，把相关/目标指向"本次"的项**主动端到面前**问要不要纳入；纳入即标 `[~] 已排期`。
  - **关闭**：`/sdd:verify` / `worktree finish` 收尾时把本功能补齐的项标 `[x] 已补齐`，仍开着的再提醒一次。
- **已在跑的老项目零手动**：机制**自愈**——读时缺文件视为空、不报错；首次延后时按骨架自建台账。想立刻有个空台账，再跑一次 `/sdd:init`（幂等、只补缺、不动现有文件）即可；历史已延后但没留痕的，手动往 `specs/BACKLOG.md` 补几条即可。

## 文档自动评审 / Auto-Review & Alignment（v0.26）

> 评审能力（`spec-reviewer`/`design-critic`/`/sdd:analyze`）一直都有，但过去是"**建议你跑**"——漏跑就没把关。v0.26 把它升级成**默认自动派发 + 反压自修**：每出一份规格文档，自动派评审 agent 查对齐，仿 implement 的 verifier 反压。

- **每阶段生成即评审**：`specify`→`spec-reviewer`（requirements）、`plan`→`design-critic`（design，专查偏离 requirements/宪法、可追溯缺口、过度/欠设计）、`tasks`→design↔tasks 覆盖/越界/Boundary 自检。`--lite` 也跑一轮轻量评审。
- **反压自修（仿 verifier bounce-back）**：评审回 Verdict（🟢/🟡/🔴）。🔴 → **只针对 blocking 项自修文档 → 再评**，最多 2 轮；2 轮仍 🔴 → 停下报用户，不无限磨。
- **歧义走消歧、不自己猜（关键）**：评审的 blocking 分两类——**歧义/未定阈值/产品决策**这类 → 转 `[NEEDS CLARIFICATION]`、**先走 `/sdd:clarify` 问你**（消歧优先于自修，猜歧义=制造意图偏移）；只有**机械类**（措辞不可测但有明确写法、漏掉的明显边界 AC、可追溯缺口、违宪格式）才自修。
- **意图红线（关键）**：自修**只动"怎么把它说清楚/说完整"**，**绝不擅自改"做什么"**——凡涉及改 Goals/范围/技术方向/未定阈值的，交用户拍板。评审是质量把关，不是替你重定义需求。
- **全自动也不漏审**：`/sdd:auto` 各阶段在 🚦 卡点前自动评审，把 Verdict 折进卡点让你看到——以前全自动反而跳过评审的盲区补上了。

## 代码风格一致性与可维护性 / Code Quality Gate（v0.6）

**为什么需要**：风格一致性靠 LLM"自觉"保证不了——而本框架用**隔离子代理并行**实现，更放大了风格漂移风险（多个 fresh worker 习惯各异）。答案是**确定性工具统一强制**：formatter + linter + type-checker 在宪法里钉一次、每个任务自动跑。

**三层防御（配置一次，全自动）：**
1. **声明层** `constitution.md §3 Code Quality Gate`：钉死 `Format` / `Lint` / `Typecheck` / `Test` 的**真实命令** + 可维护性规则（命名、函数/复杂度上限、DRY 复用优先、分层方向、`.gitattributes` 统一换行）。
2. **生成层** implementer + hook：每个隔离子代理**报告前自跑 format+lint**，被同一套工具归一化；可选 `hooks.example.json` 每次编辑实时跑「格式化→lint→typecheck」。
3. **校验层** verifier + analyze：verifier 把 format/lint/typecheck 设为**硬门禁**（任一不过→FAIL 打回，不只看测试）+ 查可维护性（重复/死代码/复杂度/分层）；`/sdd:analyze` 增加 Quality Gate 与 Maintainability 审计维度。

> 可维护性（语义层）还靠：能力包的布局约定与红线、implementer"复用优先"、verifier 的可维护性启发式。也可 `/sdd:stack skill` 注入 Claude Code 自带的 `/code-review`、`/simplify`。

## 确定性 Workflow 编排（编排器自选，无需 ultracode）

> 直面 review 那条短板：**"编排靠软约束"**——SDD 用提示词请编排器「并行派子代理、跑 verifier、失败打回」，但没人在代码层保证它真照做（波次能不能并、verifier 重不重试、重几次，全凭 LLM 当下自觉）。**Claude Code Workflow** 把这层软编排升级成**确定性多代理编排**——波次并行调度 + verifier 重试回路**由代码强制执行**。

**升级了什么（软 → 硬）：**
- ⚡ **波次并行**：同 Wave 内 Boundary 不重叠的任务由**编排引擎**真并发 fan-out（含建波前 Boundary 两两交集校验、运行后 files⊆Boundary 守恒断言、依赖闸 blocked 传播——三道闸全在代码里）。
- 🔁 **verifier 重试回路**：FAIL→带 fix 重派→**重试≤2 再 `[!]`** 的阈值写死在代码里，不再"看 LLM 心情"。

**怎么用（编排器自动判断，零配置）：**
```
/sdd:implement                   # 编排器按任务结构自选：多波次/高并行→走 Workflow，少量串行→提示词编排（走前一句话告知）
/sdd:implement --workflow        # 强制把本 feature 的 waves 交确定性引擎跑（脚本 workflows/sdd-implement.js）
```
> ✅ **无需 ultracode、无需改宪法**——编排器自己判断该不该上 Workflow。**合规依据**：用户调用 `/sdd:implement`（一条本就多代理编排的命令）即 Claude Code 的显式 opt-in（"用户调用的 skill/命令的指令要求你调 Workflow"）。
> ⚙️ **想一律禁用**：在项目 constitution §8 把 `禁用 Workflow` 设为 `是`，则永远走提示词编排。脚本 `workflows/sdd-implement.js` 可读可改。
> ⚠️ **务必用内置脚本（任务走 `args` 传入），别现场即兴另写工作流**：Workflow 校验器会文本扫描脚本，发现 `Date.now/Math.random/new Date/setTimeout` 字面量（哪怕在注释/prompt 里）就拒绝启动（报 determinism 错）。内置脚本已合规。要时间戳走 args 或工作流返回后再盖；要 ID 用 index 派生。
> 试点只落 `implement`（fan-out 最受益）；`analyze --deep`（对抗式 fan-out）、`plan --candidates`（多方案 judge panel）标为**未来可选、暂未实现**，避免一次性铺开违背"轻量但稳"。

## 门禁自动提醒 / Stop Hook（v0.15，判断层）

把"会不会忘了验收"从靠 LLM 自觉，升级成**由 hook 确定性触发**：插件自带一个 `Stop` hook，**随插件自动激活、零接入**。Claude 收工前它会被触发——

- 仅在 **SDD 项目**（有 `specs/constitution.md`）且**有未提交改动**时唤醒；
- 灌回提醒："收工前请跑 constitution §3 门禁 + 对受影响 AC 跑 `/sdd:verify` + 偏离 design 就回填 `## Deviations` 对账"；
- **循环安全**（`stop_hook_active` 守卫）+ **按改动状态节流**（同一状态只提醒一次）+ **出错一律放行**（绝不卡住会话）。
- 关掉：删 `hooks/hooks.json` 的 Stop 段。Python 可执行名为 `python3` 时把 command 里的 `python` 改掉。

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
> 全局安装时 `$CLAUDE_PLUGIN_ROOT` 即 `~/.claude/skills/sdd`（方式 A 的安装路径）。Windows 用 git-bash 跑同样命令即可；`python` 可执行名为 `python3` 时，把 [hooks/commit-msg](hooks/commit-msg) 首行 shebang 改成 `#!/usr/bin/env python3` 之外无需改动（已是该 shebang）。

**安全设计（fail-open）：** merge / revert / fixup! / squash! 自动放行；空消息交给 git 处理；脚本自身异常一律放行——门禁绝不无故卡住正常提交。**关闭：** 删 `.git/hooks/commit-msg`，或单次 `git commit --no-verify`。

## 多终端实时心跳 / Live Heartbeat（v0.24）

多终端并发跑任务时，想一眼看清"**每个终端此刻在做哪个 feature、第几个任务、忙还是闲、还活着吗**"——靠 [hooks/status_report.py](hooks/status_report.py) 自动上报，[/sdd:status](skills/status/SKILL.md) 聚合成实时看板。**随插件自动激活、零接入**。

- **自动上报（hook，零 LLM）**：`SessionStart`/`UserPromptSubmit`/`Stop` 管回合边界，`PostToolUse` 管回合中途刷新（修长回合/编排器盲区）；非 `sdd/*` 分支立刻空跑退出。
- **长 workflow / 子代理期间靠"子代理自己续心跳"**：插件 hook **会在子代理上下文里运行**（官方文档确认，输入带子代理自己的 cwd）。所以 workflow/子代理在本 worktree 调工具时，它们的 `PostToolUse` 会拿同一个 `sdd/NNN` 分支刷新**同一个心跳文件**——心跳不停更。
- **双层保险**：① 子代理在本 worktree 干活 → 自动刷成 `working`（主路径）；② 万一不刷新（worktree 隔离的 agent 在别的分支/detached，或 workflow runtime 不跑插件 hook）→ `PostToolUse` 在 workflow 启动那刻打的 `delegating` 标兜底，`/sdd:status` 显示"🟢 委派中（自 HH:MM）"且**不按 5 分钟判死**，`Stop` 后自动恢复。
  > 诚实边界：Task/Agent 子代理触发 hook 是文档确认的；Workflow 工具派生的 agent 是否触发文档未明说（极可能）。但两种情况设计都不崩——要 100% 确认，在真实会话跑个含 Bash 调用的小 workflow、看心跳文件时间戳有没有在 workflow 期间走动即可。
- **一终端一文件、零写竞态**：各终端只写自己的 `<git-common-dir>/sdd-runtime/<branch>.json`（所有 worktree 共享一个 `.git`，天然互相可见）。**存运行时、不进版本库**——不造合并冲突、不污染历史。
- **读层只读**：`/sdd:status` 只读心跳文件、绝不写，故仍多终端并发安全。终端关闭不主动清文件，靠 `lastActivity` 时间戳判**过期**（>5 分钟标"可能已关闭"）。
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
- **轻量如何与机制兼得**：你仍只敲 `/sdd:implement` 一条命令，并发/隔离/反压全在底层自动发生——表面更省事，过程更稳，返工更少。简单任务（单文件改 bug）可跳过 SDD，直接对话即可。

## 迭代这套框架本身

`.sdd` 是源，改完命令/代理后：用软链安装会即时生效（文本类改动）；新增/改动 agents 或 hooks 需 `/reload-plugins` 或重启。版本号在 `.claude-plugin/plugin.json`。
