import { useRef } from 'react'
import type React from 'react'
import { touchInput } from '../player/Controls'
import { isTouch, useTour } from '../store'

/**
 * Mobile input: virtual joystick (left half) + drag-to-look (right half).
 * Writes into the shared touchInput object read by the player controller.
 */
export default function TouchControls() {
  const started = useTour((s) => s.started)
  const joyRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const joyId = useRef<number | null>(null)
  const lookId = useRef<number | null>(null)
  const joyCenter = useRef({ x: 0, y: 0 })
  const lastLook = useRef({ x: 0, y: 0 })

  if (!isTouch || !started) return null

  const onJoyDown = (e: React.PointerEvent) => {
    joyId.current = e.pointerId
    joyCenter.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onJoyMove = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return
    const dx = e.clientX - joyCenter.current.x
    const dy = e.clientY - joyCenter.current.y
    const r = 48
    const len = Math.hypot(dx, dy) || 1
    const cl = Math.min(len, r)
    touchInput.moveX = (dx / len) * (cl / r)
    touchInput.moveY = (dy / len) * (cl / r)
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`
  }
  const onJoyUp = (e: React.PointerEvent) => {
    if (e.pointerId !== joyId.current) return
    joyId.current = null
    touchInput.moveX = 0
    touchInput.moveY = 0
    if (knobRef.current) knobRef.current.style.transform = 'translate(0,0)'
  }

  const onLookDown = (e: React.PointerEvent) => {
    lookId.current = e.pointerId
    lastLook.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onLookMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookId.current) return
    touchInput.lookDX += e.clientX - lastLook.current.x
    touchInput.lookDY += e.clientY - lastLook.current.y
    lastLook.current = { x: e.clientX, y: e.clientY }
  }
  const onLookUp = (e: React.PointerEvent) => {
    if (e.pointerId === lookId.current) lookId.current = null
  }

  return (
    <>
      <div
        className="touch-look"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />
      <div
        className="touch-joy"
        ref={joyRef}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      >
        <div className="touch-joy-base">
          <div className="touch-joy-knob" ref={knobRef} />
        </div>
      </div>
    </>
  )
}
