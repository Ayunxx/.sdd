# Stack Pack: server / 服务端

## 1. 默认技术栈 / Default Stack
- Language/Runtime: Node.js 20 + TypeScript（或按宪法：Go / Java Spring / Python FastAPI）
- Framework: Express / NestJS / Fastify
- 关键库: zod(校验), pino(日志), jsonwebtoken, bcrypt
- 构建/包管理: pnpm / tsup

## 2. 目录布局约定 / Layout Conventions
```
src/
├── routes/        # HTTP 端点，薄
├── services/      # 业务逻辑，可单测
├── models/        # 数据访问
├── middleware/    # 鉴权、校验、错误处理
├── db/migrations/ # 迁移脚本
└── config.ts
tests/{contract,unit,integration}/
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- 天然可并行：**按端点/资源切**（每个 route 文件 + 对应 service 一组）、按 model、按 migration、各自的测试文件。
- 易冲突共享文件：`app.ts`/路由注册入口、全局 `config`、共享 `error-handler`、同一个 `service` 文件被多功能改。
- 推荐 Boundary：一个任务 = 一个 service 或一个 route 文件 + 它的测试；路由注册集中到一个收尾任务串行做。

## 4. 测试策略 / Testing
- contract(supertest 打接口) + unit(service 纯逻辑) + integration(连真库)。
- 先写 contract 测试并确认 FAIL，再实现。
- 新增/改变公共 API、鉴权或历史缺陷时，contract/integration 回归测试必须持久化；curl/httpie 只作补充诊断证据，不能替代长期契约保护。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 密码/密钥明文；❌ SQL 拼接（用参数化）；❌ 把业务逻辑塞进 route。
- ⚠️ N+1 查询、缺索引、错误响应泄露内部信息、未校验输入直接落库。

## 6. 验收要点 / Acceptance Focus
- 每个端点的鉴权与权限边界、入参校验、错误码语义、幂等性、并发安全。

## 7. 本层质量门禁 / Layer Quality Gate
- Format: `pnpm exec prettier --write -- <本任务 Boundary 中实际改动的 .ts 文件...>`（显式 argv，禁止并发 worker 扫写整个 `apps/server`）
- Lint / Typecheck: `pnpm exec eslint -- <本任务改动的 .ts 文件...>` · `pnpm --filter server exec tsc --noEmit --incremental false`
- Test: `pnpm --filter server test -- <受影响测试...>`
- Isolation: 每任务使用唯一测试 DB/schema、端口、缓存与临时目录；无法隔离的迁移/包级 fixer 标 `Gate isolation: wave-exclusive`，在 Wave checkpoint 串行运行。
