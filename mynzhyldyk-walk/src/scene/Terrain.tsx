import * as THREE from 'three'
import { useMemo } from 'react'
import { ALM, bandHalf, arcOf, heightAt, riverDist } from '../data/geo'
import { fbMeadow, useTexOr } from './assets'
import { useApp } from '../store/useAppStore'

const X0 = -500
const X1 = 7150
const Z0 = -1750
const Z1 = 1750

/** Рельеф: степная равнина + landform-холмы + русло; тонировка лугов/степи. */
export default function Terrain() {
  const quality = useApp((s) => s.quality)
  const meadow = useTexOr('meadow', fbMeadow, [520, 240])
  const geo = useMemo(() => {
    const sx = quality === 'high' ? 400 : 260
    const sz = quality === 'high' ? 190 : 120
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, sx, sz)
    g.rotateX(-Math.PI / 2)
    g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2)
    const p = g.attributes.position
    const colors = new Float32Array(p.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      p.setY(i, heightAt(x, z))
      const { m, d } = arcOf(x, z)
      const band = bandHalf(m)
      const rd = riverDist(x, z)
      // луг в ленте и парках → степь снаружи → песок у воды
      let meadowK = THREE.MathUtils.smoothstep(1 - (d - band) / 260, 0, 1)
      if (m > 5243) meadowK = Math.max(meadowK, 0.55) // Yesil — пойменные луга
      const t = 0.86 + 0.24 * Math.sin(x * 0.11) * Math.sin(z * 0.13)
      // базовый луг → перекраска в степное золото
      const gold = new THREE.Color(1.32 * t, 1.08 * t, 0.62 * t)
      const green = new THREE.Color(0.92 * t, 1.02 * t, 0.82 * t)
      c.copy(gold).lerp(green, Math.min(1, meadowK))
      if (rd < ALM.river.width / 2 + 26) c.multiplyScalar(0.82).add(new THREE.Color(0.12, 0.09, 0.04))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [quality])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial map={meadow} vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}
