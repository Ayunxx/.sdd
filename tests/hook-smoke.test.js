import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const gateReminder = fileURLToPath(new URL('../hooks/gate_reminder.js', import.meta.url))
const statusReport = fileURLToPath(new URL('../hooks/status_report.js', import.meta.url))
const commitMsg = fileURLToPath(new URL('../hooks/commit-msg', import.meta.url))

async function inTemporaryDirectory(run) {
  const cwd = await mkdtemp(join(tmpdir(), 'ayunxx-sdd-hook-'))
  try {
    return await run(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

function runCommitMsg(script, messagePath, cwd) {
  return spawnSync(process.execPath, [script, messagePath], {
    cwd,
    encoding: 'utf8',
    timeout: 5_000,
  })
}

function runHook(script, args, cwd, input = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5_000,
  })
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false, windowsHide: true })
  assert.equal(result.error, undefined, result.error?.stack)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function assertSilentSuccess(result) {
  assert.equal(result.error, undefined, result.error?.stack)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout, '')
}

test('gate_reminder starts as CommonJS and accepts minimal hook input', async () => {
  await inTemporaryDirectory(cwd => {
    const result = runHook(gateReminder, [], cwd)
    assertSilentSuccess(result)
  })
})

test('status_report idle starts as CommonJS and follows the silent no-op contract', async () => {
  await inTemporaryDirectory(cwd => {
    const result = runHook(statusReport, ['idle'], cwd)
    assertSilentSuccess(result)
  })
})

test('gate_reminder notices a same-path change again after HEAD advances', async () => {
  await inTemporaryDirectory(async cwd => {
    git(cwd, 'init')
    git(cwd, 'config', 'user.email', 'sdd-test@example.invalid')
    git(cwd, 'config', 'user.name', 'SDD Test')
    await mkdir(join(cwd, 'specs'), { recursive: true })
    await writeFile(join(cwd, 'specs', 'constitution.md'), '# Constitution\n', 'utf8')
    await writeFile(join(cwd, 'tracked.txt'), 'baseline\n', 'utf8')
    git(cwd, 'add', '--', 'specs/constitution.md', 'tracked.txt')
    git(cwd, 'commit', '-m', 'test: baseline')

    await writeFile(join(cwd, 'tracked.txt'), 'first change\n', 'utf8')
    const first = runHook(gateReminder, [], cwd, { cwd })
    assert.equal(first.status, 0)
    assert.equal(JSON.parse(first.stdout).decision, 'block')
    assertSilentSuccess(runHook(gateReminder, [], cwd, { cwd }))

    git(cwd, 'add', '--', 'tracked.txt')
    git(cwd, 'commit', '-m', 'test: checkpoint')
    await writeFile(join(cwd, 'tracked.txt'), 'second change\n', 'utf8')
    const afterCheckpoint = runHook(gateReminder, [], cwd, { cwd })
    assert.equal(afterCheckpoint.status, 0)
    assert.equal(JSON.parse(afterCheckpoint.stdout).decision, 'block')
  })
})

test('status_report keeps same-branch sessions separate and atomically readable', async () => {
  await inTemporaryDirectory(async cwd => {
    git(cwd, 'init')
    git(cwd, 'config', 'user.email', 'sdd-test@example.invalid')
    git(cwd, 'config', 'user.name', 'SDD Test')
    await writeFile(join(cwd, 'README.md'), 'heartbeat fixture\n', 'utf8')
    git(cwd, 'add', '--', 'README.md')
    git(cwd, 'commit', '-m', 'test: baseline')
    git(cwd, 'checkout', '-b', 'sdd/001-heartbeat')
    const first = runHook(statusReport, ['working'], cwd, { cwd, session_id: 'session-one' })
    const second = runHook(statusReport, ['idle'], cwd, { cwd, session_id: 'session-two' })
    assertSilentSuccess(first)
    assertSilentSuccess(second)

    const runtime = join(cwd, '.git', 'sdd-runtime')
    const names = await readdir(runtime)
    const jsonNames = names.filter(name => name.endsWith('.json'))
    assert.equal(jsonNames.length, 2)
    assert.equal(names.some(name => name.endsWith('.tmp')), false)
    const records = await Promise.all(jsonNames.map(async name => JSON.parse(await readFile(join(runtime, name), 'utf8'))))
    assert.equal(new Set(records.map(record => record.sessionKey)).size, 2)
    assert.deepEqual(new Set(records.map(record => record.branch)), new Set(['sdd/001-heartbeat']))
  })
})

test('commit-msg accepts valid and rejects invalid messages from the plugin source', async () => {
  await inTemporaryDirectory(async cwd => {
    const messagePath = join(cwd, 'COMMIT_EDITMSG')
    await writeFile(messagePath, 'feat(hooks): verify runtime\n', 'utf8')
    assert.equal(runCommitMsg(commitMsg, messagePath, cwd).status, 0)

    await writeFile(messagePath, 'not conventional\n', 'utf8')
    const rejected = runCommitMsg(commitMsg, messagePath, cwd)
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /Conventional Commits/)
  })
})

test('a copied commit-msg hook works inside an ESM-scoped repository', async () => {
  await inTemporaryDirectory(async cwd => {
    const hooksDir = join(cwd, '.git', 'hooks')
    const installedHook = join(hooksDir, 'commit-msg')
    const messagePath = join(cwd, 'COMMIT_EDITMSG')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}\n', 'utf8')
    await copyFile(commitMsg, installedHook)
    await writeFile(messagePath, 'fix: copied hook remains portable\n', 'utf8')
    assert.equal(runCommitMsg(installedHook, messagePath, cwd).status, 0)
    await writeFile(messagePath, 'broken header\n', 'utf8')
    assert.equal(runCommitMsg(installedHook, messagePath, cwd).status, 1)
  })
})

test('a symlinked commit-msg hook resolves its CommonJS package context', async t => {
  await inTemporaryDirectory(async cwd => {
    const hooksDir = join(cwd, '.git', 'hooks')
    const installedHook = join(hooksDir, 'commit-msg')
    const messagePath = join(cwd, 'COMMIT_EDITMSG')
    await mkdir(hooksDir, { recursive: true })
    try {
      await symlink(commitMsg, installedHook, 'file')
    } catch (error) {
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        t.skip(`symlink creation is unavailable: ${error.code}`)
        return
      }
      throw error
    }
    await writeFile(messagePath, 'docs: symlinked hook works\n', 'utf8')
    assert.equal(runCommitMsg(installedHook, messagePath, cwd).status, 0)
    await writeFile(messagePath, 'bad header\n', 'utf8')
    assert.equal(runCommitMsg(installedHook, messagePath, cwd).status, 1)
  })
})
