import { create } from 'zustand'

export type Quality = 'high' | 'low'

interface TourState {
  started: boolean
  night: boolean
  quality: Quality
  fly: boolean
  mobile: boolean
  /** id of the info point the player is near, or null */
  activePoint: string | null
  /** progress along the boulevard, meters */
  meters: number
  start: () => void
  toggleNight: () => void
  toggleQuality: () => void
  setFly: (v: boolean) => void
  setActivePoint: (id: string | null) => void
  setMeters: (m: number) => void
}

export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0)

export const useTour = create<TourState>((set) => ({
  started: false,
  night: false,
  quality: isTouch ? 'low' : 'high',
  fly: false,
  mobile: isTouch,
  activePoint: null,
  meters: 0,
  start: () => set({ started: true }),
  toggleNight: () => set((s) => ({ night: !s.night })),
  toggleQuality: () => set((s) => ({ quality: s.quality === 'high' ? 'low' : 'high' })),
  setFly: (v) => set({ fly: v }),
  setActivePoint: (id) => set((s) => (s.activePoint === id ? s : { activePoint: id })),
  setMeters: (m) => set((s) => (Math.abs(s.meters - m) < 1 ? s : { meters: m })),
}))

/** Player position shared outside React render loop. */
export const playerPos = { x: 0, y: 1.7, z: -8 }
