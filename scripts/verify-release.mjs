/** Run against an already served build: RELEASE_URL=https://ausnox.vercel.app node scripts/verify-release.mjs */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect as playwrightExpect } from '@playwright/test'

const url = process.env.RELEASE_URL ?? 'https://ausnox.vercel.app'
const out = process.env.RELEASE_OUT ?? 'artifacts/release-2026-11-15/production'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const report = { url, checkedUtc: new Date().toISOString(), scenarios: [], signals: [] }
const expect = playwrightExpect.configure({ timeout: 25000 })

async function tabTo(page, target) {
  await expect(target).toBeVisible()
  for (let i = 0; i < 180; i++) {
    if (await target.evaluate(node => node === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Control was not reachable by Tab: ${await target.getAttribute('aria-label') ?? await target.textContent()}`)
}

async function activate(page, target) {
  await tabTo(page, target)
  await page.keyboard.press('Enter')
}

async function typeNumber(page, target, value) {
  await tabTo(page, target)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(String(value))
  await page.keyboard.press('Tab')
}

async function ready(page) {
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled({ timeout: 45000 })
}

async function boot(page, keyboard = false) {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  assert.equal(response.status(), 200)
  const snap = page.getByRole('button', { name: /Use nearest usable cell,/ })
  await expect(snap).toBeVisible()
  if (keyboard) await activate(page, snap)
  else await snap.click()
  await ready(page)
}

async function scenario(name, options, run) {
  const context = await browser.newContext({ viewport: { width: 1568, height: 1040 }, reducedMotion: 'reduce', ...options })
  const page = await context.newPage()
  const signals = { name, pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [], terrainRequests: 0, tileResponses: 0 }
  page.on('pageerror', e => signals.pageErrors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') signals.consoleErrors.push({ text: m.text(), url: m.location().url }) })
  page.on('requestfailed', r => signals.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }))
  page.on('request', r => { if (r.url().includes('/data/jezero/terrain.bin')) signals.terrainRequests++ })
  page.on('response', r => {
    if (r.status() >= 400) signals.httpErrors.push({ url: r.url(), status: r.status() })
    if (r.url().startsWith('https://trek.nasa.gov') && r.status() === 200) signals.tileResponses++
  })
  try {
    const evidence = await run(page, context, signals)
    assert.deepEqual(signals.pageErrors, [], 'Unhandled application exceptions')
    const localFailures = signals.failedRequests.filter(r => r.url.startsWith(url))
    assert.deepEqual(localFailures, [], 'Failed same-origin requests')
    const localHttpErrors = signals.httpErrors.filter(r => r.url.startsWith(url))
    assert.deepEqual(localHttpErrors, [], 'Same-origin HTTP errors')
    const appConsoleErrors = signals.consoleErrors.filter(e => !/trek\.nasa\.gov|ERR_FAILED|ERR_BLOCKED_BY_CLIENT|ERR_CONNECTION/i.test(e.text + e.url))
    assert.deepEqual(appConsoleErrors, [], 'Application console errors')
    await page.screenshot({ path: `${out}/${name}.png` })
    report.scenarios.push({ name, status: 'PASS', evidence })
    console.log(`PASS ${name}`, JSON.stringify(evidence))
  } catch (error) {
    await page.screenshot({ path: `${out}/${name}-failed.png` }).catch(() => {})
    await writeFile(`${out}/${name}-failed.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'))
    report.scenarios.push({ name, status: 'FAIL', error: error.stack })
    console.log(`FAIL ${name}: ${error.message}`)
  } finally {
    report.signals.push(signals)
    await context.close()
    await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2) + '\n')
  }
}

