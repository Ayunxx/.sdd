---
description: 行为验证 / Verify phase — run the implemented feature against its acceptance criteria, reconcile tasks.md checkboxes, and write a feature COMPLETION report. 上线前独立行为验收：跑测试、对照 AC、兜底修正 tasks 勾选、产出功能完成度报告 COMPLETION.md。区别于 /sdd:analyze（静态文档一致性）。
argument-hint: "[可选：功能目录名，如 001-user-auth；省略则取最新]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# /sdd:verify — 功能级行为验证

你的任务：把一个**已实现完**的功能，拿真实运行结果对照它的验收标准（AC），逐条判定通过/失败，产出一张**问题清单（punch list）**。这是 GSD 式的独立 Verify 阶段——防止"代码写完了但其实没满足需求"的偏移在上线后才暴露。

> 与 `/sdd:analyze` 的分工：`analyze` 查**静态**的文档↔代码一致性（谁没对上）；`verify` 查**动态**的行为是否真的满足 AC（跑起来对不对）。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **读 spec**：目标功能的 `requirements.md`（取全部 AC）、`design.md`、`tasks.md`、`specs/constitution.md`。定位方式同其他命令。

2. **建立验收矩阵**：把每条 AC 列出来，准备逐条验证。

2.5 **tasks 勾选兜底对账（修 Bug：状态没更新）**：逐条核对 `tasks.md` 的勾选 vs 任务**实际是否完成**（看代码/测试是否真在）——
   - 实际做完但还是 `[ ]`/`[~]` → **用 Edit 改成 `[x]`** 并更新 `Progress`；
   - 标了 `[x]` 但实际没做/没过 → 改回 `[ ]` 并在报告里标红；
   - 这一步是防"代码做了、tasks 状态漏更新"的安全网，确保完成度可信。

3. **按 AC 的 `Verify:` 标签路由验证**（服务端/前端/嵌入式验法不同）：
   - **`auto`** → 跑对应自动化测试/命令，记录通过/失败 + 阈值是否达标。
   - **`sim`** → 在仿真环境跑（如 QEMU/Renode）；跑不了则降级为 manual-HW 并说明。
   - **`manual-HW`** → **不自动判过/判失败**：列入下方"人工证据清单"，要求人附**实测证据**（测量值/示波器截图/台架照片/签字）方可视为通过。缺证据 = 🟡 待背书，不算绿、也不冤判红。
   - 未标 `Verify:` 的 AC → 提示补标，按 auto 尝试。
   - 对每条收集**证据**：测试名+结果 / 命令+输出 / 文件:行 / 实测值。

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

5. **写功能完成度报告（解决"缺一份完成度文档"）**：把上面的结果落盘到 `specs/NNN-slug/COMPLETION.md`（用 Write；已存在则更新），一处看清整个功能的完成度：
```markdown
# Completion Report / 功能完成度报告: <功能名称>
- **Feature ID:** NNN-slug · **Status:** Verified ✅ / 有缺口 🟡 / 未达成 🔴 · **Date:** [日期]

## 完成度概览
- **Tasks:** X / N 完成 · 阻塞: [T?...]
- **AC:** a / b 通过 · 待人工背书(manual-HW): [AC?...] · 未达成: [AC?...]
- **Success Criteria:** [逐条 达成/未达成 + 实测值]
- **质量门禁:** format ✅ / lint ✅ / typecheck ✅ / test ✅（或标未过项）

## 验收矩阵
| AC | 方法 | 结果 | 证据/实测值 |
|----|------|------|------------|
| AC1 | auto | ✅ PASS | … |

## 实现偏移 / Deviations（取自 design §11）
- [偏移] 原 X → 实际 Y · 原因 · 影响的 AC

## 遗留 / Outstanding
- 🔴 必修: … · 🟡 待背书/应修: … · 缺测试: …
- 📌 待补齐(本功能新产生的延后): 已记入 specs/BACKLOG.md → BL-??? · 目标:<何时补>

## 下一步
- 全绿 → /sdd:worktree finish 收尾；有缺口 → /sdd:implement T? 修
```

5b. **对账待补齐台账（防延后项漏掉）**：读 `specs/BACKLOG.md`（不存在则视为空；本功能产生延后时按 init 骨架新建）——
   - 本功能**补齐了**的延后项 → 标 `[x] 已补齐 · 由 NNN-slug 完成 · <日期>`，从 `## 待补齐`/`## 已排期` 移到 `## 已补齐`。
   - 本功能**新产生**的延后（验收时发现的缺口被决定延后，而非必修）→ 追加进 `## 待补齐`（同 implement 的格式），并在 COMPLETION 的 `## 遗留` 引用其 `BL-NNN`。
   - **不要把"延后"和"必修缺口"混为一谈**：🔴 必修是本功能上线前要补的；📌 延后是有意推到未来的，进台账。

6. **完成后**：
   - 报告 punch list + **已写/更新 `COMPLETION.md` 路径** + 本次 BACKLOG 的勾掉/新增项。
   - 给修复建议——回到哪个阶段（多为 `/sdd:implement T?`，或缺测试新开任务）。
   - **若行为是"有意"偏离 AC（业务调整非 bug）**：不是修代码，而是**规格该对账**——提示把变更回填进 requirements/design（reconcile）。
   - **全部通过 → 提示收尾**：切回主终端 `/sdd:worktree finish <feature>`（对账+合并+自动删 worktree，会 finalize COMPLETION.md）。

## 纪律
- ❌ 本命令**不改业务代码、不修 bug**——但**会**写 `COMPLETION.md` 报告、兜底修正 `tasks.md` 勾选（这俩是跟踪文档，不是功能代码）。
- ✅ 结论必须基于**实际运行证据**，不能凭读代码臆断"应该没问题"。
- ✅ 区分"真没达成 AC"和"风格/锦上添花"，🔴 只放真正的验收失败。
- ✅ **测试相称性体检（§4）**：覆盖够不够要看，**测过头也要标**——若本次改动量很小却新增了一堆测试类（尤其重容器集成测试）、或为已覆盖区域另起新类而非扩展已有 → 列入 🟡 应修"测试不相称：建议合并/降级/复用已有 harness"。覆盖不减，但别让过度测试臃肿化、拖慢合并门。
