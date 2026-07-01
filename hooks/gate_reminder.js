#!/usr/bin/env node
/*
 * SDD 门禁提醒 / Stop hook —— 在 Claude 收工前"唤醒"它跑质量门禁（判断层）。
 *
 * 确定的是【触发】：Stop 事件必触发本脚本；执行仍交给 LLM（命令层硬门禁 = 项目 constitution §3 钉死的 Format/Lint/Typecheck/Test，可用 hooks/hooks.example.json 接成自动门禁）。
 *
 * 安全设计（绝不卡住用户）：
 * - 仅在 SDD 项目触发（存在 specs/constitution.md）；非 SDD 项目静默放行。
 * - 仅在有未提交改动时提醒（干净工作树直接放行）。
 * - 循环安全：stop_hook_active 为真（已提醒过一次）即放行。
 * - 节流：同一"未提交改动状态"只提醒一次（签名存系统临时目录，按 cwd 区分）。
 * - 任何异常一律放行（fail-open）——hook 出问题绝不能困住会话。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function allow() {
  // 不输出任何内容 → 允许正常停止
  process.exit(0);
}

function git(cwd, args, timeout = 5000) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    return '';
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

function main() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    allow();
  }

  // 循环安全：本次停止已被我们拦过一次 → 放行，避免无限拦截
  if (data.stop_hook_active) allow();

  const cwd = data.cwd || process.cwd();

  // 仅 SDD 项目（有 specs/constitution.md，cwd 或 git 根）才管
  let isSdd = isFile(path.join(cwd, 'specs', 'constitution.md'));
  if (!isSdd) {
    const root = git(cwd, ['rev-parse', '--show-toplevel']);
    isSdd = !!root && isFile(path.join(root, 'specs', 'constitution.md'));
  }
  if (!isSdd) allow();

  // 有未提交改动才提醒
  const porcelain = git(cwd, ['status', '--porcelain']);
  if (!porcelain) allow();

  // 节流：同一改动状态只提醒一次
  try {
    const key = crypto.createHash('sha1').update(cwd, 'utf8').digest('hex').slice(0, 16);
    const sig = crypto.createHash('sha1').update(porcelain, 'utf8').digest('hex');
    const marker = path.join(os.tmpdir(), `sdd_gate_${key}.txt`);
    let last = '';
    if (isFile(marker)) last = fs.readFileSync(marker, 'utf8').trim();
    if (last === sig) allow(); // 这个改动状态已提醒过，不再纠缠
    fs.writeFileSync(marker, sig);
  } catch (e) {
    // 节流失败不影响主流程（最多多提醒一次）
  }

  const reason =
    'SDD 门禁提醒（收工前自检，判断是否适用后再停）：检测到未提交改动。\n' +
    '若改了代码：① 跑 constitution §3 的 Format/Lint/Typecheck + **本功能/本任务相关的测试**（能按改动范围跑就别跑全量）；' +
    '② 对受影响的 AC 跑 /sdd:verify（功能级行为验证，非全量回归）；③ 实现若偏离了 design，回填 specs 的 ## Deviations 并 reconcile。\n' +
    '⚠️ **不要在本（feature）终端跑全量回归/合并门**——那是 `/sdd:worktree finish` 在【主终端】的专属职责（跨功能全量 + fitness）。在这里跑全量只是把 finish 的活提前到错的地方、白白拖慢实施终端。\n' +
    '已做过、或本次仅改文档/无需门禁 → 直接再次结束即可（本提醒每个改动状态只触发一次，不会纠缠）。';

  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

try {
  main();
} catch (e) {
  allow();
}
