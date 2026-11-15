import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, ConeGeometry, DirectionalLight, Group,
  Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, PerspectiveCamera,
  Plane, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { services, type GridCoord, type TerrainManifest, type TerrainRaster } from '@/services'
import { useDataStore } from '@/stores/dataStore'
import { useMapStore } from '@/stores/mapStore'
import { useMissionStore } from '@/stores/missionStore'
import { useSimStore } from '@/stores/simStore'
import { useUiStore, type PlacementMeta } from '@/stores/uiStore'
import { snapshotAt } from '@/utils/simulation'
import { createTerrainFrame, focusBounds, surfacePath, type WorldPoint } from './TerrainCoordinates'
import { createTerrainMaterial } from './TerrainMaterial'
import { buildTerrainGeometry } from './TerrainMesh'
import { activeSurface } from './surface'

export { activeSurface } from './surface'

const vector = (p: WorldPoint) => new Vector3(p.x, p.y, p.z)
/** Counts scene builds, so tests can tell a kept scene from a rebuilt one. */
let scenesBuilt = 0

function disposeObjects(group: Group) {
  group.traverse((o) => {
    if (o instanceof Mesh || o instanceof Line) {
      o.geometry.dispose()
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose()
    }
  })
  group.clear()
}

/** Imperative rendering boundary. Zustand owns every mission/result/clock; Three owns only GPU
 * resources and the camera. Rendering sleeps when controls and state are idle.
 */
