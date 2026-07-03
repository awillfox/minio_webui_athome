import { test, expect, type Page } from '@playwright/test'

const ACCESS = process.env.MW_TEST_ACCESS_KEY
const SECRET = process.env.MW_TEST_SECRET_KEY
test.skip(!ACCESS || !SECRET, 'set MW_TEST_ACCESS_KEY / MW_TEST_SECRET_KEY to run')

async function loginUI(page: Page) {
  await page.goto('/login')
  await page.fill('input[name=accessKey]', ACCESS!)
  await page.fill('input[name=secretKey]', SECRET!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/buckets/)
}

test('create and delete an access key', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await loginUI(page)
  await page.goto('/keys')
  await page.getByRole('button', { name: 'Create access key' }).click()
  const panel = page.locator('text=won\'t be shown again')
  await expect(panel).toBeVisible()
  // capture the created access key from the panel
  const akText = await page.locator('p', { hasText: 'Access key:' }).first().innerText()
  const ak = akText.replace('Access key:', '').trim()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(ak, { exact: false })).toBeVisible()
  await page.locator('li', { hasText: ak }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(ak, { exact: false })).toHaveCount(0)
})
