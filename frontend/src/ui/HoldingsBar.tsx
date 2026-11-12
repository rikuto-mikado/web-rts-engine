import { ChevronDown, Swords, Tent } from 'lucide-react'
import { Shield } from './Shield'
import { Glyph } from './Glyph'
import { useState } from 'react'
import { HOLDINGS, PLAYER, type GameEngine } from '../game/engine'
import { fmt, total } from '../game/troops'
import type { Selection } from '../render/GameRenderer'
import { useEngine } from './common'
import { useViewport } from './viewport'

/**
 * The player's holdings, stacked down the top right under the header: the seat
 * of power first, then castles, vassal villages and outposts. A long list
 * scrolls inside its own box, so the layout never breaks however much is held.
 * Click to fly the camera there.
 */
export function HoldingsBar({ engine, selection, onSelect, mapShown = false }: { engine: GameEngine; selection: Selection; onSelect: (s: Selection, focus?: boolean) => void; mapShown?: boolean }) {
  useEngine(engine)
  const vp = useViewport()
  const [open, setOpen] = useState(true)
  const capId = engine.state.factions[PLAYER]?.capitalId
  const castles = engine.state.castles
    .filter((c) => c.faction === PLAYER && !c.ruined)
    .sort((a, b) => (a.id === capId ? -1 : b.id === capId ? 1 : Number(!!a.village) - Number(!!b.village) || b.tier - a.tier))
  const outposts = engine.state.outposts.filter((o) => o.faction === PLAYER)
  const count = castles.length + outposts.length
  if (count === 0) return null
  const compact = vp.compact
  // About six rows show before the list starts to scroll; on phones it stops short of the map in the corner below.
  const below = mapShown ? (vp.phone ? 160 : 188) : 64
  const maxH = compact ? `${Math.max(90, Math.min(312, vp.h - 64 - 34 - below - 12))}px` : 'min(312px, calc(100vh - 430px))'
  return (
    <div
      className={`panel pointer-events-auto absolute z-20 flex flex-col overflow-hidden rounded-md ${compact ? 'top-[64px] right-2 w-[164px]' : 'top-[68px] right-3 w-[214px]'}`}
      style={compact ? { marginRight: 'env(safe-area-inset-right)' } : undefined}
    >
      <button className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-left" onClick={() => setOpen(!open)} title={open ? 'Fold the list' : 'Show your holdings'}>
        <span className="flex-1 font-display text-[12px] font-bold tracking-[0.14em] text-gold-300">
          HOLDINGS <span className="text-ink-400">{count}</span>
        </span>
        {!compact && (
          <span className="text-[11px] text-ink-500">
            <kbd className="rounded-sm bg-black/40 px-1 font-bold text-gold-200">C</kbd> home
          </span>
        )}
        <ChevronDown size={14} className={`text-gold-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="scroll-thin space-y-1 overflow-y-auto px-1.5 pb-1.5" style={{ maxHeight: maxH }}>
          {castles.map((c) => {
            const home = c.id === capId
            const sel = selection?.kind === 'castle' && selection.id === c.id
            const n = total(c.garrison)
            const fill = Math.min(1, n / engine.capacity(c))
            const H = c.village ? HOLDINGS[engine.holdingOf(c)] : null
            return (
              <button
                key={c.id}
                onClick={() => onSelect({ kind: 'castle', id: c.id }, true)}
                title={`${c.name}: ${fmt(n)} ${c.village ? 'militia' : 'soldiers'}, tier ${c.tier}${c.battleId ? ' (UNDER SIEGE)' : ''}`}
                className={`well relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-[filter] hover:brightness-125 ${sel ? 'outline outline-1 outline-gold-400' : ''} ${c.battleId ? 'animate-pulse outline outline-1 outline-ember-400' : ''}`}
              >
                {H ? (
                  <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink-700 text-gold-300">{c.battleId ? <Swords size={12} /> : <Glyph name={H.icon} size={14} />}</span>
                ) : (
                  <span className="grid size-6 shrink-0 place-items-center">
                    <Shield rank={engine.seatRank(c)} color={engine.factionColor(c.faction)} size={home ? 17 : 15} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-display text-[12.5px] font-bold leading-tight ${home ? 'text-gold-200' : 'text-ink-100'}`}>{c.name}</span>
                  <span className="flex items-center gap-1.5 text-[12px] leading-tight text-ink-300 tabular-nums">
                    {fmt(n)}
                    <span className="h-1 flex-1 overflow-hidden bg-black/50">
                      <span className="block h-full bg-royal-400" style={{ width: `${fill * 100}%` }} />
                    </span>
                    <span className="text-[10px] text-gold-500">{'▮'.repeat(c.tier)}</span>
                  </span>
                </span>
              </button>
            )
          })}
          {outposts.map((o) => {
            const sel = selection?.kind === 'outpost' && selection.id === o.id
            return (
              <button
                key={o.id}
                onClick={() => onSelect({ kind: 'outpost', id: o.id }, true)}
                title={o.name}
                className={`well flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:brightness-125 ${sel ? 'outline outline-1 outline-gold-400' : ''} ${o.raze > 0.02 ? 'animate-pulse outline outline-1 outline-ember-400' : ''}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink-700 text-gold-300">
                  <Tent size={12} />
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-tight">
                  <span className="block truncate font-bold">{o.name}</span>
                  <span className="text-ink-400">{o.progress < 1 ? `Building ${Math.round(o.progress * 100)}%` : 'Outpost'}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
