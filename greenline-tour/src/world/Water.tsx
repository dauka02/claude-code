import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SEGMENTS, WATER_LEVEL, heightAt, rng, type SegModel } from '../data/geometry'
import { blobGeometry, blobPoints } from './geometry'
import { fallbackRock, makeWaterNormalTexture, useTexOrFallback } from './textures'
import { useTour } from '../store'

/* ------------------------------- пруды ------------------------------- */

function Ponds({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const matRef = useRef<THREE.MeshStandardMaterial>(null!)
  const normalMap = useMemo(makeWaterNormalTexture, [])
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    seg.ponds.forEach((p, i) =>
      parts.push(blobGeometry(blobPoints(p.cx, p.cz, p.rx, p.rz, p.rot ?? 0, 0.14, i + 2, 56), WATER_LEVEL, 6)),
    )
    seg.swales.slice(0, 2).forEach((s) => {
      parts.push(blobGeometry(blobPoints(s.cx, s.cz, s.rx * 0.55, s.rz * 0.55, s.rot ?? 0, 0.2, 9), -0.42, 4))
    })
    if (seg.smallPool) {
      const c = new THREE.CircleGeometry(seg.smallPool.r, 28)
      c.rotateX(-Math.PI / 2)
      c.translate(seg.smallPool.cx, -0.18, seg.smallPool.cz)
      parts.push(c)
    }
    return parts.length ? mergeGeometries(parts, false)! : null
  }, [seg])

  useFrame((_, delta) => {
    normalMap.offset.x += delta * 0.012
    normalMap.offset.y += delta * 0.017
    const m = matRef.current
    if (!m) return
    m.color.lerp(new THREE.Color(night ? 0x0a1420 : 0x1e3a40), Math.min(1, delta * 2))
    m.envMapIntensity = THREE.MathUtils.lerp(m.envMapIntensity, night ? 0.35 : 1.15, Math.min(1, delta * 2))
  })

  if (!geo) return null
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        color="#1e3a40"
        roughness={0.08}
        metalness={0.35}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(0.35, 0.35)}
        envMapIntensity={1.15}
        transparent
        opacity={0.94}
      />
    </mesh>
  )
}

/* ------------------------- фонтаны (частицы) -------------------------- */

const fountainVert = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uLife;
attribute vec3 aOrigin;
attribute float aPhase;
attribute float aSpread;
varying float vT;
void main() {
  float t = fract(uTime / uLife + aPhase);
  vT = t;
  float v0 = uHeight * 2.2;
  vec3 p = aOrigin;
  float ang = aPhase * 6.2831 * 7.0;
  p.x += cos(ang) * aSpread * t * 1.4;
  p.z += sin(ang) * aSpread * t * 1.4;
  p.y += v0 * t - 0.5 * 9.8 * (t * uLife) * (t * uLife) / uLife * 2.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (3.0 - t * 1.6) * (85.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const fountainFrag = /* glsl */ `
varying float vT;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = (1.0 - d * 2.0) * (1.0 - vT * 0.75) * 0.85;
  gl_FragColor = vec4(0.82, 0.9, 0.98, a);
}
`

function Fountain({
  seg,
  jets,
  height,
  perJet = 26,
}: {
  seg: SegModel
  jets: [number, number][]
  height: number
  perJet?: number
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null!)
  const geo = useMemo(() => {
    const rand = rng(2024)
    const n = jets.length * perJet
    const origins = new Float32Array(n * 3)
    const phases = new Float32Array(n)
    const spreads = new Float32Array(n)
    const pos = new Float32Array(n * 3)
    let i = 0
    for (const [jx, jz] of jets) {
      const y = heightAt(seg, jx, jz) + 0.05
      for (let k = 0; k < perJet; k++) {
        origins[i * 3] = jx
        origins[i * 3 + 1] = y
        origins[i * 3 + 2] = jz
        phases[i] = rand()
        spreads[i] = 0.12 + rand() * 0.3
        i++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    g.setAttribute('aSpread', new THREE.BufferAttribute(spreads, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(jets[0][0], 1, jets[0][1]), 60)
    return g
  }, [seg, jets, perJet])

  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <points geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={fountainVert}
        fragmentShader={fountainFrag}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uHeight: { value: height },
          uLife: { value: 1.1 },
        }}
      />
    </points>
  )
}

/** Мокрый фонтан в центральной площади + сухой фонтан восточнее (s2b). */
function Fountains({ seg }: { seg: SegModel }) {
  const data = useMemo(() => {
    if (seg.id !== 's2b') return null
    const plaza = seg.plazas[0]
    const wet: [number, number][] = []
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      wet.push([plaza.cx - 4 + Math.cos(a) * 6.5, plaza.cz + Math.sin(a) * 6.5])
    }
    for (let k = 0; k < 5; k++) wet.push([plaza.cx - 4 + (k - 2) * 1.6, plaza.cz])
    const dryC = { x: seg.zones.dryFountain, z: -10 }
    const dry: [number, number][] = []
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2
      const r = 2.5 + (k % 3) * 2.2
      dry.push([dryC.x + Math.cos(a) * r, dryC.z + Math.sin(a) * r * 0.7])
    }
    return { wet, dry, dryC, plaza }
  }, [seg])

  const basinGeo = useMemo(() => {
    if (!data) return null
    const parts: THREE.BufferGeometry[] = []
    // тёмные блюдца сухого фонтана (заподлицо)
    for (const [i, r] of [3.2, 5.6, 8].entries()) {
      const g = new THREE.RingGeometry(r - 1.3, r, 40)
      g.rotateX(-Math.PI / 2)
      g.translate(data.dryC.x, 0.035 + i * 0.001, data.dryC.z)
      parts.push(g)
    }
    // плоский бассейн мокрого фонтана
    const pool = new THREE.CircleGeometry(8.2, 40)
    pool.rotateX(-Math.PI / 2)
    pool.translate(data.plaza.cx - 4, 0.032, data.plaza.cz)
    parts.push(pool)
    return mergeGeometries(parts, false)!
  }, [data])

  if (!data) return null
  return (
    <group>
      <mesh geometry={basinGeo!}>
        <meshStandardMaterial color="#2e3438" roughness={0.35} metalness={0.2} />
      </mesh>
      <Fountain seg={seg} jets={data.wet} height={2.4} />
      <Fountain seg={seg} jets={data.dry} height={1.5} perJet={20} />
    </group>
  )
}

