---
description: 并发隔离 / Manage git worktrees so multiple terminals (or parallel features) work in physically isolated directories — no more cross-terminal git reset clobbering. 每个 feature 一个分支+独立工作目录+一个终端，互不干扰。生命周期：start(建分支+worktree) → 干活 → finish(合并+清理)。
argument-hint: "start <feature-slug> [from <base>] | list | finish <feature-slug> [--no-merge] | finalize-pr <feature-slug> <merge-sha> | abort <feature-slug>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(git *), Bash(ls *), Bash(pwd), Bash(cat *), Bash(mkdir *), Bash(mv *), Bash(mktemp *), Bash(rmdir *), Bash([ *), Bash(command -v *), Bash(nohup *), Bash(x-terminal-emulator *), Bash(gnome-terminal *), Bash(konsole *), Bash(xterm *)
---

# /sdd:worktree — 多终端并发隔离

解决"一台电脑多终端共享一个工作树，A 终端 git 操作把 B 终端的改动 reset 掉"的问题。**原理**：每个 feature 用 `git worktree` 长出一个独立物理目录，挂在独立分支上，共享同一个 `.git`。

> **唯一状态模型**：一个 feature = 一个 `sdd/NNN-slug` 分支 = 一个 worktree = 一套规格 + 代码 + `tasks.md` 进度 + `COMPLETION.md` 证据。Feature 从第一行功能规格到 verify 都在这个 worktree；主 worktree 维护已提交的项目级 init/constitution/stack 基线、做全局只读查看和串行 finish。

## 用户输入
$ARGUMENTS

## 通用约定
- 分支名：`sdd/<feature-slug>`（如 `sdd/001-user-auth`）
- worktree 目录：仓库**同级**目录 `../<repo-name>--<feature-slug>/`（不可嵌套在仓库内部，git 会拒绝）
- base 默认 = 当前默认分支（探测 `main`/`master`/`git symbolic-ref`）
- Feature 目录：该 worktree 内的 `specs/<feature-slug>/`；主 worktree 不保留在建 feature 的第二份副本

## 前置检查（所有子命令先做）
1. `git rev-parse --is-inside-work-tree`：不在 git 仓库 → 提示 `git init` 后再用（或询问是否帮忙初始化）。
2. 用 `git rev-parse --show-toplevel` 确认仓库根；`git worktree list` 了解现状。

## 子命令

### `start <feature-slug> [from <base>]`
> **这是所有非 trivial feature 的单一前门**——不只为了并发，也为了让规格与实现从一开始就在同一分支。
在干净基线上创建或复用隔离工作区：
0. **参数先验校验**：原始 `<feature-slug>` 必须匹配 `^(?:[0-9]{3}-)?[a-z0-9]+(?:-[a-z0-9]+)*$`；拒绝空白、`..`、斜杠、反斜杠、shell 元字符、前后连字符和大小写变体。生成最终 `NNN-slug` 后再用参数数组调用 `git check-ref-format --branch "sdd/NNN-slug"`。任何失败都在执行 `worktree add` 前停止，不做转义猜测。
1. 确认 base ref/commit 可唯一解析且本地干净（`git status --porcelain`）。若主 worktree 有未提交改动，提醒：**这些改动不会进入新 worktree**，建议先提交/暂存。所有 Git 调用使用结构化 argv；不得把 slug/base/路径拼成一段 shell 命令。
2. **重要**：项目级共享文件（`specs/constitution.md`、`specs/stacks/*.md`）应已提交到 base，新 worktree 才能看到它们。
3. **以纯 NNN 原子保留 Feature ID（不同 slug 也不能撞号）**：
   - 占用集合必须同时扫描 `specs/NNN-*`、`specs/archive/NNN-*`、嵌套 delta、`sdd/NNN-*` 分支、worktree，以及永久 reservation `refs/sdd/feature-ids/NNN`。无显式 NNN 时从并集 `max+1` 起尝试；显式 NNN 时也必须检查**该数字的所有身份**，不是只查完整 branch 名。若 `005-old` 已占用，`start 005-new` 必须拒绝，不能创建第二个 005。
   - 对每个候选先解析固定 `BASE_SHA`，构造唯一 UTF-8 owner record `sdd-feature-id-v1\nid=<NNN>\nslug=<NNN-slug>\nbase=<BASE_SHA>\n`，通过 stdin（不是 shell 字符串）执行 `git hash-object -w --stdin` 得到持久 `OWNER_BLOB_OID`。按仓库 object format 生成 40/64 位全零 `ZERO_OID`，再执行 expected-absent CAS：
     ```text
     git update-ref --create-reflog -m "sdd reserve feature-id <NNN> for <NNN-slug>" \
       refs/sdd/feature-ids/<NNN> <OWNER_BLOB_OID> <ZERO_OID>
     ```
     所有参数独立传 argv，不经 shell 拼接。只有 CAS 成功者拥有该 NNN；失败后重新扫描 reservation/分支/规格，自动编号取下一候选，显式编号则报告占用并停止。这样 `sdd/005-a` 与 `sdd/005-b` 即使 branch 名不同也只能有一个成功。
   - reservation **永久保留**，finish/abort 不删除，owner blob 因 ref 可达不会依赖 reflog 保留期。每次读取都用 `git cat-file blob refs/sdd/feature-ids/NNN` 校验协议/id/slug/base；reflog 只作审计，不能作为 owner 真相。创建 branch/worktree 中途失败也不释放；无 live branch 时，只要 owner blob 与请求的 `<NNN-slug>` 精确一致，就可按其中固定 base 重试创建。owner 不同/损坏、reservation 缺失却已有多身份，或同 NNN 已有其它遗留 slug 时 fail closed，先人工 reconcile，不能猜测或覆写 ref。
