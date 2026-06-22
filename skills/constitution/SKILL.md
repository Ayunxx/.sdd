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
   - **测试/覆盖率（§4）**：用检测到的测试框架填入；有覆盖率配置就填阈值。
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
> 风格一致性靠确定性工具强制，不靠 AI 自觉——本框架用隔离子代理并行实现，风格漂移只能由**统一工具**抹平。下列是**全局默认**命令，会被 implementer 报告前自跑、verifier 设为**硬门禁**、可选 hook 实时执行。填具体命令，别留空话。
> ＊全栈 monorepo 各层（包）命令不同时，可在对应能力包 `specs/stacks/<domain>.md §7 本层门禁` 声明覆盖本默认。
- **Format（格式化）:** [如 `prettier --write .` / `ruff format .` / `gofmt -w .`]
- **Lint:** [如 `eslint .` / `ruff check .` / `golangci-lint run`]
- **Typecheck:** [如 `tsc --noEmit` / `mypy .`；无则 N/A]
- **Test（任务/功能级，实施终端循环用——尽量按改动范围跑、别退化成全量）:** [如 `npm test`（含范围）/ `pytest tests/<mod>` / `mvn -pl <module> -am test`。monorepo 务必给一条**只跑改动模块**的命令，否则实施终端每次都全量、又慢又抢了合并门的活]
> ⚠️ **门分两层、别混**：上面的 Test 是【实施终端】的循环门禁（任务级 + `/sdd:verify` 功能级，尽量 scoped）；下面的 **Merge gate 是【主终端】`/sdd:worktree finish` 专属的全量跨功能回归**。**实施终端绝不跑全量合并门**——那是 finish 的事，在 feature 终端跑只是把 finish 的活提前到错地方、白拖慢。
- **Config 文件:** [.editorconfig · 格式化/lint 配置 · `.gitattributes`（统一换行 LF/CRLF）]
- **Error handling / Logging:** [统一约定]
- **Maintainability（可维护性规则）:** [命名约定 · 单函数行数/圈复杂度上限 · DRY 禁重复、复用优先 · 分层与依赖方向 · 公共 API 注释要求]
- **注释 / 标识符语言（Comment & identifier language）:** [显式钉死注释用哪种语言，否则隔离子代理默认写英文注释。如「注释用中文、标识符用英文」/「全英文」/「跟随现有代码库」。**生成本宪法时按已有代码库的实际注释语言探测填入；新项目无既有代码则询问用户后填，别留空**]
- **Architecture fitness（架构适应度函数，自动守架构）:** [如 dependency-cruiser/import-linter 守依赖方向与禁止 import · eslint-boundaries 守分层 · jscpd 重复率阈值（如 >5% 失败）· 复杂度上限。架构靠工具守，不靠记忆——防后期侵蚀]
- **Merge gate（合并门，防全局功能偏移）:** [合并到主干前必须跑**全量**：完整测试套件 + lint + typecheck + 上面的 fitness 全绿。任一老功能测试报红 = 新功能改坏了它，禁止合并]
- **Merge gate 适用范围（按"是否入 main"判，不按功能大小）:** [**凡经 `/sdd:worktree finish` 合并进 main 的都必走合并门——含 lite**。理由：合并门防的是"改坏 main"，而**风险 ≠ 功能大小**（改一行公共代码也能炸全局）。**不按 lite/full 豁免**；成本担忧由上面「性能」的 cache 解决——门成本随 blast radius 自动伸缩，小改只重跑那点。**唯一近乎免门**：纯非代码改动（docs/注释/无测试覆盖的配置），门本身无可跑。Trivial 跳过 SDD 的直接改**不经 finish 故无门**，靠下个 feature 从最新 main 跑的合并门 + CI + commit-msg hook 兜底；若 trivial 碰了共享代码，应升级到 lite 走门。]
- **Merge gate 性能（随规模可伸缩，别裸跑串行）:** [全量 ≠ 慢。**填的合并门命令必须带"缓存跳过未变 + 并行"**，否则模块一多就线性变慢、成为关键路径杀手。**零安全损失的两招**（优先）：① 构建缓存——按内容哈希跳过未变模块/包（等价于跑了、结果可证相同）：Maven `maven-build-cache-extension`(`.mvn/extensions.xml`)、Gradle `--build-cache`、Nx/Turborepo/Bazel 自带缓存、pytest `--cache`/go 包级测试缓存；② 并行——Maven `-T 1C`、Gradle `--parallel`、pytest `-n auto`、jest 默认分片（注意：共享外部资源的集成测试如 Testcontainers 并行需各自隔离实例，否则保持串行）。**愿意牺牲一点安全换更快的可选**：affected/incremental 只跑改动范围+下游（Maven `-pl <changed> -amd`、Nx/Turbo affected）、或分层（快门禁挡合并 + 全量挪 CI/nightly 异步兜底）——这两类弱化"全量即时"保证，按团队风险偏好选，默认不启用。]

