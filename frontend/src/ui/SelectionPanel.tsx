import { ChevronsLeft, ChevronsRight, CircleArrowUp, Castle as CastleIcon, Coins, Combine, Flag, Hammer, Handshake, House, Megaphone, Package, Scissors, Shield, Swords, Tent, Undo2, Users, X } from 'lucide-react'
import { Glyph } from './Glyph'
import { STANCES } from '../game/convoyai'
import type { GlyphName } from '../render/glyphs'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  BLADES,
  SABOTAGE,
  SAPPERS,
  SABOTAGE_KINDS,
  TRAIN,
  SPY,
  WARDENS,
  OUTPOST,
  SCOUT,
  WORKS,
  PLAYER,
  AUTO_RECRUIT,
  AUTO_BUDGET_LABEL,
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
import { DOCTRINES, doctrineOf } from '../game/doctrines'
import { RESOURCE, RESOURCE_STOCK } from '../game/countryside'
import { TRAIT_MAP } from '../game/traits'
import { fmt, roman, total, totalInt } from '../game/troops'
import type { Army, Battle, Castle, Convoy, ConvoyStanceKind, Outpost, WorkJob } from '../game/types'
import { FIELD_STANCES, GROUP_FORMS, GUARD_RADII, type GroupForm } from '../game/fieldorders'
import type { Selection } from '../render/GameRenderer'
import { compactPanelWidth, useViewport } from './viewport'
import { panelFold, usePanelFolded } from './panelState'
import { MixBar, OutpostArt, WorkArt } from './art'
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
        <SanctuaryBox engine={engine} castle={c} toast={toast} />
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
  const folded = usePanelFolded()
  if (vp.compact) {
    // Folded away (e.g. while steering with the thumb stick): just a tab at the edge to bring it back.
    if (folded)
      return (
        <button
          className="panel pointer-events-auto absolute top-1/2 right-0 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-md px-1.5 py-3 text-gold-300"
          style={{ paddingRight: 'max(6px, env(safe-area-inset-right))' }}
          onClick={() => panelFold.set(false)}
          title="Show the panel"
        >
          <ChevronsLeft size={18} />
          <span className="text-[11px] font-bold tracking-wider [writing-mode:vertical-rl]">DETAILS</span>
        </button>
      )
    // Landscape phones: a panel down the right side, below the top bar; the map stays in view on the left.
    return (
      <div
        className="panel animate-slide-in safe-bottom pointer-events-auto absolute top-[64px] right-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-tl-md"
        style={{ width: compactPanelWidth(vp.w), paddingRight: 'env(safe-area-inset-right)' }}
      >
        <div className="absolute top-2 right-2 z-10 flex gap-1" style={{ marginRight: 'env(safe-area-inset-right)' }}>
          <button className="rounded-sm bg-black/30 p-1.5 text-ink-300" onClick={() => panelFold.set(true)} title="Fold away">
            <ChevronsRight size={18} />
          </button>
          <button className="rounded-sm bg-black/30 p-1.5 text-ink-300" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
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

/**
 * A host's make-up as muster cards: for each arm, a medallion with its glyph, its name and role, the
 * head count and its share of the whole, with a bar in the arm's colour.
 */
function Composition({ engine, troops }: { engine: GameEngine; troops: Record<string, number> }) {
  const n = total(troops)
  const rows = engine.unitList.filter((u) => (troops[u.key] ?? 0) >= 1)
  if (n < 1) return <p className="text-xs text-ink-400">No troops.</p>
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {rows.map((u) => {
        const v = troops[u.key] ?? 0
        const share = Math.round((v / n) * 100)
        return (
          <div key={u.key} className="well flex items-center gap-2 rounded-sm px-2 py-1.5" title={`${u.name}: ${u.role}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a2c1c,#110c07)] shadow-[inset_0_0_0_1px_rgb(233_200_105/0.5),0_1px_2px_#000]">
              <UnitGlyph unit={u.key} size={17} color={u.color} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate font-display text-[12px] font-bold tracking-wide text-gold-100">{u.name}</span>
                <span className="text-[13px] font-bold tabular-nums text-ink-100">{fmt(v)}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="flex-1">
                  <Bar value={v} max={n} color={u.color} height={4} />
                </span>
                <span className="w-7 text-right text-[11px] tabular-nums text-ink-400">{share}%</span>
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A captain's likeness for a band with no named commander: a face of their own under a nasal helm, in the realm's colours. */
function captainPortrait(seed: string, realm: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  const pick = <T,>(xs: T[], k: number) => xs[(h >>> k) % xs.length]
  const hair = pick(['#3a2a1a', '#6a4426', '#2a2018', '#8a6a3a', '#5a5048', '#a8743a'], 3)
  return {
    skin: pick(['#e0b08a', '#d09a74', '#c48a66', '#e8c2a0', '#b8805a', '#d8a888'], 0),
    hair,
    hair_style: 'short' as const,
    beard: pick(['full', 'short', 'stubble', 'mustache', 'none', 'goatee'] as const, 6),
    beard_color: hair,
    scar: (h >>> 9) % 4 === 0,
    age: pick(['young', 'veteran', 'veteran', 'old'] as const, 11),
    headgear: 'helm' as const,
    clothing: 'gambeson' as const,
    cloth: realm,
    trim: '#9a8a6a',
    bg: '#1a140e',
  }
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
          <PixelPortrait spec={cmd.portrait} size={48} className="ring-1 ring-gold-400/40" />
        ) : unknown ? (
          <span className="grid size-12 shrink-0 place-items-center rounded-lg" style={{ background: `linear-gradient(160deg, ${engine.factionColor(army.faction)}, #111)` }}>
            <Swords size={20} />
          </span>
        ) : (
          <PixelPortrait spec={captainPortrait(army.captainName ?? army.id, engine.factionColor(army.faction))} size={48} className="ring-1 ring-white/15" />
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

/** An order as a small card: a medallion with its sign, its name and a word on what it does. */
function OrderCard({ icon, label, note, onClick, disabled, danger, title }: { icon: ReactNode; label: string; note: string; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`well group flex flex-col items-center gap-1 rounded-sm px-1.5 pt-2 pb-1.5 text-center transition hover:brightness-125 disabled:opacity-40 disabled:hover:brightness-100 ${danger ? 'shadow-[inset_0_0_0_1px_rgb(240_97_74/0.35)]' : ''}`}
    >
      <span className={`grid size-8 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a2c1c,#110c07)] ${danger ? 'text-ember-300 shadow-[inset_0_0_0_1px_rgb(240_97_74/0.6),0_1px_2px_#000]' : 'text-gold-300 shadow-[inset_0_0_0_1px_rgb(233_200_105/0.5),0_1px_2px_#000]'}`}>{icon}</span>
      <span className={`font-display text-[12.5px] font-bold tracking-wide ${danger ? 'text-ember-300' : 'text-gold-100'}`}>{label}</span>
      <span className="w-full truncate text-[10.5px] leading-tight text-ink-400">{note}</span>
    </button>
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
    // A field standing order says what the army is about, whatever step it is taking.
    const st = army.stance
    const tgt = st?.targetId ? engine.army(st.targetId) : undefined
    if (st?.kind === 'escortArmy' && tgt && !army.battleId) return `Escorting ${tgt.name}`
    if (st?.kind === 'follow' && tgt) return `Following ${tgt.name}`
    if (st?.kind === 'guard' && !army.battleId) return o.type === 'intercept' ? `On guard: driving off ${engine.army(o.armyId)?.name ?? 'the enemy'}` : `On guard (${st.r ?? 400}m)`
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
      case 'escort': {
        const w = engine.convoy(o.convoyId)
        return w?.race ? `Guarding gold wagon ${roman(w.race)}` : 'Guarding the wagons'
      }
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
          <div className="font-bold text-gold-200"><Glyph name="crown" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />The Royal Guard</div>
          <p className="mt-0.5 text-ink-300">
            Household knights from the homeland: never reinforced, no upkeep. In the field the King's presence steadies every friendly army within 350m (+15% damage, -10% losses, morale holds). Allies answer his summons more readily; envoys near him do better. If the Guard is destroyed, the war is lost. In a castle it waits in the keep and rides out by the far gate if the castle falls.
          </p>
        </div>
      )}
      {battle && <BattleBox engine={engine} battle={battle} />}

      <div className="parchment mt-3 flex items-center gap-2 rounded-sm px-3 py-1.5">
        <Flag size={14} className="shrink-0 text-[#7a5410]" />
        <span className="min-w-0">
          <span className="block font-display text-[10.5px] font-bold tracking-[0.14em] text-[#7a5410] uppercase">Current order</span>
          <span className="block text-[13px] leading-snug italic">{orderText}</span>
        </span>
      </div>
      {!army.supplied && (
        <div className="mt-2 rounded-sm border border-ember-400/40 bg-ember-700/25 px-3 py-2 text-[13px] text-ember-300">
          <Glyph name="warning" size={13} className="mr-1 -mt-0.5 inline " />Out of supply: losing men and morale. Return within reach of a castle, or build a Supply Depot.
        </div>
      )}
      <SpyBox engine={engine} army={army} />
      <AsheBox engine={engine} army={army} />
      <SappersBox engine={engine} army={army} toast={toast} />
      <WardensBox engine={engine} army={army} />
      <StanceBox engine={engine} army={army} />
      <FieldOrdersBox engine={engine} army={army} toast={toast} />
      <BattleGroupBox engine={engine} army={army} />
      {engine.isHidden(army) && !engine.isSpyBand(army) && (
        <div className="mt-2 rounded-sm border border-emerald-400/30 bg-emerald-700/20 px-3 py-2 text-[13px] text-emerald-300">
          <Glyph name="tree" size={13} className="mr-1 -mt-0.5 inline " />Hidden in the woods. Enemies who blunder into this army will be ambushed.
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
          <option value="">Attack a castle…</option>
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {engine.factionName(c.faction)} · {Math.round(Math.hypot(c.x - army.x, c.z - army.z))}m
            </option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-1.5">
          <OrderCard icon={<Flag size={16} />} label="Hold" note="Stand fast here" disabled={locked || !!army.battleId} onClick={() => engine.orderArmy(army.id, { type: 'hold' })} />
          <OrderCard icon={<Undo2 size={16} />} label="Retreat" note="Fall back home" danger disabled={locked} onClick={() => engine.retreat(army.id)} />
          <OrderCard
            icon={<House size={16} />}
            label="Garrison"
            note={atCastle?.faction === PLAYER ? `Into ${atCastle.name}` : 'Nearest castle'}
            disabled={!!army.battleId}
            title={atCastle?.faction === PLAYER ? `Merge into ${atCastle.name}` : 'March to the nearest castle and join its garrison'}
            onClick={() => {
              const err = engine.garrisonArmy(army.id)
              if (err) toast(err)
            }}
          />
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
                  {a.blades && (engine.bladesReady(a) ? <span className="mr-1 text-gold-200">strike {Math.round(engine.strikeChance(a, army) * 100)}% ·</span> : <span className="mr-1 text-ink-500">regrouping ·</span>)}
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
            {castle.capital && <Glyph name="crown" size={14} className="mr-1 -mt-0.5 text-gold-300" />}
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
          {engine.recruitUnits.map((u) => {
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
        <AutoRecruitBox engine={engine} castle={castle} />
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
      {k.troops ? <Composition engine={engine} troops={k.troops} /> : <p className="text-[12.5px] text-ink-400">Only a rumour. Send scouts to learn its true strength and make-up.</p>}
      {hostile && castle.faction !== 'neutral' && <SendScouts engine={engine} targetId={castle.id} x={castle.x} z={castle.z} toast={toast} />}
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
            {(engine.state.rules.mode === 'alliance' || engine.state.rules.mode === 'grand') && <SummonBox engine={engine} castle={castle} toast={toast} />}
            {(engine.state.rules.mode === 'alliance' || engine.state.rules.mode === 'grand') && (
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
      {carried.length > 0 && <p className="mb-1 text-[12px] text-gold-200"><Glyph name="gear" size={13} className="mr-1 -mt-0.5 inline " />Pushing along: {carried.join(', ')}</p>}
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
  const reveal = useRevealOnce()
  const opts = engine.workOptions(army.id).filter((o) => jobs.includes(o.job))
  return (
    <div className="mt-1.5 grid grid-cols-1 gap-1.5" ref={reveal}>
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
  const reveal = useRevealOnce()
  const setOpen = (v: boolean) => {
    if (!v) onDone()
  }
  if (army.order.type === 'build') return null
  const opts = engine.outpostOptions(army.id)
  const open = true
  return (
    <div className="mt-1.5">
      {open && (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5" ref={reveal}>
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
/** Convoy Raid: one wagon of the gold train. Ours: send guards to walk beside it. Theirs: send raiders after it. */
function GoldWagonPanel({ engine, w, onSelect, toast }: { engine: GameEngine; w: Convoy; onSelect: Props['onSelect']; toast: (m: string) => void }) {
  const mine = w.faction === PLAYER
  const to = engine.castle(w.fromCastleId)
  const pct = Math.round(engine.wagonProgress(w) * 100)
  const guards = engine.state.armies.filter((a) => a.order.type === 'escort' && a.order.convoyId === w.id)
  const free = engine.state.armies
    .filter((a) => a.faction === PLAYER && a.status !== 'retreating' && !a.battleId && !(a.order.type === 'escort' && a.order.convoyId === w.id))
    .map((a) => ({ a, d: Math.hypot(a.x - w.x, a.z - w.z) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 5)
  return (
    <div>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-12 place-items-center rounded-sm text-gold-200" style={{ background: `linear-gradient(160deg, ${engine.factionColor(w.faction)}, #111)` }}>
          <Glyph name="wagon" size={26} />
        </span>
        <div className="min-w-0">
          <h3 className="panel-title truncate">Gold wagon {roman(w.race ?? 1)}</h3>
          <p className={`text-[13px] ${mine ? 'text-royal-300' : 'text-ember-300'}`}>{mine ? 'Our gold train' : engine.factionName(w.faction)}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[12px] text-ink-400">
          <span>To {to?.name ?? 'the castle'}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
          <i className="block h-full bg-gold-300" style={{ width: `${pct}%` }} />
        </div>
        {w.detour && <p className="mt-1 text-[12px] text-ember-300">The bridge is down: taking the ford.</p>}
        {!!w.seize && (
          <p className="mt-1 text-[12.5px] font-semibold text-ember-300">
            {mine ? 'Being seized' : 'Unhitching'}: {Math.round((w.seize / TRAIN.seizeSeconds) * 100)}%
          </p>
        )}
        {engine.state.train?.halted && <p className="mt-1 text-[12px] text-gold-200">The train is halted.</p>}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink-400">
        {mine
          ? `Raiders who reach it need ${TRAIN.seizeSeconds} seconds to cut the team loose, and cannot while a guard stands beside it. A guard locked in a fight guards nothing.`
          : `Stand at it for ${TRAIN.seizeSeconds} seconds to make off with it. While a free guard stands beside it, it cannot be taken: pin the guards in a fight, or beat them.`}
      </p>
      {mine && guards.length > 0 && <p className="mt-1 text-[12.5px] text-emerald-300">Guarded by {guards.map((g) => g.name).join(', ')}.</p>}
      <section className="mt-3">
        <SectionTitle>{mine ? 'Send a guard' : 'Seize it'}</SectionTitle>
        {free.length === 0 && <p className="text-[13px] text-ink-500">No free army to send.</p>}
        <div className="space-y-1">
          {free.map(({ a, d }) => (
            <button
              key={a.id}
              className="well flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-[13px] hover:brightness-125"
              onClick={() => {
                engine.orderArmy(a.id, mine ? { type: 'escort', convoyId: w.id } : { type: 'raidConvoy', convoyId: w.id })
                toast(mine ? `${a.name} falls in beside wagon ${roman(w.race ?? 1)}.` : `${a.name} rides to seize wagon ${roman(w.race ?? 1)}.`)
                onSelect({ kind: 'army', id: a.id })
              }}
            >
              <span className="truncate font-medium">{a.name}</span>
              <span className="text-ink-400 tabular-nums">{Math.round(d)}m</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function ConvoyPanel({ engine, convoyId, onSelect, toast }: { engine: GameEngine; convoyId: string; onSelect: Props['onSelect']; toast: (m: string) => void }) {
  const w = engine.convoy(convoyId)
  if (!w) return null
  if (w.race) return <GoldWagonPanel engine={engine} w={w} onSelect={onSelect} toast={toast} />
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
          <li><Glyph name="shield" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Defenders inside take {Math.round((1 - 1 / kind.defense) * 100)}% fewer losses</li>
          {kind.braces && <li><Glyph name="stakes" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Its walls stop enemy charges</li>}
          {kind.zoc > 0 && (
            <li>
              <Glyph name="slow" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Enemies within {kind.zoc}m march {Math.round((1 - kind.zocSlow) * 100)}% slower
            </li>
          )}
          {kind.bombard > 0 && <li><Glyph name="boulder" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Manned, bombards enemies and walls within {kind.bombard}m (more from high ground)</li>}
          {kind.archers > 1 && <li><Glyph name="bow" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Archers inside shoot {Math.round((kind.archers - 1) * 100)}% harder</li>}
          {kind.hides && <li><Glyph name="eyeClosed" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Troops inside stay hidden; riding out, 20 s of 1.25x speed and a 1.6x first blow</li>}
          {kind.refund > 0 && <li><Glyph name="wheel" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Packs up again: {Math.round(kind.refund * 100)}% of the cost back</li>}
          <li><Glyph name="crate" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Supplies armies within {Math.round(engine.outpostSupplyRange(outpost))}m</li>
          <li><Glyph name="heart" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Armies here recover morale as in a castle</li>
          <li className="text-ember-300/90"><Glyph name="warning" size={13} className="mr-1 -mt-0.5 inline " />Left empty, an enemy standing on it takes it in {OUTPOST.razeSeconds}s</li>
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

/**
 * Send scouts at this target with one tap: pick one of your castles or supply depots
 * (nearest first) and a party of riders sets out from it on its own.
 */
function SendScouts({ engine, targetId, x, z, toast }: { engine: GameEngine; targetId: string; x: number; z: number; toast: (m: string) => void }) {
  const [from, setFrom] = useState('')
  const origins = engine.scoutOrigins(x, z)
  const out = engine.state.armies.filter((a) => a.faction === PLAYER && a.order.type === 'scout' && a.order.targetId === targetId)
  if (origins.length === 0) return null
  const pick = origins.find((o) => o.id === from) ?? origins.find((o) => o.men >= SCOUT.party / 2) ?? origins[0]
  return (
    <div className="well mt-3 rounded-sm px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="font-semibold text-ink-100"><Glyph name="spyglass" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />Scout this castle</span>
        {out.length > 0 && <span className="text-[12px] text-gold-300">{out.length} party on the way</span>}
      </div>
      <div className="flex gap-1.5">
        <select value={pick.id} onChange={(e) => setFrom(e.target.value)} className="well min-w-0 flex-1 rounded-sm px-2 py-1.5 text-[13px] outline-none" title="Where the scouts set out from">
          {origins.map((o) => (
            <option key={o.id} value={o.id} disabled={o.men < SCOUT.party / 2}>
              {o.kind === 'depot' ? 'Depot · ' : ''}
              {o.name} · {Math.round(o.d)}m{o.men < SCOUT.party / 2 ? ' · too few men' : ''}
            </option>
          ))}
        </select>
        <button
          className="btn btn-gold shrink-0 px-3 text-[13px]"
          disabled={pick.men < SCOUT.party / 2}
          title={`${SCOUT.party} scouts (riders first) ride out, look around and bring the report home. Enemies who spot them send riders after them.`}
          onClick={() => {
            const err = engine.dispatchScouts(pick.id, targetId)
            toast(err ?? `${SCOUT.party} scouts ride out of ${pick.name}.`)
          }}
        >
          Send
        </button>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-500">
        {SCOUT.party} men ({Math.min(SCOUT.party, pick.riders)} riders) leave {pick.name}. The report counts only if they get home.
      </p>
    </div>
  )
}

/**
 * A ref that brings a freshly opened list into view once. (An inline ref callback would run
 * again on every re-render, several times a second while the war runs, and keep yanking
 * the panel back, so it could not be scrolled.)
 */
function useRevealOnce() {
  const done = useRef(false)
  return useCallback((el: HTMLElement | null) => {
    if (!el || done.current) return
    done.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])
}

/**
 * The field's standing orders for one of our armies: escort or follow another army of ours (picked
 * on the map, or from the nearest here), or guard a post within a radius. Any order by hand cancels it.
 */
function FieldOrdersBox({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  if (engine.state.train || army.faction !== PLAYER || army.royal) return null
  const st = army.stance
  const picking = engine.picking?.armyId === army.id ? engine.picking : null
  const target = st?.targetId ? engine.army(st.targetId) : undefined
  const guards = engine.state.armies.filter((a) => a.faction === PLAYER && a.stance?.targetId === army.id)
  const near = engine.state.armies
    .filter((a) => a.faction === PLAYER && a.id !== army.id && a.status !== 'retreating')
    .map((a) => ({ a, d: Math.hypot(a.x - army.x, a.z - army.z) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 5)
  const now = st?.kind === 'escortArmy' && target ? `Escorting ${target.name}` : st?.kind === 'follow' && target ? `Following ${target.name}` : st?.kind === 'guard' ? `Guarding (${st.r ?? 400}m)` : 'By hand'
  const glyph = { escortArmy: 'shield', follow: 'muster', guard: 'tower' } as const
  const r = st?.kind === 'guard' ? (st.r ?? GUARD_RADII[1]) : GUARD_RADII[1]
  return (
    <div className="mt-2 rounded-sm border border-gold-500/25 bg-black/20 px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gold-200">Standing orders</span>
        <span className="ml-auto truncate text-[12px] text-ink-300">{now}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(['escortArmy', 'follow', 'guard'] as const).map((k) => (
          <button
            key={k}
            title={FIELD_STANCES[k].text}
            className={`btn flex items-center justify-center gap-1 px-1 text-[12.5px] ${st?.kind === k || picking?.kind === k ? 'btn-gold' : ''}`}
            onClick={() => {
              if (k === 'guard') {
                engine.setPicking(null)
                engine.setStance(army.id, { kind: 'guard', x: army.x, z: army.z, r })
              } else engine.setPicking(picking?.kind === k ? null : { armyId: army.id, kind: k })
            }}
          >
            <Glyph name={glyph[k]} size={13} />
            {FIELD_STANCES[k].name}
          </button>
        ))}
      </div>
      {picking && (
        <div className="mt-1.5 rounded-sm border border-gold-400/40 bg-gold-500/10 px-2 py-1.5">
          <p className="text-[12px] text-gold-200">Tap one of our armies on the map for {army.name} to {picking.kind === 'follow' ? 'follow' : 'escort'}, or choose one here:</p>
          <div className="mt-1 space-y-1">
            {near.map(({ a, d }) => (
              <button
                key={a.id}
                className="btn w-full justify-between px-2.5 py-1 text-[12.5px]"
                onClick={() => {
                  const err = engine.setStance(army.id, { kind: picking.kind, targetId: a.id })
                  if (err) toast(err)
                  else engine.setPicking(null)
                }}
              >
                <span className="truncate">{a.name}</span>
                <span className="text-ink-400 tabular-nums">{fmt(totalInt(a.troops))} · {Math.round(d)}m</span>
              </button>
            ))}
            {near.length === 0 && <p className="text-[12px] text-ink-500">No other army of ours in the field.</p>}
          </div>
          <button className="mt-1 text-[12px] text-ink-400 underline" onClick={() => engine.setPicking(null)}>
            Cancel
          </button>
        </div>
      )}
      {st?.kind === 'guard' && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px]">
          <span className="text-ink-400">Radius</span>
          {GUARD_RADII.map((v, i) => (
            <button key={v} className={`btn flex-1 px-1 py-0.5 text-[12px] ${r === v ? 'btn-gold' : ''}`} onClick={() => engine.setStance(army.id, { ...st, r: v })}>
              {['Small', 'Medium', 'Large'][i]} · {v}m
            </button>
          ))}
        </div>
      )}
      {st && (
        <button className="btn mt-1.5 w-full px-1 text-[12.5px]" title="Cancel the standing order: the army waits for your orders." onClick={() => engine.setStance(army.id, null)}>
          Back to orders by hand
        </button>
      )}
      {guards.some((g) => g.stance?.kind === 'follow') && <p className="mt-1.5 text-[12px] text-ink-400">Following it: {guards.filter((g) => g.stance?.kind === 'follow').map((g) => g.name).join(', ')}</p>}
      <p className="mt-1.5 text-[12px] leading-snug text-ink-400">{st ? FIELD_STANCES[st.kind as keyof typeof FIELD_STANCES]?.text : picking ? '' : 'Escort or follow another army, or guard this ground: the army carries it out by itself; any order you give by hand cancels it.'}</p>
    </div>
  )
}

/**
 * A battle group: the lead army and the escorts riding with it (at most four). How they stand about
 * it (box, line, wedge), who they are and how strong; and, when the lead assaults a castle, the
 * escorts fan out round it and go in from every side at once (the defenders' walls count for less).
 */
function BattleGroupBox({ engine, army }: { engine: GameEngine; army: Army }) {
  if (engine.state.train || army.faction !== PLAYER) return null
  const escorts = engine.escortsOf(army)
  const lead = army.stance?.kind === 'escortArmy' ? engine.army(army.stance.targetId) : undefined
  if (lead) {
    const mates = engine.escortsOf(lead)
    return (
      <div className="mt-2 rounded-sm border border-royal-400/30 bg-royal-950/30 px-3 py-2 text-[12.5px]">
        <span className="font-semibold text-royal-200">Battle group of {lead.name}</span>
        <span className="text-ink-400"> · escort {mates.findIndex((m) => m.id === army.id) + 1} of {mates.length} · {GROUP_FORMS[lead.groupForm ?? 'box'].name}</span>
      </div>
    )
  }
  if (escorts.length === 0) return null
  const form: GroupForm = army.groupForm ?? 'box'
  const all = [army, ...escorts]
  const men = all.reduce((n, a) => n + total(a.troops), 0)
  const siege = engine.state.battles.find((b) => b.kind === 'siege' && b.sideA.armyIds.includes(army.id))
  const sides = siege ? engine.siegeSides(siege) : 0
  return (
    <div className="mt-2 rounded-sm border border-royal-400/30 bg-royal-950/30 px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <Glyph name="muster" size={15} className="text-royal-300" />
        <span className="font-semibold text-royal-200">Battle group</span>
        <span className="ml-auto text-[12px] tabular-nums text-ink-300">
          {all.length} armies · {fmt(men)}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(Object.keys(GROUP_FORMS) as GroupForm[]).map((k) => (
          <button key={k} title={GROUP_FORMS[k].text} className={`btn px-1 text-[12.5px] ${form === k ? 'btn-gold' : ''}`} onClick={() => engine.setGroupForm(army.id, k)}>
            {GROUP_FORMS[k].name}
          </button>
        ))}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {escorts.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2 text-[12px]">
            <span className="w-4 text-center text-ink-500 tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink-200">{e.name}</span>
            <span className="text-ink-400 tabular-nums">{fmt(totalInt(e.troops))}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-400">
        {GROUP_FORMS[form].text} Order the lead to attack a castle and the escorts fan out round it and go in from every side at once: each extra side costs the defenders 10% of their walls' worth (at most 30%).
        {siege ? ` Now pressing from ${sides} side${sides > 1 ? 's' : ''}.` : ''}
      </p>
    </div>
  )
}

/**
 * Convoy Raid: standing orders. A band on one carries it out by itself (any order given by
 * hand cancels it), so the player can steer the commander and leave the rest to their orders.
 */
function StanceBox({ engine, army }: { engine: GameEngine; army: Army }) {
  if (!engine.state.train || army.faction !== PLAYER) return null
  const side = engine.trainEscort() === PLAYER ? 'escort' : 'raid'
  const cur = army.stance?.kind as ConvoyStanceKind | undefined
  const kinds = (Object.keys(STANCES) as ConvoyStanceKind[]).filter((k) => STANCES[k].side === side && (!STANCES[k].engineers || (army.troops.engineers ?? 0) >= 10) && (!STANCES[k].blades || !!army.blades))
  const glyph: Record<ConvoyStanceKind, GlyphName> = { escort: 'wagon', hunt: 'horse', picket: 'flag', ambush: 'tree', harass: 'swords', bridge: 'stakes', strike: 'dagger' }
  return (
    <div className="mt-2 rounded-sm border border-gold-500/25 bg-black/20 px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gold-200">Standing orders</span>
        <span className="ml-auto text-[12px] text-ink-400">{cur ? `${STANCES[cur].name}${STANCES[cur].here ? ' (here)' : ''}` : 'By hand'}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {kinds.map((k) => (
          <button
            key={k}
            title={STANCES[k].text}
            className={`btn flex items-center justify-center gap-1 px-1 text-[12.5px] ${cur === k ? 'btn-gold' : ''}`}
            onClick={() => {
              // "Here" orders take the army's present ground as their post.
              engine.setStance(army.id, STANCES[k].here ? { kind: k, x: army.x, z: army.z } : { kind: k })
            }}
          >
            <Glyph name={glyph[k]} size={13} />
            {STANCES[k].name}
          </button>
        ))}
        {cur && (
          <button className="btn px-1 text-[12.5px]" title="Cancel the standing order: the band waits for your orders." onClick={() => engine.setStance(army.id, null)}>
            By hand
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-400">{cur ? STANCES[cur].text : 'Choose a standing order and the band carries it out on its own; any order you give by hand cancels it.'}</p>
    </div>
  )
}

/**
 * The spymaster's band: whether the enemy can see it, and why. It hides on its own; the player
 * only chooses the road (woods, valleys, foul weather) and the moment to strike.
 */
function SpyBox({ engine, army }: { engine: GameEngine; army: Army }) {
  if (!engine.isSpyBand(army) || army.faction !== PLAYER) return null
  const route = army.path.length > 0 ? engine.routeForecast(army) : null
  const steps = route ? route.concealed + route.disguised + route.watched : 0
  const n = Math.round(total(army.troops))
  const problem = engine.veilProblem(army)
  const here = engine.veilHere(army)
  const watcher = !problem && !army.veil ? engine.veilSpotter(army, here.veil) : null
  const state = army.veil ?? 'seen'
  const look = {
    concealed: { glyph: 'eyeClosed', name: 'Concealed', tone: 'border-emerald-500/40 bg-emerald-950/40', text: 'text-emerald-300', say: `Unseen ${here.why}. The enemy cannot see them; walls (${SPY.castleWatch}m out), watch posts and blundering into a host give them away.` },
    disguised: { glyph: 'eyeHalf', name: 'Disguised', tone: 'border-gold-500/40 bg-gold-600/15', text: 'text-gold-200', say: `Passing ${here.why}. The enemy pays them no heed, but scouts within ${SPY.scoutEye}m, walls (${SPY.castleWatchDisguised}m out) and watch posts look closer. Woods, river valleys or foul weather hide them better.` },
    seen: { glyph: 'eye', name: 'Seen', tone: 'border-ember-500/40 bg-ember-700/25', text: 'text-ember-300', say: problem ?? watcher ?? 'In plain sight.' },
  }[state] as { glyph: GlyphName; name: string; tone: string; text: string; say: string }
  return (
    <div className={`mt-2 rounded-sm border px-3 py-2 text-[13px] ${look.tone}`}>
      <div className="flex items-center gap-2">
        <Glyph name={look.glyph} size={18} className={look.text} />
        <span className={`font-semibold ${look.text}`}>{look.name}</span>
        <span className="ml-auto text-[12px] tabular-nums text-ink-300">{n}</span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-400">{look.say}</p>
      {route && steps > 0 && (
        <div className="mt-1.5">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-black/40" title="The road ahead: under cover, in disguise, watched">
            <i className="bg-emerald-400" style={{ width: `${(route.concealed / steps) * 100}%` }} />
            <i className="bg-gold-300" style={{ width: `${(route.disguised / steps) * 100}%` }} />
            <i className="bg-ember-400" style={{ width: `${(route.watched / steps) * 100}%` }} />
          </div>
          <p className={`mt-1 text-[12px] leading-snug ${route.watched > 0 ? 'text-ember-300' : 'text-ink-400'}`}>
            {route.watched > 0
              ? `The road passes under watch: ${route.watches.slice(0, 2).join(', ')}${route.watches.length > 2 ? ` and ${route.watches.length - 2} more` : ''}. They will be found there.`
              : `The road ahead: ${Math.round((route.concealed / steps) * 100)}% under cover, the rest in disguise. No watch on it.`}
          </p>
        </div>
      )}
      {state !== 'seen' && <p className="mt-1 text-[12px] leading-snug text-ink-500">Their first blow from hiding strikes {state === 'concealed' ? SPY.strike : SPY.strikeDisguised}x as hard for {SPY.strikeSeconds}s.</p>}
    </div>
  )
}

/** Auto-recruit for one castle: off, or raising troops for a kind of host; and the realm's spending on it. */
function AutoRecruitBox({ engine, castle }: { engine: GameEngine; castle: Castle }) {
  const choice = castle.autoRecruit ?? ''
  const known = choice === '' || choice === 'recommended' || choice === 'captain' || !!DOCTRINES[choice]
  const value = known ? choice : 'recommended'
  const mix = engine.autoRecruitMix(value || null)
  const budget = engine.state.recruitBudget ?? 'normal'
  const cmds = Object.keys(DOCTRINES).filter((k) => engine.commanders.has(k) && engine.state.commanders[k]?.owner === PLAYER)
  return (
    <div className="mt-2 rounded-lg border border-white/6 px-2.5 py-2 text-xs">
      <label className="flex items-center gap-2">
        <Hammer size={13} className={castle.autoRecruit ? 'text-gold-400' : 'text-ink-500'} />
        <span className="flex-1">Auto-recruit</span>
        <select
          value={value}
          onChange={(e) => engine.setAutoRecruit(castle.id, e.target.value || null)}
          className="max-w-[60%] rounded-md border border-white/10 bg-ink-850 px-2 py-1 text-[13px] outline-none focus:border-gold-400"
        >
          <option value="">Off</option>
          <option value="recommended">Recommended (any commander)</option>
          {cmds.map((k) => (
            <option key={k} value={k}>
              For {engine.commanders.get(k)?.name}: {DOCTRINES[k].name}
            </option>
          ))}
          <option value="captain">For a captain: {doctrineOf(null).name}</option>
        </select>
      </label>
      {value && (
        <>
          <div className="mt-2">
            <MixBar mix={mix} units={engine.unitList} height={6} />
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-400">
            {value === 'recommended' ? 'A garrison any commander can draw on, engineers included. ' : 'Raised for that kind of host. '}
            It buys whatever the garrison is shortest of.
          </p>
        </>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-ink-400">Spending</span>
        <div className="ml-auto flex gap-1">
          {Object.keys(AUTO_RECRUIT.budgets).map((k) => (
            <button key={k} className={`btn px-2 py-0.5 text-[12px] ${budget === k ? 'outline outline-1 outline-gold-400 brightness-125' : ''}`} onClick={() => engine.setRecruitBudget(k)}>
              {AUTO_BUDGET_LABEL[k]} {Math.round(AUTO_RECRUIT.budgets[k] * 100)}%
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
        All auto-recruiting castles together spend at most this share of your net income, and always leave {AUTO_RECRUIT.reserve} gold in the treasury for building.
      </p>
    </div>
  )
}

/**
 * The Wardens of the March: what they see, what they find, and what they keep marked on our map.
 * (The rings on the ground show the same: the inner one where hidden bands are found, the outer how far they see.)
 */
function WardensBox({ engine, army }: { engine: GameEngine; army: Army }) {
  if (army.faction !== PLAYER || !army.wardens) return null
  const team = engine.team(PLAYER)
  const now = engine.state.time
  const full = engine.fullStrength(army)
  const marked = engine.state.armies.filter((a) => engine.isHostile(PLAYER, a.faction) && (a.marked?.[team] ?? 0) > now).length
  // Hidden enemy bands they have found and keep in sight.
  const found = engine.state.armies.filter((a) => engine.isHostile(PLAYER, a.faction) && engine.isSpyBand(a) && !a.veil && engine.canSee(team, a) && Math.hypot(a.x - army.x, a.z - army.z) < WARDENS.reveal + 60)
  return (
    <div className="mt-2 rounded-sm border border-lime-400/30 bg-lime-950/30 px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <Glyph name="eye" size={16} className="text-lime-300" />
        <span className="font-semibold text-lime-200">The Wardens of the March</span>
        <span className={`ml-auto text-[12px] tabular-nums ${total(army.troops) < full - 0.5 ? 'text-ember-300' : 'text-ink-300'}`}>
          {totalInt(army.troops)} / {Math.round(full)}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-400">
        Fenwick's mounted bowmen: never reinforced (an abbey of ours can take them in), no siege work, poor in a stand-up fight. They see {Math.round(engine.wardenSight())}m, find hidden bands within {WARDENS.reveal}m (concealed or disguised), and keep every enemy army they sight on our map for {WARDENS.mark}s.
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-center">
        <div className="well rounded-sm px-2 py-1">
          <div className="text-[11px] tracking-wide text-ink-500 uppercase">Marked</div>
          <div className="font-semibold tabular-nums text-lime-200">{marked}</div>
        </div>
        <div className="well rounded-sm px-2 py-1">
          <div className="text-[11px] tracking-wide text-ink-500 uppercase">Spies found</div>
          <div className={`font-semibold tabular-nums ${found.length ? 'text-ember-300' : 'text-ink-300'}`}>{found.length}</div>
        </div>
      </div>
      {found.length > 0 && <p className="mt-1 text-[12px] text-ember-300">{found.map((a) => a.name).join(', ')} in sight: keep close and they cannot hide again.</p>}
      <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[12px] leading-snug text-ink-400">
        Living off the land: never out of supply, and {Math.round((WARDENS.pace - 1) * 100)}% faster than other armies. Ride with a host to guard its commander from knives, or watch the roads behind our lines.
      </p>
    </div>
  )
}

/** How a strike's odds read at a glance. */
function oddsTone(p: number) {
  return p >= 0.6 ? 'text-emerald-300' : p >= 0.35 ? 'text-gold-200' : 'text-ember-300'
}

/**
 * The Blades' marks: the enemy armies we can see, nearest first, each with the chance a strike
 * would find its leader as things stand now (cover, rank, the size of the host). Tap one to go after it.
 */
function StrikeTargets({ engine, army }: { engine: GameEngine; army: Army }) {
  const team = engine.team(PLAYER)
  const target = army.order.type === 'intercept' ? engine.army(army.order.armyId) : undefined
  const marks = engine.state.armies
    .filter((f) => engine.isHostile(PLAYER, f.faction) && !f.vassalOf && engine.canSee(team, f))
    .map((f) => ({ f, d: Math.hypot(f.x - army.x, f.z - army.z) }))
    .filter((m) => m.d < 3000)
    .sort((x, y) => x.d - y.d)
    .slice(0, 5)
  const cover = army.veil === 'concealed' ? null : army.veil === 'disguised' ? `From cover rather than disguise: +${Math.round((BLADES.hidden - BLADES.disguised) * 100)}%.` : `Unseen they would do better: +${Math.round(BLADES.hidden * 100)}% from cover, +${Math.round(BLADES.disguised * 100)}% in disguise.`
  return (
    <div className="mt-1.5 border-t border-white/10 pt-1.5">
      {target && (
        <p className="mb-1 text-[12.5px] text-ink-200">
          After <span className="font-semibold">{engine.armyLeader(target)}</span> ({target.name}): <span className={`font-bold tabular-nums ${oddsTone(engine.strikeChance(army, target))}`}>{Math.round(engine.strikeChance(army, target) * 100)}%</span>
        </p>
      )}
      <div className="text-[12px] font-semibold text-violet-200">Strike odds</div>
      {marks.length === 0 ? (
        <p className="text-[12px] text-ink-500">No enemy army in sight within 3 km.</p>
      ) : (
        <div className="mt-1 space-y-1">
          {marks.map(({ f, d }) => {
            const p = engine.strikeChance(army, f)
            return (
              <button
                key={f.id}
                className={`btn w-full justify-between gap-2 px-2.5 py-1 text-[12.5px] ${target?.id === f.id ? 'btn-gold' : ''}`}
                title={`Send the Blades after ${engine.armyLeader(f)}. Failure costs about 30% of the band, but shakes the host (morale -${BLADES.failMorale}).`}
                onClick={() => engine.orderArmy(army.id, { type: 'intercept', armyId: f.id })}
              >
                <span className="min-w-0 truncate text-left">
                  {f.royal && <Glyph name="crown" size={12} className="mr-1 -mt-0.5 inline text-gold-300" />}
                  {engine.armyLeader(f)} <span className="text-ink-500">· {fmt(totalInt(f.troops))} · {(d / 1000).toFixed(1)} km</span>
                </span>
                <span className={`shrink-0 font-bold tabular-nums ${oddsTone(p)}`}>{Math.round(p * 100)}%</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
        {cover ? `${cover} ` : ''}Each 1000 men around a leader: -{Math.round(BLADES.crowd * 100)}%. A failed strike costs about 30% of the band but shakes the host (morale -{BLADES.failMorale}).
      </p>
    </div>
  )
}

/** Corvin Ashe: the Whisper Blades and their strikes (the Night Sappers do the work on walls). */
function AsheBox({ engine, army }: { engine: GameEngine; army: Army }) {
  if (army.faction !== PLAYER || army.commanderKey !== BLADES.key) return null
  const now = engine.state.time
  const strikeIn = Math.max(0, Math.ceil((army.strikeReadyAt ?? 0) - now))
  const full = engine.fullStrength(army)
  const sappers = engine.state.armies.find((a) => a.sappers && a.faction === PLAYER)
  const covering = !!sappers && Math.hypot(sappers.x - army.x, sappers.z - army.z) < SAPPERS.cover
  return (
    <div className="mt-2 rounded-sm border border-violet-400/30 bg-violet-950/30 px-3 py-2 text-[13px]">
      {army.blades && (
        <>
          <div className="flex items-center gap-2">
            <Glyph name="dagger" size={16} className="text-violet-300" />
            <span className="font-semibold text-violet-200">The Whisper Blades</span>
            <span className={`ml-auto text-[12px] tabular-nums ${total(army.troops) < full - 0.5 ? 'text-ember-300' : 'text-ink-300'}`}>
              {totalInt(army.troops)} / {Math.round(full)}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink-400">
            Ashe's own knife-men: never reinforced (an abbey of ours can take them in), no siege work. Send them after an enemy army and they go for its leader, not its ranks: a commander is carried from the field and the host breaks; the Usurper Queen herself can fall. Strikes from hiding are likelier; a large host or a seasoned commander is harder to reach.
          </p>
          <p className={`mt-1 text-[12px] ${strikeIn > 0 ? 'text-ink-500' : 'text-violet-200'}`}>{strikeIn > 0 ? `Regrouping: ready to strike in ${strikeIn}s.` : 'Ready to strike.'}</p>
          <StrikeTargets engine={engine} army={army} />
        </>
      )}
      <p className={`${army.blades ? 'mt-1.5 border-t border-white/10 pt-1.5' : ''} text-[12px] leading-snug text-ink-400`}>
        Living off the land as pilgrims and players: never out of supply, and {Math.round((BLADES.pace - 1) * 100)}% faster than other armies.
        {sappers && (covering ? ' The Night Sappers are close by: the Blades cover their work.' : ` Within ${SAPPERS.cover}m of the Night Sappers, the Blades cover their work.`)}
      </p>
    </div>
  )
}

/**
 * Tamsin Holt's Night Sappers: hidden saboteurs. They do the quiet work at an enemy stronghold
 * (wells, granary, postern, a depot's stores, fieldworks), faster and quieter with the Blades by.
 */
function SappersBox({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  if (army.faction !== PLAYER || !army.sappers) return null
  const now = engine.state.time
  const job = army.sabotage
  const problem = engine.sabotageProblem(army)
  const targets = problem ? [] : engine.sabotageTargets(army)
  const full = engine.fullStrength(army)
  const cover = engine.sapperCover(army)
  const work = cover ? SAPPERS.coveredWork : SABOTAGE.work
  const alarm = cover ? SAPPERS.coveredAlarm : SABOTAGE.alarm
  const blades = engine.state.armies.find((a) => a.blades && a.faction === PLAYER)
  return (
    <div className="mt-2 rounded-sm border border-orange-400/30 bg-orange-950/30 px-3 py-2 text-[13px]">
      <div className="flex items-center gap-2">
        <Glyph name="pick" size={16} className="text-orange-300" />
        <span className="font-semibold text-orange-200">The Night Sappers</span>
        <span className={`ml-auto text-[12px] tabular-nums ${total(army.troops) < full - 0.5 ? 'text-ember-300' : 'text-ink-300'}`}>
          {totalInt(army.troops)} / {Math.round(full)}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-400">
        Holt's saboteurs: hidden by the same rules as the Blades, never reinforced (an abbey of ours can take them in), useless in a fight. Brought unseen close to an enemy castle or fieldwork, they foul its wells, fire its granary, undermine its postern, spoil a depot's stores or burn the works.
      </p>
      <div className={`mt-1.5 flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] ${cover ? 'bg-violet-900/40 text-violet-200' : 'well text-ink-400'}`}>
        <Glyph name="dagger" size={12} />
        {cover
          ? `Covered by the Whisper Blades: ${SAPPERS.coveredWork}s of work, alarm ${Math.round(SAPPERS.coveredAlarm * 100)}%.`
          : blades
            ? `No cover: bring the Blades within ${SAPPERS.cover}m (or have the Sappers Follow them) to work in ${SAPPERS.coveredWork}s instead of ${SABOTAGE.work}s.`
            : 'No cover: the Whisper Blades are gone.'}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-400">Living off the land as tinkers and pedlars: never out of supply, and {Math.round((BLADES.pace - 1) * 100)}% faster than other armies.</p>
      {job ? (
        <p className="mt-1.5 text-[12.5px] text-orange-200">
          <Glyph name="fire" size={13} className="mr-1 -mt-0.5 inline" />
          {SABOTAGE_KINDS[job.kind].name}: {Math.max(0, Math.ceil(job.doneAt - now))}s more. They must stay unseen.
        </p>
      ) : problem ? (
        <p className="mt-1.5 text-[12px] text-ink-500">Sabotage: {problem}</p>
      ) : (
        <div className="mt-1.5">
          <button className="btn w-full text-[13px]" onClick={() => setOpen(!open)}>
            <Glyph name="mask" size={14} /> Sabotage
          </button>
          {open && (
            <div className="mt-1.5 space-y-1.5">
              {targets.map((tg) => (
                <div key={tg.id}>
                  <div className="text-[12px] text-ink-300">{tg.name}</div>
                  {tg.kinds.map((k) => (
                    <button
                      key={k}
                      className="btn mt-1 w-full flex-col items-start px-2.5 py-1.5 text-left"
                      onClick={() => {
                        const err = engine.startSabotage(army.id, tg.id, k)
                        if (err) toast(err)
                        setOpen(false)
                      }}
                    >
                      <span className="text-[13px] text-ink-100">{SABOTAGE_KINDS[k].name}</span>
                      <span className="text-[11.5px] leading-snug text-ink-400">{SABOTAGE_KINDS[k].blurb}</span>
                    </button>
                  ))}
                </div>
              ))}
              <p className="text-[11.5px] leading-snug text-ink-500">
                {work}s of quiet work on the spot; if they are found out, it is abandoned. Afterwards the alarm may go up ({Math.round(alarm * 100)}%). Then they lie low for {SABOTAGE.cooldown}s.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One of our abbeys: the Royal Guard or the Whisper Blades can rest here and fill their ranks. */
function SanctuaryBox({ engine, castle, toast }: { engine: GameEngine; castle: Castle; toast: (m: string) => void }) {
  if (castle.holding !== 'abbey') return null
  const here = engine.sanctuaryArmies(castle)
  const resting = engine.state.armies.filter((a) => a.sanctuary === castle.id)
  return (
    <div className="mt-3 rounded-sm border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-[13px]">
      <div className="font-semibold text-gold-200">
        <Glyph name="chapel" size={14} className="mr-1 -mt-0.5 inline text-gold-300" />
        Sanctuary
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-400">
        Bring the Royal Guard or the Whisper Blades here: the brothers nurse their wounded in the infirmary, and lay brothers sworn to the Crown take up the empty places. It costs gold for every man restored.
      </p>
      {resting.map((a) => (
        <p key={a.id} className="mt-1.5 text-[12.5px] text-gold-200">
          {a.name} in sanctuary: {totalInt(a.troops)} / {Math.round(engine.fullStrength(a))}
        </p>
      ))}
      {here
        .filter((a) => a.sanctuary !== castle.id)
        .map((a) => {
          const { rate, cost } = engine.sanctuaryTerms(a)
          const need = Math.ceil(engine.fullStrength(a) - total(a.troops))
          return (
            <button
              key={a.id}
              className="btn mt-1.5 w-full flex-col items-start px-2.5 py-1.5 text-left"
              onClick={() => {
                const err = engine.seekSanctuary(a.id, castle.id)
                if (err) toast(err)
              }}
            >
              <span className="text-[13px] text-ink-100">Seek sanctuary: {a.name}</span>
              <span className="text-[11.5px] text-ink-400">
                {need} men short · {cost} gold a man · about {Math.ceil(need / rate)}s
              </span>
            </button>
          )
        })}
      {here.length === 0 && resting.length === 0 && <p className="mt-1.5 text-[12px] text-ink-500">Neither the Guard nor the Blades stand here short of men.</p>}
    </div>
  )
}

/** Scouting orders for a small party, or the state of a pursuit party. */
function ScoutBox({ engine, army, toast }: { engine: GameEngine; army: Army; toast: (m: string) => void }) {
  const [target, setTarget] = useState('')
  if (army.pursuit) {
    const scout = engine.army(army.pursuit.scoutId)
    return (
      <div className="well mt-1.5 rounded-sm px-3 py-2 text-[13px]">
        <div className="text-ink-200"><Glyph name="horse" size={13} className="mr-1 -mt-0.5 inline " />Chasing {scout ? scout.name : 'enemy scouts'}</div>
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
        <Glyph name="spyglass" size={13} className="mr-1 -mt-0.5 inline text-gold-300" />{o.phase === 'out' ? `Scouting ${t && 'name' in t ? t.name : 'the enemy'}` : 'Riding home with the report'}
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
        <Glyph name="spyglass" size={13} /> Scout
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
          <Glyph name={H.icon} size={26} className="text-gold-200" />
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
          <Glyph name={castle.ruined ? 'fire' : HOLDINGS[engine.holdingOf(castle)].icon} size={26} className="text-gold-200" />
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
          <Glyph name={site.kind === 'mine' ? 'pick' : 'axe'} size={26} className="text-gold-200" />
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
