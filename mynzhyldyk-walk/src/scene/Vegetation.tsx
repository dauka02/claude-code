import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import trees from '../data/trees.json'
import { ALM, bandHalf, heightAt, nearLine, inWater, perp, L } from '../data/geo'
import { fbMeadowClump, fbTree, TEX, useTexOr } from './assets'
import { resample } from './util'
import { useApp } from '../store/useAppStore'

const SPECIES_H = [9, 11, 10, 8.5, 10, 5.5] // высоты крон, м

function crossedPlanes(): THREE.BufferGeometry {
  const p1 = new THREE.PlaneGeometry(1, 1)
  p1.translate(0, 0.5, 0)
  const p2 = p1.clone()
  p2.rotateY(Math.PI / 2)
  return mergeGeometries([p1, p2], false)!
}

function windShader(shaderRef: { current: { uniforms: { uTime: { value: number } } } | null }) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.1 + ip.x * 0.07 + ip.z * 0.09);
          float bend = pow(max(uv.y, 0.0), 1.8);
          transformed.x += sway * bend * 0.35;
        }`,
      )
    shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } }
  }
}

function SpeciesBatch({ sp, quality }: { sp: number; quality: string }) {
  const names = ['tree0', 'tree1', 'tree2', 'tree3', 'tree4', 'tree5'] as const
  const tex = useTexOr(names[sp] as keyof typeof TEX, fbTree(sp), [1, 1], true, true)
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null)
  const geo = useMemo(crossedPlanes, [])

  const idx = useMemo(() => {
    const arr: number[] = []
    const skip = quality === 'high' ? 1 : quality === 'med' ? 2 : 3
    for (let i = 0; i < trees.count; i++) if (trees.s[i] === sp && i % skip === 0) arr.push(i)
    return arr
  }, [sp, quality])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    idx.forEach((i, k) => {
      const x = trees.x[i] / 10
      const z = trees.z[i] / 10
      const sc = (trees.sc[i] / 100) * SPECIES_H[sp]
      q.setFromAxisAngle(up, (i * 2654435761) % 6.283)
      m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.15, z), q, new THREE.Vector3(sc * 0.85, sc, sc * 0.85))
      ref.current.setMatrixAt(k, m)
    })
    ref.current.count = idx.length
    ref.current.instanceMatrix.needsUpdate = true
  }, [idx, sp])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  if (!idx.length) return null
  return (
    <instancedMesh ref={ref} args={[geo, undefined, idx.length]} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
        alphaTest={0.45}
        side={THREE.DoubleSide}
        roughness={0.95}
        onBeforeCompile={windShader(shaderRef)}
      />
    </instancedMesh>
  )
}

/** Розовые цветущие деревья вдоль дорожек аллеи (стратегия «сезонный интерес», стр.12). */
function BlossomTrees() {
  const quality = useApp((s) => s.quality)
  const tex = useTexOr('tree6', fbTree(6), [1, 1], true, true)
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null)
  const geo = useMemo(crossedPlanes, [])

  const spots = useMemo(() => {
    let s = 4242
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const res: [number, number, number][] = []
    const walk = resample(ALM.alley.walk, 30)
    walk.forEach(([x, z], i) => {
      // группы по 1–3 дерева, чередуя стороны, с пропусками
      if (rnd() < 0.45) return
      const side = i % 2 ? 1 : -1
      const n = 1 + Math.floor(rnd() * 3)
      for (let k = 0; k < n; k++) {
        const px = x + side * (5 + rnd() * 6) + (rnd() * 2 - 1) * 4
        const pz = z + (rnd() * 2 - 1) * 9
        if (nearLine(px, pz, 2) || inWater(px, pz)) continue
        res.push([px, pz, 0.75 + rnd() * 0.5])
      }
    })
    const skip = quality === 'high' ? 1 : quality === 'med' ? 2 : 3
    return res.filter((_, i) => i % skip === 0)
  }, [quality])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    spots.forEach(([x, z, sc], k) => {
      const h = sc * 7.5
      q.setFromAxisAngle(up, (k * 2654435761) % 6.283)
      m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.12, z), q, new THREE.Vector3(h * 0.9, h, h * 0.9))
      ref.current.setMatrixAt(k, m)
    })
    ref.current.count = spots.length
    ref.current.instanceMatrix.needsUpdate = true
  }, [spots])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  if (!spots.length) return null
  return (
    <instancedMesh key={spots.length} ref={ref} args={[geo, undefined, spots.length]} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
        alphaTest={0.45}
        side={THREE.DoubleSide}
        roughness={0.95}
        onBeforeCompile={windShader(shaderRef)}
      />
    </instancedMesh>
  )
}

/** Луга многолетников вдоль дорожек и на бермах (рендеры линейного парка, стр.9-10). */
function MeadowClumps({ variant }: { variant: number }) {
  const quality = useApp((s) => s.quality)
  const names = ['meadow0', 'meadow1', 'meadow2'] as const
  const tex = useTexOr(names[variant] as keyof typeof TEX, fbMeadowClump(variant), [1, 1], true, true)
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null)
  const geo = useMemo(crossedPlanes, [])
  const count = quality === 'high' ? 4200 : quality === 'med' ? 2200 : 800

  useLayoutEffect(() => {
    let s = 5150 + variant * 917
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const walk = ALM.alley.walk
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 30) {
      let px: number
      let pz: number
      if (rnd() < 0.62) {
        // кромки дорожек и острова между нитями: ленты многолетников
        const src = rnd() < 0.55 ? walk : ALM.alley.bike
        const seg = src[Math.floor(rnd() * (src.length - 1))]
        const off = (rnd() < 0.5 ? -1 : 1) * (3.6 + rnd() * 5.5)
        px = seg[0] + off + (rnd() * 2 - 1) * 6
        pz = seg[1] + (rnd() * 2 - 1) * 14
      } else {
        // бермы по флангам ленты
        const mm = rnd() * L
        const o = (rnd() < 0.5 ? -1 : 1) * bandHalf(mm) * (0.55 + rnd() * 0.32)
        ;[px, pz] = perp(mm, o)
      }
      if (nearLine(px, pz, 1.1) || inWater(px, pz)) continue
      const sc = 0.75 + rnd() * 0.9
      q.setFromAxisAngle(up, rnd() * 6.28)
      m.compose(new THREE.Vector3(px, heightAt(px, pz), pz), q, new THREE.Vector3(sc * 1.15, sc, sc * 1.15))
      ref.current.setMatrixAt(placed++, m)
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
  }, [count, variant])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <instancedMesh key={count} ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
        alphaTest={0.42}
        side={THREE.DoubleSide}
        roughness={1}
        onBeforeCompile={windShader(shaderRef)}
      />
    </instancedMesh>
  )
}

/** Травяные карточки в ленте аллеи (только Med/High). */
function GrassTufts() {
  const quality = useApp((s) => s.quality)
  const count = quality === 'high' ? 14000 : quality === 'med' ? 6000 : 0
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null)
  const geo = useMemo(crossedPlanes, [])
  const tex = useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const c = cv.getContext('2d')!
    let s = 977
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 10; i++) {
      c.strokeStyle = `rgba(${120 + rnd() * 70},${130 + rnd() * 50},${55 + rnd() * 35},0.95)`
      c.lineWidth = 2.5
      c.beginPath()
      const x = 6 + i * 5.6
      c.moveTo(x, 64)
      c.quadraticCurveTo(x + rnd() * 8 - 4, 34, x + rnd() * 12 - 6, 10 + rnd() * 12)
      c.stroke()
    }
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  useLayoutEffect(() => {
    if (!count) return
    let s = 31337
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let placed = 0
    let guard = 0
    while (placed < count && guard++ < count * 25) {
      const mm = rnd() * L
      const o = (rnd() * 2 - 1) * (bandHalf(mm) - 3)
      const [x, z] = perp(mm, o)
      if (nearLine(x, z, 1.2) || inWater(x, z)) continue
      const sc = 0.5 + rnd() * 0.9
      q.setFromAxisAngle(up, rnd() * 6.28)
      m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(sc, sc * (0.7 + rnd() * 0.6), sc))
      ref.current.setMatrixAt(placed++, m)
    }
    ref.current.count = placed
    ref.current.instanceMatrix.needsUpdate = true
  }, [count])

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  if (!count) return null
  return (
    <instancedMesh key={count} ref={ref} args={[geo, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial
        map={tex}
        alphaTest={0.4}
        side={THREE.DoubleSide}
        roughness={1}
        onBeforeCompile={windShader(shaderRef)}
      />
    </instancedMesh>
  )
}

export default function Vegetation() {
  const quality = useApp((s) => s.quality)
  return (
    <group>
      {[0, 1, 2, 3, 4, 5].map((sp) => (
        <SpeciesBatch key={sp + quality} sp={sp} quality={quality} />
      ))}
      <BlossomTrees />
      {[0, 1, 2].map((v) => (
        <MeadowClumps key={v} variant={v} />
      ))}
      <GrassTufts />
    </group>
  )
}
