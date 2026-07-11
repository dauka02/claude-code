import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import trees from '../data/trees.json'
import { bandHalf, heightAt, nearLine, inWater, perp, L } from '../data/geo'
import { fbTree, TEX, useTexOr } from './assets'
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
      <GrassTufts />
    </group>
  )
}
