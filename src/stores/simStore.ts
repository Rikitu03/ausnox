import { create } from 'zustand'

/** Simulated seconds advanced per real second. */
export const SIM_SPEEDS = [60, 300, 900, 1800] as const
/** One step of the step controls, simulated seconds. */
export const SIM_STEP_S = 300

interface SimState {
  /** Earth seconds since mission start. Always simulated, never read from a real clock. */
  simS: number
  playing: boolean
  speed: number
  /** Upper bound for the clock: the later of mission end and window end. */
  endS: number
  setEnd(endS: number): void
  play(): void
  pause(): void
  step(deltaS: number): void
  seek(simS: number): void
  reset(): void
  setSpeed(speed: number): void
  /** Advances the clock by `realSeconds` of wall time. Called by the playback loop. */
  tick(realSeconds: number): void
}

export const useSimStore = create<SimState>((set, get) => {
  const clamp = (v: number) => Math.max(0, Math.min(get().endS, v))
  return {
    simS: 0,
    playing: false,
    speed: SIM_SPEEDS[1],
    endS: 0,
    setEnd: (endS) => set((s) => ({ endS, simS: Math.min(s.simS, endS), playing: endS > 0 ? s.playing : false })),
    play: () => set((s) => (s.endS > 0 ? { playing: true, simS: s.simS >= s.endS ? 0 : s.simS } : s)),
    pause: () => set({ playing: false }),
    step: (deltaS) => set((s) => ({ simS: clamp(s.simS + deltaS), playing: false })),
    seek: (simS) => set({ simS: clamp(simS) }),
    reset: () => set({ simS: 0, playing: false }),
    setSpeed: (speed) => set({ speed }),
    tick: (realSeconds) =>
      set((s) => {
        if (!s.playing) return s
        const next = s.simS + realSeconds * s.speed
        return next >= s.endS ? { simS: s.endS, playing: false } : { simS: next }
      }),
  }
})
