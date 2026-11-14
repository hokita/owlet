import { execFileSync } from 'node:child_process'

export const KEYCHAIN_SERVICE = 'owlet'

// macOS Keychain lookup; null when there's no entry (or no `security` tool).
export function readKeychain(): string | null {
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

export function resolveToken(
  env: Record<string, string | undefined>,
  keychain: () => string | null
): string {
  const token = env.OWLET_TOKEN?.trim() || keychain()?.trim()
  if (!token) {
    throw new Error(
      'No API token. Set OWLET_TOKEN, or store it in the macOS Keychain:\n' +
        `  security add-generic-password -s ${KEYCHAIN_SERVICE} -a "$USER" -w`
    )
  }
  return token
}