4. **先判复用，再判新建**（修复旧版占号分支与 `-b` 冲突）：先把仓库根与目标目录解析为规范绝对路径，断言目标的父目录严格等于仓库父目录、basename 严格等于 `<repo-name>--<NNN-slug>`，且目标不在仓库内部；校验失败就停止。
   - `git worktree list` 已有 `sdd/NNN-slug` → 不创建；报告已有绝对路径并交接用户进入。
   - 分支存在、但没有 worktree（常见于旧版 auto 的“只占号”）→ `git worktree add "../<repo>--<NNN-slug>" sdd/<NNN-slug>`，**附着已有分支，不带 `-b`**。
   - 分支不存在 → 仅在已成功拥有对应 `refs/sdd/feature-ids/NNN` reservation 后，执行 `git worktree add -b sdd/<NNN-slug> "../<repo>--<NNN-slug>" <BASE_SHA>`，一次创建分支与 worktree。若失败，保留 reservation 供同 slug 恢复并报告现场；不得把该 NNN 让给另一个 slug。
5. **创建后完整性检查**：新 feature 此时可以还没有 `specs/NNN-slug/`，但后续 `/sdd:specify` 必须在新 worktree 内创建它；若发现同名规格只在主 worktree，进入下方旧项目迁移协议，不得继续形成两份事实源。
6. **交接而不隐式拉起 GUI**：始终报告新目录的规范绝对路径，并提示：
   > 👉 **打开一个新终端，cd 到该目录，在那里启动 Claude**，再跑 `/sdd:specify → … → /sdd:implement`（或 `/sdd:auto`）。
   只有用户明确要求代开终端时才启动 GUI；优先使用终端原生 working-directory 参数，不把路径拼进 `bash -c`/`cmd /c` 字符串。无法结构化传目录就只报告路径，不尝试。
   - 本终端不要继续在这个 feature 上操作；多个 feature 并行时，随时 `/sdd:status` 看全局（谁在做哪个、进度、门禁健康）。

### 旧项目/旧版布局迁移
发现以下任一情况时，先迁移，`implement`/`verify` 必须拒绝跨工作树续跑：

1. **已有 `sdd/NNN-slug` 分支但无 worktree**：按 `start` 第 4 步使用不带 `-b` 的 `git worktree add <path> sdd/NNN-slug` 附着，保留原分支历史。
2. **规格只在主 worktree，Feature Worktree 没有**：把 `specs/NNN-slug/` 的完整内容转移到 Feature Worktree，逐文件核对 requirements/design/tasks/spec/COMPLETION，连同 Feature 代码提交到 `sdd/NNN-slug`。若主干副本含未提交改动，先报告并取得用户确认，禁止静默覆盖或删除。
3. **规格在主、代码在 Feature Worktree（split-brain）**：以内容对账而不是按时间戳猜；将实现偏移与任务进度回填到 Feature 分支中的规格，运行 `/sdd:analyze`/`/sdd:verify` 核验。迁移完成并提交后，主干重复副本才可在用户确认下清理。
4. **主干已有已提交的旧规格但尚无 Feature 分支**：从包含该规格的 base commit 创建标准 `sdd/NNN-slug` worktree；之后所有更新只发生在 Feature Worktree。若无法自动判定应保留哪份，停下让用户选择，不做隐式搬运。

迁移完成标准：`git worktree list` 有且仅有一个 `sdd/NNN-slug` 映射；该 worktree 同时含规格、代码、任务状态和已有验证证据；主 worktree 不再有未合并的同名副本。

### `list`
`git worktree list` 输出，并标注哪些是 SDD worktree（分支前缀 `sdd/`）、各自对应哪个 feature。
> 想看更全（进度 / 归属终端 / 门禁健康）→ `/sdd:status`（派生只读，多终端并发安全）。

### `finish <feature-slug> [--no-merge]`
功能验收并入主干后的**事务化收尾**：锁定 → 固定快照门禁 → 构造候选 merge commit → 原子发布 base ref → finalize/归档 → 最后清理。任何一步失败都 fail closed，并保留 Feature Worktree、分支与 gate 回执以便恢复。

⚠️ **必须在 base 分支所在的主 worktree 运行，不能在 feature 自己的 worktree 运行。** finish 期间不得让其他进程写主/Feature Worktree；原子 ref 锁与 CAS 保护 Git 历史，工作目录仍需要这一协作纪律。

