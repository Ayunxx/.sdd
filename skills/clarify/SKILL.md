---
description: 消歧 / Interrogate a requirements.md for ambiguities, ask the user targeted questions, then fold answers back in. 在进入设计前把模糊点逼出来，大幅减少返工。
argument-hint: "[可选：功能目录名，如 001-user-auth；省略则取最新]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(ls *), Bash(cat *)
---

# /sdd:clarify — 需求消歧

你的任务：审讯 `requirements.md`，把一切会导致后续返工的模糊点找出来，向用户提**精准的、有选项的问题**，再把答案写回需求文档。这是设计前最便宜的纠错环节。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **定位目标**：
   - 若提供了功能目录名，用之；否则列出 `specs/NNN-*` 取编号最大的（最新）。
   - 读取该目录的 `requirements.md`。读不到则报错并提示先 `/sdd:specify`。

2. **扫描歧义**，覆盖至少这些维度：
   - 所有 `[NEEDS CLARIFICATION]` 标记
   - **范围边界**：哪些情况算 in / out？
   - **角色与权限**：谁能做什么？
   - **数据**：字段、校验规则、唯一性、必填性、长度/格式限制
   - **状态与生命周期**：实体有哪些状态、如何流转
   - **错误处理**：失败时给用户/调用方什么反馈
   - **非功能**：性能目标、并发量级、安全/合规
   - **依赖与集成**：第三方、外部系统的契约
   - **验收标准的可测试性**：每条 AC 都能写成测试吗？

3. **向用户提问**：挑出**最关键的 ≤5 个**问题。每个问题尽量给出 2–4 个具体候选项 + "其他"，让用户快速选择而非自由作答。一次性提出，不要挤牙膏。
   > 实现方式：用 AskUserQuestion 工具批量提问（每个问题给候选项）。

4. **写回**：把用户的回答更新到 `requirements.md`：
   - 解决一个 `[NEEDS CLARIFICATION]` 就删除该标记并补全对应内容。
   - 新增的约束/规则补进对应章节（验收标准、边界、约束等）。
   - 在文档维护一个 `## Clarifications / 澄清记录` 章节，按轮次追加：`- [Round N] Q: … → A: …`。

5. **完成后**：
   - 总结本轮澄清了哪些点，还剩几个 `[NEEDS CLARIFICATION]`。
   - 若仍有重大未决项，建议再跑一轮 `/sdd:clarify`；否则提示 `/sdd:plan`。

## 纪律
- ❌ 不做技术设计、不写代码。
- ✅ 问题要逼出"决策"，不要问开放式大问题。宁可多给选项让用户点。
- ✅ 若用户某个回答引出了新的子问题，记下来但不要无限追问——一轮聚焦关键。