## 4. Testing Discipline / 测试纪律（合并门的"牙"，必须硬）
> 整套防偏移/合并门只有在**老功能留下了测试**时才咬得住。下面是硬规则，不是建议。
- Strategy:（如 TDD / 测试金字塔）
- Test framework:
- **每条 AC 必须有对应测试覆盖**（无测试的 AC 视为未完成）。
- **测试相称性（防过度测试，硬规则）：覆盖不减，但"怎么覆盖"必须相称、复用优先。** "每条 AC 有测试覆盖" **≠** "每条 AC 一个新测试类"——后者会让 10 行小改长出七八个测试类，既臃肿又拖慢合并门。落地铁律：
  - **复用优先**：改的是已覆盖区域 → **往已有测试类加测试方法**，不新起类；只有全新模块才建新测试类。
  - **最轻够用层级**：能单测覆盖的逻辑就用单测，别动辄上集成测试（重容器集成测试尤其贵——见 §3 合并门性能）。按测试金字塔：单测多、集成测试少而精。
  - **一类覆多 AC**：相关的多条 AC 共用一个测试类 / 参数化用例，不是一 AC 一类。
  - **相称**：测试的"重量与数量"应与改动的**风险/大小**匹配；小改 → 聚焦少量测试，不是铺一套。
- **每个功能合并前必须留下回归测试**——它们就是未来防别人改坏你的护栏。
- **覆盖率门槛:** [如 行覆盖 ≥ 80%；纳入合并门，不达标禁止合并]
- ❌ 不得删除/跳过/弱化既有测试来"让它过"。

## 5. AI Guardrails / AI 红线
> Claude 在本项目中**必须遵守**的硬性约束。
- 永远不做：（如 不引入未在宪法中列出的依赖、不删除测试、不绕过类型检查）
- 永远要做：（如 改动必须可追溯到某条 requirement、破坏性操作先确认）

## 6. Definition of Done / 完成标准
- **任务级**：§3 的 Format / Lint / Typecheck / 本任务相关 Test 全过 + 满足对应 AC + 文档/规格已更新。
- **功能级（合并门）**：合并到主干前，§3 Merge gate 全绿——**全量测试 + fitness 检查**，确保没改坏任何已有功能（防全局偏移）。

## 7. Stacks & Skills / 能力包与注入技能
> 声明本项目覆盖哪些开发领域（注入对应能力包），以及要注入的 Claude Code skill。详见 specs/stacks/*.md。
**Active stacks（领域能力包）:** [待 /sdd:stack add 选择，如 server, database, h5]
**Injected skills（注入技能）:** [可选，如 anthropic-skills:xlsx]

## 8. Workflow / 重型编排（默认允许编排器自选，可选禁用）
> `/sdd:implement` 的编排器**默认可按任务结构自行决定**是否用 Claude Code Workflow 跑确定性编排（多波次/高并行时更快更确定，但更费 token）。无需 ultracode、无需手动开关。**若本项目要一律禁用 Workflow**（成本敏感、或要求编排完全可读可控），把下面 `禁用 Workflow` 设为 `是`，则一律走提示词编排。
- **禁用 Workflow:** 否（默认允许编排器按需自选；改 `是` 则一律提示词编排）
- **允许阶段:** implement（目前仅此）
- **并发/预算上限:** [可选，如 整 run token 上限]

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
