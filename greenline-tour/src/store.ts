import { create } from 'zustand'
import type { SegId } from './data/geometry'

export type Quality = 'high' | 'low'

interface TourState {
  started: boolean
  stage: SegId
  night: boolean
  quality: Quality
  fly: boolean
  mobile: boolean
  /** 0..1 — затемнение при переходе через портал */
  fade: number
  activePoint: string | null
  meters: number
  onBranch: boolean
  start: (stage: SegId) => void
  setStage: (s: SegId) => void
  setFade: (f: number) => void
  toggleNight: () => void
  toggleQuality: () => void
  setFly: (v: boolean) => void
  setActivePoint: (id: string | null) => void
  setProgress: (m: number, onBranch: boolean) => void
}

export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0)

export const useTour = create<TourState>((set) => ({
  started: false,
  stage: 's1',
  night: false,
  quality: isTouch ? 'low' : 'high',
  fly: false,
  mobile: isTouch,
  fade: 0,
  activePoint: null,
  meters: 0,
  onBranch: false,
  start: (stage) => set({ started: true, stage }),
  setStage: (s) => set({ stage: s }),
  setFade: (f) => set((st) => (Math.abs(st.fade - f) < 0.02 ? st : { fade: f })),
  toggleNight: () => set((s) => ({ night: !s.night })),
  toggleQuality: () => set((s) => ({ quality: s.quality === 'high' ? 'low' : 'high' })),
  setFly: (v) => set({ fly: v }),
  setActivePoint: (id) => set((s) => (s.activePoint === id ? s : { activePoint: id })),
  setProgress: (m, onBranch) =>
    set((s) => (Math.abs(s.meters - m) < 1 && s.onBranch === onBranch ? s : { meters: m, onBranch })),
}))

/** Позиция игрока вне реактивного цикла. */
export const playerPos = { x: 0, y: 1.7, z: -8 }

/** Запрос телепорта (портал/смена этапа): читается контроллером. */
export const teleportRequest: { to: SegId | null; atM: number } = { to: null, atM: 0 }
