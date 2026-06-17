---
description: 并发隔离 / Manage git worktrees so multiple terminals (or parallel features) work in physically isolated directories — no more cross-terminal git reset clobbering. 每个 feature 一个分支+独立工作目录+一个终端，互不干扰。生命周期：start(建分支+worktree) → 干活 → finish(合并+清理)。
argument-hint: "start <feature-slug> [from <base>] | list | finish <feature-slug> [--no-merge] | abort <feature-slug>"
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(git *), Bash(ls *), Bash(pwd), Bash(cat *)
---

# /sdd:worktree — 多终端并发隔离

解决"一台电脑多终端共享一个工作树，A 终端 git 操作把 B 终端的改动 reset 掉"的问题。**原理**：每个 feature 用 `git worktree` 长出一个独立物理目录，挂在独立分支上，共享同一个 `.git`。一个 feature = 一个分支 = 一个 worktree 目录 = 一个 Claude 终端，彼此 `reset`/切分支互不影响。

## 用户输入
$ARGUMENTS

## 通用约定
- 分支名：`sdd/<feature-slug>`（如 `sdd/001-user-auth`）
- worktree 目录：仓库**同级**目录 `../<repo-name>--<feature-slug>/`（不可嵌套在仓库内部，git 会拒绝）
- base 默认 = 当前默认分支（探测 `main`/`master`/`git symbolic-ref`）

## 前置检查（所有子命令先做）
1. `git rev-parse --is-inside-work-tree`：不在 git 仓库 → 提示 `git init` 后再用（或询问是否帮忙初始化）。
2. 用 `git rev-parse --show-toplevel` 确认仓库根；`git worktree list` 了解现状。

## 子命令

### `start <feature-slug> [from <base>]`
> **这是并发场景下分配功能编号的"单一前门"**——号在这里定，避免多终端各自 specify 时撞号。
在干净基线上长出隔离工作区：
1. 确认 base 分支存在且本地干净（`git status --porcelain`）。若主 worktree 有未提交改动，提醒：**这些改动不会进入新 worktree**，建议先提交/暂存。
2. **重要**：项目级共享文件（`specs/constitution.md`、`specs/stacks/*.md`）应已提交到 base，新 worktree 才能看到它们。
3. **并发安全地分配编号（防撞号）**：若传入的 slug 没带 `NNN` 前缀，就分配一个——编号 = 对 `specs/NNN-*` + `specs/archive/NNN-*` + **嵌套归档 delta `specs/archive/*/deltas/NNN-*` 与 `specs/*/deltas/NNN-*`**（嵌进源里的 delta 也占全局号，必须递归扫到）+ **`git branch --list 'sdd/*'`**（共享 .git，**含别的终端在建的**）+ `git worktree list` 的 NNN **取并集最大值 +1**，零填充三位。得到 `sdd/NNN-slug`。
4. **创建前最后一道闸**：`git branch --list sdd/NNN-slug` **输出非空** = 已存在（被并发抢先）→ **编号 +1 重试**，直到输出为空。（用 `--list` 而非 `rev-parse --verify`：它永远 exit 0、靠输出判断，避免"分支不存在"的正常分叉被当成命令执行错误。）
5. 执行：`git worktree add -b sdd/<NNN-slug> "../<repo>--<NNN-slug>" <base>`。**git 建分支是原子的=最终防线**：若因"分支已存在"失败（极限并发下被抢先）→ **编号 +1 重试**该命令，直到成功。
6. 报告新目录绝对路径，并明确告诉用户：
   > 👉 **打开一个新终端，cd 到该目录，在那里启动 Claude**，再跑 `/sdd:specify → … → /sdd:implement`（或 `/sdd:auto`）。本终端不要继续在这个 feature 上操作。
   > 多个 feature 在并行时，随时 `/sdd:status` 看全局（谁在做哪个、进度、门禁健康）。

### `list`
`git worktree list` 输出，并标注哪些是 SDD worktree（分支前缀 `sdd/`）、各自对应哪个 feature。
> 想看更全（进度 / 归属终端 / 门禁健康）→ `/sdd:status`（派生只读，多终端并发安全）。

