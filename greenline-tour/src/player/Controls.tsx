import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import type { PointerLockControls as PLCImpl } from 'three-stdlib'
import {
  SEGMENTS,
  heightAt,
  inCorridor,
  inPond,
  progressAt,
  promAt,
} from '../data/geometry'
import { playerPos, useTour, isTouch } from '../store'

export const EYE = 1.7
const WALK = 2.0
const RUN = 4.0
const FLY = 12

/** Мобильный ввод: пишет ui/TouchControls, читает контроллер. */
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
  const stage = useTour((s) => s.stage)
  const fly = useTour((s) => s.fly)
  const setFly = useTour((s) => s.setFly)
  const setProgress = useTour((s) => s.setProgress)
  const plcRef = useRef<PLCImpl | null>(null)
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const portalCooldown = useRef(0)
  const fadeDir = useRef(0)
  const skipSpawn = useRef(false)

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  // dev-хук: #cam=x,y,z,yaw,pitch — поставить камеру (скриншоты/сверка с генпланом)
  useEffect(() => {
    const apply = () => {
      const m = location.hash.match(/cam=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/)
      if (!m) return
      const [x, y, z, cy, cp] = m.slice(1).map(Number)
      useTour.getState().setFly(true)
      camera.position.set(x, y, z)
      camera.rotation.set(cp, cy, 0)
      yaw.current = cy
      pitch.current = cp
    }
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [camera])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat) setFly(!useTour.getState().fly)
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

  // спавн при старте и при смене сегмента
  useEffect(() => {
    if (!started) return
    if (skipSpawn.current) {
      skipSpawn.current = false
      return
    }
    const seg = SEGMENTS[stage]
    // точка выхода задаётся порталом (teleport), иначе — вход сегмента
    const spawnM = stage === 's2b' ? seg.lengthM - 12 : stage === 's2a' ? 12 : seg.lengthM - 10
    const p = promAt(seg, spawnM)
    camera.position.set(p.x, heightAt(seg, p.x, p.z) + EYE, p.z)
    // смотреть вдоль бульвара к центру (yaw +π/2 = на запад, −π/2 = на восток)
    camera.rotation.set(0, spawnM > seg.lengthM / 2 ? Math.PI / 2 : -Math.PI / 2, 0)
    yaw.current = camera.rotation.y
    pitch.current = 0
    vel.current.set(0, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, stage, camera])

  useEffect(() => {
    if (started && !isTouch) {
      const t = setTimeout(() => plcRef.current?.lock(), 50)
      return () => clearTimeout(t)
    }
  }, [started, gl, stage])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const seg = SEGMENTS[stage]
    const st = useTour.getState()

    if (!started) {
      const t = state.clock.elapsedTime
      const m = (seg.lengthM * (0.5 + Math.sin(t * 0.04) * 0.35)) % seg.lengthM
      const p = promAt(seg, m)
      camera.position.set(p.x - 20, 26, p.z + 30)
      camera.lookAt(p.x + 40, 2, p.z - 10)
      return
    }

    // затемнение при телепорте
    if (fadeDir.current !== 0) {
      const f = THREE.MathUtils.clamp(st.fade + fadeDir.current * delta * 2.4, 0, 1)
      st.setFade(f)
      if (f >= 1 && fadeDir.current > 0) fadeDir.current = -1
      if (f <= 0 && fadeDir.current < 0) fadeDir.current = 0
    }

    if (isTouch) {
      yaw.current -= touchInput.lookDX * 0.0032
      pitch.current = THREE.MathUtils.clamp(pitch.current - touchInput.lookDY * 0.0032, -1.35, 1.35)
      touchInput.lookDX = 0
      touchInput.lookDY = 0
      camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ')
    }

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
      move.addScaledVector(dir, forward)
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize()
      move.addScaledVector(right, strafe)
      if (keys.has('Space')) move.y += 1
      if (keys.has('KeyC')) move.y -= 1
      const speed = running ? FLY * 2.2 : FLY
      vel.current.lerp(move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0), delta * 6)
      camera.position.addScaledVector(vel.current, delta)
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 1.2, 240)
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, seg.bounds.minX - 140, seg.bounds.maxX + 500)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, seg.bounds.minZ - 140, seg.bounds.maxZ + 140)
    } else {
      dir.y = 0
      dir.normalize()
      const right = new THREE.Vector3(-dir.z, 0, dir.x)
      move.addScaledVector(dir, forward).addScaledVector(right, strafe)
      const speed = running ? RUN : WALK
      vel.current.lerp(move.normalize().multiplyScalar(move.lengthSq() > 0 ? speed : 0), delta * 8)
      const next = camera.position.clone().addScaledVector(vel.current, delta)
      // держим игрока в коридоре (полоса + рукав)
      if (!inCorridor(seg, next.x, next.z, 0)) {
        // мягко скользим вдоль границы
        if (inCorridor(seg, camera.position.x, next.z, 0)) next.x = camera.position.x
        else if (inCorridor(seg, next.x, camera.position.z, 0)) next.z = camera.position.z
        else {
          next.x = camera.position.x
          next.z = camera.position.z
        }
      }
      if (!inPond(seg, next.x, next.z, 0.8)) {
        camera.position.x = next.x
        camera.position.z = next.z
      } else if (!inPond(seg, camera.position.x, next.z, 0.8)) {
        camera.position.z = next.z
      } else if (!inPond(seg, next.x, camera.position.z, 0.8)) {
        camera.position.x = next.x
      }
      const targetY = heightAt(seg, camera.position.x, camera.position.z) + EYE
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, Math.min(1, delta * 10))
    }

    playerPos.x = camera.position.x
    playerPos.y = camera.position.y
    playerPos.z = camera.position.z
    const pr = progressAt(seg, camera.position.x, camera.position.z)
    setProgress(pr.m, pr.onBranch)

    // порталы между этапами
    portalCooldown.current = Math.max(0, portalCooldown.current - delta)
    if (portalCooldown.current === 0 && !fly) {
      for (const p of seg.portals) {
        if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 2.2) {
          portalCooldown.current = 3
          fadeDir.current = 1
          const target = SEGMENTS[p.to]
          const at = promAt(target, p.at === 0 ? 8 : Math.min(p.at, target.lengthM) - 8)
          setTimeout(() => {
            skipSpawn.current = true
            useTour.getState().setStage(p.to)
            camera.position.set(at.x, heightAt(target, at.x, at.z) + EYE, at.z)
            camera.rotation.set(0, p.at === 0 ? -Math.PI / 2 : Math.PI / 2, 0)
          }, 450)
          break
        }
      }
    }
  })

  if (isTouch) return null
  return <PointerLockControls ref={plcRef} />
}
