#!/usr/bin/env node
import { main } from './main'
import { readKeychain } from './token'

main(process.argv.slice(2), {
  env: process.env,
  now: () => new Date(),
  fetch: globalThis.fetch,
  readKeychain,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
}).then((code) => {
  process.exitCode = code
})