/* --------------------------- водопады (s2b) ---------------------------- */

const curtainVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const curtainFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float x = vUv.x * 24.0;
  float streak = 0.55 + 0.45 * sin(x * 3.1 + hash(floor(x)) * 6.28);
  float fall = fract(vUv.y * 1.5 + uTime * 0.55 + hash(floor(x)) * 0.7);
  float a = streak * (0.35 + 0.4 * smoothstep(0.2, 0.9, fall));
  a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  a *= smoothstep(1.0, 0.82, vUv.y) * (0.55 + 0.45 * smoothstep(0.0, 0.35, vUv.y));
  gl_FragColor = vec4(0.78, 0.87, 0.95, a * 0.7);
}
`

function Waterfall({ seg, x, z, rotY }: { seg: SegModel; x: number; z: number; rotY: number }) {
  const rock = useTexOrFallback('rock', fallbackRock, [3, 1.6])
  const matRef = useRef<THREE.ShaderMaterial>(null!)
  const wallGeo = useMemo(() => {
    const rand = rng(Math.floor(x * 7 + z * 13))
    const g = new THREE.PlaneGeometry(15, 5.2, 30, 10)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const bulge = Math.sin((p.getX(i) / 15 + 0.5) * Math.PI) * 1.4
      p.setZ(i, p.getZ(i) - Math.abs(p.getY(i) / 5.2) * 0.8 + bulge * 0.4 + (rand() - 0.5) * 0.5)
    }
    g.computeVertexNormals()
    return g
  }, [x, z])
  const y = heightAt(seg, x, z)
  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={wallGeo} position={[0, 2.6, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={rock} roughness={0.95} />
      </mesh>
      {/* каскадные полки */}
      {[1.2, 2.4, 3.6].map((h, i) => (
        <mesh key={i} position={[(i - 1) * 3.4, h, 0.9 + i * 0.12]} castShadow>
          <boxGeometry args={[4.2 - i * 0.7, 0.5, 1.1]} />
          <meshStandardMaterial map={rock} roughness={0.95} />
        </mesh>
      ))}
      {/* водная завеса */}
      <mesh position={[0, 2.2, 1.35]}>
        <planeGeometry args={[10.5, 4.2, 1, 1]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={curtainVert}
          fragmentShader={curtainFrag}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          uniforms={{ uTime: { value: 0 } }}
        />
      </mesh>
      {/* заводь у подножия */}
      <mesh position={[0, 0.06, 2.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.2, 26]} />
        <meshStandardMaterial color="#26424a" roughness={0.1} metalness={0.3} transparent opacity={0.92} />
      </mesh>
    </group>
  )
}

function Waterfalls({ seg }: { seg: SegModel }) {
  if (seg.id !== 's2b') return null
  const plaza = seg.plazas[0]
  return (
    <group>
      <Waterfall seg={seg} x={seg.zones.waterfallNW} z={plaza.cz - plaza.r - 6.5} rotY={0.35} />
      <Waterfall seg={seg} x={seg.zones.waterfallSE} z={plaza.cz + plaza.r + 6.5} rotY={Math.PI - 0.35} />
    </group>
  )
}

export default function Water({ segId }: { segId: keyof typeof SEGMENTS }) {
  const seg = SEGMENTS[segId]
  return (
    <group>
      <Ponds seg={seg} />
      <Fountains seg={seg} />
      <Waterfalls seg={seg} />
    </group>
  )
}
