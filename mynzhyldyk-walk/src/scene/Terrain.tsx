import * as THREE from 'three'
import { useMemo } from 'react'
import { ALM, bandHalf, arcOf, heightAt, inSite, riverDist } from '../data/geo'
import { fbMeadow, useTexOr } from './assets'
import { useApp } from '../store/useAppStore'

const X0 = -500
const X1 = 7150
const Z0 = -1750
const Z1 = 1750

/** Рельеф + зонирование покрытий (мастерплан):
    зелёная лента аллеи и парки → нейтральная городская ткань кварталов →
    золотая степь за границей участка. В городской зоне трава-текстура гасится. */
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
    const urban = new Float32Array(p.count)
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      p.setY(i, heightAt(x, z))
      const { m, d } = arcOf(x, z)
      const band = bandHalf(m)
      const rd = riverDist(x, z)
      const site = inSite(x, z)
      const t = 0.86 + 0.24 * Math.sin(x * 0.11) * Math.sin(z * 0.13)

      // зелёная зона: лента аллеи (+кромка 30 м, рваный край), Yesil, парки, пойма
      const edgeNoise = Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.017) * 16
      let greenK = THREE.MathUtils.smoothstep(1 - (d + edgeNoise - band) / 34, 0, 1)
      if (m > 5243 && site) greenK = Math.max(greenK, 0.85)
      for (const lf of ALM.landforms) {
        const ld = Math.hypot(x - lf.x, z - lf.z)
        greenK = Math.max(greenK, THREE.MathUtils.smoothstep(1 - (ld - lf.r) / 40, 0, 1))
      }
      for (const l of ALM.lakes) {
        const ld = Math.hypot(x - l.x, z - l.z)
        greenK = Math.max(greenK, THREE.MathUtils.smoothstep(1 - (ld - Math.max(l.rx, l.rz) * 1.3) / 40, 0, 1))
      }
      if (rd < 130) greenK = Math.max(greenK, THREE.MathUtils.smoothstep(1 - (rd - 60) / 70, 0, 1))

      const gold = new THREE.Color(1.3 * t, 1.06 * t, 0.6 * t) // степь
      const green = new THREE.Color(0.9 * t, 1.0 * t, 0.78 * t) // луг
      const urbanC = new THREE.Color(0.42 * t, 0.4 * t, 0.36 * t) // городская ткань
      if (site) {
        c.copy(urbanC).lerp(green, Math.min(1, greenK))
        urban[i] = Math.max(0, 1 - greenK) * 0.7
      } else {
        // за границей: степь, но пойма реки зеленеет
        c.copy(gold).lerp(green, Math.min(1, greenK * 0.8))
        urban[i] = 0
      }
      if (rd < ALM.river.width / 2 + 26) {
        c.multiplyScalar(0.82).add(new THREE.Color(0.12, 0.09, 0.04))
        urban[i] = 0
      }
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aUrban', new THREE.BufferAttribute(urban, 1))
    g.computeVertexNormals()
    return g
  }, [quality])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        map={meadow}
        vertexColors
        roughness={1}
        metalness={0}
        onBeforeCompile={(shader) => {
          // в городской зоне гасим травяную текстуру до ровного покрытия
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute float aUrban;\nvarying float vUrban;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUrban = aUrban;')
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying float vUrban;')
            .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), vUrban);')
        }}
      />
    </mesh>
  )
}