### `finish <feature-slug> [--no-merge]`
功能验收并入主干后的**一键收尾**：对账 → 合并门 → 合并 → **自动删 worktree + 删分支 + prune**（合并成功才删）→ 归档。
⚠️ **必须在主 worktree（base 分支所在目录）运行，不能在该 feature 自己的 worktree 里运行**——你删不掉自己脚下的工作树，所以收尾要从主终端发起（在 feature 终端验收完，切回主终端 `finish` 即自动清掉那个 worktree）。
1. 检测当前是否就站在要清理的那个 worktree 里 → 是则**拒绝**，提示切回主 worktree 再来。
2. 确认 feature worktree 干净（无未提交改动）；脏则提示先在那个终端提交。
3. **规格对账（reconcile，冻结前必做，治"文档停更")**：合并即冻结——所以**先让规格= 实际所建**。
   - 核对 `requirements.md`/`design.md` 与实际实现（可借 `/sdd:analyze` 查 staleness）；把实现期的业务/技术偏移**回填进规格**：修正受影响的 AC、更新 design，确认 `## Deviations / 实现偏移` 段已覆盖。
   - 有未回填的偏移 → **先回填再继续**。对账完成的规格才允许进入合并→冻结。
4. **合并门（防全局功能偏移，关键）**：在 feature 分支上跑 constitution §3 的 **Merge gate——全量测试套件 + lint + typecheck + 架构 fitness（依赖方向/分层/重复率/复杂度）**，**不只是本功能的测试**。
   - **用 §3「Merge gate 性能」里钉的"缓存+并行"命令跑，别裸跑串行全量**——模块多时裸跑会让合并成关键路径瓶颈。缓存只跳过"未变模块"（零安全损失，跑的还是全部）。没填性能命令的项目，提示去 §3 补（Maven `-T 1C`+build-cache、Gradle `--parallel --build-cache` 等）。
   - 有**任何老功能的测试报红** → **停下**，这说明新功能改坏了已有功能（典型的"后期功能偏移"），原样报告失败项，等修复，**不准合并**。
   - fitness 不过（如重复率超阈值、分层违规）→ 同样停下，先治理。
5. 切到 base（在主 worktree 上）：`git switch <base>`。
6. 默认合并：`git merge --no-ff sdd/<slug>`。
   - 有冲突 → **停下**，原样报告冲突文件，等用户解决；不要自作主张。
   - 有远程协作流程时，可改为推分支 + 提 PR（询问用户偏好）。
   - `--no-merge`：跳过合并（改动留在分支上）。
7. **自动收尾（合并成功后自动执行，无需再确认——已并入主干故安全）**：
   - `git worktree remove "../<repo>--<slug>"`（工作树不干净会失败，这本身就是安全闸：有未提交内容绝不删）。
   - `git branch -d sdd/<slug>`（`-d` 仅允许删**已合并**分支；删不掉=没真合并，停下排查，别用 `-D` 强删）。
   - `git worktree prune`（清理任何残留的 worktree 元数据，**防孤儿 worktree**）。
   - 清理该分支的心跳文件（best-effort）：删 `<git-common-dir>/sdd-runtime/sdd_<slug>.json`（`git rev-parse --git-common-dir` 定位）——终端已收尾，过期心跳不必留；删不到忽略即可。
   - ⚠️ 仅当步骤 6 **真合并成功**才自动收尾；若走了 `--no-merge`（工作未并入主干）→ **不删**，保留 worktree 等后续处理（避免丢未合并的工作）。