#### 0. 统一的 `finally`（先建立，再做任何写操作）
执行器必须记录 `LOCK_ACQUIRED`、本 attempt 唯一的 `LOCK_OID`、`LOCK_ROOT`、`GATE_ROOT/GATE_DIR`、`EVIDENCE_ROOT/EVIDENCE_DIR`、`MERGE_ROOT/MERGE_DIR`、`FINALIZE_ROOT/FINALIZE_DIR`。无论成功、命令失败、中断或用户选择停止，每个出口都按以下顺序执行；若用单个 shell driver，可用 `trap` 实现，跨多次工具调用则逐出口显式执行，不能假定 trap 会跨进程存在：

1. 若临时 merge worktree 存在，先 best-effort `git -C "$MERGE_DIR" merge --abort`，再 `git worktree remove --force "$MERGE_DIR"`；`--force` **只允许用于本次由 `mktemp` 创建、已核对绝对路径的临时 worktree**。
2. 对本次已注册的 `FINALIZE_DIR`、`EVIDENCE_DIR`、`GATE_DIR` 依次执行 `git worktree remove --force <dir>`；随后分别对已核对且为空的 `MERGE_ROOT`、`FINALIZE_ROOT`、`EVIDENCE_ROOT`、`GATE_ROOT` 执行 `rmdir`，再 `git worktree prune`。不得对计算路径执行递归删除。
3. 仅当本次原子获取锁成功、`LOCK_ACQUIRED=1` 时，才执行 `git update-ref -d "$FINISH_LOCK_REF" "$LOCK_OID"`。这是 expected-old 释放；失败时保留锁并报告人工核对命令，绝不能无条件删锁或删掉另一会话的锁。释放尝试完成后（或本次从未获得锁），对本次 `mktemp -d` 创建且已核对为空的 `LOCK_ROOT` 执行 `rmdir`；owner blob 已持久记录 nonce，不依赖目录继续存在。

清理动作均为 best-effort 并累计错误，某一个清理失败不能短路后续清理或锁释放。临时 worktree 的清理属于 `finally`；Feature Worktree、feature 分支和 gate 回执**不属于** `finally`，只在 finalize 已成功后按第 7 步删除。

#### 1. 主工作树预检与原子 Git ref 锁

1. 用 `git rev-parse --show-toplevel`、`git worktree list --porcelain` 和 `git symbolic-ref --quiet HEAD` 确认当前目录是主 worktree，且 HEAD 正是目标 base 的完整 ref（例如 `refs/heads/main`）；detached HEAD、其他 Feature Worktree 或 `git status --porcelain` 非空都拒绝。唯一例外是 `finalize-pr` 正在恢复一份已报告的 `MERGED_UNSYNCED/FINALIZED_UNSYNCED`：获取锁前必须已只读确认 ref=`NEW_SHA` 且 index/worktree 仍完整停在 `OLD_SHA`，获取锁后按 §6.1 再验证一次；任何其他 dirty 状态仍拒绝。
2. 记录 `BASE_REF=<完整 refs/heads/...>`、`BASE_SHA=$(git rev-parse "$BASE_REF^{commit}")`，设置 `FINISH_LOCK_REF=refs/sdd/finish-lock`。用 `mktemp -d` 创建并规范化本 attempt 专属 `LOCK_ROOT`，将其 basename 作为不可复用 nonce；把固定协议、feature、base ref/SHA、nonce 组成 `sdd-finish-lock-v1` owner record，通过 stdin 执行 `git hash-object -w --stdin`，得到本 attempt 唯一 `LOCK_OID`。owner record 禁止含 token/凭据；获取后用 `git cat-file blob "$LOCK_OID"` 回读逐字段核验。
3. 用 Git 自身的 ref transaction 原子获取锁：
   ```bash
   git update-ref --create-reflog -m "sdd finish <NNN-slug> on <base>" \
     "$FINISH_LOCK_REF" "$LOCK_OID" ""
   ```
   空的 expected-old 表示该 ref 必须不存在；命令非零即说明已有 finish，当前流程不得继续，且因为没有获得锁也不得在 `finally` 删除它。用 `git cat-file blob "$FINISH_LOCK_REF"` 读取持久 owner（reflog 仅审计）。疑似陈旧锁也必须先确认没有活跃 finish、向用户说明，再用其**当前唯一 owner blob OID 作为 expected-old**删除；禁止先删再抢。
4. 获取锁后再次确认 lock ref 精确等于本 attempt 的 `LOCK_OID`、base ref 仍为 `BASE_SHA` 且主 worktree仍干净；若是上一项允许的 UNSYNCED 恢复，则先按 §6.1 复核并安全同步，再要求干净。否则走 `finally` 退出。因为每次重获都会生成不同 owner OID，旧 attempt 的 expected-old release 不能删除新锁，避免同一 base SHA 的 ABA；文件目录锁、PID 文件或“约定串行”都不能替代此 ref 锁。

#### 2. Feature 完整性与只读对账

