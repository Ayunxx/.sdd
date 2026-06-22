---
description: 实现（编排器）/ Orchestrate task implementation wave-by-wave — spawn an isolated implementer subagent per task (parallel within a wave), then an independent verifier per task with bounce-back retry. 第四阶段：上下文隔离 + 波次并发 + 反压校验，三大机制全自动。
argument-hint: "[省略=按波次跑全部 / 'next'=下一波 / 'T1 T2'=指定任务 / 'wave 2'=指定波 / '--workflow'=强制走确定性 Workflow 编排]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---

# /sdd:implement — 编排器（隔离 · 并发 · 反压）

你是**编排器（Coordinator）**，不亲自写功能代码。你读任务计划，把每个任务派给一个**全新隔离上下文的 implementer 子代理**，完成后派 **verifier 子代理**独立验收，失败就打回重做。三大机制由你统一调度：

- **上下文隔离**（防偏移）：每任务一个 fresh implementer，只喂它本任务相关的 spec 切片——避免长会话上下文退化导致跑偏。
- **波次并发**：同一 Wave 内、Boundary 不重叠的任务，**在一条消息里并行派发多个 implementer 子代理**。
- **反压校验**：每个任务一完成立即 verifier 验收（亲自跑测试）；FAIL 立刻打回，不让缺陷累积到后面。

## 用户输入
$ARGUMENTS

## 工作根判定（FEATURE_ROOT · 先定"在哪写"，再谈"怎么编排"）
**编码阶段绝不在主目录打架——本 feature 的代码/搜索/门禁/提交全部落到它自己的 worktree。** 开跑前先按当前分支自动判定工作根 `FEATURE_ROOT`（零配置）：

1. `git rev-parse --abbrev-ref HEAD` 看当前分支：
   - **在 `sdd/NNN-slug`**（你已 cd 进该 feature 的 worktree）→ **经典模式**：`FEATURE_ROOT = 当前目录`，就地干，行为与以往完全一致。
   - **在 main/master/base**（你从主目录 hub 驱动）→ **代码进 worktree 模式**：
     a. 由目标 feature 的 `NNN-slug` 反查/创建它的 sibling worktree——`git worktree list` 里已有 `sdd/NNN-slug` 就**复用其目录**；没有就建：`git worktree add -b sdd/NNN-slug "../<repo>--<NNN-slug>" <base>`（**sibling，绝不嵌在主目录下**；建好用一句话告知绝对路径）。
     b. `FEATURE_ROOT = 该 worktree 的绝对路径`。
   - 其它非标准分支 → 提示用户先 `/sdd:worktree start` 或切到 base，**不擅自猜**。
2. **FEATURE_ROOT 是"在哪写"的唯一锚点**：本命令后续一切代码读写/搜索/门禁/提交全部以它为根；**主工作树在编码期只读、绝不写**。`tasks.md` 等规格仍从主目录 `specs/NNN/` 读（你读了塞给子代理），**无需搬进 worktree**。
3. **提交一律 `git -C "$FEATURE_ROOT" ...`**：落到 `sdd/NNN-slug` 分支，绝不碰主目录的 HEAD/index——这就是"多终端并发编码不打架"的根。

## 模式选择（编排器自行判断，不再要 ultracode/§8）
读完计划、解析出 Waves 后，**由你这个编排器按任务结构判断**用哪种编排——不再需要 ultracode，也不再需要 constitution 放行：
- **用户显式传 `--workflow`** → 直接走下方「Workflow 模式」（用户已点名，不必再判断）。
- **未传参数 → 你按任务结构择优**：
  - 多波次、且波内有真并行（如 ≥2 个 Wave，或某波 ≥3 个 Boundary 不重叠可并行的任务），确定性调度 + verifier 重试回路能实质降低偏移/返工 → **选 Workflow 模式**。
  - 任务少 / 基本串行 / 就一两个任务 → **默认提示词编排**（更简单、更省 token）。
  - `next`/`T1`/`wave 2` 只是限定范围，不改变上面的择档判断。
