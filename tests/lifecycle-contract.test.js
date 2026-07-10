import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

async function text(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

function git(cwd, args, input) {
  return spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
}

test('feature allocation contract reserves the pure numeric ID with a durable owner blob', async () => {
  const [worktree, auto] = await Promise.all([
    text('skills/worktree/SKILL.md'),
    text('skills/auto/SKILL.md'),
  ])
  assert.match(worktree, /refs\/sdd\/feature-ids\/<NNN>/)
  assert.match(worktree, /sdd-feature-id-v1/)
  assert.match(worktree, /git hash-object -w --stdin/)
  assert.match(worktree, /<OWNER_BLOB_OID> <ZERO_OID>/)
  assert.match(worktree, /git cat-file blob refs\/sdd\/feature-ids\/NNN/)
  assert.match(worktree, /005-old[\s\S]*005-new[\s\S]*拒绝/)
  assert.match(auto, /逐字复用 `\/sdd:worktree start`[\s\S]*refs\/sdd\/feature-ids\/NNN/)
})

test('Git expected-absent update-ref allows only one owner for a numeric ID', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sdd-id-cas-'))
  try {
    assert.equal(git(cwd, ['init']).status, 0)
    const format = git(cwd, ['rev-parse', '--show-object-format']).stdout.trim()
    const zero = '0'.repeat(format === 'sha256' ? 64 : 40)
    const firstOwner = git(cwd, ['hash-object', '-w', '--stdin'], 'sdd-feature-id-v1\nid=005\nslug=005-a\n').stdout.trim()
    const secondOwner = git(cwd, ['hash-object', '-w', '--stdin'], 'sdd-feature-id-v1\nid=005\nslug=005-b\n').stdout.trim()
    const ref = 'refs/sdd/feature-ids/005'

    assert.equal(git(cwd, ['update-ref', ref, firstOwner, zero]).status, 0)
    assert.notEqual(git(cwd, ['update-ref', ref, secondOwner, zero]).status, 0)
    assert.match(git(cwd, ['cat-file', 'blob', ref]).stdout, /slug=005-a/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('backlog contract uses one canonical file and an atomic permanent ID reservation', async () => {
  const [init, implement, status, readme] = await Promise.all([
    text('skills/init/SKILL.md'),
    text('skills/implement/SKILL.md'),
    text('skills/status/SKILL.md'),
    text('README.md'),
  ])
  for (const source of [init, implement, status, readme]) assert.match(source, /specs\/backlog\/BL-/)
  assert.match(init, /refs\/sdd\/backlog-ids\/BL-002-001/)
  assert.match(implement, /expected-absent CAS/)
  assert.match(implement, /禁止向共享 `specs\/BACKLOG\.md` 尾部追加/)
  assert.match(status, /ID CONFLICT/)
})

test('finish protocol constructs fixed-parent commits and publishes refs with expected-old CAS', async () => {
  const worktree = await text('skills/worktree/SKILL.md')
  assert.match(worktree, /sdd-finish-lock-v1/)
  assert.match(worktree, /本 attempt 唯一 `LOCK_OID`/)
  assert.match(worktree, /旧 attempt[\s\S]*不能删除新锁[\s\S]*ABA/)
  assert.match(worktree, /commit-tree[\s\S]*-p "\$TESTED_TIP_SHA"/)
  assert.match(worktree, /update-ref[\s\S]*"\$FEATURE_REF"[\s\S]*"\$GATED_TIP_SHA"[\s\S]*"\$TESTED_TIP_SHA"/)
  assert.match(worktree, /update-ref[\s\S]*"\$BASE_REF"[\s\S]*"\$MERGE_COMMIT"[\s\S]*"\$BASE_SHA"/)
  assert.match(worktree, /finalize-pr <feature-slug> <merge-sha>/)
})
