import * as THREE from 'three'
import React, { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt, WATER_Y } from '../data/geo'
import { fbDiamond, fbGranite, mkWood, useTexOr } from '../scene/assets'
import { ribbon, resample } from '../scene/util'

const MODELS = {
  pavilion: '/assets/models/pavilion.glb',
  canopy: '/assets/models/diamond_canopy.glb',
}

class GLBBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
function GLB({ url, height, position, rotY = 0, fallback }: { url: string; height: number; position: [number, number, number]; rotY?: number; fallback: React.ReactNode }) {
  return (
    <GLBBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLBInner url={url} height={height} position={position} rotY={rotY} />
      </Suspense>
    </GLBBoundary>
  )
}
function GLBInner({ url, height, position, rotY }: { url: string; height: number; position: [number, number, number]; rotY: number }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const c = scene.clone(true)
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    c.scale.setScalar(height / (size.y || 1))
    const b2 = new THREE.Box3().setFromObject(c)
    c.position.y -= b2.min.y
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return c
  }, [scene, height])
  return <primitive object={obj} position={position} rotation={[0, rotY, 0]} />
}

const mk = (n: string) => ALM.markers[n] as [number, number]

/* D1 Capital: партеры, флагштоки, водное зеркало, гранитная площадь */
function Capital() {
  const granite = useTexOr('granite', fbGranite, [14, 14])
  const [ix, iz] = mk('1')
  const hedges = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let r = 0; r < 4; r++)
      for (let q = 0; q < 6; q++) {
        const g = new THREE.BoxGeometry(16, 0.8, 1.4)
        g.translate(ix - 60 + q * 24, heightAt(ix, iz) + 0.4, iz - 34 + r * 22)
        parts.push(g)
      }
    return mergeGeometries(parts, false)!
  }, [ix, iz])
  return (
    <group>
      <mesh position={[ix, heightAt(ix, iz) + 0.03, iz]} rotation={[-Math.PI / 2, 0, 0.26]} receiveShadow>
        <planeGeometry args={[190, 120]} />
        <meshStandardMaterial map={granite} roughness={0.85} />
      </mesh>
      <mesh geometry={hedges} castShadow>
        <meshStandardMaterial color="#2f5c31" roughness={0.95} />
      </mesh>
      {/* водное зеркало */}
      <mesh position={[ix + 30, heightAt(ix, iz) + 0.06, iz + 8]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[16, 40]} />
        <meshStandardMaterial color="#2a4a52" roughness={0.05} metalness={0.4} envMapIntensity={1.4} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[ix - 50 + i * 20, heightAt(ix, iz) + 9, iz - 46]} castShadow>
          <cylinderGeometry args={[0.09, 0.13, 18, 6]} />
          <meshStandardMaterial color="#cfd2d4" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/* D2 Millennium: детские площадки */
