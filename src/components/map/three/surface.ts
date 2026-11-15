/**
 * 3D surface styles. Kept free of `three` so the map chrome can name and key them without pulling the
 * WebGL bundle into the first load.
 */
export type SurfaceStyle = 'relief' | 'elevation' | 'slope'
export const SURFACE_LABELS: Record<SurfaceStyle, string> = { relief: 'Relief', elevation: 'Elevation', slope: 'Slope hazard' }
export const activeSurface = (overlays: Record<string, boolean>): SurfaceStyle => overlays.slope ? 'slope' : overlays.elevation ? 'elevation' : 'relief'
