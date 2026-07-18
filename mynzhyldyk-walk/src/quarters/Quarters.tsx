import * as THREE from 'three'
import React, { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ALM, heightAt, perp, spineAt, WATER_Y } from '../data/geo'
import { fbDiamond, fbGranite, mkWood, useTexOr } from '../scene/assets'
import { ribbon, resample } from '../scene/util'

const MODELS = {
  pavilion: '/assets/models/pavilion.glb',
  canopy: '/assets/models/diamond_canopy.glb',
  leopard: '/assets/models/snow_leopard.glb',
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

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* D1 Capital — площадь «Қазақ Елі» (презентация стр.4-6):
   монумент с Самруком, конус «Шабыт», Дворец Независимости, боскеты в кадках,
   красная сетка мощения, водная лента, юрты южнее. */
function Capital() {
  const granite = useTexOr('granite', fbGranite, [14, 14])
  const [ix, iz] = mk('1')
  const py = heightAt(ix, iz)

  // боскеты: гранитные кадки с рощицами и лавками по флангам площади
  const bosque = useMemo(() => {
    const stone: THREE.BufferGeometry[] = []
    const trunks: THREE.BufferGeometry[] = []
    const crowns: THREE.BufferGeometry[] = []
    let s = 833
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    const planters: [number, number][] = []
    for (let k = 0; k < 4; k++) {
      planters.push([ix - 72 + k * 16.5, iz - 40], [ix - 72 + k * 16.5, iz + 40])
      planters.push([ix + 24 + k * 16.5, iz - 40], [ix + 24 + k * 16.5, iz + 40])
    }
    for (const [cx, cz] of planters) {
      const box = new THREE.BoxGeometry(14, 0.55, 14)
      box.translate(cx, py + 0.28, cz)
      stone.push(box)
      const bench = new THREE.BoxGeometry(14.6, 0.12, 0.5)
      bench.translate(cx, py + 0.62, cz + 7.3)
      stone.push(bench)
      for (let t = 0; t < 6; t++) {
        const tx = cx - 4.5 + (t % 3) * 4.5 + rnd() * 1.5
        const tz = cz - 3 + Math.floor(t / 3) * 5.5 + rnd() * 1.5
        const th = 4.5 + rnd() * 2.2
        const trunk = new THREE.CylinderGeometry(0.07, 0.1, th * 0.5, 5)
        trunk.translate(tx, py + 0.55 + th * 0.25, tz)
        trunks.push(trunk)
        const crown = new THREE.IcosahedronGeometry(th * 0.3, 0)
        crown.scale(1, 1.5, 1)
        crown.translate(tx, py + 0.55 + th * 0.72, tz)
        crowns.push(crown.toNonIndexed())
      }
    }
    return {
      stone: mergeGeometries(stone, false)!,
      trunks: mergeGeometries(trunks, false)!,
      crowns: mergeGeometries(crowns, false)!,
    }
  }, [ix, iz, py])

  // красные акцентные полосы мощения (сетка, как на фото 2024)
  const redGrid = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 7; i++) {
      const g = new THREE.PlaneGeometry(2.2, 118)
      g.rotateX(-Math.PI / 2)
      g.rotateY(0.26)
      const px = ix - 66 + i * 22
      g.translate(px, py + 0.045, iz)
      parts.push(g)
    }
    for (let i = 0; i < 5; i++) {
      const g = new THREE.PlaneGeometry(186, 2.2)
      g.rotateX(-Math.PI / 2)
      g.rotateY(0.26)
      g.translate(ix, py + 0.045, iz - 44 + i * 22)
      parts.push(g)
    }
    return mergeGeometries(parts, false)!
  }, [ix, iz, py])

  // решётка Дворца Независимости
  const lattice = useMemo(
    () =>
      canvasTex(256, 256, (c) => {
        c.fillStyle = '#1e3a5c'
        c.fillRect(0, 0, 256, 256)
        c.strokeStyle = 'rgba(235,240,245,0.9)'
        c.lineWidth = 5
        for (let i = -8; i < 16; i++) {
          c.beginPath()
          c.moveTo(i * 32, 0)
          c.lineTo(i * 32 + 256, 256)
          c.stroke()
          c.beginPath()
          c.moveTo(i * 32 + 256, 0)
          c.lineTo(i * 32, 256)
          c.stroke()
        }
      }),
    [],
  )
  useMemo(() => {
    lattice.wrapS = lattice.wrapT = THREE.RepeatWrapping
    lattice.repeat.set(3, 2)
  }, [lattice])

  return (
    <group>
      <mesh position={[ix, py + 0.03, iz]} rotation={[-Math.PI / 2, 0, 0.26]} receiveShadow>
        <planeGeometry args={[190, 120]} />
        <meshStandardMaterial map={granite} roughness={0.85} />
      </mesh>
      <mesh geometry={redGrid} receiveShadow>
        <meshStandardMaterial color="#9c4a38" roughness={0.9} />
      </mesh>
      {/* монумент «Қазақ Елі»: стилобат, колонна, золотой Самрук */}
      <group position={[ix, py, iz]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[15, 16.5, 0.9, 36]} />
          <meshStandardMaterial color="#e8e5de" roughness={0.55} />
        </mesh>
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[11, 11.6, 0.5, 36]} />
          <meshStandardMaterial color="#f0ede6" roughness={0.5} />
        </mesh>
        <mesh position={[0, 22, 0]} castShadow>
          <cylinderGeometry args={[1.15, 1.7, 42, 14]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.35} />
        </mesh>
        <mesh position={[0, 43.6, 0]}>
          <cylinderGeometry args={[1.5, 1.15, 1.2, 14]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.35} />
        </mesh>
        {/* Самрук */}
        <mesh position={[0, 45, 0]} castShadow>
          <sphereGeometry args={[1.05, 10, 8]} />
          <meshStandardMaterial color="#d8a828" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[-1.6, 45.3, 0]} rotation={[0, 0, 0.55]}>
          <boxGeometry args={[3.2, 0.16, 0.9]} />
          <meshStandardMaterial color="#d8a828" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[1.6, 45.3, 0]} rotation={[0, 0, -0.55]}>
          <boxGeometry args={[3.2, 0.16, 0.9]} />
          <meshStandardMaterial color="#d8a828" metalness={0.85} roughness={0.25} />
        </mesh>
      </group>
      {/* «Шабыт» — синий стеклянный конус */}
      <mesh position={[ix - 76, py + 11, iz - 74]} castShadow>
        <cylinderGeometry args={[15, 25, 22, 26]} />
        <meshPhysicalMaterial color="#2a5f94" roughness={0.12} metalness={0.35} envMapIntensity={1.8} transparent opacity={0.92} />
      </mesh>
      {/* Дворец Независимости — ромбо-решётка */}
      <mesh position={[ix + 74, py + 11, iz - 72]} rotation={[0, 0.26, 0]} castShadow>
        <boxGeometry args={[54, 22, 32]} />
        <meshStandardMaterial map={lattice} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* боскеты */}
      <mesh geometry={bosque.stone} castShadow receiveShadow>
        <meshStandardMaterial color="#b8b2a6" roughness={0.8} />
      </mesh>
      <mesh geometry={bosque.trunks}>
        <meshStandardMaterial color="#e8e4dc" roughness={0.8} />
      </mesh>
      <mesh geometry={bosque.crowns} castShadow>
        <meshStandardMaterial color="#6d9552" roughness={0.95} flatShading />
      </mesh>
      {/* водная лента вдоль южной кромки */}
      <mesh position={[ix, py + 0.07, iz + 56]} rotation={[-Math.PI / 2, 0, 0.26]}>
        <planeGeometry args={[150, 4.5]} />
        <meshStandardMaterial color="#2a4a52" roughness={0.05} metalness={0.4} envMapIntensity={1.6} />
      </mesh>
      {/* флагштоки */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[ix - 50 + i * 20, py + 9, iz - 52]} castShadow>
          <cylinderGeometry args={[0.09, 0.13, 18, 6]} />
          <meshStandardMaterial color="#cfd2d4" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* юрты-купола в южном парке */}
      {([[ix - 60, iz + 120, 5], [ix - 28, iz + 132, 4], [ix + 6, iz + 124, 5.5], [ix + 42, iz + 134, 3.6], [ix + 74, iz + 122, 4.6]] as [number, number, number][]).map(
        ([yx, yz, r], i) => (
          <group key={i} position={[yx, heightAt(yx, yz), yz]}>
            <mesh castShadow>
              <sphereGeometry args={[r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#ece8de" roughness={0.85} />
            </mesh>
            <mesh position={[0, r * 0.96, 0]}>
              <cylinderGeometry args={[0.3, 0.5, 0.5, 8]} />
              <meshStandardMaterial color="#b09a70" roughness={0.8} />
            </mesh>
          </group>
        ),
      )}
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

/* D5 Station — Привокзальный парк (презентация стр.24-34): озеро с островом
   и деревянными террасами, световые мачты, спортзона, ворота WELCOME TO ASTANA,
   снежный барс, сад цветущих деревьев. */
function Station() {
  const granite = useTexOr('granite', fbGranite, [12, 12])
  const wood = useMemo(mkWood, [])
  const [px, pz] = mk('21')
  const lake = ALM.lakes.find((l) => l.id === 'mynzhyldyk')!

  // деревянные террасы южного берега (3 ступени, лицом к воде)
  const terraces = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let s = 0; s < 3; s++) {
      const r0 = 1.06 + s * 0.09
      const pts: [number, number][] = []
      for (let a = Math.PI * 0.22; a <= Math.PI * 0.78; a += 0.05)
        pts.push([lake.x + Math.cos(a) * lake.rx * r0, lake.z + Math.sin(a) * lake.rz * r0])
      parts.push(ribbon(pts, 2.4, () => WATER_Y + 1.0 + s * 0.5, 3, 0))
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!
  }, [lake])

  // тростник wetland-кромки (северный берег)
  const reeds = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    let s = 517
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 150; i++) {
      const a = Math.PI * 1.05 + rnd() * Math.PI * 0.9
      const rr = 0.92 + rnd() * 0.22
      const x = lake.x + Math.cos(a) * lake.rx * rr
      const z = lake.z + Math.sin(a) * lake.rz * rr
      const g = new THREE.ConeGeometry(0.45 + rnd() * 0.45, 1.6 + rnd() * 1.3, 5)
      g.translate(x, WATER_Y + 0.8 + rnd() * 0.4, z)
      parts.push(g.toNonIndexed())
    }
    return mergeGeometries(parts, false)!
  }, [lake])

  // цветные корты спортивно-игровой зоны
  const courts = useMemo(() => {
    const mkCourt = (base: string, lines: string) =>
      canvasTex(128, 224, (c) => {
        c.fillStyle = base
        c.fillRect(0, 0, 128, 224)
        c.strokeStyle = lines
        c.lineWidth = 4
        c.strokeRect(10, 10, 108, 204)
        c.beginPath()
        c.moveTo(10, 112)
        c.lineTo(118, 112)
        c.stroke()
        c.beginPath()
        c.arc(64, 112, 22, 0, 6.28)
        c.stroke()
      })
    return [mkCourt('#3f8f8a', '#f0f0ea'), mkCourt('#c9703f', '#f0ece2'), mkCourt('#5f8f4a', '#eef0e6'), mkCourt('#b85f8a', '#f2eee8')]
  }, [])

  // ворота WELCOME TO ASTANA через аллею
  const gateTex = useMemo(
    () =>
      canvasTex(1024, 96, (c) => {
        c.fillStyle = '#7d4527'
        c.fillRect(0, 0, 1024, 96)
        c.fillStyle = '#f2ece0'
        c.font = 'bold 54px Inter, sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText('WELCOME TO ASTANA', 512, 50)
      }),
    [],
  )
  const gate = useMemo(() => {
    const s = spineAt(4600)
    const c = perp(4600, 0)
    return { x: c[0], z: c[1], yaw: Math.atan2(-s.dx, -s.dz) }
  }, [])

  return (
    <group>
      {/* привокзальная площадь */}
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
      {/* террасы + остров истории + тростник */}
      <mesh geometry={terraces} castShadow>
        <meshStandardMaterial map={wood} roughness={0.85} />
      </mesh>
      <group position={[lake.x + 34, 0, lake.z - 4]}>
        <mesh position={[0, WATER_Y + 0.45, 0]} castShadow>
          <cylinderGeometry args={[9, 11, 1.1, 22]} />
          <meshStandardMaterial color="#8a9468" roughness={0.95} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-4 + i * 4, WATER_Y + 1.4, i % 2 ? 3 : -2]} castShadow>
            <icosahedronGeometry args={[1 + i * 0.3, 0]} />
            <meshStandardMaterial color="#b0a894" roughness={0.9} flatShading />
          </mesh>
        ))}
      </group>
      <mesh geometry={reeds}>
        <meshStandardMaterial color="#a8a060" roughness={1} flatShading />
      </mesh>
      {/* световые мачты набережной */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI * (0.24 + i * 0.075)
        const mx = lake.x + Math.cos(a) * (lake.rx + 16)
        const mz = lake.z + Math.sin(a) * (lake.rz + 16)
        return (
          <group key={i} position={[mx, heightAt(mx, mz), mz]}>
            <mesh position={[0, 4.5, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.16, 9, 6]} />
              <meshStandardMaterial color="#dcd8ce" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 9.2, 0]}>
              <sphereGeometry args={[0.42, 10, 8]} />
              <meshStandardMaterial color="#fff4d8" emissive="#ffd88a" emissiveIntensity={1.6} />
            </mesh>
          </group>
        )
      })}
      {/* спортивно-игровая зона северо-западнее озера */}
      {courts.map((tex, i) => {
        const cx = 4620 + (i % 2) * 34
        const cz = -132 - Math.floor(i / 2) * 62
        return (
          <mesh key={i} position={[cx, heightAt(cx, cz) + 0.05, cz]} rotation={[-Math.PI / 2, 0, 0.28]} receiveShadow>
            <planeGeometry args={[30, 56]} />
            <meshStandardMaterial map={tex} roughness={0.92} />
          </mesh>
        )
      })}
      {/* сад цветущих деревьев в тёплом мощении у павильона */}
      <group>
        <mesh position={[lake.x - 52, heightAt(lake.x - 52, lake.z - 66) + 0.04, lake.z - 66]} rotation={[-Math.PI / 2, 0, 0.28]} receiveShadow>
          <planeGeometry args={[64, 40]} />
          <meshStandardMaterial color="#c9885a" roughness={0.9} />
        </mesh>
        {Array.from({ length: 15 }, (_, i) => {
          const tx = lake.x - 78 + (i % 5) * 13
          const tz = lake.z - 82 + Math.floor(i / 5) * 14
          const ty = heightAt(lake.x - 52, lake.z - 66)
          return (
            <group key={i} position={[tx, ty, tz]}>
              <mesh position={[0, 1.4, 0]}>
                <cylinderGeometry args={[0.09, 0.13, 2.8, 5]} />
                <meshStandardMaterial color="#6b5648" roughness={0.85} />
              </mesh>
              <mesh position={[0, 3.4, 0]} castShadow>
                <icosahedronGeometry args={[1.9, 0]} />
                <meshStandardMaterial color="#e8a4c4" roughness={0.9} flatShading />
              </mesh>
            </group>
          )
        })}
      </group>
      {/* ворота WELCOME TO ASTANA */}
      <group position={[gate.x, heightAt(gate.x, gate.z), gate.z]} rotation={[0, gate.yaw, 0]}>
        {[-13, 13].map((o) => (
          <mesh key={o} position={[o, 3.5, 0]} castShadow>
            <boxGeometry args={[1.1, 7, 1.1]} />
            <meshStandardMaterial color="#7d4527" roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 6.4, 0]} castShadow>
          <boxGeometry args={[27.5, 1.7, 0.5]} />
          <meshStandardMaterial map={gateTex} roughness={0.7} />
        </mesh>
      </group>
      <SnowLeopard position={[lake.x + 78, heightAt(lake.x + 78, lake.z - 58), lake.z - 58]} />
    </group>
  )
}

