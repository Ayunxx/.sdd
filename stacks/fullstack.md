# Stack Pack: fullstack / 全栈

> 元能力包：一个功能跨"前端 + 服务端 + 数据库"端到端时启用。它**组合** [server](server.md) / [database](database.md) 与某个前端包（[h5](h5.md) / [mobile](mobile.md) / [miniprogram](miniprogram.md) / [pc](pc.md)），并补充跨层约定。
> 用法：`/sdd:stack add fullstack server database h5`（按实际前端形态选一个前端包）。

## 1. 默认技术栈 / Default Stack
- 端到端类型安全：共享类型/契约层（OpenAPI 或 tRPC / 共享 TS types）
- 仓库形态: monorepo（pnpm workspaces / turborepo）或前后端分仓
- 其余各层默认见对应子包

## 2. 目录布局约定 / Layout Conventions
```
apps/
├── web|mobile|miniprogram|pc/   # 前端（见对应包）
└── server/                      # 服务端（见 server 包）
packages/
└── shared/                      # 跨端共享类型与 API 契约 ⭐
db/migrations/                   # 数据库（见 database 包）
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- **分层并行**：契约/共享类型先定（地基，单独任务），之后**服务端实现**与**前端对接**可在不同 app 目录并行（Boundary 天然不重叠）。
- **垂直切片**：按业务功能纵向切（一个功能的 db+api+ui 各一任务），跨层但文件领地不重叠 → 不同 app/层可并行。
- 易冲突共享文件：`packages/shared` 契约文件（建议先冻结、改动集中）、根配置、CI。
- 推荐：Wave 1 定契约/建表 → Wave 2 服务端与前端并行 → Wave 3 联调与端到端验证。

## 4. 测试策略 / Testing
- 各层按其子包策略；额外加**端到端测试**贯穿前端→API→DB。
- 契约层用 schema 校验/类型检查保证前后端不脱节（防偏移关键）。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 前后端各改契约不同步；❌ 跨层硬编码导致接口漂移。
- ⚠️ CORS、鉴权 token 在各端的存取、环境变量贯通、版本兼容、数据形态在边界处的转换。

## 6. 验收要点 / Acceptance Focus
- 契约一致性（前后端类型对齐）、端到端链路打通、各层边界的错误传播、鉴权贯通。
