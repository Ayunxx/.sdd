# Stack Pack: pc / PC 桌面与 PC Web

## 1. 默认技术栈 / Default Stack
- 桌面端: Electron / Tauri + React/Vue（或原生 .NET / Qt）
- PC Web: React/Vue + Vite，桌面级布局与快捷键
- 关键: 主进程/渲染进程隔离(Electron)、IPC、自动更新

## 2. 目录布局约定 / Layout Conventions
```
（Electron 示例）
src/
├── main/           # 主进程：窗口、菜单、IPC、系统集成
├── preload/        # 安全桥接
├── renderer/       # 渲染进程 UI（pages/components）
└── shared/         # 类型与常量
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- 天然可并行：**主进程能力 vs 渲染 UI 分离切**、按窗口/页面切、按 IPC 通道切。
- 易冲突共享文件：IPC 通道注册表、主窗口创建、全局菜单、`shared` 类型、自动更新配置。
- 推荐 Boundary：一个任务 = 一个 renderer 页面，或一组相关 IPC handler + preload 暴露；通道注册收尾串行。

## 4. 测试策略 / Testing
- 渲染层组件测试 + 主进程逻辑单测；端到端用 Playwright(Electron)/WebdriverIO。
- 系统集成（托盘、通知、文件对话框）多在 verify 阶段实跑核对。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 渲染进程开 nodeIntegration / 关 contextIsolation（安全红线）；❌ 未签名分发。
- ⚠️ 主/渲染进程通信滥用、内存泄漏、多窗口状态同步、跨平台(win/mac/linux)差异、自动更新回滚。

## 6. 验收要点 / Acceptance Focus
- 进程隔离与 IPC 安全、多窗口/多平台一致性、快捷键与菜单、自动更新、资源占用。
