import { chromium } from 'playwright'
import fs from 'fs/promises'
import path from 'path'

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
const outputDir = path.resolve(process.cwd(), 'docs', 'media')

const user = {
  name: 'Студент',
  email: `student_${Date.now()}@example.com`,
  password: 'Student123',
}

async function ensureDir() {
  await fs.mkdir(outputDir, { recursive: true })
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: true })
}

async function register(page) {
  await page.goto(`${baseUrl}/register`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Имя').fill(user.name)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Пароль', { exact: true }).fill(user.password)
  await page.getByLabel('Повторите пароль').fill(user.password)
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click()
  await page.waitForURL('**/')
}

async function fillForm(page) {
  await page.getByLabel('Название').fill('ТЭЦ-15')
  await page.getByLabel('Тип').fill('Энергетика')
  await page.getByLabel('Критичность').selectOption({ label: 'Критический' })
  await page.getByLabel('Статус').selectOption({ label: 'Под угрозой' })
  await page.getByLabel('Дата последней проверки').fill('2026-06-10')
  await page.getByLabel('Описание').fill('Контрольный объект для демонстрации формы.')
  await page.getByLabel('Адрес объекта').fill('Новосибирск, проспект Карла Маркса, 20')
  await page.getByRole('button', { name: 'Проверить адрес' }).click()
  await page.getByText('Адрес успешно проверен', { exact: false }).waitFor({ timeout: 10000 })
}

async function main() {
  await ensureDir()

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await screenshot(page, '01-login.png')

  await register(page)
  await page.waitForSelector('.table', { timeout: 10000 })
  await screenshot(page, '02-home.png')
  await screenshot(page, '05-get.png')

  const firstLink = page.locator('.table tbody tr td .link').first()
  if (await firstLink.count()) {
    await firstLink.click()
    await page.waitForSelector('.detail-card', { timeout: 10000 })
    await screenshot(page, '03-detail.png')

    const editLink = page.getByRole('link', { name: 'Редактировать' })
    if (await editLink.count()) {
      await editLink.first().click()
      await page.waitForSelector('.form', { timeout: 10000 })
      await screenshot(page, '07-edit.png')
    }
  }

  await page.goto(`${baseUrl}/add`, { waitUntil: 'domcontentloaded' })
  await screenshot(page, '04-add.png')

  await page.goto(`${baseUrl}/add`, { waitUntil: 'domcontentloaded' })
  await fillForm(page)
  await screenshot(page, '06-add-filled.png')

  await page.goto(`${baseUrl}/add`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Создать объект' }).click()
  await page.getByText('Проверьте обязательные поля формы', { exact: false }).waitFor()
  await screenshot(page, '09-validation.png')

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  const deleteButton = page.getByRole('button', { name: 'Удалить' }).first()
  if (await deleteButton.count()) {
    page.once('dialog', (dialog) => dialog.accept())
    await deleteButton.click()
    await page.waitForTimeout(800)
    await screenshot(page, '08-after-delete.png')
  }

  await page.goto(`${baseUrl}/not-found`, { waitUntil: 'domcontentloaded' })
  await screenshot(page, '10-404.png')

  const spinnerPage = await context.newPage()
  await spinnerPage.route('**/api/infrastructures*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    route.continue()
  })
  await spinnerPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  try {
    await spinnerPage.waitForSelector('.spinner', { timeout: 5000 })
  } catch {
    // продолжим даже если индикатор исчез слишком быстро
  }
  await screenshot(spinnerPage, '11-loading.png')
  await spinnerPage.close()

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
