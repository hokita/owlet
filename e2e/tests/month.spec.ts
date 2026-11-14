import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'

// The emulator keeps data between tests (and between local runs that reuse it),
// so note texts are made unique per run.
const run = Date.now()

test('lands on the current month after signing in', async ({ page }) => {
  await signIn(page)
  const now = new Date()
  const title = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page).toHaveURL(`/${now.getFullYear()}/${now.getMonth() + 1}`)
})

test('adds notes of each type and deletes one', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/2')
  await expect(page.getByRole('heading', { name: 'February 2001' })).toBeVisible()

  const input = page.getByRole('textbox', { name: 'New note' })
  for (const type of ['event', 'learn', 'next']) {
    await page.getByRole('button', { name: type, exact: true }).click()
    await input.fill(`${type} ${run}`)
    await input.press('Enter')
    await expect(page.getByText(`${type} ${run}`)).toBeVisible()
  }

  await expect(page.getByRole('region', { name: 'Events' })).toContainText(`event ${run}`)
  await expect(page.getByRole('region', { name: 'Learns' })).toContainText(`learn ${run}`)
  await expect(page.getByRole('region', { name: 'Nexts' })).toContainText(`next ${run}`)

  const deleted = page.waitForResponse((res) => res.request().method() === 'DELETE')
  await page.getByRole('button', { name: `Delete "learn ${run}"` }).click()
  await expect(page.getByRole('status')).toContainText('Deleted')
  expect((await deleted).status()).toBe(204)

  await page.reload()
  await expect(page.getByText(`event ${run}`)).toBeVisible()
  await expect(page.getByText(`next ${run}`)).toBeVisible()
  await expect(page.getByText(`learn ${run}`)).toHaveCount(0)
})

test('Undo keeps the note', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/3')
  const input = page.getByRole('textbox', { name: 'New note' })
  await input.fill(`keep ${run}`)
  await input.press('Enter')
  await expect(page.getByText(`keep ${run}`)).toBeVisible()

  await page.getByRole('button', { name: `Delete "keep ${run}"` }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.reload()
  await expect(page.getByText(`keep ${run}`)).toBeVisible()
})

test.describe('on a touch-only phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('screen readers can still reach Delete', async ({ page }) => {
    await signIn(page)
    await page.goto('/2001/4')
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)

    const input = page.getByRole('textbox', { name: 'New note' })
    await input.fill(`touch ${run}`)
    await input.press('Enter')
    await expect(page.getByText(`touch ${run}`)).toBeVisible()

    // getByRole skips display:none elements, so this is what VoiceOver sees.
    const deleteButton = page.getByRole('button', { name: `Delete "touch ${run}"` })
    await expect(deleteButton).toHaveCount(1)
    await deleteButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toContainText('Deleted')
  })
})

test('moves between months with the arrows and the back button', async ({ page }) => {
  await signIn(page)
  await page.goto('/2026/1')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.getByRole('heading', { name: 'December 2025' })).toBeVisible()
  await expect(page).toHaveURL('/2025/12')

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'January 2026' })).toBeVisible()

  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('heading', { name: 'February 2026' })).toBeVisible()
})