function Millennium() {
  const spots = [mk('6'), mk('5'), mk('7')]
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, heightAt(x, z), z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
            <circleGeometry args={[16 + i * 3, 26]} />
            <meshStandardMaterial color={['#4f8f96', '#c96f35', '#7a9a5e'][i]} roughness={0.95} />
          </mesh>
          {Array.from({ length: 5 }, (_, k) => (
            <mesh key={k} position={[Math.sin(k * 2.1) * 8, 1, Math.cos(k * 1.7) * 8]} castShadow>
              <boxGeometry args={[0.18, 2, 0.18]} />
              <meshStandardMaterial color="#a58054" roughness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, 1.15, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 2.3, 6]} />
            <meshStandardMaterial color="#c94f43" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* D3 Central Park: амфитеатр + пирсы + павильон-кафе у Lake of Galaxy */
function CentralPark() {
  const wood = useMemo(mkWood, [])
  const lake = ALM.lakes.find((l) => l.id === 'galaxy')!
  const amphi = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let s = 0; s < 5; s++) {
      const r0 = lake.rx + 12 + s * 3
      const pts: [number, number][] = []
      for (let a = Math.PI * 0.95; a <= Math.PI * 1.55; a += 0.05)
        pts.push([lake.x + Math.cos(a) * r0, lake.z + Math.sin(a) * r0 * 0.72])
      parts.push(ribbon(pts, 2.6, () => WATER_Y + 1.1 + s * 0.55, 3, 0))
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!
  }, [lake])
  const piers = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const [a, len] of [
      [0.35, 42],
      [-0.5, 34],
    ] as [number, number][]) {
      const g = new THREE.BoxGeometry(len, 0.35, 3.4)
      g.rotateY(a)
      g.translate(lake.x + Math.cos(a) * (lake.rx - len / 3), WATER_Y + 1.15, lake.z + Math.sin(a) * (lake.rz - 6))
      parts.push(g)
    }
    return mergeGeometries(parts, false)!
  }, [lake])
  const pavPos: [number, number, number] = [lake.x - lake.rx - 26, heightAt(lake.x - lake.rx - 26, lake.z - 30), lake.z - 30]
  const pavFallback = (
    <group position={pavPos} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 2.1, 0]} castShadow>
        <boxGeometry args={[13, 3.4, 9]} />
        <meshPhysicalMaterial color="#bcd4d8" roughness={0.15} metalness={0.2} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 4.05, 0]} castShadow>
        <boxGeometry args={[16, 0.5, 12]} />
        <meshStandardMaterial map={wood} roughness={0.75} />
      </mesh>
      {([[-7, -5], [7, -5], [-7, 5], [7, 5]] as [number, number][]).map(([px, pz], i) => (
        <mesh key={i} position={[px, 2, pz]} castShadow>
          <boxGeometry args={[0.3, 4, 0.3]} />
          <meshStandardMaterial color="#7a5f40" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
  return (
    <group>
      <mesh geometry={amphi} castShadow receiveShadow>
        <meshStandardMaterial color="#c4beb0" roughness={0.9} />
      </mesh>
      <mesh geometry={piers} castShadow>
        <meshStandardMaterial map={wood} roughness={0.8} />
      </mesh>
      <GLB url={MODELS.pavilion} height={5} position={pavPos} rotY={0.4} fallback={pavFallback} />
    </group>
  )
}

/* D4 Hub: Diamond Village — ромбовидная площадь, навесы, ширмы */
function Hub() {
  const diamond = useTexOr('diamond', fbDiamond, [10, 10])
  const wood = useMemo(mkWood, [])
  const [dx, dz] = mk('17')
  const canopyFallback = (px: number, pz: number, rot: number) => (
    <group position={[px, heightAt(px, pz), pz]} rotation={[0, rot, 0]}>
      {([[-3, -3], [3, -3], [-3, 3], [3, 3]] as [number, number][]).map(([qx, qz], i) => (
        <mesh key={i} position={[qx, 1.9, qz]} castShadow>
          <boxGeometry args={[0.22, 3.8, 0.22]} />
          <meshStandardMaterial color="#33363a" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 4.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[6.4, 2.6, 4]} />
        <meshStandardMaterial map={wood} roughness={0.75} />
      </mesh>
    </group>
  )
  const screens = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BoxGeometry(5.5, 2.8, 0.15)
      const a = i * 1.05
      g.rotateY(a)
      const px = dx + Math.cos(a * 1.7) * 34
      const pz = dz + Math.sin(a * 2.3) * 26
      g.translate(px, heightAt(px, pz) + 1.4, pz)
      parts.push(g)
    }
    return mergeGeometries(parts, false)!
  }, [dx, dz])
  return (
    <group>
      <mesh position={[dx, heightAt(dx, dz) + 0.04, dz]} rotation={[-Math.PI / 2, 0, 0.28]} receiveShadow>
        <circleGeometry args={[46, 8]} />
        <meshStandardMaterial map={diamond} roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const px = dx - 24 + (i % 2) * 48
        const pz = dz - 20 + Math.floor(i / 2) * 40
        return i === 0 ? (
          <GLB key={i} url={MODELS.canopy} height={6} position={[px, heightAt(px, pz), pz]} rotY={i} fallback={canopyFallback(px, pz, i)} />
        ) : (
          <React.Fragment key={i}>{canopyFallback(px, pz, i * 0.8)}</React.Fragment>
        )
      })}
      <mesh geometry={screens} castShadow>
        <meshStandardMaterial color="#8a5a34" roughness={0.7} />
      </mesh>
      {/* скейт-чаша */}
      <mesh position={[mk('18')[0], heightAt(mk('18')[0], mk('18')[1]) + 0.05, mk('18')[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[18, 26]} />
        <meshStandardMaterial color="#9a968c" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* D5 Station: привокзальная площадь, хаб мобильности */
function Station() {
  const granite = useTexOr('granite', fbGranite, [12, 12])
  const [px, pz] = mk('21')
  return (
    <group>
      <mesh position={[px, heightAt(px, pz) + 0.03, pz]} rotation={[-Math.PI / 2, 0, 0.28]} receiveShadow>
        <planeGeometry args={[150, 90]} />
        <meshStandardMaterial map={granite} roughness={0.85} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[px - 28 + i * 8, heightAt(px, pz) + 0.55, pz + 30]} castShadow>
          <boxGeometry args={[0.12, 1.1, 2.2]} />
          <meshStandardMaterial color="#4a4e52" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/* D6 Yesil: boardwalks, тростник, орнитоширмы */
function Yesil() {
  const wood = useMemo(mkWood, [])
  const [wx, wz] = mk('30')
  const walks = useMemo(() => {
    const loops: [number, number][][] = [
      [
        [wx - 120, wz - 40],
        [wx - 60, wz - 70],
        [wx + 20, wz - 50],
        [wx + 80, wz + 10],
        [wx + 30, wz + 60],
        [wx - 50, wz + 40],
        [wx - 120, wz - 40],
      ],
    ]
    const parts = loops.map((l) => ribbon(resample(l, 10), 2.2, (x, z) => Math.max(heightAt(x, z), -0.4) + 0.5, 2, 0))
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!
  }, [wx, wz])
  const reeds = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    let s = 271
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 220; i++) {
      const a = rnd() * Math.PI * 2
      const r = 30 + rnd() * 130
      const x = wx + Math.cos(a) * r
      const z = wz + Math.sin(a) * r * 0.7
      const g = new THREE.ConeGeometry(0.5 + rnd() * 0.5, 1.8 + rnd() * 1.4, 5)
      g.translate(x, heightAt(x, z) + 0.9, z)
      parts.push(g)
    }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!
  }, [wx, wz])
  return (
    <group>
      <mesh geometry={walks} castShadow>
        <meshStandardMaterial map={wood} roughness={0.85} />
      </mesh>
      <mesh geometry={reeds}>
        <meshStandardMaterial color="#a8a060" roughness={1} flatShading />
      </mesh>
      {[0, 1, 2].map((i) => {
        const sx = wx - 80 + i * 70
        const sz = wz - 20 + (i % 2) * 50
        return (
          <mesh key={i} position={[sx, heightAt(sx, sz) + 1.2, sz]} rotation={[0, i, 0]} castShadow>
            <boxGeometry args={[6, 2.4, 0.18]} />
            <meshStandardMaterial map={wood} roughness={0.85} />
          </mesh>
        )
      })}
    </group>
  )
}

export default function Quarters() {
  return (
    <group>
      <Capital />
      <Millennium />
      <CentralPark />
      <Hub />
      <Station />
      <Yesil />
    </group>
  )
}
