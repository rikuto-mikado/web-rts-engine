import { PLAYER, type GameEngine } from '../game/engine'
import { CROWNS } from '../game/grandmap'
import type { WarTeam } from '../game/types'
import type { Selection } from '../render/GameRenderer'
import { useEngine } from './common'
import { Glyph } from './Glyph'

const WHO: Record<WarTeam, string> = { A: 'The King', B: 'The Usurper', C: 'The Sun Emperor' }

/**
 * The War of the Three Crowns at a glance: for each of the three crowns, its standing among them
 * (by strength), the castles it holds, how its Citadel's walls stand, whether its monarch still
 * rides, and whether the crown is shattered. A tap goes to its Citadel.
 */
export function CrownsHUD({ engine, onFocus, onSelect }: { engine: GameEngine; onFocus: (x: number, z: number) => void; onSelect: (s: Selection) => void }) {
  useEngine(engine)
  const s = engine.state
  if (s.rules.mode !== 'grand') return null
  const teams = ['A', 'B', 'C'] as const
  const pw = Object.fromEntries(teams.map((t) => [t, engine.teamPower(t)])) as Record<WarTeam, { power: number; castles: number }>
  const order = [...teams].sort((a, b) => pw[b].power - pw[a].power)
  const total = teams.reduce((n, t) => n + pw[t].power, 0) || 1
  const fallen = s.crownsFallen ?? {}
  const monarch: Record<WarTeam, boolean> = { A: !s.kingFallen, B: !!s.foeRoyalId, C: !!s.sunRoyalId }
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center max-[700px]:bottom-auto max-[700px]:top-[58px]">
      <div className="panel pointer-events-auto flex items-stretch gap-1.5 rounded-md px-2 py-1.5">
        <div className="hidden flex-col justify-center pr-1 text-[10.5px] leading-tight sm:flex">
          <span className="font-display font-bold tracking-[0.16em] text-gold-300">THREE</span>
          <span className="font-display font-bold tracking-[0.16em] text-gold-300">CROWNS</span>
        </div>
        {teams.map((t) => {
          const keep = engine.castle(CROWNS[t].keep)
          const leader = t === 'A' ? s.factions[PLAYER] : s.factions[CROWNS[t].id]
          const color = leader?.color ?? '#888'
          const walls = keep && keep.maxWalls > 0 ? keep.walls / keep.maxWalls : 0
          const held = keep && engine.team(keep.faction) === t
          const out = !!fallen[t] && t !== 'A' ? true : t === 'A' && !!s.kingFallen && !held
          const rank = order.indexOf(t) + 1
          return (
            <button
              key={t}
              onClick={() => {
                if (!keep) return
                onFocus(keep.x, keep.z)
                onSelect({ kind: 'castle', id: keep.id })
              }}
              title={`${leader?.name ?? WHO[t]}: ${out ? 'crown shattered' : `rank ${rank} of 3`}, ${pw[t].castles} castles, ${Math.round((pw[t].power / total) * 100)}% of all strength. Citadel ${held ? `walls ${Math.round(walls * 100)}%` : 'lost'}; ${monarch[t] ? 'the monarch rides' : 'the monarch has fallen'}.`}
              className={`well flex min-w-[118px] flex-col gap-0.5 rounded-sm px-2 py-1 text-left hover:brightness-125 max-[700px]:min-w-[92px] ${out ? 'opacity-50 grayscale' : ''} ${t === 'A' ? 'ring-1 ring-gold-400/40' : ''}`}
            >
              <span className="flex items-center gap-1.5">
                <i className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} />
                <span className={`truncate font-display text-[12px] font-bold ${t === 'A' ? 'text-royal-300' : 'text-ink-100'} ${out ? 'line-through' : ''}`}>{WHO[t]}</span>
                <span className="ml-auto text-[10.5px] font-bold text-gold-300 tabular-nums">{out ? '' : `#${rank}`}</span>
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-ink-400 tabular-nums">
                <Glyph name={monarch[t] ? 'crown' : 'warning'} size={10} className={monarch[t] ? 'text-gold-300' : 'text-ember-300'} />
                {out ? 'Shattered' : `${pw[t].castles} castles`}
                <span className="ml-auto">{held ? `${Math.round(walls * 100)}%` : 'lost'}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-black/50">
                <i className="block h-full" style={{ width: `${held ? walls * 100 : 0}%`, background: color }} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
