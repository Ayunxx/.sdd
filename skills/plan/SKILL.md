---
description: 设计 / Turn requirements.md into a technical design.md (HOW). 第二阶段：架构、数据模型、接口契约、技术选型、可追溯表。不写实现代码。
argument-hint: "[可选：当前功能目录名，如 001-user-auth；省略则取当前 sdd 分支]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Bash(cat *), Bash(git *), Task
---

# /sdd:plan — 技术设计

你的任务：把已确认的 `requirements.md` 转化为一份可据以编码的 `design.md`。本阶段回答"**怎么做**"，但**不写实现代码**。

## 用户输入
$ARGUMENTS

## 执行步骤

0. **Feature 身份门禁**：读取当前分支与 `git worktree list --porcelain`。只有当前分支形如 `sdd/NNN-slug`、且当前目录正是该分支登记的 worktree 时才允许写设计；目标目录必须是该分支对应的 `specs/NNN-slug/`。在主 worktree、其他分支、detached HEAD 或显式参数指向别的 feature 时停止并引导进入正确目录。

1. **读全上下文**（缺一不可）：
   - `specs/constitution.md`（宪法，技术选型/约束以它为准）
   - **激活的能力包**：读宪法 `## Stacks & Skills` 里列出的 `specs/stacks/*.md`——设计必须遵循对应领域的默认技术栈、目录布局约定与红线（这是覆盖各端开发的关键）。
   - 目标功能的 `requirements.md`（定位方式同 /sdd:clarify）
   - **设计模式与工程原则目录（选型依据，必读——别只凭记忆）**：`Read` 进 `${CLAUDE_PLUGIN_ROOT}/skills/patterns/SKILL.md`（24 种设计模式的场景/解决的问题/何时不用）与 `${CLAUDE_PLUGIN_ROOT}/skills/principles/SKILL.md`（SOLID/DRY/KISS/YAGNI、架构方法、12-Factor、高可用模式）。**定位**：依次试 `${CLAUDE_PLUGIN_ROOT}/skills/...` → 插件安装目录 → 当前 `.sdd/skills/...`；都找不到就退回用你自身知识（但仍要按 step 3 显式走一遍选型）。这两份只读不改，目的是把"有哪些可选项"摆到台面上，供下面对照本功能取舍。
   - 若是已有代码库，用 Glob/Grep 摸清现有结构、复用既有模式，不要另起炉灶。

2. **核查前置**：若 `requirements.md` 仍有未解决的 `[NEEDS CLARIFICATION]`，**先停下**，提示用户跑 `/sdd:clarify`。不要带着模糊需求做设计。

3. **做设计决策**：技术选型要遵守宪法；如需偏离宪法或引入新依赖，**显式标注并说明理由**，等用户批准。
   - 设计要落在工程原则上：遵守 **SOLID / 高内聚低耦合 / DRY**，按系统复杂度选合适的**架构方法**（分层/整洁/六边形/DDD…），服务端/全栈再考虑 **12-Factor 与高可用**（超时/重试/熔断/降级/幂等）。
   - **设计模式选型（强制走一遍，别跳过）**：对照 step 1 读进来的 patterns 目录，**逐个识别本功能/系统架构里"反复出现、会变化或需解耦"的点**（如对象创建复杂 → 工厂/建造者；行为随状态/策略切换 → 状态/策略；跨层解耦/适配外部 → 适配器/外观/依赖倒置；事件通知 → 观察者；扩展行为不改原类 → 装饰器…）。**判断"这一次用得上哪些"**，把结论落到 §7：
     - **用到的**：写明「在<哪个组件/难题>用<某模式>，因为<解决的具体变化点>」。
     - **考虑过但不用的**：若某处看似该上模式却选了更简单写法，**一句话说明为何不用**（守 YAGNI）。
   - ⚠️ **YAGNI 红线**：简单清晰 > 模式/架构"正确"，**绝不为用而用**——简单分支硬套状态/策略、单产品硬套抽象工厂之类会被 `design-critic` 与可维护性门禁打回。模式是为"已出现或高度确定的变化点"服务，不是为想象中的未来。

