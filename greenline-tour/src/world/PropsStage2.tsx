import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt, promAt, rng, type SegModel } from '../data/geometry'
import { wallGeometry, type Pt } from './geometry'
import {
  fallbackRock,
  fallbackTulips,
  makeBrickTexture,
  makeDiscPanelTexture,
  makeWoodTexture,
  useTexOrFallback,
} from './textures'
import { Hero, MODELS } from './Props'
import { useTour } from '../store'

/* ---------------- пергола (тёмный металл + деревянные ламели) ---------------- */

function PergolaFallback({ x, y, z, rot }: { x: number; y: number; z: number; rot: number }) {
  const wood = useMemo(makeWoodTexture, [])
  const lamellas = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BoxGeometry(0.09, 2.35, 0.32)
      g.translate(-2.1 + i * 0.38, 1.35, -1.75)
      parts.push(g)
    }
    for (let i = 0; i < 8; i++) {
      const g = new THREE.BoxGeometry(0.32, 2.35, 0.09)
      g.translate(-2.45, 1.35, -1.6 + i * 0.42)
      parts.push(g)
    }
    // скамья внутри
    const bench = new THREE.BoxGeometry(3.2, 0.08, 0.5)
    bench.translate(0.2, 0.48, -1.35)
    parts.push(bench)
    return mergeGeometries(parts, false)!
  }, [])
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 2.62, 0]} castShadow>
        <boxGeometry args={[5.2, 0.16, 4.2]} />
        <meshStandardMaterial color="#26282c" roughness={0.55} metalness={0.5} />
      </mesh>
      {[
        [-2.4, -1.9],
        [2.4, -1.9],
        [-2.4, 1.9],
        [2.4, 1.9],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.3, pz]} castShadow>
          <boxGeometry args={[0.14, 2.6, 0.14]} />
          <meshStandardMaterial color="#26282c" roughness={0.55} metalness={0.5} />
        </mesh>
      ))}
      <mesh castShadow>
        <primitive object={lamellas} attach="geometry" />
        <meshStandardMaterial map={wood} roughness={0.75} />
      </mesh>
    </group>
  )
}

export function Pergolas({ seg }: { seg: SegModel }) {
  const rand = rng(212)
  return (
    <group>
      {seg.pavilions.map(([x, z], i) => {
        const y = heightAt(seg, x, z)
        const rot = rand() * Math.PI
        // первый павильон — hero GLB, остальные процедурные
        return i === 0 ? (
          <Hero
            key={i}
            url={MODELS.pergola}
            height={3}
            position={[x, y, z]}
            rotationY={rot}
            fallback={<PergolaFallback x={x} y={y} z={z} rot={rot} />}
          />
        ) : (
          <PergolaFallback key={i} x={x} y={y} z={z} rot={rot} />
        )
      })}
    </group>
  )
}

/* ---------------- тоннели из арх. бетона ---------------- */

function TunnelFallback({ seg, x, z, rot }: { seg: SegModel; x: number; z: number; rot: number }) {
  const rock = useTexOrFallback('rock', fallbackRock, [2.2, 1.2])
  const y = heightAt(seg, x, z)
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      {/* перекрытие */}
      <mesh position={[0, 3.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.5, 0.8, 6.5]} />
        <meshStandardMaterial map={rock} roughness={0.95} />
      </mesh>
      {/* боковые скальные стены */}
      {[-3.4, 3.4].map((sx, i) => (
        <mesh key={i} position={[sx, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 3, 6.5]} />
          <meshStandardMaterial map={rock} roughness={0.95} />
        </mesh>
      ))}
      {/* откосы-крылья */}
      {[
        [-5.4, 0.42, -3],
        [5.4, 0.42, -3],
        [-5.4, 0.42, 3],
        [5.4, 0.42, 3],
      ].map(([sx, , sz], i) => (
        <mesh key={i} position={[sx, 1.1, sz]} rotation={[0, ((sx > 0 ? -1 : 1) * Math.PI) / 7, 0]} castShadow>
          <boxGeometry args={[3.4, 2.2, 1.2]} />
          <meshStandardMaterial map={rock} roughness={0.95} />
        </mesh>
      ))}
      {/* терраса с тюльпанами сверху */}
      <TulipTop w={7} d={5.6} y={3.9} />
    </group>
  )
}

