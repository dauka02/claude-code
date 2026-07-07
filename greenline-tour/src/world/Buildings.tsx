import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SEGMENTS, rng, type SegModel } from '../data/geometry'
import {
  fallbackFacadeBrick,
  fallbackFacadeBrickNight,
  fallbackFacadeLight,
  fallbackFacadeLightNight,
  useTexOrFallback,
} from './textures'
import { useTour } from '../store'

/** Один тайл фасадной текстуры ≈ 4 окна × 6 этажей. */
const TILE_W = 13
const TILE_H = 19

interface Block {
  x: number
  z: number
  w: number
  d: number
  h: number
  brick: boolean
  tint: number
}

function layoutBlocks(seg: SegModel): Block[] {
  const rand = rng(20240 + seg.lengthM)
  const blocks: Block[] = []
  const dark = seg.id !== 's1' // 2 очередь — тёмная палитра из рендеров
  for (const side of [-1, 1]) {
    let x = -40
    while (x < seg.lengthM + 40) {
      const d = 38 + rand() * 55
      const gap = 10 + rand() * 22
      const floors = 12 + Math.floor(rand() * 7)
      const w = 15 + rand() * 8
      const brick = rand() < (dark ? 0.5 : 0.4)
      blocks.push({
        z: side * (seg.halfW + 13 + w / 2 + rand() * 8),
        x: x + d / 2,
        w,
        d,
        h: floors * 3,
        brick,
        tint: dark ? 0.4 + rand() * 0.3 : brick ? 0.9 + rand() * 0.2 : 0.72 + rand() * 0.33,
      })
      x += d + gap
    }
  }
  // вдоль рукава Айтеке би
  if (seg.branch) {
    const pts = seg.branch.pts
    for (const side of [-1, 1]) {
      for (let i = 8; i < pts.length - 6; i += 26) {
        const p = pts[i]
        const d = 40 + rand() * 30
        blocks.push({
          x: p.x + side * (44 + rand() * 8),
          z: p.z + d / 4,
          w: 16 + rand() * 6,
          d: 20 + rand() * 10,
          h: (12 + Math.floor(rand() * 6)) * 3,
          brick: rand() < 0.4,
          tint: 0.75 + rand() * 0.3,
        })
      }
    }
  }
  return blocks
}

/** Бокс с фасадными UV по размеру граней и цветовым тоном в вершинах. */
function buildingGeometry(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.d, b.h, b.w) // d вдоль X
  g.translate(b.x, b.h / 2 - 0.5, b.z)
  const uv = g.attributes.uv
  const faceDims: [number, number][] = [
    [b.w, b.h],
    [b.w, b.h],
    [0, 0],
    [0, 0],
    [b.d, b.h],
    [b.d, b.h],
  ]
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceDims[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      if (fw === 0) uv.setXY(i, 0.02, 0.985)
      else uv.setXY(i, (uv.getX(i) * fw) / TILE_W, (uv.getY(i) * fh) / TILE_H)
    }
  }
  const colors = new Float32Array(uv.count * 3)
  for (let i = 0; i < uv.count; i++) {
    colors[i * 3] = b.tint
    colors[i * 3 + 1] = b.tint
    colors[i * 3 + 2] = b.tint
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

function roofGeometry(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.d + 0.6, 0.5, b.w + 0.6)
  g.translate(b.x, b.h - 0.3, b.z)
  return g
}

function FacadeSet({ blocks, brick }: { blocks: Block[]; brick: boolean }) {
  const night = useTour((s) => s.night)
  const day = useTexOrFallback(brick ? 'facadeBrick' : 'facadeLight', brick ? fallbackFacadeBrick : fallbackFacadeLight)
  const nightTex = useTexOrFallback(
    brick ? 'facadeBrickNight' : 'facadeLightNight',
    brick ? fallbackFacadeBrickNight : fallbackFacadeLightNight,
  )
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const geo = useMemo(() => (blocks.length ? mergeGeometries(blocks.map(buildingGeometry), false)! : null), [blocks])
  useFrame((_, delta) => {
    const m = matRef.current
    if (!m) return
    m.emissiveIntensity = THREE.MathUtils.lerp(m.emissiveIntensity, night ? 1.35 : 0, Math.min(1, delta * 1.5))
  })
  if (!geo) return null
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        map={day}
        vertexColors
        emissive="#ffffff"
        emissiveMap={nightTex}
        emissiveIntensity={0}
        roughness={0.85}
        metalness={0.05}
      />
    </mesh>
  )
}

/**
 * Ландмарки горизонта (восток, за Толе би): силуэты «шатра» Хан Шатыр
 * и пирамиды Дворца мира — низкая детализация, для узнаваемости панорамы.
 */
function Landmarks({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame((_, delta) => {
    if (matRef.current)
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity,
        night ? 0.5 : 0.06,
        Math.min(1, delta * 1.5),
      )
  })
  if (seg.id === 's2a') return null
  const bx = seg.lengthM + 480
  return (
    <group>
      {/* шатёр Хан Шатыр */}
      <group position={[bx, 0, -170]}>
        <mesh position={[0, 55, 0]} castShadow={false}>
          <coneGeometry args={[62, 110, 24, 1]} />
          <meshStandardMaterial
            ref={matRef}
            color="#9fb4c4"
            roughness={0.35}
            metalness={0.4}
            emissive="#cfe2ee"
            emissiveIntensity={0.06}
            flatShading
          />
        </mesh>
        <mesh position={[8, 118, 0]} rotation={[0, 0, -0.18]}>
          <cylinderGeometry args={[0.8, 1.6, 26, 6]} />
          <meshStandardMaterial color="#8fa4b4" roughness={0.4} metalness={0.5} />
        </mesh>
      </group>
      {/* пирамида Дворца мира */}
      <mesh position={[bx + 160, 31, 150]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[44, 62, 4, 1]} />
        <meshStandardMaterial color="#aebfc9" roughness={0.3} metalness={0.45} flatShading />
      </mesh>
    </group>
  )
}

export default function Buildings({ segId }: { segId: keyof typeof SEGMENTS }) {
  const seg = SEGMENTS[segId]
  const blocks = useMemo(() => layoutBlocks(seg), [seg])
  const light = useMemo(() => blocks.filter((b) => !b.brick), [blocks])
  const brick = useMemo(() => blocks.filter((b) => b.brick), [blocks])
  const roofs = useMemo(() => mergeGeometries(blocks.map(roofGeometry), false)!, [blocks])
  return (
    <group>
      <FacadeSet blocks={light} brick={false} />
      <FacadeSet blocks={brick} brick />
      <mesh geometry={roofs}>
        <meshStandardMaterial color="#3c4043" roughness={0.95} />
      </mesh>
      <Landmarks seg={seg} />
    </group>
  )
}
