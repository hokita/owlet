const parse = (value) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value))
  return match ? match.slice(1).map(Number) : null
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const fail = (message) => {
  console.error(message)
  process.exit(2)
}

const deployed = process.argv[2]
const deployedVersion = parse(deployed)
if (!deployedVersion) fail(`Invalid deployed Node version: ${deployed}`)

let stdin = ''
for await (const chunk of process.stdin) stdin += chunk

let index
try {
  index = JSON.parse(stdin)
} catch {
  fail('stdin is not valid JSON')
}
if (!Array.isArray(index)) fail('stdin is not a JSON array of releases')

const newer = index
  .filter((release) => release && release.security === true)
  .map((release) => ({ raw: release.version, parsed: parse(release.version) }))
  .filter(({ parsed }) => parsed && parsed[0] === deployedVersion[0] && compare(parsed, deployedVersion) > 0)
  .sort((a, b) => compare(b.parsed, a.parsed))

if (newer.length > 0) {
  console.log(`Node ${deployed} is behind security release ${newer[0].raw}; redeploy backend`)
  process.exit(1)
}