function TulipTop({ w, d, y }: { w: number; d: number; y: number }) {
  const tulips = useTexOrFallback('tulips', fallbackTulips, [w / 3, d / 3])
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tulips} roughness={0.95} />
    </mesh>
  )
}

export function Tunnels({ seg }: { seg: SegModel }) {
  if (seg.id !== 's2b') return null
  // проём тоннеля — вдоль променада (ось X), поэтому + π/2
  const spots = [
    { x: seg.zones.tunnelWest, z: promAt(seg, seg.zones.tunnelWest).z, rot: Math.PI / 2 + 0.25 },
    { x: seg.zones.tunnelEast, z: promAt(seg, seg.zones.tunnelEast).z, rot: Math.PI / 2 - 0.2 },
  ]
  return (
    <group>
      {spots.map((s, i) =>
        i === 0 ? (
          <Hero
            key={i}
            url={MODELS.tunnel}
            height={4.2}
            position={[s.x, heightAt(seg, s.x, s.z), s.z]}
            rotationY={s.rot}
            fallback={<TunnelFallback seg={seg} x={s.x} z={s.z} rot={s.rot} />}
          />
        ) : (
          <TunnelFallback key={i} seg={seg} x={s.x} z={s.z} rot={s.rot} />
        ),
      )}
    </group>
  )
}

/* ---------------- каскадное озеленение вокруг центральной площади ------- */

export function Cascades({ seg }: { seg: SegModel }) {
  const rock = useTexOrFallback('rock', fallbackRock, [1, 1])
  const tulips = useTexOrFallback('tulips', fallbackTulips, [1, 1])
  const wood = useMemo(makeWoodTexture, [])
  const data = useMemo(() => {
    if (seg.id !== 's2b') return null
    const plaza = seg.plazas[0]
    const walls: THREE.BufferGeometry[] = []
    const beds: THREE.BufferGeometry[] = []
    const benches: THREE.BufferGeometry[] = []
    // четыре симметричных квадранта × 3 террасы (проходы на востоке и западе)
    const quads: [number, number][] = [
      [Math.PI * 0.1, Math.PI * 0.42],
      [Math.PI * 0.58, Math.PI * 0.9],
      [Math.PI * 1.1, Math.PI * 1.42],
      [Math.PI * 1.58, Math.PI * 1.9],
    ]
    for (const [a0, a1] of quads) {
      for (let t = 0; t < 3; t++) {
        const r = plaza.r + 3.5 + t * 4
        const hTop = 0.55 + t * 0.55
        const pts: Pt[] = []
        for (let a = a0; a <= a1; a += 0.045) pts.push({ x: plaza.cx + Math.cos(a) * r, z: plaza.cz + Math.sin(a) * r })
        walls.push(wallGeometry(pts, 0.5, hTop, () => 0, 2))
        // клумба позади стенки
        const bed: Pt[] = []
        for (let a = a0; a <= a1; a += 0.07) bed.push({ x: plaza.cx + Math.cos(a) * (r + 1.6), z: plaza.cz + Math.sin(a) * (r + 1.6) })
        const bedGeo = ribbonFlat(bed, 3, hTop + 0.12)
        beds.push(bedGeo)
        // линейные деревянные скамьи на первой террасе
        if (t === 0) {
          const mid = Math.floor(pts.length / 2)
          for (const idx of [Math.floor(pts.length * 0.25), mid, Math.floor(pts.length * 0.75)]) {
            const p = pts[idx]
            const dir = Math.atan2(pts[Math.min(idx + 1, pts.length - 1)].x - p.x, pts[Math.min(idx + 1, pts.length - 1)].z - p.z)
            const b = new THREE.BoxGeometry(0.5, 0.09, 2.4)
            b.rotateY(dir)
            b.translate(p.x, hTop + 0.05, p.z)
            benches.push(b)
          }
        }
      }
    }
    return {
      walls: mergeGeometries(walls, false)!,
      beds: mergeGeometries(beds, false)!,
      benches: mergeGeometries(benches, false)!,
    }
  }, [seg])
  if (!data) return null
  return (
    <group>
      <mesh geometry={data.walls} castShadow receiveShadow>
        <meshStandardMaterial map={rock} roughness={0.92} />
      </mesh>
      <mesh geometry={data.beds} receiveShadow>
        <meshStandardMaterial map={tulips} roughness={0.95} />
      </mesh>
      <mesh geometry={data.benches} castShadow>
        <meshStandardMaterial map={wood} roughness={0.75} />
      </mesh>
    </group>
  )
}

