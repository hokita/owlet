// Fails if anything is still listening on the ports the e2e webServers use.
// Run after `playwright test` when Playwright started the servers itself (CI,
// or locally with CI=1); a leftover listener means a server was orphaned.
import net from 'node:net'

const PORTS = {
  9099: 'Auth emulator',
  8081: 'Firestore emulator',
  8090: 'backend',
  5174: 'frontend',
}
const HOSTS = ['127.0.0.1', '::1']

function isListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

const leftovers = []
for (const [port, name] of Object.entries(PORTS)) {
  for (const host of HOSTS) {
    if (await isListening(host, Number(port))) {
      leftovers.push(`${name} still listening on ${host}:${port}`)
      break
    }
  }
}

if (leftovers.length > 0) {
  console.error(leftovers.join('\n'))
  process.exit(1)
}
console.log('All e2e servers stopped.')
