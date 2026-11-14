import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'

// Matches OWLET_API_TOKEN in backend/.env.e2e (a test value, not a secret).
const API_TOKEN = `e2e-api-token-${'x'.repeat(50)}`
const API_URL = 'http://localhost:8090'
const CLI = path.resolve(__dirname, '../../cli/dist/index.js')

const run = Date.now()

test('an agent adds a note with the CLI, shown with the agent badge', async ({ page }) => {
  expect(existsSync(CLI), 'Build the CLI first: cd cli && npm run build').toBe(true)
  const output = execFileSync(
    process.execPath,
    [CLI, 'add', 'learn', `agent ${run}`, '--month', '2001-06'],
    {
      encoding: 'utf8',
      env: { ...process.env, OWLET_TOKEN: API_TOKEN, OWLET_API_URL: API_URL },
    }
  )
  expect(output).toContain(`Saved learn to 2001-06: agent ${run}`)

  await signIn(page)
  await page.goto('/2001/6')
  const row = page.getByRole('listitem').filter({ hasText: `agent ${run}` })
  await expect(row.getByRole('img', { name: 'Added by an agent' })).toBeVisible()
})

test('the API token cannot list or delete notes', async ({ request }) => {
  const headers = { Authorization: `Bearer ${API_TOKEN}` }
  expect((await request.get(`${API_URL}/api/reviews/2001/6`, { headers })).status()).toBe(401)
  expect(
    (await request.delete(`${API_URL}/api/reviews/2001/6/notes/x`, { headers })).status()
  ).toBe(401)
})
