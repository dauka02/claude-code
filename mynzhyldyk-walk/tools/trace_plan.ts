/**
 * Мастерплан LDA → src/data/alm.json (+ trees.json через scripts/gen_trees).
 * Контрольные точки в пикселях tools/plans/mp-22.png → мировые метры:
 * поворот на axisAngleDeg, масштаб mPerPx, X — восток вдоль оси, Z — юг.
 * Запуск: npm run trace-plan
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pts = JSON.parse(fs.readFileSync(path.join(root, 'tools/plan_points.json'), 'utf8'))

type Pt = [number, number]

const { mPerPx, anchorPx, axisAngleDeg } = pts.calibration
const th = (axisAngleDeg * Math.PI) / 180
const cos = Math.cos(th)
const sin = Math.sin(th)

const toWorld = ([px, py]: Pt): Pt => {
  const dx = px - anchorPx[0]
  const dy = py - anchorPx[1]
  return [+((dx * cos + dy * sin) * mPerPx).toFixed(1), +((-dx * sin + dy * cos) * mPerPx).toFixed(1)]
}

/* спайн + арклонги */
const spine: Pt[] = pts.spinePx.map(toWorld)
const arc: number[] = [0]
for (let i = 1; i < spine.length; i++) {
  arc.push(arc[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]))
}
const L = arc[arc.length - 1]

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
  const dir: Pt = [(spine[i][0] - spine[i - 1][0]) / len, (spine[i][1] - spine[i - 1][1]) / len]
  return { p, dir }
}
const off = (m: number, o: number): Pt => {
  const { p, dir } = spineAt(m)
  return [+(p[0] - dir[1] * o * -1).toFixed(1), +(p[1] + dir[0] * o * 1).toFixed(1)]
}
// поперечный offset: +o = юг (перпендикуляр справа по ходу на восток)
function perp(m: number, o: number): Pt {
  const { p, dir } = spineAt(m)
  return [+(p[0] - dir[1] * o).toFixed(1), +(p[1] + dir[0] * o).toFixed(1)]
}
void off

const quarters = Object.entries(pts.quarterFractions).map(([id, [f0, f1]]) => ({
  id,
  fromM: +(L * (f0 as number)).toFixed(0),
  toM: +(L * (f1 as number)).toFixed(0),
}))

/* полигон площадки: north кромка, восточный торец, south кромка с аннексами, зап. отросток */
const N_OFF = -470
const S_OFF = 470
const sitePoly: Pt[] = []
for (let m = 0; m <= L; m += 200) sitePoly.push(perp(m, N_OFF))
sitePoly.push(perp(L, 0), perp(L, S_OFF))
const annex = (fromM: number, toM: number, southToM: number) =>
  [perp(toM, S_OFF), perp(toM, southToM), perp(fromM, southToM), perp(fromM, S_OFF)] as Pt[]
// южная кромка запад ← восток, вплетая аннексы
const south: Pt[] = []
const annexes = [...pts.annexes].sort((a, b) => b.fromM - a.fromM)
let cursor = L
for (const a of annexes) {
  const toM = Math.min(a.toM, L)
  for (let m = cursor; m > toM; m -= 200) south.push(perp(m, S_OFF))
  south.push(...annex(a.fromM, toM, a.southToM))
  cursor = a.fromM
}
for (let m = cursor; m >= 0; m -= 200) south.push(perp(m, S_OFF))
sitePoly.push(...south)