try {
  await scenario('desktop-keyboard', {}, async (page, context, signals) => {
    await boot(page, true)
    await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()
    const manifestResponse = await context.request.get(new URL('/data/jezero/manifest.json', url).href)
    assert.equal(manifestResponse.status(), 200)
    const manifest = await manifestResponse.json()
    const asset = await context.request.get(new URL(`/data/jezero/${manifest.binary.file}`, url).href)
    assert.equal(asset.status(), 200)
    const bytes = await asset.body()
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    assert.equal(bytes.length, manifest.binary.byte_length)
    assert.equal(sha256, manifest.binary.sha256)

    const entry = page.getByRole('button', { name: 'Enter coordinates', exact: true }).first()
    await activate(page, entry)
    const dialog = page.getByRole('dialog', { name: 'Enter habitat coordinates' })
    await expect(dialog).toBeVisible()
    await typeNumber(page, dialog.getByLabel('x, metres east'), -30)
    await typeNumber(page, dialog.getByLabel('y, metres north'), 455)
    await activate(page, dialog.getByRole('button', { name: 'Place habitat', exact: true }))
    await expect(dialog.getByText(/That location cannot be used/)).toBeVisible()
    await typeNumber(page, dialog.getByLabel('x, metres east'), 1397)
    await activate(page, dialog.getByRole('button', { name: 'Place habitat', exact: true }))
    await expect(dialog).not.toBeVisible()
    await ready(page)
    const radio = page.getByRole('radiogroup', { name: 'Route preference' })
    await tabTo(page, radio.getByRole('radio', { name: 'Shortest traversable', exact: true }))
    await page.keyboard.press('ArrowRight')
    await expect(radio.getByRole('radio', { name: 'Lower slope', exact: true })).toBeChecked()
    await ready(page)
    await activate(page, page.getByRole('button', { name: 'Full summary', exact: true }))
    await expect(page.getByRole('heading', { name: 'Outbound route', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Return route', exact: true })).toBeVisible()
    const summary = await page.locator('main').innerText()
    await page.screenshot({ path: `${out}/both-routes-summary.png` })
    await activate(page, page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Mission control', exact: true }))
    await activate(page, page.getByRole('button', { name: /^Advanced assumptions/ }))
    await typeNumber(page, page.getByRole('spinbutton', { name: 'Mission start, Mars clock hours', exact: true }), 14)
    await ready(page)
    await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()
    const duration = page.getByRole('spinbutton', { name: /Activity duration|Science time at Skinner Ridge/ }).first()
    await typeNumber(page, duration, 240)
    await ready(page)
    await expect(page.getByText('Infeasible under selected assumptions', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: `${out}/science-time-infeasible.png` })
    await typeNumber(page, duration, 30)
    await ready(page)
    await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()

    await activate(page, page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Terrain', exact: true }))
    const metadata = page.locator('summary').filter({ hasText: 'Scientific metadata' })
    if (await metadata.count()) await activate(page, metadata)
    await expect(page.getByText('Verified at load', { exact: true })).toBeVisible()
    await expect(page.getByText(/Unresolved: X2b/)).toBeVisible()
    await page.screenshot({ path: `${out}/terrain-checksum.png` })
    await activate(page, page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Data sources', exact: true }))
    await expect(page.getByText(/Running on real NASA and USGS data/)).toBeVisible()
    await expect(page.getByText('An optional view of the same verified elevation model', { exact: true })).toBeVisible()
    await expect(page.getByText(/including OpenAI Codex/)).toBeVisible()
    assert.equal(signals.terrainRequests, 1, 'Terrain is fetched once across views')
    return { sha256, terrainBytes: bytes.length, terrainContentEncoding: asset.headers()['content-encoding'] ?? 'none', tileResponses: signals.tileResponses, bothRouteLegs: summary.includes('Outbound route') && summary.includes('Return route'), invalidCoordinatesRejected: true, routePreferenceKeyboard: true, scienceTimeChangesVerdict: true, checksumUi: 'Verified at load', creditsAnd3dStatus: true, x2b: 'FAIL remains disclosed' }
  })

  await scenario('tablet-768', { viewport: { width: 768, height: 1024 } }, async page => {
    await boot(page)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow')
    await page.getByRole('button', { name: 'Mission planner', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Mission planner', exact: true })
    await expect(sheet).toBeVisible()
    const entry = sheet.getByRole('button', { name: 'Enter coordinates', exact: true }).first()
    await activate(page, entry)
    await expect(page.getByRole('dialog', { name: 'Enter habitat coordinates' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Enter habitat coordinates' })).not.toBeVisible()
    await expect(sheet).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Mission planner', exact: true })).toBeFocused()
    return { viewport: '768x1024', noHorizontalOverflow: true, plannerSheet: true, coordinateDialog: true, escapeAndFocusRestoration: true }
  })

  await scenario('imagery-outage', {}, async (page, context, signals) => {
    await context.route('https://trek.nasa.gov/**', route => route.abort('failed'))
    await boot(page)
    await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.leaflet-image-layer:not(.cells)')).toBeVisible()
    await expect(page.getByText('Overlay registration ±3 m', { exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled()
    return { nasaTileRequestsBlocked: signals.failedRequests.filter(r => r.url.startsWith('https://trek.nasa.gov')).length, realDtmReliefFallback: true, routingWorks: true, noSyntheticReplacement: true }
  })
} finally {
  await browser.close()
}
if (report.scenarios.some(s => s.status === 'FAIL')) process.exitCode = 1
