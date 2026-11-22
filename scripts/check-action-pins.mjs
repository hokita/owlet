import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node check-action-pins.mjs <workflows-dir>')
  process.exit(2)
}

const usesLine = /^\s*(?:-\s+)?uses:\s*(?:"([^"]*)"|'([^']*)'|(\S+))(.*)$/
const commentLine = /^\s*#/
const usesKey = /\buses\b["']?\s*:/
const explicitUsesKey = /^\s*(?:-\s+)?\?\s*["']?uses\b/
const escapedQuotedKey = /["'][^"']*\\[^"']*["']\s*:/
const pinned = /^[^\s/@]+\/[^\s@]+@[0-9a-f]{40}$/
const local = /^\.\//
const dockerDigest = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/

function isPinned(value) {
  return pinned.test(value) || local.test(value) || dockerDigest.test(value)
}

function couldDefineUses(line) {
  if (commentLine.test(line)) return usesKey.test(line)
  return usesKey.test(line) || explicitUsesKey.test(line) || escapedQuotedKey.test(line)
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
    const match = commentLine.test(line) ? null : usesLine.exec(line)
    if (!match) {
      if (couldDefineUses(line)) {
        console.log(`unsupported uses syntax: ${file}:${index + 1}`)
        failed = true
      }
      return
    }
    const value = match[1] ?? match[2] ?? match[3]
    const trailing = match[4].trim()
    if (trailing !== '' || !isPinned(value)) {
      console.log(`${file}:${index + 1}: ${(value + ' ' + trailing).trim()}`)
      failed = true
    }
  })
}

process.exit(failed ? 1 : 0)
