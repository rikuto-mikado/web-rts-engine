import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react'
import { PLAYER, type GameEngine } from '../game/engine'
import type { GameRenderer } from '../render/GameRenderer'
import { panelFold } from './panelState'

const R = 50 // how far the knob travels from the centre, in px
const DEAD = 0.2
/** A touch shorter than this that barely moves is a tap (it toggles the commander's view), not a push. */
const TAP_MS = 220
const TAP_PX = 10

/**
 * A thumb stick for phones and tablets. A quick tap turns the commander's view (behind and
 * above the army) on or off; push it to steer the selected army directly
 * (direction is relative to the camera, so "up" always marches into the
 * screen). While the stick is held the camera glides after the army; drag the
 * map with the other hand to look around freely, touch the stick again to snap
 * back. Letting go halts the army where it stands.
 */
export function Joystick({
  engine,
  renderer,
  armyId,
  followRef,
  chase,
  onToggleChase,
}: {
  engine: GameEngine
  renderer: GameRenderer
  armyId: string
  followRef: MutableRefObject<string | null>
  chase: boolean
  onToggleChase: () => void
}) {
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false })
  const vec = useRef({ x: 0, y: 0 })
  const pointer = useRef<number | null>(null)
  const steered = useRef(false)
  const baseRef = useRef<HTMLDivElement>(null)
  // Where and when the touch began, and whether it has moved far enough to be a push.
  const down = useRef({ x: 0, y: 0, t: 0, moved: false })

  // Steer the army directly: push it the way the stick points (relative to the camera, so "up"
  // marches into the screen; in the commander's view that is straight ahead), as hard as it is pushed.
  const push = (sx: number, sy: number) => {
    const a = engine.army(armyId)
    if (!a || a.faction !== PLAYER || a.vassalOf || a.status === 'retreating') return
    const mag = Math.min(1, Math.hypot(sx, sy))
    if (mag < DEAD) {
      engine.steerArmy(a.id, 0, 0, 0)
      return
    }
    // Screen right / up in world terms (see RTSCamera.update).
    const yaw = renderer.cam.yaw
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    engine.steerArmy(a.id, rx * sx - fx * sy, rz * sx - fz * sy, (mag - DEAD) / (1 - DEAD))
    steered.current = true
  }
  // While the stick is held, keep pushing (the camera turns behind the army, so the same push turns it on).
  useEffect(() => {
    if (!knob.on) return
    const t = window.setInterval(() => {
      // Hold off a moment: a quick tap toggles the view and must not jolt the army.
      if (!down.current.moved && performance.now() - down.current.t < TAP_MS) return
      push(vec.current.x, vec.current.y)
    }, 60)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knob.on, engine, renderer, armyId])
  const update = (e: RPointerEvent) => {
    const el = baseRef.current
    if (!el) return
    const b = el.getBoundingClientRect()
    let dx = e.clientX - (b.left + b.width / 2)
    let dy = e.clientY - (b.top + b.height / 2)
    const d = Math.hypot(dx, dy)
    if (d > R) {
      dx = (dx / d) * R
      dy = (dy / d) * R
    }
    vec.current = { x: dx / R, y: dy / R }
    if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > TAP_PX) down.current.moved = true
    setKnob({ x: dx, y: dy, on: true })
  }
  const release = () => {
    // A quick tap: the commander's view on or off.
    if (pointer.current !== null && !down.current.moved && !steered.current && performance.now() - down.current.t < TAP_MS) onToggleChase()
    pointer.current = null
    vec.current = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0, on: false })
    // Let go: the army rolls to a halt by itself (unless it was only a tap to bring the camera back).
    if (steered.current) engine.steerArmy(armyId, 0, 0, 0)
    steered.current = false
  }

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 z-30 p-5" style={{ paddingLeft: 'max(20px, env(safe-area-inset-left))', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
      <div
        ref={baseRef}
        className={`pointer-events-auto relative grid size-[128px] touch-none place-items-center rounded-full border border-gold-300/40 bg-black/25 backdrop-blur-[2px] transition-opacity ${knob.on ? 'opacity-95' : 'opacity-60'}`}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          pointer.current = e.pointerId
          down.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }
          // Touching the stick brings the camera back to the army, and folds the panel out of the way.
          followRef.current = armyId
          panelFold.set(true)
          update(e)
        }}
        onPointerMove={(e) => pointer.current === e.pointerId && update(e)}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={() => pointer.current !== null && release()}
      >
        {/* Four faint marks for the directions; a ring lit while the commander's view is on. */}
        <span className={`absolute inset-[-5px] rounded-full border-2 transition-colors ${chase ? 'border-gold-300/80 shadow-[0_0_10px_rgb(230_190_90/0.45)]' : 'border-transparent'}`} />
        <span className={`absolute -top-6 whitespace-nowrap rounded bg-black/55 px-1.5 py-px font-display text-[10px] tracking-wider ${chase ? 'text-gold-200' : 'text-ink-300'}`}>
          {chase ? 'Commander view' : 'Tap: commander view'}
        </span>
        {[0, 90, 180, 270].map((r) => (
          <span key={r} className="absolute h-3 w-[2px] rounded bg-gold-200/40" style={{ transform: `rotate(${r}deg) translateY(-52px)` }} />
        ))}
        <span
          className="size-[56px] rounded-full border border-gold-200/70 bg-gradient-to-b from-gold-300/80 to-gold-600/70 shadow-[0_2px_8px_rgb(0_0_0/0.5)]"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)`, transition: knob.on ? 'none' : 'transform 0.15s ease-out' }}
        />
      </div>
    </div>
  )
}
