import type { Request, RequestHandler, Response } from 'express'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { CallToolResult } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { NOTE_TYPES, addNote, deleteNote, listNotes } from '../services/reviews'
import { parseNoteId, parseNoteInput, parseYearMonth } from '../services/noteInput'
import type { RateLimiter } from '../middleware/rateLimit'

const MONTH_ERROR = 'Invalid month: year must be 2000–2100 and month 1–12'
const ERRORS = {
  'Invalid type': 'Invalid type: must be event, learn or next',
  'Invalid text': 'Invalid text: must be one line of 1–500 characters',
} as const

const yearMonth = {
  year: z.number().int().describe('Year, 2000–2100'),
  month: z.number().int().describe('Month, 1–12'),
}

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] }
}

function toolError(message: string): CallToolResult {
  return { ...text(message), isError: true }
}

// Each tool call takes from the API token limiter;
// protocol requests (initialize, tools/list) never reach a tool and aren't counted.
function limited<A>(
  limiter: RateLimiter,
  failure: string,
  run: (args: A) => Promise<CallToolResult>
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    const allowed = limiter.take()
    if (!allowed.ok) {
      return toolError(`Rate limit reached: try again in ${allowed.retryAfterSeconds} seconds`)
    }
    try {
      return await run(args)
    } catch (err) {
      console.error(failure, err)
      return toolError('Internal error')
    }
  }
}

export function createOwletMcpServer({ limiter }: { limiter: RateLimiter }): McpServer {
  const server = new McpServer({ name: 'owlet', version: '1.0.0' })

  server.registerTool(
    'list_notes',
    {
      description: "List the owner's owlet notes for one month.",
      inputSchema: z.object(yearMonth),
      annotations: { readOnlyHint: true },
    },
    limited(limiter, 'Failed to list notes', async (args) => {
      const ym = parseYearMonth(args.year, args.month)
      if (!ym) return toolError(MONTH_ERROR)
      const notes = await listNotes(ym.year, ym.month)
      return text(JSON.stringify({ ...ym, notes }))
    })
  )

  server.registerTool(
    'add_note',
    {
      description: 'Add a note to a month in owlet.',
      inputSchema: z.object({
        ...yearMonth,
        type: z
          .enum(NOTE_TYPES)
          .describe('event: something that happened; learn: something learned; next: a next step'),
        text: z.string().describe('One line, 1–500 characters'),
      }),
      annotations: { destructiveHint: false },
    },
    limited(limiter, 'Failed to add note', async (args) => {
      const ym = parseYearMonth(args.year, args.month)
      if (!ym) return toolError(MONTH_ERROR)
      const input = parseNoteInput(args)
      if (!input.ok) return toolError(ERRORS[input.error])
      const note = await addNote(ym.year, ym.month, {
        type: input.type,
        text: input.text,
        source: 'api',
      })
      return text(JSON.stringify(note))
    })
  )

  server.registerTool(
    'delete_note',
    {
      description: 'Delete one note from a month in owlet. This cannot be undone.',
      inputSchema: z.object({
        ...yearMonth,
        id: z.string().describe('The note id from list_notes'),
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    limited(limiter, 'Failed to delete note', async (args) => {
      const ym = parseYearMonth(args.year, args.month)
      if (!ym) return toolError(MONTH_ERROR)
      const id = parseNoteId(args.id)
      if (!id) return toolError('Invalid id')
      await deleteNote(ym.year, ym.month, id)
      return text(`Deleted note ${id}`)
    })
  )

  return server
}

// The SDK answers rejected requests (406, 415, bad protocol version, ...) itself
// and reports them through onerror; log only the message so a failing
// connector leaves a reason in the logs.
function logMcpError(err: Error) {
  console.error('MCP request failed:', err.message)
}

// Stateless: the SDK builds a fresh server per request. express.json() has
// already read the body, so it's passed in rather than re-read from the stream.
export function createMcpRequestHandler({ limiter }: { limiter: RateLimiter }): RequestHandler {
  const factory = () => {
    const server = createOwletMcpServer({ limiter })
    // Transport-level rejections reach the server instance, not the handler.
    server.server.onerror = logMcpError
    return server
  }
  const handle = toNodeHandler(createMcpHandler(factory, { onerror: logMcpError }), {
    onerror: logMcpError,
  })
  return (req: Request, res: Response) => {
    void handle(req, res, req.body)
  }
}
