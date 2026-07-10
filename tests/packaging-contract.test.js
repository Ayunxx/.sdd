import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const readProjectFile = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('vendored install documents one stable layout and copies the complete Workflow runtime', async () => {
  const init = await readProjectFile('skills/init/SKILL.md')

  for (const mapping of [
    'skills/*` → `PROJECT_ROOT/.claude/skills/*',
    'agents/*` → `PROJECT_ROOT/.claude/agents/*',
    'workflows/*` → `PROJECT_ROOT/.claude/sdd/workflows/*',
    'stacks/*` → `PROJECT_ROOT/.claude/sdd/stacks/*',
  ]) {
    assert.ok(init.includes(mapping), `missing vendored mapping: ${mapping}`)
  }

  for (const asset of [
    'workflows/sdd-implement.js',
    'workflows/sdd-implement-core.js',
    'workflows/git-audit.cjs',
    'stacks/_TEMPLATE.md',
  ]) {
    await access(new URL(`../${asset}`, import.meta.url))
  }

  assert.match(init, /workflows\/.*必须整体复制/u)
  assert.doesNotMatch(init, /\.sdd\/workflows/u)
})

test('implement resolves plugin and vendored Workflow assets as inseparable pairs', async () => {
  const implement = await readProjectFile('skills/implement/SKILL.md')

  assert.ok(implement.includes('${CLAUDE_PLUGIN_ROOT}/workflows/sdd-implement.js'))
  assert.ok(implement.includes('FEATURE_ROOT/.claude/sdd/workflows/sdd-implement.js'))
  assert.ok(implement.includes('node "$CLAUDE_PLUGIN_ROOT/workflows/git-audit.cjs"'))
  assert.ok(implement.includes('node .claude/sdd/workflows/git-audit.cjs'))
  assert.match(implement, /args\.auditHelperCommand/u)
  assert.match(implement, /不能来自同一套插件\/vendored 布局.*预检失败/u)
  assert.match(implement, /下一未完成 Wave/u)
  assert.match(implement, /MULTI_WAVE_RUN_SELECTION/u)
  assert.match(implement, /Git 可见工作区为空/u)
  assert.match(implement, /Wave checkpoint/u)
  assert.doesNotMatch(implement, /\.sdd\/workflows/u)
})

test('stack catalog resolver recognizes the vendored catalog layout', async () => {
  const stack = await readProjectFile('skills/stack/SKILL.md')

  assert.ok(stack.includes('.claude/sdd/stacks/<name>.md'))
  assert.doesNotMatch(stack, /当前 `\.sdd\/stacks\//u)
})

test('default regression command includes the packaging contract', async () => {
  const pkg = JSON.parse(await readProjectFile('package.json'))

  assert.match(pkg.scripts?.test || '', /tests\/packaging-contract\.test\.js/u)
})