/** Плоская лента на фиксированной высоте (клумбы каскадов). */
function ribbonFlat(pts: Pt[], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    pos.push(pts[i].x - (nx * width) / 2, y, pts[i].z - (nz * width) / 2, pts[i].x + (nx * width) / 2, y, pts[i].z + (nz * width) / 2)
    uv.push(0, i * 0.4, 1, i * 0.4)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ---------------- лужайка со сценой (кольцо изгороди) ---------------- */

export function StageLawn({ seg }: { seg: SegModel }) {
  const night = useTour((s) => s.night)
  const spotRef = useRef<THREE.MeshStandardMaterial>(null!)
  const wood = useMemo(makeWoodTexture, [])
  const hedgeGeo = useMemo(() => {
    const lawn = seg.lawns[0]
    if (!lawn) return null
    const parts: THREE.BufferGeometry[] = []
    // кольцо живой изгороди с проёмами
    const gaps = [
      [0.35, 0.75],
      [1.9, 2.25],
      [3.6, 3.95],
      [5.1, 5.45],
    ]
    let a = 0
    while (a < Math.PI * 2) {
      const inGap = gaps.some(([g0, g1]) => a > g0 && a < g1)
      if (!inGap) {
        const g = new THREE.BoxGeometry(1.1, 2.2, 0.7)
        g.rotateY(-a)
        g.translate(lawn.cx + Math.cos(a) * (lawn.r + 1.8), 1.1 - 0.5, lawn.cz + Math.sin(a) * (lawn.r + 1.8))
        parts.push(g)
      }
      a += 0.16
    }
    return mergeGeometries(parts, false)!
  }, [seg])
  useFrame((_, delta) => {
    if (spotRef.current)
      spotRef.current.emissiveIntensity = THREE.MathUtils.lerp(spotRef.current.emissiveIntensity, night ? 1.8 : 0.1, Math.min(1, delta * 2))
  })
  const lawn = seg.lawns[0]
  if (!lawn || !hedgeGeo) return null
  const stageX = lawn.cx - lawn.r * 0.45
  const stageZ = lawn.cz + lawn.r * 0.5
  const stageY = heightAt(seg, stageX, stageZ)
  return (
    <group>
      <mesh geometry={hedgeGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#2f5c31" roughness={0.95} flatShading />
      </mesh>
      {/* сцена — деревянный настил */}
      <group position={[stageX, stageY, stageZ]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[3.4, 3.6, 0.44, 20]} />
          <meshStandardMaterial map={wood} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.47, 0]}>
          <cylinderGeometry args={[3.15, 3.15, 0.06, 20]} />
          <meshStandardMaterial ref={spotRef} color="#c9b790" emissive="#ffd9a0" emissiveIntensity={0.1} roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------------- вход Толе би: стела, диск-панно, кирпичные скамьи ----- */

export function ToleBiEntrance({ seg }: { seg: SegModel }) {
  const brick = useMemo(makeBrickTexture, [])
  const disc = useMemo(makeDiscPanelTexture, [])
  const night = useTour((s) => s.night)
  const lettersMat = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame((_, delta) => {
    if (lettersMat.current)
      lettersMat.current.emissiveIntensity = THREE.MathUtils.lerp(lettersMat.current.emissiveIntensity, night ? 0.8 : 0.05, Math.min(1, delta * 2))
  })
  if (seg.id !== 's2b') return null
  const ex = seg.zones.toleBiEntrance
  const p = promAt(seg, ex)
  const y = heightAt(seg, p.x, p.z)

  const stelaFallback = (
    <group position={[p.x, y, p.z - 5]} rotation={[0, 0.4, 0]}>
      {/* кольцо-клумба из тёмного кирпича с галькой */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[2.1, 2.25, 0.7, 24, 1, true]} />
        <meshStandardMaterial map={brick} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.1, 24]} />
        <meshStandardMaterial color="#d9d4c8" roughness={0.9} />
      </mesh>
      {/* металлические буквы GREEN LINE на кольце */}
      {['G', 'R', 'E', 'E', 'N', ' ', 'L', 'I', 'N', 'E'].map((ch, i) => {
        if (ch === ' ') return null
        const a = -0.75 + i * 0.17
        return (
          <mesh key={i} position={[Math.sin(a) * 2.18, 0.95, -Math.cos(a) * 2.18]} rotation={[0, -a + Math.PI, 0]} castShadow>
            <boxGeometry args={[0.34, 0.5, 0.06]} />
            <meshStandardMaterial ref={i === 0 ? lettersMat : undefined} color="#cdd4d8" metalness={0.9} roughness={0.25} emissive="#e8f0f4" emissiveIntensity={0.05} />
          </mesh>
        )
      })}
      {/* дерево в кольце */}
      <mesh position={[0.3, 1.7, 0.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 2.2, 6]} />
        <meshStandardMaterial color="#5a4a38" roughness={0.9} />
      </mesh>
      <mesh position={[0.3, 3.1, 0.2]} castShadow>
        <icosahedronGeometry args={[1.1, 1]} />
        <meshStandardMaterial color="#5c8a3e" roughness={0.95} flatShading />
      </mesh>
    </group>
  )

  return (
    <group>
      <Hero url={MODELS.stela2} height={3.4} position={[p.x, y, p.z - 5]} rotationY={0.4} fallback={stelaFallback} />
      {/* диск-панно GREENLINE вокруг дерева */}
      <group position={[p.x - 9, heightAt(seg, p.x - 9, p.z + 6), p.z + 6]}>
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.6, 36]} />
          <meshStandardMaterial map={disc} roughness={0.4} metalness={0.15} />
        </mesh>
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.12, 3, 6]} />
          <meshStandardMaterial color="#4a3a2e" roughness={0.9} />
        </mesh>
        <mesh position={[0, 3.4, 0]} castShadow>
          <icosahedronGeometry args={[1.3, 1]} />
          <meshStandardMaterial color="#557a38" roughness={0.95} flatShading />
        </mesh>
      </group>
      {/* круглые кирпичные скамьи */}
      {[
        [p.x - 4, p.z + 9],
        [p.x - 14, p.z - 2],
        [p.x - 20, p.z + 8],
      ].map(([bx, bz], i) => (
        <group key={i} position={[bx, heightAt(seg, bx, bz), bz]}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[1.15, 1.25, 0.56, 20, 1, true]} />
            <meshStandardMaterial map={brick} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.57, 0]}>
            <cylinderGeometry args={[1.2, 1.2, 0.06, 20]} />
            <meshStandardMaterial color="#c9a06a" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export default function Stage2Props({ seg }: { seg: SegModel }) {
  return (
    <group>
      <Pergolas seg={seg} />
      <Tunnels seg={seg} />
      <Cascades seg={seg} />
      <StageLawn seg={seg} />
      <ToleBiEntrance seg={seg} />
    </group>
  )
}
