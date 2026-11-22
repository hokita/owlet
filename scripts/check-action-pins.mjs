import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node check-action-pins.mjs <workflows-dir>')
  process.exit(2)
}

const usesLine = /^\s*(?:-\s+)?uses:\s*(?:"([^"]*)"|'([^']*)'|(\S+))/
const pinned = /^[^\s/@]+\/[^\s@]+@[0-9a-f]{40}$/
const local = /^\.\//
const dockerDigest = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/

function isPinned(value) {
  return pinned.test(value) || local.test(value) || dockerDigest.test(value)
}

const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()

let failed = false
for (const name of files) {
  const file = path.join(dir, name)
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const match = usesLine.exec(line)
    if (!match) return
    const value = match[1] ?? match[2] ?? match[3]
    if (!isPinned(value)) {
      console.log(`${file}:${index + 1}: ${value}`)
      failed = true
    }
  })
}

process.exit(failed ? 1 : 0)
