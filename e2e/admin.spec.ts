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

test('view a built-in policy document', async ({ page }) => {
  await loginUI(page)
  await page.goto('/policies')
  await page.locator('li', { hasText: 'readonly' }).getByRole('button', { name: 'View' }).click()
  await expect(page.locator('pre')).toContainText('s3:GetObject')
})

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

test('create, disable, and delete a user', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await loginUI(page)
  await page.goto('/users')
  const uname = 'e2e-probe-user'
  if (await page.getByText(uname, { exact: true }).count()) {
    await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Delete' }).click()
  }
  await page.fill('input[name=accessKey]', uname)
  await page.fill('input[name=secretKey]', 'e2e-secret-123')
  await page.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByText(uname, { exact: true })).toBeVisible()
  await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Disable' }).click()
  await expect(page.locator('li', { hasText: uname })).toContainText('disabled')
  await page.locator('li', { hasText: uname }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(uname, { exact: true })).toHaveCount(0)
})
