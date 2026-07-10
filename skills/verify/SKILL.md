---
description: 行为验证 / Verify the implemented feature against every AC using actual commands, durable evidence, persistent regression coverage for critical behavior, and a completion report. 区别于 /sdd:analyze（静态文档一致性）。
argument-hint: "[可选：当前功能目录名，如 001-user-auth；省略则取当前 sdd 分支]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /sdd:verify — 功能级行为验证

你的任务：把一个**已实现完**的功能，拿真实运行结果对照它的验收标准（AC），逐条判定通过/失败，产出一张**问题清单（punch list）**。这是 GSD 式的独立 Verify 阶段——防止"代码写完了但其实没满足需求"的偏移在上线后才暴露。

> 与 `/sdd:analyze` 的分工：`analyze` 查**静态**的文档↔代码一致性（谁没对上）；`verify` 查**动态**的行为是否真的满足 AC（跑起来对不对）。

## 用户输入
$ARGUMENTS

## 单一工作根前置闸
`/sdd:verify` 必须在目标 `sdd/NNN-slug` Feature Worktree 内运行，因为它既要执行该分支的代码，又要回填同一分支的 `tasks.md` 和 `COMPLETION.md`：

1. 读取当前分支与 `git worktree list --porcelain`。当前分支必须为 `sdd/NNN-slug`，当前目录必须是该分支登记的 worktree；`FEATURE_ROOT = 当前仓库根`，`FEATURE_DIR = FEATURE_ROOT/specs/NNN-slug`。
2. 若从主 worktree 发起，**拒绝验证**：找到目标 feature 的 worktree 绝对路径，提示用户在那里重新运行 `/sdd:verify`。主干代码不是待验实现，主干规格也不是待写证据的位置。
3. 若参数显式给了 feature，它必须与当前分支的 `NNN-slug` 一致；不一致则拒绝，避免把 A 的运行结果写进 B 的报告。
4. 若规格只存在于主 worktree、当前 Feature Worktree 中不存在，判为旧版 split-brain，按 `/sdd:worktree` 迁移协议处理；迁移完成前不验证、不生成跨分支报告。

## 执行步骤

1. **读 spec**：full 读取 `FEATURE_DIR/requirements.md`（全部 AC）、`design.md`、`tasks.md`；lite 只读 `FEATURE_DIR/spec.md`。两种模式都读 `FEATURE_ROOT/specs/constitution.md`，并定义 `TASK_STATE_FILE = full ? FEATURE_DIR/tasks.md : FEATURE_DIR/spec.md`。同时运行的代码也必须来自 `FEATURE_ROOT`；lite 不得要求不存在的 requirements/design/tasks。

2. **建立验收矩阵**：把每条 AC 列出来，准备逐条验证。

2.5 **任务状态兜底对账（修 Bug：状态没更新）**：逐条核对 `TASK_STATE_FILE` 的勾选 vs 任务**实际是否完成**（看代码/测试是否真在）——
   - 实际代码存在但还是 `[ ]`/`[~]` → 先核对该任务的门禁 evidence、适用的 `code-reviewer PASS` 与所在 Wave 抽样记录；**证据齐全才可**改成 `[x]` 并更新 `Progress`。缺证据不能靠“看起来做完了”绕过实现门，保留 `[~]` 并列入问题清单。
   - 标了 `[x]` 但实现、门禁证据、required review 或持久测试缺失/失败 → 改回 `[~]`（明确失败则 `[!]`）并在报告里标红。
   - 这一步只修复跟踪状态，不重新定义完成标准；`/sdd:verify` 不能替 `/sdd:implement` 补签独立评审。

3. **按 AC 的 `Verify:` 标签路由验证**（服务端/前端/嵌入式验法不同）：
   - **`auto`** → full 按 design §8、lite 按 spec.md 的 `How/Quality/Test policy` 映射，优先运行现有自动化用例与项目真实测试命令，记录**完整命令、退出码、关键输出摘要、测试名/文件和日志路径**。历史 Bug、公共契约、鉴权安全、状态机/领域不变量、迁移、并发事务、共享核心能力若没有持久回归测试，判为 🔴 测试缺口并退回 `/sdd:implement`；不得用临时测试冒充长期保护。
   - **`sim`** → 在仿真环境跑（如 QEMU/Renode）；跑不了则降级为 manual-HW 并说明。
   - **`manual-HW`** → **不自动判过/判失败**：列入下方"人工证据清单"，要求人附**实测证据**（测量值/示波器截图/台架照片/签字）方可视为通过。缺证据 = 🟡 待背书，不算绿、也不冤判红。
   - 未标 `Verify:` 的 AC → 提示补标，按 auto 尝试。
   - 只有探索、一次性诊断、硬件/外部环境探针或不值得长期维护的展示性检查才可新建 ephemeral 验证；必须显式标记、记录命令证据，验完只删除这些明确的临时文件，绝不删除已有或本次新增的持久回归测试。
   - 对每条收集**证据**：命令 + exit code + 输出摘要/日志路径 + 测试名/文件:行或实测值。写入 COMPLETION 前必须脱敏；token、密码、连接串、个人数据只记录“已脱敏/已验证”，不得复制原值。无法运行的 AC 不得凭代码阅读判绿。

