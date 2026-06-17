---
description: 项目仪表盘 / Concurrency-safe project dashboard — shows every feature, which terminal/worktree owns it, progress, and gate health. 派生式只读，多终端并发安全：身份归属由 git worktree 派生，不维护任何共享文件，绝不串行。
argument-hint: "[空=全局总览 | mine=只看当前终端的 feature]"
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(git *), Bash(ls *), Bash(cat *)
---

# /sdd:status — 项目仪表盘（多终端并发安全）

一眼看清：有哪些 feature、**各自归哪个终端/worktree**、进度、门禁健康。

## 状态模型：全局一份还是一功能一份？
- **一功能一份（分布式存储）**：每个功能的真实状态存在它**自己的目录** `specs/NNN-slug/`（tasks.md 的 Progress、Status 字段），归属于一个终端/worktree，互不冲突。
- **全局视图（零存储，派生）**：本命令**不存任何 dashboard 文件**——全局总览是每次**实时算出来的只读视图**。
- **实时心跳层（hook 自动写，一终端一文件）**：派生视图答不了"某终端此刻活着没、在忙还是等输入"——这类易变状态由 `status_report.py` hook 每回合自动写到共享 `<git-common-dir>/sdd-runtime/<branch>.json`（一终端一文件、零写竞态、不进 git）。**本命令只读这些文件、绝不写**，故仍多终端并发安全。
- 所以答案：**状态是"一功能一份"；全局仪表盘是"算出来的"，不落盘成共享文件；实时忙闲/存活来自各终端自写的心跳文件（读层只读不写）**——这就是它多终端并发不串行的根本原因。

## 设计原则（为什么不会串行 / 不会撞车）
- **绝不维护共享的 dashboard 文件**——那会变成热点文件，多终端写它必冲突、被迫串行（正是我们一直在躲的坑）。
- **仪表盘完全派生、只读**：
  - **身份与归属**直接来自 `git worktree list`——分支 `sdd/NNN-slug` ↔ 哪个 worktree 目录 = 哪个终端在做。这套映射由 git 自己并发安全地维护，不需要任何人手写。
  - **进度**读各 worktree 自己的 `specs/NNN-slug/{tasks.md|spec.md}`（每个 worktree 是独立目录、归一个终端）。
  - 全程只读，零共享写 → 多终端可同时跑 `/sdd:status`，互不影响。

## 用户输入
$ARGUMENTS

## 执行步骤
1. **环境**：`git rev-parse --is-inside-work-tree`；非 git 仓库则退化为只扫 `specs/`。记当前 worktree 路径与分支（`git rev-parse --abbrev-ref HEAD`）——用于标注"你在这里"。
2. **采集归属（并发安全的事实源）**：`git worktree list`，解析每个 (目录, 分支)。分支名形如 `sdd/NNN-slug` 的即"在建 feature + 其所属终端目录"。
3. **采集进度**：对每个在建 feature，读它**所属 worktree** 里的 `specs/NNN-slug/tasks.md`（或 lite 的 `spec.md`）顶部 `Progress: X / N` 与各任务勾选；读 `Status` 字段。
4. **采集其余**：扫主 worktree 的 `specs/NNN-*`（未起 worktree 的草稿/未归档）与 `specs/archive/*`（已归档），**含嵌套归档 delta** `specs/archive/*/deltas/NNN-*` 与活跃源下的 `specs/*/deltas/NNN-*`。读各自头部的 `Delta-of`，把 delta 归到其源名下。
5. **采集实时心跳（只读各终端自写的文件）**：定位 `<git-common-dir>/sdd-runtime/`（`git rev-parse --git-common-dir`；非 git 仓库则系统临时目录），`Glob` 读全部 `*.json`，按 `branch` 并入对应 feature 行。取 `status`(working/idle/delegating)、`currentTask`、`lastActivity`。
   - **存活判定（按 status 分档，关键）**：
     - `working`/`idle`：`now - lastActivity` ≤ 5 分钟 → 🟢 活跃；> 5 分钟 → ⚪ 可能已关闭（终端关了不主动清文件，靠时间戳判旧）。
     - **`delegating`（委派中：跑 Workflow/子代理）→ 绝不按 5 分钟判死**。说明：子代理在本 worktree 干活时，其工具调用会触发插件 PostToolUse（hook 在子代理上下文运行，文档确认）→ 把状态刷回 `working`；只有当子代理在别的分支/detached（worktree 隔离）或 workflow runtime 不跑 hook 时，才会停在 `delegating`。所以显示"🟢 委派中（自 HH:MM）"，提示"workflow/子代理期间若未刷新属正常，结束后自动恢复"；除非超很久（如 > 60 分钟）才提示"疑似卡住，建议人工确认"。
   - 读不到心跳目录/文件 → 该列留空，**不报错**（心跳是增强项，没有 hook 也能正常出派生视图）。
