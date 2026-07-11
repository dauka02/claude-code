import alm from './alm.json'

/**
 * Рантайм-модель мастерплана: alm.json — единственный источник планировки
 * (спайн аллеи, кварталы, дороги, LRT, вода, POI). Здесь — интерполяция
 * спайна, рельеф, хэш-сетка дорог и утилиты.
 */

export type Pt = [number, number]
export const ALM = alm as unknown as {
  lengthM: number
  spine: Pt[]
  spineArc: number[]
  bandHalfWidthM: number[]
  quarters: { id: string; fromM: number; toM: number }[]
  sitePoly: Pt[]
  roads: { id: string; kind: 'city' | 'boulevard' | 'district'; width: number; points: Pt[] }[]
  alley: { walk: Pt[]; bike: Pt[]; run: Pt[] }
  lrt: { points: Pt[]; stopsAtM: number[]; stationAtM: number; railCrossAtM: number; offsetM: number }
  river: { points: Pt[]; width: number }
  lakes: { id: string; x: number; z: number; rx: number; rz: number; rot: number }[]
  suds: Pt[][]
  landforms: { x: number; z: number; r: number; h: number }[]
  pois: { id: string; x: number; z: number; title: string; ru: string }[]
  markers: Record<string, Pt>
}

export const L = ALM.lengthM

export function spineAt(m: number): { x: number; z: number; dx: number; dz: number } {
  const arc = ALM.spineArc
  const sp = ALM.spine
  const t = Math.min(Math.max(m, 0), L)
  let i = 1
  while (i < arc.length - 1 && arc[i] < t) i++
  const f = (t - arc[i - 1]) / (arc[i] - arc[i - 1])
  const x = sp[i - 1][0] + (sp[i][0] - sp[i - 1][0]) * f
  const z = sp[i - 1][1] + (sp[i][1] - sp[i - 1][1]) * f
  const len = Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1])
  return { x, z, dx: (sp[i][0] - sp[i - 1][0]) / len, dz: (sp[i][1] - sp[i - 1][1]) / len }
}

export function perp(m: number, o: number): Pt {
  const s = spineAt(m)
  return [s.x - s.dz * o, s.z + s.dx * o]
}

export function bandHalf(m: number): number {
  const bw = ALM.bandHalfWidthM
  const t = (Math.min(Math.max(m, 0), L) / L) * (bw.length - 1)
  const i = Math.min(Math.floor(t), bw.length - 2)
  return bw[i] * (1 - (t - i)) + bw[i + 1] * (t - i)
}

/** Ближайший арклонг на спайне (грубая проекция по сэмплам). */
const SP_SAMPLES: { m: number; x: number; z: number }[] = []
for (let m = 0; m <= L; m += 40) {
  const s = spineAt(m)
  SP_SAMPLES.push({ m, x: s.x, z: s.z })
}
export function arcOf(x: number, z: number): { m: number; d: number } {
  let best = Infinity
  let bm = 0
  for (const s of SP_SAMPLES) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z)
    if (d < best) {
      best = d
      bm = s.m
    }
  }
  return { m: bm, d: Math.sqrt(best) }
}

export function quarterAt(m: number): string {
  for (const q of ALM.quarters) if (m >= q.fromM && m < q.toM) return q.id
  return m < 0 ? 'capital' : 'yesil'
}

export const QUARTER_INFO: Record<string, { ru: string; en: string; tagline: string }> = {
  capital: { ru: 'Столичный квартал', en: 'Capital Quarter', tagline: 'формальность, партеры, выход к Ишиму' },
  millennium: { ru: 'Квартал Миллениум', en: 'Millennium Quarter', tagline: 'скалы и ветер: перетекающие посадки, детские площадки' },
  centralpark: { ru: 'Центральный парк', en: 'Central Park Quarter', tagline: 'гора, степь и озеро' },
  hub: { ru: 'Хаб-квартал', en: 'Hub Quarter', tagline: 'Diamond Village: орнамент курак-корпе' },
  station: { ru: 'Вокзальный квартал', en: 'Station Quarter', tagline: 'город и степь: дюны, вокзал Nurly Zhol' },
  yesil: { ru: 'Долина Есиль', en: 'Yesil Valley Quarter', tagline: 'максимальная связь с природой' },
}

