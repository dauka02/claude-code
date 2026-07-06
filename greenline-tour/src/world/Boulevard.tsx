import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  COURT,
  HALF_W,
  LENGTH,
  PATH_CURVE,
  RUBBER,
  SWALES,
  heightAt,
  pathXAt,
  rng,
} from './constants'
import {
  blobGeometry,
  blobPoints,
  offsetPolyline,
  ribbonGeometry,
  samplePath,
  wallGeometry,
  type Pt,
} from './geometry'
import {
  fallbackGravel,
  fallbackGrass,
  fallbackPaving,
  fallbackStone,
  makeCourtTexture,
  makeRubberTexture,
  makeWoodTexture,
  useTexOrFallback,
} from './textures'

const yAt = (x: number, z: number) => heightAt(x, z)

/** Terrain: displaced plane covering the green boulevard strip. */
function Terrain() {
  const grass = useTexOrFallback('grass', fallbackGrass, [64, 170])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(HALF_W * 2 + 10, LENGTH + 120, 100, 340)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, LENGTH / 2 + 10)
    const p = g.attributes.position
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      p.setY(i, heightAt(x, z))
      // darken sunken beds, warm up dry patches
      const swale = SWALES.some((s) => {
        const dx = (x - s.x) / s.rx
        const dz = (z - s.z) / s.rz
        return dx * dx + dz * dz < 1.4
      })
      const t = 0.85 + 0.3 * Math.sin(x * 0.8 + z * 0.53) * Math.sin(z * 0.31)
      c.setRGB(0.95 * t, 1.0 * t, 0.9 * t)
      if (swale) c.multiplyScalar(0.72)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={grass} vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

/** Streets, parking lanes and sidewalks flanking the boulevard. */
function Streets() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const mk = (x0: number, x1: number, y: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, LENGTH + 120)
      g.rotateX(-Math.PI / 2)
      g.translate((x0 + x1) / 2, y, LENGTH / 2 + 10)
      return g
    }
    for (const side of [-1, 1]) {
      parts.push(mk(side * HALF_W, side * (HALF_W + 3), 0.0)) // parking lane
      parts.push(mk(side * (HALF_W + 3), side * (HALF_W + 12), -0.02)) // street
      parts.push(mk(side * (HALF_W + 12), side * (HALF_W + 60), 0.05)) // sidewalk + building ground
    }
    // end streets (crosswalk zones)
    for (const zEnd of [-14, LENGTH + 14]) {
      const g = new THREE.PlaneGeometry(HALF_W * 2 + 120, 16)
      g.rotateX(-Math.PI / 2)
      g.translate(0, -0.02, zEnd)
      parts.push(g)
    }
    return mergeGeometries(parts, false)!
  }, [])
  const colors = useMemo(() => {
    // vertex colors: darker asphalt vs lighter sidewalk handled by two materials is
    // overkill — single dim material reads fine at distance
    return null
  }, [])
  void colors
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#5a5c5e" roughness={0.95} metalness={0} />
    </mesh>
  )
}

/** Zebra crosswalks connecting boulevard ends to the far sidewalks. */
function Crosswalks() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const zEnd of [-9, LENGTH + 9]) {
      for (let i = -3; i <= 3; i++) {
        const g = new THREE.PlaneGeometry(2.2, 0.9)
        g.rotateX(-Math.PI / 2)
        g.translate(pathXAt(zEnd < 0 ? 0 : LENGTH) + i * 1.8, 0.0, zEnd)
        parts.push(g)
      }
    }
    return mergeGeometries(parts, false)!
  }, [])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#cfd2d4" roughness={0.9} />
    </mesh>
  )
}

/** Main serpentine paved path, entrance & exit plazas. */
function MainPath() {
  const paving = useTexOrFallback('paving', fallbackPaving, [1, 1])
  const geo = useMemo(() => {
    const pts = samplePath(PATH_CURVE, 360)
    const path = ribbonGeometry(pts, 4, yAt, 5.2)
    // entrance plaza 0..16 m, exit plaza
    const inPlaza = new THREE.CircleGeometry(13, 40)
    inPlaza.rotateX(-Math.PI / 2)
    inPlaza.translate(pathXAt(4), 0.025, 6)
    const outPlaza = new THREE.CircleGeometry(11, 40)
    outPlaza.rotateX(-Math.PI / 2)
    outPlaza.translate(pathXAt(LENGTH - 4), 0.025, LENGTH - 5)
    // plaza UVs in world space so pattern scale matches path
    for (const plaza of [inPlaza, outPlaza]) {
      const p = plaza.attributes.position
      const uv = plaza.attributes.uv
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 5.2, p.getZ(i) / 5.2)
    }
    return mergeGeometries([path, inPlaza, outPlaza], false)!
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={paving} roughness={0.85} metalness={0.02} />
    </mesh>
  )
}

