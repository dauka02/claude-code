import * as THREE from 'three'
import stage1 from '../../segments/stage1.json'
import stage2 from '../../segments/stage2.json'

/**
 * Единственный источник планировочной геометрии — segments/*.json,
 * полученные из генпланов через tools/trace_plan.ts. Здесь JSON
 * превращается в рантайм-модель: кривые, сэмплы, хэш-сетка расстояний,
 * рельеф и утилиты размещения.
 */

export type SegId = 's1' | 's2a' | 's2b'
export type PathKind = 'promenade' | 'loop' | 'bike' | 'run' | 'branch'

export interface Pt {
  x: number
  z: number
}
export interface Ellipse {
  cx: number
  cz: number
  rx: number
  rz: number
  rot?: number
}
export interface Plaza {
  kind: string
  cx: number
  cz: number
  r: number
  ring?: boolean
}
export interface Portal {
  x: number
  z: number
  to: SegId
  at: number
  label: string
}

export interface PathModel {
  id: string
  kind: PathKind
  width: number
  pts: Pt[] // равномерные сэмплы ~1.8 м
  length: number
}

export interface ZoneBand {
  from: number
  to: number
  name: string
  color: string
}

export interface SegModel {
  id: SegId
  name: string
  lengthM: number
  halfW: number
  paths: PathModel[]
  promenade: PathModel
  branch?: PathModel
  ponds: Ellipse[]
  swales: Ellipse[]
  plazas: Plaza[]
  lawns: { cx: number; cz: number; r: number }[]
  smallPool?: { cx: number; cz: number; r: number }
  playgrounds: Ellipse[]
  pavilions: [number, number][]
  groves: { x0: number; z0: number; x1: number; z1: number }[]
  zones: Record<string, number>
  crossings: { x: number; street?: boolean }[]
  portals: Portal[]
  court?: { x: number; z: number; w: number; l: number }
  rubber?: Ellipse
  kulan?: { x: number; z: number }
  branchInfo?: { widthM: number; greenery: number; trees: number; lengthOfficialM: number }
  bands: ZoneBand[]
  treeTarget: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildPath(raw: { id: string; kind: string; width: number; points: number[][] }): PathModel {
  const v = raw.points.map(([x, z]) => new THREE.Vector3(x, 0, z))
  const curve = new THREE.CatmullRomCurve3(v, false, 'catmullrom', 0.5)
  const length = curve.getLength()
  const n = Math.max(8, Math.round(length / 1.8))
  const pts = curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }))
  return { id: raw.id, kind: raw.kind as PathKind, width: raw.width, pts, length }
}

/* -------- хэш-сетка ближайших точек путей (для рельефа/посадки) -------- */

const CELL = 8

class PathGrid {
  private map = new Map<string, { x: number; z: number; w: number; kind: PathKind }[]>()
  constructor(paths: PathModel[]) {
    for (const p of paths) {
      for (const pt of p.pts) {
        const key = `${Math.floor(pt.x / CELL)},${Math.floor(pt.z / CELL)}`
        let arr = this.map.get(key)
        if (!arr) this.map.set(key, (arr = []))
        arr.push({ x: pt.x, z: pt.z, w: p.width, kind: p.kind })
      }
    }
  }
  /** расстояние до ближайшей оси пути (минус полуширина не вычитается) */
  dist(x: number, z: number, kinds?: PathKind[]): number {
    let best = Infinity
    const cx = Math.floor(x / CELL)
    const cz = Math.floor(z / CELL)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const arr = this.map.get(`${cx + dx},${cz + dz}`)
        if (!arr) continue
        for (const p of arr) {
          if (kinds && !kinds.includes(p.kind)) continue
          const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
          if (d < best) best = d
        }
      }
    }
    return Math.sqrt(best)
  }
}

const grids = new Map<SegId, PathGrid>()