从 `git worktree list --porcelain` 精确定位 `sdd/NNN-slug` 和 `FEATURE_ROOT`，确认规格、实现、全量任务状态、required review/Wave 抽样证据与 `COMPLETION.md` 完整，AC 无 🔴/待补签项，且 `git -C "$FEATURE_ROOT" status --porcelain` 为空。核对 requirements/design/tasks（lite 为 spec）、代码和 COMPLETION，确认冻结规格等于实际所建；发现 split-brain 或需回填时停止 finish，回 Feature Worktree 修正并提交。唯一例外是已报告的 `GATE_PUBLISHED_UNSYNCED`：持锁后先按 §6.1 恢复，恢复全绿前不得进入本节其余步骤。

执行 `git merge-base --is-ancestor "$BASE_SHA" "refs/heads/sdd/<NNN-slug>"`。失败说明 feature 未包含固定 base：先在 Feature Worktree `/sdd:sync main`，解决冲突、重跑受影响 verify 并提交；不能沿用旧 base 的绿灯。

#### 3. 在固定提交的 detached 临时 worktree 跑 gate

1. 记录 `TESTED_TIP_SHA=$(git rev-parse "refs/heads/sdd/<NNN-slug>^{commit}")`，用 `git diff --name-only "$BASE_SHA...$TESTED_TIP_SHA"` 识别 affected 范围。
2. 用 `mktemp -d` 创建唯一 `GATE_ROOT`，令尚不存在的 `GATE_DIR="$GATE_ROOT/worktree"`，执行：
   ```bash
   git worktree add --detach "$GATE_DIR" "$TESTED_TIP_SHA"
   ```
   gate 前必须确认 `git -C "$GATE_DIR" rev-parse HEAD` 精确等于 `TESTED_TIP_SHA`。**所有**编译/类型检查、架构 fitness、受影响持久测试都只在 `GATE_DIR` 执行，禁止在可移动的 Feature Worktree 跑 merge gate。触及共享核心/公共契约或无法可靠收窄时扩大到完整相关套件。
3. 每项记录实际命令、`BASE_SHA`、`TESTED_TIP_SHA`、cwd=`GATE_DIR`、退出码、摘要与日志位置；任一非零、未执行或证据不完整都停止。纯文档可写 `N/A(<理由>)`，不得留空。需要长期保留的日志必须在第 5 步写入 `EVIDENCE_DIR` 中该 feature 约定的 evidence 路径，不能提前修改附着的 Feature Worktree，也不能只引用即将删除的临时路径；gate 产生的其余构建物只存在于临时 worktree，并由 `finally` 清理。
4. gate 全绿后，先同时确认 feature ref 仍等于 `TESTED_TIP_SHA`、Feature Worktree 仍干净、base ref 仍等于 `BASE_SHA`。任一变化即丢弃本轮 gate，不得把旧绿灯套到新 tip。
5. **在 detached 临时树构造 evidence commit，不在已附着的 Feature Worktree 普通 commit。** 用 `mktemp -d` 创建唯一 `EVIDENCE_ROOT`，令 `EVIDENCE_DIR="$EVIDENCE_ROOT/worktree"`，执行 `git worktree add --detach "$EVIDENCE_DIR" "$TESTED_TIP_SHA"` 并复核 HEAD。只在 `EVIDENCE_DIR` 把 gate 结果写入 `COMPLETION.md / Quality Evidence` 及约定的持久 evidence 文件；只 `git add -- <明确路径>`，禁止 `git add -A`。要求没有未暂存变更，暂存 diff 非空且只含这些 evidence 路径；`write-tree` 前立即再次要求 detached HEAD=`TESTED_TIP_SHA`，然后用显式 tree/parent 构造候选对象：
   ```bash
   EVIDENCE_TREE=$(git -C "$EVIDENCE_DIR" write-tree)
   GATED_TIP_SHA=$(git -C "$EVIDENCE_DIR" commit-tree \
     "$EVIDENCE_TREE" -p "$TESTED_TIP_SHA" \
     -m "docs(sdd): record NNN merge gate")
   ```
   `commit-tree` 不移动任何 ref；随后验证候选提交恰有一个父提交且精确等于 `TESTED_TIP_SHA`，`GATED_TIP_SHA^{tree}` 精确等于 `EVIDENCE_TREE`，`TESTED_TIP_SHA..GATED_TIP_SHA` 只改允许的 evidence 路径。它不会隐式运行 porcelain commit hooks：项目要求的 hook/检查必须先在临时树显式执行并通过；不得为“补跑 hook”退回到会移动 ref 的普通 commit。
