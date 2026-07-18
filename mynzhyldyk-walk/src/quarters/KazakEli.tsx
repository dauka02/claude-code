import * as THREE from 'three'
import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt, perp, spineAt } from '../data/geo'

/**
 * Площадь «Қазақ Елі» по фото (docs/landmarks-spec.md):
 * ось Этноаул → эспланада через пр. Тауелсиздик → монумент 91 м с колоннадами;
 * «Шабыт» (скошенный конус), Дворец Независимости (трапеция с белой решёткой),
 * Национальный музей, мечеть Хазрет Султан, крупная сетка мощения, флаг-экраны.
 */

const M0 = 250 // монумент на оси аллеи

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const WHITE = { color: '#f0eee8', roughness: 0.45 }
const GOLD = { color: '#d8a828', metalness: 0.85, roughness: 0.25 }

export default function KazakEli() {
  const s = useMemo(() => spineAt(M0), [])
  const rot = -Math.atan2(s.dz, s.dx)
  const [cx, cz] = useMemo(() => perp(M0, 0), [])
  const py = useMemo(() => heightAt(cx, cz), [cx, cz])

  // мощение: крупная сетка ~20 м тёмными швами
  const plazaTex = useMemo(
    () =>
      canvasTex(512, 512, (c) => {
        c.fillStyle = '#c6c1b6'
        c.fillRect(0, 0, 512, 512)
        let sd = 55
        const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646
        for (let i = 0; i < 4000; i++) {
          c.fillStyle = `rgba(120,116,106,${0.05 + rnd() * 0.1})`
          c.fillRect(rnd() * 512, rnd() * 512, 2, 2)
        }
        c.strokeStyle = 'rgba(74,70,64,0.85)'
        c.lineWidth = 4
        for (let i = 0; i <= 4; i++) {
          c.beginPath(); c.moveTo(i * 128, 0); c.lineTo(i * 128, 512); c.stroke()
          c.beginPath(); c.moveTo(0, i * 128); c.lineTo(512, i * 128); c.stroke()
        }
      }),
    [],
  )
  useMemo(() => {
    plazaTex.wrapS = plazaTex.wrapT = THREE.RepeatWrapping
    plazaTex.repeat.set(4.5, 3.2) // ячейка ≈20 м на плазе 360×260
  }, [plazaTex])

  // «Шабыт»: эллиптический конус со скошенным верхом + полосы остекления
  const shabyt = useMemo(() => {
    const g = new THREE.CylinderGeometry(40, 48, 34, 42, 8, false)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      const k = (y + 17) / 34
      p.setY(i, y + k * p.getX(i) * 0.16) // скос верхней кромки
      p.setZ(i, p.getZ(i) * 0.8) // эллипс
    }
    g.computeVertexNormals()
    return g
  }, [])
  const shabytTex = useMemo(
    () =>
      canvasTex(64, 256, (c) => {
        for (let i = 0; i < 16; i++) {
          c.fillStyle = i % 2 ? '#2a5f94' : '#3b74ad'
          c.fillRect(0, i * 16, 64, 16)
        }
      }),
    [],
  )
  useMemo(() => {
    shabytTex.wrapS = shabytTex.wrapT = THREE.RepeatWrapping
    shabytTex.repeat.set(10, 1)
  }, [shabytTex])

  // Дворец Независимости: трапеция с наклонными стенами + белая решётка
  const palace = useMemo(() => {
    const g = new THREE.BoxGeometry(170, 24, 58, 1, 1, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * 0.84)
        p.setZ(i, p.getZ(i) * 0.72)
      }
    g.computeVertexNormals()
    return g
  }, [])
  const lattice = useMemo(
    () =>
      canvasTex(256, 256, (c) => {
        c.fillStyle = '#17324e'
        c.fillRect(0, 0, 256, 256)
        c.strokeStyle = 'rgba(240,242,245,0.95)'
        c.lineWidth = 7
        for (let i = -4; i < 8; i++) {
          c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64 + 256, 256); c.stroke()
          c.beginPath(); c.moveTo(i * 64 + 256, 0); c.lineTo(i * 64, 256); c.stroke()
        }
      }),
    [],
  )
  useMemo(() => {
    lattice.wrapS = lattice.wrapT = THREE.RepeatWrapping
    lattice.repeat.set(7, 1)
  }, [lattice])

  // балюстрада стилобата + колоннады-крылья (слитые белые элементы)
  const whiteWork = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2
      const b = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 5)
      b.translate(Math.cos(a) * 31.4, 2.15, Math.sin(a) * 31.4)
      parts.push(b.toNonIndexed())
    }
    const rail = new THREE.TorusGeometry(31.4, 0.18, 6, 48)
    rail.rotateX(Math.PI / 2)
    rail.translate(0, 2.75, 0)
    parts.push(rail.toNonIndexed())
    for (const side of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const col = new THREE.CylinderGeometry(0.45, 0.5, 8, 8)
        col.translate(side * (40 + i * 3.4), 4, -6 + Math.abs(i - 5.5) * 1.1)
        parts.push(col.toNonIndexed())
      }
      const ent = new THREE.BoxGeometry(41, 1.1, 2.6)
      ent.translate(side * (40 + 5.5 * 3.4), 8.4, -3)
      parts.push(ent.toNonIndexed())
    }
    return mergeGeometries(parts, false)!
  }, [])

  // флаг-экран
  const flagTex = useMemo(
    () =>
      canvasTex(256, 128, (c) => {
        c.fillStyle = '#2ab8c6'
        c.fillRect(0, 0, 256, 128)
        c.fillStyle = '#e8c33a'
        c.beginPath()
        c.arc(128, 56, 26, 0, 6.28)
        c.fill()
        c.fillStyle = '#2ab8c6'
        c.beginPath()
        c.arc(128, 56, 18, 0, 6.28)
        c.fill()
      }),
    [],
  )

  const rotXZ = (x: number, z: number): [number, number] => [
    cx + x * Math.cos(rot) + z * Math.sin(rot),
    cz - x * Math.sin(rot) + z * Math.cos(rot),
  ]
  const g = (x: number, z: number) => {
    const [wx, wz] = rotXZ(x, z)
    return [wx, heightAt(wx, wz), wz] as [number, number, number]
  }
  void g

  return (
    <group position={[cx, py, cz]} rotation={[0, rot, 0]}>
      {/* плаза с крупной сеткой */}
      <mesh position={[30, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[360, 260]} />
        <meshStandardMaterial map={plazaTex} roughness={0.88} />
      </mesh>

      {/* МОНУМЕНТ: стилобат 2 яруса, портал, колонна 91 м, Самрук */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[32, 33.5, 1.4, 44]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
      <mesh position={[0, 1.9, 0]}>
        <cylinderGeometry args={[23, 24, 1.1, 44]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
      <mesh geometry={whiteWork} position={[0, 0, 0]} castShadow>
        <meshStandardMaterial {...WHITE} />
      </mesh>
      <mesh position={[0, 6.9, 0]} castShadow>
        <boxGeometry args={[12, 9, 12]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
      {[0, Math.PI / 2].map((a) => (
        <mesh key={a} position={[0, 5.4, 0]} rotation={[0, a, 0]}>
          <boxGeometry args={[12.3, 6, 5]} />
          <meshStandardMaterial color="#2e2a26" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.45 + 45.5, 0]} castShadow>
        <cylinderGeometry args={[1.9, 2.6, 91, 18]} />
        <meshStandardMaterial {...WHITE} roughness={0.35} />
      </mesh>
      <mesh position={[0, 94.5, 0]}>
        <cylinderGeometry args={[2.9, 1.9, 3, 18]} />
        <meshStandardMaterial {...WHITE} roughness={0.35} />
      </mesh>
      {/* Самрук (фолбэк: тело + крылья) */}
      <group position={[0, 97.4, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[1.5, 10, 8]} />
          <meshStandardMaterial {...GOLD} />
        </mesh>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 2.4, 0.7, 0]} rotation={[0, 0, sd * -0.6]}>
            <boxGeometry args={[4.6, 0.22, 1.3]} />
            <meshStandardMaterial {...GOLD} />
          </mesh>
        ))}
        <mesh position={[0, 1.5, 0.9]} rotation={[0.5, 0, 0]}>
          <coneGeometry args={[0.5, 1.6, 6]} />
          <meshStandardMaterial {...GOLD} />
        </mesh>
      </group>

      {/* «Шабыт» — СЗ от монумента */}
      <mesh geometry={shabyt} position={[-98, 17, -104]} castShadow>
        <meshPhysicalMaterial map={shabytTex} roughness={0.14} metalness={0.4} envMapIntensity={1.8} />
      </mesh>
      {/* Дворец Независимости — СВ */}
      <mesh geometry={palace} position={[104, 12, -104]} castShadow>
        <meshStandardMaterial map={lattice} roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[104, 24.4, -104]}>
        <boxGeometry args={[146, 1.2, 44]} />
        <meshStandardMaterial {...WHITE} />
      </mesh>
      {/* Национальный музей — восточнее */}
      <group position={[236, 0, -78]}>
        {([[0, 0, 70, 16, 40], [46, 12, 40, 14, 34], [-40, -8, 34, 20, 30]] as number[][]).map(([dx, dz, w, h, d], i) => (
          <mesh key={i} position={[dx, h / 2, dz]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#e8e6e0" roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[18, 23, -6]} castShadow>
          <boxGeometry args={[18, 18, 18]} />
          <meshPhysicalMaterial color="#2a5f94" roughness={0.15} metalness={0.4} transparent opacity={0.92} />
        </mesh>
      </group>
      {/* Мечеть Хазрет Султан — СЗ за дорогой (фолбэк) */}
      <group position={[-210, 0, -150]}>
        <mesh position={[0, 10, 0]} castShadow>
          <boxGeometry args={[64, 20, 64]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.5} />
        </mesh>
        <mesh position={[0, 23, 0]}>
          <cylinderGeometry args={[15, 16, 6, 20]} />
          <meshStandardMaterial color="#f2f0ea" roughness={0.5} />
        </mesh>
        <mesh position={[0, 26, 0]} castShadow>
          <sphereGeometry args={[15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#cfe0e8" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0, 42.5, 0]}>
          <coneGeometry args={[1, 4, 8]} />
          <meshStandardMaterial {...GOLD} />
        </mesh>
        {([[-36, -36], [36, -36], [-36, 36], [36, 36]] as number[][]).map(([mx, mz], i) => (
          <group key={i} position={[mx, 0, mz]}>
            <mesh position={[0, 33, 0]} castShadow>
              <cylinderGeometry args={[1.7, 2.3, 66, 10]} />
              <meshStandardMaterial color="#f2f0ea" roughness={0.5} />
            </mesh>
            <mesh position={[0, 69.5, 0]}>
              <coneGeometry args={[2.4, 7, 10]} />
              <meshStandardMaterial color="#cfe0e8" roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>

      {/* пр. Тауелсиздик: 10 полос поперёк оси перед площадью (запад) */}
      <mesh position={[-172, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 560]} />
        <meshStandardMaterial color="#54565a" roughness={0.95} />
      </mesh>
      {/* эспланада-переход по оси */}
      <mesh position={[-172, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[38, 14]} />
        <meshStandardMaterial color="#d8d4c8" roughness={0.85} />
      </mesh>
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[-172, 0.5, sd * 10]} castShadow>
          <boxGeometry args={[38, 1, 4]} />
          <meshStandardMaterial color="#5f7c3e" roughness={0.95} />
        </mesh>
      ))}
      {/* флаг-экраны вдоль проспекта */}
      {Array.from({ length: 8 }, (_, i) => {
        const z = -210 + i * 60
        if (Math.abs(z) < 20) return null
        return (
          <group key={i}>
            <mesh position={[-150, 2.2, z]} castShadow>
              <boxGeometry args={[0.5, 4.4, 7]} />
              <meshStandardMaterial map={flagTex} roughness={0.5} />
            </mesh>
            <mesh position={[-194, 2.2, z]} castShadow>
              <boxGeometry args={[0.5, 4.4, 7]} />
              <meshStandardMaterial map={flagTex} roughness={0.5} />
            </mesh>
          </group>
        )
      })}

      {/* ЭТНОАУЛ: поле юрт на оси за проспектом + белая аллея */}
      <mesh position={[-268, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[150, 11]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.85} />
      </mesh>
      {useMemo(() => {
        let sd = 77
        const rnd = () => ((sd = (sd * 16807) % 2147483647) - 1) / 2147483646
        const yurts: { x: number; z: number; r: number }[] = []
        for (let i = 0; i < 26; i++) {
          const x = -215 - rnd() * 125
          const z = (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 85)
          yurts.push({ x, z, r: 4 + rnd() * 3.2 })
        }
        return yurts
      }, []).map((y, i) => (
        <group key={i} position={[y.x, 0, y.z]}>
          <mesh position={[0, y.r * 0.36, 0]} castShadow>
            <cylinderGeometry args={[y.r, y.r, y.r * 0.72, 16]} />
            <meshStandardMaterial color="#b6b2a8" roughness={0.9} />
          </mesh>
          <mesh position={[0, y.r * 0.72, 0]} castShadow>
            <sphereGeometry args={[y.r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c4c0b6" roughness={0.9} />
          </mesh>
          <mesh position={[0, y.r * 1.68, 0]}>
            <cylinderGeometry args={[y.r * 0.1, y.r * 0.14, y.r * 0.14, 8]} />
            <meshStandardMaterial color="#6b5a44" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
