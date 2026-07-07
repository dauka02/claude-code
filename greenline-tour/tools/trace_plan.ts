/**
 * Генплан → segments JSON (единственный источник планировочной геометрии).
 *
 * Пайплайн: страницы-схемы генплана растеризованы (tools/plans/*.png, 200 dpi),
 * по ним с координатной сеткой (grid_overlay.mjs) сняты контрольные точки
 * (tools/plan_points.json, в пикселях страницы для 2 очереди; 1 очередь — в
 * метрах по ортоспутнику + аэрорендеру, см. calibration.comment). Этот скрипт
 * пересчитывает всё в мировые метры и пишет segments/stage1.json,
 * segments/stage2.json, плюс контрольный оверлей tools/plans/overlay_check.png
 * (геометрия, отрисованная обратно поверх генплана).
 *
 * Запуск: npm run trace-plan
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pts = JSON.parse(fs.readFileSync(path.join(root, 'tools/plan_points.json'), 'utf8'))

type Pt = [number, number]

interface PathDef {
  id: string
  kind: 'promenade' | 'loop' | 'bike' | 'run' | 'branch'
  width: number
  points: Pt[]
}

/* ---------------- wing B: план-пиксели → метры ---------------- */
const calB = pts.calibration.wingB
const mB = calB.lengthM / (calB.x1px - calB.x0px)
/**
 * Поперечное сжатие: полоса на чертеже нарисована ~82 м (вместе с боковыми
 * лентами), фактический парк — 60 м. Топология сохраняется, всё остаётся
 * в коридоре ±30 м.
 */
const SQZ = 0.72
const bx = (px: number) => +((px - calB.x0px) * mB).toFixed(1)
const bz = (py: number) => +((py - calB.zAxisPx) * mB * SQZ).toFixed(1)
const bPt = ([px, py]: Pt): Pt => [bx(px), bz(py)]

/* ---------------- wing A: анизотропный масштаб ---------------- */
const calA = pts.calibration.wingA
const mAx = calA.lengthM / (calA.x1px - calA.x0px)
const mAz = calA.corridorM / (calA.zBotPx - calA.zTopPx)
const zMidA = (calA.zTopPx + calA.zBotPx) / 2
const aPt = ([px, py]: Pt): Pt => [
  +((px - calA.x0px) * mAx).toFixed(1),
  +((py - zMidA) * mAz).toFixed(1),
]

const round = (p: Pt): Pt => [+p[0].toFixed(1), +p[1].toFixed(1)]

/* ---------------- stage 2 ---------------- */
const wingB = {
  id: 's2b',
  name: 'Анет баба — Толе би',
  lengthM: calB.lengthM,
  corridor: { x0: 0, x1: calB.lengthM, halfW: 30 },
  paths: [
    { id: 'prom', kind: 'promenade', width: 5.5, points: pts.wingB.promenadePx.map(bPt) },
    ...pts.wingB.loopsPx.map((l: Pt[], i: number) => ({
      id: `loop${i}`,
      kind: 'loop' as const,
      width: 3.5,
      points: l.map(bPt),
    })),
    { id: 'bike', kind: 'bike', width: 2.4, points: pts.wingB.bikePx.map(bPt) },
    { id: 'run', kind: 'run', width: 2.0, points: pts.wingB.runPx.map(bPt) },
  ] as PathDef[],
  ponds: pts.wingB.pondsPx.map((p: { cx: number; cy: number; rx: number; ry: number; rot: number }) => ({
    cx: bx(p.cx),
    cz: bz(p.cy),
    rx: +(p.rx * mB).toFixed(1),
    rz: +(p.ry * mB * SQZ).toFixed(1),
    rot: p.rot,
  })),
  plazas: [
    { kind: 'circle', cx: bx(pts.wingB.plazaPx.cx), cz: bz(pts.wingB.plazaPx.cy), r: +(pts.wingB.plazaPx.rPx * mB).toFixed(1), ring: true },
    { kind: 'circle', cx: bx(pts.wingB.smallPoolPx.cx) - 12, cz: bz(pts.wingB.smallPoolPx.cy), r: 11, ring: false },
  ],
  lawns: [
    { cx: bx(pts.wingB.lawnPx.cx), cz: bz(pts.wingB.lawnPx.cy), r: +(pts.wingB.lawnPx.rPx * mB).toFixed(1) },
  ],
  smallPool: { cx: bx(pts.wingB.smallPoolPx.cx), cz: bz(pts.wingB.smallPoolPx.cy), r: +(pts.wingB.smallPoolPx.rPx * mB).toFixed(1) },
  playgrounds: pts.wingB.playgroundsPx.map((p: { cx: number; cy: number; rx: number; ry: number }) => ({
    cx: bx(p.cx),
    cz: bz(p.cy),
    rx: +(p.rx * mB).toFixed(1),
    rz: +(p.ry * mB * SQZ).toFixed(1),
  })),
  pavilions: pts.wingB.pavilionsPx.map(bPt).map(round),
  groves: pts.wingB.grovesPx.map((g: { x0: number; y0: number; x1: number; y1: number }) => ({
    x0: bx(g.x0),
    z0: bz(g.y0),
    x1: bx(g.x1),
    z1: bz(g.y1),
  })),
  zones: pts.wingB.zonesM,
  crossings: [{ x: -8 }, { x: calB.lengthM + 8 }],
  portals: [{ x: 2, z: 0, to: 's1', at: 721, label: 'Анет баба → Этап 1' }],
}

