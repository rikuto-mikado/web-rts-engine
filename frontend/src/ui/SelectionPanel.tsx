import { CircleArrowUp, Castle as CastleIcon, Coins, Combine, Flag, Hammer, Handshake, House, Megaphone, Scissors, Shield, Swords, Tent, Undo2, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  OUTPOST,
  PLAYER,
  RECRUIT_TEMPLATES,
  capacityForTier,
  incomeForTier,
  manpowerRegenForTier,
  maxManpowerForTier,
  upgradeCost,
  type GameEngine,
} from '../game/engine'
import { COLUMN, FORMATIONS, FORMATION_ORDER } from '../game/formations'
import { OUTPOST_KINDS } from '../game/outposts'
import { TRAIT_MAP } from '../game/traits'
import { fmt, total, totalInt } from '../game/troops'
import type { Army, Battle, Castle, Outpost } from '../game/types'
import type { Selection } from '../render/GameRenderer'
import { useViewport } from './viewport'
import { OutpostArt } from './art'
import { PixelPortrait } from './PixelPortrait'
import { Bar, FormationIcon, STATUS_TEXT, SectionTitle, Slider, StackBar, UnitGlyph, moraleColor, useEngine } from './common'

interface Props {
  engine: GameEngine
  selection: Selection
  onSelect: (s: Selection, focus?: boolean) => void
  onFormArmy: (castleId?: string, targetId?: string) => void
  toast: (msg: string) => void
}

export function SelectionPanel({ engine, selection, onSelect, onFormArmy, toast }: Props) {
  useEngine(engine)
  if (!selection) return null
  const close = () => onSelect(null)
  if (selection.kind === 'army') {
    const a = engine.army(selection.id)
    if (!a) return null
    return (
      <Shell onClose={close}>
        {a.faction === PLAYER ? <PlayerArmy engine={engine} army={a} toast={toast} onSelect={onSelect} /> : <OtherArmy engine={engine} army={a} onSelect={onSelect} />}
      </Shell>
    )
  }
  if (selection.kind === 'outpost') {
    const o = engine.outpost(selection.id)
    if (!o) return null
    return (
      <Shell onClose={close}>
        <OutpostPanel engine={engine} outpost={o} onSelect={onSelect} />
      </Shell>
    )
  }
  const c = engine.castle(selection.id)
  if (!c) return null
  return (
    <Shell onClose={close}>
      {c.faction === PLAYER ? (
        <PlayerCastle engine={engine} castle={c} onFormArmy={onFormArmy} toast={toast} />
      ) : (
        <OtherCastle engine={engine} castle={c} onFormArmy={onFormArmy} toast={toast} />
      )}
    </Shell>
  )
}

function Shell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const vp = useViewport()
  const [collapsed, setCollapsed] = useState(false)
  if (vp.compact) {
    // Bottom sheet: thumb-reachable, collapsible to a peek so the map stays visible.
    return (
      <div className={`panel animate-sheet-up safe-bottom pointer-events-auto absolute right-0 bottom-0 left-0 z-30 flex flex-col overflow-hidden rounded-t-md ${collapsed ? 'h-[132px]' : 'h-[min(52vh,460px)]'}`}>
        <div className="relative flex h-7 shrink-0 items-center justify-center" onClick={() => setCollapsed((v) => !v)}>
          <span className="h-1.5 w-12 rounded-full bg-gold-400/50" />
          <button className="absolute top-1 right-3 p-1 text-ink-300" onClick={(e) => (e.stopPropagation(), onClose())}>
            <X size={20} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    )
  }
  return (
    <div className="panel animate-slide-in pointer-events-auto absolute top-[68px] right-3 bottom-[232px] z-20 flex w-[380px] flex-col overflow-hidden rounded-md">
      <button className="absolute top-3 right-3 z-10 text-ink-400 hover:text-ink-100" onClick={onClose} title="Close (Esc)">
        <X size={16} />
      </button>
      <div className="scroll-thin flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  )
}

function Composition({ engine, troops }: { engine: GameEngine; troops: Record<string, number> }) {
  const n = total(troops)
  return (
    <div className="space-y-1">
      {engine.unitList.map((u) => {
        const v = troops[u.key] ?? 0
        if (v < 1) return null
        return (
          <div key={u.key} className="flex items-center gap-2 text-xs">
            <UnitGlyph unit={u.key} size={14} color={u.color} />
            <span className="w-24 text-ink-200">{u.name}</span>
            <div className="flex-1">
              <Bar value={v} max={n} color={u.color} />
            </div>
            <span className="w-10 text-right tabular-nums">{fmt(v)}</span>
          </div>
        )
      })}
      {n < 1 && <p className="text-xs text-ink-400">No troops.</p>}
    </div>
  )
}

