import { Castle as CastleIcon, Crown, Swords, Tent } from 'lucide-react'
import { PLAYER, capacityForTier, type GameEngine } from '../game/engine'
import { fmt, total } from '../game/troops'
import type { Selection } from '../render/GameRenderer'
import { useEngine } from './common'
import { useViewport } from './viewport'

/**
 * Always-visible strip of the player's holdings: the seat of power first,
 * then every other castle. Click to fly the camera there.
 */
export function HoldingsBar({ engine, selection, onSelect }: { engine: GameEngine; selection: Selection; onSelect: (s: Selection, focus?: boolean) => void }) {
  useEngine(engine)
  const capId = engine.state.factions[PLAYER]?.capitalId
  const castles = engine.state.castles
    .filter((c) => c.faction === PLAYER)
    .sort((a, b) => (a.id === capId ? -1 : b.id === capId ? 1 : b.tier - a.tier))
  const vp = useViewport()
  if (castles.length === 0) return null
  return (
    <div className={`pointer-events-none absolute z-20 flex justify-center ${vp.compact ? 'safe-bottom right-2 bottom-2 left-2' : 'right-[232px] bottom-3 left-[376px]'}`}>
      <div className="panel scroll-thin pointer-events-auto flex max-w-full items-stretch gap-1.5 overflow-x-auto rounded-md px-3 py-2">
        <div className={`mr-1 flex-col justify-center pr-2 text-center ${vp.compact ? 'hidden' : 'flex'}`} style={{ borderRight: '1px solid rgb(209 167 63 / 0.2)' }}>
          <span className="font-display text-[12px] font-bold tracking-[0.14em] text-gold-300">HOLDINGS</span>
          <span className="text-[12px] text-ink-400">
            press <kbd className="rounded-sm bg-black/40 px-1 font-bold text-gold-200">C</kbd> for home
          </span>
        </div>
        {castles.map((c) => {
          const home = c.id === capId
          const sel = selection?.kind === 'castle' && selection.id === c.id
          const n = total(c.garrison)
          const fill = Math.min(1, n / capacityForTier(c.tier))
          return (
            <button
              key={c.id}
              onClick={() => onSelect({ kind: 'castle', id: c.id }, true)}
              title={`${c.name}: ${fmt(n)} soldiers, tier ${c.tier}${c.battleId ? ' (UNDER SIEGE)' : ''}`}
              className={`well relative flex min-w-[104px] shrink-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-left transition-[filter] hover:brightness-125 ${sel ? 'outline outline-1 outline-gold-400' : ''} ${c.battleId ? 'animate-pulse outline outline-1 outline-ember-400' : ''}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-sm ${home ? 'bg-gradient-to-b from-gold-300 to-gold-600 text-ink-950' : 'bg-royal-700 text-royal-300'}`}>
                {home ? <Crown size={15} /> : c.battleId ? <Swords size={14} /> : <CastleIcon size={14} />}
              </span>
              <span className="min-w-0">
                <span className={`block truncate font-display text-[13px] font-bold ${home ? 'text-gold-200' : 'text-ink-100'}`}>{c.name}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-ink-300 tabular-nums">
                  {fmt(n)}
                  <span className="h-1 w-8 overflow-hidden bg-black/50">
                    <span className="block h-full bg-royal-400" style={{ width: `${fill * 100}%` }} />
                  </span>
                  <span className="text-gold-500">{'▮'.repeat(c.tier)}</span>
                </span>
              </span>
            </button>
          )
        })}
        {engine.state.outposts
          .filter((o) => o.faction === PLAYER)
          .map((o) => {
            const sel = selection?.kind === 'outpost' && selection.id === o.id
            return (
              <button
                key={o.id}
                onClick={() => onSelect({ kind: 'outpost', id: o.id }, true)}
                title={o.name}
                className={`well flex shrink-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-left hover:brightness-125 ${sel ? 'outline outline-1 outline-gold-400' : ''} ${o.raze > 0.02 ? 'animate-pulse outline outline-1 outline-ember-400' : ''}`}
              >
                <span className="grid size-7 place-items-center rounded-sm bg-ink-700 text-gold-300">
                  <Tent size={14} />
                </span>
                <span className="text-[13px]">
                  <span className="block max-w-[90px] truncate font-bold">{o.name.replace(' Watch Camp', '')}</span>
                  <span className="text-ink-400">{o.progress < 1 ? `${Math.round(o.progress * 100)}%` : 'Outpost'}</span>
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
