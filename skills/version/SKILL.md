---
description: 版本 / Show the installed SDD plugin version and where it's installed. 查看当前 SDD 插件的版本号、安装位置与本版要点。
disable-model-invocation: true
allowed-tools: Read, Bash(cat *), Bash(ls *)
---

# /sdd:version — 查看当前 SDD 版本

报告当前安装的 SDD 插件版本，**只读、不改任何文件**。

## 执行步骤

1. **定位并读取插件清单 `plugin.json`**（取 `name`/`displayName`/`version`/`description`）。按优先级找：
   1. `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`（插件运行时根，最准）；
   2. 当前仓库的 `.claude-plugin/plugin.json`（用 `--plugin-dir` 开发时）；
   3. Claude Code marketplace 缓存中当前启用的 `sdd` 插件目录（只在前两项不可用时查，不能凭目录名猜版本）。
   - 三处都读不到 → 如实说"未找到 plugin.json，无法确定版本"，并提示检查插件是否正确安装，**不要瞎猜版本号**。

2. **（可选）读 README 取本版要点**：若同目录能找到 `README.md`，扫它的能力段标记（形如 `（vX.Y…）` 的小标题）作为"本版包含的能力"摘要。读不到就跳过，不报错。

3. **渲染**（直接在对话输出，不写文件）：
```
SDD <version> — <displayName>
安装位置：<读到 plugin.json 的绝对路径>
<description 一行摘要>

本版要点（来自 README 能力段，如有）：
- commit-msg 硬门禁（v0.23）…
- delta 归档到源 / plan 设计模式选型（v0.23）…
- （其它 vX.Y 标记…）
```

4. **收尾提示**（一行）：版本号定义在 `.claude-plugin/plugin.json`；更新或修改 skills/agents/hooks 后需 `/reload-plugins` 或重启才生效。

## 纪律
- ✅ 只读：绝不修改 `plugin.json` 或任何文件（改版本号是发布动作，不在本命令职责内）。
- ✅ 版本号**以实际读到的 `plugin.json` 为准**，绝不凭记忆或对话上下文报版本。
- ❌ 读不到清单就老实说不知道，不要编一个版本号。
