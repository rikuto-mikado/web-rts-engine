import { Castle as CastleIcon, Package, ChevronLeft, ChevronRight, Footprints, Hammer, Swords, X } from 'lucide-react'
import { Glyph } from './Glyph'
import { useRef, useState, type ReactNode } from 'react'
import { ROYAL, PLAYER, SPY, SAPPERS, WARDENS, WALL_K, type GameEngine } from '../game/engine'
import { COLUMN, FORMATIONS, FORMATION_ORDER } from '../game/formations'
import {
  armySpeed,
  combinedArmsBonus,
  emptyTroops,
  fmt,
  power,
  siegePower,
  total,
} from '../game/troops'
import type { FormationKey, Troops } from '../game/types'
import { FormationIcon, SectionTitle, Slider, UnitGlyph, useEngine } from './common'
import { MixBar } from './art'
import { MIN_ENGINEER_PARTY, doctrineMix, doctrineOf, doctrineWants } from '../game/doctrines'
import { TRAIT_MAP } from '../game/traits'
import { PixelPortrait } from './PixelPortrait'

function shortName(name: string) {
  return name.includes(' the ') ? name.split(' ')[0] : name.split(' ').slice(-1)[0]
}

interface Props {
  engine: GameEngine
  initialCastleId?: string
  initialTargetId?: string
  onClose: () => void
  onDeployed: (armyId: string) => void
}

