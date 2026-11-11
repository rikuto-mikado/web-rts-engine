import { CircleArrowUp, Castle as CastleIcon, Coins, Combine, Flag, Hammer, Handshake, House, Megaphone, Package, Scissors, Shield, Swords, Tent, Undo2, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  OUTPOST,
  SCOUT,
  WORKS,
  PLAYER,
  RECRUIT_TEMPLATES,
  VILLAGE,
  FEATURE_INFO,
  HOLDINGS,
  HOLDING_EFFECTS,
  capacityForTier,
  incomeForTier,
  type GameEngine,
} from '../game/engine'
import { COLUMN, FORMATIONS, FORMATION_ORDER } from '../game/formations'
import { OUTPOST_KINDS } from '../game/outposts'
import { RESOURCE, RESOURCE_STOCK } from '../game/countryside'
import { TRAIT_MAP } from '../game/traits'
import { fmt, total, totalInt } from '../game/troops'
import type { Army, Battle, Castle, Outpost, WorkJob } from '../game/types'
import type { Selection } from '../render/GameRenderer'
import { compactPanelWidth, useViewport } from './viewport'
import { OutpostArt, WorkArt } from './art'
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
        {a.faction === PLAYER && !a.vassalOf ? <PlayerArmy engine={engine} army={a} toast={toast} onSelect={onSelect} /> : <OtherArmy engine={engine} army={a} onSelect={onSelect} />}
        {a.aidFor && (
          <p className="mt-3 text-[12.5px] leading-snug text-ink-400">
            Sent by an ally to stand in {engine.castle((engine.state.aidCalls ?? []).find((c) => c.id === a.aidFor)?.castleId)?.name ?? 'a castle'} until the danger passes.
          </p>
        )}
        {a.vassalOf && (
          <p className="mt-3 text-[12.5px] leading-snug text-ink-400">
            Militia of {engine.castle(a.vassalOf)?.name ?? 'a vassal village'}. They act on their own: they go to help a besieged castle nearby and head home when the fighting is over.
          </p>
        )}
      </Shell>
    )
  }
  if (selection.kind === 'outpost') {
    const o = engine.outpost(selection.id)
    if (!o) return null
    return (
      <Shell onClose={close}>
        <OutpostPanel engine={engine} outpost={o} onSelect={onSelect} onFormArmy={onFormArmy} toast={toast} />
      </Shell>
    )
  }
  if (selection.kind === 'site') {
    const site = engine.site(selection.id)
    if (!site) return null
    return (
      <Shell onClose={close}>
        <SitePanel engine={engine} siteId={site.id} onSelect={onSelect} toast={toast} />
      </Shell>
    )
  }
  if (selection.kind === 'convoy') {
    const w = engine.convoy(selection.id)
    if (!w) return null
    return (
      <Shell onClose={close}>
        <ConvoyPanel engine={engine} convoyId={w.id} onSelect={onSelect} toast={toast} />
      </Shell>
    )
  }
  const c = engine.castle(selection.id)
  if (!c) return null
  if (c.village && !c.ruined && c.faction === PLAYER) {
    return (
      <Shell onClose={close}>
        <VassalPanel engine={engine} castle={c} onSelect={onSelect} />
      </Shell>
    )
  }
  if (c.ruined || (c.village && c.faction === 'neutral')) {
    return (
      <Shell onClose={close}>
        <VillagePanel engine={engine} castle={c} toast={toast} />
      </Shell>
    )
  }
  return (
    <Shell onClose={close}>
      {c.faction === PLAYER ? (
        <PlayerCastle engine={engine} castle={c} onFormArmy={onFormArmy} toast={toast} onSelect={onSelect} />
      ) : (
        <OtherCastle engine={engine} castle={c} onFormArmy={onFormArmy} toast={toast} />
      )}
    </Shell>
  )
}

function Shell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const vp = useViewport()
  if (vp.compact) {
    // Landscape phones: a panel down the right side, below the top bar; the map stays in view on the left.
    return (
      <div
        className="panel animate-slide-in safe-bottom pointer-events-auto absolute top-[64px] right-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-tl-md"
        style={{ width: compactPanelWidth(vp.w), paddingRight: 'env(safe-area-inset-right)' }}
      >
        <button className="absolute top-2 right-2 z-10 rounded-sm bg-black/30 p-1.5 text-ink-300" style={{ marginRight: 'env(safe-area-inset-right)' }} onClick={onClose} title="Close">
          <X size={18} />
        </button>
        <div className="scroll-thin flex-1 overflow-y-auto p-3 pt-3">{children}</div>
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
  const rel = engine.relation(army.faction)
  // Far-off enemies are known only by rumour: who leads them is a mystery until we get close or scout them.
  const unknown = rel === 'enemy' && engine.knowledge(army.id).kind === 'rumour'
  const cmd = unknown ? null : engine.commanderOf(army)
  const n = totalInt(army.troops)
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
            {unknown ? 'Leader unknown' : cmd && cmd.name === army.name ? cmd.title : engine.armyLeader(army)}
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
        <Stat label="Soldiers" value={unknown ? `~${fmt(engine.knowledge(army.id).total)}?` : fmt(n)} />
        <Stat label="Power" value={unknown ? '?' : fmt(engine.armyPower(army))} accent />
        <Stat label="Status" value={STATUS_TEXT[army.status]} />
      </div>
      {!unknown && (
        <>
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
      )}
      {unknown && <div className="mb-3" />}
      {(() => {
        const f = engine.world.featureAt(army.x, army.z)
        const info = f && FEATURE_INFO[f.kind]
        if (!info) return null
        return (
          <div className="mb-3 rounded-sm border border-gold-400/25 bg-gold-500/10 px-2 py-1.5 text-[12px] leading-snug">
            <span className="font-bold text-gold-200">On {info.name.toLowerCase()}: </span>
            <span className="text-ink-300">{info.effect}</span>
          </div>
        )
      })()}
    </>
  )
}

