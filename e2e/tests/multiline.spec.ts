import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'

const run = Date.now()

async function typeLines(page: import('@playwright/test').Page, lines: string[]) {
  const input = page.getByRole('textbox', { name: 'New note' })
  await input.click()
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press('Enter')
    if (line) await page.keyboard.type(line)
  }
  return input
}

test('adds a multi-line note and keeps its lines after a reload', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/9')
  await expect(page.getByRole('heading', { name: 'September 2001' })).toBeVisible()

  await typeLines(page, [`Trip ${run}`, '- day 1', '', '', '', '- day 2'])
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Edit "Trip ${run}`) })).toBeVisible()

  await page.reload()
  const edit = page.getByRole('button', { name: new RegExp(`^Edit "Trip ${run}`) })
  await expect(edit).toBeVisible()
  expect(await edit.innerText()).toBe(`Trip ${run}\n- day 1\n\n- day 2`)

  const height = (await edit.boundingBox())!.height
  await page.getByRole('textbox', { name: 'New note' }).fill(`one ${run}`)
  await page.getByRole('button', { name: 'Add note' }).click()
  const single = page.getByRole('button', { name: `Edit "one ${run}"` })
  await expect(single).toBeVisible()
  expect(height).toBeGreaterThan((await single.boundingBox())!.height)
})

test('⌘/Ctrl+Return sends', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/9')
  const input = page.getByRole('textbox', { name: 'New note' })
  await input.fill(`shortcut ${run}`)
  await input.press('ControlOrMeta+Enter')
  await expect(page.getByRole('button', { name: `Edit "shortcut ${run}"` })).toBeVisible()
})

test('the box stops growing at 5 lines', async ({ page }) => {
  await signIn(page)
  await page.goto('/2001/9')
  const input = page.getByRole('textbox', { name: 'New note' })
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`)

  await input.fill(lines(5).join('\n'))
  const h5 = (await input.boundingBox())!.height
  await input.fill(lines(8).join('\n'))
  const h8 = (await input.boundingBox())!.height
  expect(h8).toBe(h5)
  expect(await input.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
})

test.describe('at iPhone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('with a 5-line draft the last note scrolls above the Composer', async ({ page }) => {
    await signIn(page)
    await page.goto('/2001/9')
    const input = page.getByRole('textbox', { name: 'New note' })
    for (let i = 1; i <= 6; i++) {
      await input.fill(`pad ${i} ${run}`)
      await page.getByRole('button', { name: 'Add note' }).click()
      await expect(page.getByRole('button', { name: `Edit "pad ${i} ${run}"` })).toBeVisible()
    }
    await input.fill(['a', 'b', 'c', 'd', 'e'].join('\n'))

    const form = page.locator('form')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const last = page.getByRole('listitem').filter({ hasText: `pad 6 ${run}` })
    await expect(async () => {
      const row = (await last.boundingBox())!
      const formBox = (await form.boundingBox())!
      expect(row.y + row.height).toBeLessThanOrEqual(formBox.y)
    }).toPass()

    await page.getByRole('button', { name: `Delete "pad 6 ${run}"` }).click()
    const toast = page.getByRole('status')
    await expect(toast).toContainText('Deleted')
    const toastBox = (await toast.boundingBox())!
    const formBox = (await form.boundingBox())!
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(formBox.y)
  })
})