function BattleBox({ engine, battle }: { engine: GameEngine; battle: Battle }) {
  const ourSide = battle.sideA.team === 'A' ? 'A' : 'B'
  const ours = ourSide === 'A' ? battle.sideA : battle.sideB
  const theirs = ourSide === 'A' ? battle.sideB : battle.sideA
  const sum = (ids: string[]) => ids.reduce((s, id) => s + total(engine.army(id)?.troops ?? {}), 0)
  const castle = engine.castle(battle.castleId)
  let our = sum(ours.armyIds)
  let their = sum(theirs.armyIds)
  if (castle) {
    if (engine.team(castle.faction) === ours.team) our += total(castle.garrison)
    else their += total(castle.garrison)
  }
  const lossOurs = ourSide === 'A' ? battle.lossesA : battle.lossesB
  const lossTheirs = ourSide === 'A' ? battle.lossesB : battle.lossesA
  const share = our / Math.max(1, our + their)
  const enemyForms = theirs.armyIds.map((id) => engine.army(id)).filter((a): a is Army => !!a)
  return (
    <div className="mt-3 rounded-lg border border-ember-400/30 bg-ember-700/15 p-3">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span className="text-ember-300">
          {battle.kind === 'siege' ? 'Siege' : 'Battle'} · {battle.location}
        </span>
        <span className="text-ink-400 tabular-nums">{Math.round(engine.state.time - battle.startedAt)}s</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full">
        <div className="bg-royal-400 transition-all" style={{ width: `${share * 100}%` }} />
        <div className="flex-1 bg-ember-400" />
      </div>
      <div className="mt-1 flex justify-between text-[13px] tabular-nums">
        <span className="text-royal-300">
          {fmt(our)} <span className="text-ink-400">(−{fmt(lossOurs)})</span>
        </span>
        <span className="text-ember-300">
          {fmt(their)} <span className="text-ink-400">(−{fmt(lossTheirs)})</span>
        </span>
      </div>
      {enemyForms.length > 0 && (
        <div className="mt-1.5 text-[12px] text-ink-400">
          Enemy formation: <span className="text-ink-200">{[...new Set(enemyForms.map((a) => FORMATIONS[a.formation].name))].join(', ')}</span>
        </div>
      )}
      {castle && (
        <div className="mt-2">
          <div className="mb-0.5 flex justify-between text-[12px] text-ink-400">
            <span>Walls</span>
            <span>{Math.round((castle.walls / castle.maxWalls) * 100)}%</span>
          </div>
          <Bar value={castle.walls} max={castle.maxWalls} color="#d9b44a" height={3} />
        </div>
      )}
      <p className="mt-1.5 text-[13px] text-ink-300 italic">{battle.note}</p>
    </div>
  )
}

