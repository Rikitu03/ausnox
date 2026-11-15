import { DataTexture, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three'
import type { TerrainManifest, TerrainRaster } from '@/services/contracts'
import { ELEVATION_RAMP, SLOPE_CLASSES } from '@/services/adapters/real/render'
import { hasElevation } from './TerrainCoordinates'

import type { SurfaceStyle } from './surface'

export { SURFACE_LABELS, type SurfaceStyle } from './surface'

/** Overlay extension boundary: full-resolution scientific raster -> RGBA, independently of geometry.
 * Future layers must supply their own verified data, provenance and legend; none are simulated here.
 */
export function terrainPixels(manifest: TerrainManifest, raster: TerrainRaster, style: SurfaceStyle) {
  const pixels = new Uint8Array(raster.widthCells * raster.heightCells * 4)
  const [min, max] = manifest.elevationRangeM
  for (let i = 0; i < raster.elevationM.length; i++) {
    if (!hasElevation(raster, i)) continue
    const row = Math.floor(i / raster.widthCells), col = i % raster.widthCells
    const t = Math.max(0, Math.min(0.99999, (raster.elevationM[i]! - min) / (max - min || 1)))
    let color: readonly number[]
    if (style === 'slope') {
      if (raster.validity[i] !== 1 || !Number.isFinite(raster.slopeDeg[i])) color = (row + col) % 6 < 2 ? [210, 210, 210] : [85, 85, 85]
      else {
        const cls = SLOPE_CLASSES.find((k) => raster.slopeDeg[i]! < k.maxDeg)!
        color = cls === SLOPE_CLASSES[0] ? [128, 111, 93] : cls.pattern === 'hatch' && (row + col) % 6 < 2 ? [76, 33, 28] : cls.rgba
      }
    } else if (style === 'elevation') {
      const n = t * (ELEVATION_RAMP.length - 1), a = ELEVATION_RAMP[Math.floor(n)]!, b = ELEVATION_RAMP[Math.floor(n) + 1]!
      color = a.map((v, k) => v + (b[k]! - v) * (n % 1))
    } else {
      const contour = ((raster.elevationM[i]! - min) % 10) < 0.35 ? 0.85 : 1
      color = [(151 + t * 43) * contour, (115 + t * 40) * contour, (91 + t * 37) * contour]
    }
    pixels.set([color[0]!, color[1]!, color[2]!, 255], i * 4)
  }
  return pixels
}

export function createTerrainMaterial(manifest: TerrainManifest, raster: TerrainRaster, style: SurfaceStyle) {
  const texture = new DataTexture(terrainPixels(manifest, raster, style), raster.widthCells, raster.heightCells, RGBAFormat)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  const material = style === 'relief'
    ? new MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 })
    : new MeshBasicMaterial({ map: texture })
  return { material, texture, dispose: () => { material.dispose(); texture.dispose() } }
}