4. **写入同目录 `design.md`**，使用以下结构：

```markdown
# Design: <功能名称>

- **Feature ID:** NNN-slug
- **Status:** Draft
- **Based on:** requirements.md @ <简述版本/日期>

## 1. Approach / 总体思路
（2–4 句说明整体技术路线，以及为什么这么选）

## 2. Architecture / 架构
（组件划分、它们如何协作；必要时用 mermaid 或文字框图描述数据流）

## 3. Data Model / 数据模型
（实体、字段、类型、约束、关系、索引；DB schema 或类型定义）

## 4. Interfaces & Contracts / 接口契约
（API 端点 / 函数签名 / 事件；每个含输入、输出、错误码）

## 5. Key Logic / 关键逻辑
（重要算法、状态机、校验规则、边界处理——对应 requirements 的 Edge Cases）

## 6. File / Module Layout / 文件与模块布局
（要新增/修改哪些文件，各自职责）

## 7. Tech Decisions / 技术选型与取舍
| Decision | Choice | Rationale | 是否偏离宪法 |
|----------|--------|-----------|-------------|
| … | … | … | No / Yes(需批准) |

### 7.1 Patterns & Principles / 设计模式与原则选型
> step 3 的强制选型结论落这里。没有合适的就如实写"本功能简单，无需引入模式"——这本身也是合格结论。
| 应用点 (组件/难题) | 模式 / 原则 | 为何用（解决的变化点） |
|--------------------|------------|----------------------|
| 如 支付渠道接入 | 策略 Strategy | 渠道会增减、各自算法不同，隔离变化 |
- **考虑过但不用**：如〈某处〉看似可上〈工厂〉，但当前只有一种产品、未来无明确扩展 → 直接 new，守 YAGNI。

## 8. Testing Strategy / 测试策略
（逐条映射 AC：测试层级/场景、风险、persistent|ephemeral|none(理由)、复用的既有 harness、实际门禁命令与证据落点。历史 Bug、公共契约、鉴权安全、状态机/领域不变量、迁移、并发事务、共享核心能力必须留持久回归测试；探索/诊断/硬件探针才可 ephemeral。）

## 9. Traceability / 可追溯表
> 每条需求都要落到设计；不允许有需求无对应设计。
| Requirement (AC/US) | Design element(s) |
|---------------------|-------------------|
| AC1 | §3 表 users + §4 POST /register |
| AC2 | … |

## 10. Risks & Open Issues / 风险与遗留
- …

## 11. Deviations / 实现偏移（实现期回填，初始留空）
> 实现中凡偏离本设计的（业务/技术），由 /sdd:implement 在此追加：`- [偏移] 原 X → 实际 Y · 原因 · 影响的 AC`。冻结前据此对账，使规格= 实际所建。
- （初始为空）
```

4c. **自动评审 + 反压自修（设计层把关，默认开）**：design.md 写完后，用 `Task` 派 **`design-critic`** 子代理评审，按 `/sdd:specify` 的「## 规格反压评审协议」处理 Verdict（🔴 只针对 blocking 自修设计 → 再评，最多 2 轮；2 轮仍 🔴 停下报用户）。design-critic 专查**design 是否偏离 requirements/宪法、可追溯缺口、过度/欠设计**——这是设计层"对齐"检查的核心。**意图红线同协议**：自修只补"设计层面的漏/不严谨"，**绝不擅自改技术方向/选型**——那是需用户批准的决策。

5. **完成后**：
   - 报告文件路径，高亮任何"偏离宪法/新依赖"需要用户批准的决策。
   - 检查可追溯表是否覆盖了全部 AC，列出未覆盖项。
   - 报告 **design-critic 评审 Verdict**（🟢/🟡/🔴 + 自修了什么 + 残留问题）。
   - 提示下一步：`/sdd:tasks`。

## 纪律
- ❌ 不写实现代码（不产出真正的函数体；接口签名/schema/伪代码可以）。
- ✅ 每条 AC 必须在可追溯表里有对应设计，否则就是需求漏设计。
- ✅ 设计完即**停**，等用户审阅。
