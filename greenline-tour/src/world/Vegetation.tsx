import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  LENGTH,
  PONDS,
  SWALES,
  heightAt,
  inSwale,
  isPlantable,
  rng,
} from './constants'
import { makeBirchTexture } from './textures'
import { useTour } from '../store'

/* ------------------------------------------------------------------ */
/* Tree species — procedural low-poly-plus silhouettes                 */
/* ------------------------------------------------------------------ */

interface Species {
  id: string
  count: number
  trunk: THREE.BufferGeometry
  crown: THREE.BufferGeometry
  trunkMat: THREE.MeshStandardMaterial
  crownMat: THREE.MeshStandardMaterial
  /** preference weight along z (0..1 normalized z) */
  bias: (zn: number) => number
}

function blob(r: number, x: number, y: number, z: number, squashY = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail)
  // organic jitter
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

function buildSpecies(): Species[] {
  const birch = makeBirchTexture()

  return [
    {
      // Черемуха виргинская — dark red-purple crown, 5-7 m
      id: 'cheremukha',
      count: 180,
      trunk: cyl(0.09, 0.14, 2.2, 1.1),
      crown: mergeGeometries([
        blob(1.5, 0, 3.4, 0),
        blob(1.15, 0.9, 4.3, 0.3),
        blob(1.0, -0.8, 4.5, -0.2),
        blob(0.8, 0.1, 5.3, 0.1),
      ])!,
      trunkMat: mat('#4a3a30'),
      crownMat: mat('#5c2e40'),
      bias: (zn) => 0.6 + 0.4 * Math.sin(zn * Math.PI),
    },
    {
      // Ива белая — weeping, silvery green, 6-7 m, loves water
      id: 'iva',
      count: 130,
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
      bias: (zn) => (zn > 0.28 && zn < 0.55 ? 1 : 0.25), // ponds & rain gardens
    },
    {
      // Липа мелколистная — dense round crown, 6-7 m
      id: 'lipa',
      count: 240,
      trunk: cyl(0.11, 0.17, 2.4, 1.2),
      crown: mergeGeometries([blob(1.9, 0, 4.2, 0), blob(1.3, 0, 5.6, 0)])!,
      trunkMat: mat('#4f4136'),
      crownMat: mat('#4e7a33'),
      bias: () => 1,
    },
    {
      // Ель сибирская — conifer cone, 5-7 m
      id: 'el',
      count: 160,
      trunk: cyl(0.08, 0.16, 1.2, 0.6),
      crown: mergeGeometries([cone(1.7, 2.6, 2.2, 8), cone(1.3, 2.4, 3.8, 8), cone(0.85, 2.0, 5.2, 7)])!,
      trunkMat: mat('#3f332a'),
      crownMat: mat('#2c4a33'),
      bias: (zn) => 0.35 + 0.65 * zn, // denser toward north/quiet
    },
    {
      // Сосна обыкновенная — bare trunk, irregular high crown, 5-7 m
      id: 'sosna',
      count: 170,
      trunk: cyl(0.1, 0.15, 3.6, 1.8),
      crown: mergeGeometries([
        blob(1.5, 0, 4.6, 0, 0.7),
        blob(1.1, 1.0, 5.3, 0.4, 0.7),
        blob(0.95, -0.9, 5.1, -0.3, 0.65),
      ])!,
      trunkMat: mat('#a06a42'),
      crownMat: mat('#44653a'),
      bias: (zn) => 0.4 + 0.6 * Math.abs(zn - 0.5) * 2,
    },
    {
      // Береза бородавчатая — white trunk, airy crown, 5-7 m
      id: 'bereza',
      count: 224,
      trunk: cyl(0.07, 0.11, 3.0, 1.5),
      crown: mergeGeometries([blob(1.35, 0, 4.4, 0, 1.25), blob(0.9, 0.5, 5.6, 0.2, 1.1)])!,
      trunkMat: mat('#e2ded6', { map: makeBirchTextureCached(birch) }),
      crownMat: mat('#7fa055'),
      bias: (zn) => 0.5 + 0.5 * Math.sin(zn * Math.PI * 2 + 1),
    },
  ]
}

function makeBirchTextureCached(t: THREE.Texture) {
  t.repeat.set(1, 2)
  return t
}

interface TreeInstance {
  x: number
  z: number
  s: number
  rot: number
}

