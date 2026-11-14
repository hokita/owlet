import { UsageError, parseArgs } from './args'
import { ApiError, addNote } from './client'
import { resolveToken } from './token'

export const DEFAULT_API_URL = 'https://owlet-backend-185845390027.asia-northeast1.run.app'

const USAGE = `Usage: owlet add <event|learn|next> "text" [--month YYYY-MM]

Adds a note to owlet. The month defaults to the current month in Asia/Tokyo.

Environment:
  OWLET_TOKEN    API token (default: macOS Keychain item "owlet")
  OWLET_API_URL  backend URL (default: ${DEFAULT_API_URL})`

interface Deps {
  env: Record<string, string | undefined>
  now: () => Date
  fetch: typeof globalThis.fetch
  readKeychain: () => string | null
  stdout: (line: string) => void
  stderr: (line: string) => void
}

const pad = (month: number) => String(month).padStart(2, '0')

// Returns the exit code: 0 success, 1 failure, 2 bad usage.
export async function main(argv: string[], deps: Deps): Promise<number> {
  let command
  try {
    command = parseArgs(argv, deps.now())
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    deps.stderr(`Error: ${e.message}`)
    deps.stderr(USAGE)
    return 2
  }
  if (command.command === 'help') {
    deps.stdout(USAGE)
    return 0
  }

  const baseUrl = deps.env.OWLET_API_URL || DEFAULT_API_URL
  try {
    const token = resolveToken(deps.env, deps.readKeychain)
    const note = await addNote({ ...command, baseUrl, token, fetch: deps.fetch })
    const { year, month } = command.month
    deps.stdout(`Saved ${note.type} to ${year}-${pad(month)}: ${note.text}`)
    return 0
  } catch (e) {
    if (e instanceof ApiError) {
      deps.stderr(`Error: ${e.message} (HTTP ${e.status})`)
      if (e.status === 401) {
        deps.stderr("Check that your token matches the backend's OWLET_API_TOKEN secret.")
      }
    } else if (e instanceof TypeError) {
      deps.stderr(`Error: Could not reach ${baseUrl}: ${e.message}`)
    } else {
      deps.stderr(`Error: ${(e as Error).message}`)
    }
    return 1
  }
}
