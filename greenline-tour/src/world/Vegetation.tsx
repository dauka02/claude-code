import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  SEGMENTS,
  heightAt,
  inSwale,
  isPlantable,
  rng,
  type SegModel,
} from '../data/geometry'
import { fallbackTulips, makeBirchTexture, useTexOrFallback } from './textures'
import { useTour } from '../store'

/* ------------------------------------------------------------------ */
/* Породы деревьев — процедурные low-poly-plus силуэты                 */
/* ------------------------------------------------------------------ */

interface Species {
  id: string
  share: number
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
  trunkMat: THREE.MeshStandardMaterial
  crownMat: THREE.MeshStandardMaterial
  bias: (seg: SegModel, x: number, z: number) => number
}

function blob(r: number, x: number, y: number, z: number, squashY = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail)
  const p = g.attributes.position
  const rand = rng(Math.floor(r * 1000 + x * 17 + y * 31 + z * 13))
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) * (1 + (rand() - 0.5) * 0.25),
      p.getY(i) * squashY * (1 + (rand() - 0.5) * 0.25),
      p.getZ(i) * (1 + (rand() - 0.5) * 0.25),
    )
  }
  g.translate(x, y, z)
  g.computeVertexNormals()
  return g
}

function cone(rBot: number, h: number, y: number, seg = 7) {
  const g = new THREE.ConeGeometry(rBot, h, seg)
  g.translate(0, y, 0)
  // blobs (icosahedra) are non-indexed — keep merge inputs consistent
  return g.toNonIndexed()
}

function cyl(rTop: number, rBot: number, h: number, y: number, seg = 6) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg)
  g.translate(0, y, 0)
  return g
}

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    ...opts,
  })
}

function nearWater(seg: SegModel, x: number, z: number): boolean {
  return (
    inSwale(seg, x, z, 3) ||
    seg.ponds.some((p) => Math.hypot(x - p.cx, z - p.cz) < Math.max(p.rx, p.rz) + 5)
  )
}

function inGrove(seg: SegModel, x: number, z: number): boolean {
  return seg.groves.some((g) => x > g.x0 && x < g.x1 && z > Math.min(g.z0, g.z1) && z < Math.max(g.z0, g.z1))
}

function buildSpecies(): Species[] {
  const birch = makeBirchTexture()
  birch.repeat.set(1, 2)
  return [
    {
      id: 'cheremukha', // Черемуха виргинская, 5-7 м, тёмно-пурпурная крона
      share: 0.16,
      trunk: cyl(0.09, 0.14, 2.2, 1.1),
      crown: mergeGeometries([
        blob(1.5, 0, 3.4, 0),
        blob(1.15, 0.9, 4.3, 0.3),
        blob(1.0, -0.8, 4.5, -0.2),
        blob(0.8, 0.1, 5.3, 0.1),
      ])!,
      trunkMat: mat('#4a3a30'),
      crownMat: mat('#6e3c52'),
      bias: () => 0.9,
    },
    {
      id: 'iva', // Ива белая — плакучая, у воды
      share: 0.12,
      trunk: cyl(0.12, 0.2, 2.8, 1.4),
      crown: mergeGeometries([
        blob(2.0, 0, 4.6, 0, 0.75),
        cone(1.5, 2.6, 3.1, 8),
        cone(1.1, 2.2, 3.0, 7),
        blob(1.3, 1.2, 4.0, 0.6, 0.9),
        blob(1.3, -1.1, 4.2, -0.5, 0.9),
      ])!,
      trunkMat: mat('#5a4a38'),
      crownMat: mat('#8fa876'),
      bias: (seg, x, z) => (nearWater(seg, x, z) ? 1 : 0.15),
    },
    {
      id: 'lipa', // Липа мелколистная — плотная круглая крона
      share: 0.22,
      trunk: cyl(0.11, 0.17, 2.4, 1.2),
      crown: mergeGeometries([blob(1.9, 0, 4.2, 0), blob(1.3, 0, 5.6, 0)])!,
      trunkMat: mat('#4f4136'),
      crownMat: mat('#4e7a33'),
      bias: () => 1,
    },
    {
      id: 'el', // Ель сибирская — конус
      share: 0.14,
      trunk: cyl(0.08, 0.16, 1.2, 0.6),
      crown: mergeGeometries([cone(1.7, 2.6, 2.2, 8), cone(1.3, 2.4, 3.8, 8), cone(0.85, 2.0, 5.2, 7)])!,
      trunkMat: mat('#3f332a'),
      crownMat: mat('#2c4a33'),
      bias: (seg, x, z) => (inGrove(seg, x, z) ? 1 : 0.45),
    },
    {
      id: 'sosna', // Сосна обыкновенная — голый ствол, рваная крона
      share: 0.16,
      trunk: cyl(0.1, 0.15, 3.6, 1.8),
      crown: mergeGeometries([
        blob(1.5, 0, 4.6, 0, 0.7),
        blob(1.1, 1.0, 5.3, 0.4, 0.7),
        blob(0.95, -0.9, 5.1, -0.3, 0.65),
      ])!,
      trunkMat: mat('#a06a42'),
      crownMat: mat('#44653a'),
      bias: (seg, x, z) => (inGrove(seg, x, z) ? 1 : 0.55),
    },
    {
      id: 'bereza', // Береза бородавчатая — белый ствол
      share: 0.2,
      trunk: cyl(0.07, 0.11, 3.0, 1.5),
      crown: mergeGeometries([blob(1.35, 0, 4.4, 0, 1.25), blob(0.9, 0.5, 5.6, 0.2, 1.1)])!,
      trunkMat: mat('#e2ded6', { map: birch }),
      crownMat: mat('#7fa055'),
      bias: () => 0.9,
    },
  ]
}

