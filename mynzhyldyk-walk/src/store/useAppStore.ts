import { create } from 'zustand'

export type Mode = 'walk' | 'drone' | 'flyover'
export type Quality = 'low' | 'med' | 'high'

interface AppState {
  started: boolean
  mode: Mode
  quality: Quality
  quarter: string
  quarterShownAt: number
  activePoi: string | null
  helpOpen: boolean
  start: () => void
  setMode: (m: Mode) => void
  setQuality: (q: Quality) => void
  setQuarter: (q: string) => void
  setPoi: (p: string | null) => void
  toggleHelp: () => void
}

export const useApp = create<AppState>((set) => ({
  started: false,
  mode: 'walk',
  quality: 'high',
  quarter: '',
  quarterShownAt: 0,
  activePoi: null,
  helpOpen: true,
  start: () => set({ started: true }),
  setMode: (m) => set({ mode: m }),
  setQuality: (q) => set({ quality: q }),
  setQuarter: (q) =>
    set((s) => (s.quarter === q ? s : { quarter: q, quarterShownAt: Date.now() })),
  setPoi: (p) => set((s) => (s.activePoi === p ? s : { activePoi: p })),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
}))

/** Позиция игрока/камеры вне реактивного цикла. */
export const playerPos = { x: 60, y: 1.7, z: 0 }
/** Запрос телепорта из UI (миникарта/клик): контроллер читает и сбрасывает. */
export const teleport: { to: [number, number] | null } = { to: null }

export const DEBUG = typeof location !== 'undefined' && location.search.includes('debug=1')