function inEllipse(e: Ellipse, x: number, z: number, margin = 0): number {
  const rot = e.rot ?? 0
  const cos = Math.cos(-rot)
  const sin = Math.sin(-rot)
  const lx = (x - e.cx) * cos - (z - e.cz) * sin
  const lz = (x - e.cx) * sin + (z - e.cz) * cos
  const nx = lx / (e.rx + margin)
  const nz = lz / (e.rz + margin)
  return nx * nx + nz * nz
}

/* ---------------------- сборка моделей сегментов ---------------------- */

type RawSeg = typeof stage1

function buildSegment(raw: RawSeg, bands: ZoneBand[], treeTarget: number): SegModel {
  const paths = (raw.paths as { id: string; kind: string; width: number; points: number[][] }[]).map(buildPath)
  const promenade = paths.find((p) => p.kind === 'promenade')!
  const branch = paths.find((p) => p.kind === 'branch')
  const r = raw as unknown as Record<string, unknown>
  const seg: SegModel = {
    id: raw.id as SegId,
    name: raw.name,
    lengthM: raw.lengthM,
    halfW: raw.corridor.halfW,
    paths,
    promenade,
    branch,
    ponds: (raw.ponds as Ellipse[]) ?? [],
    swales: (r.swales as Ellipse[]) ?? [],
    plazas: (raw.plazas as Plaza[]) ?? [],
    lawns: (r.lawns as SegModel['lawns']) ?? [],
    smallPool: r.smallPool as SegModel['smallPool'],
    playgrounds: (r.playgrounds as Ellipse[]) ?? [],
    pavilions: (r.pavilions as [number, number][]) ?? [],
    groves: (r.groves as SegModel['groves']) ?? [],
    zones: (r.zones as Record<string, number>) ?? {},
    crossings: (r.crossings as SegModel['crossings']) ?? [],
    portals: (r.portals as Portal[]) ?? [],
    court: r.court as SegModel['court'],
    rubber: r.rubber as SegModel['rubber'],
    kulan: r.kulan as SegModel['kulan'],
    branchInfo: r.branchInfo as SegModel['branchInfo'],
    bands,
    treeTarget,
    bounds: { minX: raw.corridor.x0, maxX: raw.corridor.x1, minZ: -raw.corridor.halfW, maxZ: raw.corridor.halfW },
  }
  if (branch) {
    for (const p of branch.pts) {
      seg.bounds.maxZ = Math.max(seg.bounds.maxZ, p.z + 30)
      seg.bounds.minX = Math.min(seg.bounds.minX, p.x - 32)
    }
  }
  grids.set(seg.id, new PathGrid(paths))
  return seg
}

const wingA = (stage2 as unknown as { wings: RawSeg[] }).wings[0]
const wingB = (stage2 as unknown as { wings: RawSeg[] }).wings[1]

export const SEGMENTS: Record<SegId, SegModel> = {
  s1: buildSegment(stage1 as RawSeg, [
    { from: 0, to: 60, name: 'Западный вход (Култегін)', color: '#b8b2a6' },
    { from: 60, to: 270, name: 'Тихие сады', color: '#6a8a5e' },
    { from: 270, to: 372, name: 'Пруды и игровая зона', color: '#5e8a9a' },
    { from: 372, to: 465, name: 'Развязка Айтеке би · спорт', color: '#8a7a5e' },
    { from: 465, to: 675, name: 'Дождевые сады', color: '#7a9a5e' },
    { from: 675, to: 721, name: 'Входная площадь (Анет баба)', color: '#b8b2a6' },
  ], 1104),
  s2a: buildSegment(wingA, [
    { from: 0, to: 55, name: 'Вход (Омарова)', color: '#b8b2a6' },
    { from: 55, to: 170, name: 'Городской лес', color: '#4e6a45' },
    { from: 170, to: 260, name: 'Беговые дорожки · площадка', color: '#a86a3e' },
    { from: 260, to: 330, name: 'Аллея (к Култегін)', color: '#7a9a5e' },
  ], 460),
  s2b: buildSegment(wingB, [
    { from: 0, to: 75, name: 'Лужайка со сценой', color: '#79b356' },
    { from: 75, to: 240, name: 'Пруд · детская площадка', color: '#5e8a9a' },
    { from: 240, to: 430, name: 'Рощи и павильоны', color: '#6a8a5e' },
    { from: 430, to: 575, name: 'Центральная зона: каскады и фонтаны', color: '#9a8a6e' },
    { from: 575, to: 720, name: 'Сухой фонтан · городской лес', color: '#8a7a5e' },
    { from: 720, to: 880, name: 'Пруд 2 · площадка', color: '#5e8a9a' },
    { from: 880, to: 950, name: 'Вход GREEN LINE (Толе би)', color: '#b8b2a6' },
  ], 1340),
}

