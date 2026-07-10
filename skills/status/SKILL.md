---
description: 项目仪表盘 / Concurrency-safe project dashboard — shows every feature, which terminal/worktree owns it, progress, and gate health. 派生式只读，多终端并发安全：身份归属由 git worktree 派生，不维护任何共享文件，绝不串行。
argument-hint: "[空=全局总览 | mine=只看当前终端的 feature]"
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(git *), Bash(ls *), Bash(cat *)
---

# /sdd:status — 项目仪表盘（多终端并发安全）

一眼看清：有哪些 feature、**各自归哪个终端/worktree**、进度、门禁健康。

## 状态模型：全局一份还是一功能一份？
- **一功能一份（分布式存储）**：每个在建功能的真实状态只存在于它自己的 `sdd/NNN-slug` worktree：规格 `specs/NNN-slug/`、代码、`tasks.md` 进度、`COMPLETION.md` 验证证据属于同一分支。主 worktree 不保存第二份在建规格。
- **全局视图（零存储，派生）**：本命令**不存任何 dashboard 文件**——全局总览是每次**实时算出来的只读视图**。
- **实时心跳层（hook 自动写，一终端一文件）**：派生视图答不了"某终端此刻活着没、在忙还是等输入"——这类易变状态由 `status_report.js` hook 每回合自动写到共享 `<git-common-dir>/sdd-runtime/<branch>.json`（一终端一文件、零写竞态、不进 git）。**本命令只读这些文件、绝不写**，故仍多终端并发安全。
- 所以答案：**状态是"一功能一份"；全局仪表盘是"算出来的"，不落盘成共享文件；实时忙闲/存活来自各终端自写的心跳文件（读层只读不写）**——这就是它多终端并发不串行的根本原因。

## 设计原则（为什么不会串行 / 不会撞车）
- **绝不维护共享的 dashboard 文件**——那会变成热点文件，多终端写它必冲突、被迫串行（正是我们一直在躲的坑）。
- **仪表盘完全派生、只读**：
  - **身份与归属**直接来自 `git worktree list`——分支 `sdd/NNN-slug` ↔ 哪个 worktree 目录 = 哪个终端在做。这套映射由 git 自己并发安全地维护，不需要任何人手写。
  - **生命周期**读各 worktree 自己的 `specs/NNN-slug/{requirements.md|design.md|tasks.md|spec.md|COMPLETION.md}`；代码存在性与工作区状态也从同一个 worktree 派生。
  - **主 worktree 的职责**只有汇总只读状态、显示归档/全局台账，以及持锁串行执行 finish；主干出现未归属 worktree 且尚未合并的活跃 feature 目录时，仪表盘将其标为迁移告警。`COMPLETION.md` 已标 `Merged ✅` 的未归档目录是完成态，不是假 split-brain。
  - 全程只读，零共享写 → 多终端可同时跑 `/sdd:status`，互不影响。

## 用户输入
$ARGUMENTS

## 执行步骤
1. **环境**：`git rev-parse --is-inside-work-tree`；非 git 仓库则退化为只扫 `specs/`。记当前 worktree 路径与分支（`git rev-parse --abbrev-ref HEAD`）——用于标注"你在这里"。
2. **采集归属（并发安全的事实源）**：`git worktree list`，解析每个 (目录, 分支)。分支名形如 `sdd/NNN-slug` 的即"在建 feature + 其所属终端目录"。
3. **采集 Feature 状态**：对每个在建 feature，只读其**所属 worktree** 中的 `specs/NNN-slug/`：
   - full 读 `requirements.md`、`design.md`、`tasks.md`；lite 读 `spec.md`；取 `Status`、`Progress: X / N` 与任务勾选。
   - 读 `COMPLETION.md` 的验证结论与日期；不存在则显示 `Not verified`，不得去主 worktree 找替代证据。
   - 若 worktree 有分支但缺自身 feature 目录，标 🔴 `Missing spec in feature worktree`；若同名目录只在主 worktree，追加 `legacy split-brain` 告警。
4. **采集归档与迁移告警**：
   - 扫主 worktree 的 `specs/archive/*`，含嵌套 delta `specs/archive/*/deltas/NNN-*` 与仍活跃源下的 `specs/*/deltas/NNN-*`；读 `Delta-of` 并归到源名下。
   - 扫主 worktree 的 `specs/NNN-*`。若没有对应 `sdd/NNN-slug` worktree，先读自身 `COMPLETION.md`：已明确记录 `Merged ✅` 的列入“已完成未归档”，只提示可稍后归档，**不得**引导重新 start；未合并、缺 COMPLETION 或状态无法核实时才列入“旧版待迁移”，引导创建/附着 Feature Worktree 后核对。若对应 worktree 存在但其中缺规格，列为 split-brain，要求先迁移/核对。**不把未合并目录展示成可继续在 main 就地开发的正常草稿。**