6. **原子发布 feature ref，再安全同步 Feature Worktree。** 设置 `FEATURE_REF=refs/heads/sdd/<NNN-slug>`、`GATE_REF=refs/sdd/gates/<NNN-slug>`；先读取 gate ref 旧值为 `OLD_GATE_SHA`（不存在时显式设为空），确认非空旧值确属该 feature 的历史 gate。发布前要求 feature ref 仍等于 `TESTED_TIP_SHA`，且 Feature Worktree 的 index tree 等于 `TESTED_TIP_SHA^{tree}`、工作文件等于 index、无 untracked 文件；另外以 `git ls-files --others --ignored --exclude-standard` 检查，没有 ignored 文件与 tested→gated 的目标路径碰撞。随后执行：
   ```bash
   git update-ref -m "sdd gate evidence <NNN-slug>" \
     "$FEATURE_REF" "$GATED_TIP_SHA" "$TESTED_TIP_SHA"
   ```
   CAS 失败记为 `GATE_CAS_REJECTED`：候选提交未发布，当前流程停止并按新 feature tip 重来；禁止普通 commit、强推或回滚 ref。

   CAS 成功后 feature ref 已发布，**不得回滚**。以发布前捕获的实际 `OLD_GATE_SHA` 作 expected-old 原子写入机器回执：
   ```bash
   git update-ref --create-reflog -m "sdd gate <NNN-slug>" \
     "$GATE_REF" "$GATED_TIP_SHA" "$OLD_GATE_SHA"
   ```
   无论回执写入是否成功，都要尝试用两树更新附着的 Feature Worktree：
   ```bash
   git -C "$FEATURE_ROOT" read-tree -m -u \
     "$TESTED_TIP_SHA" "$GATED_TIP_SHA"
   ```
   成功标准是 Feature Worktree 的 `HEAD=GATED_TIP_SHA`、index tree=`GATED_TIP_SHA^{tree}`、`git status --porcelain` 为空。回执 CAS 失败记为 `GATE_PUBLISHED_RECEIPT_FAILED`；工作树同步失败记为 `GATE_PUBLISHED_UNSYNCED`；两者都禁止继续 merge，但不能撤销已发布的 feature ref。`COMPLETION.md` 的人类证据 + `GATE_REF` 的精确 SHA 共同构成 gate 回执，后续 PR 收尾不能只猜当前分支 tip。

**`--no-merge`** 到此报告 `BASE_SHA / TESTED_TIP_SHA / GATED_TIP_SHA` 和各 gate 结果，保留 Feature Worktree、分支及 `GATE_REF`，然后只走统一 `finally`，不 finalize、不归档、不清理 feature。

#### 4. 从固定双亲构造 merge commit，再以 expected-old 原子发布

采用本地合并时，仍持有 finish lock，并在构造前再次确认：base ref=`BASE_SHA`、feature ref=`GATED_TIP_SHA`、gate ref=`GATED_TIP_SHA`，主/Feature 两个 worktree 都干净。主 worktree 的 index 必须等于 `BASE_SHA` 且工作文件等于 index，并确认没有 ignored 文件与 `BASE_SHA..GATED_TIP_SHA` 的 affected 路径碰撞；任一不符即停止。

1. 用 `mktemp -d` 创建唯一 `MERGE_ROOT`，令 `MERGE_DIR="$MERGE_ROOT/worktree"`，从固定 base 创建 detached worktree：
   ```bash
   git worktree add --detach "$MERGE_DIR" "$BASE_SHA"
   git -C "$MERGE_DIR" merge --no-ff --no-edit --no-gpg-sign \
     -m "merge(sdd): <NNN-slug>" "$GATED_TIP_SHA"
   ```
   **所有 merge 都必须带 `--no-edit`，且只传不可移动的 SHA。** 有冲突或 hook 失败就记录冲突/错误并停止；不得在临时树自动解冲突，也不得在主 worktree 留半合并状态。
2. 记录 `MERGE_COMMIT=$(git -C "$MERGE_DIR" rev-parse HEAD)`；用 `git rev-list --parents -n 1 "$MERGE_COMMIT"` 验证它恰有两个父提交，第一父提交精确为 `BASE_SHA`、第二父提交精确为 `GATED_TIP_SHA`。不满足就拒绝发布。
3. 发布前最后复核主 worktree 仍保持 `BASE_SHA` 的干净 index/worktree，并以候选 `MERGE_COMMIT` 的实际 tree 再确认 ignored 文件不与 base→merge 目标路径碰撞，然后执行唯一的 base ref 发布动作：
   ```bash
   git update-ref -m "sdd merge <NNN-slug>" \
     "$BASE_REF" "$MERGE_COMMIT" "$BASE_SHA"
   ```
   expected-old CAS 非零说明 base 被外部推进：候选 merge commit **没有发布**，停止并从新 base 重新 sync/gate；禁止把 `<base>` 强推回 `BASE_SHA`。
4. CAS 成功后，主 worktree 的 ref 已发布但 index/worktree 仍是旧树。立即用两树安全更新并验证：
   ```bash
   git read-tree -m -u "$BASE_SHA" "$MERGE_COMMIT"
   ```
   然后要求 `HEAD=$MERGE_COMMIT`、`git write-tree` 等于 `MERGE_COMMIT^{tree}`、`git status --porcelain` 为空。若工作文件在 CAS 后被外部改动而导致更新失败，标记 `MERGED_UNSYNCED`，**不得回滚已发布 ref、不得 reset --hard、不得 finalize/清理**；报告 `BASE_SHA`、`MERGE_COMMIT` 与冲突文件，待用户保护/处理本地改动并安全同步主 worktree 后，通过 `finalize-pr <feature> <MERGE_COMMIT>` 恢复。

#### 5. PR 路径（替代第 4 步）

