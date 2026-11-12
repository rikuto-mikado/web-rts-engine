import { Map as MapIcon, X } from 'lucide-react'
import { useEffect, useRef, type PointerEvent } from 'react'
import { drawShield } from '../render/heraldry'
import { glyphPaths } from '../render/glyphs'
import { paintTerrain } from './mapPaint'
import { useViewport } from './viewport'
import { PLAYER, type GameEngine } from '../game/engine'
import { RELATION_COLOR } from './common'
import { total } from '../game/troops'
import { holdingRadius } from '../game/world'
import type { GameRenderer } from '../render/GameRenderer'

const SIZE = 200

/** Top-down overview: terrain, fog, castles, armies and the camera footprint. Click to jump. */
export function Minimap({ engine, renderer, shown, setShown }: { engine: GameEngine; renderer: GameRenderer | null; shown: boolean; setShown: (v: boolean) => void }) {
  const vp = useViewport()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const bg = paintTerrain(engine.world, SIZE)
    bgRef.current = bg
  }, [engine])

  useEffect(() => {
    let raf = 0
    let last = 0
    const R = engine.visRes
    const fog = document.createElement('canvas')
    fog.width = fog.height = R
    const fctx = fog.getContext('2d')!
    const fimg = fctx.createImageData(R, R)
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 100) return
      last = now
      const cv = canvasRef.current
      const bg = bgRef.current
      if (!cv || !bg) return
      const ctx = cv.getContext('2d')!
      const world = engine.world
      const toPx = (v: number) => ((v + world.half) / world.size) * SIZE
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.drawImage(bg, 0, 0)
      for (let k = 0; k < engine.visionTex.length; k++) {
        const v = engine.visionTex[k]
        fimg.data[k * 4] = 150
        fimg.data[k * 4 + 1] = 158
        fimg.data[k * 4 + 2] = 166
        fimg.data[k * 4 + 3] = Math.round(150 * (1 - v / 255))
      }
      fctx.putImageData(fimg, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(fog, 0, 0, SIZE, SIZE)

      for (const f of Object.values(engine.state.factions)) {
        const host = f.host
        if (!host || (host.phase !== 'mustering' && host.phase !== 'gathered')) continue
        const rel = engine.relation(f.id)
        if (rel !== 'enemy' && rel !== 'ally') continue
        ctx.strokeStyle = rel === 'enemy' ? `rgba(255,80,60,${0.5 + Math.sin(now / 200) * 0.3})` : 'rgba(79,209,197,0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(toPx(host.rallyX), toPx(host.rallyZ), 7, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (const c of engine.state.castles) {
        if (c.faction !== 'player' && !engine.isExplored(c.x, c.z)) continue
        const x = toPx(c.x)
        const y = toPx(c.z)
        const r = Math.max(world.size > 3000 ? 2.6 : 3.5, (holdingRadius(c) / world.size) * SIZE * 0.9)
        ctx.fillStyle = engine.factionColor(c.faction)
        ctx.strokeStyle = c.battleId && Math.floor(now / 300) % 2 ? '#fff' : RELATION_COLOR[engine.relation(c.faction)]
        ctx.lineWidth = 1.5
        const mine = c.faction === 'player'
        if (c.village) {
          // Villages: small marks; castles: their shields.
          const rr = Math.min(r, 2.6)
          ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2)
          ctx.strokeRect(x - rr, y - rr, rr * 2, rr * 2)
          continue
        }
        const rank = engine.seatRank(c)
        drawShield(ctx, x, y, Math.max(9, r * 2.3) * (rank === 'royal' ? 1.35 : rank === 'lord' ? 1.1 : 1), engine.factionColor(c.faction), rank)
        if (c.battleId && Math.floor(now / 300) % 2) {
          ctx.strokeStyle = mine ? '#ff6a4d' : '#fff'
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(x, y, Math.max(7, r * 1.8), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      for (const a of engine.state.armies) {
        const rel = engine.relation(a.faction)
        if (!engine.canSee(engine.team(PLAYER), a)) continue
        const x = toPx(a.x)
        const y = toPx(a.z)
        const r = (rel === 'self' ? 2 : 1.5) + Math.min(3, Math.sqrt(total(a.troops)) / 12)
        ctx.fillStyle = rel === 'self' ? '#9cc0ff' : rel === 'ally' ? '#8ee6dc' : '#ff8a70'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#0b0c0e'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // The Usurper's last known whereabouts: a pulsing crown.
      const sight = engine.state.foeSighting
      if (sight && engine.foeRoyal()) {
        const x = toPx(sight.x)
        const y = toPx(sight.z)
        const pulse = 5 + Math.sin(now / 250) * 1.5
        ctx.strokeStyle = '#e0455a'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(x, y, pulse + 3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.save()
        ctx.translate(x - 6, y - 6)
        ctx.scale(0.5, 0.5)
        ctx.strokeStyle = '#f2c75a'
        ctx.lineWidth = 2.6
        ctx.lineJoin = 'round'
        ctx.stroke(new Path2D(glyphPaths('crown').s!))
        ctx.restore()
      }
      if (renderer) {
        const fp = renderer.footprint()
        ctx.strokeStyle = 'rgba(246,227,168,0.9)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        fp.forEach(([x, z], i) => (i ? ctx.lineTo(toPx(x), toPx(z)) : ctx.moveTo(toPx(x), toPx(z))))
        ctx.closePath()
        ctx.stroke()
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [engine, renderer])

  const jump = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!renderer || (e.pointerType === 'mouse' && e.buttons !== 1)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const world = engine.world
    const x = ((e.clientX - rect.left) / rect.width) * world.size - world.half
    const z = ((e.clientY - rect.top) / rect.height) * world.size - world.half
    renderer.cam.focus(x, z)
  }

  if (vp.compact && !shown) {
    return (
      <button className="panel btn safe-bottom pointer-events-auto absolute right-2 bottom-2 z-20 h-12 w-12 px-0" onClick={() => setShown(true)} title="Show map">
        <MapIcon size={16} />
      </button>
    )
  }
  const size = vp.compact ? (vp.phone ? 132 : 160) : SIZE
  return (
    <div
      className={`panel pointer-events-auto absolute z-20 rounded-md p-1.5 ${vp.compact ? 'safe-bottom right-2 bottom-2' : 'right-3 bottom-3'}`}
      onDoubleClick={() => vp.compact && setShown(false)}
    >
      {vp.compact && (
        <button className="absolute -top-2 -left-2 z-10 grid size-7 place-items-center rounded-full bg-ink-800 text-ink-200 ring-1 ring-black" onClick={() => setShown(false)} title="Hide map">
          <X size={14} />
        </button>
      )}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="block cursor-crosshair touch-none rounded-sm"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          jump(e)
        }}
        onPointerMove={(e) => e.buttons && jump(e)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
