import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_API_URL, main } from './main'

function run(argv: string[], overrides: Partial<Parameters<typeof main>[1]> = {}) {
  const out: string[] = []
  const err: string[] = []
  const deps = {
    env: { OWLET_TOKEN: 'secret' } as Record<string, string | undefined>,
    now: () => new Date('2026-11-14T03:00:00Z'),
    fetch: vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'n1',
          type: 'event',
          text: 'Shipped it',
          source: 'api',
          createdAt: '2026-11-14T03:00:00.000Z',
        }),
        { status: 201 }
      )
    ),
    readKeychain: () => null,
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
    ...overrides,
  }
  return main(argv, deps).then((code) => ({ code, out, err, deps }))
}

describe('main', () => {
  it('adds a note to the production backend by default and prints it', async () => {
    const { code, out, deps } = await run(['add', 'event', 'Shipped it'])
    expect(code).toBe(0)
    expect(out).toEqual(['Saved event to 2026-11: Shipped it'])
    expect(deps.fetch).toHaveBeenCalledWith(
      `${DEFAULT_API_URL}/api/reviews/2026/11/notes`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uses OWLET_API_URL when set', async () => {
    const { deps } = await run(['add', 'event', 'Shipped it'], {
      env: { OWLET_TOKEN: 'secret', OWLET_API_URL: 'http://localhost:8080' },
    })
    expect(deps.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/reviews/2026/11/notes',
      expect.anything()
    )
  })

  it('prints usage and exits 2 on bad arguments', async () => {
    const { code, err } = await run(['add', 'idea', 'x'])
    expect(code).toBe(2)
    expect(err[0]).toBe('Error: Type must be one of: event, learn, next')
    expect(err.join('\n')).toContain('Usage: owlet add')
  })

  it('prints help and exits 0', async () => {
    const { code, out } = await run(['--help'])
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('Usage: owlet add')
  })

  it('exits 1 with a clear message when there is no token', async () => {
    const { code, err } = await run(['add', 'event', 'x'], { env: {} })
    expect(code).toBe(1)
    expect(err[0]).toMatch(/^Error: No API token/)
  })

  it('exits 1 with the server error, and a hint on 401', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 }))
    const { code, err } = await run(['add', 'event', 'x'], { fetch })
    expect(code).toBe(1)
    expect(err[0]).toBe('Error: Invalid token (HTTP 401)')
    expect(err[1]).toMatch(/OWLET_API_TOKEN/)
  })

  it('exits 1 when the backend cannot be reached', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const { code, err } = await run(['add', 'event', 'x'], { fetch })
    expect(code).toBe(1)
    expect(err[0]).toBe(`Error: Could not reach ${DEFAULT_API_URL}: fetch failed`)
  })
})
