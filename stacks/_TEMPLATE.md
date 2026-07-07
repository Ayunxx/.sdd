# Stack Pack: <领域名>

> **能力包（Stack Pack）模板**。复制本文件、改名为 `<your-domain>.md` 即可注入一个新领域能力。
> 被 `/sdd:plan`（按约定设计）、`/sdd:tasks`（按 Boundary 模式切分）、`/sdd:implement`（喂给隔离子代理）引用。
> 内容要"约定"而非"教程"——给 AI 可直接照做的领域规则。

## 1. 默认技术栈 / Default Stack
> 可被项目 `constitution.md` 覆盖；这里给该领域的合理默认。
- Language / Runtime:
- Framework:
- 关键库 / 工具:
- 构建 / 包管理:

## 2. 目录布局约定 / Layout Conventions
> 该领域的标准文件结构，让设计与任务落点一致。
```
（典型目录树）
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
> 本节直接服务"波次并发"：如何把该领域的工作切成**文件领地不重叠**的任务，最大化可并行度。
- 天然可并行的切分维度：（如 按页面 / 按接口 / 按模块 / 按表）
- 易冲突的共享文件（需串行或独占）：（如 路由注册表 / 全局配置 / store 入口）
- 推荐 Boundary 粒度：

## 4. 测试策略 / Testing
- 测试类型与框架:
- 该领域"先红后绿"如何落地:
- 验证手段（无自动化测试时）:

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 绝不做：
- ⚠️ 常见坑：

## 6. 验收要点 / Acceptance Focus
> 这个领域**特别**要验什么（喂给 implementer 自验 / `/sdd:verify`）。
- 

## 7. 本层质量门禁 / Layer Quality Gate（可选，覆盖 constitution §3 默认）
> 全栈 monorepo 各层（包）命令不同时，在此声明**本层**的门禁命令；implementer 处理属于本层的任务时用这套，而非全局默认。未声明则回退到 §3。
- Format: [如 仅本包 `pnpm --filter web format`]
- Lint / Typecheck: [本包的 lint/类型检查]
- Test: [本包的测试命令]