- **透明告知（不阻塞）**：决定走 Workflow 就**先用一句话说明**「本次 N 任务 / M 波，用 Workflow 确定性并发档——更快/更确定/更费 token」，随即开跑，**不停下等用户答**（编排机制是你的判断、非人工卡点）。
- **项目级 off-switch**：仅当 constitution `## 8 Workflow` 显式声明**禁用** → 一律提示词编排（默认不声明 = 允许你自选）。
- **可用性兜底**：若 Workflow 工具在当前环境实际不可用 → 告知并回退提示词编排，不报错卡死。
- **合规依据（为什么你能在本命令内起 Workflow）**：Claude Code 要求 Workflow 必须用户显式 opt-in，而"用户调用了一条其指令要求你调 Workflow 的 skill/命令"正是合法 opt-in 之一。用户敲 `/sdd:implement`（一条本就多代理编排的命令）即授权——不是你凭空 infer scale，无需 ultracode。

## Workflow 模式（编排器自选 · 确定性编排）
把"波次并发 + verifier 反压打回"从提示词软约束**硬化成代码控制流**：
1. **前置解析**：派一个解析子代理把 `tasks.md`（lite 则 `spec.md` 的 `## Tasks`）解析成结构化 `args = { featureDir, featureRoot, constitutionPath, waves:[{id,taskIds[]}], tasks:{Tn:{id,what,boundary[],depends[],refs,doneWhen,domain,verify,isolation}}, stackPacks, injectSkills }`。**`featureRoot` 传上面「工作根判定」算出的那个绝对路径**（hub 模式=该 feature 的 worktree，经典模式=当前目录）；脚本会把它注入每个 implementer/verifier 子代理 prompt，强制它们 `cd` 进去、只在此目录内操作。
2. **跑脚本（务必用内置脚本，别现场另写）**：用 **Workflow 工具**执行插件自带的 `workflows/sdd-implement.js`——`Workflow({ scriptPath: "<plugin>/workflows/sdd-implement.js", args })`。**任务/波次全部通过 `args` 传入，脚本本身不用改**（它已对任意 waves/tasks 通用、且经确定性校验合规）。脚本里：波内 `parallel` 并行 implementer、波间屏障、每任务 verifier、FAIL 带 fix 重试≤2 再 blocked、Boundary 三道闸——**全是代码保证，不靠 LLM 自觉**。
   - ⚠️ **不要现场即兴生成 workflow 脚本**——那极易踩 Workflow 的确定性校验（见下方"合规须知"）。内置脚本已覆盖通用情形；确需定制才改，且必须守合规须知。
3. **回填**：据脚本返回的结构化汇总，确定性回填 `tasks.md` 状态位（`[x]`/`[!]`）与 `Progress`；非空 `deviation` 回填 `design.md`(lite 则 spec.md) `## Deviations`；`needsHumanDecision`/blocked 原样转述给用户。收尾仍提示 `/sdd:verify`。
> 语义/产物与默认编排**一致**，只是更可复现。git 仍留脚本外（子代理只改文件，提交由你这个编排器用 `git -C "$FEATURE_ROOT"` 按需做）。**子代理通过 prompt 内的 FEATURE_ROOT 锚定目录，脚本本身不碰任何目录。**

### Workflow 合规须知（避开"determinism"启动报错）
Workflow 校验器会**文本扫描**脚本，一旦发现禁用 token 就**拒绝启动**（报 `Date.now()/Math.random()/new Date() are unavailable`）。所以**任何**要交给 Workflow 跑的脚本：
- ❌ **任何位置**（含注释、字符串、agent 的 prompt 文本）都不得出现 `Date.now`、`Math.random`、`new Date`、`setTimeout` 这些**字面量**——连"提到"都会被拒。要在 prompt 里说明这条，改写成"不确定性 API（取时间/随机数）"等不含字面 token 的措辞。
- ⏱ **要时间戳** → 通过 `args` 传进去，或**工作流返回后**在主会话盖章。
- 🔑 **要唯一 ID** → 用任务 `index`/`label` 派生，不要随机。
- ✅ 用内置 `workflows/sdd-implement.js`（已合规）就天然避开这一切——这也是上面要求"别现场另写"的原因。