团队采用 PR 时，只能把 `GATED_TIP_SHA` 推到目标远端分支并创建该精确 head 的 PR；提交后用远端 ref/PR API 复核 head SHA 仍等于 `GATED_TIP_SHA`。随后停止本地合并、finalize、归档与 feature 清理，保留 `sdd/<slug>` 和 `GATE_REF`，走统一 `finally` 释放临时资源/finish lock。

PR 真正合并后，先让本地 base 以非交互 fast-forward 同步到包含平台返回的 merge SHA（如需 `git merge --ff-only --no-edit <remote>/<base>`；不能 fast-forward 就停止），再运行：

```text
/sdd:worktree finalize-pr <NNN-slug> <merge-sha>
```

Squash merge 或 rebase merge 通常不会保留 `GATED_TIP_SHA` 的祖先关系，自动 finalize 会按下节 fail closed；必须人工对账后另行决定，不能伪造“已合并”证据。

#### 6. finalize + 可选归档

本地第 4 步成功后，在**同一把锁内**直接进入本节，令 `MERGE_SHA=MERGE_COMMIT`；若本节失败，保留 Feature Worktree、feature 分支和 `GATE_REF`，报告恢复命令 `finalize-pr <feature> <MERGE_SHA>`。

finalize 候选 tree 需要在刚合入 base 的 `specs/NNN-slug/COMPLETION.md` 写入 `Merged ✅`、`TESTED_TIP_SHA`、`GATED_TIP_SHA`、`MERGE_SHA` 与日期，并对账 BACKLOG。finalize 与提交必做，归档位置由用户选择：

- 暂不归档：保留 `specs/NNN-slug/`，让 `/sdd:status` 显示“已完成未归档”，不得当成待迁移。
- 普通功能（无 Delta-of）：移到 `specs/archive/NNN-slug/`（含 COMPLETION.md）。
- delta（有 `Delta-of: MMM-target`）：源已归档则移到 `specs/archive/MMM-target/deltas/NNN-delta-slug/`；源仍活跃则移到 `specs/MMM-target/deltas/NNN-delta-slug/`；源找不到则退回 `specs/archive/NNN-delta-slug/` 并告警核对 Delta-of。归档后在源 `COMPLETION.md / Change Log / Deltas` 追加日期与摘要。

若 base 已有一份**已提交**且三个 SHA 完全匹配的 finalize 记录，重做祖先校验后视为幂等重入，不重复生成提交；若已有记录但任一 SHA 不同，按状态冲突停止，禁止覆盖。否则，finalize 也必须走 detached 候选提交 + CAS，禁止“比较 ref 后在主 worktree 普通 commit”：

1. 记录 `FINALIZE_BASE_SHA=$(git rev-parse "$BASE_REF^{commit}")`，确认主 worktree 的 index tree 精确等于 `FINALIZE_BASE_SHA^{tree}`、工作文件等于 index、无 untracked 文件。用 `mktemp -d` 创建唯一 `FINALIZE_ROOT`，令 `FINALIZE_DIR="$FINALIZE_ROOT/worktree"`，执行 `git worktree add --detach "$FINALIZE_DIR" "$FINALIZE_BASE_SHA"` 并复核 HEAD。
2. **只在 `FINALIZE_DIR`** 写入 Merged 状态、执行可选归档及 BACKLOG 对账；只暂存明确的 finalize/归档/台账路径，禁止 `git add -A`。要求 `git -C "$FINALIZE_DIR" diff --cached --check` 通过、暂存 diff 非空，且 porcelain 状态只含这些已暂存路径、没有未暂存或 untracked 变化；`write-tree` 前立即再次要求 detached HEAD=`FINALIZE_BASE_SHA`，然后用显式 tree/parent 构造候选对象：
   ```bash
   FINALIZE_TREE=$(git -C "$FINALIZE_DIR" write-tree)
   FINALIZE_SHA=$(git -C "$FINALIZE_DIR" commit-tree \
     "$FINALIZE_TREE" -p "$FINALIZE_BASE_SHA" \
     -m "docs(sdd): finalize NNN-slug")
   ```
   `commit-tree` 不移动任何 ref；随后验证 `FINALIZE_SHA` 恰有一个父提交且精确等于 `FINALIZE_BASE_SHA`，`FINALIZE_SHA^{tree}` 精确等于 `FINALIZE_TREE`，候选 diff 只含允许路径。项目要求的 hook/检查必须先在临时树显式执行并通过；不得退回普通 commit。
3. 发布前再次要求 base ref=`FINALIZE_BASE_SHA`，且主 worktree 仍保持该提交的干净 index/worktree，并确认没有 ignored 文件与 finalize-base→finalize 的目标路径碰撞，然后原子发布：
   ```bash
   git update-ref -m "sdd finalize <NNN-slug>" \
     "$BASE_REF" "$FINALIZE_SHA" "$FINALIZE_BASE_SHA"
   ```
   CAS 失败记为 `FINALIZE_CAS_REJECTED`：候选 finalize 未发布，主 worktree 未被修改；停止清理，待同步当前 base 后重新运行 `finalize-pr`。禁止普通 commit、强推或把 base 回滚到旧 SHA。