/** Secondary gravel paths branching off the main path. */
function GravelPaths() {
  const gravel = useTexOrFallback('gravel', fallbackGravel, [1, 1])
  const geo = useMemo(() => {
    const mk = (waypoints: [number, number][]) => {
      const curve = new THREE.CatmullRomCurve3(
        waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      )
      return ribbonGeometry(samplePath(curve, 60), 1.8, yAt, 3, 0.025)
    }
    const parts = [
      // rain garden loop connectors
      mk([
        [pathXAt(95), 95],
        [-8, 100],
        [-16, 112],
        [-19, 135],
        [-12, 150],
        [pathXAt(158), 158],
      ]),
      mk([
        [pathXAt(120), 120],
        [10, 128],
        [18, 145],
        [19, 170],
        [10, 188],
        [pathXAt(196), 196],
      ]),
      // pond overlook
      mk([
        [pathXAt(240), 240],
        [-6, 248],
        [-2, 262],
        [pathXAt(272), 272],
      ]),
      // to sport court
      mk([
        [pathXAt(538), 538],
        [4, 545],
        [COURT.x - 10, COURT.z - 6],
        [COURT.x - 9.5, COURT.z + 6],
        [pathXAt(585), 582],
      ]),
      // quiet zone winding path
      mk([
        [pathXAt(628), 628],
        [6, 638],
        [12, 655],
        [8, 672],
        [-1, 685],
        [pathXAt(700), 700],
      ]),
      mk([
        [pathXAt(645), 645],
        [-10, 652],
        [-15, 668],
        [-10, 684],
        [pathXAt(694), 694],
      ]),
    ]
    return mergeGeometries(parts, false)!
  }, [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={gravel} roughness={1} metalness={0} />
    </mesh>
  )
}

/**
 * Retaining walls: type 1 — 48 short segments (~695.9 m total),
 * type 2 — 4 long segments (136 m). Some carry wooden bench tops (Props).
 */
export function useWallSegments() {
  return useMemo(() => {
    const rand = rng(4242)
    const pts = samplePath(PATH_CURVE, 360) // ~2.08 m step
    const segs: { pts: Pt[]; type: 1 | 2; side: number }[] = []
    const step = pts.length / 60
    let cursor = 4
    let count1 = 0
    const type2At = [8, 22, 38, 52] // indices in units of `step`
    let unit = 0
    while (cursor < pts.length - 12 && count1 + type2At.length <= 52) {
      const isType2 = type2At.includes(unit) && segs.filter((s) => s.type === 2).length < 4
      const segLen = isType2 ? 16 : 5 + Math.floor(rand() * 4) // in samples (~2m each)
      const side = rand() > 0.5 ? 1 : -1
      const start = Math.floor(cursor)
      const end = Math.min(pts.length - 1, start + segLen)
      const center = pts.slice(start, end)
      if (center.length > 2) {
        const off = offsetPolyline(center, side * (2.6 + rand() * 0.8))
        segs.push({ pts: off, type: isType2 ? 2 : 1, side })
        if (!isType2) count1++
      }
      cursor += segLen + 2 + rand() * step * 0.5
      unit++
    }
    return segs
  }, [])
}

function RetainingWalls() {
  const stone = useTexOrFallback('stone', fallbackStone, [1, 1])
  const segs = useWallSegments()
  const geo = useMemo(() => {
    const parts = segs.map((s) =>
      wallGeometry(s.pts, s.type === 2 ? 0.55 : 0.4, s.type === 2 ? 0.6 : 0.45, yAt, 2.2),
    )
    return mergeGeometries(parts, false)!
  }, [segs])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial map={stone} roughness={0.9} metalness={0} />
    </mesh>
  )
}

/** Wooden boardwalk zig-zagging over the rain-garden swales. */
function Boardwalk() {
  const wood = useMemo(() => makeWoodTexture(), [])
  const { deck, posts } = useMemo(() => {
    const way: [number, number][] = [
      [pathXAt(88) - 3, 88],
      [-13, 98],
      [-15, 112],
      [-9, 122],
      [4, 130],
      [13, 140],
      [16, 152],
      [10, 163],
      [-4, 172],
      [-14, 182],
      [-15, 196],
      [-8, 206],
      [pathXAt(214), 214],
    ]
    const curve = new THREE.CatmullRomCurve3(way.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.1)
    const pts = samplePath(curve, 140)
    const yDeck = (x: number, z: number) => Math.max(heightAt(x, z), -0.05) + 0.32
    const deckGeo = ribbonGeometry(pts, 1.7, yDeck, 0.9, 0)
    // support posts
    const postParts: THREE.BufferGeometry[] = []
    for (let i = 4; i < pts.length - 4; i += 7) {
      for (const off of [-0.7, 0.7]) {
        const o = offsetPolyline(pts.slice(i, i + 2), off)[0]
        const top = yDeck(o.x, o.z)
        const g = new THREE.CylinderGeometry(0.06, 0.06, top - heightAt(o.x, o.z) + 0.55, 6)
        g.translate(o.x, top - (top - heightAt(o.x, o.z) + 0.55) / 2, o.z)
        postParts.push(g)
      }
    }
    return { deck: deckGeo, posts: mergeGeometries(postParts, false)! }
  }, [])
  return (
    <group>
      <mesh geometry={deck} castShadow receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </mesh>
      <mesh geometry={posts} castShadow>
        <meshStandardMaterial color="#6b5236" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Blue-teal rubber play surface (organic blob) + court slab. */
function SportPlaySurfaces() {
  const rubber = useMemo(() => makeRubberTexture(), [])
  const court = useMemo(() => makeCourtTexture(), [])
  const rubberGeo = useMemo(() => {
    const pts = blobPoints(RUBBER.x, RUBBER.z, RUBBER.rx, RUBBER.rz, 0.2, 0.22, 3)
    const g = blobGeometry(pts, 0, 7)
    // conform to terrain
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + 0.04)
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group>
      <mesh geometry={rubberGeo} receiveShadow>
        <meshStandardMaterial map={rubber} roughness={0.95} />
      </mesh>
      <mesh position={[COURT.x, 0.03, COURT.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[COURT.w, COURT.l]} />
        <meshStandardMaterial map={court} roughness={0.92} />
      </mesh>
    </group>
  )
}

export default function Boulevard() {
  return (
    <group>
      <Terrain />
      <Streets />
      <Crosswalks />
      <MainPath />
      <GravelPaths />
      <RetainingWalls />
      <Boardwalk />
      <SportPlaySurfaces />
    </group>
  )
}
