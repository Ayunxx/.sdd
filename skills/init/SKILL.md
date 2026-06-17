---
description: 初始化 / One-shot bootstrap SDD into the current project — ensure git, create specs/ structure, auto-scan & generate the constitution, activate detected stack packs, wire CLAUDE.md discipline. 一条命令把 SDD 流程装进当前目录，之后即可 /sdd:auto 开干。每个项目跑一次。
argument-hint: "[--vendor 把命令拷进项目 .claude/ 供没装全局插件的同事用]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /sdd:init — 把 SDD 装进当前项目（一次性）

把当前目录初始化成一个 SDD 项目：建结构、自动生成宪法、激活能力包、接上 CLAUDE.md 纪律。跑完即可 `/sdd:auto <想法>` 或 `/sdd:specify`。

> 命令本身来自**全局插件**（装过就处处可用，无需拷进项目）；本命令只负责**项目侧**的一次性准备。

## 用户输入
$ARGUMENTS

## 先识别情况（区分四种，分别处理）
1. **空目录 / 全新项目（无 git）** → git init + 全套初始化。
2. **已有 git 仓库、还没用过 SDD**（最常见的"后引入"）→ **跳过 git init**，只做 SDD 侧准备。
3. **已有 SDD**（`specs/constitution.md` 已存在）→ 幂等：只补缺失，不覆盖。
4. **已有 `CLAUDE.md` / 有未提交改动** → 不清空、不覆盖，CLAUDE.md 用追加且查重。

## 执行步骤

1. **幂等检查**：若已有 `specs/constitution.md` → 已初始化（情况 3），问用户：① 仅补缺失项 / ② 重新生成宪法 / ③ 退出。**不覆盖已有成果**。

2. **Git（按情况，不重复 init）**：先 `git rev-parse --is-inside-work-tree` 判断——
   - **已是 git 仓库** → **跳过，不再 `git init`**（后引入的项目就走这条）。
   - **不是** → 说明 worktree/合并门/sync 都依赖 git，确认后 `git init`。
   > 备注：即便误跑，`git init` 对已有仓库也是**安全幂等**的（只 "Reinitialized"，不动任何提交/分支/工作区/历史）——但本命令仍按上面判断，不做多余操作。

3. **建结构**：创建 `specs/`、`specs/stacks/`、`specs/archive/`（缺则建）；并建项目级延后台账 `specs/BACKLOG.md`（缺则建，已存在不动），骨架如下——这是"现在不做、未来补"的唯一长存落点，**绝不放进任何 feature 目录**（会随归档沉底）：
   ```markdown
   # Backlog / 待补齐台账
   > 项目级延后清单：实现/推进中决定"现在不做、未来补"的范围，落这里防遗漏。跨 feature/epic 长存。
   > 与 design §11 ## Deviations 的区别：Deviations = "做成了别的样子"（对账用、合并即冻结）；本台账 = "没做、要以后做"（待办，会被各阶段主动回捞）。
   > 状态：[ ] 待补齐 · [~] 已排期(写明纳入哪个 feature) · [x] 已补齐(写明由哪个 feature 完成 + 日期)。ID 用 BL-NNN 递增。

   ## 待补齐 / Open
   <!-- - [ ] BL-001 · 来源:002-payment/T7(AC5) · 内容:多渠道退款路由 · 因:本期仅接微信 · 目标:接 alipay 时 · 记于:2026-06-13(用户确认延后) -->

   ## 已排期 / Scheduled

   ## 已补齐 / Done
   ```

4. **生成宪法（自动扫描）**：执行 `/sdd:constitution` 的扫描逻辑（**任意语言**）——探测技术栈、把门禁填成项目已有的真实命令（package.json scripts / Makefile / CI 配置 / 惯用工具…）、从目录结构推断架构 → 写 `specs/constitution.md` 草稿。**展示探测到了什么，让用户核对**；探测不到的标 `[待定]`。

5. **激活能力包**：据探测到的层（前端/服务端/DB/移动/小程序…）**建议**该 `/sdd:stack add` 哪些，确认后写入 `specs/stacks/*.md` 并登记进宪法 §7。
   - **monorepo（多子项目）**：为**每个子项目各生成一份能力包**（如 `frontend.md`/`backend.md`/`embedded.md`），各带本子项目的 §7 门禁命令——之后实现某子项目的任务就用它那套门禁，互不干扰。

6. **接上 CLAUDE.md 纪律**：把插件 `CLAUDE.snippet.md` 的内容**追加到项目根 `CLAUDE.md`**（无则创建；已含 SDD 段则跳过）——让每次会话自动守"规格优先 / 并发安全 / 质量门禁 / 对账冻结"纪律。

7. **换行一致性**：若项目无 `.gitattributes` 且宪法 §3 提到统一换行 → 建议加一份（`* text=auto eol=lf` 之类）。

8. **（可选 `--vendor`）项目自带命令**：把框架 `skills/` + `agents/` 拷进项目 `.claude/`，让**没装全局插件的同事**也能用（此模式命令名不带 `sdd:` 前缀）。代价：随仓库走、更新需手动同步。默认**不做**（推荐大家各自装全局插件）。

9. **收尾**：`git add` 新增的 `specs/` 与 `CLAUDE.md`（**不自动 commit**，让用户掌控）；汇报做了什么 + 下一步：`/sdd:auto <想法>`（自动驾驶）或 `/sdd:specify`（手动逐步）；多 feature 并行时用 `/sdd:status` 看全局、`/sdd:worktree` 隔离。

## 纪律
- ✅ 任何写入/破坏性操作（git init、改 CLAUDE.md、覆盖宪法、--vendor 拷文件）前**先确认**。
- ✅ **幂等**：已初始化不乱覆盖，只补缺。
- ❌ 不自动 commit；不在本步骤设计任何功能（那是 /sdd:specify 起的事）。