4. CAS 成功后 base ref 已发布，**不得回滚**；立即安全同步主 worktree：
   ```bash
   git read-tree -m -u "$FINALIZE_BASE_SHA" "$FINALIZE_SHA"
   ```
   成功标准是 `HEAD=FINALIZE_SHA`、index tree=`FINALIZE_SHA^{tree}`、`git status --porcelain` 为空。同步失败记为 `FINALIZED_UNSYNCED`：不得清理 feature/gate ref，不得 `reset --hard`；报告两个 SHA 与冲突文件，按下方恢复协议同步后再用 `finalize-pr <feature> <MERGE_SHA>` 幂等完成清理。

#### 6.1 CAS 已发布、worktree 未同步的恢复协议

`GATE_PUBLISHED_UNSYNCED`、`MERGED_UNSYNCED`、`FINALIZED_UNSYNCED` 都表示 **ref 已经成功发布，只有附着 worktree 仍停在旧 tree**；恢复时绝不能回滚 ref。重新获取 finish lock 后，先用报告中的 `OLD_SHA/NEW_SHA` 验证 ref 正指向 `NEW_SHA`，并重新验证候选提交的固定 parent/tree。只有同时满足以下四项，才可自动重试 `git -C <attached-root> read-tree -m -u "$OLD_SHA" "$NEW_SHA"`：

- attached worktree 的 index tree 精确等于 `OLD_SHA^{tree}`；
- `git -C <attached-root> diff-files --quiet`，即工作文件仍等于旧 index；
- `git -C <attached-root> ls-files --others --exclude-standard` 无输出。
- `git -C <attached-root> ls-files --others --ignored --exclude-standard` 的结果与 `OLD_SHA..NEW_SHA` 目标路径不存在同名、祖先或后代重叠，避免 ignored 文件被 checkout 语义覆盖。

同步后必须验证 HEAD、index tree、`git status --porcelain` 都精确匹配 `NEW_SHA`。若 index 已部分变化、存在本地修改/untracked，或 ref 已再次移动，停止自动恢复并报告三方状态；先保护用户文件再人工 reconcile，禁止 `reset --hard`、强推或猜测哪个 tree 应覆盖。

- `GATE_PUBLISHED_UNSYNCED`：要求 `FEATURE_REF=GATED_TIP_SHA`、其唯一父提交为 `TESTED_TIP_SHA` 且只含 evidence diff；按上述条件把 Feature Worktree 从 tested tree 同步到 gated tree。
- `GATE_PUBLISHED_RECEIPT_FAILED`：在 gated commit 与 feature ref 均验证通过后，读取 gate ref 当前值；仅以这个实际旧值作 expected-old，把它 CAS 到 `GATED_TIP_SHA`。若 gate ref 指向无法验证的其他提交，停止，不得覆盖。Feature Worktree 同步与 gate receipt 两项都成功后，方可从 merge 阶段继续，无需重跑同一固定 tip 的 gate。
- `MERGED_UNSYNCED`：要求 base ref=`MERGE_COMMIT` 且 merge 双亲仍精确为 `BASE_SHA / GATED_TIP_SHA`；把主 worktree 从 base tree 同步到 merge tree，再运行 `finalize-pr <feature> <MERGE_COMMIT>`。
- `FINALIZED_UNSYNCED`：要求 base ref=`FINALIZE_SHA`、其唯一父提交为 `FINALIZE_BASE_SHA`，且 finalize 记录中的三个 SHA 与候选 diff 都匹配；把主 worktree 从 finalize-base tree 同步到 finalize tree，再运行 `finalize-pr <feature> <MERGE_SHA>` 幂等完成清理。

`GATE_CAS_REJECTED` 与 `FINALIZE_CAS_REJECTED` 不属于上述恢复态：对应 ref 没有发布，`finally` 只清理承载候选提交的临时 worktree；候选对象不得复用，必须基于当前 ref 重新计算。

#### 7. 最后清理与报告

仅在 merge 祖先校验与 finalize 均成功后：`git worktree remove <feature-root>` → `git branch -d sdd/<slug>` → `git worktree prune`；禁止 `--force`/`-D`。上述三步成功后，再用 expected-old 删除 gate 回执：`git update-ref -d "$GATE_REF" "$GATED_TIP_SHA"`。gate ref 删除失败要报告残留 ref，不能无条件删除。最后仍要走统一 `finally` 释放 finish lock。

报告 `BASE_SHA / TESTED_TIP_SHA / GATED_TIP_SHA / MERGE_SHA / FINALIZE_SHA`、每道 gate 的命令/cwd/exit、原子发布结果、归档落点、BACKLOG 变化、已删除或保留的 ref/worktree。任何未完成步骤都列出明确恢复入口。

### `finalize-pr <feature-slug> <merge-sha>`

这是 **PR 合并后收尾**，也是“本地 merge 已原子发布但 finalize/清理失败”的幂等恢复入口；它**不重跑 gate、不重新 merge、不改写 merge SHA**。

