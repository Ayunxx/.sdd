# Stack Pack: miniprogram / 小程序

## 1. 默认技术栈 / Default Stack
- 平台: 微信小程序原生（或 Taro / uni-app 跨端）
- 语言: TypeScript + WXML/WXSS（Taro 则 React/Vue 语法）
- 关键: 分包加载、云开发/自建后端二选一、订阅消息

## 2. 目录布局约定 / Layout Conventions
```
src/
├── pages/<page>/      # 每页一目录：.wxml/.wxss/.ts/.json
├── components/         # 自定义组件
├── subpackages/        # 分包（按业务域）
├── services/           # 请求封装(wx.request)、本地存储
└── app.ts / app.json   # 全局入口与页面注册
```

## 3. Boundary 拆分模式 / Parallelization Patterns ⭐
- 天然可并行：**按页面(page)切**、按自定义组件切、按分包(subpackage)切——各页/组件目录互不重叠。
- 易冲突共享文件：`app.json`（页面/分包注册）、`app.ts`、全局 store、tabBar 配置。
- 推荐 Boundary：一个任务 = 一个 page 目录或一个组件；`app.json` 注册集中到收尾串行任务。

## 4. 测试策略 / Testing
- 逻辑层用 miniprogram-simulate / 单测；UI 用开发者工具真机预览核对。
- 多数交互列为"需真机/模拟器验证"，在 verify 阶段实跑。

## 5. 领域红线与常见坑 / Red Lines & Pitfalls
- ❌ 包体超限（主包 2MB、总包 20MB）；❌ 未配置的域名直接请求（request 合法域名白名单）。
- ⚠️ setData 频繁/大数据卡顿、登录态(code2session)流程、授权弹窗时机、分包预下载、审核合规（用户隐私、类目）。

## 6. 验收要点 / Acceptance Focus
- 包体与分包是否合规、域名白名单、登录授权链路、setData 性能、真机多机型表现、平台审核红线。