6. **采集待补齐台账（防延后项漏掉，必做）**：读 `specs/BACKLOG.md` 的 `## 待补齐` 与 `## 已排期` 段，统计开着的延后项（含来源、目标）。**文件不存在（老项目没建过）→ 视为空、不显示本段、不报错**（无需为此中断）。**只要有未关闭项就必须在仪表盘显示**——这是"延后绝不静默漏掉"的硬保证：台账常驻看板上，谁打开 status 都看得见还欠什么。
7. **门禁健康**：读 `specs/constitution.md §3`，标出 Format/Lint/Typecheck/Test/Merge gate 命令是否已填实（留空=门禁形同虚设，标 ⚠️）。
8. **渲染**（直接在对话输出，不写文件）：
```
# SDD 项目仪表盘
当前终端：<worktree 目录> @ <分支>   （← 标"你在这里"）

## 在建 features（按 worktree 归属）
| Feature | 所属终端(worktree) | 分支 | 进度 | 当前节点 | 实时 | 最后活动 | 备注 |
|---------|-------------------|------|------|---------|------|---------|------|
| 001-user-auth | ../app--001-user-auth | sdd/001-user-auth | 4/9 | T5 | 🟢 working | 12s 前 | ← 你在这里 |
| 002-payment   | ../app--002-payment   | sdd/002-payment   | 1/6 | T2 | 🟢 idle(等输入) | 3m 前 | 别的终端 |
| 004-search    | ../app--004-search    | sdd/004-search    | 3/7 | T4 | 🟢 委派中(workflow) | 18m 前 | workflow 期间心跳停更属正常 |
| 003-report    | ../app--003-report    | sdd/003-report    | 2/8 | T3 | ⚪ 可能已关闭 | 41m 前 | 心跳已过期 |

## 主干上的（未起 worktree / 草稿）
| 003-search | (main, 无 worktree) | — | Draft | 0/0 |

## 已归档（specs/archive/）
- 000-shared-user (Archived)
- 003-user-auth (Archived)
  └─ deltas: 012-add-mfa · 015-sso-login   （delta 嵌在源 archive/003-user-auth/deltas/ 下）

## 📌 待补齐 / Backlog（specs/BACKLOG.md，有开着的项就显示）
- [ ] BL-001 · 多渠道退款路由 · 来源 002-payment · 目标:接 alipay 时
- [~] BL-003 · 导出对账单 · 已排期 → 005-export
> 共 N 项待补齐 · M 项已排期。起新功能时 /sdd:specify 会主动问要不要纳入；别让它们一直挂着。

## 门禁健康
- Format ✅ | Lint ✅ | Typecheck ⚠️未填 | Test ✅ | Merge gate ✅
```
9. **`mine` 参数**：只显示"当前 worktree/分支对应的那个 feature"——回答"我这个终端在做哪个 feat"。

## 纪律
- ❌ **本命令绝不写任何文件**——纯派生只读 + 只读心跳文件，这正是它能多终端并发的原因。心跳由 `status_report.py` hook 各终端自写（一终端一文件），本命令**只读不写**。
- ✅ "哪个终端创建/在做哪个 feature"= 看 `git worktree list` 的 分支↔目录 映射，这是唯一权威、且天然并发安全；**实时忙闲/存活**才看心跳，两者互补。
- ✅ 心跳是**尽力而为的可观测性**，不是协调/加锁：派生事实（worktree/specs/git）永远权威，心跳与派生冲突时以派生为准。终端关闭不会清文件，靠 `lastActivity` 时间戳判过期。
- ✅ 单机多终端：各 worktree 是本地目录、共享一个 .git，可直接读其文件与 `sdd-runtime/` 心跳汇总。