1. 通常必须在同步且干净的 base 主 worktree 运行，按 `finish` 第 0、1 节建立统一 `finally` 并获取同一 `refs/sdd/finish-lock`。若恢复已报告的 `MERGED_UNSYNCED/FINALIZED_UNSYNCED`，只允许第 1 节声明的严格例外，并须持锁后先完成 §6.1。解析参数为唯一 commit：`MERGE_SHA=$(git rev-parse "<merge-sha>^{commit}")`；缩写歧义、对象不存在或不是 commit 都拒绝。
2. 优先从 `GATE_REF=refs/sdd/gates/<NNN-slug>` 读取 `GATED_TIP_SHA`，并核对该提交中的 `COMPLETION.md / Quality Evidence`、其唯一父提交（即记录的 `TESTED_TIP_SHA`）和仅证据 diff。feature 分支若仍存在，必须精确指向 `GATED_TIP_SHA`；若分支已移动，不能猜测，停下人工恢复 gate 回执。仅有一个例外：若 gate ref 已在成功清理时删除，但 base 上 active/archive/delta 位置的**已提交 finalize 记录**已精确写明同一个 `MERGE_SHA / GATED_TIP_SHA / TESTED_TIP_SHA`，可从该不可变记录恢复 gated tip，重做本节祖先校验并幂等报告/补完残余清理；未 finalize 时 gate ref/证据缺失仍必须 fail closed。
3. 两个祖先校验都必须成功：
   ```bash
   git merge-base --is-ancestor "$MERGE_SHA" "$BASE_REF"
   git merge-base --is-ancestor "$GATED_TIP_SHA" "$MERGE_SHA"
   ```
   第一条证明给定 merge 已进入当前 base（base 可以在其后继续前进）；第二条证明被 gate 的精确 tip 真被该 merge 包含。任一失败都不得 finalize。该规则会有意拒绝 squash/rebase merge，需人工 reconcile，不能只因代码看似相同就自动标绿。
4. 确认主 worktree 的 HEAD/index/worktree 同步且干净，然后执行 `finish` 第 6 节的 detached 候选提交 + base ref CAS；若已存在完全匹配的已提交 finalize 记录则幂等跳过构造。成功同步后执行第 7 节清理。新协议不会在主 worktree 留下“未提交 finalize 变更”；若发现这类 dirty 状态，按用户/旧版本遗留改动处理并 fail closed，不得静默提交或覆盖。
5. 任一失败都保留 feature 与 gate 回执，只清理本次临时资源并以 expected-old 释放本次锁。成功/失败报告中都必须包含 `MERGE_SHA`、`GATED_TIP_SHA`、候选/已发布 `FINALIZE_SHA`、祖先校验结果与恢复状态。

### `abort <feature-slug>`
不合并直接丢弃是销毁性操作，必须先确认，并且不能与 finish/finalize-pr 并发：若 `refs/sdd/finish-lock` 已存在就拒绝；确认后先按 finish 的 expected-old 协议获取同一把锁，并在 `finally` CAS 释放。随后从目标之外的 worktree 执行 `git worktree remove --force <已核对的-feature-root>` → `git branch -D sdd/<slug>`；若 `refs/sdd/gates/<slug>` 存在，再以它的当前 OID 作 expected-old 删除，最后 `git worktree prune`。任一步失败都报告残留对象，不得无条件删 ref。**只有这个已确认的 abort 可对 Feature Worktree/分支使用 `--force`/`-D`。**

## 跨 feature 交叉协调 / Coordinating overlapping features
两个 feature 有交叉时，按交叉性质选：
- **① 共享底座（最佳）**：能预见的共享部分（公共 model/类型/契约/工具），**抽成一个独立 foundation feature 先建先合并到 main**，再让交叉的 feature 从更新后的 main `start`——交叉消失在源头。
  > `/sdd:worktree start 000-shared-<thing>` → 实现并 `finish` 合并到 main → 再 `start` 各 feature。
- **② B 临时要用 A 的在建成果**（A 已 commit）：在 B 的 worktree 里 `/sdd:sync from <A-slug>`。
- **③ A 已并入 main，本 feature 跟进**：`/sdd:sync`（默认拉 main）。
- **④ 抢同一热点文件**（路由表/`app.json`/store 入口）：指定单一 owner 改它，或设计成追加式（各 feature 注册自己的模块），合并时局部解冲突。

共享原则：**跨终端只能共享已提交内容**（未提交的工作互相不可见）；共享的**契约以规格层（design.md/契约文件）为权威**，别让两 feature 照着对方在建代码各自漂移。

## 纪律
- ✅ 每个 feature（不只并发 feature）各自一个 worktree + 分支；规格、代码、任务状态、验证证据同根同提交。
- ✅ 主 worktree 只做 `/sdd:status` 等全局只读查看，以及持有原子 `refs/sdd/finish-lock` 的串行 `finish/finalize-pr`；不得在主干上推进 specify/plan/tasks/implement/verify。
- ✅ `finish`/`abort` 是破坏性操作，执行前确认；合并冲突一律停下交还用户。
- ✅ 与 `/sdd:implement` 配合：实现期的并行子代理在**同一个 feature worktree 内**按 Boundary 不重叠并行；跨 feature 的并行才用多 worktree。
- ❌ 不在 feature worktree 里运行 `finish`（会试图删除脚下目录）。
