import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'
import { addNoteOverMcp, callMcpTool, parseToolText } from '../fixtures/mcp'

// The emulator keeps data between tests, so note texts are made unique per run.
const run = Date.now()

test("edits a note's text and type in the app", async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/8')
  await expect(page.getByRole('heading', { name: 'August 2001' })).toBeVisible()

  const input = page.getByRole('textbox', { name: 'New note' })
  await page.getByRole('button', { name: 'event', exact: true }).click()
  await input.fill(`edit ${run}`)
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText(`edit ${run}`)).toBeVisible()

  await page.getByRole('button', { name: `Edit "edit ${run}"` }).click()
  const editor = page.getByRole('textbox', { name: 'Edit note' })
  await editor.fill(`edited ${run}`)
  await page.getByRole('button', { name: 'learn', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: 'Learns' })).toContainText(`edited ${run}`)

  await page.reload()
  await expect(page.getByRole('region', { name: 'Learns' })).toContainText(`edited ${run}`)
  await expect(page.getByText(`edit ${run}`)).toHaveCount(0)
})

test('moves a note to another month', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/10')
  await expect(page.getByRole('heading', { name: 'October 2001' })).toBeVisible()

  const input = page.getByRole('textbox', { name: 'New note' })
  await page.getByRole('button', { name: 'event', exact: true }).click()
  await input.fill(`move ${run}`)
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByText(`move ${run}`)).toBeVisible()

  await page.getByRole('button', { name: `Edit "move ${run}"` }).click()
  await page.getByLabel('Month', { exact: true }).fill('2001-11')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status')).toContainText('Saved and moved to Nov 2001')
  await expect(page.getByText(`move ${run}`)).toHaveCount(0)

  await page.goto('/2001/11')
  await expect(page.getByText(`move ${run}`)).toBeVisible()

  await page.goto('/2001/10')
  await expect(page.getByRole('heading', { name: 'October 2001' })).toBeVisible()
  await expect(page.getByText(`move ${run}`)).toHaveCount(0)
})

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('Muse update_note shows after pulling to refresh, with the agent badge', async ({
    page,
    request,
  }) => {
    const added = await addNoteOverMcp(request, {
      year: 2001,
      month: 12,
      type: 'event',
      text: `muse edit ${run}`,
    })
    const id = JSON.parse(parseToolText(added)).id

    await signIn(page)
    await page.goto('/2001/12')
    await expect(page.getByText(`muse edit ${run}`)).toBeVisible()

    const updated = await callMcpTool(request, 'update_note', {
      year: 2001,
      month: 12,
      id,
      text: `muse edited ${run}`,
      source: 'app',
    })
    expect(updated).not.toContain('"isError":true')

    // A real touch drag from the top of the page, below the sticky header.
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

    const row = page.getByRole('listitem').filter({ hasText: `muse edited ${run}` })
    await expect(row.getByRole('img', { name: 'Added by an agent' })).toBeVisible()
  })
})
