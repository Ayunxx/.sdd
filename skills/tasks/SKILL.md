---
description: 拆解 / Break design.md into atomic, independently-verifiable tasks with file Boundaries and a parallel Wave plan (tasks.md). 第三阶段：拆任务 + 标注文件领地 + 算出可并发的波次，喂给 /sdd:implement 做隔离并行实现。
argument-hint: "[可选：功能目录名，如 001-user-auth；省略则取最新]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(ls *), Bash(cat *)
---

# /sdd:tasks — 任务拆解 + 并行波次规划

你的任务：把 `design.md` 拆成**有序、原子、可独立验证**的任务，并为每个任务标注 **Boundary（独占文件领地）** 和 **Depends（依赖）**，最后算出一份 **Waves 并行计划**——让 `/sdd:implement` 能把相互独立的任务派给隔离子代理**并发执行**。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **读上下文**：目标功能的 `design.md` + `requirements.md` + `specs/constitution.md`，以及宪法激活的 `specs/stacks/*.md` **能力包**（定位方式：给了目录名用之，否则取 `specs/` 下编号最大的）。无 `design.md` 则提示先 `/sdd:plan`。

2. **拆解原则**：
   - **原子**：一个任务一件事，理想情况一次做完并验证。
   - **可验证**：每个任务有明确 `Done when`。
   - **可追溯**：标 `Refs` 指向 design/requirements 的具体章节。
   - **守纪律**：遵守宪法测试纪律（TDD 则"写测试"任务先行）。

3. **【关键】标注 Boundary 与 Depends**（这是并发的基础）：
   - **Boundary** = 该任务**唯一允许写**的文件/目录。粒度尽量不重叠。
   - **优先套用能力包的「Boundary 拆分模式」**：激活的 `specs/stacks/*.md` 第 3 节给出了该领域天然可并行的切分维度（如服务端按端点、小程序按页面、数据库按迁移、全栈按垂直切片）和易冲突的共享文件——照它切分能显著提高可并发度。
   - **Depends** = 必须先完成的任务。
   - **同一 Wave 内的任务，Boundary 必须互不重叠**——否则并发会撞车。若两个任务天然要改同一文件，让它们落到不同 Wave（串行），或合并成一个任务。

4. **算 Waves**：按依赖做拓扑分层——
   - Wave 1 = 没有任何依赖的任务；
   - Wave N = 依赖全部落在前 N-1 波的任务；
   - 同波内再按 Boundary 不重叠校验，重叠的拆到下一波。

5. **写入同目录 `tasks.md`**：

```markdown
# Tasks: <功能名称>

- **Feature ID:** NNN-slug
- **Based on:** design.md
- **Progress:** 0 / N done

## Legend
[ ] 未开始 · [~] 进行中 · [x] 完成 · [!] 阻塞(需人介入)

## Tasks
- [ ] **T1** <标题>
  - What: 做什么
  - Boundary: `src/db/schema.sql`（唯一可写范围）
  - Depends: —
  - Refs: design §3 / AC1
  - Done when: 迁移可执行且测试通过

- [ ] **T2** <标题>
  - What: …
  - Boundary: `src/auth/register.ts`, `tests/register.test.ts`
  - Depends: T1
  - Refs: design §4 / AC1
  - Done when: …

## Waves / 并行计划
> 同一 Wave 内任务相互无依赖且 Boundary 不重叠 → /sdd:implement 会并发派发。
- **Wave 1**（并行）: T1, T3      — 无依赖，Boundary 不重叠
- **Wave 2**（并行）: T2, T4      — 依赖 Wave 1
- **Wave 3**: T5                 — 依赖 T2

## Traceability check / 覆盖核对
| Requirement (AC) | Task(s) |
|------------------|---------|
| AC1 | T1, T2 |
```

5b. **自动对齐自检 + 反压自修（任务层把关，默认开）**：tasks.md 写完后，对照 design/requirements 做一遍**覆盖与对齐自检**（即 `/sdd:analyze` 的 design↔tasks 部分），按 `/sdd:specify` 的「## 规格反压评审协议」精神处理：
   - **覆盖**：每条 AC / 每个 design 元素是否都有任务承接？**有缺口 = blocking** → 补任务，再自检（最多 2 轮）。
   - **不越界**：有没有任务做了 design 之外的事（范围蔓延）？标出来。
   - **Boundary 健全**：同一 Wave 内 Boundary 有无重叠？依赖分层对不对？有问题就重切。
   - 2 轮仍有覆盖缺口 → 停下报用户（可能是 design 本身缺，需回 `/sdd:plan`）。**意图红线**：只补"漏拆的任务/修边界"，不擅自加 design 没有的功能范围。
   - 更深的跨产物一致性（含已有代码）由独立的 `/sdd:analyze` 兜底——本步是生成即查的轻量前哨。

6. **完成后**：
   - 报告任务总数与 Wave 数，并给**并行度指标 = 任务数 / Wave 数**（越高越并行；接近 1 说明几乎串行，需按下方技巧重切）。
   - 报告**对齐自检结果**（覆盖缺口/越界/Boundary 问题 + 自修了什么）。
   - 提示下一步：`/sdd:implement`（默认按波次并行跑），或 `/sdd:implement T1` 指定任务。

## 最大化并行度（拆分技巧 — 提效核心）
> 理论最短耗时 = **Wave 数（关键路径深度）**，不是任务数。目标：**波尽量少、每波尽量宽**。
1. **一文件一主人**：每个任务 Boundary 互不重叠，两任务别写同一文件 → 同波可并行。
2. **拆共享热点**（并行头号杀手：路由表 / `app.json` / store 入口 / 上帝 service）：
   - 拆成 per-feature 模块（`register.service` + `login.service`，而非一个 `auth.service`）；
   - 或追加式（各任务加自己的模块文件，**最后一个串行"接线"任务**统一注册/聚合）。
3. **契约先行、扇出在后**：先一个任务定类型/接口/契约（地基），之后只依赖契约的任务全进**同一宽波**并行。避免 `A→B→C→D` 长链(=4 波)，改成 `地基 → [B,C,D,E]` 一波扇出。
4. **测试独立成边界**：test 文件与实现文件分属不同 Boundary → 可并行；TDD 则"写测试"任务与依赖它的实现分波。
   - ⚠️ **别为并行牺牲相称性**（§4 测试相称性）：小改 / delta 的测试**优先扩展已有测试类**，不要为每条 AC 拆出一个新测试任务/新测试类——那会让 10 行改动长出七八个测试类、还各自起重容器。"测试独立成边界"是给**新建模块**提并行用的，不是让小改也铺一套测试。任务里写测试时注明"扩展 `XxxTest` 加用例"而非"新建 `XxxTest`"。
5. **全栈用垂直切片**：一个功能的 db/api/ui 各为独立 Boundary 任务，跨层并行。
6. **照能力包的 Boundary 模式切**：server 按端点、前端按页面/组件、db 按迁移——天然不重叠的缝。
7. **宽而浅 > 窄而深**：宁可一波多任务，别多波单任务。
> 自检：若大多任务挤在一条串行长链 → 回头按 2/3 拆热点、提契约，把链压成扇出。

## 纪律
- ❌ 不写实现代码。
- ✅ Boundary 宁可拆细，让更多任务能进同一波并行——这是提速的关键。
- ✅ 拆完即**停**，等用户审阅。
