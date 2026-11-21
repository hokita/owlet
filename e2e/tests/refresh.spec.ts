import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'
import { addNoteOverMcp } from '../fixtures/mcp'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

const run = Date.now()

test('a note added over MCP shows after pulling to refresh', async ({ page, request }) => {
  await signIn(page)
  await page.goto('/2001/7')
  await expect(page.getByRole('region', { name: 'Events' })).toBeVisible()

  await addNoteOverMcp(request, { year: 2001, month: 7, type: 'event', text: `muse ${run}` })
  await expect(page.getByText(`muse ${run}`)).toHaveCount(0)

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 200 }],
  })
  for (const y of [260, 320, 380, 420]) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 195, y }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  const row = page.getByRole('listitem').filter({ hasText: `muse ${run}` })
  await expect(row.getByRole('img', { name: 'Added by an agent' })).toBeVisible()
})
