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

test('login, create and delete a bucket', async ({ page }) => {
  await loginUI(page)
  page.on('dialog', (d) => d.accept())
  const name = 'e2e-test-bucket-1' // deterministic; test cleans up at the end
  // ensure clean slate: if present, delete first
  if (await page.getByText(name, { exact: true }).count()) {
    await page.locator('li', { hasText: name }).getByRole('button', { name: 'Delete' }).click()
  }
  await page.fill('input[name=name]', name)
  await page.getByRole('button', { name: 'Create bucket' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.locator('li', { hasText: name }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
})

test('upload, download link, and delete an object', async ({ page }) => {
  await loginUI(page)
  const bucket = 'e2e-test-bucket-2'
  if (!(await page.getByText(bucket, { exact: true }).count())) {
    await page.fill('input[name=name]', bucket)
    await page.getByRole('button', { name: 'Create bucket' }).click()
    await expect(page.getByText(bucket, { exact: true })).toBeVisible()
  }
  await page.getByRole('link', { name: bucket }).click()
  await expect(page).toHaveURL(new RegExp(`/buckets/${bucket}`))

  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload file' }).click()
  ;(await fileChooser).setFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
  await expect(page.getByText('hello.txt')).toBeVisible()

  page.on('dialog', (d) => d.accept())
  await page.locator('li', { hasText: 'hello.txt' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('hello.txt')).toHaveCount(0)

  // Clean up: delete the bucket (now empty)
  await page.goto('/buckets')
  await page.locator('li', { hasText: bucket }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(bucket, { exact: true })).toHaveCount(0)
})
