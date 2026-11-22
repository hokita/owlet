import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-node-runtime.mjs', import.meta.url))

const run = (deployed, input) =>
  spawnSync('node', deployed === undefined ? [script] : [script, deployed], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })

const entry = (version, security) => ({ version, security })

test('passes when deployed is the newest security release', () => {
  const r = run('v24.22.3', [entry('v25.1.0', true), entry('v24.22.3', true), entry('v24.22.1', true)])
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
})

test('fails when a newer same-major security release exists', () => {
  const r = run('v24.22.3', [entry('v24.22.4', false), entry('v24.22.5', true), entry('v24.22.3', true)])
  assert.equal(r.status, 1)
  assert.equal(r.stdout.trim(), 'Node v24.22.3 is behind security release v24.22.5; redeploy backend')
})

test('passes when the only newer release has security:false', () => {
  const r = run('v24.22.3', [entry('v24.23.0', false), entry('v24.22.3', true)])
  assert.equal(r.status, 0)
})

test('ignores newer majors', () => {
  const r = run('v24.22.3', [entry('v26.0.1', true), entry('v25.9.0', true)])
  assert.equal(r.status, 0)
})

test('compares numerically (24.22.10 > 24.22.9)', () => {
  const r = run('v24.22.9', [entry('v24.22.10', true), entry('v24.22.9', true)])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /security release v24\.22\.10;/)
  assert.equal(run('v24.22.10', [entry('v24.22.9', true)]).status, 0)
})

test('accepts with and without leading v', () => {
  const index = [entry('v24.22.5', true)]
  const bare = run('24.22.3', index)
  assert.equal(bare.status, 1)
  assert.equal(bare.stdout.trim(), 'Node 24.22.3 is behind security release v24.22.5; redeploy backend')
  assert.equal(run('v24.22.5', index).status, 0)
  assert.equal(run('24.22.5', [entry('24.22.5', true)]).status, 0)
})

test('exits 2 when the deployed version argument is missing or invalid', () => {
  assert.equal(run(undefined, []).status, 2)
  const r = run('latest', [])
  assert.equal(r.status, 2)
  assert.notEqual(r.stderr, '')
})

test('exits 2 when stdin is not a JSON array', () => {
  assert.equal(run('v24.22.3', 'not json').status, 2)
  assert.equal(run('v24.22.3', {}).status, 2)
})
