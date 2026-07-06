import * as THREE from 'three'

/** Boulevard dimensions (meters). Runs along +Z, X across. */
export const LENGTH = 721
export const HALF_W = 30

export interface Zone {
  id: string
  from: number
  to: number
  name: string
  color: string
}

export const ZONES: Zone[] = [
  { id: 'entrance', from: 0, to: 80, name: 'Входная площадь', color: '#b8b2a6' },
  { id: 'raingardens', from: 80, to: 220, name: 'Дождевые сады', color: '#7a9a5e' },
  { id: 'ponds', from: 220, to: 360, name: 'Пруды', color: '#5e8a9a' },
  { id: 'play', from: 360, to: 500, name: 'Игровая зона', color: '#4fa3a0' },
  { id: 'sport', from: 500, to: 620, name: 'Спортивная зона', color: '#8a7a5e' },
  { id: 'quiet', from: 620, to: 721, name: 'Тихая зона / выход', color: '#6a8a5e' },
]

/** Seeded PRNG (mulberry32) so the world is deterministic. */
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

/** Main serpentine path — CatmullRom through hand-placed waypoints. */
export const PATH_POINTS: [number, number][] = [
  [0, -14],
  [4, 20],
  [10, 55],
  [8, 95],
  [-2, 130],
  [-9, 170],
  [-6, 210],
  [4, 245],
  [11, 285],
  [7, 325],
  [-3, 360],
  [-10, 395],
  [-8, 435],
  [1, 470],
  [9, 505],
  [11, 545],
  [6, 585],
  [-4, 620],
  [-9, 655],
  [-4, 690],
  [0, 735],
]

export const PATH_CURVE = new THREE.CatmullRomCurve3(
  PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.5,
)

const PATH_SAMPLES = 400
const pathPts: THREE.Vector3[] = PATH_CURVE.getSpacedPoints(PATH_SAMPLES)

