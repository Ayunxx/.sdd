#!/usr/bin/env python3
"""
SDD 门禁提醒 / Stop hook —— 在 Claude 收工前"唤醒"它跑质量门禁（判断层）。

确定的是【触发】：Stop 事件必触发本脚本；执行仍交给 LLM（命令层硬门禁 = 项目 constitution §3 钉死的 Format/Lint/Typecheck/Test，可用 hooks/hooks.example.json 接成自动门禁）。

安全设计（绝不卡住用户）：
- 仅在 SDD 项目触发（存在 specs/constitution.md）；非 SDD 项目静默放行。
- 仅在有未提交改动时提醒（干净工作树直接放行）。
- 循环安全：stop_hook_active 为真（已提醒过一次）即放行。
- 节流：同一"未提交改动状态"只提醒一次（签名存系统临时目录，按 cwd 区分）。
- 任何异常一律放行（fail-open）——hook 出问题绝不能困住会话。
"""
import sys
import os
import json
import hashlib
import tempfile
import subprocess


def allow():
    # 不输出任何内容 → 允许正常停止
    sys.exit(0)


def git(cwd, *args, timeout=5):
    return subprocess.run(
        ["git", "-C", cwd, *args],
        capture_output=True, text=True, timeout=timeout
    ).stdout.strip()


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        allow()

    # 循环安全：本次停止已被我们拦过一次 → 放行，避免无限拦截
    if data.get("stop_hook_active"):
        allow()

    cwd = data.get("cwd") or os.getcwd()

    # 仅 SDD 项目（有 specs/constitution.md，cwd 或 git 根）才管
    try:
        is_sdd = os.path.isfile(os.path.join(cwd, "specs", "constitution.md"))
        if not is_sdd:
            root = git(cwd, "rev-parse", "--show-toplevel")
            is_sdd = bool(root) and os.path.isfile(os.path.join(root, "specs", "constitution.md"))
    except Exception:
        allow()
    if not is_sdd:
        allow()

    # 有未提交改动才提醒
    try:
        porcelain = git(cwd, "status", "--porcelain")
    except Exception:
        allow()
    if not porcelain:
        allow()

    # 节流：同一改动状态只提醒一次
    try:
        key = hashlib.sha1(cwd.encode("utf-8")).hexdigest()[:16]
        sig = hashlib.sha1(porcelain.encode("utf-8")).hexdigest()
        marker = os.path.join(tempfile.gettempdir(), f"sdd_gate_{key}.txt")
        last = ""
        if os.path.isfile(marker):
            with open(marker, "r", encoding="utf-8") as f:
                last = f.read().strip()
        if last == sig:
            allow()  # 这个改动状态已提醒过，不再纠缠
        with open(marker, "w", encoding="utf-8") as f:
            f.write(sig)
    except Exception:
        pass  # 节流失败不影响主流程（最多多提醒一次）

    reason = (
        "SDD 门禁提醒（收工前自检，判断是否适用后再停）：检测到未提交改动。\n"
        "若改了代码：① 跑 constitution §3 的 Format/Lint/Typecheck/Test，任一不过先修；"
        "② 对受影响的 AC 跑 /sdd:verify；③ 实现若偏离了 design，回填 specs 的 ## Deviations 并 reconcile。\n"
        "已做过、或本次仅改文档/无需门禁 → 直接再次结束即可（本提醒每个改动状态只触发一次，不会纠缠）。"
    )
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        allow()