interface TreeInstance {
  x: number
  z: number
  s: number
  rot: number
}

function scatterTrees(seg: SegModel, species: Species[], densityMul: number): TreeInstance[][] {
  const rand = rng(777 + seg.lengthM)
  return species.map((sp) => {
    const list: TreeInstance[] = []
    const target = Math.round(seg.treeTarget * sp.share * densityMul)
    let guard = 0
    while (list.length < target && guard++ < target * 70) {
      let x: number
      let z: number
      if (seg.branch && rand() < 0.28) {
        // рукав Айтеке би — рядовые посадки вдоль оси
        const t = rand()
        const i = Math.floor(t * (seg.branch.pts.length - 1))
        const p = seg.branch.pts[i]
        x = p.x + (rand() * 2 - 1) * 26
        z = p.z + (rand() - 0.5) * 8
        if (z < seg.halfW + 4) continue
      } else {
        x = rand() * seg.lengthM
        z = (rand() * 2 - 1) * (seg.halfW - 1.5)
      }
      if (!isPlantable(seg, x, z)) continue
      if (rand() > sp.bias(seg, x, z)) continue
      if (sp.id !== 'iva' && inSwale(seg, x, z, -1)) continue
      // роща — плотнее
      if (!inGrove(seg, x, z) && rand() < 0.25) continue
      list.push({ x, z, s: 0.8 + rand() * 0.45, rot: rand() * Math.PI * 2 })
    }
    return list
  })
}

function TreeBatch({ seg, sp, list }: { seg: SegModel; sp: Species; list: TreeInstance[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null!)
  const crownRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot)
      m.compose(
        new THREE.Vector3(t.x, heightAt(seg, t.x, t.z) - 0.05, t.z),
        q,
        new THREE.Vector3(t.s, t.s * (0.9 + (0.2 * ((i * 7919) % 13)) / 13), t.s),
      )
      trunkRef.current.setMatrixAt(i, m)
      crownRef.current.setMatrixAt(i, m)
    })
    trunkRef.current.instanceMatrix.needsUpdate = true
    crownRef.current.instanceMatrix.needsUpdate = true
  }, [list, seg])
  if (!list.length) return null
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[sp.trunk, sp.trunkMat, list.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={crownRef} args={[sp.crown, sp.crownMat, list.length]} castShadow frustumCulled={false} />
    </group>
  )
}

