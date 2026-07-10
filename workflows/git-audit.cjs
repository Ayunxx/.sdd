#!/usr/bin/env node
'use strict'

const { spawnSync } = require('node:child_process')
const { realpathSync } = require('node:fs')
const { TextDecoder } = require('node:util')

const MAX_BUFFER = 256 * 1024 * 1024
const UTF8 = new TextDecoder('utf-8', { fatal: true })

function decode(buffer, label) {
  try {
    return UTF8.decode(Buffer.from(buffer || ''))
  } catch {
    throw new Error(`${label} contains a non-UTF-8 path; audit cannot represent it safely`)
  }
}

function runGit(args, input) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    input,
    encoding: null,
    maxBuffer: MAX_BUFFER,
    shell: false,
    windowsHide: true,
  })
  const exitCode = Number.isInteger(result.status) ? result.status : 1
  if (result.error || exitCode !== 0) {
    const detail = result.error ? result.error.message : decode(result.stderr, 'Git stderr').trim()
    throw new Error(`git ${args.join(' ')} failed (${exitCode}): ${detail}`)
  }
  return { stdout: Buffer.from(result.stdout || ''), exitCode }
}

function command(kind, subject, argv, exitCode = 0) {
  return { kind, subject, argv, exitCode }
}

function main() {
  const commands = []
  const rootResult = runGit(['rev-parse', '--show-toplevel'])
  commands.push(command('root', '', ['git', 'rev-parse', '--show-toplevel'], rootResult.exitCode))
  const root = decode(rootResult.stdout, 'repository root').trim().replace(/\\/g, '/')
  const actualCwd = realpathSync.native(process.cwd())
  const actualRoot = realpathSync.native(root)
  const sameRoot = process.platform === 'win32'
    ? actualCwd.toLowerCase() === actualRoot.toLowerCase()
    : actualCwd === actualRoot
  if (!sameRoot) throw new Error('audit helper must run from the repository root, not a subdirectory')

  const headResult = runGit(['rev-parse', 'HEAD'])
  commands.push(command('head', '', ['git', 'rev-parse', 'HEAD'], headResult.exitCode))
  const head = decode(headResult.stdout, 'HEAD').trim()

  const statusArgs = ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']
  const statusResult = runGit(statusArgs)
  commands.push(command('status', '', ['git', ...statusArgs], statusResult.exitCode))

  const entries = []
  for (const record of decode(statusResult.stdout, 'Git status').split('\0')) {
    if (!record) continue
    if (record.length < 4 || record[2] !== ' ') throw new Error('unexpected porcelain-v1 status record')
    const state = record.slice(0, 2)
    const path = record.slice(3)
    if (path.includes('\\')) throw new Error(`path contains a backslash and cannot be normalized safely: ${JSON.stringify(path)}`)
    let fingerprint
    if (state === '??') {
      const argv = ['git', 'hash-object', '--no-filters', '--', path]
      const hash = runGit(argv.slice(1))
      commands.push(command('untracked-fingerprint', path, argv, hash.exitCode))
      fingerprint = decode(hash.stdout, `fingerprint for ${path}`).trim()
    } else {
      const diffArgv = ['git', '--literal-pathspecs', 'diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', 'HEAD', '--', path]
      const diff = runGit(diffArgv.slice(1))
      commands.push(command('tracked-diff', path, diffArgv, diff.exitCode))
      const hashArgv = ['git', 'hash-object', '--stdin']
      const hash = runGit(hashArgv.slice(1), diff.stdout)
      commands.push(command('tracked-fingerprint', path, hashArgv, hash.exitCode))
      fingerprint = decode(hash.stdout, `fingerprint for ${path}`).trim()
    }
    entries.push({ path, state, fingerprint })
  }

  entries.sort((left, right) => left.path.localeCompare(right.path))
  process.stdout.write(JSON.stringify({
    status: 'ok',
    protocol: 'sdd-git-audit-v1',
    root,
    head,
    entries,
    commands,
    notes: '',
  }))
}

try {
  main()
} catch (error) {
  process.stdout.write(JSON.stringify({
    status: 'blocked',
    protocol: 'sdd-git-audit-v1',
    root: '',
    head: '',
    entries: [],
    commands: [],
    notes: error && error.message ? error.message : String(error),
  }))
}
