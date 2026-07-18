import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { heightAt, inWater, nearLine, perp } from '../data/geo'
import { mkWood } from './assets'

/**
 * Деревянные игровые точки линейного парка (рендеры стр.9-10, 28):
 * башня-шалаш (А-фрейм) со слайдом + брёвна-балансиры. Инстансится по споту.
 */

const SPOTS_M: [number, number][] = [
  // [арклонг, смещение от оси]
  [820, 14],
  [1350, -16],
  [1980, 15],
  [2380, -14],
  [3240, 16],
  [3760, -15],
  [4980, 14],
  [5680, -16],
  [6150, 13],
]

function timberSite(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // башня-шалаш: 6 наклонных жердей конусом, высота 5.2
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5)
    pole.translate(0, 2.8, 0)
    pole.rotateZ(0.42)
    pole.rotateY(a)
    parts.push(pole)
  }
  // платформа-кольцо
  const deck = new THREE.CylinderGeometry(1.15, 1.15, 0.12, 8)
  deck.translate(0, 2.1, 0)
  parts.push(deck)
  // перекладины входа
  const bar = new THREE.BoxGeometry(1.6, 0.1, 0.1)
  bar.translate(0, 1.1, 1.4)
  parts.push(bar)
  // брёвна-балансиры рядом
  for (let i = 0; i < 3; i++) {
    const log = new THREE.CylinderGeometry(0.16, 0.19, 3.4, 6)
    log.rotateZ(Math.PI / 2)
    log.rotateY(i * 0.5 - 0.5)
    log.translate(4.2 + i * 1.4, 0.28, i * 1.8 - 1.8)
    parts.push(log)
  }
  // стойки под брёвнами
  for (let i = 0; i < 3; i++) {
    const st = new THREE.CylinderGeometry(0.12, 0.14, 0.35, 5)
    st.translate(4.2 + i * 1.4, 0.17, i * 1.8 - 1.8)
    parts.push(st)
  }
  return mergeGeometries(parts, false)!
}

function slideGeo(): THREE.BufferGeometry {
  // жёлоб-слайд от платформы к земле
  const s = new THREE.CylinderGeometry(0.34, 0.34, 3.6, 8, 1, true, 0, Math.PI)
  s.rotateZ(Math.PI / 2 - 0.55)
  s.rotateY(Math.PI / 2)
  s.translate(0, 1.15, -2.3)
  return s
}

export default function AlleyPlay() {
  const wood = useMemo(mkWood, [])
  const site = useMemo(timberSite, [])
  const slide = useMemo(slideGeo, [])
  const spots = useMemo(
    () =>
      SPOTS_M.map(([m, o]) => {
        const [x, z] = perp(m, o)
        return { x, z, rot: (m * 0.37) % 6.28 }
      }).filter((s) => !inWater(s.x, s.z) && !nearLine(s.x, s.z, 2.2)),
    [],
  )
  const siteRef = useRef<THREE.InstancedMesh>(null!)
  const slideRef = useRef<THREE.InstancedMesh>(null!)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    spots.forEach((s, i) => {
      q.setFromAxisAngle(up, s.rot)
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z), s.z), q, new THREE.Vector3(1, 1, 1))
      siteRef.current.setMatrixAt(i, m)
      slideRef.current.setMatrixAt(i, m)
    })
    siteRef.current.instanceMatrix.needsUpdate = true
    slideRef.current.instanceMatrix.needsUpdate = true
  }, [spots])

  return (
    <group>
      <instancedMesh ref={siteRef} args={[site, undefined, spots.length]} castShadow frustumCulled={false}>
        <meshStandardMaterial map={wood} roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={slideRef} args={[slide, undefined, spots.length]} frustumCulled={false}>
        <meshStandardMaterial color="#b8483a" roughness={0.55} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
}