export function Trees({ seg }: { seg: SegModel }) {
  const quality = useTour((s) => s.quality)
  const species = useMemo(buildSpecies, [])
  const lists = useMemo(
    () => scatterTrees(seg, species, quality === 'high' ? 1 : 0.55),
    [seg, species, quality],
  )
  return (
    <group>
      {species.map((sp, i) => (
        <TreeBatch key={sp.id + quality + seg.id} seg={seg} sp={sp} list={lists[i]} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Трава с ветром                                                      */
/* ------------------------------------------------------------------ */

function grassBladeTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 64
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, 64, 64)
  const rand = rng(99)
  for (let i = 0; i < 9; i++) {
    const x = 4 + i * 7 + rand() * 3
    const w = 2 + rand() * 2.2
    const h = 28 + rand() * 34
    c.fillStyle = `rgba(${120 + rand() * 60},${140 + rand() * 50},${60 + rand() * 30},1)`
    c.beginPath()
    c.moveTo(x - w / 2, 64)
    c.quadraticCurveTo(x - w / 2 + rand() * 4 - 2, 64 - h * 0.6, x + rand() * 6 - 3, 64 - h)
    c.quadraticCurveTo(x + w / 2 + rand() * 4 - 2, 64 - h * 0.6, x + w / 2, 64)
    c.closePath()
    c.fill()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function Grass({ seg }: { seg: SegModel }) {
  const quality = useTour((s) => s.quality)
  const count = Math.round((quality === 'high' ? 9000 : 3000) * (seg.lengthM / 721))
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null)

  const tex = useMemo(grassBladeTexture, [])
  const geo = useMemo(() => {
    const p1 = new THREE.PlaneGeometry(0.9, 0.9)
    p1.translate(0, 0.45, 0)
    const p2 = p1.clone()
    p2.rotateY(Math.PI / 2)
    return mergeGeometries([p1, p2], false)!
  }, [])

  useLayoutEffect(() => {
    const rand = rng(31337)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 50) {
      const x = rand() * seg.lengthM
      const z = (rand() * 2 - 1) * (seg.halfW - 1.5)
      if (!isPlantable(seg, x, z, 2.6)) continue
      const water = nearWater(seg, x, z)
      const dense = water || rand() < 0.35
      if (!dense) continue
      const s = water ? 1.1 + rand() * 1.3 : 0.55 + rand() * 0.7
      q.setFromAxisAngle(up, rand() * Math.PI * 2)
      m.compose(new THREE.Vector3(x, heightAt(seg, x, z), z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s))
      ref.current.setMatrixAt(placed, m)
      if (water && rand() < 0.55) color.setHSL(0.11 + rand() * 0.03, 0.45, 0.45 + rand() * 0.15)
      else color.setHSL(0.24 + rand() * 0.05, 0.4, 0.32 + rand() * 0.12)
      ref.current.setColorAt(placed, color)
      placed++
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [count, seg])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = { value: 0 }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float sway = sin(uTime * 1.6 + ip.x * 0.35 + ip.z * 0.22) + 0.5 * sin(uTime * 2.7 + ip.z * 0.53);
            float bend = pow(max(position.y, 0.0) / 0.9, 1.5);
            transformed.x += sway * bend * 0.12;
            transformed.z += sway * bend * 0.08;
          }`,
        )
      shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } }
    },
    [],
  )

  return (
    <instancedMesh key={quality + seg.id} ref={ref} args={[geo, undefined, count]} frustumCulled={false} receiveShadow>
      <meshStandardMaterial map={tex} alphaTest={0.5} side={THREE.DoubleSide} roughness={1} onBeforeCompile={onBeforeCompile} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Тюльпановые клумбы (2 очередь)                                      */
/* ------------------------------------------------------------------ */

export function TulipBeds({ seg }: { seg: SegModel }) {
  const tulips = useTexOrFallback('tulips', fallbackTulips, [1, 1])
  const geo = useMemo(() => {
    if (seg.id !== 's2b') return null
    const parts: THREE.BufferGeometry[] = []
    const plaza = seg.plazas[0]
    const rand = rng(414)
    // клумбы-лепестки вокруг центральной зоны + у входов
    const spots: { x: number; z: number; r: number }[] = []
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3
      spots.push({ x: plaza.cx + Math.cos(a) * (plaza.r + 14 + rand() * 8), z: plaza.cz + Math.sin(a) * (plaza.r + 10 + rand() * 6), r: 3 + rand() * 2.5 })
    }
    spots.push({ x: 30, z: -14, r: 4 }, { x: 55, z: 16, r: 3.5 }, { x: 905, z: -10, r: 4 }, { x: 928, z: 12, r: 3 })
    for (const s of spots) {
      const disc = new THREE.CircleGeometry(s.r, 20)
      disc.rotateX(-Math.PI / 2)
      const y = heightAt(seg, s.x, s.z) + 0.12
      disc.translate(s.x, y, s.z)
      const pos = disc.attributes.position
      const uv = disc.attributes.uv
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4)
      parts.push(disc)
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  if (!geo) return null
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={tulips} roughness={0.95} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */
/* Валуны                                                              */
/* ------------------------------------------------------------------ */

export function Rocks({ seg }: { seg: SegModel }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const count = 60 + seg.ponds.length * 45 + seg.swales.length * 12
  const geo = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(0.5, 0)
    const rand = rng(553)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(
        i,
        p.getX(i) * (1 + (rand() - 0.5) * 0.4),
        p.getY(i) * (0.6 + rand() * 0.3),
        p.getZ(i) * (1 + (rand() - 0.5) * 0.4),
      )
    }
    g.computeVertexNormals()
    return g
  }, [])
  useLayoutEffect(() => {
    const rand = rng(8811)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let guard = 0
    const pools = [...seg.ponds, ...seg.swales]
    while (placed < count && guard++ < count * 90) {
      let x: number
      let z: number
      if (pools.length && rand() < 0.75) {
        const p = pools[Math.floor(rand() * pools.length)]
        const a = rand() * Math.PI * 2
        const rr = 1.02 + rand() * 0.25
        x = p.cx + Math.cos(a) * p.rx * rr
        z = p.cz + Math.sin(a) * p.rz * rr
      } else {
        x = rand() * seg.lengthM
        z = (rand() * 2 - 1) * (seg.halfW - 3)
        if (!isPlantable(seg, x, z, 3)) continue
      }
      if (Math.abs(z) > seg.halfW - 1.5 && !seg.branch) continue
      const s = 0.35 + rand() * 1.1
      q.setFromAxisAngle(up, rand() * Math.PI * 2)
      m.compose(new THREE.Vector3(x, heightAt(seg, x, z) + s * 0.15, z), q, new THREE.Vector3(s, s * (0.7 + rand() * 0.4), s))
      ref.current.setMatrixAt(placed, m)
      placed++
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
  }, [count, seg])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial color="#8d8a82" roughness={0.95} flatShading />
    </instancedMesh>
  )
}

export default function Vegetation({ segId }: { segId: keyof typeof SEGMENTS }) {
  const seg = SEGMENTS[segId]
  return (
    <group>
      <Trees seg={seg} />
      <Grass seg={seg} />
      <TulipBeds seg={seg} />
      <Rocks seg={seg} />
    </group>
  )
}
