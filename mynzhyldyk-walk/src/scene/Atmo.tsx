import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { fbSky, TEX } from './assets'
import { playerPos, useApp } from '../store/useAppStore'

/** Небо (панорама Higgsfield или градиент), солнце 35° с юго-запада, дымка. */
export function Sky() {
  const { scene, gl } = useThree()
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  const fog = useMemo(() => new THREE.Fog(new THREE.Color('#dfd8c2'), 400, 2600), [])

  useEffect(() => {
    scene.fog = fog
    let disposed = false
    const apply = (t: THREE.Texture) => {
      if (disposed) return
      t.colorSpace = THREE.SRGBColorSpace
      t.mapping = THREE.EquirectangularReflectionMapping
      if (matRef.current) {
        matRef.current.map = t
        matRef.current.needsUpdate = true
      }
      const pmrem = new THREE.PMREMGenerator(gl)
      scene.environment = pmrem.fromEquirectangular(t).texture
      pmrem.dispose()
    }
    new THREE.TextureLoader().load(TEX.sky, apply, undefined, () => apply(fbSky()))
    return () => {
      disposed = true
      scene.fog = null
      scene.environment = null
    }
  }, [scene, gl, fog])

  return (
    <mesh scale={[-1, 1, 1]} rotation={[0, Math.PI / 2, 0]} frustumCulled={false}>
      <sphereGeometry args={[3800, 48, 24]} />
      <meshBasicMaterial ref={matRef} side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  )
}

export function Sun() {
  const quality = useApp((s) => s.quality)
  const ref = useRef<THREE.DirectionalLight>(null!)
  useFrame(() => {
    const l = ref.current
    if (!l) return
    // солнце ~35°, юго-запад; следует за игроком ради плотной shadow-камеры
    l.position.set(playerPos.x - 160, 195, playerPos.z + 200)
    l.target.position.set(playerPos.x, 0, playerPos.z)
    l.target.updateMatrixWorld()
  })
  return (
    <group>
      <hemisphereLight args={['#cfe0ee', '#8a8468', 0.5]} />
      <directionalLight
        ref={ref}
        color="#ffe8c4"
        intensity={2.7}
        castShadow={quality !== 'low'}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-near={20}
        shadow-camera-far={700}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </group>
  )
}

export function Effects() {
  const quality = useApp((s) => s.quality)
  if (quality === 'low') return null
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom mipmapBlur intensity={0.35} luminanceThreshold={1.05} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.24} darkness={0.55} />
    </EffectComposer>
  )
}
