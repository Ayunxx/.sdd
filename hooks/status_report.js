#!/usr/bin/env node
/*
 * SDD 多终端心跳上报 / status writer hook —— 每个终端自动把"在做哪个 feature、第几个任务、忙还是闲"写到
 * 共享 .git 下的一份 per-terminal 文件，供 /sdd:status 聚合成实时看板。零 LLM、纯写、绝不阻塞。
 *
 * 触发（每回合，不是每工具——避免 PostToolUse 给每次调用平添进程开销）：
 * - SessionStart   → 注册本终端（status=idle）
 * - UserPromptSubmit → status=working
 * - Stop           → status=idle
 * 状态字串由命令行第 1 个参数给出（working|idle）。
 *
 * 存储（满足"运行时、不提交"且按项目隔离）：
 * - 写到 `<git-common-dir>/sdd-runtime/<branch>-<session-key>.json`。所有 worktree 共享同一个 .git，故各终端天然读得到彼此；
 *   .git 不被版本库跟踪 → 自动不提交、不进历史、不造合并冲突。
 * - 一会话一文件（key=branch+session_id/transcript），同分支多终端不互相覆盖；单文件用 temp+rename 原子发布。
 * - 非 git 仓库则回退系统临时目录（按 cwd 区分）。
 *
 * 安全设计（fail-open）：
 * - 不在 `sdd/*` 分支（或非 SDD 项目）→ 立刻空跑退出，对非 SDD 会话零影响。
 * - 任何异常一律静默退出 0——上报失败绝不能拖累/卡住会话。
 * - 心跳是尽力而为的【可观测性】，不是协调/加锁机制：协调仍靠 git 分支占号 + Boundary。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function done() {
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

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
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

// 按 specs/<feature>/ 里有哪些产物推导当前阶段（粗粒度，够看板用）。
function derivePhase(featureDir) {
  if (isFile(path.join(featureDir, 'COMPLETION.md'))) return 'verified';
  if (isFile(path.join(featureDir, 'tasks.md'))) return 'implement';
  if (isFile(path.join(featureDir, 'design.md'))) return 'plan';
  if (isFile(path.join(featureDir, 'requirements.md'))) return 'specify';
  if (isFile(path.join(featureDir, 'spec.md'))) return 'lite';
  return 'init';
}

// 从 tasks.md / spec.md 取 Progress 与第一个未勾选任务 ID（best-effort）。
function parseTasks(featureDir) {
  const text =
    readText(path.join(featureDir, 'tasks.md')) ||
    readText(path.join(featureDir, 'spec.md'));
  let progress = null;
  const m = text.match(/Progress:\s*([0-9]+)\s*\/\s*([0-9]+)/);
  if (m) progress = `${m[1]}/${m[2]}`;
  let current = null;
  const cm = text.match(/^\s*-\s*\[\s*\]\s*\*{0,2}(T[0-9A-Za-z.\-]+)/m);
  if (cm) current = cm[1];
  return { progress, current };
}

// 共享 .git 下的 sdd-runtime/；非 git 仓库回退临时目录。
function runtimeDir(cwd) {
  let common = git(cwd, ['rev-parse', '--git-common-dir']);
  let d;
  if (common) {
    if (!path.isAbsolute(common)) common = path.resolve(cwd, common);
    d = path.join(common, 'sdd-runtime');
  } else {
    const key = crypto.createHash('sha1').update(cwd, 'utf8').digest('hex').slice(0, 12);
    d = path.join(os.tmpdir(), 'sdd-runtime', key);
  }
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// 本地时间 ISO（秒级），对齐 python datetime.now().isoformat(timespec="seconds")。
function localIsoSeconds() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function main() {
  let status = process.argv[2] || 'working';

  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    data = {};
  }
  const cwd = data.cwd || process.cwd();

  // workflow/子代理侦测：PostToolUse 看到 Workflow/Task/Agent 工具 = 本终端进入"委派"长任务，打标兜底。
  // 双层保险：① 插件 hook 会在【子代理上下文】里运行（文档确认，带子代理自己的 cwd）——子代理在本 worktree
  // 调工具时，其 PostToolUse 会拿同一 sdd/NNN 分支刷新同一心跳文件，心跳不停更（主路径，会把下面的
  // delegating 覆盖回 working，更准）。② 万一子代理在别的分支/detached（worktree 隔离）或不跑 hook，
  // 就靠这里的 delegating 标 + /sdd:status 不判死兜底。两种情况都不漏。
  const toolName = data.tool_name || '';
  if (status === 'working' && ['Workflow', 'Task', 'Agent'].includes(toolName)) {
    status = 'delegating';
  }

  // 硬门控：只在 sdd/* 分支上报，其它一律空跑退出（对非 SDD 会话零影响）。
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.startsWith('sdd/')) done();

  const feature = branch.slice('sdd/'.length);

  // tasks/progress 从【主工作树】的 specs/<feature>/ 读（编码进 worktree，但规格仍在主目录 specs/）。
  // 这里就近用 cwd 下的 specs/<feature>/；读不到则字段留空，不报错。
  const featureDir = path.join(cwd, 'specs', feature);
  const phase = derivePhase(featureDir);
  const { progress, current } = parseTasks(featureDir);

  const record = {
    branch,
    feature,
    cwd,
    phase,
    progress,
    currentTask: current,
    status,
    lastActivity: localIsoSeconds(),
  };

  try {
    const d = runtimeDir(cwd);
    const safe = branch.replace(/[/\\]/g, '_');
    const terminalIdentity = data.session_id || data.transcript_path || process.env.CLAUDE_SESSION_ID || `legacy:${cwd}`;
    const sessionIdentity = `${terminalIdentity}:${data.agent_id || 'root'}`;
    const sessionKey = crypto.createHash('sha256').update(sessionIdentity, 'utf8').digest('hex').slice(0, 16);
    record.sessionKey = sessionKey;
    const destination = path.join(d, `${safe}-${sessionKey}.json`);
    const temporary = path.join(d, `.${safe}-${sessionKey}.${process.pid}.tmp`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(record));
      fs.renameSync(temporary, destination);
    } finally {
      try {
        if (isFile(temporary)) fs.unlinkSync(temporary);
      } catch (e) {
        // 尽力清临时文件
      }
    }
  } catch (e) {
    // 写失败静默——心跳尽力而为，绝不拖累会话
  }

  done();
}

try {
  main();
} catch (e) {
  done();
}
