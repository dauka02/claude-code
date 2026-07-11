import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import type { PointerLockControls as PLCImpl } from 'three-stdlib'
import { ALM, arcOf, heightAt, inWater, quarterAt, spineAt, L } from '../data/geo'
import { playerPos, teleport, useApp } from '../store/useAppStore'

const EYE = 1.7
const keys = new Set<string>()

export default function Controls() {
  const { camera, gl } = useThree()
  const started = useApp((s) => s.started)
  const mode = useApp((s) => s.mode)
  const setQuarter = useApp((s) => s.setQuarter)
  const setPoi = useApp((s) => s.setPoi)
  const plcRef = useRef<PLCImpl | null>(null)
  const vel = useRef(new THREE.Vector3())
  const droneSpeed = useRef(24)
  const flyT = useRef(0)
  const blend = useRef(0) // переход между режимами
  const blendFrom = useRef(new THREE.Vector3())
  const poiAcc = useRef(0)

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    const s = spineAt(40)
    camera.position.set(s.x, heightAt(s.x, s.z) + EYE, s.z)
    camera.lookAt(s.x + s.dx * 50, EYE, s.z + s.dz * 50)
  }, [camera])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        const st = useApp.getState()
        st.setMode(st.mode === 'walk' ? 'drone' : 'walk')
      }
      keys.add(e.code)
      // любой ввод прерывает облёт
      if (useApp.getState().mode === 'flyover') useApp.getState().setMode('drone')
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    const wheel = (e: WheelEvent) => {
      droneSpeed.current = THREE.MathUtils.clamp(droneSpeed.current * (e.deltaY > 0 ? 0.85 : 1.18), 10, 60)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('wheel', wheel)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('wheel', wheel)
    }
  }, [])

  // pointer lock в walk/drone
  useEffect(() => {
    if (!started) return
    if (mode === 'flyover') {
      plcRef.current?.unlock()
      flyT.current = 0
      return
    }
    blend.current = 1
    blendFrom.current.copy(camera.position)
    const t = setTimeout(() => plcRef.current?.lock(), 60)
    return () => clearTimeout(t)
  }, [started, mode, camera])

  // телепорт кликом по земле (в режиме курсора) и с миникарты
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!useApp.getState().started) return
      if (document.pointerLockElement) return
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      // пересечение с плоскостью рельефа (приближённо y=0)
      const t = -ray.ray.origin.y / ray.ray.direction.y
      if (t > 0 && t < 3500) {
        const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t)
        teleport.to = [p.x, p.z]
      }
    }
    gl.domElement.addEventListener('click', click)
    return () => gl.domElement.removeEventListener('click', click)
  }, [gl, camera])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    if (!started) {
      // ленивый дрейф на старте
      const t = state.clock.elapsedTime
      const m = 1500 + Math.sin(t * 0.03) * 900
      const s = spineAt(m)
      camera.position.set(s.x - 130, 120, s.z + 190)
      camera.lookAt(s.x + s.dx * 240, 6, s.z + s.dz * 240)
      return
    }

    // телепорт из UI
    if (teleport.to) {
      const [tx, tz] = teleport.to
      teleport.to = null
      camera.position.set(tx, heightAt(tx, tz) + (mode === 'walk' ? EYE : Math.max(camera.position.y, 40)), tz)
      vel.current.set(0, 0, 0)
    }

    const forward =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    const strafe =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)

    if (mode === 'walk') {
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight')
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      dir.y = 0
      dir.normalize()
      const right = new THREE.Vector3(-dir.z, 0, dir.x)
      const move = new THREE.Vector3().addScaledVector(dir, forward).addScaledVector(right, strafe)
      const speed = run ? 4.5 : 1.5
      vel.current.lerp(move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0), delta * 7)
      const next = camera.position.clone().addScaledVector(vel.current, delta)
      // границы сцены + вода
      next.x = THREE.MathUtils.clamp(next.x, -420, 7050)
      next.z = THREE.MathUtils.clamp(next.z, -1650, 1650)
      if (!inWater(next.x, next.z)) {
        camera.position.x = next.x
        camera.position.z = next.z
      } else if (!inWater(camera.position.x, next.z)) camera.position.z = next.z
      else if (!inWater(next.x, camera.position.z)) camera.position.x = next.x
      const ty = heightAt(camera.position.x, camera.position.z) + EYE
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, Math.min(1, delta * 9))
    } else if (mode === 'drone') {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
      const move = new THREE.Vector3().addScaledVector(dir, forward).addScaledVector(right, strafe)
      if (keys.has('KeyE') || keys.has('Space')) move.y += 1
      if (keys.has('KeyQ') || keys.has('KeyC')) move.y -= 1
      const speed = droneSpeed.current * (keys.has('ShiftLeft') ? 1.8 : 1)
      vel.current.lerp(move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0), delta * 4)
      camera.position.addScaledVector(vel.current, delta)
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 2, 500)
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -800, 7400)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -2000, 2000)
    } else {
      // кинематографичный облёт запад→восток, ~90 сек
      flyT.current += delta / 90
      if (flyT.current >= 1) {
        useApp.getState().setMode('drone')
      } else {
        const e = flyT.current < 0.5 ? 2 * flyT.current * flyT.current * (1.5 - flyT.current) : flyT.current
        const m = THREE.MathUtils.smoothstep(e, 0, 1) * 0.98 * L
        const s = spineAt(m)
        const h = 55 + Math.sin(flyT.current * Math.PI * 3) * 20
        const side = Math.sin(flyT.current * Math.PI * 2) * 130
        camera.position.lerp(new THREE.Vector3(s.x - s.dx * 60 - s.dz * side, h, s.z - s.dz * 60 + s.dx * side), Math.min(1, delta * 3))
        const ahead = spineAt(Math.min(m + 260, L))
        camera.lookAt(ahead.x, 4, ahead.z)
      }
    }

    // плавный вход в режим
    if (blend.current > 0) {
      blend.current = Math.max(0, blend.current - delta)
    }

    playerPos.x = camera.position.x
    playerPos.y = camera.position.y
    playerPos.z = camera.position.z

    // квартал + POI
    poiAcc.current += delta
    if (poiAcc.current > 0.25) {
      poiAcc.current = 0
      const { m } = arcOf(camera.position.x, camera.position.z)
      setQuarter(quarterAt(m))
      let found: string | null = null
      const rad = mode === 'walk' ? 30 : 90
      for (const p of ALM.pois) {
        if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < rad) {
          found = p.id
          break
        }
      }
      setPoi(found)
    }
  })

  if (mode === 'flyover') return null
  return <PointerLockControls ref={plcRef} />
}
