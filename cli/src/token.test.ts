import { describe, it, expect, vi } from 'vitest'
import { resolveToken } from './token'

describe('resolveToken', () => {
  it('prefers OWLET_TOKEN', () => {
    const readKeychain = vi.fn()
    expect(resolveToken({ OWLET_TOKEN: ' env-token \n' }, readKeychain)).toBe('env-token')
    expect(readKeychain).not.toHaveBeenCalled()
  })

  it('falls back to the Keychain', () => {
    expect(resolveToken({}, () => 'keychain-token\n')).toBe('keychain-token')
  })

  it('throws a clear error when neither has a token', () => {
    expect(() => resolveToken({}, () => null)).toThrow(/OWLET_TOKEN.*Keychain/s)
    expect(() => resolveToken({ OWLET_TOKEN: '  ' }, () => '')).toThrow(/OWLET_TOKEN/)
  })
})
