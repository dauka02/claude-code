import { Suspense, lazy } from 'react'
import { Canvas } from '@react-three/fiber'
import Terrain from './scene/Terrain'
import Water from './scene/Water'
import Roads from './scene/Roads'
import LRT from './scene/LRT'
import Buildings from './scene/Buildings'
import Vegetation from './scene/Vegetation'
import AlleyPlay from './scene/AlleyPlay'
import Life from './scene/Life'
import Quarters from './quarters/Quarters'
import { Effects, Sky, Sun } from './scene/Atmo'
import Controls from './controls/Controls'
import UI from './ui/UI'
import { DEBUG, useApp } from './store/useAppStore'

const Perf = lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf })))

export default function App() {
  const quality = useApp((s) => s.quality)
  return (
    <div className="app">
      <Canvas
        shadows={quality !== 'low' ? 'soft' : false}
        dpr={quality === 'high' ? [1, 1.5] : quality === 'med' ? [1, 1.25] : 0.75}
        camera={{ fov: 62, near: 0.3, far: 5200 }}
        gl={{ antialias: quality === 'low', powerPreference: 'high-performance' }}
        onCreated={(state) => {
          if (DEBUG) (window as unknown as { __gl: unknown }).__gl = state.gl
        }}
      >
        <Sky />
        <Sun />
        <Suspense fallback={null}>
          <Terrain />
          <Water />
          <Roads />
          <LRT />
          <Buildings />
          <Vegetation />
          <AlleyPlay />
          <Life />
          <Quarters />
        </Suspense>
        <Controls />
        <Effects />
        {DEBUG && (
          <Suspense fallback={null}>
            <Perf position="bottom-left" />
          </Suspense>
        )}
      </Canvas>
      <UI />
    </div>
  )
}
