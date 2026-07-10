---
description: 跨终端同步 / Pull another feature's committed work (or latest main) into the current worktree — safely merge/rebase across worktrees that share one .git. 两个交叉的 feature/终端之间共享信息：先 commit，再 sync。
argument-hint: "[main(默认) | from <feature-slug> | <branch>] [--rebase]"
disable-model-invocation: true
allowed-tools: Read, Glob, Bash(git *), Bash(ls *), Bash(pwd), Bash(cat *)
---

# /sdd:sync — 把别的 feature / 最新 main 同步进当前 worktree

解决"两个交叉 feature 在各自 worktree 里如何共享信息"。原理：所有 worktree 共享同一个 `.git`，任何分支只要**已提交**，就能合并进当前分支（本地、无需网络）。**未提交的工作无法共享**——想被别人用，先 commit。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **环境确认**：`git rev-parse --is-inside-work-tree`（非 git 仓库则退出提示）。读当前分支 `git rev-parse --abbrev-ref HEAD`、当前 worktree 路径。若当前就在 base/main 上，提示"sync 一般在 feature 分支上做"。

2. **解析来源 ref**（按 $ARGUMENTS）：
   - 空 或 `main` → 来源 = 默认分支（探测 `main`/`master`）。最常见：把主干最新变更跟进当前 feature。
   - `from <feature-slug>` → 来源 = `sdd/<feature-slug>` 分支（直接拿另一个在建 feature 的**已提交**成果）。
   - 直接给分支名 → 用该分支。
   - `from <feature-slug>` 的 slug 必须匹配 `^(?:[0-9]{3}-)?[a-z0-9]+(?:-[a-z0-9]+)*$`；直接分支名必须先通过 `git check-ref-format --branch`。随后用结构化 argv 调 `git rev-parse --verify --end-of-options <ref>^{commit}` 校验唯一存在；失败则列出可选分支。不得把用户输入拼进 shell 命令。

3. **安全闸（关键）**：`git status --porcelain` 检查当前 worktree 是否干净。
   - **脏**（有未提交改动）→ **停下**，提示先 commit 或 stash，**不替用户冒险合并**。

4. **选策略**：
   - 默认 **merge**：`git merge --no-ff --no-edit <source>` —— 保留历史且不拉起编辑器，适合来源是别人也在用的共享分支。
   - `--rebase`：`git rebase <source>` —— 线性历史，适合"把 main 跟进到**尚未共享/未推送**的本 feature 分支"。⚠️ 已推送/已被别人引用的分支不要 rebase。

5. **冲突处理**：一旦冲突 → **立即停**，列出冲突文件，给出处理指引（手动解决 → `git add <file>` → `git -c core.editor=true merge --continue` 或 `git rebase --continue`；或 `--abort` 回滚）。merge continue 复用既有 `MERGE_MSG` 且不得拉起编辑器；**绝不自动猜测解决**。

6. **报告**：成功后给出本次并入了哪些提交与改动概览（`git log --oneline <before>..HEAD`、`git diff --stat`），并提醒：若共享的是接口/数据模型，确认与规格层（design.md/契约）一致。

## 何时用哪个
- B 要用 A 还没合并到 main 的成果（A 已 commit）→ `/sdd:sync from <A的slug>`
- A 已合并到 main，本 feature 想跟进 → `/sdd:sync`（默认 main）或 `/sdd:sync main --rebase`
- 可预见的共享底座 → 别 sync，改用"共享 foundation feature 先落 main"（见 `/sdd:worktree` 的跨 feature 协调）

## 纪律
- ✅ 只能同步**已提交**的内容；提醒小步提交，成果才可被共享。
- ✅ 工作树脏、或遇冲突，一律停手交还用户。
- ✅ 共享的契约以**规格层**为权威；代码同步后要与 design.md 对齐，别让两个 feature 各自漂移。
- ⚠️ 有远程协作时，同步前可能需要先 `git fetch`；本命令默认操作本地分支。
