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
> 风格一致性靠确定性工具强制，不靠 AI 自觉——本框架用隔离子代理并行实现，风格漂移只能由**统一工具**抹平。下列是**全局默认**命令，会被 implementer 报告前自跑（全部）、合并门取其中的**编译/类型检查**核验（不跑测试）、可选 hook 实时执行。填具体命令，别留空话。
> ＊全栈 monorepo 各层（包）命令不同时，可在对应能力包 `specs/stacks/<domain>.md §7 本层门禁` 声明覆盖本默认。
- **Format（格式化）:** [如 `prettier --write .` / `ruff format .` / `gofmt -w .`]
- **Lint:** [如 `eslint .` / `ruff check .` / `golangci-lint run`]
- **Typecheck:** [如 `tsc --noEmit` / `mypy .`；无则 N/A]
- **Test（一次性自验，实现时用——验完即删，不留代码库）:** [如 `npm test`（含范围）/ `pytest tests/<mod>` / `mvn -pl <module> -am test`。实现某功能时写测试当场验证"这块写对了"，**验证通过即删除**、不提交进代码库（见 §4）]
> ⚠️ **门分两层、别混**：上面的 Test 是【实施终端】实现时的**一次性自验**（写来验证功能写对、验完即删）；下面的 **Merge gate 是【主终端】`/sdd:worktree finish` 专属的门——只编译改动过的模块 + 架构 fitness，不跑测试、不跑全量**。**实施终端不必跑合并门**——那是 finish 的事。
- **Config 文件:** [.editorconfig · 格式化/lint 配置 · `.gitattributes`（统一换行 LF/CRLF）]
- **Error handling / Logging:** [统一约定]
- **Maintainability（可维护性规则）:** [命名约定 · 单函数行数/圈复杂度上限 · DRY 禁重复、复用优先 · 分层与依赖方向 · 公共 API 注释要求]
- **注释 / 标识符语言（Comment & identifier language）:** [显式钉死注释用哪种语言，否则隔离子代理默认写英文注释。如「注释用中文、标识符用英文」/「全英文」/「跟随现有代码库」。**生成本宪法时按已有代码库的实际注释语言探测填入；新项目无既有代码则询问用户后填，别留空**]
- **Architecture fitness（架构适应度函数，自动守架构）:** [如 dependency-cruiser/import-linter 守依赖方向与禁止 import · eslint-boundaries 守分层 · jscpd 重复率阈值（如 >5% 失败）· 复杂度上限。架构靠工具守，不靠记忆——防后期侵蚀]
- **Merge gate（合并门）:** [合并到主干前只做两件事：① 对**改动过的模块**跑编译（含该语言的类型检查），**编译通过**即放行；② 上面的架构 fitness 全绿。**不跑测试**（测试是一次性的、实现时验完即删，见 §4）、不跑全量、不碰未改模块。填一条"只编译改动模块"的命令，如 Maven `-pl <changed> -am compile`、Gradle `:<mod>:compileJava`、`tsc --noEmit`（改动包）]
- **Merge gate 适用范围（按"是否入 main"判，不按功能大小）:** [**凡经 `/sdd:worktree finish` 合并进 main 的都必走合并门——含 lite**。理由：合并门防的是"把 main 编译搞坏 / 架构侵蚀"，与功能大小无关（改一行公共代码也能让全局编译不过）。**不按 lite/full 豁免**；成本本就低——只编译改动模块 + 静态 fitness，小改很快。**唯一近乎免门**：纯非代码改动（docs/注释）。Trivial 跳过 SDD 的直接改**不经 finish 故无门**，靠下个 feature 的合并门 + CI + commit-msg hook 兜底；若 trivial 碰了共享代码，应升级到 lite 走门。]
- **Merge gate 性能（一般不成瓶颈）:** [只编译改动模块 + 静态 fitness，成本随改动范围自然伸缩、通常很快。若单模块编译仍慢，可用构建缓存/并行加速编译本身：Maven `-T 1C`+`maven-build-cache-extension`、Gradle `--parallel --build-cache`、Nx/Turborepo/Bazel 缓存。]

## 4. Testing Discipline / 测试纪律（一次性自验，用完即丢）
> 本项目的测试是**一次性**的：实现某功能时写测试来当场验证"这块写对了"，**验证通过后即删除**，不留在代码库、不作为回归护栏。合并门因此不跑测试（只编译改动模块 + fitness，见 §3）；行为验收由 `/sdd:verify` 在上线前一次性做。下面是硬规则。
- Strategy:（如 实现时先写测试自验 / 手动跑一遍验证 AC；一次性、不追求金字塔留存）
- Test framework:（一次性自验用的框架/工具）
- **实现每个功能/任务时，用测试当场验证每条 AC 写对了**——验完即删，**别提交进代码库**。
- **别过度写（写完就删，多写是浪费）：** 一次性测试写到**够验证当前改动**即可，绝不铺一大套：
  - **最轻够用层级**：能用轻量单测或手动跑一遍验证的，就别上重容器集成测试（Testcontainers 这类又慢又贵，写完还得删，更不划算）。
  - **一处覆多 AC**：相关的多条 AC 用一个测试/参数化一把验掉，不是一 AC 一个测试类。
  - **相称**：测试的重量与数量与改动大小匹配；小改 → 几个聚焦用例验过就删，不是铺一套。
- ❌ 不把一次性测试留在代码库冒充"回归护栏"（本项目不走全量回归那条路）；❌ 不用"跳过/弱化验证"来假装测过。

## 5. AI Guardrails / AI 红线
> Claude 在本项目中**必须遵守**的硬性约束。
- 永远不做：（如 不引入未在宪法中列出的依赖、不绕过类型检查/编译、不擅自改技术方向）
- 永远要做：（如 改动必须可追溯到某条 requirement、破坏性操作先确认）

## 6. Definition of Done / 完成标准
- **任务级**：§3 的 Format / Lint / Typecheck / 编译通过 + 用一次性测试自验满足对应 AC（验完即删）+ 文档/规格已更新。
- **功能级（合并门）**：合并到主干前，§3 Merge gate 全绿——**编译改动模块通过 + fitness 检查**（防架构侵蚀）；行为是否真达成 AC 由 `/sdd:verify` 一次性验证。

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
