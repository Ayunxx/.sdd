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

3. **建结构**：创建 `specs/`、`specs/stacks/`、`specs/archive/`、`specs/backlog/`（缺则建）；并建只读说明/兼容入口 `specs/BACKLOG.md`（缺则建，已存在不动）。**新延后项的唯一事实源是一项一文件的 `specs/backlog/BL-<featureNNN>-<seq>.md`**，绝不追加到共享 BACKLOG.md，也不放进 feature 目录。这样不同 feature 合并时添加不同文件，不在同一 Markdown 尾部制造热点冲突。
   ```markdown
   # Backlog / 待补齐索引
   > Canonical entries live in `specs/backlog/BL-*.md`; `/sdd:status` derives the Open/Scheduled/Done view.
   > Do not append new entries here. Existing legacy list entries remain readable until deliberately migrated.
   ```
   每个 canonical item 固定字段：`# BL-002-001`、`Status: open|scheduled|done`、`Source`、`AC`、`Content`、`Reason`、`Target`、`Recorded`，以及状态变化时的 `Scheduled-in`/`Completed-by`。占号前先把 NFC 规范化后的 `Source/AC/Content/Reason/Target` 按固定键序列化为 canonical JSON，计算 SHA-256 `decisionDigest`（`Recorded` 是落盘时间，不参与稳定身份）。永久 `refs/sdd/backlog-ids/BL-002-001` 做 expected-absent CAS，指向包含 `protocol/id/source/decisionDigest` 的 `sdd-backlog-id-v1` owner blob；读取时用 `git cat-file blob` 校验。CAS 失败时，只有 blob digest 与请求一致且现有 item 内容重算 digest 也一致才算同一决策中断恢复；同一 task/AC 的另一段 Content/Reason 仍是不同 owner，必须取下一 seq，绝不复用/覆盖赢家。ref 永不删除。

4. **生成宪法（自动扫描）**：执行 `/sdd:constitution` 的扫描逻辑（**任意语言**）——探测技术栈、把门禁填成项目已有的真实命令（package.json scripts / Makefile / CI 配置 / 惯用工具…）、从目录结构推断架构 → 写 `specs/constitution.md` 草稿。**展示探测到了什么，让用户核对**；探测不到的标 `[待定]`。

5. **激活能力包**：据探测到的层（前端/服务端/DB/移动/小程序…）**建议**该 `/sdd:stack add` 哪些，确认后写入 `specs/stacks/*.md` 并登记进宪法 §7。
   - **monorepo（多子项目）**：为**每个子项目各生成一份能力包**（如 `frontend.md`/`backend.md`/`embedded.md`），各带本子项目的 §7 门禁命令——之后实现某子项目的任务就用它那套门禁，互不干扰。

6. **接上 CLAUDE.md 纪律**：把插件 `CLAUDE.snippet.md` 的内容**追加到项目根 `CLAUDE.md`**（无则创建；已含 SDD 段则跳过）——让每次会话自动守"规格优先 / 并发安全 / 质量门禁 / 对账冻结"纪律。

7. **换行一致性**：若项目无 `.gitattributes` 且宪法 §3 提到统一换行 → 建议加一份（`* text=auto eol=lf` 之类）。

8. **（可选 `--vendor`）项目自带命令与运行时**：以当前 Git 仓库根为 `PROJECT_ROOT`，再定位插件根（优先 `${CLAUDE_PLUGIN_ROOT}`；找不到或源文件不完整就停止）。经用户确认后按下面的**固定映射**复制；创建目标目录但不改变层级、文件名或扩展名：
   - `skills/*` → `PROJECT_ROOT/.claude/skills/*`
   - `agents/*` → `PROJECT_ROOT/.claude/agents/*`
   - `workflows/*` → `PROJECT_ROOT/.claude/sdd/workflows/*`
   - `stacks/*` → `PROJECT_ROOT/.claude/sdd/stacks/*`

   `workflows/` 必须整体复制，至少包含 `sdd-implement.js`、`sdd-implement-core.js` 与 `git-audit.cjs`；不得只复制入口脚本。它是一个原子版本集：任一目标不同就展示整组差异，只允许“整组覆盖”或“整组跳过”（默认跳过），禁止把新旧版本混成不一致的运行时。复制后逐项确认目标存在且与来源内容一致，再报告 vendored 模式可用；此模式命令名不带 `sdd:` 前缀。代价：文件随仓库走，插件升级后需重新执行 `--vendor` 并人工确认同步。默认**不做**（推荐大家各自安装插件）。

9. **收尾**：`git add` 新增的 `specs/` 与 `CLAUDE.md`（**不自动 commit**，让用户掌控）；汇报做了什么 + 下一步：`/sdd:auto <想法>`（自动驾驶）或 `/sdd:specify`（手动逐步）；多 feature 并行时用 `/sdd:status` 看全局、`/sdd:worktree` 隔离。

## 纪律
- ✅ 任何写入/破坏性操作（git init、改 CLAUDE.md、覆盖宪法、--vendor 拷文件）前**先确认**。
- ✅ **幂等**：已初始化不乱覆盖，只补缺。
- ❌ 不自动 commit；不在本步骤设计任何功能（那是 /sdd:specify 起的事）。
