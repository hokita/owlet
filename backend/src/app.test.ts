import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { AddressInfo } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

vi.mock('./services/reviews', () => ({
  NOTE_TYPES: ['event', 'learn', 'next'],
  listNotes: vi.fn().mockResolvedValue([]),
  addNote: vi.fn(async (_y: number, _m: number, input: object) => ({ id: 'n1', ...input })),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}))

import { addNote, deleteNote, listNotes } from './services/reviews'
import { createApp } from './app'

const TOKEN = 'k'.repeat(64)
const bearer = `Bearer ${TOKEN}`

describe('app', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('GET /health returns ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /api/reviews without a token returns 401', async () => {
    const res = await request(createApp()).get('/api/reviews/2026/11')
    expect(res.status).toBe(401)
  })

  describe('with OWLET_API_TOKEN set', () => {
    beforeEach(() => {
      vi.stubEnv('OWLET_API_TOKEN', TOKEN)
    })

    it('rejects the API token for adding notes over REST', async () => {
      const res = await request(createApp())
        .post('/api/reviews/2026/11/notes')
        .set('Authorization', bearer)
        .send({ type: 'learn', text: 'From an agent' })
      expect(res.status).toBe(401)
      expect(addNote).not.toHaveBeenCalled()
    })

    it('rejects the API token for listing notes', async () => {
      const res = await request(createApp())
        .get('/api/reviews/2026/11')
        .set('Authorization', bearer)
      expect(res.status).toBe(401)
      expect(listNotes).not.toHaveBeenCalled()
    })

    it('rejects the API token for deleting notes', async () => {
      const res = await request(createApp())
        .delete('/api/reviews/2026/11/notes/n1')
        .set('Authorization', bearer)
      expect(res.status).toBe(401)
      expect(deleteNote).not.toHaveBeenCalled()
    })
  })

  describe('/mcp', () => {
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    }
    const postMcp = (app: ReturnType<typeof createApp>, auth?: string) => {
      const req = request(app)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send(initialize)
      return auth ? req.set('Authorization', auth) : req
    }

    // A real MCP client against the app listening on a free port.
    async function withClient<T>(
      app: ReturnType<typeof createApp>,
      run: (client: Client) => Promise<T>
    ): Promise<T> {
      const server = app.listen(0)
      await new Promise((resolve) => server.once('listening', resolve))
      const url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)
      const client = new Client({ name: 'test', version: '0' })
      try {
        await client.connect(
          new StreamableHTTPClientTransport(url, {
            requestInit: { headers: { Authorization: bearer } },
          })
        )
        return await run(client)
      } finally {
        await client.close()
        await new Promise((resolve) => server.close(resolve))
      }
    }

    const addNoteCall = {
      name: 'add_note',
      arguments: { year: 2026, month: 11, type: 'event', text: 'x' },
    }
    const RATE_LIMITED = /^Rate limit reached: try again in \d+ seconds$/

    it('rejects /mcp when OWLET_API_TOKEN is unset', async () => {
      vi.stubEnv('OWLET_API_TOKEN', '')
      const res = await postMcp(createApp(), bearer)
      expect(res.status).toBe(401)
    })

    describe('with OWLET_API_TOKEN set', () => {
      beforeEach(() => {
        vi.stubEnv('OWLET_API_TOKEN', TOKEN)
      })

      it('rejects /mcp without a token with 401', async () => {
        const res = await postMcp(createApp())
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'Invalid token' })
      })

      it('rejects /mcp with a Firebase-style bearer with 401', async () => {
        const res = await postMcp(createApp(), 'Bearer firebase-id-token')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'Invalid token' })
      })

      it('initializes over /mcp with the token', async () => {
        const res = await postMcp(createApp(), bearer)
        expect(res.status).toBe(200)
        expect(res.text).toMatch(/"serverInfo":\{"name":"owlet"/)
      })

      it('answers GET /mcp with 405', async () => {
        const res = await request(createApp())
          .get('/mcp')
          .set('Accept', 'text/event-stream')
          .set('Authorization', bearer)
        expect(res.status).toBe(405)
      })

      it('adds a note through a real MCP client', async () => {
        const result = await withClient(createApp(), (client) => client.callTool(addNoteCall))
        expect(result.isError).toBeFalsy()
        expect(addNote).toHaveBeenCalledWith(2026, 11, { type: 'event', text: 'x', source: 'api' })
      })

      it('does not count initialize or tools/list', async () => {
        const app = createApp()
        for (let i = 0; i < 40; i++) expect((await postMcp(app, bearer)).status).toBe(200)
        await withClient(app, async (client) => {
          for (let i = 0; i < 10; i++) await client.listTools()
          for (let i = 0; i < 30; i++)
            expect((await client.callTool(addNoteCall)).isError).toBeFalsy()
          const limited = await client.callTool(addNoteCall)
          expect(limited.isError).toBe(true)
          expect((limited.content as { text: string }[])[0].text).toMatch(RATE_LIMITED)
        })
      })
    })
  })
})
