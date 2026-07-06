import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import type { PointerLockControls as PLCImpl } from 'three-stdlib'
import { HALF_W, LENGTH, heightAt, inPond, pathXAt } from '../world/constants'
import { playerPos, useTour, isTouch } from '../store'

export const EYE = 1.7
const WALK = 2.0
const RUN = 4.0
const FLY = 12

/** Shared mobile input, written by ui/TouchControls, read here every frame. */
export const touchInput = {
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
}

const keys = new Set<string>()

export default function Controls() {
  const { camera, gl } = useThree()
  const started = useTour((s) => s.started)
  const fly = useTour((s) => s.fly)
  const setFly = useTour((s) => s.setFly)
  const setMeters = useTour((s) => s.setMeters)
  const plcRef = useRef<PLCImpl | null>(null)
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const pitch = useRef(0)

  // initial placement: south entrance, looking north up the boulevard
  useEffect(() => {
    const x = pathXAt(2)
    camera.position.set(x, heightAt(x, 2) + EYE, 2)
    camera.rotation.set(0, Math.PI, 0) // look toward +Z
    camera.rotation.order = 'YXZ'
    yaw.current = Math.PI
  }, [camera])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) {
        const next = !useTour.getState().fly
        setFly(next)
      }
      if (e.code === 'KeyN' && !e.repeat) useTour.getState().toggleNight()
      keys.add(e.code)
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [setFly])

  // on start: teleport from the aerial idle shot down to the south entrance
  useEffect(() => {
    if (!started) return
    const x = pathXAt(2)
    camera.position.set(x, heightAt(x, 2) + EYE, 2)
    camera.rotation.set(0, Math.PI, 0)
    yaw.current = Math.PI
    pitch.current = 0
    vel.current.set(0, 0, 0)
  }, [started, camera])

  // engage pointer lock when the tour starts (desktop only); clicking the
  // canvas re-locks after Esc (drei default behavior)
  useEffect(() => {
    if (started && !isTouch) {
      const t = setTimeout(() => plcRef.current?.lock(), 50)
      return () => clearTimeout(t)
    }
  }, [started, gl])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    if (!started) {
      // idle aerial drift on the start screen — hero-shot style
      const t = performance.now() / 1000
      const z = 40 + Math.sin(t * 0.05) * 30
      camera.position.set(pathXAt(z) + 26, 26, z)
      camera.lookAt(0, 2, z + 60)
      return
    }

    // mobile look
    if (isTouch) {
      yaw.current -= touchInput.lookDX * 0.0032
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - touchInput.lookDY * 0.0032,
        -1.35,
        1.35,
      )
      touchInput.lookDX = 0
      touchInput.lookDY = 0
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ')
    }

    // WASD / joystick input in camera space
    const forward =
      (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
      touchInput.moveY
    const strafe =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) +
      touchInput.moveX
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight')

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)

    const move = new THREE.Vector3()
    if (fly) {
      // free flight: move along the view direction
      move.addScaledVector(dir, forward)
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
      move.addScaledVector(right, strafe)
      if (keys.has('Space')) move.y += 1
      if (keys.has('KeyC')) move.y -= 1
      const speed = running ? FLY * 2.2 : FLY
      vel.current.lerp(move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0), delta * 6)
      camera.position.addScaledVector(vel.current, delta)
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1.2, 220)
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -160, 160)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -80, LENGTH + 80)
    } else {
      // grounded walk: horizontal camera basis
      dir.y = 0
      dir.normalize()
      const right = new THREE.Vector3(-dir.z, 0, dir.x)
      move.addScaledVector(dir, forward).addScaledVector(right, strafe)
      const speed = running ? RUN : WALK
      vel.current.lerp(
        move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0),
        delta * 8,
      )
      const next = camera.position.clone().addScaledVector(vel.current, delta)
      // bounds: the boulevard strip (plus plaza aprons at both ends)
      next.x = THREE.MathUtils.clamp(next.x, -(HALF_W - 1.4), HALF_W - 1.4)
      next.z = THREE.MathUtils.clamp(next.z, -10, LENGTH + 10)
      // pond collision with axis slide
      if (!inPond(next.x, next.z, 0.8)) {
        camera.position.x = next.x
        camera.position.z = next.z
      } else if (!inPond(camera.position.x, next.z, 0.8)) {
        camera.position.z = next.z
      } else if (!inPond(next.x, camera.position.z, 0.8)) {
        camera.position.x = next.x
      }
      // gentle terrain following
      const targetY = heightAt(camera.position.x, camera.position.z) + EYE
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, Math.min(1, delta * 10))
    }

    playerPos.x = camera.position.x
    playerPos.y = camera.position.y
    playerPos.z = camera.position.z
    setMeters(THREE.MathUtils.clamp(camera.position.z, 0, LENGTH))
  })

  if (isTouch) return null
  return <PointerLockControls ref={plcRef} />
}
