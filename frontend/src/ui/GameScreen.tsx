import { Skull, Trophy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { PLAYER, TICK, type GameEngine } from '../game/engine'
import { fmt } from '../game/troops'
import type { ChronicleEntry } from '../game/types'
import { GameRenderer, type Selection } from '../render/GameRenderer'
import { ChronicleLog, Toasts } from './Chronicle'
import { FormArmyModal } from './FormArmyModal'
import { HelpOverlay } from './HelpOverlay'
import { HoldingsBar } from './HoldingsBar'
import { TraitChoice } from './TraitChoice'
import { Minimap } from './Minimap'
import { SelectionPanel } from './SelectionPanel'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useViewport } from './viewport'
import { loadOverhead, saveOverhead } from './viewPref'

export interface Match {
  /** Server-side record of this match (results and battle reports); null if it could not be created. */
  id: string | null
  name: string
  engine: GameEngine
}

interface Props {
  match: Match
  onExit: () => void
}

/** One war, played start to finish. There is no saving: it ends in victory or defeat. */
export function GameScreen({ match, onExit }: Props) {
  const engine = match.engine
  const hostRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [renderer, setRenderer] = useState<GameRenderer | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [formArmy, setFormArmy] = useState<{ castleId?: string; targetId?: string } | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [fresh, setFresh] = useState<ChronicleEntry[]>([])
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [gfxError, setGfxError] = useState<string | null>(null)
  const [gfxLost, setGfxLost] = useState(false)
  const lostRef = useRef(false)
  const [overhead, setOverhead] = useState(loadOverhead)
  const overheadRef = useRef(overhead)
  const toggleView = useCallback(() => {
    setOverhead((v) => {
      const next = !v
      overheadRef.current = next
      saveOverhead(next)
      return next
    })
  }, [])
  useEffect(() => {
    renderer?.setOverhead(overhead)
  }, [renderer, overhead])
  const vp = useViewport()
  const [sidebarOpen, setSidebarOpen] = useState(() => !vp.compact)
  const [orderMode, setOrderMode] = useState(false)
  const orderModeRef = useRef(false)
  useEffect(() => {
    orderModeRef.current = orderMode
  }, [orderMode])

  // The war runs at one steady pace; it only holds still while a full-screen dialog is open.
  const modalRef = useRef(false)
  useEffect(() => {
    modalRef.current = !!formArmy || showHelp || confirmLeave
  }, [formArmy, showHelp, confirmLeave])

  const toast = useCallback((msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash((m) => (m === msg ? null : m)), 2600)
  }, [])

  /** Store the final result on the server (fire and forget). */
  const recordResult = useCallback(() => {
    if (!match.id) return
    const st = engine.state
    const t = engine.totals(PLAYER)
    api
      .saveCampaign(match.id, {
        game_time: st.time,
        status: st.status,
        summary: {
          castles: st.castles.filter((c) => c.faction === PLAYER).length,
          power: Math.round(t.totalPower),
          battlesWon: st.stats.battlesWon,
          battlesLost: st.stats.battlesLost,
          enemyKilled: Math.round(st.stats.enemyKilled),
          castlesTaken: st.stats.castlesTaken,
        },
      })
      .catch(() => {})
  }, [engine, match.id])

  const select = useCallback(
    (s: Selection, focus = false) => {
      setSelection(s)
      setOrderMode(false)
      if (!renderer) return
      renderer.selection = s
      if (focus && s) {
        const p = s.kind === 'army' ? engine.army(s.id) : s.kind === 'castle' ? engine.castle(s.id) : engine.outpost(s.id)
        if (p) renderer.cam.focus(p.x, p.z)
      }
    },
    [renderer, engine],
  )

  // On phones the selection sheet covers the lower half: keep the view centred above it.
  useEffect(() => {
    if (!renderer) return
    renderer.setBottomInset(vp.compact && selection ? Math.min(vp.h * 0.52, 460) : 0)
  }, [renderer, vp.compact, vp.h, selection])

  // Renderer + main loop.
  useEffect(() => {
    const host = hostRef.current
    const overlay = overlayRef.current
    if (!host || !overlay) return
    let r: GameRenderer
    try {
      r = new GameRenderer(host, overlay, engine)
      // Dev builds only: lets browser tests fast-forward the war.
      if (import.meta.env.DEV) Object.assign(window, { __warbox: engine, __warboxRenderer: r })
    } catch (e) {
      setGfxError((e as Error).message || 'WebGL could not start.')
      return
    }
    r.onContextChange = (lost) => {
      lostRef.current = lost
      setGfxLost(lost)
    }
    r.setOverhead(overheadRef.current)
    setRenderer(r)
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastNotify = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // The war holds still while the graphics are being restored.
      if (!lostRef.current && !modalRef.current && engine.state.status === 'active') {
        acc += dt
        let steps = 0
        while (acc >= TICK && steps < 60) {
          engine.step(TICK)
          acc -= TICK
          steps++
        }
      }
      if (engine.events.length) {
        const evs = engine.events
        engine.events = []
        r.pushEvents(evs)
        const entries: ChronicleEntry[] = []
        for (const ev of evs) {
          if (ev.type === 'chronicle') entries.push(ev.entry)
          else if (ev.type === 'battle_end' && match.id) api.postReport(match.id, ev.report).catch(() => {})
          else if (ev.type === 'game_over') {
            setGameOver(ev.status)
            recordResult()
          }
        }
        if (entries.length) setFresh(entries)
      }
      if (now - lastNotify > 200) {
        lastNotify = now
        engine.notify()
      }
      r.render(dt)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      r.dispose()
    }
  }, [engine, match.id, recordResult])

  // Mouse input on the map.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !renderer) return
    type Down = { x: number; y: number; button: number; grab: { x: number; z: number } | null; dragging: boolean; touch: boolean; consumed: boolean }
    let down: Down | null = null
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; angle: number; mx: number; my: number } | null = null
    let longPress = 0

    /** Give the selected player army an order at a screen point (right-click, long-press, or tap in order mode). */
    const issueOrder = (clientX: number, clientY: number): boolean => {
      const sel = renderer.selection
      if (sel?.kind !== 'army') return false
      const army = engine.army(sel.id)
      if (!army || army.faction !== PLAYER) return false
      if (army.vassalOf) {
        toast('Village militia act on their own and cannot be given orders.')
        return true
      }
      if (army.status === 'retreating') {
        toast('This army is retreating and will not answer orders.')
        return true
      }
      const target = renderer.pick(clientX, clientY)
      const g = renderer.groundAt(clientX, clientY)
      if (target?.kind === 'army') {
        const t = engine.army(target.id)
        if (t && engine.isHostile(t.faction, PLAYER)) {
          engine.orderArmy(army.id, { type: 'intercept', armyId: t.id })
          renderer.spawnClickMarker(t.x, t.z, 0xff5a3c)
          return true
        }
        if (t && t.faction === PLAYER && t.id !== army.id) {
          engine.orderArmy(army.id, { type: 'join', armyId: t.id })
          renderer.spawnClickMarker(t.x, t.z, 0x9cc0ff)
          toast(`${army.name} will merge into ${t.name}.`)
          return true
        }
      }
      if (target?.kind === 'site') {
        const site = engine.site(target.id)!
        if ((army.troops.engineers ?? 0) >= 10) {
          const err = engine.startGather(army.id, site.id)
          if (err) toast(err)
          else toast(`${army.name} goes to work the ${site.kind === 'mine' ? 'mine' : 'forest'}.`)
        } else {
          engine.orderArmy(army.id, { type: 'move', x: site.x, z: site.z })
          toast('Only armies with 10+ engineers can work it.')
        }
        renderer.spawnClickMarker(site.x, site.z, 0x9cc0ff)
        return true
      }
      if (target?.kind === 'castle' && engine.castle(target.id)?.village && engine.castle(target.id)?.faction === 'neutral') {
        // Never plunder by accident: march up to the village and decide in its panel.
        const c = engine.castle(target.id)!
        const d = Math.hypot(army.x - c.x, army.z - c.z) || 1
        const [x, z] = engine.world.nearestPassable(c.x + ((army.x - c.x) / d) * 95, c.z + ((army.z - c.z) / d) * 95)
        engine.orderArmy(army.id, { type: 'move', x, z })
        renderer.spawnClickMarker(c.x, c.z, 0xf5c542)
        toast(c.ruined ? 'Only ruins are left here.' : `${army.name} marches to ${c.name}. Negotiate or plunder from the village panel.`)
        return true
      }
      if (target?.kind === 'castle') {
        const c = engine.castle(target.id)!
        const friendly = !engine.isHostile(c.faction, PLAYER)
        engine.orderArmy(army.id, friendly ? { type: 'station', castleId: c.id } : { type: 'attack', castleId: c.id })
        renderer.spawnClickMarker(c.x, c.z, friendly ? 0x9cc0ff : 0xff5a3c)
        return true
      }
      if (target?.kind === 'convoy') {
        const w = engine.convoy(target.id)
        if (w && engine.isHostile(w.faction, PLAYER)) {
          engine.orderArmy(army.id, { type: 'raidConvoy', convoyId: w.id })
          renderer.spawnClickMarker(w.x, w.z, 0xff5a3c)
          toast(`${army.name} rides to seize the wagons.`)
          return true
        }
      }
      if (target?.kind === 'outpost') {
        const o = engine.outpost(target.id)!
        if (o.kind === 'depot' && o.faction === PLAYER && o.progress >= 1) {
          engine.orderArmy(army.id, { type: 'garrison', outpostId: o.id })
          renderer.spawnClickMarker(o.x, o.z, 0x9cc0ff)
          toast(`${army.name} will quarter in ${o.name}.`)
          return true
        }
        engine.orderArmy(army.id, { type: 'move', x: o.x, z: o.z })
        renderer.spawnClickMarker(o.x, o.z, 0x9cc0ff)
        return true
      }
      if (g) {
        if (!engine.world.isPassable(g.x, g.z)) toast('Impassable terrain. The army will go as near as it can.')
        engine.orderArmy(army.id, { type: 'move', x: g.x, z: g.z })
        renderer.spawnClickMarker(g.x, g.z, 0xf5c542)
        return true
      }
      return false
    }

    const pinchState = () => {
      const [a, b] = [...pointers.values()]
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }
    const cancelLongPress = () => {
      if (longPress) window.clearTimeout(longPress)
      longPress = 0
    }

    const onDown = (e: PointerEvent) => {
      host.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        // Two fingers: pinch to zoom, twist to rotate, move together to pan.
        cancelLongPress()
        down = null
        pinch = pinchState()
        return
      }
      if (pointers.size > 2) return
      const touch = e.pointerType === 'touch'
      down = { x: e.clientX, y: e.clientY, button: e.button, grab: e.button === 0 ? renderer.groundAt(e.clientX, e.clientY) : null, dragging: false, touch, consumed: false }
      if (touch) {
        longPress = window.setTimeout(() => {
          longPress = 0
          if (down && !down.dragging && issueOrder(down.x, down.y)) {
            down.consumed = true
            navigator.vibrate?.(15)
          }
        }, 520)
      }
    }
    // A drag must never outlive the button. The release can go missing (a hitch,
    // a context menu, letting go outside the window), so any sign that no button
    // is held any more ends it.
    const endDrag = () => {
      down = null
      pinch = null
      pointers.clear()
      cancelLongPress()
      host.style.cursor = 'default'
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && down && e.buttons === 0) {
        endDrag()
        return
      }
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size >= 2) {
        const now = pinchState()
        if (now.dist > 10) renderer.cam.zoomBy(pinch.dist / now.dist)
        let da = now.angle - pinch.angle
        if (da > Math.PI) da -= Math.PI * 2
        if (da < -Math.PI) da += Math.PI * 2
        renderer.cam.rotateBy(-da)
        const g0 = renderer.groundAt(pinch.mx, pinch.my)
        const g1 = renderer.groundAt(now.mx, now.my)
        if (g0 && g1) renderer.cam.panBy(g0.x - g1.x, g0.z - g1.z)
        pinch = now
        return
      }
      if (down) {
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
        if (moved > (down.touch ? 9 : 5)) {
          down.dragging = true
          cancelLongPress()
        }
        if (down.dragging && down.button === 0 && down.grab) {
          const g = renderer.groundAt(e.clientX, e.clientY)
          if (g) renderer.cam.panBy(down.grab.x - g.x, down.grab.z - g.z)
          host.style.cursor = 'grabbing'
        } else if (down.dragging && down.button === 1) {
          renderer.cam.rotateBy(e.movementX * 0.006)
        }
        return
      }
      if (e.pointerType === 'mouse') {
        const h = renderer.pick(e.clientX, e.clientY)
        renderer.hover = h
        host.style.cursor = h ? 'pointer' : 'default'
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      cancelLongPress()
      if (pinch) {
        if (pointers.size < 2) pinch = null
        down = null
        return
      }
      if (!down) return
      const d = down
      down = null
      host.style.cursor = 'default'
      if (d.consumed || d.dragging || d.button !== 0 || e.type === 'pointercancel') return
      // Touch "order mode": the next tap gives an order instead of selecting.
      if (d.touch && orderModeRef.current) {
        if (issueOrder(e.clientX, e.clientY)) setOrderMode(false)
        return
      }
      select(renderer.pick(e.clientX, e.clientY))
    }
    const onContext = (e: MouseEvent) => {
      e.preventDefault()
      if ((e as PointerEvent).pointerType === 'touch') return
      issueOrder(e.clientX, e.clientY)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const g = renderer.groundAt(e.clientX, e.clientY)
      renderer.cam.zoomBy(Math.exp(e.deltaY * 0.0012), g ?? undefined)
    }
    const onLost = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && down && e.buttons === 0) endDrag()
    }
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointercancel', onUp)
    host.addEventListener('lostpointercapture', onLost)
    window.addEventListener('blur', endDrag)
    window.addEventListener('pointerup', onLost)
    host.addEventListener('contextmenu', onContext)
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cancelLongPress()
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('lostpointercapture', onLost)
      window.removeEventListener('blur', endDrag)
      window.removeEventListener('pointerup', onLost)
      host.removeEventListener('contextmenu', onContext)
      host.removeEventListener('wheel', onWheel)
    }
  }, [renderer, engine, select, toast])

  // Keyboard.
  useEffect(() => {
    if (!renderer) return
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'
    }
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return
      if (e.code === 'Escape') {
        if (confirmLeave) setConfirmLeave(false)
        else if (showHelp) setShowHelp(false)
        else if (formArmy) setFormArmy(null)
        else if (showLog) setShowLog(false)
        else select(null)
        return
      }
      if (formArmy || confirmLeave) return
      if (e.code === 'KeyH') {
        setShowHelp((v) => !v)
        return
      }
      if (e.code === 'KeyV') {
        toggleView()
        return
      }
      if (showHelp) return
      switch (e.code) {
        case 'KeyF':
          setFormArmy({ castleId: selection?.kind === 'castle' ? selection.id : undefined })
          return
        case 'KeyL':
          setShowLog((v) => !v)
          return
        case 'KeyC':
        case 'Home':
          goHome()
          return
        case 'Tab': {
          e.preventDefault()
          const mine = engine.state.armies.filter((a) => a.faction === PLAYER && !a.vassalOf)
          if (mine.length === 0) return
          const i = selection?.kind === 'army' ? mine.findIndex((a) => a.id === selection.id) : -1
          select({ kind: 'army', id: mine[(i + 1) % mine.length].id }, true)
          return
        }
      }
      renderer.cam.keyDown(e.code)
    }
    const onUp = (e: KeyboardEvent) => renderer.cam.keyUp(e.code)
    const onBlur = () => renderer.cam.clearKeys()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [renderer, engine, selection, formArmy, showLog, showHelp, confirmLeave, select, toggleView])

  // Drop the selection when the selected army disappears.
  useEffect(() => {
    return engine.subscribe(() => {
      setSelection((s) => {
        if (s?.kind === 'army' && !engine.army(s.id)) {
          if (renderer) renderer.selection = null
          return null
        }
        return s
      })
    })
  }, [engine, renderer])

  function goHome() {
    const cap = engine.castle(engine.state.factions[PLAYER]?.capitalId) ?? engine.state.castles.find((c) => c.faction === PLAYER)
    if (cap) select({ kind: 'castle', id: cap.id }, true)
  }

  const focusEntry = (e: ChronicleEntry) => {
    if (renderer && e.x !== undefined && e.z !== undefined) renderer.cam.focus(e.x, e.z)
  }

  const leave = () => {
    if (gameOver || engine.state.status !== 'active') onExit()
    else setConfirmLeave(true)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <div ref={hostRef} className="absolute inset-0 touch-none" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      <TopBar
        engine={engine}
        onQuit={leave}
        onToggleLog={() => setShowLog((v) => !v)}
        onHelp={() => setShowHelp(true)}
        overhead={overhead}
        onToggleView={toggleView}
        onMenu={() => setSidebarOpen((v) => !v)}
        campaignName={match.name}
      />
      <Sidebar
        engine={engine}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        selection={selection}
        onSelect={(s, f) => {
          select(s, f)
          if (vp.compact && s) setSidebarOpen(false)
        }}
        onFormArmy={() => {
          if (vp.compact) setSidebarOpen(false)
          setFormArmy({ castleId: selection?.kind === 'castle' ? selection.id : undefined })
        }}
        onFocusPoint={(x, z) => renderer?.cam.focus(x, z)}
      />
      <Toasts entries={fresh} onFocus={focusEntry} />
      {showLog && <ChronicleLog engine={engine} onClose={() => setShowLog(false)} onFocus={focusEntry} />}
      <SelectionPanel engine={engine} selection={selection} onSelect={select} onFormArmy={(castleId, targetId) => setFormArmy({ castleId, targetId })} toast={toast} />
      {!(vp.compact && selection) && <HoldingsBar engine={engine} selection={selection} onSelect={select} />}
      <Minimap engine={engine} renderer={renderer} />
      {vp.touch && selection?.kind === 'army' && engine.army(selection.id)?.faction === PLAYER && (
        <div className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 ${vp.compact ? 'bottom-[calc(min(52vh,460px)+10px)]' : 'bottom-24'}`}>
          <button
            className={`btn pointer-events-auto px-4 shadow-lg ${orderMode ? 'btn-gold animate-pulse' : ''}`}
            onClick={() => setOrderMode((v) => !v)}
          >
            {orderMode ? 'Tap a target: ground · castle · enemy · your army' : '🎯 Give an order'}
          </button>
          {!orderMode && <div className="mt-1 text-center text-[12px] text-ink-300 [text-shadow:0_1px_2px_#000]">or long-press the map</div>}
        </div>
      )}

      {flash && (
        <div className="parchment animate-fade-up pointer-events-none absolute top-[72px] left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-sm px-4 py-2 text-sm">{flash}</div>
      )}

      {formArmy && (
        <FormArmyModal
          engine={engine}
          initialCastleId={formArmy.castleId}
          initialTargetId={formArmy.targetId}
          onClose={() => setFormArmy(null)}
          onDeployed={(id) => {
            setFormArmy(null)
            select({ kind: 'army', id }, true)
          }}
        />
      )}

      {confirmLeave && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={() => setConfirmLeave(false)}>
          <div className="panel animate-fade-up w-[400px] max-w-[92vw] rounded-md p-6 text-center" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Abandon the war?</h2>
            <p className="mt-2 text-sm text-ink-300">Wars are not saved. Leaving now ends this one for good.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn" onClick={() => setConfirmLeave(false)}>
                Keep fighting
              </button>
              <button className="btn btn-danger" onClick={onExit}>
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}


      {gfxLost && !gfxError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="panel w-[420px] max-w-[92vw] rounded-md p-6 text-center">
            <h2 className="panel-title">Restoring the graphics…</h2>
            <p className="mt-2 text-[14px] text-ink-300">The graphics card dropped the 3D view. The war is paused and will continue as soon as it comes back.</p>
            <button className="btn mt-4" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      )}
      {gfxError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950">
          <div className="panel w-[520px] max-w-[92vw] rounded-md p-6">
            <h2 className="panel-title">3D graphics are unavailable</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-300">
              The browser refused to start WebGL. This usually happens after the graphics card was reset, or when too many 3D pages are open.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-ink-300">
              <li>Close other tabs that use 3D or video, then reload this page.</li>
              <li>If Chrome says the page was blocked, fully quit and reopen the browser.</li>
              <li>Check that hardware acceleration is enabled (chrome://settings/system).</li>
            </ul>
            <p className="mt-3 text-[12px] text-ink-500">{gfxError}</p>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-gold" onClick={() => window.location.reload()}>
                Reload
              </button>
              <button className="btn" onClick={onExit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}
      <TraitChoice engine={engine} />

      {showHelp && <HelpOverlay units={engine.unitList} onClose={() => setShowHelp(false)} />}

      {gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel animate-fade-up w-[440px] rounded-2xl p-8 text-center">
            {gameOver === 'victory' ? <Trophy size={44} className="mx-auto text-gold-300" /> : <Skull size={44} className="mx-auto text-ember-400" />}
            <h2 className={`mt-3 font-display text-4xl font-bold ${gameOver === 'victory' ? 'text-gold-200' : 'text-ember-300'}`}>{gameOver === 'victory' ? 'Victory' : 'Defeat'}</h2>
            <p className="mt-2 text-sm text-ink-300">
              {gameOver === 'victory' ? 'The enemy seat has fallen. The war is won and the land is yours.' : 'Your realm has fallen. The crown passes into ash.'}
            </p>
            {(() => {
              const h = engine.honours('A')
              const rank = h.findIndex((x) => x.id === PLAYER) + 1
              return h.length > 1 ? (
                <p className="mt-3 font-display text-[15px] text-gold-200">
                  Your war honours: rank {rank} of {h.length} lords
                </p>
              ) : null
            })()}
            <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Battles won" value={engine.state.stats.battlesWon} />
              <Stat label="Battles lost" value={engine.state.stats.battlesLost} />
              <Stat label="Enemies slain" value={fmt(engine.state.stats.enemyKilled)} />
              <Stat label="Castles taken" value={engine.state.stats.castlesTaken} />
            </div>
            <div className="mt-6 flex justify-center gap-2">
              <button className="btn" onClick={() => setGameOver(null)}>
                View the map
              </button>
              <button className="btn btn-gold" onClick={onExit}>
                Return to menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/4 py-2">
      <div className="text-[12px] text-ink-400 uppercase">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  )
}