export function distToPaths(seg: SegModel, x: number, z: number, kinds?: PathKind[]): number {
  return grids.get(seg.id)!.dist(x, z, kinds)
}

/* ------------------------------- рельеф ------------------------------- */

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

export function heightAt(seg: SegModel, x: number, z: number): number {
  let h = (vnoise(x * 0.05, z * 0.05) - 0.5) * 0.5 + (vnoise(x * 0.15, z * 0.15) - 0.5) * 0.16

  // каскадные насыпи вокруг центральной площади (только s2b)
  if (seg.id === 's2b') {
    const pl = seg.plazas[0]
    const d = Math.hypot(x - pl.cx, z - pl.cz)
    if (d > pl.r + 2 && d < pl.r + 26) {
      const t = (d - pl.r - 2) / 24
      h += 3.4 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 1.5
    }
    // лужайка со сценой — заглублена
    for (const l of seg.lawns) {
      const dl = Math.hypot(x - l.cx, z - l.cz) / l.r
      if (dl < 1.35) h -= 0.95 * Math.max(0, 1.1 - dl) ** 1.3
    }
  }

  if (seg.id === 's1') {
    // игровые холмы у игровой зоны
    const hills = [
      { x: 200, z: 12, r: 11, hh: 1.4 },
      { x: 545, z: 12, r: 12, hh: 1.7 },
      { x: 250, z: -12, r: 10, hh: 1.1 },
    ]
    for (const hi of hills) {
      const d = Math.hypot(x - hi.x, z - hi.z) / hi.r
      if (d < 1) h += hi.hh * (0.5 + 0.5 * Math.cos(Math.PI * d))
    }
  }

  for (const s of seg.swales) {
    const e = inEllipse(s, x, z)
    if (e < 1.6) h -= 0.7 * Math.max(0, 1 - e) ** 1.2
  }
  for (const p of seg.ponds) {
    const e = inEllipse(p, x, z, 2)
    if (e < 1.8) h -= 1.5 * Math.max(0, 1.15 - e) ** 1.4
  }

  // ровно вдоль путей и площадок
  const dp = distToPaths(seg, x, z)
  const flat = THREE.MathUtils.smoothstep(dp, 2.5, 8)
  h *= 0.15 + 0.85 * flat
  for (const pl of seg.plazas) {
    const d = Math.hypot(x - pl.cx, z - pl.cz)
    if (d < pl.r + 4) h *= Math.min(1, Math.max(0.04, (d - pl.r) / 4))
  }
  for (const pg of seg.playgrounds) if (inEllipse(pg, x, z, 2) < 1.3) h *= 0.08
  if (seg.court) {
    const c = seg.court
    if (Math.abs(x - c.x) < c.w / 2 + 4 && Math.abs(z - c.z) < c.l / 2 + 4) h *= 0.05
  }
  if (seg.rubber && inEllipse(seg.rubber, x, z, 2) < 1.4) h *= 0.15

  // площади-входы ровные
  if (x < 25) h *= Math.max(0.05, x / 25)
  if (x > seg.lengthM - 25) h *= Math.max(0.05, (seg.lengthM - x) / 25)

  return h
}

