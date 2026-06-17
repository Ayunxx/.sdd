---
description: 能力注入 / Manage domain capability packs (stacks) and injected skills for a project. 列出/添加/新建领域能力包（server/database/mobile/miniprogram/h5/pc/fullstack），把领域约定注入 SDD 流程，覆盖全栈各端开发。
argument-hint: "list | add <领域...> | new <自定义名> | skill <skill名...>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(ls *), Bash(cat *)
---

# /sdd:stack — 领域能力包 & Skill 注入

让这套 SDD 按项目形态注入领域知识，覆盖全栈/移动端/小程序/H5/PC/服务端/数据库。注入的能力会在 `/sdd:plan`（按约定设计）、`/sdd:tasks`（按 Boundary 模式切分提升并发）、`/sdd:implement`（喂给隔离子代理）中被引用。

## 用户输入
$ARGUMENTS

## 内置能力包（catalog）
`server` · `database` · `mobile` · `miniprogram` · `h5` · `pc` · `fullstack`
（源文件在插件 `stacks/<name>.md`；`fullstack` 是组合包，需配合 server/database + 一个前端包）

## 子命令

### `list`
列出：① 内置 catalog 7 个包；② 本项目已激活的包（读 `specs/stacks/*.md` 与宪法 `## Stacks & Skills` 段）。

### `add <领域...>`（最常用）
把一个或多个内置包**落地到项目**并登记：
1. 定位 catalog 源：依次尝试 `${CLAUDE_PLUGIN_ROOT}/stacks/<name>.md` → 插件安装目录 → 当前 `.sdd/stacks/`。**找不到源**就按 `_TEMPLATE.md` 的结构，用你的领域知识**现场生成**一份高质量的 `<name>.md`（内容要是"可照做的约定"，参考内置包风格）。
2. 写入项目 `specs/stacks/<name>.md`（已存在则询问是否覆盖/合并）。
3. 在 `specs/constitution.md` 的 `## Stacks & Skills` 段登记该包（无此段则创建）。
4. 提醒：默认技术栈可在宪法里覆盖；可继续 `/sdd:plan`。

### `new <自定义名>`（注入新能力的入口）
按 `_TEMPLATE.md` 结构在 `specs/stacks/<名>.md` 生成一个**空白能力包骨架**，引导用户/你填入该领域的：默认栈、目录布局、**Boundary 拆分模式**、测试策略、红线、验收要点。填好即成为可注入的新领域。

### `skill <skill名...>`
登记要**注入的 Claude Code skill**（含第三方或自建，如 `anthropic-skills:xlsx`、`my-api-conventions`）到宪法 `## Stacks & Skills` 的 Skills 列表。这些 skill 会在实现期由编排器告知 implementer 子代理按需调用。

## 宪法登记格式（写入/更新 `specs/constitution.md`）
```markdown
## Stacks & Skills / 能力包与注入技能
**Active stacks（领域能力包）:** server, database, h5
> 详见 specs/stacks/*.md；各层默认技术栈可在 §1 覆盖。
**Injected skills（注入技能）:** anthropic-skills:xlsx
> implementer 子代理在相关任务中按需调用。
```

## 纪律
- ❌ 本命令只管理能力包与注入登记，不写功能代码、不做设计。
- ✅ 落地的包是**项目可改的**——鼓励用户按团队规范微调 `specs/stacks/*.md`。
- ✅ 生成包内容时务必填实"Boundary 拆分模式"——它直接决定 `/sdd:tasks` 的并发质量。
