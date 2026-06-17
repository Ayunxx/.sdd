#!/usr/bin/env python3
"""
SDD 多终端心跳上报 / status writer hook —— 每个终端自动把"在做哪个 feature、第几个任务、忙还是闲"写到
共享 .git 下的一份 per-terminal 文件，供 /sdd:status 聚合成实时看板。零 LLM、纯写、绝不阻塞。

触发（每回合，不是每工具——避免 PostToolUse 给每次调用平添进程开销）：
- SessionStart   → 注册本终端（status=idle）
- UserPromptSubmit → status=working
- Stop           → status=idle
状态字串由命令行第 1 个参数给出（working|idle）。

存储（满足"运行时、不提交"且按项目隔离）：
- 写到 `<git-common-dir>/sdd-runtime/<branch>.json`。所有 worktree 共享同一个 .git，故各终端天然读得到彼此；
  .git 不被版本库跟踪 → 自动不提交、不进历史、不造合并冲突。
- 一终端一文件（key=分支），各写各的 → 零写竞态（这是绕开"多终端同写一文件"竞态的关键）。
- 非 git 仓库则回退系统临时目录（按 cwd 区分）。

安全设计（fail-open）：
- 不在 `sdd/*` 分支（或非 SDD 项目）→ 立刻空跑退出，对非 SDD 会话零影响。
- 任何异常一律静默退出 0——上报失败绝不能拖累/卡住会话。
- 心跳是尽力而为的【可观测性】，不是协调/加锁机制：协调仍靠 git 分支占号 + Boundary。
"""
import sys
import os
import json
import re
import hashlib
import tempfile
import subprocess
from datetime import datetime


def done():
    sys.exit(0)


def git(cwd, *args, timeout=5):
    return subprocess.run(
        ["git", "-C", cwd, *args],
        capture_output=True, text=True, timeout=timeout
    ).stdout.strip()


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def derive_phase(feature_dir):
    """按 specs/<feature>/ 里有哪些产物推导当前阶段（粗粒度，够看板用）。"""
    if os.path.isfile(os.path.join(feature_dir, "COMPLETION.md")):
        return "verified"
    if os.path.isfile(os.path.join(feature_dir, "tasks.md")):
        return "implement"
    if os.path.isfile(os.path.join(feature_dir, "design.md")):
        return "plan"
    if os.path.isfile(os.path.join(feature_dir, "requirements.md")):
        return "specify"
    if os.path.isfile(os.path.join(feature_dir, "spec.md")):
        return "lite"
    return "init"


def parse_tasks(feature_dir):
    """从 tasks.md / spec.md 取 Progress 与第一个未勾选任务 ID（best-effort）。"""
    text = read_text(os.path.join(feature_dir, "tasks.md")) or read_text(
        os.path.join(feature_dir, "spec.md")
    )
    progress = None
    m = re.search(r"Progress:\s*([0-9]+)\s*/\s*([0-9]+)", text)
    if m:
        progress = f"{m.group(1)}/{m.group(2)}"
    current = None
    cm = re.search(r"^\s*-\s*\[\s*\]\s*\*{0,2}(T[0-9A-Za-z.\-]+)", text, re.MULTILINE)
    if cm:
        current = cm.group(1)
    return progress, current


def runtime_dir(cwd):
    """共享 .git 下的 sdd-runtime/；非 git 仓库回退临时目录。"""
    common = git(cwd, "rev-parse", "--git-common-dir")
    if common:
        if not os.path.isabs(common):
            common = os.path.abspath(os.path.join(cwd, common))
        d = os.path.join(common, "sdd-runtime")
    else:
        key = hashlib.sha1(cwd.encode("utf-8")).hexdigest()[:12]
        d = os.path.join(tempfile.gettempdir(), "sdd-runtime", key)
    os.makedirs(d, exist_ok=True)
    return d


def main():
    status = sys.argv[1] if len(sys.argv) > 1 else "working"

    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    cwd = data.get("cwd") or os.getcwd()

    # workflow/子代理侦测：PostToolUse 看到 Workflow/Task/Agent 工具 = 本终端进入"委派"长任务，打标兜底。
    # 双层保险：① 插件 hook 会在【子代理上下文】里运行（文档确认，带子代理自己的 cwd）——子代理在本 worktree
    # 调工具时，其 PostToolUse 会拿同一 sdd/NNN 分支刷新同一心跳文件，心跳不停更（主路径，会把下面的
    # delegating 覆盖回 working，更准）。② 万一子代理在别的分支/detached（worktree 隔离）或不跑 hook，
    # 就靠这里的 delegating 标 + /sdd:status 不判死兜底。两种情况都不漏。
    tool_name = data.get("tool_name", "") or ""
    if status == "working" and tool_name in ("Workflow", "Task", "Agent"):
        status = "delegating"

    # 硬门控：只在 sdd/* 分支上报，其它一律空跑退出（对非 SDD 会话零影响）。
    try:
        branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD")
    except Exception:
        done()
    if not branch.startswith("sdd/"):
        done()

    feature = branch[len("sdd/"):]

    # tasks/progress 从【主工作树】的 specs/<feature>/ 读（编码进 worktree，但规格仍在主目录 specs/）。
    # 这里就近用 cwd 下的 specs/<feature>/；读不到则字段留空，不报错。
    feature_dir = os.path.join(cwd, "specs", feature)
    phase = derive_phase(feature_dir)
    progress, current = parse_tasks(feature_dir)

    record = {
        "branch": branch,
        "feature": feature,
        "cwd": cwd,
        "phase": phase,
        "progress": progress,
        "currentTask": current,
        "status": status,
        "lastActivity": datetime.now().isoformat(timespec="seconds"),
    }

    try:
        d = runtime_dir(cwd)
        safe = branch.replace("/", "_").replace("\\", "_")
        with open(os.path.join(d, safe + ".json"), "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False)
    except Exception:
        pass  # 写失败静默——心跳尽力而为，绝不拖累会话

    done()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        done()
