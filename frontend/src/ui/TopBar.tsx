import { Castle, Coins, Crown, Ellipsis, Hourglass, Keyboard, LogOut, Menu, ScrollText, Swords, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PLAYER, type GameEngine } from '../game/engine'
import { calendar, fmt, total } from '../game/troops'
import { WEATHER_LABEL, describeClimate } from '../game/weather'
import { RELATION_COLOR, useEngine } from './common'
import { useViewport } from './viewport'

interface Props {
  engine: GameEngine
  onQuit: () => void
  onToggleLog: () => void
  onHelp: () => void
  onMenu: () => void
  campaignName: string
}

const MODE_NAME = { campaign: 'Conquest', alliance: 'Alliance War', survival: 'Conquest', siege: 'Great Siege' }

/** One information bar: realm status on the left, chronicle / manual / leave tucked at its end. */
export function TopBar({ engine, onQuit, onToggleLog, onHelp, onMenu, campaignName }: Props) {
  useEngine(engine)
  const vp = useViewport()
  const [more, setMore] = useState(false)
  const s = engine.state
  const t = engine.totals(PLAYER)
  const net = t.income - t.upkeep
  const A = engine.teamPower('A')
  const B = engine.teamPower('B')
  const share = A.power / Math.max(1, A.power + B.power)
  const left = s.rules.timeLimit ? Math.max(0, s.rules.timeLimit - s.time) : null
  const clock = left !== null ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : null
  const clockText = clock && (s.rules.siegeSide === 'defend' ? `Hold ${clock}` : `${clock} left`)
  const season = engine.season()
  const wx = s.weather.kind
  const wxIcon = wx === 'rain' ? '🌧' : wx === 'storm' ? '⛈' : wx === 'snow' ? '❄' : season === 'Winter' ? '🌨' : season === 'Autumn' ? '🍂' : season === 'Spring' ? '🌱' : '☀'
  const wxTip = describeClimate(season, wx).join('\n')
  const weatherChip = (
    <div className="flex items-center gap-1.5 text-[13px] text-ink-200" title={wxTip}>
      <span className="text-[16px] leading-none">{wxIcon}</span>
      <span className="leading-tight">
        <span className="block">{season}</span>
        <span className="block text-[11px] text-ink-400">{WEATHER_LABEL[wx]}</span>
      </span>
    </div>
  )

  if (vp.compact) {
    return (
      <div className="safe-top pointer-events-none absolute top-0 right-0 left-0 z-30 p-2">
        <div className="panel pointer-events-auto relative flex h-12 items-center gap-2.5 rounded-md px-1.5">
          <button className="btn h-9 px-2.5" onClick={onMenu} title="Realm, armies and war">
            <Menu size={18} />
          </button>
          <Res icon={<Coins size={15} className="text-gold-400" />} value={fmt(s.factions[PLAYER].gold)} sub={`${net >= 0 ? '+' : ''}${net.toFixed(0)}/s`} subClass={net >= 0 ? 'text-emerald-400' : 'text-ember-300'} />
          <Res icon={<Users size={15} className="text-ink-300" />} value={fmt(total(t.all))} sub={`${t.castles} castles`} />
          {vp.w >= 560 && weatherChip}
          {clockText ? (
            <div className={`ml-auto font-display text-[14px] font-bold tabular-nums ${left! < 120 ? 'animate-pulse text-ember-300' : 'text-gold-200'}`}>{clockText}</div>
          ) : (
            <div className="ml-auto hidden text-[12px] leading-tight text-ink-300 min-[460px]:block">{calendar(s.time).split(' · ')[0]}</div>
          )}
          <button className="btn ml-auto h-9 px-2.5 min-[460px]:ml-0" onClick={() => setMore((v) => !v)} title="More">
            <Ellipsis size={16} />
          </button>
          {more && (
            <div className="panel absolute top-[52px] right-0 flex w-52 flex-col gap-1 rounded-md p-2" onClick={() => setMore(false)}>
              <button className="btn justify-start" onClick={onToggleLog}>
                <ScrollText size={15} /> War chronicle
              </button>
              <button className="btn justify-start" onClick={onHelp}>
                <Keyboard size={15} /> Field manual
              </button>
              <button className="btn btn-danger justify-start" onClick={onQuit}>
                <LogOut size={15} /> Leave the war
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute top-0 right-0 left-0 z-30 flex p-3">
      <div className="panel pointer-events-auto flex h-12 items-center gap-4 rounded-md pr-2 pl-4">
        <div className="flex items-center gap-2">
          <Crown size={18} className="text-gold-300" />
          <div className="leading-tight">
            <div className="panel-title">{campaignName}</div>
            <div className="text-[12px] text-ink-400">
              {MODE_NAME[s.rules.mode]} · {s.difficulty}
            </div>
          </div>
        </div>
        <Divider />
        <Res icon={<Coins size={15} className="text-gold-400" />} value={fmt(s.factions[PLAYER].gold)} sub={`${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`} subClass={net >= 0 ? 'text-emerald-400' : 'text-ember-300'} title={`Income +${t.income.toFixed(1)}/s · Army upkeep −${t.upkeep.toFixed(1)}/s`} />
        <Res icon={<Users size={15} className="text-ink-300" />} value={fmt(total(t.all))} sub={`${fmt(t.manpower)} manpower`} title="Soldiers (field + garrisons) and recruitable manpower" />
        <Res icon={<Castle size={15} className="text-ink-300" />} value={String(t.castles)} sub="castles" />
        <Res icon={<Swords size={15} className="text-ink-300" />} value={`${s.stats.battlesWon} / ${s.stats.battlesLost}`} sub="won / lost" />
        <Divider />
        <div className="w-36" title={`Your side ${fmt(A.power)} vs enemy ${fmt(B.power)}`}>
          <div className="mb-1 flex justify-between text-[11px] tracking-wider text-ink-400 uppercase">
            <span>Allies {A.castles}</span>
            <span>Enemy {B.castles}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full">
            <div style={{ width: `${share * 100}%`, background: RELATION_COLOR.self }} />
            <div className="flex-1" style={{ background: RELATION_COLOR.enemy }} />
          </div>
        </div>
        {weatherChip}
        <div className={`flex items-center gap-1.5 text-[13px] ${clockText ? `font-display font-bold tabular-nums ${left! < 120 ? 'animate-pulse text-ember-300' : 'text-gold-200'}` : 'text-ink-200'}`}>
          <Hourglass size={14} className="text-ink-400" />
          {clockText ?? calendar(s.time)}
        </div>
        <Divider />
        <div className="flex items-center gap-1">
          <button className="btn h-9 px-2.5" onClick={onToggleLog} title="War chronicle (L)">
            <ScrollText size={15} />
          </button>
          <button className="btn h-9 px-2.5" onClick={onHelp} title="Field manual (H)">
            <Keyboard size={15} />
          </button>
          <button className="btn btn-danger h-9 px-2.5" onClick={onQuit} title="Leave the war">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-7 w-px bg-white/10" />
}

function Res({ icon, value, sub, subClass, title }: { icon: ReactNode; value: string; sub: string; subClass?: string; title?: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      {icon}
      <div className="leading-tight">
        <div className="text-[15px] font-bold text-ink-100 tabular-nums">{value}</div>
        <div className={`text-[12px] tabular-nums ${subClass ?? 'text-ink-400'}`}>{sub}</div>
      </div>
    </div>
  )
}
