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
 * - 节流：同一 HEAD + staged/unstaged/untracked 内容只提醒一次；clean 时清 marker。
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

function gitBuffer(cwd, args, timeout = 10000) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: null,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return null;
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

  const key = crypto.createHash('sha1').update(cwd, 'utf8').digest('hex').slice(0, 16);
  const marker = path.join(os.tmpdir(), `sdd_gate_${key}.txt`);

  // 有未提交改动才提醒；clean checkpoint 让下一轮相同路径改动重新获得提醒。
  const porcelainBuffer = gitBuffer(cwd, ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (!porcelainBuffer || porcelainBuffer.length === 0) {
    try {
      if (isFile(marker)) fs.unlinkSync(marker);
    } catch (e) {
      // marker 清理失败不影响停止
    }
    allow();
  }

  // 节流签名包含 HEAD、tracked 完整 diff 和每个 untracked 文件的 Git object id。
  // 即使 porcelain 状态文字相同，提交后再次修改或内容继续变化也会再次提醒。
  try {
    const signature = crypto.createHash('sha256');
    signature.update(gitBuffer(cwd, ['rev-parse', 'HEAD']) || Buffer.from('NO_HEAD'));
    signature.update(porcelainBuffer);
    signature.update(gitBuffer(cwd, ['diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD']) || Buffer.from('NO_DIFF'));
    for (const record of porcelainBuffer.toString('utf8').split('\0')) {
      if (!record || !record.startsWith('?? ')) continue;
      const relativePath = record.slice(3);
      signature.update(relativePath, 'utf8');
      signature.update(gitBuffer(cwd, ['hash-object', '--no-filters', '--', relativePath]) || Buffer.from('UNHASHABLE'));
    }
    const sig = signature.digest('hex');
    let last = '';
    if (isFile(marker)) last = fs.readFileSync(marker, 'utf8').trim();
    if (last === sig) allow(); // 这个改动状态已提醒过，不再纠缠
    fs.writeFileSync(marker, sig);
  } catch (e) {
    // 节流失败不影响主流程（最多多提醒一次）
  }

  const reason =
    'SDD 门禁提醒（收工前自检，判断是否适用后再停）：检测到未提交改动。\n' +
    '若改了代码：① 跑 constitution §3 的适用 Format/Lint/Typecheck/Test，并记录实际命令、退出码与摘要；关键契约/安全/历史缺陷等回归测试必须持久化，只有探索/诊断探针可临时清理；' +
    '② 对受影响 AC 跑 /sdd:verify 并补齐 COMPLETION 证据；③ 实现若偏离 design，回填 specs 的 ## Deviations 并 reconcile。\n' +
    '⚠️ **不要在本（feature）终端重复跑合并门**——它是 `/sdd:worktree finish` 在【主终端】的专属职责（改动模块编译 + fitness + 受影响持久测试，并记录被测 SHA）。\n' +
    '已做过、或本次仅改文档/无需门禁 → 直接再次结束即可（本提醒每个改动状态只触发一次，不会纠缠）。';

  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

try {
  main();
} catch (e) {
  allow();
}
