import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { fallbackSkyDay, fallbackSkyNight, TEX } from './textures'
import { playerPos, useTour } from '../store'
import { lampPositions } from './Props'
import { SEGMENTS } from '../data/geometry'

const DAY_FOG = new THREE.Color('#cdd8de')
const NIGHT_FOG = new THREE.Color('#0b111e')
const DAY_AMBIENT = 0.55
const NIGHT_AMBIENT = 0.16

function loadSky(url: string, fallback: () => THREE.Texture): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => resolve(t),
      undefined,
      () => resolve(fallback()),
    )
  })
}

/** Sky dome (two textures crossfaded via two spheres), env reflections, fog. */
export function SkyAndFog() {
  const night = useTour((s) => s.night)
  const { scene, gl } = useThree()
  const dayRef = useRef<THREE.MeshBasicMaterial>(null!)
  const nightRef = useRef<THREE.MeshBasicMaterial>(null!)
  const fog = useMemo(() => new THREE.FogExp2(DAY_FOG.clone(), 0.0055), [])

  useEffect(() => {
    scene.fog = fog
    let disposed = false
    loadSky(TEX.skyDay, fallbackSkyDay).then((t) => {
      if (disposed) return
      t.colorSpace = THREE.SRGBColorSpace
      t.mapping = THREE.EquirectangularReflectionMapping
      if (dayRef.current) {
        dayRef.current.map = t
        dayRef.current.needsUpdate = true
      }
      // sky drives PBR reflections (water, lamp heads)
      const pmrem = new THREE.PMREMGenerator(gl)
      scene.environment = pmrem.fromEquirectangular(t).texture
      pmrem.dispose()
    })
    loadSky(TEX.skyNight, fallbackSkyNight).then((t) => {
      if (disposed) return
      t.colorSpace = THREE.SRGBColorSpace
      t.mapping = THREE.EquirectangularReflectionMapping
      if (nightRef.current) {
        nightRef.current.map = t
        nightRef.current.needsUpdate = true
      }
    })
    return () => {
      disposed = true
      scene.fog = null
      scene.environment = null
    }
  }, [scene, gl, fog])

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 1.2)
    const targetOpacity = night ? 1 : 0
    if (nightRef.current)
      nightRef.current.opacity = THREE.MathUtils.lerp(nightRef.current.opacity, targetOpacity, k)
    fog.color.lerp(night ? NIGHT_FOG : DAY_FOG, k)
    // на высоте (fly-режим, аэровиды) дымка ослабевает
    const alt = THREE.MathUtils.clamp(1 - (playerPos.y - 25) / 140, 0.22, 1)
    fog.density = THREE.MathUtils.lerp(fog.density, (night ? 0.0072 : 0.0055) * alt, k)
  })

  return (
    <group>
      <mesh scale={[-1, 1, 1]} rotation={[0, Math.PI / 2, 0]} frustumCulled={false}>
        <sphereGeometry args={[900, 48, 24]} />
        <meshBasicMaterial ref={dayRef} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      <mesh scale={[-1.01, 1.01, 1.01]} rotation={[0, Math.PI / 2, 0]} frustumCulled={false} renderOrder={1}>
        <sphereGeometry args={[900, 48, 24]} />
        <meshBasicMaterial
          ref={nightRef}
          side={THREE.BackSide}
          fog={false}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/** Sun + ambient + moving lamp point lights at night. */
export function Lights() {
  const night = useTour((s) => s.night)
  const quality = useTour((s) => s.quality)
  const stage = useTour((s) => s.stage)
  const sunRef = useRef<THREE.DirectionalLight>(null!)
  const hemiRef = useRef<THREE.HemisphereLight>(null!)
  const moonRef = useRef<THREE.DirectionalLight>(null!)
  const lampLights = useRef<THREE.PointLight[]>([])
  const lamps = useMemo(() => lampPositions(SEGMENTS[stage]), [stage])

  useFrame((_, delta) => {
    const k = Math.min(1, delta * 1.5)
    const sun = sunRef.current
    if (sun) {
      sun.intensity = THREE.MathUtils.lerp(sun.intensity, night ? 0 : 2.6, k)
      // sun follows player so the tight shadow camera stays useful
      sun.position.set(playerPos.x + 34, 78, playerPos.z - 26)
      sun.target.position.set(playerPos.x, 0, playerPos.z)
      sun.target.updateMatrixWorld()
    }
    if (moonRef.current)
      moonRef.current.intensity = THREE.MathUtils.lerp(moonRef.current.intensity, night ? 0.25 : 0, k)
    if (hemiRef.current)
      hemiRef.current.intensity = THREE.MathUtils.lerp(
        hemiRef.current.intensity,
        night ? NIGHT_AMBIENT : DAY_AMBIENT,
        k,
      )
    // move the small pool of real point lights to the lamps nearest the player
    const nearest = [...lamps]
      .sort(
        (a, b) =>
          Math.hypot(a.x - playerPos.x, a.z - playerPos.z) -
          Math.hypot(b.x - playerPos.x, b.z - playerPos.z),
      )
      .slice(0, lampLights.current.length)
    lampLights.current.forEach((l, i) => {
      if (!l) return
      const target = nearest[i]
      if (target) l.position.set(target.x, target.y + 7.6, target.z)
      l.intensity = THREE.MathUtils.lerp(l.intensity, night ? 55 : 0, k)
    })
  })

  const lightCount = quality === 'high' ? 4 : 2

  return (
    <group>
      <hemisphereLight ref={hemiRef} args={['#cfe0ee', '#5a6a52', DAY_AMBIENT]} />
      <directionalLight
        ref={sunRef}
        color="#fff2dc"
        intensity={2.6}
        castShadow
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={moonRef} position={[-30, 60, 100]} color="#8fa5c8" intensity={0} />
      {Array.from({ length: lightCount }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            if (el) lampLights.current[i] = el
          }}
          color="#ffb765"
          intensity={0}
          distance={26}
          decay={1.8}
        />
      ))}
    </group>
  )
}