/** Гигантский белый снежный барс — игровая структура (GLB-герой + фолбэк). */
function SnowLeopard({ position }: { position: [number, number, number] }) {
  const fallback = (
    <group position={position} rotation={[0, -0.7, 0]}>
      {/* тело */}
      <mesh position={[0, 2.6, 0]} castShadow>
        <icosahedronGeometry args={[2.6, 0]} />
        <meshStandardMaterial color="#eceae4" roughness={0.55} flatShading />
      </mesh>
      <mesh position={[2.4, 2.2, 0]} scale={[1.4, 0.9, 0.95]} castShadow>
        <icosahedronGeometry args={[1.9, 0]} />
        <meshStandardMaterial color="#f0eee8" roughness={0.55} flatShading />
      </mesh>
      {/* голова */}
      <mesh position={[-3, 4.3, 0]} castShadow>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color="#f2f0ea" roughness={0.5} flatShading />
      </mesh>
      {[-0.6, 0.6].map((o) => (
        <mesh key={o} position={[-3.4, 5.6, o]} rotation={[0, 0, 0.2]}>
          <coneGeometry args={[0.4, 0.8, 4]} />
          <meshStandardMaterial color="#e4e2da" roughness={0.6} flatShading />
        </mesh>
      ))}
      {/* хвост */}
      <mesh position={[4.6, 3.4, 0.8]} rotation={[0.4, 0, 1.1]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 4.6, 6]} />
        <meshStandardMaterial color="#eceae4" roughness={0.55} flatShading />
      </mesh>
      {/* лапы */}
      {([[-1.6, -1], [-1.6, 1], [1.6, -1], [1.6, 1]] as [number, number][]).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.9, lz]} castShadow>
          <boxGeometry args={[0.9, 1.8, 0.8]} />
          <meshStandardMaterial color="#e8e6de" roughness={0.6} flatShading />
        </mesh>
      ))}
      {/* деревянные лазалки у основания */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 1.5 - 1.5, 0.5 + i * 0.3, 2.8]} rotation={[0, i * 0.5, 0.3]}>
          <cylinderGeometry args={[0.09, 0.11, 2.6, 5]} />
          <meshStandardMaterial color="#a58054" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
  return <GLB url={MODELS.leopard} height={7} position={position} rotY={-0.7} fallback={fallback} />
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
