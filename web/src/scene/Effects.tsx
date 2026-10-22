// Optional bloom. Scene.tsx lazy-loads this module only when store.quality === 'high', so the
// postprocessing bundle never ships on the default 'medium' path.
import { Bloom, EffectComposer } from '@react-three/postprocessing'

export default function Effects() {
  return (
    <EffectComposer multisampling={4}>
      {/* threshold 0.9: at 0.72 the lit concrete and the light pools hazed over; LEDs, glows and screens still bloom */}
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
    </EffectComposer>
  )
}
