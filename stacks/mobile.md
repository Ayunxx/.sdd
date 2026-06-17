# Stack Pack: mobile / 移动端

## 1. 默认技术栈 / Default Stack
- 跨平台: React Native / Flutter / Expo（或原生 iOS Swift+SwiftUI、Android Kotlin+Compose）
- 状态管理: Redux Toolkit / Riverpod / Zustand
- 网络: 统一 API client（拦截器处理 token/重试）

## 2. 目录布局约定 / Layout Conventions
```
src/
├── screens/        # 页面（每屏一目录）
├── components/      # 复用组件
├── navigation/      # 路由/导航
├── services/        # API、本地存储
├── store/           # 全局状态
└── hooks/
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- 天然可并行：**按屏幕(screen)切**、按独立组件切、按 service 切——各自目录 = 不重叠 Boundary。
- 易冲突共享文件：`navigation` 路由表、`store` 根 reducer/入口、主题/全局样式、`App.tsx`。
- 推荐 Boundary：一个任务 = 一个 screen 目录或一个组件；导航注册、store 挂载放收尾串行任务。

## 4. 测试策略 / Testing
- 组件测试(RNTL / flutter test) + 关键逻辑单测 + 必要的 e2e(Detox/Maestro)。
- 无设备时：用快照/渲染测试核对，UI 行为列为"仅静态核查"并说明。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 密钥硬编码进包；❌ 阻塞主线程的重计算。
- ⚠️ 平台差异(iOS/Android)、键盘/安全区/刘海适配、列表性能、深链接、权限申请时机、离线态。

## 6. 验收要点 / Acceptance Focus
- 双平台一致性、不同屏幕尺寸适配、弱网/离线表现、导航回退栈、内存与帧率。