function PlayerArmy({ engine, army, toast, onSelect }: { engine: GameEngine; army: Army; toast: (m: string) => void; onSelect: Props['onSelect'] }) {
  const battle = engine.battle(army.battleId)
  const targets = engine.state.castles.filter((c) => engine.isHostile(c.faction, PLAYER) && !c.ruined && !(c.village && c.faction === 'neutral')).sort((a, b) => Math.hypot(a.x - army.x, a.z - army.z) - Math.hypot(b.x - army.x, b.z - army.z))
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
      case 'garrison':
        return `Quartering in ${engine.outpost(o.outpostId)?.name ?? 'a depot'}`
      case 'raidConvoy':
        return 'Riding down enemy wagons'
      case 'work':
        return `${WORKS[o.job].name} (${Math.round(o.progress * 100)}%)`
      case 'gather': {
        const site = engine.site(o.siteId)
        return site ? `Working the ${site.kind === 'mine' ? 'mine' : 'forest'} (+${engine.gatherRate(army.id, site.id).toFixed(1)} gold/s)` : 'Working a site'
      }
      case 'scout': {
        const t = engine.castle(o.targetId) ?? engine.army(o.targetId)
        return o.phase === 'out' ? `Scouting ${t?.name ?? 'the enemy'}` : 'Riding home with the report'
      }
      default:
        return 'Holding position'
    }
  })()

  return (
    <div>
      <ArmyHeader engine={engine} army={army} />
      {army.royal && (
        <div className="mb-3 rounded-sm border border-gold-400/40 bg-gold-500/10 px-2.5 py-2 text-[12.5px] leading-snug">
          <div className="font-bold text-gold-200">♛ The Royal Guard</div>
          <p className="mt-0.5 text-ink-300">
            Household knights from the homeland: never reinforced, no upkeep. In the field the King's presence steadies every friendly army within 350m (+15% damage, -10% losses, morale holds). Allies answer his summons more readily; envoys near him do better. If the Guard is destroyed, the war is lost. In a castle it waits in the keep and rides out by the far gate if the castle falls.
          </p>
        </div>
      )}
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
        <EngineersPanel engine={engine} army={army} toast={toast} />
        <ScoutBox engine={engine} army={army} toast={toast} />
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
      {(() => {
        const k = engine.knowledge(army.id)
        if (!k.troops)
          return (
            <p className="mb-2 text-[12.5px] text-ink-400">
              Roughly <KnownCount k={k} /> soldiers, by rumour. Bring an army close or send scouts to learn more.
            </p>
          )
        return (
          <>
            <div className="mb-3">
              <StackBar troops={k.troops} units={engine.unitList} />
            </div>
            <Composition engine={engine} troops={k.troops} />
            {k.kind === 'scouted' && <p className="mt-1 text-[12px] text-ink-500">From a scouting report {Math.round(k.age / 60)} min ago (±{Math.round(k.error * 100)}%).</p>}
          </>
        )
      })()}
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
      {(castle.sappedUntil ?? 0) > engine.state.time && (
        <p className="mt-1 text-[12px] text-ember-300">Undermined by sappers: the walls will not mend for {Math.ceil((castle.sappedUntil ?? 0) - engine.state.time)}s.</p>
      )}
      {battle && <BattleBox engine={engine} battle={battle} />}
    </>
  )
}

