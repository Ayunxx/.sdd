---
description: 立宪 / Auto-scan the project (ANY language/ecosystem) and generate its engineering constitution (specs/constitution.md). 自动扫描任意语言项目的清单与配置，识别技术栈、把门禁填成项目已有的真实命令、整理编码规范，生成宪法草稿供确认；之后 SDD 全程遵循它。Run once per project before /sdd:specify。
argument-hint: "[空=自动扫描项目生成 | 可加补充/纠正，如 '强制 TDD']"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Bash(cat *)
---

# /sdd:constitution — 项目工程宪法

你的任务：在当前项目根目录创建或更新 `specs/constitution.md`。这是 SDD 工作流的"宪法"——一份**全项目长期生效的工程铁律**，后续 `/sdd:specify`、`/sdd:plan`、`/sdd:implement` 每一步都必须遵守它。

## 用户输入
$ARGUMENTS

## 执行步骤

1. **读取现状**：检查 `specs/constitution.md` 是否已存在。
   - 已存在 → 进入"更新模式"：展示当前内容，根据用户输入增改，保留未涉及的条款。
   - 不存在 → 进入"立宪模式"：从模板生成初版。

2. **扫描探测项目（自动，核心；支持任意语言/生态）**：你具备各主流生态的知识——用 Glob/Grep/Read 扫项目，按**通用方法**自动把宪法填满。**下面括号里的工具只是举例、绝非穷举**；遇到任何语言（C/C++、C#/.NET、Kotlin、Swift、Scala、Ruby、PHP、Elixir、Dart、Zig、Haskell、Lua、Shell、Objective-C…）和任何构建系统，都按同样思路办。
   - **⚠️ 只读清单/配置/CI，不通读源码**：探测只需 manifest + lint/format/test 配置 + CI 文件，**体量有界**；大仓库**逐子目录扫**，别把全部代码读进来。
   - **monorepo / 多子项目识别（关键）**：若主目录下有多个**各自带 manifest 的子项目**（如 `frontend/`、`backend/`、`embedded/`，或 `apps/*`、`packages/*`、`services/*`）→ 这是 monorepo。**逐个子项目探测**，每个子项目**生成一份能力包** `specs/stacks/<子项目名>.md`（含该子项目的栈 + §7 本层门禁命令）；`constitution.md` 顶层只做"地图"：§1 分列各子项目的栈，§3 给全局默认/共性，§7 登记这些 per-子项目能力包。各子项目命令不同就各归各的，不强求统一。
   - **技术栈（§1）**：找**任意依赖/构建清单**判定语言/运行时/框架/库/数据库（举例：package.json、pyproject.toml/requirements、go.mod、Cargo.toml、pom.xml/build.gradle、*.csproj/*.sln、composer.json、Gemfile、pubspec.yaml、mix.exs、CMakeLists.txt、platformio.ini、Kconfig、Package.swift…）。没有清单就看**源文件后缀 + import/包声明**判定。
   - **门禁命令（§3）——采用项目已有的真实命令，绝不另造**。按优先级找命令来源：
     1. **包管理脚本**（如 package.json.scripts、composer scripts、cargo aliases…）；
     2. **任务运行器**：Makefile、justfile、Taskfile.yml、CMake、Gradle/Maven 目标、Rakefile、nox/tox…；
     3. **CI 配置**：`.github/workflows/*`、`.gitlab-ci.yml`、`azure-pipelines.yml`、`Jenkinsfile`——里面就是该项目**真正跑**的 build/test/lint 命令，最可信；
     4. 该语言**惯用工具**（举例：ruff/black/mypy/pytest、eslint/prettier/tsc/vitest、gofmt/go vet/go test、cargo fmt/clippy/test、dotnet format/test、ktlint/detekt、swiftformat/swift test、rubocop/rspec、clang-format/ctest…）。
   - **沿用已有规范**：发现任何 formatter/linter/typecheck 配置文件 → §3 直接**指向它**（"遵循项目已有的 X 规范"），不重新发明规则。
   - **合并门性能探测（§3，模块/包多时必填，别让合并门裸跑串行）**：看构建工具与模块数——若是 monorepo/多模块（多个 pom.xml、workspaces、Nx/Turbo、Gradle 多 project），合并门命令**默认带上缓存+并行**：Maven→建议 `.mvn/extensions.xml` 装 `maven-build-cache-extension` + `-T 1C`；Gradle→`--build-cache --parallel`；JS monorepo→Nx/Turbo 自带缓存；pytest→`-n auto`；go→包级测试缓存。**集成测试若用 Testcontainers 等共享外部资源，提示并行需隔离实例或保持串行**。把这些填进 §3 的「Merge gate 性能」项，别只填一句裸 `mvn verify`/`gradle test`。
   - **注释/标识符语言探测（§3 必填，别漏）**：抽样已有代码的注释看实际用哪种语言 → 据实填入 §3「注释/标识符语言」；**新项目无既有代码 → 直接问用户一句**（"注释用中文还是英文？"）再填。绝不留空——留空 = 子代理默认写英文注释。
   - **测试/覆盖率（§4）**：用检测到的测试框架填入；有覆盖率配置就填阈值。识别现有长期回归测试与 CI 测试命令，不得把已有测试降级为“一次性测试”或建议删除。
   - **架构与约定（§2）**：从目录结构推断（分层、monorepo/多包、既有命名与分层风格）→ 概括成原则（**沿用现状，不强加**）。
   - **能力包建议（§7）**：据检测到的层建议 `/sdd:stack add`；monorepo 各包命令不同 → 提示到能力包 §7 填各层门禁。
   - **探测不到 / 不认识的生态**：仍按上述通用思路尽力推断；实在拿不准才标 `[待定]`，**别瞎编**；结尾列需用户拍板的关键项（≤5）。空项目/无清单 → 最小模板 + 问关键项。
   - 用户输入（$ARGUMENTS）作为**补充/纠正**叠加在自动探测之上。

3. **写入 `specs/constitution.md`**，严格使用以下结构（标题保持英文以便机读，正文中英混合）：

```markdown
# Project Constitution / 项目工程宪法

> 本文件是全项目最高约束。所有规格、设计、实现都必须遵守。修改需谨慎并记录版本。

## 1. Tech Stack / 技术栈
- Language & runtime:
- Framework:
- Database / storage:
- Key libraries:

## 2. Architecture Principles / 架构原则
- 架构方法（如 分层 / 整洁 / 六边形 / DDD，可 `/sdd:principles` 选型）、依赖方向、模块边界、不允许的耦合
- 遵循的设计原则（SOLID / 高内聚低耦合 / DRY / KISS / YAGNI）；服务端/全栈的高可用约定（超时/重试/熔断/降级/幂等）

## 3. Code Quality Gate / 代码质量门禁（钉死命令，工具说了算）
> 风格一致性靠确定性工具强制，不靠 AI 自觉。Implementer 只修改；全新 Verifier 使用下面的**非写入检查命令**独立核对；全新 Reviewer 再审真实 diff。合并门运行编译/类型检查、架构 fitness 与受影响持久回归测试。填具体命令，别留空话。
> ＊全栈 monorepo 各层（包）命令不同时，可在对应能力包 `specs/stacks/<domain>.md §7 本层门禁` 声明覆盖本默认。
- **Format check（非写入）:** [如 `prettier --check <files>` / `ruff format --check <files>` / `gofmt -l <files>`；Verifier 禁止执行 `--write`/`--fix`]
- **Lint:** [如 `eslint .` / `ruff check .` / `golangci-lint run`]
- **Typecheck:** [如 `tsc --noEmit` / `mypy .`；无则 N/A]
- **Test（实现期相关测试）:** [如 `npm test -- <affected>` / `pytest tests/<mod>` / `mvn -pl <module> -am test`；按 §4 决定测试持久化或仅作临时证据]
> ⚠️ **角色与门分离**：Implementer 终端只修改；fresh Verifier 终端运行本任务非写入门禁并产出证据；fresh Reviewer 只读审查。主终端 `/sdd:worktree finish` 再运行合并门。三个角色不得复用上下文或互相自签。
> ⚠️ **并发写门禁/资源隔离**：worker 的 formatter/fixer 只能显式接收本任务 Boundary/changed files；包级或仓库级写门禁移到 Wave checkpoint 串行执行。端口、测试 DB/schema、缓存、临时目录、浏览器 profile 必须按 task 唯一；无法隔离的任务独占 Wave。
- **Config 文件:** [.editorconfig · 格式化/lint 配置 · `.gitattributes`（统一换行 LF/CRLF）]
- **Error handling / Logging:** [统一约定]
- **Maintainability（可维护性规则）:** [命名约定 · 单函数行数/圈复杂度上限 · DRY 禁重复、复用优先 · 分层与依赖方向 · 公共 API 注释要求]
- **注释 / 标识符语言（Comment & identifier language）:** [显式钉死注释用哪种语言，否则隔离子代理默认写英文注释。如「注释用中文、标识符用英文」/「全英文」/「跟随现有代码库」。**生成本宪法时按已有代码库的实际注释语言探测填入；新项目无既有代码则询问用户后填，别留空**]
- **Architecture fitness（架构适应度函数，自动守架构）:** [如 dependency-cruiser/import-linter 守依赖方向与禁止 import · eslint-boundaries 守分层 · jscpd 重复率阈值（如 >5% 失败）· 复杂度上限。架构靠工具守，不靠记忆——防后期侵蚀]
- **Merge gate（合并门）:** [合并到主干前执行：① 改动模块编译/类型检查；② 架构 fitness；③ 受影响的持久回归测试。避免无差别全库测试，但不得把“只编译”当成质量完成。示例：Maven `-pl <changed> -am test`、Gradle `:<mod>:test`、受影响包的 `tsc --noEmit && test`]
- **Merge gate 适用范围（按"是否入 main"判，不按功能大小）:** [**凡经 `/sdd:worktree finish` 合并进 main 的都必走合并门——含 lite**。理由：改一行共享代码也可能破坏编译、架构或既有行为。**不按 lite/full 豁免**；成本按 affected 范围伸缩——小改只编译改动模块、跑静态 fitness 与少量受影响测试。纯非代码改动（docs/注释）可把不适用项记为 `N/A(<理由>)`。Trivial 直接改不经 finish，靠项目 CI/代码评审兜底；若碰共享代码，应升级到 lite 走门。]
- **Merge gate 性能（按 affected 范围伸缩）:** [改动模块编译 + 静态 fitness + 受影响持久测试。使用构建/测试缓存与并行：Maven `-T 1C`+build cache、Gradle `--parallel --build-cache`、Nx/Turborepo/Bazel affected/cache、pytest `-n auto` 等；共享外部资源的集成测试保持隔离或串行。]

## 4. Testing Discipline / 测试纪律（风险分级、关键回归持久化）
> 测试分为**持久回归测试**与**临时验证证据**。二者都必须真实运行；区别只在是否值得长期保护。默认保留高价值测试，不以“轻量”为由清空回归护栏。
- Strategy:（如 测试金字塔 / TDD / 风险分级；注明哪些测试进入 CI）
- Test framework:（项目实际框架/工具）
- **必须持久化并提交**：历史 Bug 回归、公共 API/契约、鉴权与安全、状态机/领域不变量、数据库迁移、并发/事务、共享核心能力。
- **允许临时并在留证后删除**：探索性实验、一次性诊断、硬件/外部环境探针、低价值展示验证。删除前保留命令、退出码和必要输出摘要。
- **相称且复用优先**：改已有能力优先向现有测试类/fixture 增加用例；相关 AC 用参数化或同一测试组覆盖；能用轻量单测就不滥用重型集成测试。
- **受影响测试进入合并门**：本地/CI 至少执行改动模块及依赖范围内的持久回归测试；全量回归可放在 PR 或 nightly，不要求每次本地执行。
- ❌ 不允许只有实现者口头声称“测过”而没有命令/退出码/日志证据；❌ 不允许为了减少测试数量删除高价值回归。
- **测试完整性**：禁止用 `skip`/`only`、恒真断言、空测试、过宽 mock、禁用类型/lint、降低覆盖率阈值或删除既有高价值回归来换取绿灯；确有例外必须记录位置、理由并经独立 reviewer 批准。

## 5. AI Guardrails / AI 红线
> Claude 在本项目中**必须遵守**的硬性约束。
- 永远不做：（如 不引入未在宪法中列出的依赖、不绕过类型检查/编译、不擅自改技术方向）
- 永远要做：（如 改动必须可追溯到某条 requirement、破坏性操作先确认）

## 6. Definition of Done / 完成标准
- **任务级**：任务按 `pending → implementing → implemented → verifying → verified → reviewing → passed` 推进。每阶段使用全新隔离上下文：Implementer 只修改，Verifier 只核对且不得改变工作树，Reviewer 只审查。Done when/AC 逐条有 Verifier 行为证据，§3 非写入门禁通过，并经 Reviewer PASS 后才能完成。空结果、`not_run`、证据缺失、核对副作用或 Reviewer 非 PASS 一律失败关闭。
- **功能级（合并门）**：合并到主干前，改动模块编译/类型检查 + fitness + 受影响持久回归测试全绿；`/sdd:verify` 按 AC 提供行为证据。

## 7. Stacks & Skills / 能力包与注入技能
> 声明本项目覆盖哪些开发领域（注入对应能力包），以及要注入的 Claude Code skill。详见 specs/stacks/*.md。
**Active stacks（领域能力包）:** [待 /sdd:stack add 选择，如 server, database, h5]
**Injected skills（注入技能）:** [可选，如 anthropic-skills:xlsx]

## 8. Workflow / 重型编排（默认不用，可显式启用或项目禁用）
> `/sdd:implement` 默认使用提示词编排；只有用户本次显式传 `--workflow` 才会启动 Claude Code Workflow。它更适合大批量 fan-out，也更费 token，且 agent 继承会话 tool allowlist。若项目因成本、权限或审计要求要彻底禁止，把下面设为 `是`。
- **禁用 Workflow:** 否（仍需用户逐次显式 `--workflow`；改 `是` 后即使传 flag 也拒绝）
- **允许阶段:** implement（目前仅此）
- **资源/成本提示（仅文档，不是运行时硬门）:** [可选；真正的并发/预算限制必须由宿主 Workflow 配置或外部策略实施，不能只写在这里]

---
_Version: 0.1.0 · 最后更新: [由用户填写日期]_
```

4. **完成后**：
   - **汇报"自动探测到了什么"**：识别出的技术栈、采用的门禁命令（来自哪个 scripts/配置）、推断的架构与约定——让用户一眼核对。
   - 列出 `[待定]`（没探测到、需用户拍板的）项，请用户确认/补充。
   - **校验门禁命令可用**：§3 的命令最好是"项目里能直接跑"的；探测到 scripts 就用它，没有就如实标 `[待定]`，别填一个跑不了的占位。
   - 据探测到的层，**主动建议** `/sdd:stack add <领域>`。
   - 提示下一步：`/sdd:specify` 或 `/sdd:auto <一句话功能描述>`。

## 纪律
- 不要在本步骤设计任何具体功能——宪法是全局约束，不是需求。
- 不要写代码。
