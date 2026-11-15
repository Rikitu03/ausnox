import { expect, test, type Page } from '@playwright/test'

const screenshots = 'docs/screenshots/3d'
async function openMission(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Use nearest usable cell,/ }).click()
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled()
}
const enter3D = async (page: Page) => {
  const toggle = page.getByRole('button', { name: '3D terrain view', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const canvas = page.locator('canvas[aria-label^="3D Jezero"]')
  await expect(canvas).toHaveAttribute('data-triangles', '80000')
  await expect(canvas).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
  await expect(page.getByText('3D overlay error:', { exact: false })).toHaveCount(0)
  return canvas
}

test('production DEM, both routes, camera, simulation, styles and shared mission controls', async ({ page }, info) => {
  const errors: string[] = [], failed: string[] = [], dataRequests: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.startsWith('https://trek.nasa.gov')) errors.push(m.text()) })
  page.on('requestfailed', (r) => failed.push(r.url()))
  page.on('request', (r) => { if (r.url().includes('/data/jezero/terrain.bin')) dataRequests.push(r.url()) })
  await openMission(page)
  await expect(page.getByRole('radiogroup', { name: 'Map visualization' })).toHaveCount(0)
  await page.screenshot({ path: `${screenshots}/01-2d-mission-control.png` })
  const clock = page.getByRole('region', { name: 'Simulated mission clock' })
  const before = await clock.innerText()
  const canvas = await enter3D(page)
  expect(await clock.innerText()).toBe(before)
  await expect(page.getByLabel('Vertical scale', { exact: true })).toHaveValue('1')
  await page.getByLabel('3D surface').selectOption('relief')
  await page.screenshot({ path: `${screenshots}/02-3d-overview.png` })
  await page.getByLabel('3D surface').selectOption('elevation')
  await expect(page.getByText('Elevation · Mars areoid')).toBeVisible()
  await page.screenshot({ path: `${screenshots}/03-3d-elevation.png` })
  await page.getByLabel('3D surface').selectOption('slope')
  await page.screenshot({ path: `${screenshots}/04-3d-slope.png` })

  const bounds = (await canvas.boundingBox())!
  const frameMeasure = page.evaluate(() => new Promise<{ meanMs: number; p95Ms: number; frames: number }>((resolve) => {
    const times: number[] = [], start = performance.now()
    let previous = start
    const sample = (now: number) => {
      times.push(now - previous); previous = now
      if (now - start < 1200) requestAnimationFrame(sample)
      else {
        times.shift()
        const sorted = [...times].sort((a, b) => a - b)
        resolve({ frames: times.length, meanMs: times.reduce((a, b) => a + b, 0) / times.length, p95Ms: sorted[Math.floor(sorted.length * 0.95)]! })
      }
    }
    requestAnimationFrame(sample)
  }))
  await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.55, { steps: 60 })
  await page.mouse.up()
  const gestureFrames = await frameMeasure
  const overviewMetrics = await canvas.evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2')!
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return { ...((node as HTMLCanvasElement).dataset), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), userAgent: navigator.userAgent, pixelRatio: devicePixelRatio }
  })
  const idle = await canvas.getAttribute('data-frames')
  await page.waitForTimeout(200)
  expect(await canvas.getAttribute('data-frames')).toBe(idle)

  await page.getByRole('button', { name: 'Camera & inspect' }).click()
  await page.getByRole('button', { name: 'Focus habitat', exact: true }).click()
  const habitatTarget = await canvas.getAttribute('data-camera-target')
  await page.getByRole('button', { name: 'Focus destination', exact: true }).click()
  await expect.poll(() => canvas.getAttribute('data-camera-target')).not.toBe(habitatTarget)
  await page.getByRole('button', { name: 'Focus route', exact: true }).click()
  await page.getByRole('button', { name: 'Orbit left', exact: true }).click()
  await page.getByRole('button', { name: 'Tilt down', exact: true }).click()
  await page.getByLabel('Inspect x metres east').fill('800')
  await page.getByLabel('Inspect y metres north').fill('800')
  await page.getByRole('button', { name: 'Inspect coordinates', exact: true }).click()
  await expect(page.getByText('Measured terrain · valid', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Camera & inspect' }).click()
  await page.screenshot({ path: `${screenshots}/05-3d-routes.png` })
  const home = await canvas.getAttribute('data-walker-grid')
  await clock.getByRole('button', { name: 'Start simulation' }).click()
  await expect.poll(() => canvas.getAttribute('data-walker-grid')).not.toBe(home)
  await clock.getByRole('button', { name: 'Pause simulation' }).click()
  const paused = await canvas.getAttribute('data-walker-grid')
  // Wait for camera damping/async tasks to settle; a paused mission must stay still.
  await page.waitForTimeout(350)
  expect(await canvas.getAttribute('data-walker-grid')).toBe(paused)
  await page.screenshot({ path: `${screenshots}/06-3d-simulation.png` })
  // Real raycast picks a measured source cell; clicking must not move mission endpoints.
  await page.getByRole('button', { name: 'Fit terrain coverage' }).click()
  await canvas.click({ position: { x: bounds.width * 0.5, y: bounds.height * 0.5 } })
  await expect(page.getByText('Measured terrain · valid', { exact: true })).toBeVisible()

  const selectedRoute = page.getByRole('radiogroup', { name: 'Route preference' })
  await selectedRoute.getByRole('radio', { name: 'Lower slope' }).press('Space')
  await expect(canvas).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await expect(selectedRoute.getByRole('radio', { name: 'Lower slope' })).toBeChecked()
  await expect(clock.getByRole('button', { name: /Resume|Start/ })).toBeVisible()
  await enter3D(page)
  await page.getByLabel('Vertical scale', { exact: true }).selectOption('3')
  await expect(page.getByText('3× visual only', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await enter3D(page)
  await expect(page.getByLabel('Vertical scale', { exact: true })).toHaveValue('1')
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
    await enter3D(page)
  }
  expect(dataRequests).toHaveLength(1)
  const metrics = await canvas.evaluate((node) => ({ ...((node as HTMLCanvasElement).dataset) }))
  await info.attach('render-metrics', { body: JSON.stringify({ metrics, overviewMetrics, gestureFrames, failedRequests: failed, consoleErrors: errors }, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
  expect(failed.filter((u) => !u.startsWith('https://trek.nasa.gov'))).toEqual([])

  // Existing keyboard placement workflow remains available in the 3D workspace.
  await page.getByRole('button', { name: 'Enter coordinates', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Enter habitat coordinates' })
  await dialog.getByLabel('x, metres east').fill('-30')
  await dialog.getByLabel('y, metres north').fill('500')
  await dialog.getByRole('button', { name: 'Place habitat', exact: true }).click()
  await expect(dialog.getByText('That location cannot be used')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
  await page.getByRole('switch', { name: 'Show the other mode on the map' }).click()
  await expect(canvas).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-route-vertices', '0')
  await expect(canvas).not.toHaveAttribute('data-walker-grid', /.+/)
  await page.getByRole('button', { name: 'Sample', exact: true }).click()
  await page.getByRole('button', { name: /Use nearest usable cell,/ }).click()
  await expect(canvas).toHaveAttribute('data-route-vertices', /^[1-9]\d*$/)
})

test('tablet 3D layout and WebGL context loss preserve the route and working 2D map', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await openMission(page)
  const canvas = await enter3D(page)
  await page.getByLabel('3D surface').selectOption('relief')
  await page.screenshot({ path: `${screenshots}/07-tablet-3d.png` })
  const box = await canvas.boundingBox()
  expect(box!.width).toBeGreaterThan(400); expect(box!.height).toBeGreaterThan(250)
  await page.setViewportSize({ width: 1024, height: 820 })
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(box!.width)
  await page.getByRole('button', { name: 'Fit terrain coverage' }).click()
  await page.setViewportSize({ width: 820, height: 1180 })
  await canvas.evaluate((node) => {
    const context = (node as HTMLCanvasElement).getContext('webgl2')
    context!.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await expect(page.getByRole('heading', { name: '3D terrain unavailable' })).toBeVisible()
  await expect(page.locator('.three-marker')).toHaveCount(0)
  await page.screenshot({ path: `${screenshots}/08-webgl-fallback.png` })
  await page.getByRole('button', { name: 'Return to 2D Map', exact: true }).click()
  await expect(page.getByRole('button', { name: '3D terrain view', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start simulation' })).toBeEnabled()
})

test('WebGL unavailable is contained and preserves the mission', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof getContext
  })
  await openMission(page)
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await expect(page.getByRole('heading', { name: '3D terrain unavailable' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to 2D Map', exact: true }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
})