const wingA = {
  id: 's2a',
  name: 'Омарова — Култегін',
  lengthM: calA.lengthM,
  corridor: { x0: 0, x1: calA.lengthM, halfW: 30 },
  paths: [
    { id: 'prom', kind: 'promenade', width: 4.5, points: pts.wingA.promenadePx.map(aPt) },
    { id: 'bike', kind: 'bike', width: 2.4, points: pts.wingA.bikePx.map(aPt) },
    { id: 'run', kind: 'run', width: 2.0, points: pts.wingA.runPx.map(aPt) },
  ] as PathDef[],
  ponds: [],
  plazas: [],
  lawns: [],
  playgrounds: [
    { cx: pts.wingA.playgroundM.x, cz: pts.wingA.playgroundM.z, rx: pts.wingA.playgroundM.rx, rz: pts.wingA.playgroundM.rz },
  ],
  pavilions: pts.wingA.pavilionsPx.map(aPt).map(round),
  groves: pts.wingA.forestM.map((f: { x0: number; x1: number }) => ({ x0: f.x0, z0: -24, x1: f.x1, z1: 24 })),
  zones: { forest: 110, alley: 250, jogging: 170, playground: 240 },
  crossings: [{ x: -8 }, { x: calA.lengthM + 8 }],
  portals: [{ x: calA.lengthM - 2, z: 0, to: 's1', at: 0, label: 'Култегін → Этап 1' }],
}

/* ---------------- stage 1 ---------------- */
const s1 = pts.stage1
const stage1 = {
  id: 's1',
  name: 'Култегін — Анет баба (+ рукав Айтеке би)',
  lengthM: pts.calibration.stage1.lengthM,
  corridor: { x0: 0, x1: 721, halfW: 30 },
  paths: [
    { id: 'prom', kind: 'promenade', width: 4.5, points: s1.promenadeM },
    ...s1.loopsM.map((l: Pt[], i: number) => ({ id: `loop${i}`, kind: 'loop', width: 3, points: l })),
    { id: 'bike', kind: 'bike', width: 2.4, points: s1.bikeM },
    { id: 'branch', kind: 'branch', width: 4.5, points: s1.branchM },
    {
      id: 'branchBike',
      kind: 'bike',
      width: 2.2,
      points: s1.branchM.map(([x, z]: Pt) => [x + 8, z] as Pt),
    },
  ] as PathDef[],
  ponds: s1.pondsM,
  swales: s1.swalesM,
  plazas: [
    { kind: 'circle', cx: 372, cz: 0, r: 14, ring: true },
    { kind: 'circle', cx: 8, cz: 0, r: 11, ring: false },
    { kind: 'circle', cx: 712, cz: 2, r: 12, ring: false },
  ],
  lawns: [],
  playgrounds: [],
  pavilions: [] as Pt[],
  groves: [
    { x0: 150, z0: -18, x1: 262, z1: 20 },
    { x0: 480, z0: -20, x1: 610, z1: 18 },
  ],
  court: s1.courtM,
  rubber: s1.rubberM,
  kulan: s1.kulanM,
  branchInfo: s1.aiteke,
  zones: {
    entrance: 705, raingardens: 600, walls: 505, junction: 372,
    ponds: 318, play: 352, sport: 415, quiet: 205, westPlaza: 14, branch: 372,
  },
  crossings: [{ x: -8 }, { x: 729 }, { x: 372, street: true }],
  portals: [
    { x: 2, z: 0, to: 's2a', at: 330, label: 'Култегін → 2 очередь (запад)' },
    { x: 719, z: 0, to: 's2b', at: 0, label: 'Анет баба → 2 очередь (восток)' },
  ],
}

