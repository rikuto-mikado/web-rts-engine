import { Castle as CastleIcon, ChevronDown, ChevronsLeft, ChevronsRight, CircleAlert, Coins, Hammer, Handshake, Package, Plus, Swords, Users } from 'lucide-react'
import { useState } from 'react'
import { useViewport } from './viewport'
import { HOLDING_EFFECTS, HOLDINGS, NEUTRAL, PLAYER, type GameEngine } from '../game/engine'
import { FORMATIONS } from '../game/formations'
import { fmt, total, totalInt } from '../game/troops'
import type { Selection } from '../render/GameRenderer'
import { PixelPortrait } from './PixelPortrait'
import { Bar, FormationIcon, RELATION_COLOR, STATUS_TEXT, SectionTitle, StackBar, Tab, UnitGlyph, moraleColor, useEngine } from './common'

interface Props {
  engine: GameEngine
  open: boolean
  setOpen: (v: boolean) => void
  selection: Selection
  onSelect: (s: Selection, focus?: boolean) => void
  onFormArmy: () => void
  onFocusPoint: (x: number, z: number) => void
}

type TabKey = 'realm' | 'armies' | 'war' | 'intrigue'

export function Sidebar({ engine, open, setOpen, selection, onSelect, onFormArmy, onFocusPoint }: Props) {
  useEngine(engine)
  const vp = useViewport()
  const [tab, setTab] = useState<TabKey>('armies')
  const s = engine.state
  const armies = s.armies.filter((a) => a.faction === PLAYER)
  const sieged = s.castles.filter((c) => c.faction === PLAYER && c.battleId).length

  // Active threats: enemy Great Hosts.
  const threats = Object.values(s.factions).filter((f) => f.host && f.host.phase !== 'idle' && engine.relation(f.id) === 'enemy')

  return (
    <div className={`pointer-events-none absolute z-40 flex ${vp.compact ? 'inset-0' : 'top-3 bottom-3 left-3 z-20'}`}>
      {vp.compact && open && <div className="pointer-events-auto absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />}
      <aside
        className={`panel pointer-events-auto relative flex flex-col overflow-hidden transition-all duration-300 ${vp.compact ? 'safe-top h-full rounded-none' : 'rounded-md'} ${open ? (vp.compact ? 'w-[min(88vw,360px)] opacity-100' : 'w-[336px] opacity-100') : 'w-0 border-0 opacity-0'}`}
      >
        <div className="flex min-w-[min(88vw,336px)] gap-1 border-b border-black/60 px-3 pt-3 shadow-[0_1px_0_rgb(209_167_63/0.15)]">
          <Tab active={tab === 'realm'} onClick={() => setTab('realm')} badge={sieged}>
            Realm
          </Tab>
          <Tab active={tab === 'armies'} onClick={() => setTab('armies')}>
            Armies {armies.length > 0 && <span className="text-[11px] opacity-70">{armies.length}</span>}
          </Tab>
          <Tab active={tab === 'war'} onClick={() => setTab('war')} badge={threats.length}>
            War
          </Tab>
          <Tab active={tab === 'intrigue'} onClick={() => setTab('intrigue')}>
            Intrigue
          </Tab>
        </div>

        {/* Alerts: capped so they can never crowd out the tabs below. */}
        <div className="scroll-thin max-h-[38%] min-w-[min(88vw,336px)] shrink-0 overflow-y-auto pb-0.5">
        {threats.map((f) => {
          const h = f.host!
          const host = engine.army(h.hostId)
          return (
            <button
              key={f.id}
              className="mx-2 mt-2 flex min-w-[min(84vw,320px)] items-start gap-2 rounded-lg border border-ember-400/40 bg-ember-700/25 p-2.5 text-left text-xs hover:bg-ember-700/35"
              onClick={() => {
                if (host && engine.canSee(engine.team(PLAYER), host)) onSelect({ kind: 'army', id: host.id }, true)
                else onFocusPoint(h.rallyX, h.rallyZ)
              }}
            >
              <CircleAlert size={16} className="mt-0.5 shrink-0 animate-pulse text-ember-400" />
              <div>
                <div className="font-semibold text-ember-300">{h.phase === 'marching' ? `${f.name}: Great Host on the march!` : `${f.name} is mustering a Great Host`}</div>
                <div className="text-ink-300">
                  {h.phase === 'marching'
                    ? `${host ? fmt(total(host.troops)) + ' soldiers. ' : ''}Defend or meet it in the field.`
                    : `${h.detachmentIds.length} detachment(s) still converging. Intercept them before they merge.`}
                </div>
              </div>
            </button>
          )
        })}

        <MusterCard engine={engine} onFocusPoint={onFocusPoint} />
        <AidCard engine={engine} onFocusPoint={onFocusPoint} />
        </div>

        <div className="scroll-thin min-w-[min(88vw,336px)] flex-1 overflow-y-auto p-3">
          {tab === 'realm' && <RealmTab engine={engine} selection={selection} onSelect={onSelect} />}
          {tab === 'armies' && <ArmiesTab engine={engine} selection={selection} onSelect={onSelect} onFormArmy={onFormArmy} />}
          {tab === 'war' && <WarTab engine={engine} onFocusPoint={onFocusPoint} />}
          {tab === 'intrigue' && <IntrigueTab engine={engine} onSelect={onSelect} />}
        </div>
      </aside>
      {!vp.compact && (
        <button
          onClick={() => setOpen(!open)}
          className="panel pointer-events-auto mt-2 ml-1 grid h-10 w-7 place-items-center self-start rounded-r-md text-gold-300 hover:text-gold-200"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
        </button>
      )}
    </div>
  )
}

function MusterCard({ engine, onFocusPoint }: { engine: GameEngine; onFocusPoint: (x: number, z: number) => void }) {
  const musters = engine.state.musters.filter((m) => m.team === 'A')
  const [joinArmy, setJoinArmy] = useState<Record<string, string>>({})
  if (musters.length === 0) return null
  const mine = engine.state.armies.filter((a) => a.faction === PLAYER && !a.vassalOf && !a.battleId && a.status !== 'retreating' && !engine.musterOf(a.id))
  return (
    <div className="mx-2 mt-2 min-w-[min(84vw,320px)] space-y-1.5">
      {musters.map((m) => {
        const st = engine.musterStatus(m.id)
        if (!st) return null
        const own = m.organizer === PLAYER
        const left = Math.max(0, Math.ceil(m.deadline - engine.state.time))
        const pick = joinArmy[m.id] ?? mine[0]?.id ?? ''
        return (
          <div key={m.id} className="rounded-sm border border-teal-400/40 bg-teal-700/20 p-2.5 text-[13px]">
            <button className="flex w-full items-start gap-2 text-left" onClick={() => onFocusPoint(m.rallyX, m.rallyZ)}>
              <Handshake size={16} className="mt-0.5 shrink-0 text-teal-300" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-teal-200">
                  {m.phase === 'gathering' ? 'Muster' : 'Marching'} → {st.target?.name}
                </div>
                <div className="text-[12px] text-ink-400">Called by {own ? 'you' : engine.factionName(m.organizer)}</div>
                <div className="text-ink-300">
                  {m.phase === 'gathering'
                    ? `${st.arrived} gathered · ${st.enRoute} on the way · ${fmt(st.soldiers)} soldiers · ≤${left}s`
                    : `${fmt(st.soldiers)} soldiers advancing together.`}
                </div>
              </div>
            </button>
            {m.phase === 'gathering' && own && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button className="btn btn-gold py-1 text-[13px]" disabled={st.arrived === 0} onClick={() => engine.launchMuster(m.id)}>
                  <Swords size={12} /> March now
                </button>
                <button className="btn py-1 text-[13px]" onClick={() => engine.cancelMuster(m.id)}>
                  Dismiss
                </button>
              </div>
            )}
            {m.phase === 'gathering' && !own && mine.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                <select
                  value={pick}
                  onChange={(e) => setJoinArmy({ ...joinArmy, [m.id]: e.target.value })}
                  className="well min-w-0 flex-1 rounded-sm px-2 py-1 text-[12px] outline-none"
                >
                  {mine.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({fmt(total(a.troops))})
                    </option>
                  ))}
                </select>
                <button className="btn py-1 text-[13px]" onClick={() => pick && engine.joinMuster(m.id, pick)}>
                  Join
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Allied lords calling for aid: send one of your armies to stand in their castle. */
function AidCard({ engine, onFocusPoint }: { engine: GameEngine; onFocusPoint: (x: number, z: number) => void }) {
  const team = engine.team(PLAYER)
  const [pickFor, setPickFor] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  // Only calls your armies could reasonably answer: within reach of one of your castles, nearest first.
  const homes = engine.state.castles.filter((c) => c.faction === PLAYER && !c.village)
  const reach = engine.aidReach()
  const near = (engine.state.aidCalls ?? [])
    .filter((c) => c.team === team && c.faction !== PLAYER)
    .map((call) => {
      const c = engine.castle(call.castleId)
      const d = c ? Math.min(...homes.map((h) => Math.hypot(h.x - c.x, h.z - c.z))) : Infinity
      return { call, d }
    })
    .filter((x) => x.d <= reach)
    .sort((x, y) => x.d - y.d)
  const calls = near.slice(0, 3).map((x) => x.call)
  const more = near.length - calls.length
  if (calls.length === 0) return null
  const mine = engine.state.armies.filter((a) => a.faction === PLAYER && !a.vassalOf && !a.battleId && a.status !== 'retreating' && !engine.musterOf(a.id))
  const header = (
    <button
      className="flex w-full items-center gap-2 rounded-sm border border-amber-400/40 bg-amber-700/15 px-2.5 py-1.5 text-left text-[13px] hover:bg-amber-700/25"
      onClick={() => setOpen(!open)}
      title={open ? 'Fold away' : 'Show the calls'}
    >
      <CircleAlert size={15} className="shrink-0 text-amber-300" />
      <span className="flex-1 truncate font-semibold text-amber-200">
        Allies call for aid · {near.length}
      </span>
      {!open && <span className="truncate text-[12px] text-ink-400">{engine.castle(calls[0].castleId)?.name}{near.length > 1 ? ' …' : ''}</span>}
      <ChevronDown size={14} className={`shrink-0 text-amber-300 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
  if (!open) return <div className="mx-2 mt-2 min-w-[min(84vw,320px)]">{header}</div>
  return (
    <div className="mx-2 mt-2 min-w-[min(84vw,320px)] space-y-1.5">
      {header}
      {calls.map((call) => {
        const c = engine.castle(call.castleId)
        if (!c) return null
        const helpers = call.armyIds.map((id) => engine.army(id)).filter((a) => !!a)
        const mineThere = engine.state.armies.filter((a) => a.faction === PLAYER && a.order.type === 'station' && a.order.castleId === c.id)
        const left = Math.max(0, Math.ceil(call.until - engine.state.time))
        const threat = engine.threatTo(c)
        const pick = pickFor[call.id] ?? mine.find((a) => !mineThere.includes(a))?.id ?? ''
        return (
          <div key={call.id} className="rounded-sm border border-amber-400/40 bg-amber-700/15 p-2.5 text-[13px]">
            <button className="flex w-full items-start gap-2 text-left" onClick={() => onFocusPoint(c.x, c.z)}>
              <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-amber-200">Aid needed · {c.name}</div>
                <div className="text-[12px] text-ink-400">Called by {engine.factionName(call.faction)} · ≤{left}s</div>
                <div className="text-ink-300">
                  {threat > 0 ? `~${fmt(threat)} enemies near · ` : c.battleId ? 'Under siege · ' : ''}
                  {helpers.length + mineThere.length} {helpers.length + mineThere.length === 1 ? 'contingent' : 'contingents'} standing by
                </div>
              </div>
            </button>
            {mine.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                <select
                  value={pick}
                  onChange={(e) => setPickFor({ ...pickFor, [call.id]: e.target.value })}
                  className="well min-w-0 flex-1 rounded-sm px-2 py-1 text-[12px] outline-none"
                >
                  {mine.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({fmt(total(a.troops))})
                    </option>
                  ))}
                </select>
                <button className="btn py-1 text-[13px]" onClick={() => pick && engine.sendAid(call.id, pick)}>
                  Send
                </button>
              </div>
            )}
          </div>
        )
      })}
      {more > 0 && <p className="px-1 text-[12px] text-ink-400">+{more} more {more === 1 ? 'call' : 'calls'} for aid farther away</p>}
    </div>
  )
}

function RealmTab({ engine, selection, onSelect }: { engine: GameEngine; selection: Selection; onSelect: Props['onSelect'] }) {
  const s = engine.state
  const totals = engine.totals(PLAYER)
  const allN = total(totals.all)
  const castles = s.castles.filter((c) => c.faction === PLAYER)
  const fortresses = castles.filter((c) => !c.village)
  const vassals = castles.filter((c) => c.village && !c.ruined)
  const depots = (s.outposts ?? []).filter((o) => o.faction === PLAYER && o.kind === 'depot')
  const tribute = vassals.reduce((sum, c) => sum + engine.tributeRate(c), 0)
  const net = totals.income - totals.upkeep
  return (
    <div className="space-y-5">
      <RankCard engine={engine} power={totals.totalPower} />
      <section>
        <SectionTitle right={<span className={`text-[12px] font-bold tabular-nums ${net >= 0 ? 'text-emerald-400' : 'text-ember-300'}`}>{net >= 0 ? '+' : ''}{net.toFixed(1)}/s</span>}>Treasury</SectionTitle>
        <div className="well space-y-1 rounded-lg px-2.5 py-2 text-[13px]">
          <Ledger label={`Castle rents · ${fortresses.length} ${fortresses.length === 1 ? 'castle' : 'castles'}`} value={totals.income} />
          <Ledger label={`Tribute by wagon · ${vassals.length} ${vassals.length === 1 ? 'vassal' : 'vassals'}`} value={tribute} note="arrives in loads" />
          <Ledger label="Army upkeep · Royal Guard free" value={-totals.upkeep} />
        </div>
      </section>
      <section>
        <SectionTitle>Total strength</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="Soldiers" value={fmt(allN)} />
          <Metric label="Power" value={fmt(totals.totalPower)} accent />
          <Metric label="Manpower" value={fmt(totals.manpower)} />
        </div>
        <div className="mt-2.5 space-y-1.5">
          {engine.unitList.map((u) => {
            const n = totals.all[u.key] ?? 0
            const field = totals.field[u.key] ?? 0
            return (
              <div key={u.key} className="flex items-center gap-2 text-xs" title={`${fmt(field)} in the field, ${fmt(n - field)} in garrisons`}>
                <UnitGlyph unit={u.key} size={14} color={u.color} />
                <span className="w-24 truncate text-ink-200">{u.name}</span>
                <div className="flex-1">
                  <Bar value={n} max={Math.max(1, allN * 0.45)} color={u.color} />
                </div>
                <span className="w-11 text-right text-ink-100 tabular-nums">{fmt(n)}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">{fortresses.length} held</span>}>Castles</SectionTitle>
        <div className="space-y-1">
          {fortresses.map((c) => {
            const sel = selection?.kind === 'castle' && selection.id === c.id
            const n = total(c.garrison)
            return (
              <button
                key={c.id}
                onClick={() => onSelect({ kind: 'castle', id: c.id }, true)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${sel ? 'bg-gold-500/10 ring-1 ring-gold-400/60' : 'well hover:bg-white/6'}`}
              >
                <div className="flex items-center gap-2">
                  <CastleIcon size={14} className={c.battleId ? 'animate-pulse text-ember-400' : 'text-royal-300'} />
                  <span className="flex-1 font-medium">
                    {c.name} <span className="text-[12px] text-ink-500">T{c.tier}</span>
                  </span>
                  {c.autoRecruit && <Hammer size={11} className="text-gold-400" />}
                  {c.battleId && <span className="rounded bg-ember-500 px-1 text-[11px] font-bold">SIEGE</span>}
                  <span className="text-ink-300 tabular-nums">
                    <Users size={11} className="mr-1 inline" />
                    {fmt(n)}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={n} max={engine.capacity(c)} color="#5f93ec" height={2} />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">{vassals.length} sworn</span>}>Vassal holdings</SectionTitle>
        {vassals.length === 0 && <p className="text-[12px] leading-snug text-ink-500">No village has sworn to you yet. Win one over by envoy (Intrigue tab or its panel), or take it by force.</p>}
        <div className="space-y-1">
          {vassals.map((c) => {
            const H = HOLDINGS[engine.holdingOf(c)]
            const sel = selection?.kind === 'castle' && selection.id === c.id
            const rate = engine.tributeRate(c)
            return (
              <button
                key={c.id}
                onClick={() => onSelect({ kind: 'castle', id: c.id }, true)}
                title={H.blurb}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${sel ? 'bg-gold-500/10 ring-1 ring-gold-400/60' : 'well hover:bg-white/6'}`}
              >
                <span className="w-4 text-center">{H.icon}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.name} <span className="text-[12px] text-ink-500">{H.name}{c.tier >= 2 ? ' · walled' : ''}</span>
                </span>
                {c.battleId && <span className="rounded bg-ember-500 px-1 text-[11px] font-bold">SIEGE</span>}
                <span className="text-[12px] text-gold-300 tabular-nums">{rate > 0 ? `+${rate.toFixed(1)}/s` : ''}</span>
                <span className="w-10 text-right text-ink-300 tabular-nums">{fmt(total(c.garrison))}</span>
              </button>
            )
          })}
        </div>
      </section>

      {depots.length > 0 && (
        <section>
          <SectionTitle right={<span className="text-[12px] text-ink-500">stores · quartered</span>}>Supply depots</SectionTitle>
          <div className="space-y-1">
            {depots.map((o) => {
              const sel = selection?.kind === 'outpost' && selection.id === o.id
              const stock = Math.round(o.stock ?? 0)
              return (
                <button
                  key={o.id}
                  onClick={() => onSelect({ kind: 'outpost', id: o.id }, true)}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${sel ? 'bg-gold-500/10 ring-1 ring-gold-400/60' : 'well hover:bg-white/6'}`}
                >
                  <div className="flex items-center gap-2">
                    <Package size={13} className={o.progress < 1 ? 'text-ink-500' : stock < 25 ? 'text-ember-400' : 'text-gold-400'} />
                    <span className="flex-1 truncate font-medium">{o.name}</span>
                    {o.progress < 1 ? (
                      <span className="text-[12px] text-ink-400">building {Math.round(o.progress * 100)}%</span>
                    ) : (
                      <span className={`tabular-nums ${stock < 25 ? 'text-ember-300' : 'text-ink-300'}`}>{stock}%</span>
                    )}
                    <span className="w-10 text-right text-ink-300 tabular-nums">{fmt(total(o.garrison ?? {}))}</span>
                  </div>
                  {o.progress >= 1 && (
                    <div className="mt-1">
                      <Bar value={stock} max={100} color={stock < 25 ? '#e0603a' : '#d1a73f'} height={2} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function ArmiesTab({ engine, selection, onSelect, onFormArmy }: { engine: GameEngine; selection: Selection; onSelect: Props['onSelect']; onFormArmy: () => void }) {
  const s = engine.state
  const armies = s.armies.filter((a) => a.faction === PLAYER)
  const commanders = engine.content.commanders.filter((c) => s.commanders[c.key]?.owner === PLAYER)
  return (
    <div className="space-y-5">
      <section>
      <button className="btn btn-gold mb-3 w-full py-2" onClick={onFormArmy}>
        <Plus size={14} /> Muster a new army <kbd className="ml-1 rounded bg-black/20 px-1 text-[12px]">F</kbd>
      </button>
      {armies.length === 0 && <p className="text-center text-xs leading-relaxed text-ink-400">No armies in the field. Draw troops from a castle garrison to form one.</p>}
      <div className="space-y-1.5">
        {armies.map((a) => {
          const cmd = engine.commanderOf(a)
          const sel = selection?.kind === 'army' && selection.id === a.id
          const n = totalInt(a.troops)
          const target = 'castleId' in a.order ? engine.castle(a.order.castleId)?.name : a.order.type === 'join' ? engine.army(a.order.armyId)?.name : null
          return (
            <button
              key={a.id}
              onClick={() => onSelect({ kind: 'army', id: a.id }, true)}
              className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${sel ? 'border-gold-400/70 bg-gold-500/10' : 'border-white/6 well hover:bg-white/6'}`}
            >
              <div className="flex items-center gap-2">
                {cmd ? (
                  <PixelPortrait spec={cmd.portrait} size={30} className="ring-1 ring-white/10" />
                ) : (
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-white/6">
                    <Swords size={14} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{a.name}</span>
                    <span className="text-xs font-semibold text-gold-300 tabular-nums">{fmt(n)}</span>
                  </div>
                  <div className="flex items-center gap-1 truncate text-[13px] text-ink-400">
                    <span className={a.status === 'battle' || a.status === 'sieging' ? 'text-ember-300' : a.status === 'retreating' ? 'text-ink-300' : ''}>{STATUS_TEXT[a.status]}</span>
                    {target && a.status !== 'retreating' && <span className="truncate">→ {target}</span>}
                  </div>
                </div>
                <span className="text-ink-400" title={FORMATIONS[a.formation].name}>
                  <FormationIcon formation={a.column && a.status === 'marching' ? 'column' : a.formation} size={18} />
                </span>
              </div>
              <div className="mt-1.5">
                <StackBar troops={a.troops} units={engine.unitList} height={4} />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[12px] text-ink-500">Morale</span>
                <Bar value={a.morale} max={100} color={moraleColor(a.morale)} height={3} />
                <span className="w-8 text-right text-[12px] text-ink-300 tabular-nums">{Math.round((n / Math.max(1, a.initialTotal)) * 100)}%</span>
              </div>
            </button>
          )
        })}
      </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">{commanders.filter((c) => !s.commanders[c.key].armyId && !s.commanders[c.key].stationedAt && s.commanders[c.key].woundedUntil <= s.time).length} ready</span>}>Commanders</SectionTitle>
        <div className="space-y-1">
          {commanders.map((c) => {
            const st = s.commanders[c.key]
            const wound = Math.max(0, Math.ceil(st.woundedUntil - s.time))
            const army = st.armyId ? engine.army(st.armyId) : undefined
            const depot = st.stationedAt ? engine.outpost(st.stationedAt) : undefined
            const keep = army && engine.inKeep(army) && 'castleId' in army.order ? engine.castle(army.order.castleId) : undefined
            const status = wound > 0 ? `Wounded · ${Math.floor(wound / 60)}:${String(wound % 60).padStart(2, '0')}` : keep ? `In the keep at ${keep.name}` : army ? `In the field · ${army.royal ? 'Royal Guard' : STATUS_TEXT[army.status]}` : depot ? `Quartered at ${depot.name}` : 'Ready to lead'
            const tone = wound > 0 ? 'text-ember-300' : keep ? 'text-gold-300' : army ? 'text-royal-300' : depot ? 'text-ink-300' : 'text-emerald-400'
            return (
              <button
                key={c.key}
                onClick={() => (army ? onSelect({ kind: 'army', id: army.id }, true) : depot ? onSelect({ kind: 'outpost', id: depot.id }, true) : onFormArmy())}
                title={`${c.name}, ${c.title}\n+ ${c.strengths.join('\n+ ')}\n− ${c.weaknesses.join('\n− ')}`}
                className={`well flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/6 ${wound > 0 ? 'opacity-70' : ''}`}
              >
                <PixelPortrait spec={c.portrait} size={30} className={`ring-1 ring-white/10 ${wound > 0 ? 'grayscale' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <span className="truncate">{c.name}</span>
                    {st.level > 1 && <span className="text-[11px] text-gold-300">{'★'.repeat(Math.min(st.level, 5) - 1)}</span>}
                  </div>
                  <div className={`truncate text-[12px] ${tone}`}>{status}</div>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function WarTab({ engine, onFocusPoint }: { engine: GameEngine; onFocusPoint: (x: number, z: number) => void }) {
  const s = engine.state
  const A = engine.teamPower('A')
  const B = engine.teamPower('B')
  const share = A.power / Math.max(1, A.power + B.power)
  const realms = Object.values(s.factions).filter((f) => f.team !== 'N')
  const row = (fid: string) => {
    const f = s.factions[fid]
    const castles = s.castles.filter((c) => c.faction === fid)
    const p = castles.reduce((sum, c) => sum + total(c.garrison), 0) + s.armies.filter((a) => a.faction === fid).reduce((sum, a) => sum + total(a.troops), 0)
    const cap = engine.castle(f.capitalId) ?? castles[0]
    const pactLeft = Math.max(0, (s.pacts[fid] ?? 0) - s.time)
    return (
      <div key={fid} className={`rounded-sm px-2 py-1 ${!f.alive ? 'opacity-35' : ''}`}>
        <button onClick={() => cap && onFocusPoint(cap.x, cap.z)} className={`flex w-full items-center gap-2 text-left text-[13px] hover:brightness-125 ${!f.alive ? 'line-through' : ''}`}>
          <i className="size-2.5 shrink-0 rounded-sm" style={{ background: f.color }} />
          <span className={`flex-1 truncate ${fid === PLAYER ? 'font-bold text-royal-300' : ''}`}>
            {f.leader && <span className="mr-1 text-gold-300">♛</span>}
            {fid === PLAYER ? `${f.name} (you)` : f.name}
          </span>
          <span className="w-7 text-center text-[11px] font-bold text-gold-300 tabular-nums" title="Realm rank">{f.alive ? engine.rankOf(fid) : '–'}</span>
          <span className="w-5 text-right text-ink-400 tabular-nums">{castles.length}</span>
          <span className="w-12 text-right text-ink-300 tabular-nums">~{fmt(Math.round(p / 50) * 50)}</span>
        </button>
        {f.alive && pactLeft > 0 && <div className="pl-4.5 text-[12px] text-teal-300">🕊 Truce {Math.floor(pactLeft / 60)}:{String(Math.floor(pactLeft % 60)).padStart(2, '0')}</div>}
      </div>
    )
  }
  const goals = s.rules.victoryCastles.map((id) => engine.castle(id)).filter(Boolean)
  const guard = s.rules.defeatCastles.map((id) => engine.castle(id)).filter(Boolean)
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Balance of power</SectionTitle>
        <div className="flex h-3 overflow-hidden rounded-full">
          <div style={{ width: `${share * 100}%`, background: RELATION_COLOR.self }} />
          <div className="flex-1" style={{ background: RELATION_COLOR.enemy }} />
        </div>
        <div className="mt-1 flex justify-between text-[13px] tabular-nums">
          <span className="text-royal-300">
            {A.castles} castles · {fmt(A.power)}
          </span>
          <span className="text-ember-300">
            {fmt(B.power)} · {B.castles} castles
          </span>
        </div>
      </section>
      {Object.values(s.factions).filter((f) => f.team === 'A').length > 1 && (
        <section>
          <SectionTitle right={<span className="text-[12px] text-ink-500">kills · castles</span>}>War honours</SectionTitle>
          <div className="space-y-0.5">
            {engine
              .honours('A')
              .slice(0, 8)
              .map((h, i) => (
                <div key={h.id} className={`flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] ${h.id === PLAYER ? 'bg-gold-500/15 outline outline-1 outline-gold-400/50' : ''}`}>
                  <span className={`w-5 text-center font-display font-bold ${i === 0 ? 'text-gold-300' : 'text-ink-400'}`}>{i + 1}</span>
                  <i className="size-2.5 shrink-0 rounded-sm" style={{ background: h.color }} />
                  <span className={`flex-1 truncate ${h.id === PLAYER ? 'font-bold text-gold-100' : ''}`}>{h.id === PLAYER ? `${h.name} (you)` : h.name}</span>
                  <span className="text-ink-300 tabular-nums">{fmt(h.kills)}</span>
                  <span className="w-6 text-right text-ink-400 tabular-nums">{h.captures}</span>
                </div>
              ))}
          </div>
          {engine.honours('A').findIndex((h) => h.id === PLAYER) >= 8 && <p className="mt-1 text-[12px] text-ink-500">Your rank: {engine.honours('A').findIndex((h) => h.id === PLAYER) + 1}</p>}
        </section>
      )}

      <section>
        <SectionTitle>Objectives</SectionTitle>
        <div className="space-y-1 text-xs">
          {goals.map((c) => (
            <button key={c!.id} onClick={() => onFocusPoint(c!.x, c!.z)} className="flex w-full items-center gap-2 rounded-md well px-2 py-1.5 text-left hover:bg-white/6">
              <span className={engine.team(c!.faction) === 'A' ? 'text-emerald-400' : 'text-gold-300'}>{engine.team(c!.faction) === 'A' ? '✓' : '⚔'}</span>
              Take <b>{c!.name}</b>
              <span className="ml-auto text-[12px] text-ink-500">{engine.factionName(c!.faction)}</span>
            </button>
          ))}
          {guard.map((c) => (
            <button key={c!.id} onClick={() => onFocusPoint(c!.x, c!.z)} className="flex w-full items-center gap-2 rounded-md well px-2 py-1.5 text-left hover:bg-white/6">
              <span className="text-royal-300">🛡</span>
              Hold <b>{c!.name}</b>
              {c!.battleId && <span className="ml-auto rounded bg-ember-500 px-1 text-[11px] font-bold">SIEGE</span>}
            </button>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">rank · castles · soldiers</span>}>Your alliance</SectionTitle>
        <div>{realms.filter((f) => f.team === 'A').sort((a, b) => (a.id === PLAYER ? -1 : b.id === PLAYER ? 1 : 0)).map((f) => row(f.id))}</div>
      </section>
      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">rank · castles · soldiers</span>}>Enemy realms</SectionTitle>
        <div>{realms.filter((f) => f.team === 'B').map((f) => row(f.id))}</div>
      </section>
    </div>
  )
}

/** Truces, bribes, free towns and villages to win over, and the infamy that makes all of it dearer. */
function IntrigueTab({ engine, onSelect }: { engine: GameEngine; onSelect: Props['onSelect'] }) {
  const s = engine.state
  const me = s.factions[PLAYER]
  const gold = me.gold
  const [msg, setMsg] = useState<string | null>(null)
  const act = (fn: () => string | null) => setMsg(fn())
  const infamy = me.infamy ?? 0
  const abbeys = s.castles.filter((c) => c.faction === PLAYER && !c.ruined && engine.holdingOf(c) === 'abbey' && c.village)
  const nextCleanse = abbeys.length ? Math.min(...abbeys.map((c) => c.nextCleanseAt ?? s.time + HOLDING_EFFECTS.abbeyCleanse)) - s.time : null
  const lords = Object.values(s.factions).filter((f) => f.team === 'B' && f.alive && !f.leader)
  const home = engine.castle(me.capitalId)
  const dist = (x: number, z: number) => (home ? Math.hypot(home.x - x, home.z - z) : 0)
  // Only what your scouts have seen: free towns, and villages your envoys can reach.
  const towns = s.castles.filter((c) => c.faction === NEUTRAL && !c.village && !c.ruined && engine.isExplored(c.x, c.z)).sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z))
  const villages = s.castles
    .filter((c) => c.faction === NEUTRAL && c.village && !c.ruined && engine.isExplored(c.x, c.z))
    .map((c) => ({ c, t: engine.villageTerms(c.id) }))
    .filter((v) => !v.t.reason || v.t.reason.startsWith('Needs') || v.t.reason.startsWith('The elders'))
    .sort((a, b) => dist(a.c.x, a.c.z) - dist(b.c.x, b.c.z))
    .slice(0, 8)
  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
  return (
    <div className="space-y-5">
      {msg && (
        <button className="w-full rounded-sm border border-ember-400/40 bg-ember-700/20 px-2.5 py-1.5 text-left text-[12px] text-ember-200" onClick={() => setMsg(null)}>
          {msg}
        </button>
      )}
      <section>
        <SectionTitle right={<span className={`text-[12px] font-bold ${infamy >= 3 ? 'text-ember-300' : infamy > 0 ? 'text-gold-300' : 'text-emerald-400'}`}>{infamy === 0 ? 'Good name' : infamy >= 3 ? 'Notorious' : 'Distrusted'}</span>}>Infamy</SectionTitle>
        <div className="well rounded-lg px-2.5 py-2 text-[13px]">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.max(5, infamy) }, (_, i) => (
              <i key={i} className={`h-2.5 flex-1 rounded-sm ${i < infamy ? (infamy >= 3 ? 'bg-ember-400' : 'bg-gold-400') : 'bg-white/8'}`} />
            ))}
            <span className="ml-1.5 w-5 text-right font-bold tabular-nums">{infamy}</span>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-400">
            {infamy > 0 ? `Villages ask ${Math.round(infamy * 35)}% more gold, and their odds of agreeing fall by ${infamy * 14} points.` : 'Villages deal with you fairly.'} Plundering a village adds 1 (an abbey, 2).
          </p>
          {abbeys.length > 0 ? (
            <div className="mt-1.5">
              <div className="flex justify-between text-[12px] text-ink-300">
                <span>⛪ Abbey prayers ({abbeys.length})</span>
                <span className="tabular-nums">{infamy > 0 && nextCleanse !== null ? `−1 in ${clock(Math.max(0, nextCleanse))}` : 'nothing to forgive'}</span>
              </div>
              {infamy > 0 && nextCleanse !== null && (
                <div className="mt-1">
                  <Bar value={HOLDING_EFFECTS.abbeyCleanse - Math.max(0, nextCleanse)} max={HOLDING_EFFECTS.abbeyCleanse} color="#5fb7a6" height={3} />
                </div>
              )}
            </div>
          ) : (
            infamy > 0 && <p className="mt-1 text-[12px] text-ink-500">Hold an abbey and its monks will pray a point away every 3 minutes.</p>
          )}
        </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">{fmt(gold)}g in hand</span>}>Enemy lords</SectionTitle>
        <p className="mb-1.5 text-[12px] leading-snug text-ink-500">
          A truce buys 4 minutes of peace with one lord.{s.rules.mode === 'alliance' ? ' Gold can also turn a lord to your side; the harder your castles press him, the likelier. A refusal costs 40% of the bribe.' : ''}
        </p>
        {lords.length === 0 && <p className="text-[12px] text-ink-500">No lord will treat with you.</p>}
        <div className="space-y-1">
          {lords.map((f) => {
            const pactLeft = Math.max(0, (s.pacts[f.id] ?? 0) - s.time)
            const cooldown = Math.max(0, (s.diploCooldown[f.id] ?? 0) - s.time)
            const pact = engine.pactOffer(f.id)
            const bribe = engine.bribeOffer(f.id)
            return (
              <div key={f.id} className="well rounded-lg px-2.5 py-1.5 text-[13px]">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 shrink-0 rounded-sm" style={{ background: f.color }} />
                  <span className="flex-1 truncate font-medium">{f.name}</span>
                  <span className="text-[12px] text-ink-400 tabular-nums">{s.castles.filter((c) => c.faction === f.id && !c.village).length} castles</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {pactLeft > 0 ? (
                    <span className="rounded-sm bg-teal-700/30 px-1.5 py-0.5 text-[12px] text-teal-200">🕊 Truce · {clock(pactLeft)} left</span>
                  ) : cooldown > 0 ? (
                    <span className="text-[12px] text-ink-500">Envoys refused · {clock(cooldown)}</span>
                  ) : (
                    <>
                      {pact && (
                        <button className="btn h-auto min-h-0 px-2 py-0.5 text-[12px]" disabled={gold < pact.price} onClick={() => act(() => engine.signPact(f.id))} title="They will not attack your lands or armies for 4 minutes">
                          🕊 Truce · {fmt(pact.price)}g
                        </button>
                      )}
                      {bribe && (
                        <button className="btn h-auto min-h-0 px-2 py-0.5 text-[12px]" disabled={gold < bribe.price} onClick={() => act(() => engine.bribeLord(f.id))} title="Pay them to join your alliance. If they refuse, 40% of the gold is lost.">
                          💰 Turn · {fmt(bribe.price)}g
                        </button>
                      )}
                      {bribe && (
                        <span className={`ml-auto text-[12px] font-bold tabular-nums ${bribe.chance >= 0.6 ? 'text-emerald-400' : bribe.chance >= 0.4 ? 'text-gold-300' : 'text-ink-400'}`} title="Chance they accept the bribe">
                          {Math.round(bribe.chance * 100)}%
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">{towns.length} known</span>}>Free towns</SectionTitle>
        {towns.length === 0 && <p className="text-[12px] text-ink-500">Your scouts know of no free town that is for sale.</p>}
        <div className="space-y-1">
          {towns.map((c) => {
            const price = engine.townPrice(c)
            return (
              <div key={c.id} className="well flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left hover:brightness-125" onClick={() => onSelect({ kind: 'castle', id: c.id }, true)}>
                  <CastleIcon size={13} className="shrink-0 text-ink-300" />
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="text-[12px] text-ink-500 tabular-nums">T{c.tier} · {fmt(total(c.garrison))}</span>
                </button>
                <button className="btn h-auto min-h-0 px-2 py-0.5 text-[12px]" disabled={gold < price || !!c.battleId} onClick={() => act(() => engine.buyTown(c.id))}>
                  <Coins size={11} /> {fmt(price)}g
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle right={<span className="text-[12px] text-ink-500">price · odds</span>}>Villages within reach</SectionTitle>
        {villages.length === 0 && <p className="text-[12px] leading-snug text-ink-500">No free village your envoys can reach. Bring an army near one, or hold a castle close by.</p>}
        <div className="space-y-1">
          {villages.map(({ c, t }) => {
            const H = HOLDINGS[engine.holdingOf(c)]
            const wait = t.reason?.startsWith('The elders')
            return (
              <div key={c.id} className="well flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left hover:brightness-125" onClick={() => onSelect({ kind: 'castle', id: c.id }, true)} title={H.blurb}>
                  <span className="w-4 shrink-0 text-center">{H.icon}</span>
                  <span className="truncate font-medium">{c.name}</span>
                  <span className={`text-[12px] font-bold tabular-nums ${t.chance >= 0.6 ? 'text-emerald-400' : t.chance >= 0.4 ? 'text-gold-300' : 'text-ink-400'}`}>{Math.round(t.chance * 100)}%</span>
                </button>
                {wait ? (
                  <span className="text-[12px] text-ink-500">{t.reason!.match(/\d+s/)?.[0]}</span>
                ) : (
                  <button className="btn h-auto min-h-0 px-2 py-0.5 text-[12px]" disabled={!!t.reason} onClick={() => act(() => engine.negotiateVillage(c.id))} title="Send envoys: on success the village swears to you; on refusal, part of the gold is lost.">
                    ✉ {fmt(t.price)}g
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Ledger({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-1 truncate text-ink-300">{label}</span>
      {note && <span className="text-[11px] text-ink-500">{note}</span>}
      <span className={`w-14 text-right font-semibold tabular-nums ${value >= 0 ? 'text-ink-100' : 'text-ember-300'}`}>
        {value >= 0 ? '+' : '−'}
        {Math.abs(value).toFixed(1)}/s
      </span>
    </div>
  )
}

/** Realm rank: a plain read of how strong the realm is, and how far to the next rank. */
function RankCard({ engine, power }: { engine: GameEngine; power: number }) {
  const rank = engine.rankOf(PLAYER)
  const max = engine.maxRank
  const lo = engine.rankThreshold(rank)
  const hi = rank < max ? engine.rankThreshold(rank + 1) : null
  const pct = hi ? Math.max(0, Math.min(1, (power - lo) / Math.max(1, hi - lo))) : 1
  return (
    <section className="well flex items-center gap-3 rounded-sm px-3 py-2.5">
      <div className="grid size-12 shrink-0 place-items-center rounded-sm border border-gold-400/50 bg-black/30">
        <div className="text-center leading-none">
          <div className="text-[9px] tracking-[0.18em] text-gold-400">RANK</div>
          <div className="font-display text-[22px] font-bold text-gold-200">{rank}</div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-bold text-ink-100">Realm rank {rank} of {max}</span>
          <span className="text-ink-400 tabular-nums">{hi ? `${fmt(power)} / ${fmt(hi)}` : 'Highest'}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-1 text-[12px] text-ink-500">{hi ? 'Grows with your total strength. Your castles grow grander with each rank.' : 'Your castles stand at their grandest.'}</div>
      </div>
    </section>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg well px-2.5 py-1.5">
      <div className="text-[11px] tracking-wider text-ink-400 uppercase">{label}</div>
      <div className={`text-base font-bold tabular-nums ${accent ? 'text-gold-300' : 'text-ink-100'}`}>{value}</div>
    </div>
  )
}
