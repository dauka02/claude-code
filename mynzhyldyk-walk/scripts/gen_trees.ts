/**
 * Генерация позиций деревьев (seed → повторяемость) → src/data/trees.json.
 * Виды: 0 берёза, 1 сосна, 2 вяз, 3 ива, 4 клён, 5 яблоня декоративная.
 * Правила: ленты-аллеи (плотно, микс по кварталу), рядовые вдоль бульваров,
 * кварталы-контекст (редко). Избегаем дорог, воды, площадей, станции.
 * Запуск: npm run gen-trees
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const alm = JSON.parse(fs.readFileSync(path.join(root, 'src/data/alm.json'), 'utf8'))

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20240)

type Pt = [number, number]
const spine: Pt[] = alm.spine
const arc: number[] = alm.spineArc
const L: number = alm.lengthM

function spineAt(m: number): { p: Pt; dir: Pt } {
  const t = Math.min(Math.max(m, 0), L)
  let i = 1
  while (i < arc.length - 1 && arc[i] < t) i++
  const f = (t - arc[i - 1]) / (arc[i] - arc[i - 1])
  const p: Pt = [
    spine[i - 1][0] + (spine[i][0] - spine[i - 1][0]) * f,
    spine[i - 1][1] + (spine[i][1] - spine[i - 1][1]) * f,
  ]
  const len = Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1])
  return { p, dir: [(spine[i][0] - spine[i - 1][0]) / len, (spine[i][1] - spine[i - 1][1]) / len] }
}
const perp = (m: number, o: number): Pt => {
  const { p, dir } = spineAt(m)
  return [p[0] - dir[1] * o, p[1] + dir[0] * o]
}
const bandHalf = (m: number) => {
  const bw: number[] = alm.bandHalfWidthM
  const t = (m / L) * (bw.length - 1)
  const i = Math.min(Math.floor(t), bw.length - 2)
  return bw[i] * (1 - (t - i)) + bw[i + 1] * (t - i)
}

/* хэш препятствий: дороги, вело/дорожки, LRT */
const CELL = 14
const grid = new Map<string, { x: number; z: number; w: number }[]>()
function addLine(points: Pt[], w: number) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]
    const [x1, z1] = points[i + 1]
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 6)
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n
      const z = z0 + ((z1 - z0) * s) / n
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`
      let a = grid.get(key)
      if (!a) grid.set(key, (a = []))
      a.push({ x, z, w })
    }
  }
}
for (const r of alm.roads) addLine(r.points, r.width / 2 + 3)
addLine(alm.alley.walk, 4)
addLine(alm.alley.bike, 3)
addLine(alm.alley.run, 2.5)
addLine(alm.lrt.points, 6)
addLine(alm.river.points, alm.river.width / 2 + 8)
for (const s of alm.suds) addLine(s, 5)

function blocked(x: number, z: number): boolean {
  const cx = Math.floor(x / CELL)
  const cz = Math.floor(z / CELL)
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const a = grid.get(`${cx + dx},${cz + dz}`)
      if (!a) continue
      for (const p of a) if (Math.hypot(p.x - x, p.z - z) < p.w) return true
    }
  for (const l of alm.lakes) if (Math.hypot(x - l.x, z - l.z) < Math.max(l.rx, l.rz) + 6) return true
  // станция + привокзальная площадь
  if (x > 4350 && x < 4700 && z > -260 && z < -40) return true
  return false
}

const mixes: Record<string, number[]> = {
  capital: [0.1, 0.05, 0.5, 0.05, 0.25, 0.05],
  millennium: [0.15, 0.1, 0.15, 0.05, 0.3, 0.25],
  centralpark: [0.35, 0.3, 0.1, 0.15, 0.1, 0],
  hub: [0.1, 0.25, 0.3, 0, 0.25, 0.1],
  station: [0.15, 0.35, 0.2, 0.1, 0.2, 0],
  yesil: [0.25, 0.05, 0.05, 0.5, 0.1, 0.05],
}
function speciesFor(m: number): number {
  const q = alm.quarters.find((q: { fromM: number; toM: number }) => m >= q.fromM && m < q.toM) ?? alm.quarters[5]
  const mix = mixes[q.id]
  let r = rand()
  for (let i = 0; i < 6; i++) {
    r -= mix[i]
    if (r <= 0) return i
  }
  return 2
}

const X: number[] = []
const Z: number[] = []
const S: number[] = []
const SC: number[] = []
function put(x: number, z: number, s: number, sc: number) {
  X.push(Math.round(x * 10))
  Z.push(Math.round(z * 10))
  S.push(s)
  SC.push(Math.round(sc * 100))
}

/* 1) лента аллеи — плотные группы */
const TARGET_BAND = 9000
let guard = 0
while (X.length < TARGET_BAND && guard++ < TARGET_BAND * 30) {
  const m = rand() * L
  const w = bandHalf(m)
  const o = (rand() * 2 - 1) * (w - 4)
  const [x, z] = perp(m, o)
  if (blocked(x, z)) continue
  // кластеризация: чаще у кромок ленты
  if (rand() < 0.35 && Math.abs(o) < w * 0.4) continue
  put(x, z, speciesFor(m), 0.75 + rand() * 0.6)
}

/* 2) рядовые вдоль бульваров */
for (const r of alm.roads) {
  if (r.kind !== 'boulevard') continue
  for (let i = 0; i < r.points.length - 1; i++) {
    const [x0, z0] = r.points[i]
    const [x1, z1] = r.points[i + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    const nx = -(z1 - z0) / len
    const nz = (x1 - x0) / len
    for (let d = 6; d < len; d += 11 + rand() * 3) {
      for (const side of [-1, 1]) {
        const x = x0 + ((x1 - x0) * d) / len + nx * side * (r.width / 2 + 4)
        const z = z0 + ((z1 - z0) * d) / len + nz * side * (r.width / 2 + 4)
        if (blocked(x, z)) continue
        put(x, z, 2 + (rand() < 0.3 ? 2 : 0), 0.8 + rand() * 0.35)
      }
    }
  }
}

/* 3) контекст в кварталах (редкие дворовые) */
const TARGET_CTX = 5000
guard = 0
while (X.length < TARGET_BAND + 4000 + TARGET_CTX && guard++ < TARGET_CTX * 40) {
  const m = rand() * L
  const o = (rand() < 0.5 ? -1 : 1) * (bandHalf(m) + 40 + rand() * 380)
  const [x, z] = perp(m, o)
  if (blocked(x, z)) continue
  if (rand() < 0.5) continue
  put(x, z, speciesFor(m), 0.7 + rand() * 0.5)
}

/* 4) Yesil пойменные ивы у реки/веток */
guard = 0
let added = 0
while (added < 1200 && guard++ < 60000) {
  const i = Math.floor(rand() * (alm.river.points.length - 1))
  const [x0, z0] = alm.river.points[i]
  const [x1, z1] = alm.river.points[i + 1]
  const f = rand()
  const x = x0 + (x1 - x0) * f + (rand() * 2 - 1) * 90
  const z = z0 + (z1 - z0) * f + (rand() * 2 - 1) * 90
  if (blocked(x, z)) continue
  put(x, z, rand() < 0.7 ? 3 : 0, 0.8 + rand() * 0.6)
  added++
}

fs.writeFileSync(
  path.join(root, 'src/data/trees.json'),
  JSON.stringify({ count: X.length, x: X, z: Z, s: S, sc: SC }),
)
console.log(`trees.json: ${X.length} trees`)