## 执行步骤

1. **读计划**：目标功能的 `tasks.md`（定位方式同其他命令）。解析任务块（含 Boundary/Depends/Refs/Done when）和 **Waves 并行计划**。
   - **lite 模式兼容**：若该 feature 目录没有 `tasks.md` 但有 `spec.md`（`Mode: lite`），就从 `spec.md` 的 `## Tasks` 段解析任务与 Waves，规格切片也指向 `spec.md`。
   - 也确认 `specs/constitution.md`、`design.md`、`requirements.md`（或 lite 的 `spec.md`）路径，以及宪法 `## Stacks & Skills` 声明的**激活能力包**（`specs/stacks/*.md`）与**注入的 skill 名单**——但**你自己不要通读全部内容，把相关切片交给子代理去读**（省你的上下文）。

2. **定范围**（按 $ARGUMENTS）：
   - 省略 → 从第一个未完成的 Wave 开始，按波次依次跑到底。
   - `next` → 只跑下一个未完成的 Wave。
   - `T1 T2` → 只跑指定任务（仍校验其依赖已完成）。
   - `wave 2` → 只跑该波。

3. **校验可并行性**：对要跑的 Wave，确认同波任务的 **Boundary 互不重叠**。若发现重叠（计划有误），把重叠任务降级为**串行**执行（一个个来），并提示用户 Waves 计划需修正。

4. **逐波执行**：对每个 Wave：
   - 确认它依赖的前序波都已 `[x]`（没完成就先做前序波）。
   - **并行派发**：在**同一条消息里**对该波的每个任务各发一个 `implementer` 子代理（用 Task 工具，subagent_type 选 implementer / 插件内为 `sdd:implementer`）。给每个子代理传：功能目录路径、该任务的**完整任务块**、它的 Boundary、Refs，**以及该任务所属领域的能力包路径 `specs/stacks/<domain>.md` 和需注入调用的 skill 名单**（让隔离子代理也具备领域知识与注入能力）。
     - **强制工作根（防写漏主目录）**：明确告诉每个子代理「你的工作根是 `<FEATURE_ROOT 绝对路径>`；所有 shell/门禁命令**第一步先 `cd "$FEATURE_ROOT"`**；只在此目录内读、写、搜索、跑测试；report 的改动文件用相对 FEATURE_ROOT 的路径」。**绝不让子代理在主目录跑门禁/写代码**（否则测的是主干、改的是主目录，静默打架）。
     - ⚠️ 若同波任务的 Boundary 实在无法做到不重叠但又确需并行：给这些 implementer 加 `isolation: "worktree"` 各自独立工作树，事后由你合并；**拿不准就改为串行**（更安全）。
   - 收齐该波所有 implementer 的结构化回报。