function scatterTrees(species: Species[], densityMul: number): TreeInstance[][] {
  const rand = rng(777)
  return species.map((sp) => {
    const list: TreeInstance[] = []
    const target = Math.round(sp.count * densityMul)
    let guard = 0
    while (list.length < target && guard++ < target * 60) {
      const x = (rand() * 2 - 1) * 28.5
      const z = 3 + rand() * (LENGTH - 6)
      if (!isPlantable(x, z)) continue
      if (rand() > sp.bias(z / LENGTH)) continue
      // willows crowd the water, others keep off the swale floor
      if (sp.id !== 'iva' && inSwale(x, z, -1)) continue
      list.push({ x, z, s: 0.8 + rand() * 0.45, rot: rand() * Math.PI * 2 })
    }
    return list
  })
}

function TreeBatch({ sp, list }: { sp: Species; list: TreeInstance[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null!)
  const crownRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot)
      m.compose(
        new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.05, t.z),
        q,
        new THREE.Vector3(t.s, t.s * (0.9 + 0.2 * ((i * 7919) % 13) / 13), t.s),
      )
      trunkRef.current.setMatrixAt(i, m)
      crownRef.current.setMatrixAt(i, m)
    })
    trunkRef.current.instanceMatrix.needsUpdate = true
    crownRef.current.instanceMatrix.needsUpdate = true
  }, [list])
  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[sp.trunk, sp.trunkMat, list.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={crownRef}
        args={[sp.crown, sp.crownMat, list.length]}
        castShadow
        frustumCulled={false}
      />
    </group>
  )
}

export function Trees() {
  const quality = useTour((s) => s.quality)
  const species = useMemo(buildSpecies, [])
  const lists = useMemo(
    () => scatterTrees(species, quality === 'high' ? 1 : 0.55),
    [species, quality],
  )
  return (
    <group>
      {species.map((sp, i) => (
        <TreeBatch key={sp.id + quality} sp={sp} list={lists[i]} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Grass — instanced cross-quads with vertex-shader wind               */
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

export function Grass() {
  const quality = useTour((s) => s.quality)
  const count = quality === 'high' ? 9000 : 3000
  const ref = useRef<THREE.InstancedMesh>(null!)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
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
    while (placed < count && guard++ < count * 40) {
      const x = (rand() * 2 - 1) * 28.5
      const z = 3 + rand() * (LENGTH - 6)
      if (!isPlantable(x, z, 2.6)) continue
      // cluster tall golden grasses in rain gardens & near ponds
      const nearWater =
        inSwale(x, z, 2) || PONDS.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.rx, p.rz) + 4)
      const dense = nearWater || rand() < 0.35
      if (!dense) continue
      const s = nearWater ? 1.1 + rand() * 1.3 : 0.55 + rand() * 0.7
      q.setFromAxisAngle(up, rand() * Math.PI * 2)
      m.compose(
        new THREE.Vector3(x, heightAt(x, z), z),
        q,
        new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s),
      )
      ref.current.setMatrixAt(placed, m)
      if (nearWater && rand() < 0.55) {
        color.setHSL(0.11 + rand() * 0.03, 0.45, 0.45 + rand() * 0.15) // golden reeds
      } else {
        color.setHSL(0.24 + rand() * 0.05, 0.4, 0.32 + rand() * 0.12)
      }
      ref.current.setColorAt(placed, color)
      placed++
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [count])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = { value: 0 }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;',
        )
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
    <instancedMesh
      key={quality}
      ref={ref}
      args={[geo, undefined, count]}
      frustumCulled={false}
      receiveShadow
    >
      <meshStandardMaterial
        ref={matRef}
        map={tex}
        alphaTest={0.5}
        side={THREE.DoubleSide}
        roughness={1}
        onBeforeCompile={onBeforeCompile}
      />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ */
/* Rocks on pond banks and in rain gardens                             */
/* ------------------------------------------------------------------ */

export function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const count = 150
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
    while (placed < count && guard++ < count * 80) {
      // ring around ponds and swales
      const pool = rand() < 0.6 ? PONDS : SWALES
      const p = pool[Math.floor(rand() * pool.length)]
      const a = rand() * Math.PI * 2
      const rr = 1.02 + rand() * 0.25
      const x = p.x + Math.cos(a) * p.rx * rr
      const z = p.z + Math.sin(a) * p.rz * rr
      if (Math.abs(x) > 28) continue
      const s = 0.35 + rand() * 1.1
      q.setFromAxisAngle(up, rand() * Math.PI * 2)
      m.compose(new THREE.Vector3(x, heightAt(x, z) + s * 0.15, z), q, new THREE.Vector3(s, s * (0.7 + rand() * 0.4), s))
      ref.current.setMatrixAt(placed, m)
      placed++
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial color="#8d8a82" roughness={0.95} flatShading />
    </instancedMesh>
  )
}

export default function Vegetation() {
  return (
    <group>
      <Trees />
      <Grass />
      <Rocks />
    </group>
  )
}
