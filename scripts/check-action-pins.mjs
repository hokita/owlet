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
const keyPosition = String.raw`(?:^\s*(?:-\s+)*|[\[{,]\s*)`
const explicitKey = new RegExp(keyPosition + String.raw`\?(?:\s|$)`)
const aliasKey = new RegExp(keyPosition + String.raw`\*[^\s,\[\]{}]+\s*:`)
const usesAnchor = /&\S+\s+(?:uses|"uses"|'uses')\s*$/
const escapedQuotedKey = /["'][^"']*\\[^"']*["']\s*:/
const pinned = /^[^\s/@]+\/[^\s@]+@[0-9a-f]{40}$/
const local = /^\.\//
const dockerDigest = /^docker:\/\/\S+@sha256:[0-9a-f]{64}$/

function isPinned(value) {
  return pinned.test(value) || local.test(value) || dockerDigest.test(value)
}

function couldDefineUses(line) {
  if (commentLine.test(line)) return usesKey.test(line)
  return (
    usesKey.test(line) ||
    explicitKey.test(line) ||
    aliasKey.test(line) ||
    usesAnchor.test(line) ||
    escapedQuotedKey.test(line)
  )
}

function nextContentLine(lines, from) {
  return lines.slice(from).find((line) => line.trim() !== '' && !commentLine.test(line))
}

function indentOf(line) {
  return line.length - line.trimStart().length
}

function isUnsupportedUsesValue(lines, index, value) {
  if (/^["']/.test(value)) return true
  const next = nextContentLine(lines, index + 1)
  return next !== undefined && indentOf(next) > lines[index].indexOf('uses')
}

const files = fs
  .readdirSync(dir)
  .filter((name) => /\.ya?ml$/i.test(name))
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
    if (isUnsupportedUsesValue(lines, index, value)) {
      console.log(`unsupported uses syntax: ${file}:${index + 1}`)
      failed = true
      return
    }
    const trailing = match[4].trim()
    if (trailing !== '' || !isPinned(value)) {
      console.log(`${file}:${index + 1}: ${(value + ' ' + trailing).trim()}`)
      failed = true
    }
  })
}

process.exit(failed ? 1 : 0)
