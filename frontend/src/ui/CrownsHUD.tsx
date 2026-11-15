import { CORONATION, PLAYER, type GameEngine } from '../game/engine'
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
  const cor = s.coronation && s.coronation.progress > 0 ? s.coronation : null
  const heart = engine.castle(CORONATION.heartId)
  const opensIn = Math.max(0, CORONATION.opensAt - s.time)
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5 max-[700px]:bottom-auto max-[700px]:top-[58px] max-[700px]:flex-col-reverse">
      {cor && heart && <CoronationBar engine={engine} team={cor.team} left={CORONATION.seconds - cor.progress} active={cor.active} why={cor.why} onFocus={() => onFocus(heart.x, heart.z)} />}
      <div className="panel pointer-events-auto flex items-stretch gap-1.5 rounded-md px-2 py-1.5">
        <div className="hidden flex-col justify-center pr-1 text-[10.5px] leading-tight sm:flex">
          <span className="font-display font-bold tracking-[0.16em] text-gold-300">THREE</span>
          <span className="font-display font-bold tracking-[0.16em] text-gold-300">CROWNS</span>
          {heart && (
            <span className="mt-0.5 text-[9.5px] tracking-normal text-ink-400" title={`The Old Throne at ${heart.name}: whichever crown holds it and keeps its monarch there for ${CORONATION.seconds / 60} minutes unchallenged is crowned High Emperor and wins.`}>
              {opensIn > 0 ? `Throne in ${Math.ceil(opensIn / 60)}m` : cor ? '' : 'Throne open'}
            </span>
          )}
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

/**
 * The coronation on the Old Throne: who is being crowned, how long is left, and whether the rite is
 * halted (and why). Ours glows gold; a rival's burns red. A tap goes to the Crossroads.
 */
function CoronationBar({ engine, team, left, active, why, onFocus }: { engine: GameEngine; team: WarTeam; left: number; active: boolean; why: string | null; onFocus: () => void }) {
  const ours = team === 'A'
  const sec = Math.max(0, Math.ceil(left))
  const pct = Math.min(100, ((CORONATION.seconds - left) / CORONATION.seconds) * 100)
  const tone = ours ? 'border-gold-400/60 bg-[#3a2a0c]/90 text-gold-100' : 'border-ember-400/60 bg-[#3a120c]/90 text-ember-200'
  return (
    <button onClick={onFocus} className={`pointer-events-auto flex w-[min(92vw,420px)] flex-col gap-1 rounded-md border px-3 py-1.5 text-left shadow-lg ${tone} ${active ? 'animate-pulse' : ''}`}>
      <span className="flex items-center gap-2">
        <Glyph name="crown" size={14} className={ours ? 'text-gold-300' : 'text-ember-300'} />
        <span className="font-display text-[12.5px] font-bold tracking-[0.08em]">
          {ours ? 'Coronation of King Aldric' : `${engine.crownName(team)} is being crowned`}
        </span>
        <span className="ml-auto font-display text-[15px] font-bold tabular-nums">
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-black/50">
        <i className="block h-full transition-[width] duration-700" style={{ width: `${pct}%`, background: ours ? '#e3b64a' : '#e0563a' }} />
      </span>
      <span className="text-[11px] leading-tight opacity-80">
        {active ? (ours ? 'Hold the Imperial Crossroads: keep the King there and every enemy away.' : 'Take the Imperial Crossroads, or bring a force within 400m to halt the rite.') : `Halted: ${why ?? ''}`}
      </span>
    </button>
  )
}