export function createTerrainScene(host: HTMLDivElement, compass: HTMLSpanElement, manifest: TerrainManifest, raster: TerrainRaster,
  onFatal: (message: string) => void, onOverlayError: (message: string) => void) {
  const started = performance.now()
  let frame = createTerrainFrame(manifest, services.terrain, useUiStore.getState().verticalScale)
  let renderer: WebGLRenderer | undefined
  const cleanup: (() => void)[] = []
  try {
    const scene = new Scene()
    scene.background = new Color('#171716')
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
    const gpu = renderer
    gpu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    const canvas = gpu.domElement
    canvas.setAttribute('aria-label', '3D Jezero terrain. Drag to orbit, right drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom; R fits terrain.')
    canvas.setAttribute('aria-describedby', 'three-instructions')
    canvas.tabIndex = 0
    canvas.className = 'block h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'
    host.appendChild(canvas)
    cleanup.push(() => canvas.remove())
    const labels = new CSS2DRenderer()
    labels.domElement.className = 'pointer-events-none absolute inset-0 overflow-hidden'
    host.appendChild(labels.domElement)
    cleanup.push(() => labels.domElement.remove())
    const camera = new PerspectiveCamera(42, 1, 1, 25_000)
    const controls = new OrbitControls(camera, canvas)
    cleanup.push(() => controls.dispose())
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const setMotion = () => { controls.enableDamping = !motion.matches }
    setMotion()
    motion.addEventListener('change', setMotion)
    cleanup.push(() => motion.removeEventListener('change', setMotion))
    controls.dampingFactor = 0.16
    controls.minDistance = 70
    controls.maxDistance = Math.max(frame.widthM, frame.depthM) * 5
    controls.minPolarAngle = 0.08
    controls.maxPolarAngle = Math.PI / 2 - 0.1
    controls.screenSpacePanning = false
    controls.listenToKeyEvents(canvas)

    const ambient = new AmbientLight('#fff3e5', 1.4)
    const sun = new DirectionalLight('#fff4df', 2.2)
    sun.position.set(-800, 1000, -650)
    scene.add(ambient, sun) // illustrative cartographic lighting, not modeled solar illumination
    let surface = createTerrainMaterial(manifest, raster, activeSurface(useUiStore.getState().overlays))
    cleanup.push(() => surface.dispose())
    const meshData = buildTerrainGeometry(manifest, raster, frame)
    const terrain = new Mesh(meshData.geometry, surface.material)
    scene.add(terrain)
    cleanup.push(() => terrain.geometry.dispose())
    canvas.dataset.triangles = String(meshData.triangles)
    canvas.dataset.meshVertices = String(meshData.sourceIndices.length)
    const routes = new Group(), markers = new Group(), guides = new Group()
    scene.add(routes, markers, guides)
    cleanup.push(() => { disposeObjects(routes); disposeObjects(markers); disposeObjects(guides) })
    const walker = new Mesh(new SphereGeometry(7, 12, 8), new MeshBasicMaterial({ color: '#ffffff', depthTest: false }))
    walker.renderOrder = 6
    walker.visible = false
    scene.add(walker)
    cleanup.push(() => { walker.geometry.dispose(); walker.material.dispose() })

    let raf = 0, disposed = false, failed = false
    let frames = 0, renderTotal = 0
    const fail = (error: unknown) => {
      if (failed || disposed) return
      failed = true
      cancelAnimationFrame(raf)
      onFatal(error instanceof Error ? error.message : String(error))
    }
    const draw = () => {
      raf = 0
      if (disposed || failed) return
      // Hidden while the 2D map is shown: keep the scene, skip the GPU work. A resize on return redraws.
      if (!host.clientWidth || !host.clientHeight) return
      try {
        const changed = controls.update()
        const before = performance.now()
        gpu.render(scene, camera)
        labels.render(scene, camera)
        renderTotal += performance.now() - before
        canvas.dataset.renderMs = (renderTotal / ++frames).toFixed(2)
        canvas.dataset.frames = String(frames)
        canvas.dataset.cameraTarget = JSON.stringify(controls.target.toArray())
        compass.style.transform = `rotate(${-controls.getAzimuthalAngle() * 180 / Math.PI}deg)`
        if (changed && controls.enableDamping) invalidate()
      } catch (e) { fail(e) }
    }
    const invalidate = () => { if (!raf && !disposed && !failed) raf = requestAnimationFrame(draw) }
    cleanup.push(() => { disposed = true; cancelAnimationFrame(raf) })
    const onChange = () => {
      const old = controls.target.clone()
      controls.target.clamp(new Vector3(-frame.widthM / 2, 0, -frame.depthM / 2), new Vector3(frame.widthM / 2, frame.heightM, frame.depthM / 2))
      camera.position.add(controls.target.clone().sub(old))
      invalidate()
    }
    controls.addEventListener('change', onChange)
    cleanup.push(() => controls.removeEventListener('change', onChange))
    const fit = (points: WorldPoint[]) => {
      const { center, min, max } = focusBounds(points)
      const verticalFov = camera.fov * Math.PI / 180
      const outward = new Vector3(-0.28, 0.85, 1).normalize()
      const right = new Vector3().crossVectors(camera.up, outward).normalize()
      const up = new Vector3().crossVectors(outward, right)
      let needed = 240
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const offset = new Vector3(x - center.x, y - center.y, z - center.z)
        const depth = offset.dot(outward)
        needed = Math.max(needed, Math.abs(offset.dot(right)) / (Math.tan(verticalFov / 2) * camera.aspect) + depth, Math.abs(offset.dot(up)) / Math.tan(verticalFov / 2) + depth)
      }
      const distance = Math.min(controls.maxDistance, Math.max(controls.minDistance, needed * 1.12))
      controls.target.copy(vector(center))
      camera.position.copy(vector(center).add(outward.multiplyScalar(distance)))
      controls.update()
      invalidate()
    }
    const fitTerrain = () => fit([{ x: -frame.widthM / 2, y: 0, z: frame.depthM / 2 }, { x: frame.widthM / 2, y: frame.heightM, z: -frame.depthM / 2 }])
    const zoom = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor)))
      camera.position.copy(controls.target).add(offset)
      controls.update()
      invalidate()
    }
    const rotate = (azimuth: number, polar: number) => {
      const distance = camera.position.distanceTo(controls.target)
      const a = controls.getAzimuthalAngle() + azimuth
      const p = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, controls.getPolarAngle() + polar))
      camera.position.set(controls.target.x + distance * Math.sin(p) * Math.sin(a), controls.target.y + distance * Math.cos(p), controls.target.z + distance * Math.sin(p) * Math.cos(a))
      controls.update()
      invalidate()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(0.8) }
      if (e.key === '-') { e.preventDefault(); zoom(1.25) }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); fitTerrain() }
    }
    canvas.addEventListener('keydown', key)
    cleanup.push(() => canvas.removeEventListener('keydown', key))

    const line = (points: WorldPoint[], color: string, dashed = false, faint = false) => {
      const geometry = new BufferGeometry().setFromPoints(points.map(vector))
      const options = { color, depthTest: false, transparent: true, opacity: faint ? 0.35 : 1 }
      const material = dashed ? new LineDashedMaterial({ ...options, dashSize: 9, gapSize: 7 }) : new LineBasicMaterial(options)
      const l = new Line(geometry, material)
      l.computeLineDistances()
      l.renderOrder = dashed ? 4 : 3
      return l
    }
    const pickPoint = (point: GridCoord, meta?: PlacementMeta) => {
      const ui = useUiStore.getState()
      if (ui.placement) ui.attemptPlace(ui.placement, point, ui.placement === 'habitat' ? null : meta)
      else ui.inspect(point)
    }
    const marker = (point: GridCoord, label: string, kind: 'habitat' | 'destination' | 'stop' | 'target' | 'inspect' | 'snap', meta?: PlacementMeta, showLabel = true) => {
      const w = frame.surface(point, 2)
      const color = kind === 'destination' ? '#d98a4e' : kind === 'inspect' || kind === 'snap' ? '#e3bb5c' : kind === 'target' ? '#9aa7aa' : '#ece6da'
      const geometry = kind === 'habitat' ? new BoxGeometry(13, 13, 13) : kind === 'destination' ? new ConeGeometry(9, 23, 10) : new SphereGeometry(kind === 'target' ? 4 : 6, 10, 8)
      const m = new Mesh(geometry, new MeshBasicMaterial({ color, depthTest: false, wireframe: kind === 'stop' || kind === 'target' || kind === 'snap' }))
      m.position.copy(vector(w)).add(new Vector3(0, 9, 0))
      m.renderOrder = 5
      markers.add(m)
      if (!showLabel) return
      const passive = kind === 'inspect' || kind === 'snap'
      const button = document.createElement(passive ? 'span' : 'button')
      button.className = 'three-marker'
      button.textContent = label
      button.title = label
      button.style.pointerEvents = passive ? 'none' : 'auto'
      if (button instanceof HTMLButtonElement) {
        button.type = 'button'
        button.addEventListener('click', () => pickPoint(point, meta))
      }
      const tag = new CSS2DObject(button)
      tag.position.copy(vector(w)).add(new Vector3(0, 24, 0))
      markers.add(tag)
    }

    const updateWalker = () => {
      try {
        const mission = useMissionStore.getState(), sim = useSimStore.getState()
        const r = mission.routes[mission.config.routeMode], a = mission.assessments[mission.config.routeMode]
        const current = !mission.stale && mission.status === 'done'
        const snap = snapshotAt(current && a?.status === 'ok' ? a.assessment : null, current && r?.status === 'ok' ? r.route : null, sim.simS, mission.config.assumptions.startLtstHours)
        walker.visible = current && snap.position !== null
        if (walker.visible && snap.position) {
          walker.position.copy(vector(frame.surface(snap.position, 12)))
          canvas.dataset.walkerGrid = JSON.stringify(snap.position)
        } else delete canvas.dataset.walkerGrid
        invalidate()
      } catch (e) { walker.visible = false; onOverlayError(String(e)) }
    }
    const updateMission = () => {
      disposeObjects(routes); disposeObjects(markers); disposeObjects(guides)
      const mission = useMissionStore.getState(), ui = useUiStore.getState()
      const problems: string[] = []
      const attempt = (f: () => void) => { try { f() } catch (e) { problems.push(e instanceof Error ? e.message : String(e)) } }
      const result = mission.routes[mission.config.routeMode]
      let routeVertices = 0
      if (result?.status === 'ok') attempt(() => {
        const outbound = surfacePath(result.route.outbound.path, frame, manifest.grid.cellSizeM)
        const inbound = surfacePath(result.route.inbound.path, frame, manifest.grid.cellSizeM, 1)
        routeVertices = outbound.length + inbound.length
        const stale = mission.stale || mission.status !== 'done'
        routes.add(line(outbound, '#7ed3de', false, stale), line(inbound, '#ece6da', true, stale))
      })
      if (ui.compare) {
        const other = mission.routes[mission.config.routeMode === 'shortest' ? 'lower-slope' : 'shortest']
        if (other?.status === 'ok') attempt(() => routes.add(line(surfacePath(other.route.outbound.path, frame, manifest.grid.cellSizeM), '#7ed3de', true, true), line(surfacePath(other.route.inbound.path, frame, manifest.grid.cellSizeM), '#ece6da', true, true)))
      }
      canvas.dataset.routeVertices = String(routeVertices)
      const c = mission.config
      if (ui.features.waypoints) for (const wp of useDataStore.getState().waypoints) attempt(() => marker(wp.position, wp.title, 'target', { label: wp.title, waypointId: wp.id, durationMin: wp.suggestedDurationMin }, c.destination?.waypointId !== wp.id && !c.stops.some((s) => s.waypointId === wp.id)))
      if (c.habitat) attempt(() => marker(c.habitat!.position, 'Habitat · hypothetical', 'habitat'))
      if (c.destination) attempt(() => marker(c.destination!.position, 'Destination', 'destination'))
      c.stops.forEach((s, i) => attempt(() => marker(s.position, `${i + 1} · Science stop`, 'stop')))
      if (ui.inspected && !ui.placementIssue) attempt(() => marker(ui.inspected!.grid, 'Selected cell', 'inspect'))
      if (ui.placementIssue?.snap) attempt(() => marker(ui.placementIssue!.snap!, 'Proposed snap · confirm to use', 'snap'))
      onOverlayError(problems.join(' '))
      updateWalker()
      invalidate()
    }
    // Use the measured boundary cell centres for the coverage guide (not the outside raster edge).
    const coverage = manifest.coverage
    const boundaryPoints = () => {
      const dx = manifest.grid.widthM / raster.widthCells / 2, dy = manifest.grid.heightM / raster.heightCells / 2
      return coverage.map((p) => ({ x: Math.max(dx, Math.min(manifest.grid.widthM - dx, p.x)), y: Math.max(dy, Math.min(manifest.grid.heightM - dy, p.y)) }))
    }
    const updateGuides = () => {
      disposeObjects(guides)
      const ui = useUiStore.getState()
      try {
        if (ui.features.coverage) guides.add(line(surfacePath(boundaryPoints(), frame, manifest.grid.cellSizeM), '#aaa69d', true))
        if (ui.features.grid) {
          const dx = manifest.grid.widthM / raster.widthCells / 2, dy = manifest.grid.heightM / raster.heightCells / 2
          for (let x = 500; x < manifest.grid.widthM; x += 500) guides.add(line(surfacePath([{ x, y: dy }, { x, y: manifest.grid.heightM - dy }], frame, manifest.grid.cellSizeM), '#54504a', true))
          for (let y = 500; y < manifest.grid.heightM; y += 500) guides.add(line(surfacePath([{ x: dx, y }, { x: manifest.grid.widthM - dx, y }], frame, manifest.grid.cellSizeM), '#54504a', true))
        }
      } catch { /* Unsupported guide segments are omitted; routes and markers report errors above. */ }
    }
    const update = () => { updateMission(); updateGuides() }
    /** Rebuilds only the terrain geometry for a new exaggeration; camera, materials and markers stay. */
    function setScale(scale: number) {
      frame = createTerrainFrame(manifest, services.terrain, scale)
      const next = buildTerrainGeometry(manifest, raster, frame)
      terrain.geometry.dispose(); terrain.geometry = next.geometry
      canvas.dataset.verticalScale = String(scale)
      update(); invalidate()
    }
    cleanup.push(useMissionStore.subscribe((s, previous) => {
      if (s.config !== previous.config || s.routes !== previous.routes || s.status !== previous.status || s.stale !== previous.stale) update()
    }))
    cleanup.push(useSimStore.subscribe((s, previous) => { if (s.simS !== previous.simS) updateWalker() }))
    const focusPoint = (p: GridCoord) => fit([frame.surface(p)])
    cleanup.push(useUiStore.subscribe((s, previous) => {
      try {
        if (s.focus !== previous.focus) { if (s.focus.point) focusPoint(s.focus.point); else fitTerrain() }
        if (s.verticalScale !== previous.verticalScale) setScale(s.verticalScale)
        if (s.overlays !== previous.overlays) {
          const next = createTerrainMaterial(manifest, raster, activeSurface(s.overlays))
          surface.dispose(); surface = next; terrain.material = surface.material; invalidate()
        }
        if (s.features !== previous.features || s.compare !== previous.compare || s.inspected !== previous.inspected || s.placementIssue !== previous.placementIssue) update()
        canvas.style.cursor = s.placement ? 'crosshair' : 'grab'
      } catch (e) { onOverlayError(String(e)) }
    }))
    const raycaster = new Raycaster(), pointer = new Vector2(), ground = new Plane(new Vector3(0, 1, 0), 0)
    const hit = (e: PointerEvent): GridCoord | null => {
      const rect = canvas.getBoundingClientRect()
      pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const intersection = raycaster.intersectObject(terrain)[0]?.point ?? raycaster.ray.intersectPlane(ground, new Vector3())
      return intersection ? frame.worldToGrid(intersection) : null
    }
    let down = { x: 0, y: 0 }, moved = false, multiTouch = false, lastHover = 0
    const pointers = new Set<number>()
    const pointerDown = (e: PointerEvent) => {
      if (!pointers.size) { down = { x: e.clientX, y: e.clientY }; moved = false; multiTouch = false }
      pointers.add(e.pointerId)
      if (pointers.size > 1) multiTouch = true
    }
    const pointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) moved = true
      if (e.buttons || performance.now() - lastHover < 65) return
      lastHover = performance.now()
      const p = hit(e)
      useMapStore.setState({ hover: p ? services.terrain.sample(p) : null })
    }
    const pointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (e.button === 0 && !multiTouch && !moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 5) { const p = hit(e); if (p) pickPoint(p) }
    }
    const pointerCancel = (e: PointerEvent) => { pointers.delete(e.pointerId); moved = true }
    const leave = () => useMapStore.setState({ hover: null })
    const lost = (e: Event) => { e.preventDefault(); fail(new Error('WebGL context lost. Return to 2D or reopen 3D to retry.')) }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerCancel)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('webglcontextlost', lost)
    cleanup.push(() => {
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('pointercancel', pointerCancel)
      canvas.removeEventListener('webglcontextlost', lost)
      useMapStore.setState({ threeControls: null, hover: null })
    })
    const resize = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width < 1 || height < 1) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      gpu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      gpu.setSize(width, height)
      labels.setSize(width, height)
      invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    cleanup.push(() => observer.disconnect())
    resize(); fitTerrain(); update()
    const focusRoute = () => {
      const mission = useMissionStore.getState(), result = mission.routes[mission.config.routeMode]
      if (result?.status === 'ok') fit([...result.route.outbound.path, ...result.route.inbound.path].map((p) => frame.surface(p)))
    }
    useMapStore.setState({ threeControls: { zoom, fitTerrain, focusPoint, focusRoute, rotate } })
    canvas.dataset.buildMs = (performance.now() - started).toFixed(2)
    canvas.dataset.sceneId = String(++scenesBuilt)
    canvas.dataset.verticalScale = String(frame.verticalScale)
    return {
      fitTerrain, zoom, rotate,
      focusPoint,
      focusRoute,
      setScale,
      dispose: () => { for (const f of cleanup.reverse()) f(); gpu.dispose(); gpu.forceContextLoss() },
    }
  } catch (e) {
    for (const f of cleanup.reverse()) f()
    renderer?.dispose()
    renderer?.forceContextLoss()
    throw e
  }
}

export type TerrainScene = ReturnType<typeof createTerrainScene>
