import { expect, test, type Locator, type Page } from '@playwright/test'

/*
 * The immersive workspace: collapsible panels, focus map and the shared map container. These checks
 * measure real layout in Chromium, which jsdom cannot: map and canvas sizes, Leaflet keeping its
 * centre while the container changes, and the 3D camera aspect following the canvas.
 */

const shots = 'docs/screenshots/workspace'

async function openMission(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('ausnox.panels.v1'))
  await page.goto('/')
  await page.getByRole('button', { name: /Use nearest usable cell,/ }).click()
  await expect(page.getByRole('button', { name: 'Start simulation', exact: true })).toBeEnabled()
}

const box = async (l: Locator) => (await l.boundingBox())!
const settle = (page: Page) => page.waitForTimeout(350)

test('desktop: panels collapse on their own, the map takes the space and keeps its centre', async ({ page }) => {
  await openMission(page)
  const map = page.locator('.leaflet-container')
  const habitat = page.locator('.mk-habitat')
  const viewport = page.viewportSize()!
  const full = await box(map)
  expect(full.width).toBeLessThan(viewport.width - 600)
  const planner = page.getByRole('region', { name: 'Mission planner' })
  const panelWidth = (await box(planner)).width
  expect(panelWidth).toBeGreaterThanOrEqual(320)
  expect(panelWidth).toBeLessThanOrEqual(380)
  // The scale bar is drawn from the zoom level, so an unchanged bar means an unchanged zoom.
  const scaleBar = page.getByLabel(/^Map scale: bar is/)
  const scale = { label: await scaleBar.getAttribute('aria-label'), width: (await box(scaleBar.locator('span').first())).width }

  // Left collapsed: the map grows left by the panel width and Leaflet keeps the same geographic centre,
  // so a marker moves by half the growth.
  const before = await box(habitat)
  await page.getByRole('button', { name: 'Hide mission planner' }).click()
  await settle(page)
  await expect(planner).toBeHidden()
  const left = await box(map)
  expect(left.x).toBeLessThan(2)
  expect(left.width - full.width).toBeCloseTo(panelWidth, -1)
  const after = await box(habitat)
  expect(after.x - before.x).toBeCloseTo(-(left.width - full.width) / 2, -1)
  await expect(page.getByRole('region', { name: 'Mission status' })).toBeVisible()
  await page.screenshot({ path: `${shots}/after-desktop-2d-left-collapsed.png` })

  // Both collapsed: no reserved columns.
  await page.getByRole('button', { name: 'Hide mission status' }).click()
  await settle(page)
  const both = await box(map)
  expect(both.width).toBeGreaterThan(viewport.width - 2)
  await expect(page.getByRole('button', { name: 'Show mission planner' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show mission status' })).toBeVisible()
  await page.screenshot({ path: `${shots}/after-desktop-2d-both-collapsed.png` })

  // Zoom never changed with any of it, and imagery reaches the newly exposed left edge.
  expect(await scaleBar.getAttribute('aria-label')).toBe(scale.label)
  expect((await box(scaleBar.locator('span').first())).width).toBeCloseTo(scale.width, 0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const m = document.querySelector('.leaflet-container')!.getBoundingClientRect()
        return [...document.querySelectorAll<HTMLImageElement>('.leaflet-tile-loaded')].some((t) => {
          const r = t.getBoundingClientRect()
          return r.left <= m.left + 2 && r.right > m.left + 40 && r.top < m.top + m.height / 2 && r.bottom > m.top + m.height / 2
        })
      }),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Show mission planner' }).click()
  await page.getByRole('button', { name: 'Show mission status' }).click()
  await settle(page)
  expect((await box(map)).width).toBeCloseTo(full.width, -1)
})

test('focus map in 2D and 3D: full workspace, camera kept, exact layout restored', async ({ page }) => {
  await openMission(page)
  await page.getByRole('button', { name: 'Hide mission status' }).click()
  await page.getByRole('button', { name: 'Focus map', exact: true }).click()
  await settle(page)
  const map = page.locator('.leaflet-container')
  expect((await box(map)).width).toBeGreaterThan(page.viewportSize()!.width - 2)
  await expect(page.getByRole('region', { name: 'Mission planner' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Exit focus map' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Legend' })).toBeVisible()
  await page.screenshot({ path: `${shots}/after-desktop-2d-focus.png` })

  // Simulation keeps working while focused.
  const clock = page.getByRole('region', { name: 'Simulated mission clock' })
  await clock.getByRole('button', { name: 'Start simulation' }).click()
  await expect(page.locator('.mk-walker')).toBeVisible()
  await clock.getByRole('button', { name: 'Pause simulation' }).click()

  // 3D while focused: the canvas fills the workspace with an undistorted camera.
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  const canvas = page.locator('canvas[aria-label^="3D Jezero"]')
  await expect(canvas).toHaveAttribute('data-triangles', '80000')
  await page.getByLabel('3D surface').selectOption('elevation')
  await settle(page)
  const c = await box(canvas)
  expect(c.width).toBeGreaterThan(page.viewportSize()!.width - 2)
  const aspect = await canvas.evaluate((n) => (n as HTMLCanvasElement).width / (n as HTMLCanvasElement).height)
  expect(aspect).toBeCloseTo(c.width / c.height, 1)
  await page.getByRole('button', { name: 'Camera & inspect' }).click()
  await page.getByRole('button', { name: 'Focus route', exact: true }).click()
  await page.keyboard.press('Escape') // closes the popover, not focus mode
  await expect(page.getByRole('button', { name: 'Exit focus map' })).toBeVisible()
  await settle(page)
  const target = await canvas.getAttribute('data-camera-target')
  await page.screenshot({ path: `${shots}/after-desktop-3d-focus.png` })

  // Exit: the planner comes back, status stays collapsed as it was, the camera does not move.
  await page.keyboard.press('Escape')
  await settle(page)
  await expect(page.getByRole('region', { name: 'Mission planner' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mission status' })).toBeHidden()
  await expect(canvas).toHaveAttribute('data-camera-target', target!)
  const narrower = await box(canvas)
  expect(narrower.width).toBeLessThan(c.width - 300)
  const aspect2 = await canvas.evaluate((n) => (n as HTMLCanvasElement).width / (n as HTMLCanvasElement).height)
  expect(aspect2).toBeCloseTo(narrower.width / narrower.height, 1)

  // 2D → 3D → 2D with a panel collapsed keeps the panel state and the scene.
  const scene = await canvas.getAttribute('data-scene-id')
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Mission status' })).toBeHidden()
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-scene-id', scene!)
  await expect(page.getByLabel('3D surface')).toHaveValue('elevation')
  await page.screenshot({ path: `${shots}/after-desktop-3d.png` })
})

test('browser resize across breakpoints keeps the map filling the workspace', async ({ page }) => {
  await openMission(page)
  await page.screenshot({ path: `${shots}/after-desktop-2d.png` })
  for (const [width, height, name] of [[1024, 768, 'tablet'], [390, 844, 'mobile'], [1568, 1040, null]] as const) {
    await page.setViewportSize({ width, height })
    await settle(page)
    const m = await box(page.locator('.leaflet-container'))
    if (name) expect(m.width).toBeGreaterThan(width - 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (name) await page.screenshot({ path: `${shots}/after-${name}-2d.png` })
  }
})

test('tablet drawers and phone sheets: one at a time, Escape closes, map interaction returns', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openMission(page)
  const planner = page.getByRole('region', { name: 'Mission planner' })
  await page.getByRole('button', { name: 'Mission planner', exact: true }).click()
  await expect(planner).toBeVisible()
  await expect(planner).toBeFocused()
  await page.screenshot({ path: `${shots}/after-tablet-2d-drawer.png` })
  await page.getByRole('button', { name: 'Close mission planner' }).click()
  await expect(planner).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mission planner', exact: true })).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Mission status', exact: true }).click()
  const sheet = page.getByRole('region', { name: 'Mission status' })
  await expect(sheet).toBeVisible()
  const s = await box(sheet)
  expect(s.width).toBeCloseTo(390, -1)
  await page.screenshot({ path: `${shots}/after-mobile-2d-sheet.png` })
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // The map takes clicks again: selecting a cell shows it lower-right.
  const m = await box(page.locator('.leaflet-container'))
  await page.mouse.click(m.x + m.width / 2, m.y + m.height * 0.4)
  await expect(page.getByText(/^(Measured|Demo) terrain · /)).toBeVisible()
  await page.getByRole('button', { name: '3D terrain view', exact: true }).click()
  await expect(page.locator('canvas[aria-label^="3D Jezero"]')).toHaveAttribute('data-triangles', '80000')
  await settle(page)
  await page.screenshot({ path: `${shots}/after-mobile-3d.png` })
})
