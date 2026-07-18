import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, bandHalf, inLake, perp, riverDist, spineAt, L } from '../data/geo'
import {
  fbFacadeBrick,
  fbFacadeStone,
  fbFacadeTower,
  fbFacadeWhite,
  useTexOr,
} from './assets'

const TILE_W = 22
const TILE_H = 21

function rng(seedInit: number) {
  let a = seedInit >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Block {
  x: number
  z: number
  rot: number
  len: number
  dep: number
  h: number
  mat: number // 0 brick,1 stone,2 white,3 tower
  tint: number
}

function layout(): { blocks: Block[]; context: Block[] } {
  const rand = rng(4242)
  const blocks: Block[] = []
  const context: Block[] = []
  const nearCross = (m: number) => ALM.roads.some((r) => r.kind === 'city' && Math.abs(mOfRoad(r) - m) < 55)
  const mOfRoadCache = new Map<string, number>()
  function mOfRoad(r: { id: string; points: [number, number][] }): number {
    let v = mOfRoadCache.get(r.id)
    if (v === undefined) {
      // поперечные city-дороги проходят через spine: ближний арклонг середины
      const mid = r.points[Math.floor(r.points.length / 2)]
      let best = Infinity
      let bm = 0
      for (let m = 0; m <= L; m += 50) {
        const s = spineAt(m)
        const d = (s.x - mid[0]) ** 2 + (s.z - mid[1]) ** 2
        if (d < best) {
          best = d
          bm = m
        }
      }
      mOfRoadCache.set(r.id, (v = bm))
    }
    return v
  }

  // ПЕРИМЕТРАЛЬНЫЕ КВАРТАЛЫ (мастерплан: замкнутые дворы, сплошной фронт улиц):
  // каждый квартал = передняя + задняя пластины вдоль оси + две боковые,
  // с разрывами-арками; угловые башни в хаб/вокзальной зоне.
  for (let m = 90; m < L - 90; ) {
    const len = 78 + rand() * 34
    if (nearCross(m + len / 2)) {
      m += 70
      continue
    }
    const mc = m + len / 2
    const s = spineAt(mc)
    const rot = -Math.atan2(s.dz, s.dx)
    for (const side of [-1, 1]) {
      for (const [ri, rowOff] of [64, 190].entries()) {
        if (rand() < 0.1) continue
        const depth = 40 + rand() * 8 // глубина двора
        const oFront = side * (bandHalf(mc) + rowOff)
        const oBack = oFront + side * depth
        const [fx, fz] = perp(mc, oFront)
        if (inLake(fx, fz, 30) || riverDist(fx, fz) < 90) continue
        const isTowerZone = (m > 3400 && m < 3950) || (m > 4100 && m < 4750)
        const mat = Math.floor(rand() * 3)
        const baseH = (5 + Math.floor(rand() * 4)) * 3
        // передняя пластина (активный фронт к аллее/улице)
        blocks.push({ x: fx, z: fz, rot, len: len - 16, dep: 13, h: baseH + (rand() < 0.4 ? 3 : 0), mat, tint: 0.85 + rand() * 0.28 })
        // задняя пластина
        const [bx, bz] = perp(mc, oBack)
        if (!inLake(bx, bz, 30) && riverDist(bx, bz) > 90)
          blocks.push({ x: bx, z: bz, rot, len: len - 16, dep: 13, h: baseH - 3 + (rand() < 0.4 ? 3 : 0), mat: Math.floor(rand() * 3), tint: 0.85 + rand() * 0.28 })
        // боковые пластины (с шансом разрыва-арки)
        for (const e of [-1, 1]) {
          if (rand() < 0.3) continue
          const [sx, sz] = perp(mc + e * (len / 2 - 7), (oFront + oBack) / 2)
          if (inLake(sx, sz, 30) || riverDist(sx, sz) < 90) continue
          blocks.push({ x: sx, z: sz, rot: rot + Math.PI / 2, len: depth - 15, dep: 12, h: baseH - 3, mat: Math.floor(rand() * 3), tint: 0.85 + rand() * 0.28 })
        }
        // угловая башня
        if (isTowerZone && ri === 0 && rand() < 0.4) {
          const [tx, tz] = perp(mc - len / 2 + 14, oFront + side * 6)
          blocks.push({ x: tx, z: tz, rot, len: 24 + rand() * 6, dep: 24 + rand() * 6, h: (16 + Math.floor(rand() * 9)) * 3, mat: 3, tint: 0.9 + rand() * 0.2 })
        }
      }
    }
    m += len + 14 + rand() * 14
  }
  // context massing — дальняя периферия, серые объёмы
  for (let m = 0; m < L; m += 130) {
    for (const side of [-1, 1]) {
      for (const rowOff of [560, 700, 850]) {
        if (rand() < 0.4) continue
        const [x, z] = perp(m, side * rowOff)
        if (riverDist(x, z) < 100) continue
        const s = spineAt(m)
        context.push({
          x,
          z,
          rot: -Math.atan2(s.dz, s.dx),
          len: 60 + rand() * 60,
          dep: 16 + rand() * 12,
          h: (5 + Math.floor(rand() * 9)) * 3,
          mat: 0,
          tint: 0.75 + rand() * 0.2,
        })
      }
    }
  }
  return { blocks, context }
}

function blockGeo(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.len, b.h, b.dep)
  const uv = g.attributes.uv
  const dims: [number, number][] = [
    [b.dep, b.h],
    [b.dep, b.h],
    [0, 0],
    [0, 0],
    [b.len, b.h],
    [b.len, b.h],
  ]
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      if (fw === 0) uv.setXY(i, 0.03, 0.97)
      else uv.setXY(i, (uv.getX(i) * fw) / TILE_W, (uv.getY(i) * fh) / TILE_H)
    }
  }
  const colors = new Float32Array(uv.count * 3)
  colors.fill(b.tint)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.rotateY(b.rot)
  g.translate(b.x, b.h / 2 - 0.4, b.z)
  return g
}

