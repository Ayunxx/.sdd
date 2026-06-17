# Stack Pack: database / 数据库

## 1. 默认技术栈 / Default Stack
- 引擎: PostgreSQL 16（或按宪法 MySQL 8 / SQLite）
- 迁移工具: 原生 SQL 迁移 / Prisma / Flyway / golang-migrate
- 约定: 每次变更一支前向迁移 + 可回滚脚本

## 2. 目录布局约定 / Layout Conventions
```
db/
├── migrations/NNN_<change>.sql   # 一次变更一个文件，编号递增
├── seeds/                        # 种子数据
└── schema.sql                    # 当前快照（自动生成）
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- 天然可并行：**互不依赖的表/迁移可并行写**（不同 migration 文件 = 不同 Boundary）；seed 数据按表分文件。
- 易冲突共享文件：`schema.sql` 快照、同一张表的多个变更、外键依赖链。
- 推荐 Boundary：一个任务 = 一支迁移文件；有外键依赖的表按 Depends 串行（先父表后子表）。

## 4. 测试策略 / Testing
- 迁移可正向执行 + 可回滚；约束（唯一/外键/非空）有针对性测试。
- 用一次性测试库跑迁移，校验最终 schema 与预期一致。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 生产库直接改表不留迁移；❌ 破坏性变更（drop/改类型）不先确认、不备份。
- ⚠️ 缺索引致慢查询、缺唯一约束致脏数据、时区/字符集不统一、大表加列锁表。

## 6. 验收要点 / Acceptance Focus
- 约束是否真正生效、索引是否覆盖查询、迁移幂等/可回滚、向后兼容。
- ⚠️ 任何 drop/alter 列、跑迁移属破坏性操作，实现期必须先向用户确认。

## 7. 本层质量门禁 / Layer Quality Gate
- Lint: `sqlfluff lint db/migrations`（SQL 风格统一）
- Test: 在一次性测试库上跑全部迁移 + 校验最终 schema（如 `make db-test`）