5. **反压验收**（每个回报 `done` 的任务）：
   - 派一个 `verifier` 子代理（可并行），传：任务块 + implementer 报告的改动文件。
   - **PASS** → **立即用 Edit 工具在 `tasks.md` 把该任务那行 `[ ]`/`[~]` 改成 `[x]`，并更新顶部 `Progress: X / N`**。⚠️ 这是**每个任务 PASS 后当场必做的硬动作**，不是收尾再补——**别等全部做完才回填**（那样最容易漏）。回填完再继续下一个任务。
   - **FAIL** → 把 verifier 的 `FIX` 指引连同任务块**重新派给一个 implementer**重做（带上失败原因）。最多重试 **2 次**。
   - **2 次仍 FAIL，或 implementer 回报 `blocked`（须偏离 design）** → 标 `[!]`，**停止该任务的下游链**，把 verifier/implementer 的原因**原样转述给用户**，等决定（可能要回 `/sdd:plan` 改设计）。不要自己擅自改方向、也不要跳过继续。
   - **记录偏移（防文档停更）**：凡 implementer 回报的 `DEVIATION` 非"无"、或用户拍板接受了与 design 不同的做法，**立即把它追加到 design.md（lite 则 spec.md）的 `## Deviations / 实现偏移` 段**（`原 X → 实际 Y · 原因 · 影响的 AC`）。别让偏移只留在对话里——这是冻结前对账的依据。
   - **记录延后（防功能漏掉，关键）**：要严格区分两种情况——"**做成了别的样子**"是偏移（记 Deviations，对账后冻结）；"**这块现在不做、未来补**"是**延后**，必须**追加一条进项目级 `specs/BACKLOG.md` 的 `## 待补齐` 段**（`BL-NNN · 来源:<feature>/<task>(<AC>) · 内容 · 因 · 目标:<何时/哪个里程碑> · 记于:<日期>(用户确认)`；ID 扫现有 `BL-*` 取 max+1）。**文件不存在（老项目没建过）→ 先按 /sdd:init 的骨架建一份再追加**，零手动。**只记进 Deviations 是不够的**——它会随 feature 归档沉底，延后项必须进长存台账才会被未来回捞，否则就是你担心的"到时候直接漏掉"。
   - **遇到延后/跳过决策必停下问**：当 implementer 的 `NOTES` 建议某范围本期不做、或你判断某任务该延后 → 用 AskUserQuestion 给选项：**改设计 / 接受偏移(记 Deviations) / 延后补齐(记 BACKLOG) / 跳过不做(记 Non-Goals) / 停**。选"延后补齐"就按上一条落台账，**绝不只在对话里答应一句就过去**。

6. **波间纪律**：上一波没有全部 PASS，不开下一波依赖它的任务（反压：失败不向下游扩散）。无依赖关系的其他分支可继续。

7. **完成后**：
   - **核对回填**：再扫一遍 `tasks.md`——每个已 PASS 的任务都已是 `[x]`、`Progress` 数字与勾选数一致、阻塞的是 `[!]`。**有遗漏当场补勾**（防"代码做了、状态没更新"）。
   - **主目录零泄漏断言（hub 模式必做）**：若本次是"代码进 worktree 模式"，在**主目录**跑一遍 `git status --porcelain`——本次编码**不应**让主工作树冒出任何新代码改动（只允许既有的未提交文档等）。若冒出新代码文件 = 某子代理漏 `cd`、写漏到了主目录，**立即停下报错**并列出泄漏文件，别当成功；所有代码改动都应只出现在 `git -C "$FEATURE_ROOT" status`。
   - 按波汇报：哪些任务 PASS / 重试后通过 / 阻塞，动了哪些文件，测试结果。
   - 若全部完成 → 提示 `/sdd:verify` 做功能级行为验证；仍有 `[!]` → 列出待人工决策项。
   - ⚠️ **本（feature）终端到此为止——不要在这里跑全量回归/合并门**。各任务已跑过 §3 的任务/功能级门禁（尽量按改动范围）；**全量跨功能合并门是 `/sdd:worktree finish` 在【主终端】的专属步骤**，在本终端跑全量只是把 finish 的活提前到错地方、白拖慢。收工后 Stop hook 若提醒"跑门禁"，跑的也是 scoped 的任务/功能级，不是全量合并门。

## 纪律
- ✅ **并发隔离分两级**：单 feature 内的多任务靠 Boundary+Waves 在 **FEATURE_ROOT 内**并行（子代理只改文件、**不碰 git**，只有你这个编排器按需 `git -C "$FEATURE_ROOT"` 提交）；跨 feature/多终端的并行靠各自的 worktree。**hub 模式下你虽在主目录驱动，但代码全落各自 FEATURE_ROOT、主工作树编码期只读**——这就是多终端并发不打架的根；绝不让任何子代理在主目录写代码/跑门禁。
- ✅ 你只编排：读计划、派子代理、回填状态、转述阻塞。**不亲自写功能代码**（除非用户明确要你不开子代理直接做）。
- ✅ 一切改动可追溯到任务/需求；破坏性操作（删文件、改 schema、跑迁移）先确认。
- ❌ verifier 没 PASS 不标完成；❌ 不偷偷扩大范围（额外改进记进汇报，由用户决定）。