function ArmyHeader({ engine, army }: { engine: GameEngine; army: Army }) {
  const cmd = engine.commanderOf(army)
  const n = totalInt(army.troops)
  const rel = engine.relation(army.faction)
  return (
    <>
      <div className="flex items-center gap-3 pr-6">
        {cmd ? (
          <PixelPortrait spec={cmd.portrait} size={48} className="ring-1 ring-white/15" />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-lg" style={{ background: `linear-gradient(160deg, ${engine.factionColor(army.faction)}, #111)` }}>
            <Swords size={20} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="panel-title truncate">{army.name}</h3>
          <p className="truncate text-xs text-ink-300">
            {cmd && cmd.name === army.name ? cmd.title : engine.armyLeader(army)}
            {cmd && cmd.name !== army.name && <span className="text-ink-500"> · {cmd.title}</span>}
          </p>
          {rel !== 'self' && (
            <p className="flex items-center gap-1.5 text-[13px]">
              <i className="size-2 rounded-sm" style={{ background: engine.factionColor(army.faction) }} />
              <span className={rel === 'ally' ? 'text-teal-300' : 'text-ember-300'}>{engine.factionName(army.faction)}</span>
            </p>
          )}
        </div>
      </div>
      {cmd && (engine.state.commanders[cmd.key]?.traits.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
          {engine.state.commanders[cmd.key].traits.map((t) => (
            <span key={t} title={TRAIT_MAP.get(t)?.description} className="rounded-sm bg-gold-500/15 px-1.5 py-0.5 text-gold-200">
              ★ {TRAIT_MAP.get(t)?.name ?? t}
            </span>
          ))}
        </div>
      )}
      {cmd && (cmd.strengths.length > 0 || cmd.weaknesses.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 text-[12px]">
          {cmd.strengths.map((t) => (
            <span key={t} className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-emerald-300">
              {/^[+−-]/.test(t) ? t : `+ ${t}`}
            </span>
          ))}
          {cmd.weaknesses.map((t) => (
            <span key={t} className="rounded bg-ember-500/12 px-1.5 py-0.5 text-ember-300">
              {/^[+−-]/.test(t) ? t : `− ${t}`}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <Stat label="Soldiers" value={fmt(n)} />
        <Stat label="Power" value={fmt(engine.armyPower(army))} accent />
        <Stat label="Status" value={STATUS_TEXT[army.status]} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="w-14 text-ink-400">Morale</span>
        <Bar value={army.morale} max={100} color={moraleColor(army.morale)} height={5} />
        <span className="w-8 text-right tabular-nums">{Math.round(army.morale)}</span>
      </div>
      <div className="mt-1 mb-3 flex items-center gap-2 text-xs">
        <span className="w-14 text-ink-400">Strength</span>
        <Bar value={n} max={army.initialTotal} color="#9cc0ff" height={5} />
        <span className="w-8 text-right tabular-nums">{Math.round((n / Math.max(1, army.initialTotal)) * 100)}%</span>
      </div>
    </>
  )
}

function PlayerArmy({ engine, army, toast, onSelect }: { engine: GameEngine; army: Army; toast: (m: string) => void; onSelect: Props['onSelect'] }) {
  const battle = engine.battle(army.battleId)
  const targets = engine.state.castles.filter((c) => engine.isHostile(c.faction, PLAYER)).sort((a, b) => Math.hypot(a.x - army.x, a.z - army.z) - Math.hypot(b.x - army.x, b.z - army.z))
  const atCastle = engine.castleAt(army.x, army.z, 70)
  const friends = engine.state.armies
    .filter((a) => a.faction === PLAYER && a.id !== army.id && a.status !== 'retreating')
    .map((a) => ({ a, d: Math.hypot(a.x - army.x, a.z - army.z) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 4)
  const fm = FORMATIONS[army.formation]
  const locked = army.status === 'retreating'
  const orderText = (() => {
    const o = army.order
    if (army.status === 'retreating') return `Falling back to ${engine.castle(army.homeCastleId)?.name}`
    switch (o.type) {
      case 'attack':
        return `Besiege ${engine.castle(o.castleId)?.name}`
      case 'intercept':
        return `Hunting ${engine.army(o.armyId)?.name ?? 'the enemy'}`
      case 'join':
        return `Merging into ${engine.army(o.armyId)?.name ?? 'another army'}`
      case 'build': {
        const site = engine.outpost(o.outpostId)
        return site ? `Building ${site.name} (${Math.round(site.progress * 100)}%)` : 'Building an outpost'
      }
      case 'move':
        return 'Marching to waypoint'
      case 'station':
        return `Stationed at ${engine.castle(o.castleId)?.name}`
      case 'reinforce':
        return `Joining ${engine.castle(o.castleId)?.name}'s garrison`
      default:
        return 'Holding position'
    }
  })()

  return (
    <div>
      <ArmyHeader engine={engine} army={army} />
      {battle && <BattleBox engine={engine} battle={battle} />}

      <div className="mt-3 rounded-lg well px-3 py-2 text-xs">
        <span className="text-ink-400">Orders: </span>
        <span className="text-ink-100">{orderText}</span>
      </div>
      {!army.supplied && (
        <div className="mt-2 rounded-sm border border-ember-400/40 bg-ember-700/25 px-3 py-2 text-[13px] text-ember-300">
          ⚠ Out of supply: losing men and morale. Return within reach of a castle, or build a Supply Depot.
        </div>
      )}
      {engine.isHidden(army) && (
        <div className="mt-2 rounded-sm border border-emerald-400/30 bg-emerald-700/20 px-3 py-2 text-[13px] text-emerald-300">
          🌲 Hidden in the woods. Enemies who blunder into this army will be ambushed.
        </div>
      )}

      <section className="mt-4">
        <SectionTitle>Formation</SectionTitle>
        <div className="grid grid-cols-4 gap-1">
          {FORMATION_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => engine.setFormation(army.id, k)}
              title={FORMATIONS[k].description}
              className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[12px] transition-colors ${army.formation === k ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-white/6 well text-ink-300 hover:bg-white/7'}`}
            >
              <FormationIcon formation={k} size={22} />
              {FORMATIONS[k].short}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-400">{fm.description}</p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg well px-2.5 py-1.5 text-xs hover:bg-white/6">
          <input type="checkbox" checked={army.column} onChange={(e) => engine.setColumn(army.id, e.target.checked)} className="accent-amber-400" />
          <FormationIcon formation="column" size={16} />
          <span className="flex-1">March in column</span>
          <span className="text-[12px] text-ink-500">+{Math.round((COLUMN.speed - 1) * 100)}% speed</span>
        </label>
        {army.column && <p className="mt-1 text-[12px] text-ember-300/80">Caught in column, the army fights badly for the first {COLUMN.reformSeconds}s of a battle.</p>}
      </section>

      <section className="mt-4">
        <SectionTitle>Orders</SectionTitle>
        <select
          value=""
          disabled={locked}
          onChange={(e) => e.target.value && engine.orderArmy(army.id, { type: 'attack', castleId: e.target.value })}
          className="mb-1.5 w-full rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-xs outline-none focus:border-gold-400"
        >
          <option value="">⚔ Attack a castle…</option>
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {engine.factionName(c.faction)} · {Math.round(Math.hypot(c.x - army.x, c.z - army.z))}m
            </option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-1.5">
          <button className="btn px-2 text-[13px]" disabled={locked || !!army.battleId} onClick={() => engine.orderArmy(army.id, { type: 'hold' })}>
            <Flag size={13} /> Hold
          </button>
          <button className="btn btn-danger px-2 text-[13px]" disabled={locked} onClick={() => engine.retreat(army.id)}>
            <Undo2 size={13} /> Retreat
          </button>
          <button
            className="btn px-2 text-[13px]"
            disabled={!!army.battleId}
            onClick={() => {
              const err = engine.garrisonArmy(army.id)
              if (err) toast(err)
            }}
            title={atCastle?.faction === PLAYER ? `Merge into ${atCastle.name}` : 'March to the nearest castle and join its garrison'}
          >
            <House size={13} /> Garrison
          </button>
        </div>
        <BuildOutpostButton engine={engine} army={army} toast={toast} />
      </section>

      <section className="mt-4">
        <SectionTitle
          right={
            <button
              className="flex items-center gap-1 text-[13px] text-ink-300 hover:text-gold-300 disabled:opacity-40"
              disabled={!!army.battleId || locked}
              onClick={() => {
                const res = engine.splitArmy(army.id, 0.5)
                if (typeof res === 'string') toast(res)
                else onSelect({ kind: 'army', id: res.id })
              }}
            >
              <Scissors size={12} /> Split in half
            </button>
          }
        >
          Merge armies
        </SectionTitle>
        {friends.length === 0 && <p className="text-[13px] text-ink-500">No other armies in the field.</p>}
        <div className="space-y-1">
          {friends.map(({ a, d }) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg well px-2.5 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">
                <b>{a.name}</b> <span className="text-ink-400">· {fmt(total(a.troops))} · {Math.round(d)}m</span>
              </span>
              <button className="btn px-2 py-1 text-[12px]" disabled={locked} title={`${army.name} marches to ${a.name} and merges into it`} onClick={() => engine.orderArmy(army.id, { type: 'join', armyId: a.id })}>
                <Combine size={12} /> Join
              </button>
              <button className="btn px-2 py-1 text-[12px]" title={`${a.name} marches here and merges into ${army.name}`} onClick={() => engine.orderArmy(a.id, { type: 'join', armyId: army.id })}>
                Call
              </button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-ink-500">Tip: right-click one of your armies to merge into it.</p>
      </section>

      <section className="mt-4">
        <SectionTitle>Troops</SectionTitle>
        <Composition engine={engine} troops={army.troops} />
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="text-ink-400">Auto-retreat after losing</span>
            <span className="tabular-nums">{Math.round(army.retreatAt * 100)}%</span>
          </div>
          <Slider
            value={Math.round(army.retreatAt * 100)}
            min={10}
            max={95}
            step={5}
            onChange={(v) => {
              army.retreatAt = v / 100
              engine.notify()
            }}
            color="#f0614a"
          />
        </div>
      </section>
    </div>
  )
}

function OtherArmy({ engine, army, onSelect }: { engine: GameEngine; army: Army; onSelect: Props['onSelect'] }) {
  const battle = engine.battle(army.battleId)
  const hostile = engine.isHostile(army.faction, PLAYER)
  const mine = engine.state.armies.filter((a) => a.faction === PLAYER && a.status !== 'retreating')
  const o = army.order
  const intent =
    o.type === 'attack'
      ? `Marching on ${engine.castle(o.castleId)?.name}`
      : o.type === 'rally'
        ? 'Converging on a muster point'
        : o.type === 'intercept'
          ? `Hunting ${engine.army(o.armyId)?.name ?? 'an enemy force'}`
          : o.type === 'station' || o.type === 'reinforce'
            ? `Heading for ${engine.castle(o.castleId)?.name}`
            : 'Holding'
  return (
    <div>
      <ArmyHeader engine={engine} army={army} />
      <div className="mb-3">
        <StackBar troops={army.troops} units={engine.unitList} />
      </div>
      <Composition engine={engine} troops={army.troops} />
      {battle && <BattleBox engine={engine} battle={battle} />}
      <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${hostile ? 'bg-ember-700/15' : 'bg-teal-700/15'}`}>
        <span className="text-ink-400">Scouts report: </span>
        <span className={hostile ? 'text-ember-300' : 'text-teal-300'}>{intent}</span>
        <span className="text-ink-400"> · {FORMATIONS[army.formation].name}</span>
      </div>
      {hostile && mine.length > 0 && (
        <div className="mt-3">
          <SectionTitle>Send to intercept</SectionTitle>
          <div className="space-y-1">
            {mine.map((a) => (
              <button
                key={a.id}
                className="btn w-full justify-between px-3 text-xs"
                onClick={() => {
                  engine.orderArmy(a.id, { type: 'intercept', armyId: army.id })
                  onSelect({ kind: 'army', id: a.id })
                }}
              >
                <span>{a.name}</span>
                <span className="text-ink-400 tabular-nums">
                  {fmt(totalInt(a.troops))} · {Math.round(Math.hypot(a.x - army.x, a.z - army.z))}m
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CastleHeader({ engine, castle }: { engine: GameEngine; castle: Castle }) {
  const rel = engine.relation(castle.faction)
  const color = rel === 'self' ? 'text-royal-300' : rel === 'enemy' ? 'text-ember-300' : rel === 'ally' ? 'text-teal-300' : 'text-gold-300'
  const battle = engine.battle(castle.battleId)
  return (
    <>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-11 place-items-center rounded-lg" style={{ background: `linear-gradient(160deg, ${engine.factionColor(castle.faction)}, #111)` }}>
          <CastleIcon size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">
            {castle.capital && <span className="mr-1 text-gold-300">♛</span>}
            {castle.name}
          </h3>
          <p className="text-xs text-ink-300">
            {castle.subtitle} · Tier {castle.tier}
          </p>
          <p className={`truncate text-[13px] ${color}`}>{rel === 'self' ? 'Your castle' : engine.factionName(castle.faction)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <Shield size={13} className="text-ink-400" />
        <span className="w-10 text-ink-400">Walls</span>
        <Bar value={castle.walls} max={castle.maxWalls} color="#d9b44a" height={5} />
        <span className="w-10 text-right tabular-nums">{Math.round((castle.walls / castle.maxWalls) * 100)}%</span>
      </div>
      {battle && <BattleBox engine={engine} battle={battle} />}
    </>
  )
}

function PlayerCastle({ engine, castle, onFormArmy, toast }: { engine: GameEngine; castle: Castle; onFormArmy: Props['onFormArmy']; toast: (m: string) => void }) {
  const [batch, setBatch] = useState(50)
  const n = total(castle.garrison)
  const cap = capacityForTier(castle.tier)
  const gold = engine.state.factions[PLAYER].gold
  const upCost = upgradeCost(castle.tier)
  return (
    <div>
      <CastleHeader engine={engine} castle={castle} />
      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-16 text-ink-400">Garrison</span>
          <Bar value={n} max={cap} color="#5f93ec" height={5} />
          <span className="w-20 text-right tabular-nums">
            {fmt(n)}
            <span className="text-ink-500">/{fmt(cap)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2" title={`Regrows ${manpowerRegenForTier(castle.tier).toFixed(1)}/s`}>
          <span className="w-16 text-ink-400">Manpower</span>
          <Bar value={castle.manpower} max={maxManpowerForTier(castle.tier)} color="#6fd08c" height={5} />
          <span className="w-20 text-right tabular-nums">
            {fmt(castle.manpower)}
            <span className="text-ink-500"> +{manpowerRegenForTier(castle.tier).toFixed(1)}/s</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-ink-400">Income</span>
          <span className="flex-1 text-gold-300 tabular-nums">+{incomeForTier(castle.tier).toFixed(1)} gold/s</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button className="btn btn-gold" onClick={() => onFormArmy(castle.id)} disabled={n < 10}>
          <Swords size={14} /> Muster army
        </button>
        <button
          className="btn"
          disabled={castle.tier >= 4 || gold < upCost || !!castle.battleId}
          onClick={() => {
            const err = engine.upgradeCastle(castle.id)
            if (err) toast(err)
          }}
          title={castle.tier >= 4 ? 'Already a citadel' : `Tier ${castle.tier + 1}: walls ${Math.round(castle.maxWalls)}→ more, +${(incomeForTier(castle.tier + 1) - incomeForTier(castle.tier)).toFixed(0)} gold/s, +${capacityForTier(castle.tier + 1) - cap} capacity, faster manpower`}
        >
          <CircleArrowUp size={14} /> {castle.tier >= 4 ? 'Max tier' : `Expand · ${fmt(upCost)}`}
        </button>
      </div>

      <section className="mt-4">
        <SectionTitle
          right={
            <div className="flex rounded-md bg-white/5 p-0.5 text-[12px]">
              {[10, 50, 100].map((b) => (
                <button key={b} onClick={() => setBatch(b)} className={`rounded px-2 py-0.5 ${batch === b ? 'bg-gold-500 font-bold text-ink-950' : 'text-ink-300'}`}>
                  ×{b}
                </button>
              ))}
            </div>
          }
        >
          Recruit
        </SectionTitle>
        <div className="space-y-1">
          {engine.unitList.map((u) => {
            const b = u.key === 'engineers' ? Math.max(5, Math.round(batch / 4)) : batch
            const price = u.cost_gold
            const max = engine.maxRecruitable(castle.id, u.key)
            return (
              <div key={u.key} className="flex items-center gap-2 rounded-lg well px-2 py-1.5 text-xs" title={u.description}>
                <UnitGlyph unit={u.key} size={15} color={u.color} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{u.name}</span>
                  <span className="flex items-center gap-1 text-[12px] text-ink-500">
                    <Coins size={9} /> {price} · atk {u.attack} · def {u.defense}
                  </span>
                </span>
                <button
                  className="btn px-2 py-1 text-[12px]"
                  disabled={max < 1}
                  onClick={() => {
                    const err = engine.recruit(castle.id, u.key, b)
                    if (err) toast(err)
                  }}
                >
                  +{b}
                </button>
                <button
                  className="btn px-2 py-1 text-[12px]"
                  disabled={max < 1}
                  title={`Recruit as many as possible (${max})`}
                  onClick={() => {
                    const err = engine.recruit(castle.id, u.key, max)
                    if (err) toast(err)
                  }}
                >
                  Max
                </button>
              </div>
            )
          })}
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-white/6 px-2.5 py-2 text-xs">
          <Hammer size={13} className={castle.autoRecruit ? 'text-gold-400' : 'text-ink-500'} />
          <span className="flex-1">Auto-recruit</span>
          <select
            value={castle.autoRecruit ?? ''}
            onChange={(e) => engine.setAutoRecruit(castle.id, e.target.value || null)}
            className="rounded-md border border-white/10 bg-ink-850 px-2 py-1 text-[13px] outline-none focus:border-gold-400"
          >
            <option value="">Off</option>
            {Object.entries(RECRUIT_TEMPLATES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-[12px] text-ink-500">Auto-recruit spends spare gold here every few seconds, keeping a small reserve.</p>
      </section>

      <section className="mt-4">
        <SectionTitle>Garrison</SectionTitle>
        <Composition engine={engine} troops={castle.garrison} />
      </section>
    </div>
  )
}

function OtherCastle({ engine, castle, onFormArmy, toast }: { engine: GameEngine; castle: Castle; onFormArmy: Props['onFormArmy']; toast: (m: string) => void }) {
  const known = engine.isVisible(castle.x, castle.z) || engine.relation(castle.faction) === 'ally'
  const hostile = engine.isHostile(castle.faction, PLAYER)
  const mine = engine.state.armies.filter((a) => a.faction === PLAYER && a.status !== 'retreating')
  const call = engine.state.callToArms
  const called = call && call.castleId === castle.id && call.until > engine.state.time
  return (
    <div>
      <CastleHeader engine={engine} castle={castle} />
      <div className="mt-3 mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-ink-400">
          <Users size={13} /> Garrison
        </span>
        <span className="font-semibold tabular-nums">{fmt(total(castle.garrison))}</span>
      </div>
      {known && <Composition engine={engine} troops={castle.garrison} />}
      {hostile && (
        <>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-400">
            <Coins size={12} /> Worth +{incomeForTier(castle.tier).toFixed(1)} gold/s if captured
          </div>
          {castle.tier >= 2 && (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-400">
              <Hammer size={12} /> Strong walls: bring siege engineers
            </div>
          )}
          {castle.faction === 'neutral' && (
            <button
              className="btn btn-gold mt-3 w-full"
              disabled={engine.state.factions.player.gold < engine.townPrice(castle) || !!castle.battleId}
              onClick={() => {
                const err = engine.buyTown(castle.id)
                if (err) toast(err)
              }}
              title="Pay the burghers to join your realm peacefully, garrison and all."
            >
              <Coins size={14} /> Buy their allegiance · {fmt(engine.townPrice(castle))}g
            </button>
          )}
          <div className="mt-3 space-y-1">
            {mine.map((a) => (
              <button key={a.id} className="btn w-full justify-between px-3 text-xs" onClick={() => engine.orderArmy(a.id, { type: 'attack', castleId: castle.id })}>
                <span>Send {a.name}</span>
                <span className="text-ink-400 tabular-nums">
                  {fmt(totalInt(a.troops))} · {Math.round(Math.hypot(a.x - castle.x, a.z - castle.z))}m
                </span>
              </button>
            ))}
            <button className="btn btn-gold w-full" onClick={() => onFormArmy(undefined, castle.id)}>
              <Swords size={14} /> Muster an army against {castle.name}
            </button>
            {engine.state.rules.mode === 'alliance' && <SummonBox engine={engine} castle={castle} toast={toast} />}
            {engine.state.rules.mode === 'alliance' && (
              <button
                className="btn w-full"
                disabled={!!called}
                onClick={() => {
                  const err = engine.callToArms(castle.id)
                  if (err) toast(err)
                }}
                title="Allied lords within reach will send forces against this castle for the next 3 minutes."
              >
                <Megaphone size={14} /> {called ? `Allies attacking directly (${Math.ceil(call!.until - engine.state.time)}s)` : 'Order allies to attack directly'}
              </button>
            )}
          </div>
        </>
      )}
      {!hostile && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-400">
          An allied castle. Its lord defends it and may send relief to your besieged castles. You can station armies here.
        </p>
      )}
    </div>
  )
}

function BuildOutpostButton({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  if (army.order.type === 'build') return null
  const opts = engine.outpostOptions(army.id)
  const any = opts.some((o) => o.ok)
  return (
    <div className="mt-1.5">
      <button className="btn w-full text-[13px]" onClick={() => setOpen((v) => !v)} title="Engineers raise field fortifications suited to the ground here">
        <Tent size={14} /> Build an outpost here {any ? '' : '(unavailable)'}
      </button>
      {open && (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}>
          {opts.map((o) => {
            const def = OUTPOST_KINDS[o.kind]
            return (
              <button
                key={o.kind}
                disabled={!o.ok}
                onClick={() => {
                  const err = engine.buildOutpost(army.id, o.kind)
                  if (err) toast(err)
                  else setOpen(false)
                }}
                className={`well flex w-full items-stretch gap-2.5 rounded-sm p-1.5 text-left text-[13px] transition hover:brightness-125 ${o.ok ? '' : 'opacity-50 grayscale-[60%]'}`}
              >
                <OutpostArt kind={o.kind} size={84} />
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="flex justify-between gap-2 font-bold">
                    <span className="text-gold-100">{def.name}</span>
                    <span className="text-gold-300">{def.cost}g</span>
                  </span>
                  <span className="block text-[11.5px] font-bold text-gold-300/70">{def.terrain}</span>
                  <span className={`mt-0.5 block text-[12px] leading-snug ${o.ok ? 'text-ink-300' : 'text-ember-300'}`}>{o.reason ?? def.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OutpostPanel({ engine, outpost, onSelect }: { engine: GameEngine; outpost: Outpost; onSelect: Props['onSelect'] }) {
  const rel = engine.relation(outpost.faction)
  const team = engine.team(outpost.faction)
  const here = engine.state.armies.filter((a) => engine.team(a.faction) === team && Math.hypot(a.x - outpost.x, a.z - outpost.z) < OUTPOST.radius)
  const kind = OUTPOST_KINDS[outpost.kind]
  const done = outpost.progress >= 1
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm" style={{ background: `linear-gradient(160deg, ${engine.factionColor(outpost.faction)}, #111)` }}>
          <Tent size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">{outpost.name}</h3>
          <p className="text-[12px] text-gold-300/80">{kind.name}</p>
          <p className={`text-[13px] ${rel === 'self' ? 'text-royal-300' : rel === 'ally' ? 'text-teal-300' : 'text-ember-300'}`}>{rel === 'self' ? 'Your outpost' : engine.factionName(outpost.faction)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="w-20 text-ink-400">Built</span>
          <Bar value={outpost.progress} max={1} color="#d1a73f" height={5} />
          <span className="w-10 text-right tabular-nums">{Math.round(outpost.progress * 100)}%</span>
        </div>
        {outpost.raze > 0.01 && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ember-300">Burning</span>
            <Bar value={outpost.raze} max={1} color="#de5f45" height={5} />
            <span className="w-10 text-right tabular-nums">{Math.round(outpost.raze * 100)}%</span>
          </div>
        )}
      </div>
      <section className="mt-4">
        <SectionTitle>Effects</SectionTitle>
        <ul className={`space-y-1 text-[13px] ${done ? 'text-ink-200' : 'text-ink-500'}`}>
          <li className="text-ink-300 italic">{kind.description}</li>
          <li>🛡 Defenders inside take {Math.round((1 - 1 / kind.defense) * 100)}% fewer losses</li>
          {kind.braces && <li>🪵 Its walls stop enemy charges</li>}
          {kind.zoc > 0 && (
            <li>
              🐌 Enemies within {kind.zoc}m march {Math.round((1 - kind.zocSlow) * 100)}% slower
            </li>
          )}
          {kind.fireRange > 0 && <li>🏹 Shoots at enemies within {kind.fireRange}m</li>}
          {kind.hides && <li>🌲 Armies stationed here stay hidden and ambush</li>}
          <li>📦 Supplies armies within {kind.supply}m</li>
          <li>❤ Armies here recover morale as in a castle</li>
          <li className="text-ember-300/90">🔥 Left empty, enemies burn it in {OUTPOST.razeSeconds}s</li>
        </ul>
        {!done && <p className="mt-1 text-[12px] text-ink-400">Effects begin once construction is finished.</p>}
      </section>
      <section className="mt-4">
        <SectionTitle>Stationed here</SectionTitle>
        {here.length === 0 && <p className="text-[13px] text-ember-300">Nobody. The outpost is undefended.</p>}
        <div className="space-y-1">
          {here.map((a) => (
            <button key={a.id} className="well flex w-full justify-between rounded-sm px-2.5 py-1.5 text-[13px] hover:brightness-125" onClick={() => onSelect({ kind: 'army', id: a.id })}>
              <span>{a.name}</span>
              <span className="text-ink-400 tabular-nums">{fmt(total(a.troops))}</span>
            </button>
          ))}
        </div>
      </section>
      {rel === 'self' && (
        <button className="btn btn-danger mt-4 w-full" onClick={() => (engine.dismantleOutpost(outpost.id), onSelect(null))}>
          Dismantle
        </button>
      )}
    </div>
  )
}

/** Summon allied lords to one of your armies or castles, then march on this castle together. */
function SummonBox({ engine, castle, toast }: { engine: GameEngine; castle: Castle; toast: (m: string) => void }) {
  const mine = engine.state.armies.filter((a) => a.faction === PLAYER && a.status !== 'retreating')
  const holds = engine.state.castles.filter((c) => c.faction === PLAYER)
  const dist = (x: number, z: number) => Math.hypot(x - castle.x, z - castle.z)
  const options = [
    ...mine.map((a) => ({ value: `a:${a.id}`, label: `${a.name} (army, ${Math.round(dist(a.x, a.z))}m away)`, d: dist(a.x, a.z) })),
    ...holds.map((c) => ({ value: `c:${c.id}`, label: `${c.name} (castle, ${Math.round(dist(c.x, c.z))}m away)`, d: dist(c.x, c.z) + 1 })),
  ].sort((a, b) => a.d - b.d)
  const [rally, setRally] = useState(options[0]?.value ?? '')
  const existing = engine.state.musters.find((m) => m.team === 'A' && m.targetCastleId === castle.id)
  const myCount = engine.state.musters.filter((m) => m.organizer === PLAYER).length
  if (existing) {
    const st = engine.musterStatus(existing.id)
    const free = mine.filter((a) => !a.battleId && !engine.musterOf(a.id))
    return (
      <div className="rounded-sm border border-teal-400/30 bg-teal-700/15 p-2.5 text-[13px] text-teal-200">
        {existing.organizer === PLAYER ? 'Your' : `${engine.factionName(existing.organizer)}'s`} muster is {existing.phase === 'gathering' ? 'gathering' : 'marching'} against this castle: {st?.arrived ?? 0} contingent(s) gathered, {st?.enRoute ?? 0} on the way.
        {existing.phase === 'gathering' && existing.organizer !== PLAYER && free.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {free.map((a) => (
              <button key={a.id} className="btn py-1 text-[12px]" onClick={() => engine.joinMuster(existing.id, a.id)}>
                Send {a.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (myCount >= 2) return <p className="well rounded-sm p-2.5 text-[13px] text-ink-400">You already lead two musters. Launch or dismiss one to call another.</p>
  return (
    <div className="rounded-lg border border-teal-400/30 bg-teal-700/10 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-200">
        <Handshake size={14} /> Summon the alliance
      </div>
      <p className="mb-2 text-[12px] leading-snug text-ink-400">Allied lords send contingents to your rally point. Once gathered, everyone marches on {castle.name} at once.</p>
      <select
        value={rally}
        onChange={(e) => setRally(e.target.value)}
        className="mb-1.5 w-full rounded-md border border-white/10 bg-ink-850 px-2 py-1.5 text-[13px] outline-none focus:border-teal-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            Rally at {o.label}
          </option>
        ))}
      </select>
      <button
        className="btn w-full border-teal-400/40 bg-teal-600/20 text-teal-100 hover:bg-teal-600/30"
        disabled={!rally}
        onClick={() => {
          const [kind, id] = rally.split(':')
          const err = engine.summonAlliance(castle.id, kind === 'a' ? { armyId: id } : { castleId: id })
          if (err) toast(err)
        }}
      >
        <Megaphone size={14} /> Summon allies
      </button>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md well py-1.5">
      <div className="text-[11px] tracking-wider text-ink-400 uppercase">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? 'text-gold-300' : ''}`}>{value}</div>
    </div>
  )
}