function roofGeo(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.len + 0.7, 0.5, b.dep + 0.7)
  g.rotateY(b.rot)
  g.translate(b.x, b.h - 0.3, b.z)
  return g
}

function FacadeSet({ blocks, tex }: { blocks: Block[]; tex: THREE.Texture }) {
  const geo = useMemo(() => (blocks.length ? mergeGeometries(blocks.map(blockGeo), false)! : null), [blocks])
  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial map={tex} vertexColors roughness={0.85} metalness={0.06} />
    </mesh>
  )
}

/** Вокзал Nurly Zhol: длинный объём с волнообразной крышей. */
function NurlyZhol() {
  const m = ALM.lrt.stationAtM
  const s = spineAt(Math.min(m, L - 10))
  const [x, z] = perp(Math.min(m, L - 10), -195)
  const rot = -Math.atan2(s.dz, s.dx)
  const roof = useMemo(() => {
    const pts: THREE.Vector2[] = []
    const LEN = 240
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      pts.push(new THREE.Vector2(-LEN / 2 + LEN * t, 24 + Math.sin(t * Math.PI) * 9 + Math.sin(t * Math.PI * 3) * 1.5))
    }
    const shape = new THREE.Shape()
    shape.moveTo(-120, 0)
    for (const p of pts) shape.lineTo(p.x, p.y - 22)
    shape.lineTo(120, 0)
    shape.lineTo(-120, 0)
    const g = new THREE.ExtrudeGeometry(shape, { depth: 46, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.rotateY(Math.PI / 2)
    g.rotateY(rot)
    g.translate(x, 21, z)
    return g
  }, [x, z, rot])
  return (
    <group>
      <mesh geometry={roof} castShadow>
        <meshStandardMaterial color="#cfd4d6" roughness={0.35} metalness={0.5} />
      </mesh>
      <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 10, 0]} castShadow>
          <boxGeometry args={[236, 20, 42]} />
          <meshPhysicalMaterial color="#a8c4cc" roughness={0.2} metalness={0.3} transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 1, 30]} receiveShadow>
          <boxGeometry args={[280, 2, 24]} />
          <meshStandardMaterial color="#c4beb0" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

export default function Buildings() {
  const brick = useTexOr('facadeBrick', fbFacadeBrick)
  const stone = useTexOr('facadeStone', fbFacadeStone)
  const white = useTexOr('facadeWhite', fbFacadeWhite)
  const towerTex = useTexOr('facadeTower', fbFacadeTower)
  const { blocks, context } = useMemo(layout, [])
  const roofs = useMemo(
    () => mergeGeometries([...blocks, ...context].map(roofGeo), false)!,
    [blocks, context],
  )
  const ctxGeo = useMemo(() => mergeGeometries(context.map(blockGeo), false)!, [context])
  return (
    <group>
      <FacadeSet blocks={blocks.filter((b) => b.mat === 0)} tex={brick} />
      <FacadeSet blocks={blocks.filter((b) => b.mat === 1)} tex={stone} />
      <FacadeSet blocks={blocks.filter((b) => b.mat === 2)} tex={white} />
      <FacadeSet blocks={blocks.filter((b) => b.mat === 3)} tex={towerTex} />
      <mesh geometry={ctxGeo}>
        <meshStandardMaterial color="#b6b2a8" roughness={0.95} />
      </mesh>
      <mesh geometry={roofs}>
        <meshStandardMaterial color="#4a4e52" roughness={0.95} />
      </mesh>
      <NurlyZhol />
    </group>
  )
}