5. **采集实时心跳（只读各会话原子发布的文件）**：定位 `<git-common-dir>/sdd-runtime/`（`git rev-parse --git-common-dir`；非 git 仓库则系统临时目录），`Glob` 读全部 `*.json`，按 `branch` 聚合而不是按 branch 覆盖。每个 record 取 `sessionKey`、`status`(working/idle/delegating)、`currentTask`、`lastActivity`；同分支保留所有未过期 session，摘要展示最新状态 + 活跃 session 数，需要时逐条展开。
   - **存活判定（按 status 分档，关键）**：
     - `working`/`idle`：`now - lastActivity` ≤ 5 分钟 → 🟢 活跃；> 5 分钟 → ⚪ 可能已关闭（终端关了不主动清文件，靠时间戳判旧）。
     - **`delegating`（委派中：跑 Workflow/子代理）→ 绝不按 5 分钟判死**。说明：子代理在本 worktree 干活时，其工具调用会触发插件 PostToolUse（hook 在子代理上下文运行，文档确认）→ 把状态刷回 `working`；只有当子代理在别的分支/detached（worktree 隔离）或 workflow runtime 不跑 hook 时，才会停在 `delegating`。所以显示"🟢 委派中（自 HH:MM）"，提示"workflow/子代理期间若未刷新属正常，结束后自动恢复"；除非超很久（如 > 60 分钟）才提示"疑似卡住，建议人工确认"。
   - 读不到心跳目录/文件 → 该列留空，**不报错**（心跳是增强项，没有 hook 也能正常出派生视图）。
6. **采集待补齐 items（必做）**：读主 worktree 与各在建 Feature Worktree 的 `specs/backlog/BL-*.md`，并兼容旧 `specs/BACKLOG.md`；按 canonical ID 聚合并标明来源分支，未合并文件显示 `pending merge`。核对 `refs/sdd/backlog-ids/<ID>` owner blob；同 ID 多文件、owner 不符或内容/状态不同必须显示 `ID CONFLICT` 的全部来源，禁止静默去重。单文件模型使不同 feature 通常无同 hunk merge 热点。
7. **门禁健康**：以当前 feature 自己分支的 `specs/constitution.md §3` 为该行门禁配置；全局汇总可读取主 worktree 版本。标出 Format/Lint/Typecheck/Test/Merge gate 命令是否已填实（留空=门禁形同虚设，标 ⚠️）。
8. **渲染**（直接在对话输出，不写文件）：
```
# SDD 项目仪表盘
当前终端：<worktree 目录> @ <分支>   （← 标"你在这里"）

## 在建 features（唯一事实源 = Feature Worktree）
| Feature | Worktree | 分支 | 任务进度 | Verify/证据 | 实时 | 最后活动 | 备注 |
|---------|----------|------|---------|-------------|------|---------|------|
| 001-user-auth | ../app--001-user-auth | sdd/001-user-auth | 4/9 · T5 | Not verified | 🟢 working | 12s 前 | ← 你在这里 |
| 002-payment   | ../app--002-payment   | sdd/002-payment   | 6/6 | Verified ✅ | 🟢 idle(等输入) | 3m 前 | 待主终端 finish |
| 004-search    | ../app--004-search    | sdd/004-search    | 3/7 · T4 | Not verified | 🟢 委派中(workflow) | 18m 前 | workflow 期间心跳停更属正常 |

## ⚠️ 旧版待迁移 / Split-brain（有异常才显示）
| Feature | 发现位置 | 问题 | 下一步 |
|---------|----------|------|--------|
| 003-report | main/specs/003-report | 无对应 Feature Worktree | `/sdd:worktree start 003-report` 后迁移核对 |
| 005-search | sdd/005-search worktree + main/specs/005-search | worktree 缺规格、主干有副本 | 先迁规格到 feature 分支；implement/verify 禁止继续 |

## 已归档（specs/archive/）
- 000-shared-user (Archived)
- 003-user-auth (Archived)
  └─ deltas: 012-add-mfa · 015-sso-login   （delta 嵌在源 archive/003-user-auth/deltas/ 下）

## 已完成未归档（main/specs/，有才显示）
- 006-invoice · Merged ✅ · 可在后续维护窗口归档；不要重新创建 feature worktree

## 📌 待补齐 / Backlog（specs/backlog/BL-*.md 派生；有 open/scheduled 项就显示）
- [ ] BL-001 · 多渠道退款路由 · 来源 002-payment · 目标:接 alipay 时
- [~] BL-003 · 导出对账单 · 已排期 → 005-export
> 共 N 项待补齐 · M 项已排期。起新功能时 /sdd:specify 会主动问要不要纳入；别让它们一直挂着。

## 门禁健康
- Format ✅ | Lint ✅ | Typecheck ⚠️未填 | Test ✅ | Merge gate ✅
```
9. **`mine` 参数**：在 Feature Worktree 中只显示当前分支对应的 feature；在主 worktree 中明确显示“当前为全局协调终端，无本地 feature”，不要拿主干某个 specs 目录冒充归属。

## 纪律
- ❌ **本命令绝不写任何文件**——纯派生只读 + 只读心跳文件，这正是它能多终端并发的原因。心跳由 `status_report.js` hook 各终端自写（一终端一文件），本命令**只读不写**。
- ✅ "哪个终端创建/在做哪个 feature"= 看 `git worktree list` 的 分支↔目录 映射，这是唯一权威、且天然并发安全；**实时忙闲/存活**才看心跳，两者互补。
- ✅ 若主干规格与 Feature Worktree 不一致，仪表盘只报告异常、不猜哪份较新；迁移核对完成前不得显示为健康。
- ✅ 心跳是**尽力而为的可观测性**，不是协调/加锁：派生事实（worktree/specs/git）永远权威，心跳与派生冲突时以派生为准。终端关闭不会清文件，靠 `lastActivity` 时间戳判过期。
- ✅ 单机多终端：各 worktree 是本地目录、共享一个 .git，可直接读其文件与 `sdd-runtime/` 心跳汇总。
