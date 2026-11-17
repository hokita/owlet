import { expect, type APIRequestContext } from '@playwright/test'

// Matches OWLET_API_TOKEN in backend/.env.e2e (a test value, not a secret).
export const API_TOKEN = `e2e-api-token-${'x'.repeat(50)}`
export const API_URL = 'http://localhost:8090'

export async function callMcpTool(
  request: APIRequestContext,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const res = await request.post(`${API_URL}/mcp`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    },
  })
  expect(res.status()).toBe(200)
  return res.text()
}

// The first content text of the JSON-RPC result, whether the body is plain JSON
// or an SSE stream ("event: message\ndata: {...}").
export function parseToolText(body: string): string {
  const data = body.trimStart().startsWith('{')
    ? body
    : body
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice('data:'.length)
  const message = JSON.parse(data ?? '')
  return message.result.content[0].text
}

export async function addNoteOverMcp(
  request: APIRequestContext,
  args: { year: number; month: number; type: 'event' | 'learn' | 'next'; text: string }
): Promise<string> {
  return callMcpTool(request, 'add_note', args)
}
