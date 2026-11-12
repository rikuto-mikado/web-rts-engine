import { PLAYER, type GameEngine } from '../game/engine'
import { watchAt } from '../game/nightai'
import { total } from '../game/troops'
import type { Selection } from '../render/GameRenderer'
import { useEngine } from './common'
import { Glyph } from './Glyph'

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * The Long Night at a glance: how long until dawn (and how far the night has worn on), which wave
 * is coming and when, and which of the city's gates still hold (outer wall, inner wall).
 */
export function NightHUD({ engine, onFocus, onSelect }: { engine: GameEngine; onFocus: (x: number, z: number) => void; onSelect: (s: Selection) => void }) {
  useEngine(engine)
  const s = engine.state
  const n = s.night
  const limit = s.rules.timeLimit
  if (!n || !limit) return null
  const left = Math.max(0, limit - s.time)
  const next = Math.max(0, Math.ceil(n.nextWaveAt - s.time))
  const gates = s.castles.filter((c) => c.gate)
  const outer = gates.filter((c) => c.id.startsWith('og'))
  const inner = gates.filter((c) => c.id.startsWith('ig'))
  const dead = s.armies.filter((a) => a.faction !== PLAYER && engine.state.factions[a.faction]?.undying).reduce((p, a) => p + total(a.troops), 0)
  const watch = watchAt(s.time, limit)
  const intent = n.intent && n.intent.until > s.time ? n.intent : null
  const pip = (c: (typeof gates)[number]) => {
    const held = c.faction === PLAYER
    const besieged = !!c.battleId
    return (
      <button
        key={c.id}
        title={`${c.name}: ${held ? (besieged ? 'under attack' : 'holds') : 'fallen'}`}
        onClick={() => {
          onFocus(c.x, c.z)
          onSelect({ kind: 'castle', id: c.id })
        }}
        className={`grid size-7 place-items-center rounded-sm ring-1 hover:brightness-125 ${held ? (besieged ? 'animate-pulse bg-ember-700/50 text-ember-100 ring-ember-400' : 'bg-royal-700/40 text-royal-300 ring-royal-400/50') : 'bg-black/50 text-[#b48cff] ring-[#7a4cc0]/60'}`}
      >
        <Glyph name={held ? 'castle' : 'fire'} size={14} />
      </button>
    )
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center">
      {intent && (
        <button className="pointer-events-auto mx-auto mb-1.5 flex animate-pulse items-center gap-1.5 rounded-sm bg-[#2a1240]/90 px-3 py-1 text-[12.5px] font-semibold text-[#e2ccff] ring-1 ring-[#9a5cff]/60" onClick={() => onFocus(intent.x, intent.z)}>
          <Glyph name="warning" size={13} /> {intent.text}
        </button>
      )}
      <div className="panel pointer-events-auto flex items-center gap-3 rounded-md px-3 py-2">
        <div className="min-w-[124px] text-[11.5px] leading-tight">
          <div className="font-display font-bold tracking-[0.16em] text-gold-300">UNTIL DAWN</div>
          <div className="font-display text-[19px] leading-none font-bold text-ink-100 tabular-nums">{clock(left)}</div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/50">
            <i className="block h-full bg-gradient-to-r from-[#5b3a8a] via-ember-400 to-gold-300" style={{ width: `${(1 - left / limit) * 100}%` }} />
          </div>
        </div>
        <div className="min-w-[132px] text-[11.5px] leading-tight text-ink-300">
          <div className="font-display font-semibold tracking-wider text-[#c9a8ff] uppercase">{watch.name}</div>
          <div className="tabular-nums">The Rift erupts in {next}s</div>
          <div className="tabular-nums text-ink-400">
            {Math.round(dead).toLocaleString()} abroad · <span className="text-gold-200">{Math.round(n.slain).toLocaleString()} slain</span>
          </div>
        </div>
        <div className="text-[10.5px] leading-tight text-ink-400">
          <div className="mb-0.5 tracking-wider uppercase">Outer</div>
          <div className="flex gap-1">{outer.map(pip)}</div>
        </div>
        <div className="text-[10.5px] leading-tight text-ink-400">
          <div className="mb-0.5 tracking-wider uppercase">Inner</div>
          <div className="flex gap-1">{inner.map(pip)}</div>
        </div>
      </div>
    </div>
  )
}
