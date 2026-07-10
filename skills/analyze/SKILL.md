---
description: 自检 / Cross-check consistency across requirements ↔ design ↔ tasks ↔ code and report gaps. 只读分析，随时可用，找出脱节、遗漏、矛盾、规格外代码。
argument-hint: "[可选：功能目录名，如 001-user-auth；省略则取最新]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(ls *), Bash(cat *), Bash(git *)
---

# /sdd:analyze — 一致性自检

你的任务：把某个功能的规格与实际代码做交叉核对，**只读**，产出一份发现清单。full 模式核对 `requirements.md` ↔ `design.md` ↔ `tasks.md` ↔ 代码/测试/Implementation Evidence；lite 模式核对单一 `spec.md` 中 `What & Done` ↔ `How` ↔ `Tasks` ↔ 代码/测试/Implementation Evidence。任何阶段卡住或上线前都可跑。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **读模式对应的事实源**：先识别 mode；full 读取目标功能的 `requirements.md`、`design.md`、`tasks.md`，lite 只读取 `spec.md`，两者都读取 `specs/constitution.md`，并用 Glob/Grep 检视设计/How/任务中提到的实际代码文件。不得因 lite 缺少三个 full 文件而报缺件，也不得凭空创建它们。定位方式同 /sdd:clarify。

2. **逐层比对**，至少检查以下脱节类型：

   | 检查项 | 问题信号 |
   |--------|---------|
   | Req → Design | 有需求/AC 在可追溯表里找不到对应设计 |
   | Design → Tasks | 有设计元素没有任务去实现 |
   | Tasks → Code | 任务标 `[x]` 但代码里找不到对应实现/文件 |
   | Code → Spec | 代码实现了规格里没有的功能（范围蔓延） |
   | AC → Test/Evidence | 按 AC 的 `Verify` 标签：`auto`/`sim` 缺对应测试；`manual-HW` 缺实测证据/记录 |
   | Constitution | 实现违反宪法（用了禁止的依赖、漏了必需测试、违背架构原则） |
   | Quality Gate | 跑 §3 的 Format(check)/Lint/Typecheck 有未过项（风格/类型不一致） |
   | Maintainability | 违反 §3 可维护性规则：重复代码、死代码、函数过长/复杂度超限、命名不一致、分层/依赖方向违规 |
   | Contradiction | 设计与需求矛盾，或任务之间矛盾 |
   | Staleness | 文档相互不同步（如改了 design 没回填 tasks） |

3. **输出报告**（直接在对话里给，不写文件，除非用户要求）：

```
# SDD 一致性报告：NNN-slug

## 摘要
- 已完成任务：X / N
- 发现问题：🔴 严重 a 个 · 🟡 中等 b 个 · 🔵 提示 c 个

## 问题清单
### 🔴 严重（会导致功能不正确或漏实现）
1. [类型] 描述 — 证据(文件:行 / 文档章节) — 建议动作
### 🟡 中等（脱节/范围蔓延/缺测试）
…
### 🔵 提示（文档同步、小改进）
…

## 覆盖矩阵
| AC | Design | Task | Code | Test | 状态 |
|----|--------|------|------|------|------|
| AC1 | §3 | T2 | auth.js:40 | ✅ | OK |
| AC2 | §4 | T5 | — | — | 🔴 未实现 |
```

4. **完成后**：按严重度给出**建议的修复顺序**，并指出该回到哪个阶段（`/sdd:clarify` / `/sdd:plan` / `/sdd:tasks` / `/sdd:implement`）。

## 纪律
- ❌ 本命令**不改任何文件、不写代码**——只诊断。
- ✅ 每条发现都要给证据（文件路径/行号 或 文档章节），不空泛断言。
- ✅ 区分"真问题"和"风格偏好"，别把噪音塞进严重档。
