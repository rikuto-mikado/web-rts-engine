import { Pause, Play, RotateCcw, Skull, Trophy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PLAYER, type GameEngine } from '../game/engine'
import { calendar, fmt } from '../game/troops'
import { seasonAt } from '../game/weather'
import { ROYAL_SEAT_TIER } from '../game/world'
import { drawShield } from '../render/heraldry'
import { paintTerrain } from './mapPaint'
import { PixelPortrait } from './PixelPortrait'
import { Glyph } from './Glyph'
import { SEASON_GLYPH } from './seasonGlyph'

const REPLAY_SECONDS = 30
const MAP = 512 // internal canvas resolution
const GRID = 128 // territory grid resolution

/**
 * The war report: a timelapse of the whole war on the map (territory changing
 * hands, villages sworn, the great battles flaring up) played over thirty
 * seconds through the turning seasons, and the honours of the campaign.
 */
export function WarReport({ engine, status, onViewMap, onExit }: { engine: GameEngine; status: 'victory' | 'defeat'; onViewMap: () => void; onExit: () => void }) {
  const s = engine.state
  const hist = s.history
  const tally = s.tally
  const end = Math.max(1, s.time)
  const [playing, setPlaying] = useState(true)
  const [t, setT] = useState(0)
  const tRef = useRef(0)
  const playRef = useRef(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Everything the replay needs, worked out once.
  const prep = useMemo(() => {
    if (!hist || hist.frames.length === 0) return null
    const world = engine.world
    const bg = paintTerrain(world, MAP)
    const castles = hist.castleIds.map((id) => engine.castle(id)).map((c) => (c ? { x: c.x, z: c.z, village: !!c.village, capital: c.capital, tier: c.tier } : null))
    const colors = hist.factionIds.map((f) => engine.factionColor(f))
    // Each cell of the territory grid belongs to its nearest holding (castles reach further than villages).
    const reach = Math.max(1, world.size / 5540)
    const cell = new Int16Array(GRID * GRID).fill(-1)
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const x = -world.half + ((i + 0.5) / GRID) * world.size
        const z = -world.half + ((j + 0.5) / GRID) * world.size
        if (world.heightAt(x, z) < 0.5) continue
        let best = -1
        let bs = Infinity
        castles.forEach((c, k) => {
          if (!c) return
          const d = Math.hypot(c.x - x, c.z - z)
          const lim = (c.village ? 420 : 1000) * reach
          if (d > lim) return
          const score = d - (c.village ? 0 : 260 * reach)
          if (score < bs) {
            bs = score
            best = k
          }
        })
        cell[j * GRID + i] = best
      }
    // Changes of hands between frames: rings on the map.
    const changes: { t: number; k: number; to: number }[] = []
    for (let f = 1; f < hist.frames.length; f++) {
      const a = hist.frames[f - 1].owners
      const b = hist.frames[f].owners
      for (let k = 0; k < b.length; k++) if (a[k] !== b[k]) changes.push({ t: hist.frames[f].t, k, to: b[k] })
    }
    // The player's alliance's share of the holdings, frame by frame.
    const teamOf = hist.factionIds.map((f) => engine.team(f))
    const myTeam = engine.team(PLAYER)
    const share = hist.frames.map((fr) => {
      let mine = 0
      let held = 0
      fr.owners.forEach((o) => {
        if (o < 0) return
        held++
        if (teamOf[o] === myTeam) mine++
      })
      return held ? mine / held : 0
    })
    return { bg, castles, colors, cell, changes, share }
  }, [engine, hist])

  // The replay clock.
  useEffect(() => {
    playRef.current = playing
  }, [playing])
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playRef.current) {
        tRef.current = Math.min(end, tRef.current + (dt * end) / REPLAY_SECONDS)
        if (tRef.current >= end) setPlaying(false)
        setT(tRef.current)
      }
      draw(tRef.current)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prep])

  const terr = useRef<HTMLCanvasElement | null>(null)
  function draw(time: number) {
    const cv = canvasRef.current
    if (!cv || !prep || !hist) return
    const ctx = cv.getContext('2d')!
    const world = engine.world
    const px = (v: number) => ((v + world.half) / world.size) * MAP
    ctx.drawImage(prep.bg, 0, 0)
    // The frame for this moment.
    let fi = 0
    while (fi + 1 < hist.frames.length && hist.frames[fi + 1].t <= time) fi++
    const owners = hist.frames[fi].owners
    // Territory: a soft wash of each lord's colour.
    if (!terr.current) {
      terr.current = document.createElement('canvas')
      terr.current.width = terr.current.height = GRID
    }
    const tctx = terr.current.getContext('2d')!
    const img = tctx.createImageData(GRID, GRID)
    const rgb = prep.colors.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)])
    for (let i = 0; i < GRID * GRID; i++) {
      const k = prep.cell[i]
      const o = k >= 0 ? owners[k] : -1
      if (o < 0) continue
      const c = rgb[o]
      img.data[i * 4] = c[0]
      img.data[i * 4 + 1] = c[1]
      img.data[i * 4 + 2] = c[2]
      img.data[i * 4 + 3] = 120
    }
    tctx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(terr.current, 0, 0, MAP, MAP)
    // The season washes over the land.
    const season = seasonAt(time)
    const tint = season === 'Winter' ? 'rgba(220,232,255,0.22)' : season === 'Autumn' ? 'rgba(210,130,50,0.10)' : season === 'Spring' ? 'rgba(140,220,120,0.06)' : 'rgba(255,230,150,0.05)'
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, MAP, MAP)
    // Battles flaring up: a burst of sparks that fades.
    const span = (end / REPLAY_SECONDS) * 1.6
    for (const sp of hist.sparks) {
      const age = time - sp.t
      if (age < 0 || age > span) continue
      const k = 1 - age / span
      const r = (6 + Math.sqrt(sp.n) * 0.7) * (0.6 + 0.6 * (1 - k))
      const g = ctx.createRadialGradient(px(sp.x), px(sp.z), 0, px(sp.x), px(sp.z), r)
      g.addColorStop(0, `rgba(255,240,180,${0.95 * k})`)
      g.addColorStop(0.35, `rgba(255,150,50,${0.7 * k})`)
      g.addColorStop(1, 'rgba(255,90,20,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px(sp.x), px(sp.z), r, 0, Math.PI * 2)
      ctx.fill()
    }
    // Holdings changing hands: an expanding ring in the new owner's colour.
    for (const ch of prep.changes) {
      const age = time - ch.t
      if (age < 0 || age > span) continue
      const c = prep.castles[ch.k]
      if (!c) continue
      const k = age / span
      ctx.strokeStyle = ch.to >= 0 ? prep.colors[ch.to] : '#2a2420'
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = c.village ? 2 : 3.5
      ctx.beginPath()
      ctx.arc(px(c.x), px(c.z), (c.village ? 6 : 10) + k * (c.village ? 16 : 30), 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // The holdings themselves.
    prep.castles.forEach((c, k) => {
      if (!c) return
      const o = owners[k]
      const x = px(c.x)
      const y = px(c.z)
      ctx.fillStyle = o >= 0 ? prep.colors[o] : '#cfc2a0'
      ctx.strokeStyle = '#141008'
      ctx.lineWidth = 1.5
      if (c.village) {
        ctx.beginPath()
        ctx.arc(x, y, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else {
        const rank = c.tier >= ROYAL_SEAT_TIER ? 'royal' : c.capital ? 'lord' : 'castle'
        drawShield(ctx, x, y, rank === 'royal' ? 20 : rank === 'lord' ? 16 : 13, o >= 0 ? prep.colors[o] : '#cfc2a0', rank)
      }
    })
    // A vignette for the frame.
    const v = ctx.createRadialGradient(MAP / 2, MAP / 2, MAP * 0.35, MAP / 2, MAP / 2, MAP * 0.72)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, MAP, MAP)
  }

  // The honours of the campaign.
  const best = <T,>(rec: Record<string, T> | undefined, val: (v: T) => number) => {
    let id: string | null = null
    let v = 0
    for (const [k, x] of Object.entries(rec ?? {})) if (val(x) > v) [id, v] = [k, val(x)]
    return id ? { id, v } : null
  }
  const slayer = best(tally?.commanderKills, (x) => x)
  const slayerDef = slayer ? engine.content.commanders.find((c) => c.key === slayer.id) : undefined
  const breaker = best(tally?.wallBreakers, (x) => x.damage)
  const breakerName = breaker ? tally!.wallBreakers[breaker.id].name : null
  const h = engine.honours('A')
  const rank = h.findIndex((x) => x.id === PLAYER) + 1
  const win = status === 'victory'
  const season = seasonAt(t)
  let frameNow = 0
  if (hist) while (frameNow + 1 < hist.frames.length && hist.frames[frameNow + 1].t <= t) frameNow++
  const shareNow = prep ? prep.share[frameNow] : 0

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-auto bg-black/70 p-3 backdrop-blur-sm">
      <div className="panel animate-fade-up my-auto flex w-full max-w-[980px] flex-col gap-5 rounded-2xl p-5 md:flex-row md:p-6">
        {/* The timelapse. */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-bold tracking-[0.12em] text-gold-300 uppercase">The war in thirty seconds</h3>
            <span className="text-[13px] text-ink-300 tabular-nums">{calendar(t)}</span>
          </div>
          {prep ? (
            <div className="relative mx-auto aspect-square w-full max-w-[min(520px,calc(100dvh-170px))] overflow-hidden rounded-md ring-1 ring-black/60">
              <canvas ref={canvasRef} width={MAP} height={MAP} className="block h-full w-full" />
              <div className="pointer-events-none absolute top-2 left-2 rounded-sm bg-black/50 px-2 py-0.5 font-display text-[13px] font-bold tracking-wider text-gold-200">
                <Glyph name={SEASON_GLYPH[season]} size={15} className="mr-1 -mt-0.5" />
                {season}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-400">No record of the war was kept.</p>
          )}
          {prep && (
            <>
              {/* The alliance's share of the land over the war, with where the replay is now. */}
              <div className="relative mt-2 h-8 overflow-hidden rounded-sm bg-black/30">
                <svg viewBox={`0 0 ${prep.share.length - 1 || 1} 1`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                  <path d={`M0 1 ${prep.share.map((v, i) => `L${i} ${1 - v}`).join(' ')} L${prep.share.length - 1} 1Z`} fill="#3d6fd1" fillOpacity="0.45" />
                  <path d={prep.share.map((v, i) => `${i ? 'L' : 'M'}${i} ${1 - v}`).join(' ')} stroke="#9cc0ff" strokeWidth="0.03" fill="none" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="absolute inset-y-0 w-[2px] bg-gold-300" style={{ left: `${(t / end) * 100}%` }} />
                <span className="absolute top-0.5 left-1.5 text-[11px] text-ink-200">Your alliance holds {Math.round(shareNow * 100)}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="btn h-8 px-2.5" onClick={() => setPlaying((p) => (tRef.current >= end ? ((tRef.current = 0), true) : !p))} title={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                  className="btn h-8 px-2.5"
                  onClick={() => {
                    tRef.current = 0
                    setT(0)
                    setPlaying(true)
                  }}
                  title="From the start"
                >
                  <RotateCcw size={15} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={end}
                  step={end / 600}
                  value={t}
                  onChange={(e) => {
                    tRef.current = Number(e.target.value)
                    setT(tRef.current)
                    setPlaying(false)
                  }}
                  className="min-w-0 flex-1 accent-[#d1a73f]"
                />
              </div>
            </>
          )}
        </div>

        {/* The verdict and the honours. */}
        <div className="flex w-full shrink-0 flex-col md:w-[320px]">
          <div className="text-center">
            {win ? <Trophy size={40} className="mx-auto text-gold-300" /> : <Skull size={40} className="mx-auto text-ember-400" />}
            <h2 className={`mt-2 font-display text-4xl font-bold ${win ? 'text-gold-200' : 'text-ember-300'}`}>{win ? 'Victory' : 'Defeat'}</h2>
            <p className="mt-1.5 text-[13px] text-ink-300">{win ? (s.foeFallen ? 'Queen Morwenna has fallen with her Thorn Guard. The enemy alliance breaks apart.' : s.rules.timeLimit && s.time >= s.rules.timeLimit ? 'You held the line. The relief fleet has landed and the coalition sues for peace.' : 'The enemy seat has fallen. The war is won and the land is yours.') : s.kingFallen ? 'The King has fallen with his Guard. The realm is lost.' : 'Your realm has fallen. The crown passes into ash.'}</p>
            <p className="mt-1 text-[12px] text-ink-500">Fought from Day 1 · Spring 1247 to {calendar(end)}</p>
            {h.length > 1 && <p className="mt-2 font-display text-[14px] text-gold-200">War honours: rank {rank} of {h.length} lords</p>}
          </div>

          <h3 className="mt-4 mb-2 font-display text-[13px] font-bold tracking-[0.14em] text-gold-300 uppercase">Honours of the campaign</h3>
          <div className="space-y-1.5">
            <Award
              icon={slayerDef ? <PixelPortrait spec={slayerDef.portrait} size={36} className="ring-1 ring-gold-400/50" /> : <Glyph name="swords" size={26} className="text-gold-300" />}
              title="Deadliest commander"
              who={slayerDef?.name ?? '—'}
              value={slayer ? `${fmt(slayer.v)} slain` : 'No commander fought'}
            />
            <Award icon={<Glyph name="castle" size={26} className="text-gold-300" />} title="Breaker of walls" who={breakerName ?? '—'} value={breaker ? `${fmt(breaker.v)} of wall battered down` : 'No walls breached'} />
            <Award icon={<Glyph name="purse" size={26} className="text-gold-300" />} title="Plunder of the roads" who={`${tally?.wagonsTaken ?? 0} wagons seized`} value={`${fmt(tally?.raidGold ?? 0)} gold taken`} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm">
            <Stat label="Battles won" value={s.stats.battlesWon} />
            <Stat label="Battles lost" value={s.stats.battlesLost} />
            <Stat label="Enemies slain" value={fmt(s.stats.enemyKilled)} />
            <Stat label="Castles taken" value={s.stats.castlesTaken} />
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn" onClick={onViewMap}>
              View the map
            </button>
            <button className="btn btn-gold" onClick={onExit}>
              Return to menu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Award({ icon, title, who, value }: { icon: ReactNode; title: string; who: string; value: string }) {
  return (
    <div className="well flex items-center gap-3 rounded-lg px-3 py-2">
      <span className="grid size-10 shrink-0 place-items-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] tracking-wider text-gold-400 uppercase">{title}</div>
        <div className="truncate text-[14px] font-bold text-ink-100">{who}</div>
        <div className="text-[12px] text-ink-300">{value}</div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="well rounded-lg px-3 py-1.5 text-left">
      <div className="text-[11px] tracking-wider text-ink-400 uppercase">{label}</div>
      <div className="text-base font-bold text-ink-100 tabular-nums">{value}</div>
    </div>
  )
}