/* ---------------- запись ---------------- */
fs.mkdirSync(path.join(root, 'segments'), { recursive: true })
fs.writeFileSync(path.join(root, 'segments/stage1.json'), JSON.stringify(stage1, null, 1))
fs.writeFileSync(
  path.join(root, 'segments/stage2.json'),
  JSON.stringify({ id: 'stage2', lengthTotalM: calA.lengthM + calB.lengthM, wings: [wingA, wingB] }, null, 1),
)
console.log(`stage1.json: ${stage1.paths.length} paths, ${stage1.ponds.length} ponds`)
console.log(`stage2.json: wingA ${wingA.paths.length} paths / wingB ${wingB.paths.length} paths, ${wingB.ponds.length} ponds`)

/* ---------------- оверлей-проверка (крыло B поверх генплана) ---------------- */
const planFile = path.join(root, 'tools/plans/plan62_p6-6.png')
if (fs.existsSync(planFile)) {
  const png = PNG.sync.read(fs.readFileSync(planFile))
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (y * png.width + x) * 4
    png.data[i] = r
    png.data[i + 1] = g
    png.data[i + 2] = b
    png.data[i + 3] = 255
  }
  const toPxB = ([wx, wz]: Pt): Pt => [calB.x0px + wx / mB, calB.zAxisPx + wz / (mB * SQZ)]
  const stroke = (points: Pt[], rgb: [number, number, number], w = 3) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = toPxB(points[i])
      const [x1, y1] = toPxB(points[i + 1])
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n)
        const y = Math.round(y0 + ((y1 - y0) * s) / n)
        for (let dx = -w; dx <= w; dx++)
          for (let dy = -w; dy <= w; dy++) if (dx * dx + dy * dy <= w * w) put(x + dx, y + dy, ...rgb)
      }
    }
  }
  const circle = (cx: number, cz: number, r: number, rgb: [number, number, number]) => {
    const ring: Pt[] = []
    for (let a = 0; a <= 64; a++) ring.push([cx + Math.cos((a / 32) * Math.PI) * r, cz + Math.sin((a / 32) * Math.PI) * r])
    stroke(ring, rgb, 2)
  }
  for (const p of wingB.paths) {
    const rgb: [number, number, number] =
      p.kind === 'promenade' ? [255, 0, 255] : p.kind === 'loop' ? [255, 120, 0] : p.kind === 'bike' ? [0, 90, 255] : [0, 200, 60]
    // CatmullRom-ish preview: just polyline
    stroke(p.points, rgb, p.kind === 'promenade' ? 4 : 2)
  }
  for (const p of wingB.ponds) circle(p.cx, p.cz, Math.max(p.rx, p.rz), [0, 160, 255])
  circle(wingB.plazas[0].cx, wingB.plazas[0].cz, wingB.plazas[0].r, [255, 0, 0])
  circle(wingB.lawns[0].cx, wingB.lawns[0].cz, wingB.lawns[0].r, [255, 255, 0])
  fs.writeFileSync(path.join(root, 'tools/plans/overlay_check.png'), PNG.sync.write(png))
  console.log('overlay_check.png written')
}
