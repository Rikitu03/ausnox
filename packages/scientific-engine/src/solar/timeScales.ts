/**
 * Earth time scales for Mars24 (NASA GISS Mars24 algorithm, steps A-1..A-6).
 *
 * Input instants are Unix epoch milliseconds (JavaScript Date semantics, no leap seconds),
 * interpreted as UTC, matching Mars24's use of Java millis (A-1/A-2).
 * TT - UTC = (TAI - UTC) + 32.184 s from the IERS leap-second table for dates >= 1972,
 * and the Mars24 polynomial (A-4) before 1972.
 */
import { engineError, type EngineError } from '../contracts/errors.js'

/** Unix ms (UTC) at which each TAI-UTC value takes effect. Source: IERS / IANA leap-seconds.list. */
export const LEAP_SECOND_TABLE: readonly (readonly [utcMs: number, taiMinusUtcS: number])[] = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
]

/**
 * Last instant for which the table is known complete. IERS Bulletin C 72 (Paris, 2026-07-06)
 * announces no leap second at the end of December 2026, so TAI - UTC = 37 s holds through
 * 2027-06-30. Later instants use 37 s and are flagged as extrapolated.
 */
export const LEAP_SECOND_TABLE_VALID_UNTIL_UTC_MS = Date.UTC(2027, 5, 30, 23, 59, 59)

/** Supported instants for the solar model: [1950-01-01, 2100-01-01) UTC. */
export const SUPPORTED_EPOCH_START_UTC_MS = Date.UTC(1950, 0, 1)
export const SUPPORTED_EPOCH_END_UTC_MS = Date.UTC(2100, 0, 1)

export type TtUtcMethod = 'leap-second-table' | 'leap-second-table-extrapolated' | 'mars24-polynomial-pre-1972'

export interface TimeScales {
  readonly utcMs: number
  readonly jdUt: number
  readonly ttMinusUtcS: number
  readonly ttMinusUtcMethod: TtUtcMethod
  readonly jdTt: number
  /** Days since J2000.0 (2000-01-01 12:00 TT). */
  readonly deltaTJ2000Days: number
}

/** Mars24 A-2: JD(UT) = 2440587.5 + millis / 86 400 000. */
export function julianDateFromUnixMs(utcMs: number): number {
  return 2440587.5 + utcMs / 8.64e7
}

export function ttMinusUtcSeconds(utcMs: number): { seconds: number; method: TtUtcMethod } {
  const first = LEAP_SECOND_TABLE[0]!
  if (utcMs < first[0]) {
    // Mars24 A-3/A-4 polynomial for dates before 1972
    const T = (julianDateFromUnixMs(utcMs) - 2451545.0) / 36525
    return { seconds: 64.184 + 59 * T - 51.2 * T * T - 67.1 * T ** 3 - 16.4 * T ** 4, method: 'mars24-polynomial-pre-1972' }
  }
  let tai = first[1]
  for (const [t, v] of LEAP_SECOND_TABLE) {
    if (utcMs >= t) tai = v
    else break
  }
  return {
    seconds: tai + 32.184,
    method: utcMs > LEAP_SECOND_TABLE_VALID_UNTIL_UTC_MS ? 'leap-second-table-extrapolated' : 'leap-second-table',
  }
}

export function validateEpoch(utcMs: number): EngineError<'INVALID_INPUT' | 'UNSUPPORTED_EPOCH'> | null {
  if (typeof utcMs !== 'number' || !Number.isFinite(utcMs)) {
    return engineError('INVALID_INPUT', 'The instant must be a finite Unix time in milliseconds (UTC).')
  }
  if (utcMs < SUPPORTED_EPOCH_START_UTC_MS || utcMs >= SUPPORTED_EPOCH_END_UTC_MS) {
    return engineError('UNSUPPORTED_EPOCH', 'Solar calculations are supported for 1950-01-01 to 2099-12-31 UTC.', {
      utc: new Date(utcMs).toISOString(),
    })
  }
  return null
}

export function computeTimeScales(utcMs: number): TimeScales {
  const jdUt = julianDateFromUnixMs(utcMs)
  const { seconds, method } = ttMinusUtcSeconds(utcMs)
  const jdTt = jdUt + seconds / 86400
  return { utcMs, jdUt, ttMinusUtcS: seconds, ttMinusUtcMethod: method, jdTt, deltaTJ2000Days: jdTt - 2451545.0 }
}