/* дороги */
const roads: { id: string; kind: string; width: number; points: Pt[] }[] = []
// продольные бульвары по обе стороны ленты
const bandHalf = (m: number) => {
  const t = (m / L) * (pts.bandHalfWidthM.length - 1)
  const i = Math.min(Math.floor(t), pts.bandHalfWidthM.length - 2)
  const f = t - i
  return pts.bandHalfWidthM[i] * (1 - f) + pts.bandHalfWidthM[i + 1] * f
}
for (const side of [-1, 1]) {
  const p: Pt[] = []
  for (let m = 0; m <= L; m += 150) p.push(perp(m, side * (bandHalf(m) + pts.roads.longBoulevardOffsetM)))
  roads.push({ id: side < 0 ? 'blvdN' : 'blvdS_zhurgenova', kind: 'boulevard', width: 22, points: p })
}
// внешние district-улицы
for (const side of [-1, 1]) {
  const p: Pt[] = []
  for (let m = 0; m <= L; m += 250) p.push(perp(m, side * pts.roads.districtOffsetM))
  roads.push({ id: side < 0 ? 'distN' : 'distS', kind: 'district', width: 15, points: p })
}
// поперечные city
pts.roads.cityCrossAtM.forEach((m: number, i: number) => {
  roads.push({
    id: i === pts.roads.shamshiIndex ? 'city_shamshi' : `city${i}`,
    kind: 'city',
    width: 26,
    points: [perp(m, -pts.roads.cityCrossHalfLenM), perp(m, -60), perp(m, 60), perp(m, pts.roads.cityCrossHalfLenM)],
  })
})
// поперечные бульвары
pts.roads.crossBlvdAtM.forEach((m: number, i: number) => {
  roads.push({ id: `xblvd${i}`, kind: 'boulevard', width: 15, points: [perp(m, -520), perp(m, 520)] })
})

/* аллея: главная прогулочная дорожка (серпантин в ленте) + вело */
const walk: Pt[] = []
const bike: Pt[] = []
const run: Pt[] = []
for (let m = 0; m <= L; m += 90) {
  const w = bandHalf(m)
  walk.push(perp(m, Math.sin(m * 0.004) * w * 0.45))
  bike.push(perp(m, Math.sin(m * 0.0028 + 2.1) * w * 0.3 - w * 0.18))
  run.push(perp(m, Math.sin(m * 0.0035 + 4.4) * w * 0.42 + w * 0.22))
}

/* LRT */
const lrtPts: Pt[] = []
for (let m = 0; m <= pts.lrt.stationAtM - 220; m += 140) lrtPts.push(perp(m, pts.lrt.offsetM))
lrtPts.push(perp(pts.lrt.stationAtM - 120, pts.lrt.offsetM - 40), perp(pts.lrt.stationAtM, -150))

/* вода */
const river = pts.riverPx.map(toWorld)
const lakes = pts.lakesPx.map((l: { id: string; cx: number; cy: number; rxM: number; rzM: number }) => {
  const [x, z] = toWorld([l.cx, l.cy])
  return { id: l.id, x, z, rx: l.rxM, rz: l.rzM, rot: 0 }
})
/* SuDS-каналы: от Raindrops к озеру Galaxy и в Yesil */
const m12 = toWorld(pts.markersPx['14'])
const suds = [
  [m12, toWorld(pts.markersPx['12'])],
  [toWorld(pts.markersPx['24']), toWorld(pts.markersPx['22'])],
  [toWorld(pts.markersPx['28']), toWorld(pts.markersPx['30'])],
]

/* POI */
const pois = pts.poisWorld.map((p: { id: string; marker?: number; x?: number; z?: number; title: string; ru: string }) => {
  const [x, z] = p.marker ? toWorld(pts.markersPx[String(p.marker)]) : [p.x!, p.z!]
  return { id: p.id, x, z, title: p.title, ru: p.ru }
})

const markers = Object.fromEntries(Object.entries(pts.markersPx).map(([k, v]) => [k, toWorld(v as Pt)]))

const out = {
  lengthM: +L.toFixed(0),
  spine,
  spineArc: arc.map((a) => +a.toFixed(1)),
  bandHalfWidthM: pts.bandHalfWidthM,
  quarters,
  sitePoly,
  roads,
  alley: { walk, bike, run },
  lrt: { points: lrtPts, stopsAtM: pts.lrt.stopsAtM, stationAtM: pts.lrt.stationAtM, railCrossAtM: pts.lrt.railCrossAtM, offsetM: pts.lrt.offsetM },
  river: { points: river, width: pts.riverWidthM },
  lakes,
  suds,
  landforms: pts.landformsWorld,
  pois,
  markers,
}

fs.mkdirSync(path.join(root, 'src/data'), { recursive: true })
fs.writeFileSync(path.join(root, 'src/data/alm.json'), JSON.stringify(out))
console.log(`alm.json: L=${L.toFixed(0)}m, ${roads.length} roads, ${sitePoly.length} site pts, ${pois.length} POI`)
console.log('quarters:', quarters.map((q) => `${q.id} ${q.fromM}-${q.toM}`).join(' | '))
