/** Record the real public workflow; captions are generated from the actual action times. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect as playwrightExpect } from '@playwright/test'

const url = process.env.RELEASE_URL ?? 'https://ausnox.vercel.app'
const out = process.env.DEMO_OUT ?? 'artifacts/release-2026-11-15/demo'
const expect = playwrightExpect.configure({ timeout: 25000 })
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  reducedMotion: 'reduce',
  recordVideo: { dir: out, size: { width: 1600, height: 900 } },
})
const page = await context.newPage()
const video = page.video()
const started = Date.now()
const cues = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
const caption = text => cues.push({ start: (Date.now() - started) / 1000, text })
const hold = ms => page.waitForTimeout(ms)
const navigation = name => page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true })
const ready = () => expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled({ timeout: 45000 })

try {
  caption('AUSNOX | Jezero crater, Mars\nReal NASA/USGS observations. A hypothetical Marswalk.')
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.getByRole('button', { name: /Use nearest usable cell,/ }).click()
  await ready()
  await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()
  await hold(9000)

  caption('Compare shortest traversable and lower-slope routes.\nOutbound and return legs are calculated independently.')
  await page.getByRole('radiogroup', { name: 'Route preference' }).getByRole('radio', { name: 'Lower slope', exact: true }).press('Space')
  await ready()
  const comparison = page.locator('summary').filter({ hasText: /Compare route options|Route comparison/ })
  if (await comparison.count()) {
    await comparison.click()
    await comparison.scrollIntoViewIfNeeded()
  }
  await hold(10000)

  caption('The 3D view uses the same verified elevation grid.\nDisplay height scale does not change route measurements.')
  const cube = page.getByRole('button', { name: '3D terrain view', exact: true })
  await cube.click()
  await expect(page.locator('canvas[aria-label^="3D Jezero"]')).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
  await hold(9000)
  await cube.click()

  caption('Review both route legs, walking time and science stops.\nThe return margin accounts for the selected reserve.')
  await page.getByRole('button', { name: 'Full summary', exact: true }).click()
  await page.getByRole('heading', { name: 'Outbound route', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'Return route', exact: true })).toBeVisible()
  await hold(10000)

  caption('Move the simulated start to 14:00 Mars local solar time.\nThe original science activities still fit the window.')
  await navigation('Mission control').click()
  await page.getByRole('button', { name: /^Advanced assumptions/ }).click()
  await page.getByRole('spinbutton', { name: 'Mission start, Mars clock hours', exact: true }).fill('14')
  await ready()
  await expect(page.getByText('Feasible under selected assumptions', { exact: true }).first()).toBeVisible()
  await page.getByText('Feasible under selected assumptions', { exact: true }).first().scrollIntoViewIfNeeded()
  await hold(8000)

  caption('Increase the destination activity from 30 to 240 minutes.\nThe mission becomes infeasible: the return margin is insufficient.')
  await page.getByRole('spinbutton', { name: 'Activity duration', exact: true }).fill('240')
  await ready()
  await expect(page.getByText('Infeasible under selected assumptions', { exact: true }).first()).toBeVisible()
  await page.getByText('Infeasible under selected assumptions', { exact: true }).first().scrollIntoViewIfNeeded()
  await hold(12000)

  caption('Every source distinguishes observations, calculations and assumptions.\nX2b image registration remains unresolved; small hazards are not resolved.')
  await navigation('Data sources').click()
  await expect(page.getByRole('heading', { name: 'Data sources and methods', exact: true })).toBeVisible()
  await hold(9000)

  caption('NASA observations change a Marswalk decision.\nEducational simulation. Not operational navigation or NASA-endorsed safety advice.')
  const remaining = 90000 - (Date.now() - started)
  if (remaining > 0) await hold(remaining)
  const durationSeconds = (Date.now() - started) / 1000
  assert(durationSeconds >= 60 && durationSeconds <= 120, `Duration outside submission target: ${durationSeconds}s`)
  assert.deepEqual(errors, [], 'Application errors during recording')
  await context.close()
  await copyFile(await video.path(), `${out}/ausnox-demo.webm`)
  const timestamp = seconds => {
    const ms = Math.round(seconds * 1000)
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
  }
  const subtitles = cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cues[index + 1]?.start ?? durationSeconds)}\n${cue.text}\n`).join('\n')
  await writeFile(`${out}/ausnox-demo.srt`, subtitles)
  await writeFile(`${out}/recording.json`, JSON.stringify({ url, sourceCommit: process.env.DEMO_COMMIT ?? null, checkedUtc: new Date().toISOString(), durationSeconds, viewport: '1600x900', errors, cues }, null, 2) + '\n')
  console.log(JSON.stringify({ url, durationSeconds, video: `${out}/ausnox-demo.webm`, subtitles: `${out}/ausnox-demo.srt`, errors }))
} finally {
  await browser.close()
}