function PlayerCastle({ engine, castle, onFormArmy, toast, onSelect }: { engine: GameEngine; castle: Castle; onFormArmy: Props['onFormArmy']; toast: (m: string) => void; onSelect: (s: Selection, focus?: boolean) => void }) {
  const [batch, setBatch] = useState(50)
  const n = total(castle.garrison)
  const cap = engine.capacity(castle)
  const gold = engine.state.factions[PLAYER].gold
  const upCost = engine.upgradeCostOf(castle)
  const maxTier = engine.maxTier(castle)
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
        <div className="flex items-center gap-2" title={`Regrows ${engine.manpowerRegen(castle).toFixed(1)}/s`}>
          <span className="w-16 text-ink-400">Manpower</span>
          <Bar value={castle.manpower} max={engine.maxManpower(castle)} color="#6fd08c" height={5} />
          <span className="w-20 text-right tabular-nums">
            {fmt(castle.manpower)}
            <span className="text-ink-500"> +{engine.manpowerRegen(castle).toFixed(1)}/s</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-ink-400">Income</span>
          <span className="flex-1 text-gold-300 tabular-nums">+{engine.castleIncome(castle).toFixed(1)} gold/s</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button className="btn btn-gold" onClick={() => onFormArmy(castle.id)} disabled={n < 10}>
          <Swords size={14} /> Muster army
        </button>
        <button
          className="btn"
          disabled={castle.tier >= maxTier || gold < upCost || !!castle.battleId}
          onClick={() => {
            const err = engine.upgradeCastle(castle.id)
            if (err) toast(err)
          }}
          title={
            castle.village
              ? castle.tier >= maxTier
                ? 'Already walled in stone'
                : 'Replace the palisade with a stone wall and towers: stronger walls, more room, a little more income'
              : castle.tier >= maxTier
                ? 'Already a citadel'
                : `Tier ${castle.tier + 1}: stronger walls, +${(incomeForTier(castle.tier + 1) - incomeForTier(castle.tier)).toFixed(0)} gold/s, +${capacityForTier(castle.tier + 1) - cap} capacity, faster manpower`
          }
        >
          <CircleArrowUp size={14} /> {castle.tier >= maxTier ? (castle.village ? 'Stone walls' : 'Max tier') : castle.village ? `Stone wall · ${fmt(upCost)}` : `Expand · ${fmt(upCost)}`}
        </button>
      </div>
      <AidRow engine={engine} castle={castle} toast={toast} onSelect={onSelect} />

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
            const price = engine.unitCost(PLAYER, u.key)
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
  const k = engine.knowledge(castle.id)
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
        <span className="font-semibold tabular-nums">
          <KnownCount k={k} />
        </span>
      </div>
      {k.troops ? <Composition engine={engine} troops={k.troops} /> : <p className="text-[12.5px] text-ink-400">Only a rumour. Send scouts (a party of 80 or fewer) to learn its true strength and make-up.</p>}
      {hostile && (
        <>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-400">
            <Coins size={12} /> Worth +{engine.castleIncome(castle).toFixed(1)} gold/s if captured
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

/** Engineers' field works: obstacles to slow or stop the enemy, and burning or rebuilding bridges. */
const SIEGE_JOBS: WorkJob[] = ['tower', 'ram', 'mantlet', 'trebuchet']
const FIELD_JOBS: WorkJob[] = ['stakes', 'pit', 'barricade', 'pitch', 'bridge', 'demolish']

/** Everything engineers can do, in three tabs: outposts, siege engines, field works. */
function EngineersPanel({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  const [tab, setTab] = useState<'outposts' | 'siege' | 'field' | null>(null)
  const eng = army.troops.engineers ?? 0
  if (eng < 10) return null
  const carried = (['tower', 'ram', 'mantlet'] as const).filter((k) => army.engines?.[k]).map((k) => WORKS[k].name)
  const working = army.order.type === 'work' ? army.order : null
  const building = army.order.type === 'build' ? engine.outpost(army.order.outpostId) : null
  const tabs = [
    { key: 'outposts', label: 'Outposts', icon: <Tent size={13} /> },
    { key: 'siege', label: 'Siege engines', icon: <CastleIcon size={13} /> },
    { key: 'field', label: 'Field works', icon: <Hammer size={13} /> },
  ] as const
  return (
    <div className="mt-1.5">
      {carried.length > 0 && <p className="mb-1 text-[12px] text-gold-200">⚙ Pushing along: {carried.join(', ')}</p>}
      {(working || building) && (
        <div className="well mb-1.5 flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px]">
          <Hammer size={14} className="text-gold-300" />
          <span className="flex-1">{working ? WORKS[working.job].name : building?.name}</span>
          <span className="tabular-nums text-ink-300">{Math.round((working ? working.progress : building?.progress ?? 0) * 100)}%</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((t) => (
          <button key={t.key} className={`btn px-1 text-[12px] ${tab === t.key ? 'btn-gold' : ''}`} onClick={() => setTab(tab === t.key ? null : t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'outposts' && <BuildOutpostButton engine={engine} army={army} toast={toast} onDone={() => setTab(null)} />}
      {tab === 'siege' && <WorksList engine={engine} army={army} toast={toast} jobs={SIEGE_JOBS} onDone={() => setTab(null)} />}
      {tab === 'field' && <WorksList engine={engine} army={army} toast={toast} jobs={FIELD_JOBS} onDone={() => setTab(null)} />}
    </div>
  )
}

function WorksList({ engine, army, toast, jobs, onDone }: { engine: GameEngine; army: Army; toast: (m: string) => void; jobs: WorkJob[]; onDone: () => void }) {
  const opts = engine.workOptions(army.id).filter((o) => jobs.includes(o.job))
  return (
    <div className="mt-1.5 grid grid-cols-1 gap-1.5" ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}>
      {opts.map((o) => {
        const def = WORKS[o.job]
        return (
          <button
            key={o.job}
            disabled={!o.ok}
            onClick={() => {
              const err = engine.startWork(army.id, o.job)
              if (err) toast(err)
              else onDone()
            }}
            className={`well flex w-full items-stretch gap-2.5 rounded-sm p-1.5 text-left text-[13px] transition hover:brightness-125 ${o.ok ? '' : 'opacity-50 grayscale-[60%]'}`}
          >
            <WorkArt job={o.job} size={84} />
            <span className="min-w-0 flex-1 py-0.5">
              <span className="flex justify-between gap-2 font-bold">
                <span className="text-gold-100">{def.name}</span>
                <span className="text-gold-300">{def.cost ? `${def.cost}g` : 'free'}</span>
              </span>
              <span className="block text-[11.5px] font-bold text-gold-300/70">{def.engineers}+ Engineers · ~{def.seconds}s</span>
              <span className={`mt-0.5 block text-[12px] leading-snug ${o.ok ? 'text-ink-300' : 'text-ember-300'}`}>{o.reason ?? def.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function BuildOutpostButton({ engine, army, toast, onDone }: { engine: GameEngine; army: Army; toast: (m: string) => void; onDone: () => void }) {
  const setOpen = (v: boolean) => {
    if (!v) onDone()
  }
  if (army.order.type === 'build') return null
  const opts = engine.outpostOptions(army.id)
  const open = true
  return (
    <div className="mt-1.5">
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
                    <span className="text-gold-300">{engine.outpostCost(PLAYER, o.kind)}g</span>
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

/** A supply wagon train: where it comes from, where it goes, and a way to cut it off. */
function ConvoyPanel({ engine, convoyId, onSelect, toast }: { engine: GameEngine; convoyId: string; onSelect: Props['onSelect']; toast: (m: string) => void }) {
  const w = engine.convoy(convoyId)
  if (!w) return null
  const rel = engine.relation(w.faction)
  const to = engine.outpost(w.outpostId)
  const from = engine.castle(w.fromCastleId)
  const hostile = engine.isHostile(w.faction, PLAYER)
  const raiders = hostile
    ? engine.state.armies
        .filter((a) => a.faction === PLAYER && a.status !== 'retreating' && !a.battleId)
        .map((a) => ({ a, d: Math.hypot(a.x - w.x, a.z - w.z) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 4)
    : []
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm" style={{ background: `linear-gradient(160deg, ${engine.factionColor(w.faction)}, #111)` }}>
          <Package size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">Supply wagons</h3>
          <p className={`text-[13px] ${rel === 'self' ? 'text-royal-300' : rel === 'ally' ? 'text-teal-300' : 'text-ember-300'}`}>{rel === 'self' ? 'Your supply line' : engine.factionName(w.faction)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-ink-400">From</dt>
        <dd>{from?.name ?? 'Unknown'}</dd>
        <dt className="text-ink-400">To</dt>
        <dd>{to?.name ?? 'Unknown'}</dd>
        <dt className="text-ink-400">Load</dt>
        <dd>+{w.cargo}% stores for the depot</dd>
      </dl>
      <p className="mt-3 text-[13px] leading-snug text-ink-400">
        {hostile
          ? 'Unarmed. Any army that reaches the wagons seizes them, and the depot they feed runs short of stores.'
          : 'Unarmed. If enemies reach the wagons they seize them; keep the road clear.'}
      </p>
      {hostile && (
        <section className="mt-3">
          <SectionTitle>Seize the wagons</SectionTitle>
          {raiders.length === 0 && <p className="text-[13px] text-ink-500">No free army to send.</p>}
          <div className="space-y-1">
            {raiders.map(({ a, d }) => (
              <button
                key={a.id}
                className="well flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-[13px] hover:brightness-125"
                onClick={() => {
                  engine.orderArmy(a.id, { type: 'raidConvoy', convoyId: w.id })
                  toast(`${a.name} rides to seize the wagons.`)
                  onSelect({ kind: 'army', id: a.id })
                }}
              >
                <span>{a.name}</span>
                <span className="text-ink-400 tabular-nums">{Math.round(d)}m</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function OutpostPanel({
  engine,
  outpost,
  onSelect,
  onFormArmy,
  toast,
}: {
  engine: GameEngine
  outpost: Outpost
  onSelect: Props['onSelect']
  onFormArmy: Props['onFormArmy']
  toast: (m: string) => void
}) {
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
          {kind.bombard > 0 && <li>🪨 Manned, bombards enemies and walls within {kind.bombard}m (more from high ground)</li>}
          {kind.archers > 1 && <li>🏹 Archers inside shoot {Math.round((kind.archers - 1) * 100)}% harder</li>}
          {kind.hides && <li>🫥 Troops inside stay hidden; riding out, 20 s of 1.25x speed and a 1.6x first blow</li>}
          {kind.refund > 0 && <li>🛞 Packs up again: {Math.round(kind.refund * 100)}% of the cost back</li>}
          <li>📦 Supplies armies within {Math.round(engine.outpostSupplyRange(outpost))}m</li>
          <li>❤ Armies here recover morale as in a castle</li>
          <li className="text-ember-300/90">⚠ Left empty, an enemy standing on it takes it in {OUTPOST.razeSeconds}s</li>
        </ul>
        {!done && <p className="mt-1 text-[12px] text-ink-400">Effects begin once construction is finished.</p>}
      </section>
      {outpost.kind === 'depot' && done && <DepotSection engine={engine} outpost={outpost} onFormArmy={onFormArmy} toast={toast} />}
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
          {kind.refund > 0 ? `Pack up · +${Math.round(engine.outpostCost(PLAYER, outpost.kind) * kind.refund)}g` : 'Dismantle'}
        </button>
      )}
    </div>
  )
}

/** Stores, quartered troops and commanders of a supply depot, and raising armies from it. */
function DepotSection({ engine, outpost, onFormArmy, toast }: { engine: GameEngine; outpost: Outpost; onFormArmy: Props['onFormArmy']; toast: (m: string) => void }) {
  const rel = engine.relation(outpost.faction)
  const stock = Math.round(outpost.stock ?? 100)
  const g = outpost.garrison ?? {}
  const n = total(g)
  const inbound = (engine.state.convoys ?? []).filter((w) => w.outpostId === outpost.id)
  const cmds = (outpost.commanders ?? []).map((k) => engine.commanders.get(k)).filter((c): c is NonNullable<typeof c> => !!c)
  const nearby =
    rel === 'self'
      ? engine.state.armies
          .filter((a) => a.faction === PLAYER && a.status !== 'retreating' && !a.battleId)
          .map((a) => ({ a, d: Math.hypot(a.x - outpost.x, a.z - outpost.z) }))
          .filter(({ d }) => d < 1600)
          .sort((x, y) => x.d - y.d)
          .slice(0, 4)
      : []
  return (
    <>
      <section className="mt-4">
        <SectionTitle right={<span className="text-[12px] text-ink-400">{inbound.length > 0 ? `${inbound.length} wagon train on the road` : 'no wagons on the road'}</span>}>Stores</SectionTitle>
        <div className="flex items-center gap-2 text-[13px]">
          <Bar value={stock} max={100} color={stock < 25 ? '#de5f45' : '#d1a73f'} height={6} />
          <span className="w-10 text-right tabular-nums">{stock}%</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink-400">
          Wagons from the nearest friendly castle keep the stores full. As stores run down, the supply reach shrinks; empty, the depot supplies no one. Enemies who reach the wagons seize them.
        </p>
      </section>
      {rel !== 'enemy' && (
        <section className="mt-4">
          <SectionTitle right={<span className="text-[12px] text-ink-400 tabular-nums">{fmt(n)} / 900</span>}>Quartered inside</SectionTitle>
          {n < 1 ? (
            <p className="text-[13px] text-ink-500">Nobody. Send an army in to quarter it here, out of sight.</p>
          ) : (
            <>
              <StackBar troops={g} units={engine.unitList} height={6} />
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-300 tabular-nums">
                {engine.unitList
                  .filter((u) => (g[u.key] ?? 0) >= 1)
                  .map((u) => (
                    <span key={u.key} className="flex items-center gap-1">
                      <UnitGlyph unit={u.key} size={12} color={u.color} />
                      {fmt(g[u.key])}
                    </span>
                  ))}
              </div>
            </>
          )}
          {cmds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cmds.map((c) => (
                <span key={c.key} className="well flex items-center gap-1.5 rounded-sm py-0.5 pr-2 pl-0.5 text-[12.5px]">
                  <PixelPortrait spec={c.portrait} size={22} />
                  {c.name}
                </span>
              ))}
            </div>
          )}
          {rel === 'self' && (
            <>
              <button className="btn btn-gold mt-2.5 w-full" disabled={n < 10} onClick={() => onFormArmy(outpost.id)}>
                <Swords size={15} /> Raise an army here
              </button>
              <p className="mt-1 text-[12px] text-ink-400">Only commanders quartered in this depot (or a captain) can lead troops raised here. Enemies at the gate make the garrison march out; if the depot is lost, they fall back to your nearest castle.</p>
            </>
          )}
        </section>
      )}
      {nearby.length > 0 && (
        <section className="mt-4">
          <SectionTitle>Send an army in</SectionTitle>
          <div className="space-y-1">
            {nearby.map(({ a, d }) => (
              <button
                key={a.id}
                className="well flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-[13px] hover:brightness-125"
                onClick={() => {
                  engine.orderArmy(a.id, { type: 'garrison', outpostId: outpost.id })
                  toast(`${a.name} will quarter in ${outpost.name}.`)
                }}
              >
                <span>{a.name}</span>
                <span className="text-ink-400 tabular-nums">
                  {fmt(total(a.troops))} · {Math.round(d)}m
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function KnownCount({ k }: { k: ReturnType<GameEngine['knowledge']> }) {
  if (k.kind === 'exact') return <>{fmt(Math.floor(k.total))}</>
  if (k.kind === 'scouted')
    return (
      <span title={`Scouted ${Math.round(k.age / 60)} min ago`}>
        {fmt(Math.round((k.total * (1 - k.error)) / 10) * 10)}–{fmt(Math.round((k.total * (1 + k.error)) / 10) * 10)}
      </span>
    )
  return <span title="A rumour, off by up to a third">~{fmt(k.total)}?</span>
}

/** Scouting orders for a small party, or the state of a pursuit party. */
function ScoutBox({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  const [target, setTarget] = useState('')
  if (army.pursuit) {
    const scout = engine.army(army.pursuit.scoutId)
    return (
      <div className="well mt-1.5 rounded-sm px-3 py-2 text-[13px]">
        <div className="text-ink-200">🏇 Chasing {scout ? scout.name : 'enemy scouts'}</div>
        <button className="btn mt-1.5 w-full text-[13px]" onClick={() => engine.recallPursuit(army.id)}>
          Call them back
        </button>
      </div>
    )
  }
  if (army.order.type === 'scout') {
    const o = army.order
    const t = engine.castle(o.targetId) ?? engine.army(o.targetId) ?? engine.outpost(o.targetId)
    return (
      <div className="well mt-1.5 rounded-sm px-3 py-2 text-[13px] text-ink-200">
        🔭 {o.phase === 'out' ? `Scouting ${t && 'name' in t ? t.name : 'the enemy'}` : 'Riding home with the report'}
        {army.spottedBy && <span className="text-ember-300"> · spotted!</span>}
        <div className="mt-0.5 text-[12px] text-ink-500">Seen so far: {Object.keys(army.scoutReport ?? {}).length} positions. The report only counts if they get home.</div>
      </div>
    )
  }
  if (total(army.troops) > SCOUT.maxSize) return null
  const options = [
    ...engine.state.castles
      .filter((c) => !c.ruined && c.faction !== 'neutral' && engine.isHostile(c.faction, PLAYER))
      .map((c) => ({ id: c.id, label: c.name, d: Math.hypot(c.x - army.x, c.z - army.z) })),
    ...engine.state.armies
      .filter((a) => engine.isHostile(a.faction, PLAYER) && a.order.type !== 'scout')
      .map((a) => ({ id: a.id, label: `${a.name} (army)`, d: Math.hypot(a.x - army.x, a.z - army.z) })),
  ]
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
  if (options.length === 0) return null
  const pick = target || options[0].id
  return (
    <div className="mt-1.5 flex gap-1.5">
      <select value={pick} onChange={(e) => setTarget(e.target.value)} className="well min-w-0 flex-1 rounded-sm px-2 py-1.5 text-[13px] outline-none">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label} · {Math.round(o.d)}m
          </option>
        ))}
      </select>
      <button
        className="btn shrink-0 text-[13px]"
        title="Ride out, look around, and bring the report home. Enemies who spot the scouts send riders after them."
        onClick={() => {
          const err = engine.startScout(army.id, pick)
          if (err) toast(err)
        }}
      >
        🔭 Scout
      </button>
    </div>
  )
}

/** Call on allied lords to send men to stand in this castle; shows who came. */
function AidRow({ engine, castle, toast, onSelect }: { engine: GameEngine; castle: Castle; toast: (m: string) => void; onSelect: (s: Selection, focus?: boolean) => void }) {
  const call = engine.aidCallAt(castle.id)
  const allies = engine.aidAllies(PLAYER).length
  if (allies === 0) return null
  if (call) {
    const helpers = call.armyIds.map((id) => engine.army(id)).filter((a): a is Army => !!a)
    const men = helpers.reduce((s, a) => s + totalInt(a.troops), 0)
    const left = Math.max(0, Math.ceil(call.until - engine.state.time))
    return (
      <div className="well mt-2 rounded-sm p-2 text-[12.5px]">
        <div className="flex items-center gap-2">
          <Handshake size={14} className="text-gold-300" />
          <span className="flex-1 font-bold text-gold-200">Aid called</span>
          <span className="text-ink-400 tabular-nums">{left}s left</span>
        </div>
        <p className="mt-1 text-ink-400">
          {helpers.length ? `${helpers.length} allied ${helpers.length === 1 ? 'contingent' : 'contingents'} · ${fmt(men)} soldiers` : `${call.answered.length} of ${allies} allies have answered; none on the way yet`}
        </p>
        {helpers.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {helpers.map((a) => (
              <button key={a.id} className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[12px] text-ink-200 hover:bg-white/10" onClick={() => onSelect({ kind: 'army', id: a.id }, true)}>
                {a.name} · {fmt(totalInt(a.troops))}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  const err = engine.aidProblem(castle.id)
  return (
    <button
      className="btn mt-1.5 w-full"
      disabled={!!err}
      title={err ?? 'Allied lords who are close, safe and have men to spare send them to stand in this castle until the danger passes.'}
      onClick={() => {
        const e = engine.callForAid(castle.id)
        if (e) toast(e)
      }}
    >
      <Handshake size={14} /> Call for aid{err && err.startsWith('Your allies were asked') ? ` · ${err.replace(/^.*wait /, '').replace('.', '')}` : ''}
    </button>
  )
}

/** One of the player's vassal villages: it runs itself, so this only reports. */
function VassalPanel({ engine, castle, onSelect }: { engine: GameEngine; castle: Castle; onSelect: (s: Selection, focus?: boolean) => void }) {
  const now = engine.state.time
  const n = total(castle.garrison)
  const cap = engine.capacity(castle)
  const home = engine.nearestCastle(castle.x, castle.z, PLAYER, undefined, true)
  const band = engine.army(castle.reliefArmyId)
  const nextIn = Math.max(0, Math.ceil((castle.nextTributeAt ?? 0) - now))
  const stoneIn = Math.max(0, Math.ceil(castle.lastCapturedAt + VILLAGE.stoneAfter - now))
  const rate = engine.tributeRate(castle) * engine.incomeMult(PLAYER)
  const kind = engine.holdingOf(castle)
  const H = HOLDINGS[kind]
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm text-[24px]" style={{ background: 'linear-gradient(160deg, #4f6fae, #1d2a44)' }}>
          {H.icon}
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">{castle.name}</h3>
          <p className="text-[13px] text-ink-400">Vassal {H.name.toLowerCase()} · {castle.tier >= 2 ? 'stone walls' : 'palisade'}</p>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-ink-400">
        It answers to you but runs its own affairs: it raises its own militia and sends men to help a castle of yours under siege nearby. {H.blurb}
      </p>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="w-20 text-ink-400">Militia</span>
          <div className="flex-1"><Bar value={n} max={cap} color="#7ea6e0" height={5} /></div>
          <span className="tabular-nums">{fmt(n)} / {fmt(cap)}</span>
        </div>
        {castle.maxWalls > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Walls</span>
            <div className="flex-1"><Bar value={castle.walls} max={castle.maxWalls} color="#c9b48a" height={5} /></div>
            <span className="tabular-nums">{Math.round((castle.walls / castle.maxWalls) * 100)}%</span>
          </div>
        )}
        {rate > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Tribute</span>
            <span className="flex-1 text-gold-300 tabular-nums">+{rate.toFixed(1)} gold/s</span>
          </div>
        )}
        {(rate > 0 || kind === 'abbey') && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Next wagon</span>
            <span className="flex-1 tabular-nums">
              {kind === 'abbey' ? `${HOLDING_EFFECTS.abbeyManpower[castle.tier]} volunteers` : `${fmt(Math.round(castle.tribute ?? 0))} gold`} {castle.battleId ? '· held while under attack' : nextIn > 0 ? `· leaves in ${nextIn}s` : '· loading'}
            </span>
          </div>
        )}
        {kind === 'abbey' && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Healing</span>
            <span className="flex-1">commanders recover {Math.round((1 - engine.woundFactor(PLAYER)) * 100)}% faster · infamy {engine.state.factions[PLAYER]?.infamy ?? 0}</span>
          </div>
        )}
        {kind === 'guildhall' && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Workshops</span>
            <span className="flex-1">engineers {engine.unitCost(PLAYER, 'engineers')}g · builds -{Math.round((1 - engine.buildDiscount(PLAYER)) * 100)}% · walls mend 1.5x</span>
          </div>
        )}
        {kind === 'keep' && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Patrol</span>
            <span className="flex-1">rides out within {HOLDING_EFFECTS.keepPatrol}m · horse {fmt(castle.garrison.cavalry ?? 0)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-20 text-ink-400">Delivers to</span>
          {home ? (
            <button className="flex-1 truncate text-left text-gold-200 hover:underline" onClick={() => onSelect({ kind: 'castle', id: home.id }, true)}>{home.name}</button>
          ) : (
            <span className="flex-1 text-ink-400">your treasury</span>
          )}
        </div>
        {castle.tier < 2 && (
          <div className="flex items-center gap-2">
            <span className="w-20 text-ink-400">Stone walls</span>
            <span className="flex-1 tabular-nums">{castle.battleId ? 'work stopped by fighting' : `the villagers finish them in ${stoneIn}s`}</span>
          </div>
        )}
      </div>
      {band && (
        <button className="btn mt-3 w-full" onClick={() => onSelect({ kind: 'army', id: band.id }, true)}>
          {totalInt(band.troops)} {kind === 'keep' ? 'riders out' : 'militia out helping'} · show
        </button>
      )}
      <p className="mt-3 text-[12px] leading-snug text-ink-400">Wagons can be raided on the road. Keep the way to your castle safe.</p>
    </div>
  )
}

/** A free village (win it over or plunder it) or the ruins of one. */
function VillagePanel({ engine, castle, toast }: { engine: GameEngine; castle: Castle; toast: (m: string) => void }) {
  const terms = engine.villageTerms(castle.id)
  const mine = engine.state.armies
    .filter((a) => a.faction === PLAYER && a.status !== 'retreating' && !a.battleId)
    .map((a) => ({ a, d: Math.hypot(a.x - castle.x, a.z - castle.z) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 4)
  const infamy = engine.state.factions[PLAYER]?.infamy ?? 0
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm text-[24px]" style={{ background: castle.ruined ? '#2a2420' : 'linear-gradient(160deg, #8a7650, #2a2218)' }}>
          {castle.ruined ? '🔥' : HOLDINGS[engine.holdingOf(castle)].icon}
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">{castle.name}</h3>
          <p className="text-[13px] text-ink-400">{castle.ruined ? 'Ruins, plundered' : `Free ${HOLDINGS[engine.holdingOf(castle)].name.toLowerCase()}`}</p>
        </div>
      </div>
      {!castle.ruined && (
        <p className="mt-2 rounded-sm border border-gold-400/25 bg-gold-500/10 px-2 py-1.5 text-[12px] leading-snug text-ink-300">
          <span className="font-bold text-gold-200">As your vassal: </span>
          {HOLDINGS[engine.holdingOf(castle)].blurb} Plundering it yields {HOLDINGS[engine.holdingOf(castle)].loot[0]}-{HOLDINGS[engine.holdingOf(castle)].loot[1]} gold{HOLDINGS[engine.holdingOf(castle)].infamy > 1 ? ` and costs ${HOLDINGS[engine.holdingOf(castle)].infamy} infamy` : ''}.
        </p>
      )}
      {castle.ruined ? (
        <p className="mt-3 text-[13px] leading-snug text-ink-400">Burned and abandoned. Nobody will live here again, and it is of no use to anyone.</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between text-[13px]">
            <span className="text-ink-400">Militia</span>
            <span className="tabular-nums">{fmt(total(castle.garrison))}</span>
          </div>
          <section className="mt-4">
            <SectionTitle>Negotiate</SectionTitle>
            <p className="text-[12.5px] leading-snug text-ink-400">
              Offer coin and protection. If they agree, the village becomes your vassal: it keeps its militia, pays tribute by wagon to your nearest castle, and fights for you on its own. Higher rank and nearby castles make them cheaper and more willing; plundered villages make every village warier.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[13px]">
              <div className="well rounded-sm px-2.5 py-1.5">
                <div className="text-[11px] tracking-wider text-ink-400 uppercase">Price</div>
                <div className="font-bold text-gold-300 tabular-nums">{fmt(terms.price)}g</div>
              </div>
              <div className="well rounded-sm px-2.5 py-1.5">
                <div className="text-[11px] tracking-wider text-ink-400 uppercase">Chance</div>
                <div className="font-bold tabular-nums">{Math.round(terms.chance * 100)}%</div>
              </div>
            </div>
            <button
              className="btn btn-gold mt-2 w-full"
              disabled={!!terms.reason}
              onClick={() => {
                const err = engine.negotiateVillage(castle.id)
                if (err) toast(err)
              }}
            >
              <Handshake size={14} /> Send envoys
            </button>
            {terms.reason && <p className="mt-1 text-[12px] text-ember-300">{terms.reason}</p>}
            <p className="mt-1 text-[12px] text-ink-500">If they refuse, 40% of the gifts are lost and they will not talk for a while.</p>
          </section>
          <section className="mt-4">
            <SectionTitle>Plunder</SectionTitle>
            <p className="text-[12.5px] leading-snug text-ink-400">
              Beat the militia and take gold and captives at once. The village burns and can never be held. {infamy > 0 && <span className="text-ember-300">Villages already distrust you ({infamy} plundered).</span>}
            </p>
            <div className="mt-2 space-y-1">
              {mine.length === 0 && <p className="text-[13px] text-ink-500">No army free to send.</p>}
              {mine.map(({ a, d }) => (
                <button
                  key={a.id}
                  className="btn btn-danger w-full justify-between px-3 text-[13px]"
                  onClick={() => {
                    engine.orderArmy(a.id, { type: 'attack', castleId: castle.id })
                    toast(`${a.name} marches to plunder ${castle.name}.`)
                  }}
                >
                  <span>Plunder with {a.name}</span>
                  <span className="tabular-nums opacity-80">
                    {fmt(totalInt(a.troops))} · {Math.round(d)}m
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/** A mine or lumber camp: who works it, how much is left, and who to send. */
function SitePanel({ engine, siteId, onSelect, toast }: { engine: GameEngine; siteId: string; onSelect: Props['onSelect']; toast: (m: string) => void }) {
  const site = engine.site(siteId)
  if (!site) return null
  const worker = engine.army(site.workerId)
  const stock = Math.round((site.stock / RESOURCE_STOCK) * 100)
  const crews = engine.state.armies
    .filter((a) => a.faction === PLAYER && (a.troops.engineers ?? 0) >= RESOURCE.minEngineers && a.status !== 'retreating')
    .map((a) => ({ a, d: Math.hypot(a.x - site.x, a.z - site.z) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 4)
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm text-[24px]" style={{ background: 'linear-gradient(160deg, #6f6a62, #1d1a17)' }}>
          {site.kind === 'mine' ? '⛏' : '🪓'}
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">{site.kind === 'mine' ? 'Mine' : 'Lumber camp'}</h3>
          <p className="text-[13px] text-ink-400">{worker ? `Worked by ${worker.name}${worker.faction !== PLAYER ? ` (${engine.factionName(worker.faction)})` : ''}` : 'Nobody works it'}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px]">
        <span className="w-16 text-ink-400">Left</span>
        <Bar value={stock} max={100} color="#d1a73f" height={5} />
        <span className="w-10 text-right tabular-nums">{stock}%</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-400">
        Engineers working here earn gold: {RESOURCE.minEngineers} engineers make about {RESOURCE.rate(10, site.kind).toFixed(1)}/s, 40 about {RESOURCE.rate(40, site.kind).toFixed(1)}/s{site.kind === 'mine' ? ' (mines pay 30% more)' : ''}. Army size does not matter, only engineers. The gold goes home by wagon, and enemies can seize the wagons.
      </p>
      {worker && worker.faction !== PLAYER && engine.isHostile(worker.faction, PLAYER) && (
        <p className="mt-2 text-[13px] text-ember-300">An enemy crew works it. Drive them off to take it over.</p>
      )}
      <section className="mt-4">
        <SectionTitle>Send engineers</SectionTitle>
        {crews.length === 0 && <p className="text-[13px] text-ink-500">No army with {RESOURCE.minEngineers}+ engineers.</p>}
        <div className="space-y-1">
          {crews.map(({ a, d }) => (
            <button
              key={a.id}
              className="well flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-[13px] hover:brightness-125"
              onClick={() => {
                const err = engine.startGather(a.id, site.id)
                if (err) toast(err)
                else {
                  toast(`${a.name} goes to work the ${site.kind === 'mine' ? 'mine' : 'forest'}.`)
                  onSelect({ kind: 'army', id: a.id })
                }
              }}
            >
              <span>{a.name}</span>
              <span className="text-ink-400 tabular-nums">
                {Math.floor(a.troops.engineers ?? 0)} eng · +{RESOURCE.rate(a.troops.engineers ?? 0, site.kind).toFixed(1)}/s · {Math.round(d)}m
              </span>
            </button>
          ))}
        </div>
      </section>
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
