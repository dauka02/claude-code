import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import Boulevard from './world/Boulevard'
import Vegetation from './world/Vegetation'
import Water from './world/Water'
import Buildings from './world/Buildings'
import Props from './world/Props'
import Effects from './world/Effects'
import { Lights, SkyAndFog } from './world/Atmosphere'
import Controls from './player/Controls'
import InfoPoints from './ui/InfoPoints'
import HUD from './ui/HUD'
import TouchControls from './ui/TouchControls'
import { useTour } from './store'

export default function App() {
  const quality = useTour((s) => s.quality)
  return (
    <div className="app">
      <Canvas
        shadows={quality === 'high'}
        dpr={quality === 'high' ? [1, 1.5] : 1}
        camera={{ fov: 70, near: 0.1, far: 1800 }}
        gl={{ antialias: quality !== 'high', powerPreference: 'high-performance' }}
      >
        <SkyAndFog />
        <Lights />
        <Suspense fallback={null}>
          <Boulevard />
          <Vegetation />
          <Water />
          <Buildings />
          <Props />
          <InfoPoints />
        </Suspense>
        <Controls />
        <Effects />
      </Canvas>
      <HUD />
      <TouchControls />
    </div>
  )
}