export function FormArmyModal({ engine, initialCastleId, initialTargetId, onClose, onDeployed }: Props) {
  useEngine(engine)
  const s = engine.state
  const castles = s.castles.filter((c) => c.faction === PLAYER && !c.village)
  // Supply depots with troops quartered inside can raise armies too.
  const depots = s.outposts.filter((o) => o.kind === 'depot' && o.faction === PLAYER && o.progress >= 1 && total(o.garrison ?? {}) >= 10)
  const validSource = (id?: string) => !!id && (castles.some((c) => c.id === id) || depots.some((o) => o.id === id))
  const [castleId, setCastleId] = useState(validSource(initialCastleId) ? initialCastleId : castles[0]?.id)
  const depot = depots.find((o) => o.id === castleId)
  const castleOnly = engine.castle(castleId)
  const castle = castleOnly ?? (depot ? { id: depot.id, x: depot.x, z: depot.z, name: depot.name, garrison: depot.garrison ?? {} } : undefined)
  const freeFor = (id?: string) => (id && depots.some((o) => o.id === id) ? engine.depotCommanders(id) : engine.freeCommanders(PLAYER))
  const free = freeFor(castleId)
  const allCmd = depot ? free : engine.content.commanders.filter((c) => s.commanders[c.key]?.owner === PLAYER && !s.commanders[c.key]?.stationedAt)
  const [commanderKey, setCommanderKey] = useState<string | null>(free[0]?.key ?? null)
  const pickSource = (id: string) => {
    setCastleId(id)
    const f = freeFor(id)
    if (!f.some((c) => c.key === commanderKey)) chooseCommander(f[0]?.key ?? null)
  }
  const cmd = commanderKey ? (engine.commanders.get(commanderKey) ?? null) : null
  const cmdLevel = commanderKey ? (s.commanders[commanderKey]?.level ?? 1) : 1
  const carousel = useRef<HTMLDivElement>(null)
  const garrison = castle?.garrison ?? emptyTroops(engine.unitList)
  const garrisonN = Math.floor(total(garrison))
  const [size, setSize] = useState(() => Math.min(600, Math.floor(garrisonN * 0.6)))
  // The commander decides the kind of host; engineers are the one choice left (on or off).
  const doctrine = doctrineOf(commanderKey)
  const [engOverride, setEngOverride] = useState<boolean | null>(null)
  const withEngineers = engOverride ?? doctrine.engineers
  const [retreatAt, setRetreatAt] = useState(0.5)
  const [formation, setFormation] = useState<FormationKey>(doctrineOf(free[0]?.key ?? null).formation)
  const chooseCommander = (key: string | null) => {
    setCommanderKey(key)
    setEngOverride(null)
    setFormation(doctrineOf(key).formation)
  }
  const [column, setColumn] = useState(false)
  const [targetId, setTargetId] = useState<string>(initialTargetId ?? '')
  const [error, setError] = useState<string | null>(null)

  // An army holds at most its cap (a commander's 1500, a captain's 800); larger forces march as a battle group.
  const cap = engine.armyCap(commanderKey)
  const maxSize = Math.min(garrisonN, cap)
  const wants: Troops = doctrineWants(doctrine, withEngineers, Math.min(size, maxSize))
  // What the garrison can give of it; whatever it lacks is filled from what it has (or hired, below).
  const troops: Troops = (() => {
    const out: Troops = {}
    let short = 0
    for (const u of engine.recruitUnits) {
      const got = Math.min(Math.floor(garrison[u.key] ?? 0), wants[u.key] ?? 0)
      out[u.key] = got
      short += (wants[u.key] ?? 0) - got
    }
    // Fill the gaps with fighting troops the garrison has to spare (never with engineers nobody asked for).
    for (const u of engine.recruitUnits) {
      if (short <= 0) break
      if (u.key === 'engineers' || (wants[u.key] ?? 0) === 0) continue
      const spare = Math.floor(garrison[u.key] ?? 0) - (out[u.key] ?? 0)
      const add = Math.max(0, Math.min(spare, short))
      out[u.key] = (out[u.key] ?? 0) + add
      short -= add
    }
    for (const u of engine.recruitUnits) {
      if (short <= 0) break
      if (u.key === 'engineers' || (wants[u.key] ?? 0) > 0) continue
      const spare = Math.floor(garrison[u.key] ?? 0) - (out[u.key] ?? 0)
      const add = Math.max(0, Math.min(spare, short))
      out[u.key] = (out[u.key] ?? 0) + add
      short -= add
    }
    return out
  })()
  // Hiring what the garrison lacks (only at a castle, not a depot).
  const missing = engine.recruitUnits.map((u) => ({ u, n: Math.max(0, (wants[u.key] ?? 0) - Math.floor(garrison[u.key] ?? 0)) })).filter((m) => m.n > 0)
  const hireCost = missing.reduce((a, m) => a + m.n * engine.unitCost(PLAYER, m.u.key), 0)
  const hireMissing = () => {
    if (!castleOnly) return
    for (const m of missing) {
      const err = engine.recruit(castleOnly.id, m.u.key, m.n)
      if (err) {
        setError(err)
        return
      }
    }
    setError(null)
  }

  const n = total(troops)
  const units = engine.units
  const pw = power(troops, units, cmd, cmdLevel)
  const speed = armySpeed(troops, units, cmd) * (column ? COLUMN.speed : FORMATIONS[formation].speed)
  const sp = siegePower(troops, units, cmd)
  const synergy = combinedArmsBonus(troops, units, cmd)
  const slowest = engine.recruitUnits.filter((u) => (troops[u.key] ?? 0) >= 1).sort((a, b) => a.speed - b.speed)[0]
  const target = engine.castle(targetId)
  const breachSecs = target && sp > 0 ? target.walls / (sp * WALL_K) : null

  // Tactical read-out: what this composition counters and what counters it.
  const matchup = (() => {
    if (n < 1) return { strong: [] as string[], weak: [] as string[] }
    const strong: string[] = []
    const weak: string[] = []
    for (const foe of engine.recruitUnits) {
      if (foe.category === 'siege') continue
      let ours = 0
      for (const u of engine.recruitUnits) ours += ((troops[u.key] ?? 0) / n) * (u.counters[foe.key] ?? 1)
      let theirs = 0
      for (const u of engine.recruitUnits) theirs += ((troops[u.key] ?? 0) / n) * (foe.counters[u.key] ?? 1)
      if (ours >= 1.25) strong.push(foe.name)
      if (theirs >= 1.3) weak.push(foe.name)
    }
    return { strong, weak }
  })()

  const targets = s.castles
    .filter((c) => engine.isHostile(c.faction, PLAYER) && !c.ruined && !(c.village && c.faction === 'neutral'))
    .sort((a, b) => (castle ? Math.hypot(a.x - castle.x, a.z - castle.z) - Math.hypot(b.x - castle.x, b.z - castle.z) : 0))

  const deploy = () => {
    if (!castle) return
    const res = engine.formArmy(castle.id, 'player', troops, {
      commanderKey,
      retreatAt,
      formation,
      column,
      order: targetId ? { type: 'attack', castleId: targetId } : { type: 'hold' },
    })
    if (typeof res === 'string') {
      setError(res)
      return
    }
    onDeployed(res.id)
  }

  const musterAt = (
        <section>
          <SectionTitle>Muster at</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {castles.map((c) => (
              <button
                key={c.id}
                onClick={() => pickSource(c.id)}
                className={`well flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] transition ${c.id === castleId ? 'outline outline-1 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
              >
                <CastleIcon size={13} className="text-royal-300" />
                <span className="font-bold">{c.name}</span>
                <span className="text-ink-400 tabular-nums">{fmt(total(c.garrison))}</span>
              </button>
            ))}
            {depots.map((o) => (
              <button
                key={o.id}
                onClick={() => pickSource(o.id)}
                title="Supply depot: only commanders quartered here can lead"
                className={`well flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] transition ${o.id === castleId ? 'outline outline-1 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
              >
                <Package size={13} className="text-gold-300" />
                <span className="font-bold">{o.name}</span>
                <span className="text-ink-400 tabular-nums">{fmt(total(o.garrison ?? {}))}</span>
              </button>
            ))}
          </div>
          {depot && <p className="mt-1.5 text-[12px] text-ink-500">Raising from a supply depot: only commanders quartered there, or a captain, can lead.</p>}
        </section>
  )

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-0 sm:p-4" onMouseDown={onClose}>
      <div className="panel animate-fade-up safe-top flex h-full max-h-full w-[1100px] max-w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[94vh] sm:rounded-md" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/60 px-4 py-3 sm:px-6 [@media(max-height:500px)]:py-1.5">
          <div>
            <h2 className="panel-title">Muster an Army</h2>
            <p className="text-[13px] text-ink-400 [@media(max-height:500px)]:hidden">Pick a commander and a mix of troops, then give marching orders.</p>
          </div>
          <button className="btn px-2" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="scroll-thin grid flex-1 grid-cols-1 items-start gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Left: who leads and what they lead */}
          <div className="min-w-0 space-y-5">
            <div className="lg:hidden">{musterAt}</div>
            <section>
              <SectionTitle
                right={
                  <div className="flex gap-1">
                    <button className="btn h-7 min-h-0 px-1.5" onClick={() => carousel.current?.scrollBy({ left: -240, behavior: 'smooth' })} aria-label="Previous">
                      <ChevronLeft size={14} />
                    </button>
                    <button className="btn h-7 min-h-0 px-1.5" onClick={() => carousel.current?.scrollBy({ left: 240, behavior: 'smooth' })} aria-label="Next">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                }
              >
                Commander
              </SectionTitle>
              <div ref={carousel} className="scroll-thin flex snap-x gap-1.5 overflow-x-auto pb-1.5">
                {(() => {
                  // The Sovereign's place: always first, leading the Royal Guard (never mustered from a garrison).
                  const king = engine.commanders.get(ROYAL.key)
                  if (!king) return null
                  const guard = engine.royalArmy(PLAYER)
                  return (
                    <div
                      title={`${king.name} leads the Royal Guard: ${guard ? `${Math.round(total(guard.troops))} knights` : 'fallen'}`}
                      className="well relative flex w-[84px] shrink-0 snap-start flex-col items-center gap-1 rounded-sm border border-gold-400/50 px-1 pt-1.5 pb-1"
                    >
                      <Glyph name="crown" size={13} className="absolute top-0.5 left-1 text-gold-300" />
                      <PixelPortrait spec={king.portrait} size={54} />
                      <span className="w-full truncate text-center text-[12px] font-bold text-gold-200">{shortName(king.name)}</span>
                      <span className="-mt-1 text-center text-[9.5px] font-bold tracking-wide text-gold-300/80">ROYAL GUARD</span>
                    </div>
                  )
                })()}
                {allCmd.filter((c) => c.key !== ROYAL.key).map((c) => {
                  const st = s.commanders[c.key]
                  const available = free.some((f) => f.key === c.key)
                  const sel = commanderKey === c.key
                  return (
                    <button
                      key={c.key}
                      disabled={!available}
                      onClick={() => chooseCommander(c.key)}
                      title={c.name}
                      className={`well relative flex w-[84px] shrink-0 snap-start flex-col items-center gap-1 rounded-sm px-1 pt-1.5 pb-1 transition ${sel ? 'outline outline-2 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
                    >
                      {/* Only the portrait and name grey out: a commander's rank stars stay bright while wounded or away. */}
                      <PixelPortrait spec={c.portrait} size={54} className={available ? '' : 'opacity-40 grayscale'} />
                      <span className={`w-full truncate text-center text-[12px] font-bold ${available ? '' : 'opacity-50'}`}>{shortName(c.name)}</span>
                      {st.level > 1 && <span className="absolute top-1 right-1 text-[10px] text-gold-300 drop-shadow">{'★'.repeat(st.level - 1)}</span>}
                      {!available && <span className="absolute inset-x-0 top-6 text-center text-[10px] font-bold text-ember-300">{st.woundedUntil > s.time ? (st.downReason === 'regroup' ? 'REGROUPING' : 'WOUNDED') : SPY.keys.includes(c.key) ? 'SPYMASTER' : SAPPERS.keys.includes(c.key) ? 'SAPMASTER' : WARDENS.keys.includes(c.key) ? 'WARDEN' : 'IN FIELD'}</span>}
                    </button>
                  )
                })}
                <button
                  onClick={() => chooseCommander(null)}
                  className={`well flex w-[84px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-sm p-1.5 text-center text-[12px] transition ${commanderKey === null ? 'outline outline-2 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
                >
                  <Swords size={26} className="text-ink-300" />
                  <span className="font-bold">Captain</span>
                </button>
              </div>
              <div className="well mt-1.5 flex min-h-[78px] items-center gap-3 rounded-sm p-3">
                {cmd ? (
                  <>
                    <PixelPortrait spec={cmd.portrait} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-[15px] font-bold text-gold-100">{cmd.name}</span>
                        <span className="text-[13px] text-ink-400 italic">{cmd.title}</span>
                        {cmdLevel > 1 && <span className="text-[12px] text-gold-300">{'★'.repeat(cmdLevel - 1)}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[12px]">
                        {cmd.strengths.map((t) => (
                          <span key={t} className="rounded-sm bg-emerald-500/12 px-1.5 py-0.5 text-emerald-300">{t}</span>
                        ))}
                        {cmd.weaknesses.map((t) => (
                          <span key={t} className="rounded-sm bg-ember-500/12 px-1.5 py-0.5 text-ember-300">{t}</span>
                        ))}
                        {(s.commanders[cmd.key]?.traits ?? []).map((t) => (
                          <span key={t} className="rounded-sm bg-gold-500/15 px-1.5 py-0.5 text-gold-200">★ {TRAIT_MAP.get(t)?.name}</span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-ink-400">A captain leads this army: no bonuses, no drawbacks.</p>
                )}
              </div>
            </section>

            <section>
              <SectionTitle>Composition</SectionTitle>
              {/* The commander's kind of host: fixed; engineers on or off. */}
              <div className="well rounded-sm p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-gold-100">{doctrine.name}</span>
                  <span className="flex items-center gap-1 text-[12px] text-ink-400" title={FORMATIONS[doctrine.formation].name}>
                    <FormationIcon formation={doctrine.formation} size={15} />
                    {FORMATIONS[doctrine.formation].name}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-400">{doctrine.blurb}</p>
                <div className="mt-2">
                  <MixBar mix={doctrineMix(doctrine, withEngineers)} units={engine.recruitUnits} height={8} />
                </div>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={withEngineers} onChange={(e) => setEngOverride(e.target.checked)} className="accent-amber-400" />
                  <span className="flex-1">
                    Bring engineers
                    <span className="block text-[11.5px] leading-snug text-ink-400">
                      At least {MIN_ENGINEER_PARTY} ({Math.round(doctrine.engineerShare * 100)}% of the army): outposts and siege engines need 15, mines 10, field works 10 to 20.
                    </span>
                  </span>
                </label>
              </div>

              <div className="well mt-2 rounded-sm p-3">
                <div className="mb-1.5 flex justify-between text-[13px]">
                  <span className="text-ink-300">Army size</span>
                  <span className="font-bold text-gold-300 tabular-nums">
                    {fmt(n)} <span className="font-normal text-ink-400">/ {fmt(maxSize)}</span>
                  </span>
                </div>
                <Slider value={Math.min(size, maxSize)} max={maxSize} step={10} onChange={setSize} />
                {Number.isFinite(cap) && (
                  <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
                    An army holds at most {fmt(cap)} ({commanderKey ? 'a commander' : 'a captain'}; {commanderKey ? 'a captain 800' : 'a commander 1500'}). For more, muster several and set them to escort one another: a battle group of up to five.
                  </p>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {engine.recruitUnits.map((u) => {
                  const want = wants[u.key] ?? 0
                  const got = troops[u.key] ?? 0
                  const short = want > got
                  return (
                    <div key={u.key} className={`well rounded-sm px-2.5 py-2 ${want === 0 && got === 0 ? 'opacity-45' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <UnitGlyph unit={u.key} size={14} color={u.color} />
                        <span className="text-[12.5px] font-bold">{u.name}</span>
                      </div>
                      <div className={`mt-0.5 text-[16px] leading-none font-bold tabular-nums ${short ? 'text-ember-300' : 'text-gold-200'}`}>{fmt(got)}</div>
                      <div className="text-[11px] text-ink-400 tabular-nums">
                        wants {fmt(want)} · has {fmt(Math.floor(garrison[u.key] ?? 0))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {missing.length > 0 && (
                <div className="mt-2 rounded-sm border border-ember-400/30 bg-ember-700/15 px-3 py-2 text-[12.5px]">
                  <span className="text-ember-300">
                    The garrison is short of {missing.map((m) => `${fmt(m.n)} ${m.u.name.toLowerCase()}`).join(', ')}
                  </span>
                  <span className="text-ink-400">{castleOnly ? '; the gaps are filled with other troops it has, or hire them now.' : '; the gaps are filled with other troops quartered here.'}</span>
                  {castleOnly && (
                    <button className="btn mt-1.5 w-full text-[13px]" disabled={(s.factions[PLAYER]?.gold ?? 0) < hireCost} onClick={hireMissing}>
                      Hire the missing troops ({fmt(hireCost)} gold)
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right: where from, what it adds up to, and where it goes */}
          <div className="space-y-4 lg:sticky lg:top-0">
            <div className="hidden lg:block">{musterAt}</div>

            <section className="well rounded-sm p-3">
              <dl className="space-y-1.5 text-[14px]">
                <Stat icon={<Swords size={14} />} label="Soldiers" value={fmt(n)} />
                <Stat icon={<Swords size={14} />} label="Battle power" value={fmt(pw)} accent />
                <Stat icon={<Footprints size={14} />} label="March speed" value={`${speed.toFixed(0)}`} hint={slowest ? `paced by ${slowest.name}` : undefined} />
                <Stat icon={<Hammer size={14} />} label="Siege power" value={sp.toFixed(0)} hint={breachSecs !== null ? `~${Math.ceil(breachSecs)}s to breach ${target!.name}` : undefined} />
              </dl>
              {(synergy > 1 || matchup.strong.length > 0 || matchup.weak.length > 0) && (
                <div className="mt-2 space-y-0.5 border-t border-black/40 pt-2 text-[12.5px]">
                  {synergy > 1 && <div className="text-emerald-300">Combined arms +{Math.round((synergy - 1) * 100)}%</div>}
                  {matchup.strong.length > 0 && (
                    <div>
                      <span className="text-emerald-300">Strong vs </span>
                      <span className="text-ink-200">{matchup.strong.join(', ')}</span>
                    </div>
                  )}
                  {matchup.weak.length > 0 && (
                    <div>
                      <span className="text-ember-300">Weak vs </span>
                      <span className="text-ink-200">{matchup.weak.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section>
              <SectionTitle>Formation</SectionTitle>
              <div className="grid grid-cols-4 gap-1">
                {FORMATION_ORDER.map((k) => (
                  <button
                    key={k}
                    onClick={() => setFormation(k)}
                    title={FORMATIONS[k].description}
                    className={`well flex flex-col items-center gap-0.5 rounded-sm py-1.5 text-[12px] ${formation === k ? 'text-gold-200 outline outline-1 outline-gold-400 brightness-125' : 'text-ink-300 hover:brightness-125'}`}
                  >
                    <FormationIcon formation={k} size={20} />
                    {FORMATIONS[k].short}
                  </button>
                ))}
              </div>
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
                <input type="checkbox" checked={column} onChange={(e) => setColumn(e.target.checked)} className="accent-amber-400" />
                March in column (+{Math.round((COLUMN.speed - 1) * 100)}% speed)
              </label>
            </section>

            <section>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-ink-300">Retreat after losing</span>
                <span className="font-bold tabular-nums">{Math.round(retreatAt * 100)}%</span>
              </div>
              <Slider value={Math.round(retreatAt * 100)} min={10} max={90} step={5} onChange={(v) => setRetreatAt(v / 100)} color="#de5f45" />
            </section>

            <section>
              <SectionTitle>Orders</SectionTitle>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="well w-full rounded-sm px-3 py-2 text-[14px] outline-none">
                <option value="">Hold outside the gates</option>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    Attack {c.name} ({engine.factionName(c.faction)}, ~{fmt(total(c.garrison))})
                  </option>
                ))}
              </select>
            </section>

            {error && <p className="well hidden rounded-sm px-3 py-2 text-[13px] text-ember-300 lg:block">{error}</p>}
            <button className="btn btn-gold hidden w-full py-3 text-[15px] lg:flex" disabled={!castle || n < 10} onClick={deploy}>
              <Swords size={16} /> Deploy {fmt(n)} soldiers
            </button>
          </div>
        </div>

        {/* Phones and tablets: the deploy button stays in reach while scrolling. */}
        <footer className="safe-bottom border-t border-black/60 bg-black/25 px-4 py-2.5 lg:hidden">
          {error && <p className="mb-2 text-[13px] text-ember-300">{error}</p>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-[13px] leading-tight tabular-nums">
              <div>
                <span className="font-bold text-gold-200">{fmt(n)}</span> <span className="text-ink-400">soldiers</span>
              </div>
              <div className="text-ink-400">
                power <span className="font-bold text-gold-300">{fmt(pw)}</span>
              </div>
            </div>
            <button className="btn btn-gold px-5 py-2.5 text-[15px]" disabled={!castle || n < 10} onClick={deploy}>
              <Swords size={16} /> Deploy
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, hint, accent }: { icon: ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <dt className="flex items-center gap-1.5 text-ink-300">
          {icon} {label}
        </dt>
        <dd className={`font-semibold tabular-nums ${accent ? 'text-gold-300' : 'text-ink-100'}`}>{value}</dd>
      </div>
      {hint && <div className="text-right text-[12px] text-ink-500">{hint}</div>}
    </div>
  )
}
