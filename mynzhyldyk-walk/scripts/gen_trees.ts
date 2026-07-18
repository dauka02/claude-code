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

/* 1) лента аллеи — РОЩИ-КЛАСТЕРЫ с луговыми полянами между ними
   (мастерплан: группы деревьев + открытые луга, не равномерный посев) */
const CLUSTERS = 520
let guard = 0
let made = 0
while (made < CLUSTERS && guard++ < CLUSTERS * 40) {
  const m = rand() * L
  const w = bandHalf(m)
  const co = (rand() * 2 - 1) * (w - 14)
  const [cx, cz] = perp(m, co)
  if (blocked(cx, cz)) continue
  made++
  const r = 7 + rand() * 15
  const n = 5 + Math.floor(rand() * 14)
  const dominant = speciesFor(m) // роща — преимущественно один вид
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2
    const rr = Math.sqrt(rand()) * r
    const x = cx + Math.cos(a) * rr
    const z = cz + Math.sin(a) * rr
    if (blocked(x, z)) continue
    const sp = rand() < 0.75 ? dominant : speciesFor(m)
    put(x, z, sp, 0.7 + rand() * 0.75)
  }
}

/* 2) рядовые вдоль бульваров — ДВА ряда с каждой стороны, один вид, ровный шаг */
for (const r of alm.roads) {
  if (r.kind !== 'boulevard') continue
  const rowSpecies = rand() < 0.5 ? 2 : 4 // вяз или клён на весь бульвар
  for (let i = 0; i < r.points.length - 1; i++) {
    const [x0, z0] = r.points[i]
    const [x1, z1] = r.points[i + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    const nx = -(z1 - z0) / len
    const nz = (x1 - x0) / len
    for (let d = 5; d < len; d += 9) {
      for (const side of [-1, 1])
        for (const row of [r.width / 2 + 4, r.width / 2 + 9.5]) {
          const x = x0 + ((x1 - x0) * d) / len + nx * side * row
          const z = z0 + ((z1 - z0) * d) / len + nz * side * row
          if (blocked(x, z)) continue
          put(x, z, rowSpecies, 0.92 + rand() * 0.22)
        }
    }
  }
}

/* 2б) рядовые вдоль городских улиц — один ряд, шаг 12 */
for (const r of alm.roads) {
  if (r.kind !== 'city') continue
  for (let i = 0; i < r.points.length - 1; i++) {
    const [x0, z0] = r.points[i]
    const [x1, z1] = r.points[i + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    const nx = -(z1 - z0) / len
    const nz = (x1 - x0) / len
    for (let d = 8; d < len; d += 12) {
      for (const side of [-1, 1]) {
        const x = x0 + ((x1 - x0) * d) / len + nx * side * (r.width / 2 + 4.5)
        const z = z0 + ((z1 - z0) * d) / len + nz * side * (r.width / 2 + 4.5)
        if (blocked(x, z)) continue
        put(x, z, 2, 0.9 + rand() * 0.2)
      }
    }
  }
}

/* 3) дворы кварталов — РЕДКИЕ группки по 2-4 (мастерплан: дворы почти пустые) */
const CTX_CLUSTERS = 420
guard = 0
made = 0
while (made < CTX_CLUSTERS && guard++ < CTX_CLUSTERS * 50) {
  const m = rand() * L
  const o = (rand() < 0.5 ? -1 : 1) * (bandHalf(m) + 60 + rand() * 360)
  const [cx, cz] = perp(m, o)
  if (blocked(cx, cz)) continue
  made++
  const n = 2 + Math.floor(rand() * 3)
  for (let k = 0; k < n; k++) {
    const x = cx + (rand() * 2 - 1) * 9
    const z = cz + (rand() * 2 - 1) * 9
    if (blocked(x, z)) continue
    put(x, z, speciesFor(m), 0.7 + rand() * 0.45)
  }
}

/* 3б) парковые рощи у landform-холмов и озёр (вторичные парки) */
for (const lf of alm.landforms) {
  const n = 26 + Math.floor(rand() * 22)
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2
    const rr = (0.35 + Math.sqrt(rand()) * 0.85) * lf.r
    const x = lf.x + Math.cos(a) * rr
    const z = lf.z + Math.sin(a) * rr
    if (blocked(x, z)) continue
    put(x, z, rand() < 0.55 ? 1 : 0, 0.8 + rand() * 0.7)
  }
}
for (const l of alm.lakes) {
  const n = 60
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2
    const rr = 1.15 + rand() * 0.55
    const x = l.x + Math.cos(a) * l.rx * rr
    const z = l.z + Math.sin(a) * l.rz * rr
    if (blocked(x, z)) continue
    put(x, z, rand() < 0.4 ? 3 : speciesFor(0), 0.8 + rand() * 0.6)
  }
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
