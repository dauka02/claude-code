import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useTour } from '../store'

/** Subtle bloom (lamps, windows, beacons) + vignette. Disabled on Low. */
export default function Effects() {
  const quality = useTour((s) => s.quality)
  if (quality !== 'high') return null
  return (
    <EffectComposer multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={0.55}
        luminanceThreshold={1.0}
        luminanceSmoothing={0.25}
      />
      <Vignette eskil={false} offset={0.22} darkness={0.62} />
    </EffectComposer>
  )
}