/* -------- хэш-сетка «твёрдых» лент (дороги/дорожки/LRT) -------- */
const CELL = 16
const grid = new Map<string, { x: number; z: number; w: number; kind: string }[]>()
function addLine(points: Pt[], w: number, kind: string) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]
    const [x1, z1] = points[i + 1]
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8)
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n
      const z = z0 + ((z1 - z0) * s) / n
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`
      let a = grid.get(key)
      if (!a) grid.set(key, (a = []))
      a.push({ x, z, w, kind })
    }
  }
}
for (const r of ALM.roads) addLine(r.points, r.width / 2, 'road')
addLine(ALM.alley.walk, 2.5, 'path')
addLine(ALM.alley.bike, 1.6, 'path')
addLine(ALM.alley.run, 1.3, 'path')
for (const s of ALM.suds) addLine(s, 3, 'suds')

export function nearLine(x: number, z: number, extra = 0, kinds?: string[]): boolean {
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const a = grid.get(`${cx + dx},${cz + dz}`)
      if (!a) continue
      for (const p of a) {
        if (kinds && !kinds.includes(p.kind)) continue
        if (Math.hypot(p.x - x, p.z - z) < p.w + extra) return true
      }
    }
  return false
}

/* -------- река/озёра -------- */
const RIVER_SAMPLES: Pt[] = []
for (let i = 0; i < ALM.river.points.length - 1; i++) {
  const [x0, z0] = ALM.river.points[i]
  const [x1, z1] = ALM.river.points[i + 1]
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 25)
  for (let s = 0; s < n; s++) RIVER_SAMPLES.push([x0 + ((x1 - x0) * s) / n, z0 + ((z1 - z0) * s) / n])
}
export function riverDist(x: number, z: number): number {
  let best = Infinity
  for (const [rx, rz] of RIVER_SAMPLES) {
    const d = (rx - x) * (rx - x) + (rz - z) * (rz - z)
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

export function inLake(x: number, z: number, margin = 0): boolean {
  for (const l of ALM.lakes) {
    const nx = (x - l.x) / (l.rx + margin)
    const nz = (z - l.z) / (l.rz + margin)
    if (nx * nx + nz * nz < 1) return true
  }
  return false
}

export function inWater(x: number, z: number): boolean {
  return inLake(x, z, 1) || riverDist(x, z) < ALM.river.width / 2
}

/* -------- рельеф -------- */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export const WATER_Y = -1.6

export function heightAt(x: number, z: number): number {
  let h = (vnoise(x * 0.008, z * 0.008) - 0.5) * 1.1 + (vnoise(x * 0.05, z * 0.05) - 0.5) * 0.25
  // landform-холмы (Central Park) и дюны (Station/Yesil)
  for (const lf of ALM.landforms) {
    const d = Math.hypot(x - lf.x, z - lf.z) / lf.r
    if (d < 1.25) h += lf.h * Math.exp(-d * d * 2.8)
  }
  // русло реки и чаши озёр
  const rd = riverDist(x, z)
  const rw = ALM.river.width / 2
  if (rd < rw + 30) h -= 3.6 * Math.max(0, 1 - Math.max(0, rd - rw * 0.4) / (rw + 30 - rw * 0.4)) ** 1.4
  for (const l of ALM.lakes) {
    const nx = (x - l.x) / (l.rx + 18)
    const nz = (z - l.z) / (l.rz + 18)
    const e = nx * nx + nz * nz
    if (e < 1.4) h -= 3.0 * Math.max(0, 1.1 - e) ** 1.3
  }
  // ровно под дорогами/дорожками
  if (nearLine(x, z, 6)) h *= 0.12
  // привокзальная зона ровная
  if (x > 4100 && x < 4750 && z > -300 && z < 60) h *= 0.1
  return h
}

/** Точки входа кварталов (для миникарты-телепорта). */
export function quarterEntry(id: string): Pt {
  const q = ALM.quarters.find((q) => q.id === id)!
  return perp(q.fromM + 60, 0)
}