4. **输出 punch list**（直接在对话给）：
```
# Verify 报告：NNN-slug
**结论:** 🟢 全部通过 / 🟡 有缺口/待背书 / 🔴 关键 AC 未达成

## 验收矩阵
| AC | 方法 | 结果 | 证据/实测值 |
|----|------|------|------------|
| AC1 | auto | ✅ PASS | test_register_ok · tests/auth.test.ts:12 |
| AC2 | auto | ❌ FAIL | 返回 500，预期 401 |
| AC3 | manual-HW (≤50ms) | ⏳ 待人工背书 | 见下方清单 |

## 人工证据清单（manual-HW 项，需人填证据后才算过）
- [ ] AC3 LED 点亮时延 ≤50ms — 用逻辑分析仪测量 → 实测值: ____ ms · 证据: ____（截图/签字）

## 问题清单（按严重度）
### 🔴 必修
1. AC2: 错误凭据返回 500 而非 401 — 证据 — 建议回到哪个任务/设计修
### 🟡 应修 / 待背书
- AC3 待人工硬件实测背书
```

5. **写功能完成度报告（解决"缺一份完成度文档"）**：把上面的结果落盘到当前分支的 `FEATURE_DIR/COMPLETION.md`（即 `FEATURE_ROOT/specs/NNN-slug/COMPLETION.md`；已存在则更新），让运行代码、AC、任务进度和证据绑定在同一个 Feature commit 中：
```markdown
# Completion Report / 功能完成度报告: <功能名称>
- **Feature ID:** NNN-slug · **Status:** Verified ✅ / 有缺口 🟡 / 未达成 🔴 · **Date:** [日期]

## 完成度概览
- **Tasks:** X / N 完成 · 阻塞: [T?...]
- **AC:** a / b 通过 · 待人工背书(manual-HW): [AC?...] · 未达成: [AC?...]
- **Success Criteria:** [逐条 达成/未达成 + 实测值]
- **质量门禁:** format/lint/typecheck/test 的实际命令、退出码与日志摘要（或标未过项）
- **独立评审:** required review 与 Wave 抽样的 reviewer verdict / 基线 / 修复轮次 / residual risk

## Quality Evidence / 质量证据
| Scope | Gate / AC | Command or method | Exit | Summary / Log |
|-------|-----------|-------------------|------|---------------|
| T1 | test | `…` | 0 | `…` |

## 验收矩阵
| AC | 方法 | 结果 | 证据/实测值 |
|----|------|------|------------|
| AC1 | auto | ✅ PASS | … |

## 实现偏移 / Deviations（取自 design §11）
- [偏移] 原 X → 实际 Y · 原因 · 影响的 AC

## 遗留 / Outstanding
- 🔴 必修: … · 🟡 待背书/应修: … · 缺测试: …
- 📌 待补齐(本功能新产生的延后): 已记入 specs/backlog/BL-<featureNNN>-<seq>.md · 目标:<何时补>

## 下一步
- 全绿 → /sdd:worktree finish 收尾；有缺口 → /sdd:implement T? 修
```

5b. **对账待补齐 items（防延后项漏掉）**：扫描当前 Feature Worktree 的 `FEATURE_ROOT/specs/backlog/BL-*.md`（并只读兼容旧 BACKLOG.md），所有修改随 feature 分支一起合并，**不直接写主 worktree**——
   - 本功能**补齐了**的 item → 只编辑该文件为 `Status: done`、`Completed-by: NNN-slug · <日期>`。
   - 本功能**新产生**的延后 → 按 implement 的永久 backlog-id CAS 新建一个 item，并在 COMPLETION 引用文件/ID；不得追加共享索引。
   - **不要把"延后"和"必修缺口"混为一谈**：🔴 必修是本功能上线前要补的；📌 延后是有意推到未来的，进台账。

6. **完成后**：
   - 报告 punch list + **已写/更新 `COMPLETION.md` 路径** + 本次 BACKLOG 的勾掉/新增项。
   - 给修复建议——回到哪个阶段（多为 `/sdd:implement T?`，或缺测试新开任务）。
   - **若行为是"有意"偏离 AC（业务调整非 bug）**：不是修代码，而是**规格该对账**——提示把变更回填进 requirements/design（reconcile）。
   - **全部通过 → 提示收尾**：先把 Feature Worktree 中的规格、代码、`TASK_STATE_FILE`、`COMPLETION.md` 与台账修改提交到 `sdd/NNN-slug`，确认工作树干净；再切回主终端串行运行 `/sdd:worktree finish <feature>`（对账+合并+自动删 worktree，会 finalize COMPLETION.md）。

## 纪律
- ❌ 本命令**不改业务代码、不修 bug**——但**会**写 `COMPLETION.md` 报告、兜底修正 `TASK_STATE_FILE` 勾选（这俩是跟踪文档，不是功能代码）。
- ✅ 结论必须基于**实际运行证据**，不能凭读代码臆断"应该没问题"。
- ✅ 区分"真没达成 AC"和"风格/锦上添花"，🔴 只放真正的验收失败。
- ✅ 验证命令、被验代码、验收标准和 `COMPLETION.md` 必须来自同一个 Feature Worktree/分支；不得用主干运行结果替代。
- ✅ **测试资产体检**：只清理被明确标成 ephemeral 的探索/诊断文件；历史 Bug、公共契约、鉴权安全、状态机/领域不变量、迁移、并发事务和共享核心的回归测试必须保留。误删高价值测试或用临时探针替代持久覆盖，列为 🔴 必修。
