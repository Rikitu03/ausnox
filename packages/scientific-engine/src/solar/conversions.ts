/**
 * Earth / Mars clock conversions. One sol = 1.0274912517 Earth days (Mars24 C-2), i.e.
 * 88 775.244 147 Earth seconds; one Mars clock hour is 1/24 sol, not 3600 s.
 */
export const SOL_EARTH_DAYS = 1.0274912517
export const SOL_SECONDS = SOL_EARTH_DAYS * 86400
export const MARS_HOUR_SECONDS = SOL_SECONDS / 24
export const MARS_MINUTE_SECONDS = MARS_HOUR_SECONDS / 60

export function marsHoursToEarthSeconds(marsHours: number): number {
  return marsHours * MARS_HOUR_SECONDS
}

export function earthSecondsToMarsHours(earthSeconds: number): number {
  return earthSeconds / MARS_HOUR_SECONDS
}

export function mod(x: number, m: number): number {
  const v = x % m
  return v < 0 ? v + m : v
}

/** Wrap an hour difference into [-12, 12). */
export function wrapHours12(h: number): number {
  return mod(h + 12, 24) - 12
}

/** Format Mars clock hours (0-24) as HH:MM:SS (Mars hours/minutes/seconds). */
export function formatMarsClock(hours: number): string {
  const totalS = Math.round(mod(hours, 24) * 3600)
  const s = totalS % 60
  const m = Math.floor(totalS / 60) % 60
  const h = Math.floor(totalS / 3600) % 24
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
