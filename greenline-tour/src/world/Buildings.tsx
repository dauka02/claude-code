import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HALF_W, LENGTH, rng } from './constants'
import {
  fallbackFacadeBrick,
  fallbackFacadeBrickNight,
  fallbackFacadeLight,
  fallbackFacadeLightNight,
  useTexOrFallback,
} from './textures'
import { useTour } from '../store'

/** One facade texture tile ≈ 4 windows × 6 floors. */
const TILE_W = 13
const TILE_H = 19

interface Block {
  x: number
  z: number
  w: number // along x (depth of slab)
  d: number // along z (length)
  h: number
  brick: boolean
  tint: number
}

function layoutBlocks(): Block[] {
  const rand = rng(20240)
  const blocks: Block[] = []
  for (const side of [-1, 1]) {
    let z = -30
    while (z < LENGTH + 40) {
      const d = 38 + rand() * 55
      const gap = 10 + rand() * 22
      const floors = 12 + Math.floor(rand() * 7)
      const w = 15 + rand() * 8
      const brick = rand() < 0.4
      blocks.push({
        x: side * (HALF_W + 13 + w / 2 + rand() * 8),
        z: z + d / 2,
        w,
        d,
        h: floors * 3,
        brick,
        tint: brick ? 0.9 + rand() * 0.2 : 0.72 + rand() * 0.33,
      })
      z += d + gap
    }
  }
  return blocks
}

/** Box with facade-scaled UVs and per-vertex tint baked in. */
function buildingGeometry(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d)
  g.translate(b.x, b.h / 2 - 0.5, b.z)
  const uv = g.attributes.uv
  // BoxGeometry face order: +x -x +y -y +z -z (4 verts each)
  const faceDims: [number, number][] = [
    [b.d, b.h],
    [b.d, b.h],
    [0, 0], // top — collapse UV to a wall pixel
    [0, 0], // bottom
    [b.w, b.h],
    [b.w, b.h],
  ]
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceDims[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      if (fw === 0) {
        uv.setXY(i, 0.02, 0.985)
      } else {
        uv.setXY(i, (uv.getX(i) * fw) / TILE_W, (uv.getY(i) * fh) / TILE_H)
      }
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
  const g = new THREE.BoxGeometry(b.w + 0.6, 0.5, b.d + 0.6)
  g.translate(b.x, b.h - 0.3, b.z)
  return g
}

function FacadeSet({ blocks, brick }: { blocks: Block[]; brick: boolean }) {
  const night = useTour((s) => s.night)
  const day = useTexOrFallback(
    brick ? 'facadeBrick' : 'facadeLight',
    brick ? fallbackFacadeBrick : fallbackFacadeLight,
  )
  const nightTex = useTexOrFallback(
    brick ? 'facadeBrickNight' : 'facadeLightNight',
    brick ? fallbackFacadeBrickNight : fallbackFacadeLightNight,
  )
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const geo = useMemo(
    () => mergeGeometries(blocks.map(buildingGeometry), false)!,
    [blocks],
  )
  useFrame((_, delta) => {
    const m = matRef.current
    if (!m) return
    m.emissiveIntensity = THREE.MathUtils.lerp(
      m.emissiveIntensity,
      night ? 1.35 : 0,
      Math.min(1, delta * 1.5),
    )
  })
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

export default function Buildings() {
  const blocks = useMemo(layoutBlocks, [])
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
    </group>
  )
}