8. **finalize 完成度报告**：把 `specs/NNN-slug/COMPLETION.md`（若存在，由 /sdd:verify 生成）的 Status 更新为 `Merged ✅`、补合并提交与日期；不存在则简要补一份。这是该功能"做完了什么、完成度如何"的最终留档。
9. **归档（保持活跃集精简）**：合并后该 feature 的规格即"冻结的决策记录"。先读它头部有没有 **`Delta-of: MMM-target`**，分两种归档目的地（都把 Status 改为 `Archived`，并询问用户确认）：
   - **普通功能**（无 Delta-of）→ 移到 `specs/archive/NNN-slug/`（含 COMPLETION.md），照旧。
   - **delta**（有 `Delta-of: MMM-target`）→ **物理归档进源**：移到 **`specs/archive/MMM-target/deltas/NNN-delta-slug/`**，让"某功能历代被改了什么"集中在源一处可查。定位源目的地：
     1. 源已归档（`specs/archive/MMM-target/` 存在）→ 直接在其下建 `deltas/` 放入。
     2. 源仍活跃（`specs/MMM-target/` 在用、还没归档）→ 放到 **`specs/MMM-target/deltas/NNN-delta-slug/`**，等源将来归档时随源一起搬进 archive。
     3. 源找不到（ID 写错/已被清理）→ **不要乱放**：退回扁平 `specs/archive/NNN-delta-slug/` 并**告警**让用户核对 `Delta-of` 是否写错。
   - **回写源的变更日志**：归档 delta 后，在**源**的 `COMPLETION.md` 追加/维护一段 `## Change Log / Deltas`，加一行：`- NNN-delta-slug · <合并日期> · <一句话变更摘要>`（源已归档则改其 archive 里的 COMPLETION.md）。这样不打开 delta 也能从源看到它被改过几次。
10. **对账待补齐台账**：读 `specs/BACKLOG.md`（不存在=老项目没建过 → 跳过本步）——本功能补齐了的延后项标 `[x] 已补齐 · 由 NNN-slug 完成 · <日期>`（若 verify 已勾则核对一致）；**仍开着的延后项在报告里再提醒一次**（含目标），别让它们随这次收尾被忘掉。台账是项目级文件、不随 feature 归档。
11. 报告：合并结果、已删除的 worktree 与分支、COMPLETION.md 已 finalize、归档落点（普通 `archive/NNN` 还是 delta 嵌入 `archive/MMM-target/deltas/NNN`）、**BACKLOG 本次勾掉/仍开着的延后项**。

### `abort <feature-slug>`
不合并直接丢弃（确认后）：`git worktree remove --force "../<repo>--<slug>"` + `git branch -D sdd/<slug>`。**销毁性操作，先确认。**

## 跨 feature 交叉协调 / Coordinating overlapping features
两个 feature 有交叉时，按交叉性质选：
- **① 共享底座（最佳）**：能预见的共享部分（公共 model/类型/契约/工具），**抽成一个独立 foundation feature 先建先合并到 main**，再让交叉的 feature 从更新后的 main `start`——交叉消失在源头。
  > `/sdd:worktree start 000-shared-<thing>` → 实现并 `finish` 合并到 main → 再 `start` 各 feature。
- **② B 临时要用 A 的在建成果**（A 已 commit）：在 B 的 worktree 里 `/sdd:sync from <A-slug>`。
- **③ A 已并入 main，本 feature 跟进**：`/sdd:sync`（默认拉 main）。
- **④ 抢同一热点文件**（路由表/`app.json`/store 入口）：指定单一 owner 改它，或设计成追加式（各 feature 注册自己的模块），合并时局部解冲突。

共享原则：**跨终端只能共享已提交内容**（未提交的工作互相不可见）；共享的**契约以规格层（design.md/契约文件）为权威**，别让两 feature 照着对方在建代码各自漂移。

## 纪律
- ✅ 每个并发 feature 各自一个 worktree + 终端；**绝不在同一目录开多个终端互相 reset**。
- ✅ `finish`/`abort` 是破坏性操作，执行前确认；合并冲突一律停下交还用户。
- ✅ 与 `/sdd:implement` 配合：实现期的并行子代理在**同一个 feature worktree 内**按 Boundary 不重叠并行；跨 feature 的并行才用多 worktree。
- ❌ 不在 feature worktree 里运行 `finish`（会试图删除脚下目录）。
