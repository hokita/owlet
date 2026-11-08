import { expect, test } from '@playwright/test'
import { signIn } from '../fixtures/auth'

test('signs in and sees the hello message', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Hello, owlet' })).toBeVisible()
  await expect(page.getByText(/Visits: \d+/)).toBeVisible()
})