export const WATER_LEVEL = -0.55

export function inPond(seg: SegModel, x: number, z: number, margin = 0): boolean {
  for (const p of seg.ponds) if (inEllipse(p, x, z, margin) < 1) return true
  return false
}

export function inSwale(seg: SegModel, x: number, z: number, margin = 0): boolean {
  for (const s of seg.swales) if (inEllipse(s, x, z, margin) < 1) return true
  return false
}

/** Внутри коридора сегмента (включая рукав)? */
export function inCorridor(seg: SegModel, x: number, z: number, margin = 0): boolean {
  if (x > -margin && x < seg.lengthM + margin && Math.abs(z) < seg.halfW - 1 + margin) return true
  if (seg.branch) {
    const d = distToBranchAxis(seg, x, z)
    if (d >= 0 && d < 32 + margin) return true
  }
  return false
}

function distToBranchAxis(seg: SegModel, x: number, z: number): number {
  if (!seg.branch || z < seg.halfW - 5) return -1
  let best = Infinity
  for (const p of seg.branch.pts) {
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < best) best = d
  }
  return best
}

export function isPlantable(seg: SegModel, x: number, z: number, pathMargin = 3.4): boolean {
  if (!inCorridor(seg, x, z, 0)) return false
  if (distToPaths(seg, x, z) < pathMargin) return false
  if (inPond(seg, x, z, 1.2)) return false
  for (const pl of seg.plazas) if (Math.hypot(x - pl.cx, z - pl.cz) < pl.r + 2.5) return false
  for (const l of seg.lawns) if (Math.hypot(x - l.cx, z - l.cz) < l.r + 2) return false
  for (const pg of seg.playgrounds) if (inEllipse(pg, x, z, 1.5) < 1) return false
  if (seg.court) {
    const c = seg.court
    if (Math.abs(x - c.x) < c.w / 2 + 2.5 && Math.abs(z - c.z) < c.l / 2 + 2.5) return false
  }
  if (seg.rubber && inEllipse(seg.rubber, x, z, 0) < 1.3) return false
  if (seg.smallPool && Math.hypot(x - seg.smallPool.cx, z - seg.smallPool.cz) < seg.smallPool.r + 1.5) return false
  // входы свободны
  if (x < 16 || x > seg.lengthM - 14) {
    const nearProm = distToPaths(seg, x, z, ['promenade']) < 13
    if (nearProm) return false
  }
  return true
}

/** Прогресс вдоль променада, метры (для HUD). */
export function progressAt(seg: SegModel, x: number, z: number): { m: number; onBranch: boolean } {
  if (seg.branch && z > seg.halfW + 4) {
    let best = Infinity
    let bi = 0
    seg.branch.pts.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.z - z)
      if (d < best) {
        best = d
        bi = i
      }
    })
    return { m: (bi / (seg.branch.pts.length - 1)) * seg.branch.length, onBranch: true }
  }
  let best = Infinity
  let bi = 0
  seg.promenade.pts.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < best) {
      best = d
      bi = i
    }
  })
  const m = (bi / (seg.promenade.pts.length - 1)) * seg.lengthM
  return { m: THREE.MathUtils.clamp(m, 0, seg.lengthM), onBranch: false }
}

export function bandAt(seg: SegModel, m: number, onBranch: boolean): string {
  if (onBranch) return 'Рукав Айтеке би'
  for (const b of seg.bands) if (m >= b.from && m < b.to) return b.name
  return seg.bands[seg.bands.length - 1].name
}

/** Точка на променаде по доле длины (для спавна/маяков). */
export function promAt(seg: SegModel, m: number): Pt {
  const t = THREE.MathUtils.clamp(m / seg.lengthM, 0, 1)
  const i = Math.round(t * (seg.promenade.pts.length - 1))
  return seg.promenade.pts[i]
}
