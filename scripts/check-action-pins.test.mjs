import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-action-pins.mjs')
const sha = 'a'.repeat(40)
const digest = 'b'.repeat(64)

function run(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'action-pins-'))
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
  const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' })
  return { dir, status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function workflow(...usesLines) {
  return ['jobs:', '  build:', '    steps:', ...usesLines].join('\n') + '\n'
}

test('passes for a full SHA', () => {
  const r = run({ 'ci.yml': workflow(`      - uses: actions/checkout@${sha}`) })
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('fails for a tag (@v4) and a branch (@main)', () => {
  const r = run({
    'ci.yml': workflow('      - uses: actions/checkout@v4', '      - uses: actions/setup-node@main'),
  })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /actions\/checkout@v4/)
  assert.match(r.stdout, /actions\/setup-node@main/)
})

test('fails for a 7-char short SHA', () => {
  const r = run({ 'ci.yml': workflow('      - uses: actions/checkout@abcdef1') })
  assert.equal(r.status, 1)
  assert.match(r.stdout, /actions\/checkout@abcdef1/)
})

test('passes for ./local-action', () => {
  const r = run({ 'ci.yml': workflow('      - uses: ./local-action') })
  assert.equal(r.status, 0)
})

test('fails for docker:// without a digest', () => {
  const bad = run({ 'ci.yml': workflow('      - uses: docker://alpine:3.20') })
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /docker:\/\/alpine:3\.20/)
  const good = run({ 'ci.yml': workflow(`      - uses: docker://alpine@sha256:${digest}`) })
  assert.equal(good.status, 0)
})

test('reads quoted and "- uses:" list forms', () => {
  const r = run({
    'ci.yml': workflow(
      '      - uses: "actions/checkout@v4"',
      "      - uses: 'actions/setup-node@v4'",
      '      - name: x',
      '        uses: actions/cache@v3',
      `      - uses: "actions/ok@${sha}"`,
    ),
  })
  assert.equal(r.status, 1)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines.length, 3)
  assert.match(r.stdout, /actions\/checkout@v4/)
  assert.match(r.stdout, /actions\/setup-node@v4/)
  assert.match(r.stdout, /actions\/cache@v3/)
})

test('reports file:line for each failure', () => {
  const r = run({
    'a.yml': workflow('      - uses: actions/checkout@v4'),
    'b.yaml': workflow(`      - uses: actions/ok@${sha}`, '      - uses: actions/cache@v3'),
  })
  assert.equal(r.status, 1)
  const lines = r.stdout.trim().split('\n').sort()
  assert.deepEqual(lines, [
    `${path.join(r.dir, 'a.yml')}:4: actions/checkout@v4`,
    `${path.join(r.dir, 'b.yaml')}:5: actions/cache@v3`,
  ])
})

test('exits 2 with usage when no directory is given', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /usage/i)
})