/** Horizontal distance from (x,z) to the path centerline (approx). */
export function distToPath(x: number, z: number): number {
  // coarse pass over sampled points — fine enough at 400 samples / ~750 m
  let best = Infinity
  // limit scan window by z for speed
  const i0 = Math.max(0, Math.floor(((z - 40) / 770) * PATH_SAMPLES))
  const i1 = Math.min(PATH_SAMPLES, Math.ceil(((z + 40) / 770) * PATH_SAMPLES) + 1)
  for (let i = i0; i < i1; i++) {
    const p = pathPts[i]
    const dx = p.x - x
    const dz = p.z - z
    const d = dx * dx + dz * dz
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** Path x at a given z (approx, for minimap / spawning). */
export function pathXAt(z: number): number {
  const t = THREE.MathUtils.clamp((z + 14) / 749, 0, 1)
  return PATH_CURVE.getPointAt(t).x
}

export interface Pond {
  x: number
  z: number
  rx: number
  rz: number
  rot: number
}

export const PONDS: Pond[] = [
  { x: -12, z: 250, rx: 11, rz: 20, rot: 0.3 },
  { x: 14, z: 300, rx: 12, rz: 26, rot: -0.15 },
  { x: -13, z: 340, rx: 9, rz: 14, rot: 0.5 },
]

export const WATER_LEVEL = -0.55

export function inPond(x: number, z: number, margin = 0): boolean {
  for (const p of PONDS) {
    const cos = Math.cos(-p.rot)
    const sin = Math.sin(-p.rot)
    const lx = (x - p.x) * cos - (z - p.z) * sin
    const lz = (x - p.x) * sin + (z - p.z) * cos
    const nx = lx / (p.rx + margin)
    const nz = lz / (p.rz + margin)
    if (nx * nx + nz * nz < 1) return true
  }
  return false
}

/** Rain-garden swales (sunken planted beds), zone 80–220 m. */
export const SWALES: Pond[] = [
  { x: -14, z: 105, rx: 8, rz: 16, rot: 0.2 },
  { x: 15, z: 125, rx: 9, rz: 18, rot: -0.3 },
  { x: -16, z: 160, rx: 8, rz: 15, rot: 0.1 },
  { x: 14, z: 185, rx: 8, rz: 16, rot: 0.35 },
  { x: -12, z: 205, rx: 7, rz: 12, rot: -0.2 },
]

function inEllipse(p: Pond, x: number, z: number, margin = 0): number {
  const cos = Math.cos(-p.rot)
  const sin = Math.sin(-p.rot)
  const lx = (x - p.x) * cos - (z - p.z) * sin
  const lz = (x - p.x) * sin + (z - p.z) * cos
  const nx = lx / (p.rx + margin)
  const nz = lz / (p.rz + margin)
  return nx * nx + nz * nz
}

/** How deep inside a swale a point is (0 = outside). */
export function inSwale(x: number, z: number, margin = 0): boolean {
  for (const s of SWALES) if (inEllipse(s, x, z, margin) < 1) return true
  return false
}

export const COURT = { x: 8, z: 560, w: 16, l: 28 } // basketball court rect
export const RUBBER = { x: -8, z: 430, rx: 16, rz: 38 } // play surface blob center

export function inRubber(x: number, z: number, margin = 0): boolean {
  const dx = (x - RUBBER.x) / (RUBBER.rx + margin)
  const dz = (z - RUBBER.z) / (RUBBER.rz + margin)
  return dx * dx + dz * dz < 1.3
}

export function inCourt(x: number, z: number, margin = 0): boolean {
  return (
    Math.abs(x - COURT.x) < COURT.w / 2 + margin && Math.abs(z - COURT.z) < COURT.l / 2 + margin
  )
}

/** Can a tree / grass tuft grow here? */
export function isPlantable(x: number, z: number, pathMargin = 3.2): boolean {
  if (Math.abs(x) > HALF_W - 1.2) return false
  if (z < 2 || z > LENGTH - 2) return false
  if (distToPath(x, z) < pathMargin) return false
  if (inPond(x, z, 1.2)) return false
  if (inCourt(x, z, 2.5)) return false
  if (inRubber(x, z, 0)) return false
  // keep plazas open
  if (z < 20 && Math.abs(x - pathXAt(2)) < 14) return false
  if (z > LENGTH - 16 && Math.abs(x - pathXAt(LENGTH - 2)) < 12) return false
  return true
}

/** Cheap value noise for terrain. */
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

/** Terrain height. Gentle noise, sunken swales/ponds, hills in the play zone. */
export function heightAt(x: number, z: number): number {
  let h = (vnoise(x * 0.05, z * 0.05) - 0.5) * 0.5 + (vnoise(x * 0.15, z * 0.15) - 0.5) * 0.16

  // play-zone hills
  if (z > 370 && z < 500) {
    const hills = [
      { x: -18, z: 400, r: 12, hh: 1.6 },
      { x: 16, z: 455, r: 14, hh: 2.0 },
      { x: -16, z: 480, r: 10, hh: 1.2 },
    ]
    for (const hi of hills) {
      const d = Math.hypot(x - hi.x, z - hi.z) / hi.r
      if (d < 1) h += hi.hh * (0.5 + 0.5 * Math.cos(Math.PI * d)) * 0.5 * (1 + Math.cos(Math.PI * Math.min(d, 1)))
    }
  }

  // sunken swales
  for (const s of SWALES) {
    const e = inEllipse(s, x, z)
    if (e < 1.6) h -= 0.7 * Math.max(0, 1 - e) ** 1.2
  }
  // pond basins
  for (const p of PONDS) {
    const e = inEllipse(p, x, z, 2)
    if (e < 1.8) h -= 1.5 * Math.max(0, 1.15 - e) ** 1.4
  }

  // keep the main path corridor level
  const dp = distToPath(x, z)
  const flat = THREE.MathUtils.smoothstep(dp, 2.2, 7)
  h *= 0.15 + 0.85 * flat

  // court + rubber zones flat
  const inCourt =
    Math.abs(x - COURT.x) < COURT.w / 2 + 4 && Math.abs(z - COURT.z) < COURT.l / 2 + 4
  if (inCourt) h *= 0.05
  // entrance/exit plazas flat
  if (z < 30) h *= Math.max(0.05, z / 30)
  if (z > LENGTH - 25) h *= Math.max(0.05, (LENGTH - z) / 25)

  return h
}

/** Progress (0..1) along the boulevard for HUD. */
export function progressAt(z: number): number {
  return THREE.MathUtils.clamp(z / LENGTH, 0, 1)
}

export function zoneAt(z: number): Zone {
  for (const zn of ZONES) if (z >= zn.from && z < zn.to) return zn
  return z < 0 ? ZONES[0] : ZONES[ZONES.length - 1]
}
