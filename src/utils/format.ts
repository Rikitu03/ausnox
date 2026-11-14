/** One number format across the app. Missing values render as an em dash, never as zero. */
export const DASH = '—'

export function formatDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return DASH
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

/** Earth-time duration, e.g. "2 h 05 min" or "45 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH
  const sign = seconds < 0 ? '−' : ''
  const total = Math.round(Math.abs(seconds) / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${sign}${h} h ${String(m).padStart(2, '0')} min` : `${sign}${m} min`
}

/** Signed duration for margins, e.g. "+1 h 12 min" or "−18 min". */
export function formatMargin(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH
  return seconds >= 0 ? `+${formatDuration(seconds)}` : formatDuration(seconds)
}

/** Mars clock time from fractional hours, e.g. 9.5 → "09:30". Wraps past 24. */
export function formatLtst(hours: number | null | undefined, withSeconds = false): string {
  if (hours == null || !Number.isFinite(hours)) return DASH
  const wrapped = ((hours % 24) + 24) % 24
  const totalSeconds = Math.floor(wrapped * 3600 + 1e-6)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return withSeconds ? `${hm}:${String(s).padStart(2, '0')}` : hm
}

export function formatDegrees(deg: number | null | undefined, digits = 1): string {
  if (deg == null || !Number.isFinite(deg)) return DASH
  return `${deg.toFixed(digits)}°`
}

export function formatMetres(m: number | null | undefined, digits = 0): string {
  if (m == null || !Number.isFinite(m)) return DASH
  return `${m.toFixed(digits)} m`
}

export function formatGeo(value: number | null | undefined, axis: 'lon' | 'lat'): string {
  if (value == null || !Number.isFinite(value)) return DASH
  return `${value.toFixed(4)}° ${axis === 'lon' ? 'E' : 'N'}`
}

export const formatGrid = (v: number) => `${Math.round(v)} m`
