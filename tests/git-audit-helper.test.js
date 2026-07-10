import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HELPER = fileURLToPath(new URL('../workflows/git-audit.cjs', import.meta.url))

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  assert.equal(result.error, undefined, result.error && result.error.message)
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`)
  return result.stdout
}

function git(cwd, ...args) {
  return run('git', args, cwd)
}

async function put(root, relativePath, contents) {
  const absolutePath = join(root, relativePath)
  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents)
}

function audit(cwd) {
  return JSON.parse(run(process.execPath, [HELPER], cwd))
}

test('fixed Git audit helper fingerprints hostile paths without shell or pathspec expansion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sdd-git-audit-'))
  try {
    git(root, 'init')
    git(root, 'config', 'user.email', 'sdd-test@example.invalid')
    git(root, 'config', 'user.name', 'SDD Test')

    const tracked = [
      'src/tracked space.txt',
      'src/$(touch PWNED).txt',
      'src/[brackets].txt',
    ]
    if (process.platform !== 'win32') tracked.push(':(glob)**', 'src/quote"name.txt')

    for (const path of tracked) await put(root, path, `baseline:${path}\n`)
    git(root, '--literal-pathspecs', 'add', '--', ...tracked)
    git(root, 'commit', '-m', 'test: baseline')

    for (const path of tracked) await put(root, path, `changed-once:${path}\n`)
    const untracked = 'src/untracked $(touch PWNED_TOO).txt'
    await put(root, untracked, 'untracked-once\n')

    const first = audit(root)
    assert.equal(first.status, 'ok', first.notes)
    assert.equal(first.protocol, 'sdd-git-audit-v1')
    assert.deepEqual(new Set(first.entries.map(entry => entry.path)), new Set([...tracked, untracked]))
    assert.equal(existsSync(join(root, 'PWNED')), false)
    assert.equal(existsSync(join(root, 'PWNED_TOO')), false)

    for (const path of tracked) {
      const evidence = first.commands.find(command => command.kind === 'tracked-diff' && command.subject === path)
      assert.deepEqual(evidence.argv, [
        'git', '--literal-pathspecs', 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', path,
      ])
    }

    await put(root, tracked[0], 'changed-twice\n')
    await put(root, untracked, 'untracked-twice\n')
    const second = audit(root)
    assert.equal(second.status, 'ok', second.notes)
    const fingerprint = (snapshot, path) => snapshot.entries.find(entry => entry.path === path).fingerprint
    assert.notEqual(fingerprint(first, tracked[0]), fingerprint(second, tracked[0]))
    assert.notEqual(fingerprint(first, untracked), fingerprint(second, untracked))

    const fromSubdirectory = audit(join(root, 'src'))
    assert.equal(fromSubdirectory.status, 'blocked')
    assert.match(fromSubdirectory.notes, /repository root, not a subdirectory/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
