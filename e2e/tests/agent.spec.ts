import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'

// Matches OWLET_API_TOKEN in backend/.env.e2e (a test value, not a secret).
const API_TOKEN = `e2e-api-token-${'x'.repeat(50)}`
const API_URL = 'http://localhost:8090'

const run = Date.now()

test('an agent adds a note over MCP with the API token, shown with the agent badge', async ({
  page,
  request,
}) => {
  const res = await request.post(`${API_URL}/mcp`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'add_note',
        arguments: { year: 2001, month: 6, type: 'learn', text: `agent ${run}` },
      },
    },
  })
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toContain(`agent ${run}`)
  expect(body).toContain('\\"source\\":\\"api\\"')
  expect(body).not.toContain('"isError":true')

  await signIn(page)
  await page.goto('/2001/6')
  const row = page.getByRole('listitem').filter({ hasText: `agent ${run}` })
  await expect(row.getByRole('img', { name: 'Added by an agent' })).toBeVisible()
})

test('a wrong token cannot add a note', async ({ request }) => {
  const res = await request.post(`${API_URL}/api/reviews/2001/6/notes`, {
    headers: { Authorization: `Bearer ${'y'.repeat(64)}` },
    data: { type: 'learn', text: `wrong token ${run}` },
  })
  expect(res.status()).toBe(401)
})

test('the API token cannot use the REST API', async ({ request }) => {
  const headers = { Authorization: `Bearer ${API_TOKEN}` }
  expect((await request.get(`${API_URL}/api/reviews/2001/6`, { headers })).status()).toBe(401)
  expect(
    (
      await request.post(`${API_URL}/api/reviews/2001/6/notes`, {
        headers,
        data: { type: 'learn', text: `rest token ${run}` },
      })
    ).status()
  ).toBe(401)
  expect(
    (await request.delete(`${API_URL}/api/reviews/2001/6/notes/x`, { headers })).status()
  ).toBe(401)
})
