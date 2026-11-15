import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  eastToWestLongitude,
  geographicToGrid,
  geographicToProjected,
  greatCircleDistanceM,
  gridToGeographic,
  groundCellWidthM,
  groundDistanceBetweenCellsM,
  normalizeLongitude180,
  normalizeLongitude360,
  planetocentricToPlanetographicLatitude,
  planetographicToPlanetocentricLatitude,
  projectedToGeographic,
  validateGeographicCoordinate,
  westToEastLongitude,
  type GridGeometry,
} from '../src/index.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/proj_vectors.json', import.meta.url), 'utf8')) as {
  vectors: { lon_east: number; lat_north: number; x_m: number; y_m: number; col: number | null; row: number | null }[]
}
const manifest = JSON.parse(readFileSync(new URL('../../../public/data/jezero/manifest.json', import.meta.url), 'utf8'))
const G: GridGeometry = {
  width: manifest.grid.width, height: manifest.grid.height, originXM: manifest.grid.origin_x_m, originYM: manifest.grid.origin_y_m,
  cellSizeXM: manifest.grid.cell_size_x_m, cellSizeYM: manifest.grid.cell_size_y_m, sphereRadiusM: 3_396_190, latitudeOfTrueScaleDeg: 0, centralMeridianDeg: 0,
}

describe('Mars longitude/latitude conventions', () => {
  it('normalises east longitude', () => {
    expect(normalizeLongitude180(282.55)).toBeCloseTo(-77.45, 12)
    expect(normalizeLongitude180(180)).toBe(-180)
    expect(normalizeLongitude180(-180)).toBe(-180)
    expect(normalizeLongitude360(-77.45)).toBeCloseTo(282.55, 12)
  })
  it('converts east <-> west longitude (Mars24 uses west-positive)', () => {
    expect(eastToWestLongitude(77.45)).toBeCloseTo(282.55, 12)
    expect(eastToWestLongitude(-175.298)).toBeCloseTo(175.298, 12)
    expect(westToEastLongitude(184.702)).toBeCloseTo(175.298, 12)
    expect(eastToWestLongitude(0)).toBe(0)
  })
  it('planetocentric <-> planetographic round trip; graphic is larger in magnitude', () => {
    const g = planetocentricToPlanetographicLatitude(18.456)
    expect(g).toBeGreaterThan(18.456)
    // tan(phi_g) = (a/b)^2 tan(phi_c), a = 3396190 m, b = 3376200 m (independently computed: +0.2041028 deg)
    expect(g - 18.456).toBeCloseTo(0.2041028, 6)
    expect(planetographicToPlanetocentricLatitude(g)).toBeCloseTo(18.456, 10)
    expect(planetocentricToPlanetographicLatitude(0)).toBe(0)
  })
  it('rejects invalid coordinates', () => {
    expect(validateGeographicCoordinate({ lonEast: Number.NaN, latNorth: 0 }).status).toBe('error')
    expect(validateGeographicCoordinate({ lonEast: 0, latNorth: 91 }).status).toBe('error')
    expect(validateGeographicCoordinate(null).status).toBe('error')
    const ok = validateGeographicCoordinate({ lonEast: 437.4, latNorth: 18 })
    expect(ok.status === 'ok' && ok.value.lonEast).toBeCloseTo(77.4, 10)
  })
})

describe('projection matches PROJ (pyproj) vectors generated from the real CRS', () => {
  it.each(fixture.vectors)('lon $lon_east lat $lat_north', (v) => {
    const p = geographicToProjected({ lonEast: v.lon_east, latNorth: v.lat_north }, G)
    expect(Math.abs(p.xM - v.x_m)).toBeLessThan(1e-6)
    expect(Math.abs(p.yM - v.y_m)).toBeLessThan(1e-6)
    const back = projectedToGeographic(p, G)
    expect(back.lonEast).toBeCloseTo(normalizeLongitude180(v.lon_east), 9)
    expect(back.latNorth).toBeCloseTo(v.lat_north, 9)
    const loc = geographicToGrid({ lonEast: v.lon_east, latNorth: v.lat_north }, G)
    if (v.col === null) {
      expect(loc.status).toBe('error')
      expect(loc.status === 'error' && loc.code).toBe('NO_COVERAGE')
    } else {
      expect(loc.status).toBe('ok')
      if (loc.status === 'ok') expect(loc.cell).toEqual({ row: v.row, col: v.col })
    }
  })
})

describe('grid transforms on the real Jezero grid geometry', () => {
  it('cell -> geographic -> cell round trips exactly for many cells', () => {
    for (let k = 0; k < 2000; k++) {
      const cell = { row: (k * 397) % G.height, col: (k * 211) % G.width }
      const geo = gridToGeographic(cell, G)!
      const loc = geographicToGrid(geo, G)
      expect(loc.status).toBe('ok')
      if (loc.status === 'ok') expect(loc.cell).toEqual(cell)
    }
  })
  it('rejects coordinates outside the AOI instead of clamping', () => {
    const b = manifest.grid.bounds_geographic_deg
    for (const geo of [
      { lonEast: b.west - 1e-6, latNorth: (b.south + b.north) / 2 },
      { lonEast: b.east + 1e-6, latNorth: (b.south + b.north) / 2 },
      { lonEast: (b.west + b.east) / 2, latNorth: b.north + 1e-6 },
      { lonEast: (b.west + b.east) / 2, latNorth: b.south - 1e-6 },
      { lonEast: 0, latNorth: 0 },
    ]) {
      const r = geographicToGrid(geo, G)
      expect(r.status === 'error' && r.code).toBe('NO_COVERAGE')
    }
    expect(gridToGeographic({ row: -1, col: 0 }, G)).toBeNull()
    expect(gridToGeographic({ row: 0, col: G.width }, G)).toBeNull()
  })
  it('longitude/latitude order: x follows longitude, rows grow southward', () => {
    const a = gridToGeographic({ row: 10, col: 10 }, G)!
    const east = gridToGeographic({ row: 10, col: 11 }, G)!
    const south = gridToGeographic({ row: 11, col: 10 }, G)!
    expect(east.lonEast).toBeGreaterThan(a.lonEast)
    expect(east.latNorth).toBe(a.latNorth)
    expect(south.latNorth).toBeLessThan(a.latNorth)
  })
  it('ground distances use cos(latitude) east-west and 2 m north-south', () => {
    const w = groundCellWidthM(400, G)
    expect(w).toBeCloseTo(2 * Math.cos((18.456 * Math.PI) / 180), 3)
    expect(groundDistanceBetweenCellsM({ row: 400, col: 100 }, { row: 400, col: 200 }, G)).toBeCloseTo(100 * w, 6)
    expect(groundDistanceBetweenCellsM({ row: 100, col: 5 }, { row: 200, col: 5 }, G)).toBeCloseTo(200, 9)
    // planar estimate agrees with great-circle distance at AOI scale
    const p = gridToGeographic({ row: 50, col: 50 }, G)!
    const q = gridToGeographic({ row: 750, col: 760 }, G)!
    const planar = groundDistanceBetweenCellsM({ row: 50, col: 50 }, { row: 750, col: 760 }, G)
    expect(Math.abs(planar - greatCircleDistanceM(p, q)) / planar).toBeLessThan(1e-4)
  })
})
