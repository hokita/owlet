import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

vi.mock('../services/reviews', () => ({
  NOTE_TYPES: ['event', 'learn', 'next'],
  listNotes: vi.fn(),
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}))

import { addNote, deleteNote, listNotes } from '../services/reviews'
import { createRateLimiter } from '../middleware/rateLimit'
import type { RateLimiter } from '../middleware/rateLimit'
import { createMcpRequestHandler } from './server'

const note = {
  id: 'n1',
  type: 'learn',
  text: 'From Muse',
  source: 'api',
  createdAt: '2026-11-15T00:00:00.000Z',
}

// The limiter each test server uses; tests swap it to exercise the limit.
let limiter: RateLimiter
let server: Server
let url: URL
const clients: Client[] = []

beforeAll(async () => {
  const delegating: RateLimiter = { take: () => limiter.take() }
  const app = express()
    .use(express.json())
    .all('/mcp', createMcpRequestHandler({ limiter: delegating }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  vi.clearAllMocks()
  limiter = createRateLimiter({ limit: 1000, windowMs: 3_600_000 })
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
})

async function connect(options?: ConstructorParameters<typeof Client>[1]) {
  const client = new Client({ name: 'test', version: '0' }, options)
  await client.connect(new StreamableHTTPClientTransport(url))
  clients.push(client)
  return client
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text: string }[]
  return first.text
}

describe('owlet MCP server', () => {
  it('lists the three tools with their annotations', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['add_note', 'delete_note', 'list_notes'])
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(byName.delete_note.annotations?.destructiveHint).toBe(true)
    expect(byName.list_notes.annotations?.readOnlyHint).toBe(true)
    const typeSchema = (
      byName.add_note.inputSchema.properties as Record<string, { enum?: string[] }>
    ).type
    expect(typeSchema.enum).toEqual(['event', 'learn', 'next'])
  })

  it("list_notes returns the month's notes", async () => {
    vi.mocked(listNotes).mockResolvedValue([note] as never)
    const result = await (
      await connect()
    ).callTool({ name: 'list_notes', arguments: { year: 2026, month: 11 } })
    expect(result.isError).toBeFalsy()
    expect(JSON.parse(textOf(result))).toEqual({ year: 2026, month: 11, notes: [note] })
    expect(listNotes).toHaveBeenCalledWith(2026, 11)
  })

  it('add_note saves a trimmed note with source api', async () => {
    vi.mocked(addNote).mockResolvedValue(note as never)
    const result = await (
      await connect()
    ).callTool({
      name: 'add_note',
      arguments: { year: 2026, month: 11, type: 'learn', text: '  From Muse  ' },
    })
    expect(result.isError).toBeFalsy()
    expect(addNote).toHaveBeenCalledWith(2026, 11, {
      type: 'learn',
      text: 'From Muse',
      source: 'api',
    })
    expect(JSON.parse(textOf(result))).toEqual(note)
  })

  it('add_note accepts exactly 500 characters', async () => {
    vi.mocked(addNote).mockResolvedValue(note as never)
    const result = await (
      await connect()
    ).callTool({
      name: 'add_note',
      arguments: { year: 2026, month: 11, type: 'event', text: 'x'.repeat(500) },
    })
    expect(result.isError).toBeFalsy()
    expect(addNote).toHaveBeenCalledTimes(1)
  })

  it('delete_note deletes by id', async () => {
    vi.mocked(deleteNote).mockResolvedValue()
    const result = await (
      await connect()
    ).callTool({ name: 'delete_note', arguments: { year: 2026, month: 11, id: 'n1' } })
    expect(result.isError).toBeFalsy()
    expect(deleteNote).toHaveBeenCalledWith(2026, 11, 'n1')
    expect(textOf(result)).toBe('Deleted note n1')
  })

  const MONTH = 'Invalid month: year must be 2000–2100 and month 1–12'
  const TEXT = 'Invalid text: must be one line of 1–500 characters'
  it.each([
    ['list_notes', { year: 2026, month: 13 }, MONTH],
    ['add_note', { year: 2026, month: 13, type: 'event', text: 'x' }, MONTH],
    ['delete_note', { year: 2026, month: 13, id: 'n1' }, MONTH],
    ['list_notes', { year: 1999, month: 1 }, MONTH],
    ['add_note', { year: 2026, month: 11, type: 'event', text: '   ' }, TEXT],
    ['add_note', { year: 2026, month: 11, type: 'event', text: 'two\nlines' }, TEXT],
    ['add_note', { year: 2026, month: 11, type: 'event', text: 'x'.repeat(501) }, TEXT],
    ['delete_note', { year: 2026, month: 11, id: 'a/b' }, 'Invalid id'],
  ])('%s %j is a tool error', async (name, args, message) => {
    const result = await (await connect()).callTool({ name, arguments: args })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(message)
    expect(listNotes).not.toHaveBeenCalled()
    expect(addNote).not.toHaveBeenCalled()
    expect(deleteNote).not.toHaveBeenCalled()
  })

  it('rejects an unknown note type as a tool error', async () => {
    const result = await (
      await connect()
    ).callTool({ name: 'add_note', arguments: { year: 2026, month: 11, type: 'idea', text: 'x' } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('type')
    expect(addNote).not.toHaveBeenCalled()
  })

  it('returns Internal error when Firestore fails', async () => {
    vi.mocked(listNotes).mockRejectedValue(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await (
      await connect()
    ).callTool({ name: 'list_notes', arguments: { year: 2026, month: 11 } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Internal error')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('counts only tool calls against the limit', async () => {
    limiter = createRateLimiter({ limit: 3, windowMs: 3_600_000 })
    vi.mocked(listNotes).mockResolvedValue([])
    for (let i = 0; i < 3; i++) {
      const client = await connect()
      for (let j = 0; j < 5; j++) await client.listTools()
    }
    const client = await connect()
    const call = () => client.callTool({ name: 'list_notes', arguments: { year: 2026, month: 11 } })
    for (let i = 0; i < 3; i++) expect((await call()).isError).toBeFalsy()
    const limited = await call()
    expect(limited.isError).toBe(true)
    expect(textOf(limited)).toMatch(/^Rate limit reached: try again in \d+ seconds$/)
    expect(listNotes).toHaveBeenCalledTimes(3)
  })

  it('answers the 2026-07-28 revision too', async () => {
    const client = await connect({ versionNegotiation: { mode: 'auto' } })
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(3)
  })
})
