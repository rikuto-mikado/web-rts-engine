import { FactionAI } from './ai'
import { MIN_ENGINEERS, OUTPOST_KINDS, OUTPOST_ORDER, buildSeconds, type OutpostKind } from './outposts'
import { TRAITS, combineTraits, type TraitMods } from './traits'
import { SEASON_SECONDS, WEATHER_LABEL, climate, nextWeather, seasonAt, type ClimateEffects } from './weather'
import { COLUMN, FORMATIONS, suggestFormation, type FormationDef } from './formations'
import { clamp } from './noise'
import {
  addTroops,
  armySpeed,
  combinedArmsBonus,
  commanderMod,
  emptyTroops,
  floorTroops,
  power,
  roman,
  scaleTroops,
  siegePower,
  total,
  totalInt,
  visionRadius,
} from './troops'
import type {
  Army,
  ArmyOrder,
  Battle,
  BattleReportPayload,
  Castle,
  ChronicleEntry,
  ChronicleKind,
  CommanderDef,
  Difficulty,
  Faction,
  FactionDef,
  FactionState,
  FormationKey,
  GameContent,
  GameEvent,
  GameRules,
  GameState,
  AllianceMuster,
  MapSize,
  Scenario,
  Team,
  Troops,
  UnitType,
} from './types'
import { World, castleRadius } from './world'

export const TICK = 0.1
const ENGAGE_DIST = 46
const JOIN_DIST = 110
const CASUALTY_K = 0.026
export const WALL_K = 0.12
const FIELD_UPKEEP = 0.004
/** The whole map is visible: planning and reading the war matter more than scouting. */
export const FOG_OF_WAR = false
export const PLAYER = 'player'
export const NEUTRAL = 'neutral'
const HIDE_SECONDS = 8

/** Forward outposts (see outposts.ts for the kinds). */
export const OUTPOST = {
  /** Must be this far from the edge of any castle. */
  castleClearance: 180,
  spacing: 260,
  maxPerFaction: 5,
  /** Friendly armies within this radius fight from behind the defences. */
  radius: 85,
  razeSeconds: 15,
  /** Morale loss multiplier for troops fighting from fortifications. */
  steadiness: 0.55,
}

export interface DifficultyDef {
  income: number
  firstHost: number
  hostEvery: number
  raidEvery: number
  hostFraction: number
}
export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: { income: 0.45, firstHost: 420, hostEvery: 400, raidEvery: 170, hostFraction: 0.45 },
  normal: { income: 0.6, firstHost: 330, hostEvery: 320, raidEvery: 120, hostFraction: 0.55 },
  hard: { income: 0.95, firstHost: 230, hostEvery: 250, raidEvery: 80, hostFraction: 0.62 },
}

/** Smaller maps put the enemy closer, so its first Great Host comes sooner (and later on large maps). */
const SIZE_PACE: Record<MapSize, number> = { small: 0.8, medium: 1, large: 1.3 }

export function wallsForTier(tier: number) {
  return Math.round(500 * Math.pow(tier, 1.2))
}
export function capacityForTier(tier: number) {
  return 300 + tier * 600
}
export function incomeForTier(tier: number) {
  return 3 + tier * 3
}
export function maxManpowerForTier(tier: number) {
  return 200 + tier * 350
}
export function manpowerRegenForTier(tier: number) {
  return 1 + tier * 1.4
}
export function upgradeCost(tier: number) {
  return Math.round(700 * Math.pow(tier, 1.6))
}

/** Recruitment mixes used by auto-recruit and the AI. */
export const RECRUIT_TEMPLATES: Record<string, { name: string; mix: Record<string, number> }> = {
  balanced: { name: 'Balanced', mix: { infantry: 0.48, cavalry: 0.2, archers: 0.25, engineers: 0.07 } },
  levy: { name: 'Foot & bow', mix: { infantry: 0.6, archers: 0.4 } },
  siege: { name: 'Siege train', mix: { infantry: 0.5, archers: 0.2, engineers: 0.3 } },
  cavalry: { name: 'Cavalry', mix: { cavalry: 0.8, archers: 0.2 } },
}

const NO_TRAITS = combineTraits([])

interface Force {
  troops: Troops
  cmd: CommanderDef | null
  level: number
  morale: number
  terrainDef: number
  formation: FormationDef
  inColumn: boolean
  sheltered: boolean
  traits: TraitMods
  army: Army | null
  castle: Castle | null
}

/** Transient (non-serialised) per-battle accumulators for visual effects. */
interface BattleFx {
  accA: number
  accB: number
  rangedA: number
  rangedB: number
  nextEmit: number
}

const DEFAULT_FACTIONS: FactionDef[] = [
  { id: PLAYER, name: 'Kingdom of Aethelgard', color: '#2f63c4', team: 'A' },
  { id: 'enemy', name: 'Ashen Dominion', color: '#a3271d', team: 'B', leader: true, musters: true },
  { id: NEUTRAL, name: 'Free Towns', color: '#a08a56', team: 'N' },
]

export class GameEngine {
  state: GameState
  readonly world: World
  readonly content: GameContent
  readonly scenario: Scenario
  readonly units: Map<string, UnitType>
  readonly unitList: UnitType[]
  readonly commanders: Map<string, CommanderDef>
  private ais = new Map<Faction, FactionAI>()

  /** Visual + UI events, drained by consumers each frame. */
  events: GameEvent[] = []
  readonly visRes: number
  readonly vision: Uint8Array
  readonly explored: Uint8Array
  /** Combined texture data: 255 visible, ~100 explored, 0 unknown. */
  readonly visionTex: Uint8Array
  visionVersion = 0

  private blurTmp = new Uint8Array(0)
  private nextVisionAt = 0
  private nextEconomyAt = 0
  private nextAutoRecruitAt = 0
  private battleFx = new Map<string, BattleFx>()
  private listeners = new Set<() => void>()
  uiVersion = 0

  private constructor(content: GameContent, state: GameState, world?: World) {
    this.content = content
    this.state = state
    this.scenario = state.scenario
    this.world = world ?? new World(this.scenario)
    this.unitList = content.unit_types
    this.units = new Map(content.unit_types.map((u) => [u.key, u]))
    this.commanders = new Map(content.commanders.map((c) => [c.key, c]))
    this.visRes = this.world.size <= 2600 ? 128 : 192
    this.vision = new Uint8Array(this.visRes * this.visRes)
    this.explored = new Uint8Array(this.visRes * this.visRes)
    this.visionTex = new Uint8Array(this.visRes * this.visRes)
    if (state.explored) decodeBits(state.explored, this.explored)
    for (const f of Object.values(state.factions)) {
      if (f.id !== PLAYER && f.team !== 'N') this.ais.set(f.id, new FactionAI(this, f.id))
    }
    this.updateVision()
  }

  /** The hand-made campaign scenario stored in the database. */
  static newCampaign(content: GameContent, scenarioKey: string, difficulty: Difficulty): GameEngine {
    const scenario = content.scenarios.find((s) => s.key === scenarioKey) ?? content.scenarios[0]
    const def = scenario.definition
    return GameEngine.create(content, scenario, {
      mode: 'campaign',
      victoryCastles: [def.victory.capture],
      defeatCastles: [def.defeat.lose],
      defeatOnEliminated: true,
    }, difficulty)
  }

  static create(content: GameContent, scenario: Scenario, rules: GameRules, difficulty: Difficulty, world?: World): GameEngine {
    const def = scenario.definition
    const empty = emptyTroops(content.unit_types)
    const d = DIFFICULTY[difficulty]
    const factionDefs = def.factions ?? DEFAULT_FACTIONS
    const factions: Record<Faction, FactionState> = {}
    factionDefs.forEach((f, i) => {
      const capital = def.castles.find((c) => c.faction === f.id && c.capital) ?? def.castles.find((c) => c.faction === f.id && c.district) ?? def.castles.find((c) => c.faction === f.id)
      factions[f.id] = {
        ...f,
        gold: f.id === PLAYER ? def.start.gold : def.start.enemy_gold,
        alive: true,
        capitalId: capital?.id ?? null,
        ai: { nextDecisionAt: 6 + (i % 10) * 0.4, nextRaidAt: d.raidEvery * (0.8 + (i % 7) * 0.1), retakeQueue: [] },
        host: f.musters
          ? { phase: 'idle', hostId: null, rallyX: 0, rallyZ: 0, detachmentIds: [], nextAt: d.firstHost * (f.team === 'A' ? 1.15 : 1) * SIZE_PACE[rules.size ?? 'medium'], startedAt: 0, wave: 0 }
          : null,
      }
    })
    // Siege fortifications are far sturdier than ordinary castle walls.
    const wallMult = (c: { gate?: boolean; capital?: boolean; tower?: boolean; staging?: boolean }) =>
      rules.mode !== 'siege' ? 1 : c.gate ? 3 : c.capital && !c.staging ? 3.5 : c.tower ? 1.6 : 1
    const castles: Castle[] = def.castles.map((c) => ({
      id: c.id,
      name: c.name,
      subtitle: c.subtitle,
      faction: c.faction,
      tier: c.tier,
      baseTier: c.tier,
      x: c.x,
      z: c.z,
      capital: !!c.capital,
      staging: !!c.staging,
      gate: !!c.gate,
      tower: !!c.tower,
      garrison: { ...empty, ...c.garrison },
      walls: Math.round(wallsForTier(c.tier) * wallMult(c)),
      maxWalls: Math.round(wallsForTier(c.tier) * wallMult(c)),
      manpower: maxManpowerForTier(c.tier) * 0.6,
      battleId: null,
      lastCapturedAt: -999,
      autoRecruit: null,
      district: !!c.district,
    }))
    const enemyLeader = factionDefs.find((f) => f.team === 'B' && f.leader)?.id ?? factionDefs.find((f) => f.team === 'B')?.id ?? 'enemy'
    const commanders: GameState['commanders'] = {}
    for (const c of content.commanders) {
      commanders[c.key] = { key: c.key, owner: c.faction === 'player' ? PLAYER : enemyLeader, level: 1, xp: 0, armyId: null, woundedUntil: 0, traits: [], traitChoices: null }
    }
    const state: GameState = {
      version: 2,
      scenario,
      rules,
      difficulty,
      time: 0,
      nextId: 1,
      factions,
      castles,
      armies: [],
      battles: [],
      outposts: [],
      commanders,
      chronicle: [],
      explored: '',
      armyCounter: 0,
      status: 'active',
      callToArms: null,
      musters: [],
      weather: { kind: 'clear', until: 150 },
      contrib: {},
      pacts: {},
      diploCooldown: {},
      teamFocus: { A: null, B: null },
      stats: { battlesWon: 0, battlesLost: 0, enemyKilled: 0, playerLost: 0, castlesTaken: 0 },
    }
    const engine = new GameEngine(content, state, world)
    const goal =
      rules.mode === 'alliance'
        ? `Your alliance must take ${engine.castleName(rules.victoryCastles[0])}, the enemy High Seat, and hold ${engine.castleName(rules.defeatCastles[0])}.`
        : `Take ${rules.victoryCastles.map((id) => engine.castleName(id)).join(', ')}. Do not lose ${rules.defeatCastles.map((id) => engine.castleName(id)).join(', ')}.`
    engine.log('info', 'The war begins', goal)
    return engine
  }

  /** Let the AI play the human's realm (used for balance testing). */
  setAutopilot(on: boolean) {
    if (on) this.ais.set(PLAYER, new FactionAI(this, PLAYER))
    else this.ais.delete(PLAYER)
  }

  static load(content: GameContent, state: GameState): GameEngine {
    if (state.version !== 2) throw new Error('This save comes from an older version of the game and cannot be loaded.')
    return new GameEngine(content, state)
  }

  serialize(): GameState {
    this.state.explored = encodeBits(this.explored)
    return JSON.parse(JSON.stringify(this.state)) as GameState
  }

  // -------------------------------------------------------------------------
  // Subscription for React (cheap version counter)
  // -------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getVersion = () => this.uiVersion
  notify() {
    this.uiVersion++
    for (const fn of this.listeners) fn()
  }

  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  faction(id: Faction): FactionState | undefined {
    return this.state.factions[id]
  }
  team(f: Faction): Team {
    return this.state.factions[f]?.team ?? 'N'
  }
  isHostile(a: Faction, b: Faction): boolean {
    return this.team(a) !== this.team(b)
  }
  /** How a faction relates to the human player. */
  relation(f: Faction): 'self' | 'ally' | 'enemy' | 'neutral' {
    if (f === PLAYER) return 'self'
    const t = this.team(f)
    return t === 'A' ? 'ally' : t === 'B' ? 'enemy' : 'neutral'
  }
  factionColor(f: Faction): string {
    return this.state.factions[f]?.color ?? '#888888'
  }
  factionName(f: Faction): string {
    return this.state.factions[f]?.name ?? f
  }
  castle(id: string | null | undefined): Castle | undefined {
    return id ? this.state.castles.find((c) => c.id === id) : undefined
  }
  army(id: string | null | undefined): Army | undefined {
    return id ? this.state.armies.find((a) => a.id === id) : undefined
  }
  battle(id: string | null | undefined): Battle | undefined {
    return id ? this.state.battles.find((b) => b.id === id) : undefined
  }
  castleName(id: string) {
    return this.castle(id)?.name ?? id
  }
  commanderOf(army: Army): CommanderDef | null {
    return army.commanderKey ? (this.commanders.get(army.commanderKey) ?? null) : null
  }
  commanderLevel(army: Army): number {
    return army.commanderKey ? (this.state.commanders[army.commanderKey]?.level ?? 1) : 1
  }
  armyLeader(army: Army): string {
    return this.commanderOf(army)?.name ?? army.captainName ?? 'Captain'
  }
  armyPower(army: Army): number {
    return power(army.troops, this.units, this.commanderOf(army), this.commanderLevel(army))
  }
  armySpeed(army: Army): number {
    const fm = army.column ? COLUMN.speed : FORMATIONS[army.formation].speed
    return armySpeed(army.troops, this.units, this.commanderOf(army)) * fm * this.traitsOf(army).speed * this.climate().speed
  }
  traitsOf(army: Army): TraitMods {
    return army.commanderKey ? combineTraits(this.state.commanders[army.commanderKey]?.traits) : NO_TRAITS
  }
  climate(): ClimateEffects {
    return climate(seasonAt(this.state.time), this.state.weather.kind)
  }
  season() {
    return seasonAt(this.state.time)
  }
  /** A lord's war honours. */
  credit(f: Faction) {
    if (!this.state.contrib) this.state.contrib = {}
    return (this.state.contrib[f] ??= { kills: 0, captures: 0 })
  }
  /** Ranking of the lords on a team by contribution. */
  honours(team: Team) {
    return Object.values(this.state.factions)
      .filter((f) => f.team === team)
      .map((f) => {
        const c = this.state.contrib?.[f.id] ?? { kills: 0, captures: 0 }
        const held = this.state.castles.filter((x) => x.faction === f.id).length
        return { id: f.id, name: f.name, color: f.color, kills: c.kills, captures: c.captures, held, score: Math.round(c.kills + c.captures * 250 + held * 40) }
      })
      .sort((a, b) => b.score - a.score)
  }

  /** Lying still in the woods long enough makes an army invisible to the enemy until it strikes. */
  isHidden(a: Army): boolean {
    return a.hiddenSince !== null && this.state.time - a.hiddenSince >= HIDE_SECONDS
  }
  /** True if two factions have a pact (no attacks between them). */
  atPeace(a: Faction, b: Faction): boolean {
    const p = this.state.pacts
    const t = this.state.time
    return (a === PLAYER && (p[b] ?? 0) > t) || (b === PLAYER && (p[a] ?? 0) > t)
  }
  supplyRange(c: Castle): number {
    return 520 + c.tier * 90
  }

  garrisonPower(c: Castle): number {
    return power(c.garrison, this.units) * (c.walls > 0 ? 1.6 : 1.15)
  }
  capacity(c: Castle) {
    return capacityForTier(c.tier)
  }
  private visIndex(x: number, z: number) {
    const half = this.world.half
    const R = this.visRes
    const i = clamp(Math.floor(((x + half) / this.world.size) * R), 0, R - 1)
    const j = clamp(Math.floor(((z + half) / this.world.size) * R), 0, R - 1)
    return j * R + i
  }
  isVisible(x: number, z: number): boolean {
    return this.vision[this.visIndex(x, z)] > 0
  }
  isExplored(x: number, z: number): boolean {
    return this.explored[this.visIndex(x, z)] > 0
  }
  freeCommanders(faction: Faction): CommanderDef[] {
    return this.content.commanders.filter((c) => {
      const s = this.state.commanders[c.key]
      return s && s.owner === faction && !s.armyId && s.woundedUntil <= this.state.time
    })
  }
  castleAt(x: number, z: number, extra = 30): Castle | undefined {
    return this.state.castles.find((c) => Math.hypot(c.x - x, c.z - z) < castleRadius(c.tier) + extra)
  }
  nearestCastle(x: number, z: number, faction: Faction, exclude?: string): Castle | undefined {
    let best: Castle | undefined
    let bd = Infinity
    for (const c of this.state.castles) {
      if (c.faction !== faction || c.id === exclude) continue
      const d = Math.hypot(c.x - x, c.z - z)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }
  totals(faction: Faction) {
    let field = emptyTroops(this.unitList)
    let garrison = emptyTroops(this.unitList)
    let fieldPower = 0
    for (const a of this.state.armies) {
      if (a.faction !== faction) continue
      field = addTroops(field, a.troops)
      fieldPower += this.armyPower(a)
    }
    let income = 0
    let manpower = 0
    let castles = 0
    for (const c of this.state.castles) {
      if (c.faction !== faction) continue
      garrison = addTroops(garrison, c.garrison)
      income += incomeForTier(c.tier)
      manpower += c.manpower
      castles++
    }
    const upkeep = total(field) * FIELD_UPKEEP
    const all = addTroops(field, garrison)
    return {
      field,
      garrison,
      all,
      castles,
      manpower,
      fieldPower,
      totalPower: fieldPower + power(garrison, this.units),
      income: income * this.incomeMult(faction),
      upkeep,
    }
  }
  teamPower(team: Team): { power: number; castles: number } {
    let p = 0
    let castles = 0
    for (const c of this.state.castles) {
      if (this.team(c.faction) !== team) continue
      p += power(c.garrison, this.units)
      castles++
    }
    for (const a of this.state.armies) if (this.team(a.faction) === team) p += this.armyPower(a)
    return { power: p, castles }
  }
  private incomeMult(f: Faction) {
    if (f === PLAYER) return 1
    if (this.state.rules.mode === 'siege') return this.team(f) === 'B' ? DIFFICULTY[this.state.difficulty].income * 1.2 : 0.9
    if (this.team(f) !== 'B') return 0.85
    // In Alliance War the player's allies already balance the scales, so the enemy side is richer.
    return DIFFICULTY[this.state.difficulty].income * (this.state.rules.mode === 'alliance' ? 1.4 : 1)
  }

  // -------------------------------------------------------------------------
  // Chronicle / events
  // -------------------------------------------------------------------------

  log(kind: ChronicleKind, title: string, detail: string, x?: number, z?: number) {
    const entry: ChronicleEntry = { id: this.state.nextId++, t: this.state.time, kind, title, detail, x, z }
    this.state.chronicle.unshift(entry)
    if (this.state.chronicle.length > 150) this.state.chronicle.length = 150
    this.events.push({ type: 'chronicle', entry })
  }

  private newId(prefix: string) {
    return `${prefix}${this.state.nextId++}`
  }

  // -------------------------------------------------------------------------
  // Commands (player and AI)
  // -------------------------------------------------------------------------

  /** Recruit up to `count`; returns an error message or null. */
  recruit(castleId: string, unitKey: string, count: number, faction: Faction = PLAYER): string | null {
    const c = this.castle(castleId)
    const u = this.units.get(unitKey)
    const f = this.faction(faction)
    if (!c || !u || !f) return 'Unknown castle or unit.'
    if (c.faction !== faction) return 'You do not hold this castle.'
    if (c.battleId) return 'Cannot recruit while under siege.'
    count = Math.floor(count)
    if (count <= 0) return null
    const room = this.capacity(c) - total(c.garrison)
    if (room < 1) return 'The garrison is at full capacity. Upgrade the castle or send troops out.'
    count = Math.min(count, Math.floor(room))
    count = Math.min(count, Math.floor(c.manpower / u.cost_manpower))
    if (count <= 0) return 'Not enough manpower. It regrows over time.'
    const price = u.cost_gold
    count = Math.min(count, Math.floor(f.gold / price))
    if (count <= 0) return 'Not enough gold.'
    f.gold -= count * price
    c.manpower -= count * u.cost_manpower
    c.garrison[unitKey] = (c.garrison[unitKey] ?? 0) + count
    if (faction === PLAYER) this.notify()
    return null
  }

  /** How many of a unit could be recruited right now (gold, manpower and capacity). */
  maxRecruitable(castleId: string, unitKey: string, faction: Faction = PLAYER): number {
    const c = this.castle(castleId)
    const u = this.units.get(unitKey)
    const f = this.faction(faction)
    if (!c || !u || !f || c.battleId) return 0
    return Math.max(0, Math.floor(Math.min(this.capacity(c) - total(c.garrison), c.manpower / u.cost_manpower, f.gold / u.cost_gold)))
  }

  /** Spend `budget` gold on a recruitment mix at a castle. Returns gold spent. */
  recruitMix(castleId: string, mix: Record<string, number>, budget: number, faction: Faction): number {
    const f = this.faction(faction)
    if (!f) return 0
    const before = f.gold
    const sum = Object.values(mix).reduce((a, b) => a + b, 0) || 1
    for (const [key, w] of Object.entries(mix)) {
      const u = this.units.get(key)
      if (!u) continue
      const n = Math.floor((budget * (w / sum)) / u.cost_gold)
      if (n > 0) this.recruit(castleId, key, n, faction)
    }
    return before - f.gold
  }

  upgradeCastle(castleId: string, faction: Faction = PLAYER): string | null {
    const c = this.castle(castleId)
    const f = this.faction(faction)
    if (!c || !f || c.faction !== faction) return 'You do not hold this castle.'
    if (c.tier >= 4) return 'Already a citadel.'
    if (c.battleId) return 'Cannot build while under siege.'
    const cost = upgradeCost(c.tier)
    if (f.gold < cost) return `Needs ${cost} gold.`
    f.gold -= cost
    c.tier++
    const newMax = wallsForTier(c.tier)
    c.walls += newMax - c.maxWalls
    c.maxWalls = newMax
    this.events.push({ type: 'castle_changed', castleId: c.id })
    if (faction === PLAYER) {
      this.log('info', `${c.name} is expanded`, `Now tier ${c.tier}: stronger walls, more income, manpower and room for troops.`, c.x, c.z)
      this.notify()
    }
    return null
  }

  setAutoRecruit(castleId: string, template: string | null) {
    const c = this.castle(castleId)
    if (!c || c.faction !== PLAYER) return
    c.autoRecruit = template
    this.notify()
  }

  formArmy(
    castleId: string,
    faction: Faction,
    troops: Troops,
    opts: {
      commanderKey?: string | null
      captainName?: string
      retreatAt?: number
      order?: ArmyOrder
      name?: string
      formation?: FormationKey
      column?: boolean
    } = {},
  ): Army | string {
    const c = this.castle(castleId)
    if (!c || c.faction !== faction) return 'You do not hold this castle.'
    const take: Troops = {}
    for (const k in troops) take[k] = Math.max(0, Math.min(Math.floor(troops[k]), Math.floor(c.garrison[k] ?? 0)))
    const n = total(take)
    if (n < 10) return 'An army needs at least 10 soldiers.'
    if (opts.commanderKey) {
      const s = this.state.commanders[opts.commanderKey]
      if (!s || s.owner !== faction || s.armyId || s.woundedUntil > this.state.time) return 'That commander is not available.'
    }
    for (const k in take) c.garrison[k] -= take[k]
    const name = opts.name ?? (faction === PLAYER ? this.playerArmyName(opts.commanderKey ?? null) : 'Warband')
    const r = castleRadius(c.tier) + 34
    let ang = Math.atan2(-c.z, -c.x)
    if (opts.order && 'castleId' in opts.order) {
      const t = this.castle(opts.order.castleId)
      if (t) ang = Math.atan2(t.z - c.z, t.x - c.x)
    }
    const [sx, sz] = this.world.nearestPassable(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r)
    const army: Army = {
      id: this.newId('a'),
      name,
      faction,
      commanderKey: opts.commanderKey ?? null,
      captainName: opts.commanderKey ? null : (opts.captainName ?? 'Captain'),
      x: sx,
      z: sz,
      heading: ang,
      path: [],
      pathTarget: null,
      repathAt: 0,
      order: opts.order ?? { type: 'hold' },
      status: 'idle',
      troops: { ...emptyTroops(this.unitList), ...take },
      initialTotal: n,
      morale: 0,
      retreatAt: clamp(opts.retreatAt ?? 0.5, 0.1, 0.95),
      formation: opts.formation ?? (faction === PLAYER ? 'line' : suggestFormation(take, this.units)),
      column: opts.column ?? false,
      homeCastleId: c.id,
      battleId: null,
      battleJoinedAt: 0,
      createdAt: this.state.time,
      kills: 0,
      routedAt: -999,
      hiddenSince: null,
      supplied: true,
    }
    army.morale = this.moraleCap(army)
    if (army.commanderKey) this.state.commanders[army.commanderKey].armyId = army.id
    this.state.armies.push(army)
    if (faction === PLAYER) {
      this.log('deploy', `${army.name} marches out`, `${totalInt(army.troops)} soldiers set out from ${c.name}.`, army.x, army.z)
      this.notify()
    }
    return army
  }

  /** Player armies are named after their commander; captain-led ones are numbered. */
  private playerArmyName(commanderKey: string | null): string {
    const cmd = commanderKey ? this.commanders.get(commanderKey) : undefined
    if (cmd) return cmd.name
    this.state.armyCounter++
    return `Army ${roman(this.state.armyCounter)}`
  }

  orderArmy(armyId: string, order: ArmyOrder) {
    const a = this.army(armyId)
    if (!a || a.status === 'retreating') return
    if (order.type === 'join' && order.armyId === a.id) return
    if (a.status === 'battle' || a.status === 'sieging') {
      // Changing orders mid-battle means disengaging.
      if (order.type === 'hold') return
      this.withdraw(a, false)
    }
    a.order = order
    a.path = []
    a.pathTarget = null
    a.repathAt = 0
    if (a.faction === PLAYER) this.notify()
  }

  setFormation(armyId: string, formation: FormationKey) {
    const a = this.army(armyId)
    if (!a) return
    a.formation = formation
    if (a.faction === PLAYER) this.notify()
  }

  setColumn(armyId: string, column: boolean) {
    const a = this.army(armyId)
    if (!a) return
    a.column = column
    if (a.faction === PLAYER) this.notify()
  }

  /** Retreat to the nearest friendly castle. */
  retreat(armyId: string) {
    const a = this.army(armyId)
    if (!a || a.status === 'retreating') return
    if (a.status === 'battle' || a.status === 'sieging') {
      this.withdraw(a, true)
    } else {
      const home = this.nearestCastle(a.x, a.z, a.faction)
      if (home) {
        a.order = { type: 'station', castleId: home.id }
        a.path = []
        a.pathTarget = null
      }
    }
    this.notify()
  }

  /** Merge an army standing at a friendly castle into its garrison (or march to one). */
  garrisonArmy(armyId: string): string | null {
    const a = this.army(armyId)
    if (!a) return 'No such army.'
    if (a.battleId) return 'The army is engaged in battle.'
    const c = this.castleAt(a.x, a.z, 70)
    if (!c || c.faction !== a.faction) {
      const target = this.nearestCastle(a.x, a.z, a.faction) ?? this.castle(a.homeCastleId)
      if (!target || target.faction !== a.faction) return 'No friendly castle to join.'
      a.order = { type: 'reinforce', castleId: target.id }
      a.path = []
      a.pathTarget = null
      if (a.faction === PLAYER) this.notify()
      return null
    }
    this.mergeIntoCastle(a, c)
    if (a.faction === PLAYER) this.notify()
    return null
  }

  private mergeIntoCastle(a: Army, c: Castle) {
    c.garrison = floorTroops(addTroops(c.garrison, a.troops))
    if (a.faction === PLAYER) this.log('info', `${a.name} joins the garrison`, `${totalInt(a.troops)} soldiers reinforce ${c.name}.`, c.x, c.z)
    this.removeArmy(a)
  }

  /** Combine `src` into `dst`. */
  mergeArmies(dst: Army, src: Army) {
    const nd = total(dst.troops)
    const ns = total(src.troops)
    dst.morale = (dst.morale * nd + src.morale * ns) / Math.max(1, nd + ns)
    dst.troops = addTroops(dst.troops, src.troops)
    dst.initialTotal = total(dst.troops)
    if (!dst.commanderKey && src.commanderKey) {
      dst.commanderKey = src.commanderKey
      dst.captainName = null
      this.state.commanders[src.commanderKey].armyId = dst.id
      src.commanderKey = null
      // A captain's army that gains a commander takes the commander's name.
      if (dst.faction === PLAYER && /^Army [IVXL\d]+$/.test(dst.name)) dst.name = this.playerArmyName(dst.commanderKey)
    }
    if (dst.faction === PLAYER) this.log('info', `${src.name} merges into ${dst.name}`, `${dst.name} now fields ${totalInt(dst.troops)} soldiers.`, dst.x, dst.z)
    this.removeArmy(src)
  }

  /** Detach `fraction` of an army into a new one. */
  splitArmy(armyId: string, fraction: number, commanderKey: string | null = null): Army | string {
    const a = this.army(armyId)
    if (!a) return 'No such army.'
    if (a.battleId || a.status === 'retreating') return 'Cannot split an army in battle or retreat.'
    const part = floorTroops(scaleTroops(a.troops, clamp(fraction, 0.05, 0.95)))
    const n = total(part)
    if (n < 10 || total(a.troops) - n < 10) return 'Both halves need at least 10 soldiers.'
    if (commanderKey) {
      const s = this.state.commanders[commanderKey]
      if (!s || s.owner !== a.faction || s.armyId || s.woundedUntil > this.state.time) return 'That commander is not available.'
    }
    for (const k in part) a.troops[k] -= part[k]
    a.initialTotal = total(a.troops)
    const off = 40
    const [sx, sz] = this.world.nearestPassable(a.x - Math.sin(a.heading) * off, a.z + Math.cos(a.heading) * off)
    const name = a.faction === PLAYER ? this.playerArmyName(commanderKey) : 'Detachment'
    const b: Army = {
      ...a,
      id: this.newId('a'),
      name,
      commanderKey,
      captainName: commanderKey ? null : 'Captain',
      x: sx,
      z: sz,
      path: [],
      pathTarget: null,
      order: { type: 'hold' },
      status: 'idle',
      troops: { ...emptyTroops(this.unitList), ...part },
      initialTotal: n,
      kills: 0,
      createdAt: this.state.time,
    }
    if (commanderKey) this.state.commanders[commanderKey].armyId = b.id
    this.state.armies.push(b)
    if (a.faction === PLAYER) {
      this.log('deploy', `${b.name} splits from ${a.name}`, `${totalInt(b.troops)} soldiers under ${this.armyLeader(b)} form a new army.`, b.x, b.z)
      this.notify()
    }
    return b
  }


  // -------------------------------------------------------------------------
  // Commander traits, weather, supply, diplomacy
  // -------------------------------------------------------------------------

  chooseTrait(commanderKey: string, traitKey: string) {
    const s = this.state.commanders[commanderKey]
    if (!s || !s.traitChoices?.includes(traitKey)) return
    s.traits.push(traitKey)
    s.traitChoices = null
    this.notify()
  }

  private updateWeather() {
    const w = this.state.weather
    const t = this.state.time
    if (t < w.until) return
    const before = w.kind
    const season = seasonAt(t)
    w.kind = nextWeather(season, Math.random())
    w.until = t + 70 + Math.random() * 90
    const prevSeason = seasonAt(Math.max(0, t - 1.5))
    if (Math.floor(t / SEASON_SECONDS) !== Math.floor(Math.max(0, t - 1.5) / SEASON_SECONDS) || (t < 2 && prevSeason !== season)) {
      this.log('info', `${season} arrives`, season === 'Winter' ? 'Marches slow and armies cost more to feed.' : season === 'Spring' ? 'Recruits come more readily.' : season === 'Autumn' ? 'The harvest swells the treasury.' : 'Long days for campaigning.')
    }
    if (w.kind !== before) {
      const text = w.kind === 'rain' ? 'Bowstrings go slack and roads turn to mud.' : w.kind === 'storm' ? 'A storm lashes the land: archers are nearly useless.' : w.kind === 'snow' ? 'Snow falls, slowing every march.' : 'The skies clear.'
      this.log('info', WEATHER_LABEL[w.kind], text)
    }
  }

  /** Armies far from friendly castles, outposts or camps lose men and morale. */
  private updateSupply(dt: number) {
    const clim = this.climate()
    for (const a of this.state.armies) {
      const team = this.team(a.faction)
      const reach = this.traitsOf(a).supply * clim.supply
      let ok = false
      for (const c of this.state.castles) {
        if (this.team(c.faction) !== team || c.faction === NEUTRAL) continue
        if (Math.hypot(c.x - a.x, c.z - a.z) < this.supplyRange(c) * reach) {
          ok = true
          break
        }
      }
      if (!ok) {
        for (const o of this.state.outposts) {
          if (o.progress >= 1 && this.team(o.faction) === team && Math.hypot(o.x - a.x, o.z - a.z) < outpostSupply(o) * reach) {
            ok = true
            break
          }
        }
      }
      if (ok !== a.supplied && a.faction === PLAYER) {
        if (!ok) this.log('warning', `${a.name} is out of supply`, 'Too far from any castle or outpost: men desert and morale sinks.', a.x, a.z)
        else this.log('info', `${a.name} is resupplied`, 'Back within reach of friendly lines.', a.x, a.z)
      }
      a.supplied = ok
      if (!ok) {
        const n = total(a.troops)
        const lossFrac = 0.0025 * (this.traitsOf(a).supply > 1 ? 0.5 : 1) * dt
        a.troops = scaleTroops(a.troops, 1 - lossFrac)
        a.morale = Math.max(0, a.morale - 0.7 * dt)
        if (a.faction === PLAYER) this.state.stats.playerLost += n * lossFrac
      }
    }
  }

  // --- Diplomacy ---------------------------------------------------------------

  /** Gold a free town asks to join the realm. */
  townPrice(c: Castle): number {
    return Math.round(250 + c.tier * 250 + total(c.garrison) * 1.6)
  }
  buyTown(castleId: string): string | null {
    const c = this.castle(castleId)
    const f = this.state.factions[PLAYER]
    if (!c || c.faction !== NEUTRAL) return 'Only free towns can be bought.'
    if (c.battleId) return 'Not while it is under siege.'
    const price = this.townPrice(c)
    if (f.gold < price) return `The burghers want ${price} gold.`
    f.gold -= price
    c.faction = PLAYER
    c.lastCapturedAt = this.state.time
    this.events.push({ type: 'captured', castleId: c.id, faction: PLAYER })
    this.log('capture', `${c.name} swears fealty`, `The town joins your realm for ${price} gold, garrison and all.`, c.x, c.z)
    this.notify()
    return null
  }

  private factionSoldiers(fid: Faction) {
    let n = 0
    for (const c of this.state.castles) if (c.faction === fid) n += total(c.garrison)
    for (const a of this.state.armies) if (a.faction === fid) n += total(a.troops)
    return n
  }

  /** Price and odds of turning an enemy lord (Alliance War). */
  bribeOffer(fid: Faction): { price: number; chance: number } | null {
    const f = this.state.factions[fid]
    if (!f || f.team !== 'B' || f.leader || !f.alive || this.state.rules.mode !== 'alliance') return null
    const castles = this.state.castles.filter((c) => c.faction === fid)
    const cap = this.castle(f.capitalId) ?? castles[0]
    if (!cap) return null
    const own = power(castles.reduce((t, c) => addTroops(t, c.garrison), emptyTroops(this.unitList)), this.units)
    let threat = 0
    for (const c of this.state.castles) if (this.team(c.faction) === 'A' && Math.hypot(c.x - cap.x, c.z - cap.z) < 1300) threat += power(c.garrison, this.units)
    const chance = clamp(0.25 + 0.55 * (threat / Math.max(1, threat + own * 2)), 0.25, 0.85)
    return { price: Math.round(600 + castles.length * 450 + this.factionSoldiers(fid) * 1.1), chance }
  }
  bribeLord(fid: Faction): string | null {
    const offer = this.bribeOffer(fid)
    const f = this.state.factions[fid]
    const me = this.state.factions[PLAYER]
    if (!offer || !f) return 'This lord cannot be swayed.'
    if ((this.state.diploCooldown[fid] ?? 0) > this.state.time) return 'They will not receive your envoys again so soon.'
    if (me.gold < offer.price) return `Needs ${offer.price} gold.`
    if (Math.random() < offer.chance) {
      me.gold -= offer.price
      // Leave any battles before changing sides.
      for (const a of this.state.armies) if (a.faction === fid && a.battleId) this.withdraw(a, false)
      f.team = 'A'
      f.host = null
      this.log('ally', `${f.name} changes sides!`, `Your gold has bought their loyalty. Their castles and armies now fight for your alliance.`)
    } else {
      me.gold -= Math.round(offer.price * 0.4)
      this.state.diploCooldown[fid] = this.state.time + 240
      this.log('warning', `${f.name} spurns your envoys`, 'Part of the bribe is lost, and they will not listen again for a while.')
    }
    this.notify()
    return null
  }

  /** A truce: the lord will not attack your lands or armies for a few minutes. */
  pactOffer(fid: Faction): { price: number; duration: number } | null {
    const f = this.state.factions[fid]
    if (!f || f.team !== 'B' || f.leader || !f.alive) return null
    return { price: Math.round(300 + this.factionSoldiers(fid) * 0.45), duration: 240 }
  }
  signPact(fid: Faction): string | null {
    const offer = this.pactOffer(fid)
    const me = this.state.factions[PLAYER]
    if (!offer) return 'This lord will not treat with you.'
    if ((this.state.diploCooldown[fid] ?? 0) > this.state.time) return 'Too soon to send another embassy.'
    if (me.gold < offer.price) return `Needs ${offer.price} gold.`
    me.gold -= offer.price
    this.state.pacts[fid] = this.state.time + offer.duration
    this.state.diploCooldown[fid] = this.state.time + offer.duration
    for (const a of this.state.armies) {
      if (a.faction !== fid || !a.battleId) continue
      const b = this.battle(a.battleId)
      if (b?.playerInvolved) this.withdraw(a, false)
    }
    this.log('ally', `Truce with ${this.factionName(fid)}`, `They will leave your lands and armies alone for ${Math.round(offer.duration / 60)} minutes.`)
    this.notify()
    return null
  }

  // -------------------------------------------------------------------------
  // Forward outposts
  // -------------------------------------------------------------------------

  outpost(id: string | null | undefined) {
    return id ? this.state.outposts.find((o) => o.id === id) : undefined
  }

  /** Completed friendly outpost sheltering this point, if any. */
  outpostAt(x: number, z: number, team: Team, radius = OUTPOST.radius) {
    return this.state.outposts.find((o) => o.progress >= 1 && this.team(o.faction) === team && Math.hypot(o.x - x, o.z - z) < radius)
  }

  /** Which outpost kinds this army could build where it stands, with a reason when not. */
  outpostOptions(armyId: string): { kind: OutpostKind; ok: boolean; reason: string | null }[] {
    const a = this.army(armyId)
    if (!a) return []
    const general = this.outpostSiteProblem(a)
    const f = this.faction(a.faction)
    return OUTPOST_ORDER.map((kind) => {
      const def = OUTPOST_KINDS[kind]
      let reason = general
      if (!reason && !this.terrainSuits(kind, a.x, a.z)) reason = `Needs: ${def.terrain.toLowerCase()}.`
      if (!reason && (!f || f.gold < def.cost)) reason = `Needs ${def.cost} gold.`
      return { kind, ok: !reason, reason }
    })
  }

  private outpostSiteProblem(a: Army): string | null {
    if (a.battleId || a.status === 'retreating') return 'Not while fighting or retreating.'
    if ((a.troops.engineers ?? 0) < MIN_ENGINEERS) return `Needs at least ${MIN_ENGINEERS} Engineers in the army.`
    if (this.state.outposts.filter((o) => o.faction === a.faction).length >= OUTPOST.maxPerFaction) return `At most ${OUTPOST.maxPerFaction} outposts.`
    for (const c of this.state.castles) {
      if (Math.hypot(c.x - a.x, c.z - a.z) - castleRadius(c.tier) < OUTPOST.castleClearance) return `Too close to ${c.name}.`
    }
    if (this.state.outposts.some((o) => Math.hypot(o.x - a.x, o.z - a.z) < OUTPOST.spacing)) return 'Too close to another outpost.'
    if (this.world.bridgeAt(a.x, a.z, 20) || this.world.heightAt(a.x, a.z) < 3) return 'Cannot build on a bridge or in the water.'
    return null
  }

  private terrainSuits(kind: OutpostKind, x: number, z: number): boolean {
    const w = this.world
    switch (kind) {
      case 'watchtower':
        return w.heightAt(x, z) > 32 || w.slopeAt(x, z) > 0.25
      case 'lodge':
        return w.forestAt(x, z) > 0.3
      case 'bridgefort':
        return w.bridges.some((b) => Math.hypot(b.x - x, b.z - z) < 170)
      default:
        return w.forestAt(x, z) < 0.5
    }
  }

  /** Can this army build any outpost here? Returns null if yes. */
  canBuildOutpost(armyId: string): string | null {
    const opts = this.outpostOptions(armyId)
    if (opts.some((o) => o.ok)) return null
    return opts[0]?.reason ?? 'Cannot build here.'
  }

  /** Pay for an outpost where the army stands; its engineers stay to build it. */
  buildOutpost(armyId: string, kind: OutpostKind = 'camp'): string | null {
    const opt = this.outpostOptions(armyId).find((o) => o.kind === kind)
    if (!opt) return 'No such army.'
    if (!opt.ok) return opt.reason
    const a = this.army(armyId)!
    const def = OUTPOST_KINDS[kind]
    this.state.factions[a.faction].gold -= def.cost
    const near = this.castleAt(a.x, a.z, 900)
    const o = {
      id: this.newId('o'),
      name: near ? `${near.name} ${def.name}` : def.name,
      kind,
      faction: a.faction,
      x: a.x,
      z: a.z,
      progress: 0,
      raze: 0,
      builtAt: this.state.time,
    }
    this.state.outposts.push(o)
    this.orderArmy(a.id, { type: 'build', outpostId: o.id })
    if (a.faction === PLAYER) this.log('deploy', `Engineers begin a ${def.name}`, `${a.name} stays to build it (about ${Math.round(buildSeconds(a.troops.engineers ?? 0))}s).`, o.x, o.z)
    return null
  }

  dismantleOutpost(id: string) {
    const o = this.outpost(id)
    if (!o || o.faction !== PLAYER) return
    this.state.outposts = this.state.outposts.filter((x) => x.id !== id)
    this.notify()
  }

  private updateOutposts(dt: number) {
    for (const o of [...this.state.outposts]) {
      const team = this.team(o.faction)
      let defended = false
      let attackers = 0
      for (const a of this.state.armies) {
        const d = Math.hypot(a.x - o.x, a.z - o.z)
        if (this.team(a.faction) === team) {
          if (d < OUTPOST.radius && a.status !== 'retreating') defended = true
        } else if (d < 70 && !a.battleId && a.status !== 'retreating' && this.isHostile(a.faction, o.faction)) attackers++
      }
      if (attackers > 0 && !defended) o.raze += dt / OUTPOST.razeSeconds
      else o.raze = Math.max(0, o.raze - dt / 30)
      if (o.raze >= 1) {
        this.state.outposts = this.state.outposts.filter((x) => x.id !== o.id)
        if (o.faction === PLAYER) this.log('lost', `${o.name} is burned`, 'Enemy raiders razed the undefended outpost.', o.x, o.z)
        else if (this.isHostile(o.faction, PLAYER)) this.log('victory', `${o.name} is burned`, `An outpost of ${this.factionName(o.faction)} is razed.`, o.x, o.z)
      }
    }
  }

  /** Ask the whole alliance to converge on an enemy castle. */
  callToArms(castleId: string): string | null {
    const c = this.castle(castleId)
    if (!c || this.team(c.faction) === 'A') return 'Choose an enemy or neutral castle.'
    const cur = this.state.callToArms
    if (cur && cur.until > this.state.time && cur.castleId !== castleId && cur.until - this.state.time > 120) return 'The alliance is still answering your previous call.'
    this.state.callToArms = { castleId, until: this.state.time + 180 }
    this.log('ally', `Call to arms: ${c.name}`, 'Allied lords within reach will march on it.', c.x, c.z)
    this.notify()
    return null
  }

  // -------------------------------------------------------------------------
  // Alliance muster: summon allied lords to a rally point, then strike together
  // -------------------------------------------------------------------------

  /** Limits on simultaneous musters. */
  static readonly MUSTERS_PER_TEAM = 3
  static readonly MUSTERS_PER_PLAYER = 2

  muster(id: string | null | undefined): AllianceMuster | undefined {
    return id ? this.state.musters.find((m) => m.id === id) : undefined
  }
  /** The muster an army is marching for, if any. */
  musterOf(armyId: string): AllianceMuster | undefined {
    return this.state.musters.find((m) => m.contingentIds.includes(armyId) || m.rallyArmyId === armyId)
  }
  /** True if the lord already has troops committed to a muster. */
  committedToMuster(fid: Faction): boolean {
    return this.state.musters.some((m) => m.contingentIds.some((id) => this.army(id)?.faction === fid))
  }

  /** Call the alliance to gather at a rally point (army or castle), then strike a target together. */
  summonAlliance(targetCastleId: string, rally: { armyId?: string; castleId?: string }, organizer: Faction = PLAYER): string | null {
    const target = this.castle(targetCastleId)
    const team = this.team(organizer)
    if (!target || !this.isHostile(target.faction, organizer)) return 'Choose an enemy or neutral castle.'
    const live = this.state.musters.filter((m) => m.team === team)
    if (live.some((m) => m.targetCastleId === targetCastleId)) return 'The alliance is already gathering against that castle. Join that muster instead.'
    if (live.length >= GameEngine.MUSTERS_PER_TEAM) return `At most ${GameEngine.MUSTERS_PER_TEAM} musters at once.`
    if (organizer === PLAYER && live.filter((m) => m.organizer === PLAYER).length >= GameEngine.MUSTERS_PER_PLAYER) return `You can lead at most ${GameEngine.MUSTERS_PER_PLAYER} musters at once.`
    if (!Object.values(this.state.factions).some((f) => f.team === team && f.id !== organizer && f.alive)) return 'You have no allies to summon.'
    let x: number
    let z: number
    const army = this.army(rally.armyId)
    const castle = this.castle(rally.castleId)
    if (army && army.faction === organizer) {
      x = army.x
      z = army.z
    } else if (castle && castle.faction === organizer) {
      const d = Math.hypot(target.x - castle.x, target.z - castle.z) || 1
      const off = castleRadius(castle.tier) + 70
      ;[x, z] = this.world.nearestPassable(castle.x + ((target.x - castle.x) / d) * off, castle.z + ((target.z - castle.z) / d) * off)
    } else return 'Choose one of your armies or castles as the rally point.'
    const t = this.state.time
    const m: AllianceMuster = {
      id: this.newId('m'),
      organizer,
      team,
      targetCastleId,
      rallyArmyId: army ? army.id : null,
      rallyCastleId: army ? null : (castle?.id ?? null),
      rallyX: x,
      rallyZ: z,
      phase: 'gathering',
      contingentIds: [],
      answered: [organizer],
      startedAt: t,
      deadline: t + 150,
      marchedAt: 0,
    }
    this.state.musters.push(m)
    if (organizer === PLAYER) this.state.callToArms = null
    const where = army ? army.name : castle!.name
    if (team === 'A') {
      const who = organizer === PLAYER ? 'You summon' : `${this.factionName(organizer)} summons`
      this.log('ally', `${who} the alliance against ${target.name}`, `Allied lords gather at ${where}, then march together.`, x, z)
    }
    this.notify()
    return null
  }

  /** Every gathered contingent (and the rally army) marches on the target at once. */
  launchMuster(id: string) {
    const m = this.muster(id)
    if (!m || m.phase !== 'gathering') return
    const target = this.castle(m.targetCastleId)
    if (!target) {
      this.state.musters = this.state.musters.filter((x) => x.id !== id)
      return
    }
    m.phase = 'marching'
    m.marchedAt = this.state.time
    let n = 0
    for (const cid of m.contingentIds) {
      const a = this.army(cid)
      if (!a || a.battleId) continue
      this.orderArmy(a.id, { type: 'attack', castleId: target.id })
      n += total(a.troops)
    }
    const lead = this.army(m.rallyArmyId)
    if (lead && !lead.battleId && lead.status !== 'retreating') {
      this.orderArmy(lead.id, { type: 'attack', castleId: target.id })
      n += total(lead.troops)
    }
    if (m.team === 'A') this.log('ally', `The allied host marches on ${target.name}!`, `${Math.round(n)} soldiers advance together.`, m.rallyX, m.rallyZ)
    this.notify()
  }

  cancelMuster(id: string) {
    const m = this.muster(id)
    if (!m) return
    this.state.musters = this.state.musters.filter((x) => x.id !== id)
    for (const cid of m.contingentIds) {
      const a = this.army(cid)
      if (a && !a.battleId && a.status !== 'retreating') {
        const home = this.nearestCastle(a.x, a.z, a.faction)
        if (home) this.orderArmy(a.id, { type: 'reinforce', castleId: home.id })
      }
    }
    if (m.team === 'A') this.log('ally', 'A muster is dismissed', 'Its contingents return home.')
    this.notify()
  }

  /** Add an army to a muster: it marches to the rally point and waits. */
  addMusterContingent(id: string, a: Army) {
    const m = this.muster(id)
    if (!m) return
    if (!m.contingentIds.includes(a.id)) m.contingentIds.push(a.id)
    if (!m.answered.includes(a.faction)) m.answered.push(a.faction)
    m.deadline = Math.max(m.deadline, this.state.time + Math.hypot(a.x - m.rallyX, a.z - m.rallyZ) / Math.max(10, this.armySpeed(a)) + 20)
  }

  /** The player sends one of their armies to an ally's muster. */
  joinMuster(id: string, armyId: string): string | null {
    const m = this.muster(id)
    const a = this.army(armyId)
    if (!m || m.phase !== 'gathering') return 'That muster is no longer gathering.'
    if (!a || a.faction !== PLAYER || a.battleId || a.status === 'retreating') return 'That army cannot march now.'
    this.orderArmy(a.id, { type: 'rally', x: m.rallyX, z: m.rallyZ, hostId: m.id })
    this.addMusterContingent(id, a)
    this.log('ally', `${a.name} answers the summons`, `Marching to join the muster against ${this.castleName(m.targetCastleId)}.`, a.x, a.z)
    this.notify()
    return null
  }

  /** Contingents standing at the rally point. */
  musterStatus(id: string) {
    const m = this.muster(id)
    if (!m) return null
    let arrived = 0
    let soldiers = 0
    let enRoute = 0
    for (const cid of m.contingentIds) {
      const a = this.army(cid)
      if (!a) continue
      soldiers += total(a.troops)
      if (Math.hypot(a.x - m.rallyX, a.z - m.rallyZ) < 110) arrived++
      else enRoute++
    }
    const lead = this.army(m.rallyArmyId)
    return { arrived, enRoute, soldiers: soldiers + (lead ? total(lead.troops) : 0), target: this.castle(m.targetCastleId) }
  }

  private updateMusters() {
    const t = this.state.time
    for (const m of [...this.state.musters]) {
      m.contingentIds = m.contingentIds.filter((id) => !!this.army(id))
      const target = this.castle(m.targetCastleId)
      const drop = () => (this.state.musters = this.state.musters.filter((x) => x.id !== m.id))
      if (!target || this.team(target.faction) === m.team) {
        if (target && m.phase === 'marching' && m.team === 'A') this.log('ally', `${target.name} has fallen to the alliance`, 'The allied host disbands.', target.x, target.z)
        drop()
        continue
      }
      if (m.phase === 'gathering') {
        // Follow the rally army if it moves.
        const lead = this.army(m.rallyArmyId)
        if (m.rallyArmyId && !lead) m.rallyArmyId = null
        if (lead && Math.hypot(lead.x - m.rallyX, lead.z - m.rallyZ) > 60) {
          m.rallyX = lead.x
          m.rallyZ = lead.z
          for (const id of m.contingentIds) {
            const a = this.army(id)
            if (a && !a.battleId && a.status !== 'retreating') this.orderArmy(a.id, { type: 'rally', x: m.rallyX, z: m.rallyZ, hostId: m.id })
          }
        }
        const st = this.musterStatus(m.id)!
        // AI lords answer within a few seconds; the player is never waited for.
        const allAnswered = Object.values(this.state.factions).every((f) => f.team !== m.team || f.id === PLAYER || !f.alive || m.answered.includes(f.id))
        const ready = st.arrived > 0 && st.enRoute === 0 && allAnswered && t - m.startedAt > 15
        // AI organisers do not wait forever for a single straggler.
        const aiReady = m.organizer !== PLAYER && st.arrived >= 2 && t - m.startedAt > 60
        if (ready || aiReady || (t > m.deadline && st.arrived > 0)) this.launchMuster(m.id)
        else if (t > m.deadline + 60 && m.contingentIds.length === 0) {
          if (m.team === 'A' && m.organizer === PLAYER) this.log('ally', 'No ally answered the summons', 'The muster is dismissed.')
          drop()
        }
      } else if (t - m.marchedAt > 600 || (m.contingentIds.length === 0 && !this.army(m.rallyArmyId))) {
        drop()
      }
    }
  }

  private removeArmy(a: Army) {
    if (a.commanderKey) {
      const s = this.state.commanders[a.commanderKey]
      if (s && s.armyId === a.id) s.armyId = null
    }
    if (a.battleId) {
      const b = this.battle(a.battleId)
      if (b) {
        b.sideA.armyIds = b.sideA.armyIds.filter((id) => id !== a.id)
        b.sideB.armyIds = b.sideB.armyIds.filter((id) => id !== a.id)
      }
    }
    this.state.armies = this.state.armies.filter((x) => x.id !== a.id)
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  step(dt: number) {
    if (this.state.status !== 'active') return
    this.state.time += dt
    const t = this.state.time
    if (t >= this.nextEconomyAt) {
      this.economy(1)
      this.updateMusters()
      this.updateOutposts(1)
      this.towerFire()
      this.updateSupply(1)
      this.nextEconomyAt = t + 1
    }
    if (t >= this.nextAutoRecruitAt) {
      this.autoRecruit()
      this.nextAutoRecruitAt = t + 3
    }
    for (const ai of this.ais.values()) ai.update()
    for (const a of [...this.state.armies]) this.updateArmy(a, dt)
    this.detectEngagements()
    for (const b of [...this.state.battles]) this.updateBattle(b, dt)
    if (t >= this.nextVisionAt) {
      this.updateVision()
      this.nextVisionAt = t + 0.25
    }
    this.checkEnd()
  }

  private economy(dt: number) {
    const s = this.state
    this.updateWeather()
    const clim = this.climate()
    for (const c of s.castles) {
      const f = s.factions[c.faction]
      if (!f) continue
      if (f.team === 'N') {
        // Free towns slowly rebuild their militia.
        if (!c.battleId && total(c.garrison) < c.tier * 260) c.garrison.infantry = (c.garrison.infantry ?? 0) + 0.4 * dt
      } else {
        f.gold += incomeForTier(c.tier) * this.incomeMult(c.faction) * clim.income * dt
      }
      const mpBoost = clim.manpower
      c.manpower = Math.min(maxManpowerForTier(c.tier), c.manpower + manpowerRegenForTier(c.tier) * mpBoost * dt)
      if (!c.battleId && c.walls < c.maxWalls) c.walls = Math.min(c.maxWalls, c.walls + c.tier * 3 * dt)
    }
    const soldiers = new Map<Faction, number>()
    for (const a of s.armies) soldiers.set(a.faction, (soldiers.get(a.faction) ?? 0) + total(a.troops))
    for (const [fid, n] of soldiers) {
      const f = s.factions[fid]
      if (!f) continue
      f.gold -= n * FIELD_UPKEEP * clim.upkeep * dt
      if (f.gold < 0) {
        f.gold = 0
        for (const a of s.armies) if (a.faction === fid) a.morale = Math.max(0, a.morale - 0.6 * dt)
      }
    }
    for (const key in s.commanders) {
      const cs = s.commanders[key]
      if (cs.woundedUntil > 0 && cs.woundedUntil <= s.time) {
        cs.woundedUntil = 0
        const def = this.commanders.get(key)
        if (cs.owner === PLAYER && def) this.log('info', `${def.name} has recovered`, 'Ready to lead an army again.')
      }
    }
  }

  private autoRecruit() {
    const f = this.state.factions[PLAYER]
    if (!f) return
    const reserve = 150
    for (const c of this.state.castles) {
      if (c.faction !== PLAYER || !c.autoRecruit || c.battleId) continue
      const tpl = RECRUIT_TEMPLATES[c.autoRecruit]
      if (!tpl || f.gold <= reserve) continue
      this.recruitMix(c.id, tpl.mix, (f.gold - reserve) * 0.4, PLAYER)
    }
  }

  private moraleCap(a: Army) {
    return clamp(70 + (this.commanderOf(a)?.morale_bonus ?? 0) + this.traitsOf(a).morale, 40, 100)
  }

  private updateArmy(a: Army, dt: number) {
    if (a.status === 'battle' || a.status === 'sieging') return
    const nearFriendly = this.castleAt(a.x, a.z, 90)
    const sheltered = (nearFriendly && nearFriendly.faction === a.faction) || !!this.outpostAt(a.x, a.z, this.team(a.faction))
    const rec = sheltered ? 1.5 : 0.35
    a.morale = Math.min(this.moraleCap(a), a.morale + rec * dt)
    // Armies holding still in the forest slip out of sight.
    const lodge = this.outpostAt(a.x, a.z, this.team(a.faction))
    if (a.status === 'idle' && lodge && OUTPOST_KINDS[lodge.kind].hides) {
      a.hiddenSince = Math.min(a.hiddenSince ?? this.state.time, this.state.time - HIDE_SECONDS)
    } else if (a.status === 'idle' && this.world.forestAt(a.x, a.z) > 0.3) {
      if (a.hiddenSince === null) a.hiddenSince = this.state.time
    } else if (a.status !== 'idle') a.hiddenSince = null

    if (a.status === 'retreating') {
      const home = this.castle(a.homeCastleId)
      if (!home || home.faction !== a.faction) {
        const alt = this.nearestCastle(a.x, a.z, a.faction) ?? this.state.castles.find((c) => this.team(c.faction) === this.team(a.faction) && c.faction !== NEUTRAL)
        if (!alt) {
          this.destroyArmy(a, 'scattered with nowhere to flee')
          return
        }
        a.homeCastleId = alt.id
        a.path = []
        a.pathTarget = null
      }
      const c = this.castle(a.homeCastleId)!
      if (this.moveTowards(a, c.x, c.z, dt, castleRadius(c.tier) + 30, 1.1)) {
        a.status = 'idle'
        a.order = { type: 'station', castleId: c.id }
        if (a.faction === PLAYER) this.log('retreat', `${a.name} reaches safety`, `The survivors regroup at ${c.name}.`, c.x, c.z)
      }
      return
    }

    // Siege: an enemy gatehouse cannot be marched past; reaching it starts the assault.
    for (const c of this.state.castles) {
      if (!c.gate || !this.isHostile(c.faction, a.faction)) continue
      if (Math.abs(c.x - a.x) > 120 || Math.abs(c.z - a.z) > 120) continue
      if (Math.hypot(c.x - a.x, c.z - a.z) < castleRadius(c.tier) + 16) {
        this.beginSiege(a, c)
        return
      }
    }

    const o = a.order
    switch (o.type) {
      case 'hold':
        a.status = 'idle'
        break
      case 'move':
      case 'rally':
        if (this.moveTowards(a, o.x, o.z, dt, 12)) {
          a.status = 'idle'
          if (o.type === 'move') a.order = { type: 'hold' }
        }
        break
      case 'attack': {
        const c = this.castle(o.castleId)
        if (!c) {
          a.order = { type: 'hold' }
          break
        }
        if (!this.isHostile(c.faction, a.faction)) {
          a.order = { type: 'station', castleId: c.id }
          break
        }
        if (this.moveTowards(a, c.x, c.z, dt, castleRadius(c.tier) + 28)) this.beginSiege(a, c)
        break
      }
      case 'station':
      case 'reinforce': {
        const c = this.castle(o.castleId)
        if (!c) {
          a.order = { type: 'hold' }
          break
        }
        if (this.moveTowards(a, c.x, c.z, dt, castleRadius(c.tier) + 30)) {
          a.status = 'idle'
          if (o.type === 'reinforce' && c.faction === a.faction) this.mergeIntoCastle(a, c)
          else if (o.type === 'reinforce' && this.isHostile(c.faction, a.faction)) a.order = { type: 'hold' }
        }
        break
      }
      case 'build': {
        const site = this.outpost(o.outpostId)
        if (!site) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          break
        }
        if (this.moveTowards(a, site.x, site.z, dt, 25)) {
          a.status = 'idle'
          if (site.progress < 1) {
            const builder = a.commanderKey && this.state.commanders[a.commanderKey]?.traits.includes('master_builder') ? 2 : 1
            site.progress = Math.min(1, site.progress + (dt * builder) / buildSeconds(a.troops.engineers ?? 0))
            if (site.progress >= 1) {
              a.order = { type: 'hold' }
              if (a.faction === PLAYER) this.log('capture', `${site.name} is complete`, OUTPOST_KINDS[site.kind].description, site.x, site.z)
            }
          } else a.order = { type: 'hold' }
        }
        break
      }
      case 'join': {
        const t = this.army(o.armyId)
        if (!t || t.faction !== a.faction || t.status === 'retreating') {
          a.order = { type: 'hold' }
          a.status = 'idle'
          break
        }
        if (this.state.time >= a.repathAt) {
          a.path = []
          a.pathTarget = null
          a.repathAt = this.state.time + 1.5
        }
        if (this.moveTowards(a, t.x, t.z, dt, 30) && !t.battleId) this.mergeArmies(t, a)
        break
      }
      case 'intercept': {
        const target = this.army(o.armyId)
        if (!target || (a.faction === PLAYER && !this.isVisible(target.x, target.z))) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          if (a.faction === PLAYER) this.log('info', `${a.name} lost the trail`, 'The enemy force slipped out of sight.', a.x, a.z)
          break
        }
        if (this.state.time >= a.repathAt) {
          a.path = []
          a.pathTarget = null
          a.repathAt = this.state.time + 1.5
        }
        this.moveTowards(a, target.x, target.z, dt, 10, 1)
        break
      }
    }
  }

  /** Follows (and lazily computes) a path. Returns true once within `arrive` of the goal. */
  private moveTowards(a: Army, tx: number, tz: number, dt: number, arrive: number, speedMult = 1): boolean {
    const dGoal = Math.hypot(tx - a.x, tz - a.z)
    if (dGoal <= arrive) {
      a.path = []
      return true
    }
    if (!a.pathTarget || Math.hypot(a.pathTarget[0] - tx, a.pathTarget[1] - tz) > 25 || a.path.length === 0) {
      a.path = this.world.findPath(a.x, a.z, tx, tz)
      a.pathTarget = [tx, tz]
    }
    if (a.status !== 'retreating') a.status = 'marching'
    let zoc = 1
    for (const o of this.state.outposts) {
      const k = OUTPOST_KINDS[o.kind]
      if (!k.zoc || o.progress < 1 || Math.abs(o.x - a.x) > k.zoc || Math.abs(o.z - a.z) > k.zoc) continue
      if (this.isHostile(o.faction, a.faction) && Math.hypot(o.x - a.x, o.z - a.z) < k.zoc) zoc = Math.min(zoc, k.zocSlow)
    }
    let budget = this.armySpeed(a) * this.world.speedAt(a.x, a.z) * speedMult * zoc * dt
    while (budget > 0 && a.path.length > 0) {
      const [wx, wz] = a.path[0]
      const dx = wx - a.x
      const dz = wz - a.z
      const d = Math.hypot(dx, dz)
      if (d < 0.001) {
        a.path.shift()
        continue
      }
      a.heading = Math.atan2(dz, dx)
      if (d <= budget) {
        a.x = wx
        a.z = wz
        budget -= d
        a.path.shift()
      } else {
        a.x += (dx / d) * budget
        a.z += (dz / d) * budget
        budget = 0
      }
      if (Math.hypot(tx - a.x, tz - a.z) <= arrive) {
        a.path = []
        return true
      }
    }
    if (a.path.length === 0) return Math.hypot(tx - a.x, tz - a.z) <= arrive + 40
    return false
  }

  // -------------------------------------------------------------------------
  // Battles
  // -------------------------------------------------------------------------

  private detectEngagements() {
    const armies = this.state.armies
    const t = this.state.time
    for (const a of armies) {
      if (a.battleId || a.status === 'retreating' || t - a.routedAt < 6) continue
      const team = this.team(a.faction)
      for (const b of this.state.battles) {
        const near = b.kind === 'siege' ? castleRadius(this.castle(b.castleId)?.tier ?? 1) + 70 : JOIN_DIST
        if (Math.abs(b.x - a.x) > near || Math.abs(b.z - a.z) > near) continue
        if (Math.hypot(b.x - a.x, b.z - a.z) > near) continue
        if (b.sideA.team === team) {
          this.joinBattle(a, b, 'A')
          break
        }
        if (b.sideB.team === team) {
          this.joinBattle(a, b, 'B')
          break
        }
      }
    }
    for (let i = 0; i < armies.length; i++) {
      const a = armies[i]
      if (a.battleId) continue
      for (let j = i + 1; j < armies.length; j++) {
        const b = armies[j]
        if (b.battleId || a.battleId) continue
        if (Math.abs(a.x - b.x) > ENGAGE_DIST || Math.abs(a.z - b.z) > ENGAGE_DIST) continue
        if (!this.isHostile(a.faction, b.faction) || this.atPeace(a.faction, b.faction)) continue
        if (Math.hypot(a.x - b.x, a.z - b.z) > ENGAGE_DIST) continue
        if (t - a.routedAt < 6 || t - b.routedAt < 6) continue
        if (a.status === 'retreating' && !(b.order.type === 'intercept' && b.order.armyId === a.id)) continue
        if (b.status === 'retreating' && !(a.order.type === 'intercept' && a.order.armyId === b.id)) continue
        this.startFieldBattle(a, b)
      }
    }
  }

  private startFieldBattle(a: Army, b: Army) {
    const x = (a.x + b.x) / 2
    const z = (a.z + b.z) / 2
    const near = this.castleAt(x, z, 400)
    const battle: Battle = {
      id: this.newId('b'),
      kind: 'field',
      x,
      z,
      castleId: null,
      sideA: { team: this.team(a.faction), armyIds: [a.id] },
      sideB: { team: this.team(b.faction), armyIds: [b.id] },
      startedAt: this.state.time,
      lossesA: 0,
      lossesB: 0,
      initialA: total(a.troops),
      initialB: total(b.troops),
      note: 'The lines close',
      location: near ? `Fields near ${near.name}` : 'Open field',
      forceA: a.name,
      forceB: b.name,
      playerInvolved: a.faction === PLAYER || b.faction === PLAYER,
      ambush: null,
    }
    // An army lying hidden in the woods strikes first.
    const hidA = this.isHidden(a)
    const hidB = this.isHidden(b)
    if (hidA !== hidB) {
      const amb = hidA ? a : b
      const victim = hidA ? b : a
      battle.ambush = { side: hidA ? 'A' : 'B', until: this.state.time + 10, power: 1.8 * this.traitsOf(amb).ambush }
      victim.morale = Math.max(0, victim.morale - 15)
      if (amb.faction === PLAYER || victim.faction === PLAYER) {
        this.log(amb.faction === PLAYER ? 'victory' : 'warning', 'Ambush!', `${amb.name} bursts from the trees upon ${victim.name}.`, battle.x, battle.z)
      }
    }
    a.hiddenSince = null
    b.hiddenSince = null
    this.state.battles.push(battle)
    for (const [army, other] of [[a, b], [b, a]] as const) {
      army.battleId = battle.id
      army.battleJoinedAt = this.state.time
      army.status = 'battle'
      army.heading = Math.atan2(other.z - army.z, other.x - army.x)
    }
    this.events.push({ type: 'battle_start', battleId: battle.id, x, z })
    const player = a.faction === PLAYER ? a : b.faction === PLAYER ? b : null
    if (player) {
      const foe = player === a ? b : a
      this.log('battle', `${player.name} engages ${foe.name}`, `${totalInt(player.troops)} against ${totalInt(foe.troops)} at ${battle.location}.`, x, z)
    }
  }

  private beginSiege(a: Army, c: Castle) {
    if (c.battleId) {
      const b = this.battle(c.battleId)
      if (b) {
        const team = this.team(a.faction)
        if (b.sideA.team === team) this.joinBattle(a, b, 'A')
        else if (b.sideB.team === team) this.joinBattle(a, b, 'B')
        return
      }
    }
    const battle: Battle = {
      id: this.newId('b'),
      kind: 'siege',
      x: c.x,
      z: c.z,
      castleId: c.id,
      sideA: { team: this.team(a.faction), armyIds: [a.id] },
      sideB: { team: this.team(c.faction), armyIds: [] },
      startedAt: this.state.time,
      lossesA: 0,
      lossesB: 0,
      initialA: total(a.troops),
      initialB: total(c.garrison),
      note: c.walls > 0 ? 'The walls hold' : 'Assault through the breach',
      location: c.name,
      forceA: a.name,
      forceB: `${c.name} garrison`,
      playerInvolved: a.faction === PLAYER || c.faction === PLAYER,
      ambush: null,
    }
    c.battleId = battle.id
    a.battleId = battle.id
    a.battleJoinedAt = this.state.time
    a.status = 'sieging'
    this.state.battles.push(battle)
    this.events.push({ type: 'battle_start', battleId: battle.id, x: c.x, z: c.z })
    if (a.faction === PLAYER) {
      this.log('battle', `Siege of ${c.name}`, `${a.name} invests the walls with ${totalInt(a.troops)} soldiers.`, c.x, c.z)
    } else if (c.faction === PLAYER) {
      this.log('warning', `${c.name} is under siege!`, `${a.name} of ${this.factionName(a.faction)} (${totalInt(a.troops)}) assaults the walls. Send relief!`, c.x, c.z)
    }
  }

  private joinBattle(a: Army, b: Battle, side: 'A' | 'B') {
    const s = side === 'A' ? b.sideA : b.sideB
    if (s.team !== this.team(a.faction)) return
    if (!s.armyIds.includes(a.id)) s.armyIds.push(a.id)
    if (side === 'A') b.initialA += total(a.troops)
    else b.initialB += total(a.troops)
    a.battleId = b.id
    a.battleJoinedAt = this.state.time
    a.status = b.kind === 'siege' && side === 'A' ? 'sieging' : 'battle'
    if (a.faction === PLAYER) {
      b.playerInvolved = true
      this.log('battle', `${a.name} joins the fight`, `Reinforcing at ${b.location}.`, b.x, b.z)
    }
  }

  private forcesOf(b: Battle, side: 'A' | 'B'): Force[] {
    const s = side === 'A' ? b.sideA : b.sideB
    const out: Force[] = []
    const t = this.state.time
    for (const id of s.armyIds) {
      const a = this.army(id)
      if (!a) continue
      const camp = b.kind === 'field' ? this.outpostAt(a.x, a.z, this.team(a.faction), OUTPOST.radius + 30) : undefined
      const fm = FORMATIONS[a.formation] ?? FORMATIONS.line
      out.push({
        troops: a.troops,
        cmd: this.commanderOf(a),
        level: this.commanderLevel(a),
        morale: a.morale,
        terrainDef: b.kind === 'field' ? this.world.defenseAt(a.x, a.z) * (camp ? OUTPOST_KINDS[camp.kind].defense : 1) : 1,
        // Palisades and walls break any charge against their defenders.
        formation: camp && OUTPOST_KINDS[camp.kind].braces ? { ...fm, bracesCharge: true } : fm,
        inColumn: a.column && t - a.battleJoinedAt < COLUMN.reformSeconds,
        sheltered: !!camp,
        traits: this.traitsOf(a),
        army: a,
        castle: null,
      })
    }
    if (b.kind === 'siege' && side === 'B') {
      const c = this.castle(b.castleId)
      if (c && this.team(c.faction) === s.team && total(c.garrison) >= 0.5) {
        out.push({
          troops: c.garrison,
          cmd: null,
          level: 1,
          morale: 85,
          terrainDef: c.walls > 0 ? 2.2 : 1.3,
          formation: FORMATIONS.line,
          inColumn: false,
          sheltered: true,
          traits: NO_TRAITS,
          army: null,
          castle: c,
        })
      }
    }
    return out
  }

  /**
   * Damage dealt by `attackers` to `defenders` over dt seconds.
   * Damage is tracked by source (melee, ranged, cavalry, charge) so each
   * defending formation can mitigate the part it is good against.
   */
  private resolveDamage(attackers: Force[], defenders: Force[], b: Battle, attackerSide: 'A' | 'B', dt: number): { cas: Troops[]; ranged: number } {
    const elapsed = this.state.time - b.startedAt
    const castle = b.kind === 'siege' ? this.castle(b.castleId) : null
    const wallsUp = !!castle && castle.walls > 0
    const defTotals: Troops = {}
    let defN = 0
    for (const f of defenders) {
      for (const k in f.troops) {
        if (f.troops[k] <= 0) continue
        defTotals[k] = (defTotals[k] ?? 0) + f.troops[k]
        defN += f.troops[k]
      }
    }
    const cas: Troops[] = defenders.map(() => ({}))
    if (defN <= 0) return { cas, ranged: 0 }
    const melee: Troops = {}
    const ranged: Troops = {}
    const cavalry: Troops = {}
    const charge: Troops = {}
    let rangedDmg = 0
    const chargeWindow = b.kind === 'field' && elapsed >= 6 && elapsed < 13
    const clim = this.climate()
    const ambushing = !!b.ambush && b.ambush.side === attackerSide && this.state.time < b.ambush.until
    for (const f of attackers) {
      const morale = 0.45 + clamp(f.morale, 0, 100) / 180
      const synergy = combinedArmsBonus(f.troops, this.units, f.cmd)
      const fm = f.formation
      for (const k in f.troops) {
        const n = f.troops[k]
        if (n <= 0) continue
        const u = this.units.get(k)
        if (!u) continue
        let m = n * u.attack * commanderMod(f.cmd, k, f.level) * morale * synergy
        m *= u.category === 'ranged' ? fm.rangedAttack * clim.ranged : fm.attack
        m *= (f.traits.units[k] ?? 1) * f.traits.attack
        if (b.kind === 'field' && elapsed < 12) m *= f.traits.opening
        if (ambushing) m *= b.ambush!.power
        if (f.inColumn) m *= COLUMN.attack
        let extra = 0
        if (b.kind === 'field') {
          if (elapsed < 6) m *= u.category === 'ranged' ? 1.8 : u.category === 'cavalry' ? 0.6 : 0.35
          else if (chargeWindow && !f.inColumn) {
            if (u.category === 'cavalry') extra = m * (0.5 * fm.charge + (fm.charge - 1))
            else if (u.category === 'infantry') extra = m * Math.max(0, 0.3 * (fm.charge - 1))
          }
        } else if (wallsUp) {
          if (attackerSide === 'A') m *= u.category === 'ranged' ? 0.6 : 0.3
          else m *= u.category === 'ranged' ? 1.6 : 0.45
        }
        if (u.category === 'ranged') rangedDmg += m
        const bucket = u.category === 'ranged' ? ranged : u.category === 'cavalry' ? cavalry : melee
        for (const j in defTotals) {
          const share = defTotals[j] / defN
          const ctr = u.counters[j] ?? 1
          bucket[j] = (bucket[j] ?? 0) + m * share * ctr
          if (extra > 0) charge[j] = (charge[j] ?? 0) + extra * share * ctr
        }
      }
    }
    for (const j in defTotals) {
      const u = this.units.get(j)
      if (!u) continue
      const k = (CASUALTY_K * dt) / u.defense
      defenders.forEach((f, idx) => {
        const n = f.troops[j] ?? 0
        if (n <= 0) return
        const share = n / defTotals[j]
        const fm = f.formation
        const dmg =
          (melee[j] ?? 0) +
          (ranged[j] ?? 0) * fm.rangedTaken +
          (cavalry[j] ?? 0) * fm.cavalryTaken +
          (charge[j] ?? 0) * (fm.bracesCharge ? 0 : fm.cavalryTaken)
        let killed = (dmg * k * share * fm.taken * (f.cmd?.defense_mod ?? 1) * f.traits.taken) / f.terrainDef
        if (f.inColumn) killed *= COLUMN.taken
        cas[idx][j] = Math.min(n, killed)
      })
    }
    return { cas, ranged: rangedDmg }
  }

  private updateBattle(b: Battle, dt: number) {
    const castle = b.kind === 'siege' ? (this.castle(b.castleId) ?? null) : null
    b.sideA.armyIds = b.sideA.armyIds.filter((id) => this.army(id)?.battleId === b.id)
    b.sideB.armyIds = b.sideB.armyIds.filter((id) => this.army(id)?.battleId === b.id)

    let A = this.forcesOf(b, 'A')
    let B = this.forcesOf(b, 'B')
    if (A.length === 0 || B.length === 0) {
      this.endBattle(b, A.length > 0 ? 'A' : 'B')
      return
    }

    this.arrangeBattle(b, castle, dt)

    if (castle && castle.walls > 0) {
      let sp = 0
      for (const f of A) sp += siegePower(f.troops, this.units, f.cmd) * f.traits.siege
      sp *= this.climate().siege
      const before = castle.walls
      castle.walls = Math.max(0, castle.walls - sp * WALL_K * dt)
      if (before > 0 && castle.walls <= 0) {
        b.note = 'The walls are breached!'
        if (castle.faction === PLAYER) this.log('warning', `${castle.name}'s walls are breached`, 'The enemy is pouring into the bailey.', castle.x, castle.z)
        else if (b.sideA.armyIds.some((id) => this.army(id)?.faction === PLAYER)) this.log('battle', `Breach at ${castle.name}`, 'Our troops storm through the broken walls.', castle.x, castle.z)
      }
    }

    const ra = this.resolveDamage(A, B, b, 'A', dt)
    const rb = this.resolveDamage(B, A, b, 'B', dt)
    const lossB = this.applyCasualties(B, ra.cas, A)
    const lossA = this.applyCasualties(A, rb.cas, B)
    b.lossesA += lossA
    b.lossesB += lossB

    let fx = this.battleFx.get(b.id)
    if (!fx) {
      fx = { accA: 0, accB: 0, rangedA: 0, rangedB: 0, nextEmit: this.state.time }
      this.battleFx.set(b.id, fx)
    }
    fx.accA += lossA
    fx.accB += lossB
    fx.rangedA += ra.ranged
    fx.rangedB += rb.ranged
    if (this.state.time >= fx.nextEmit) {
      fx.nextEmit = this.state.time + 0.6
      const posA = this.sideCentroid(b, 'A')
      const posB = this.sideCentroid(b, 'B')
      if (fx.accA >= 0.5) this.events.push({ type: 'hit', x: posA[0], z: posA[1], amount: fx.accA, team: b.sideA.team, ranged: fx.rangedB > fx.rangedA })
      if (fx.accB >= 0.5) this.events.push({ type: 'hit', x: posB[0], z: posB[1], amount: fx.accB, team: b.sideB.team, ranged: fx.rangedA > fx.rangedB })
      fx.accA = fx.accB = fx.rangedA = fx.rangedB = 0
    }

    const pA = A.reduce((s, f) => s + power(f.troops, this.units, f.cmd, f.level), 0)
    const pB = B.reduce((s, f) => s + power(f.troops, this.units, f.cmd, f.level) * (f.castle ? (castle && castle.walls > 0 ? 1.8 : 1.2) : 1), 0)
    this.updateMorale(A, lossA, pA / Math.max(1, pB), dt)
    this.updateMorale(B, lossB, pB / Math.max(1, pA), dt)
    if (b.kind === 'field') {
      const ratio = pA / Math.max(1, pB)
      b.note = ratio > 1.6 ? `${b.forceA} is overwhelming the enemy` : ratio < 0.62 ? `${b.forceB} is overwhelming the enemy` : 'The lines grind against each other'
    }

    for (const side of ['A', 'B'] as const) {
      const forces = side === 'A' ? A : B
      const enemies = side === 'A' ? B : A
      for (const f of forces) {
        const a = f.army
        if (!a) continue
        const n = total(a.troops)
        if (n < 8 || a.morale <= 0) {
          this.destroyArmy(a, 'was cut down to the last')
          continue
        }
        if (n <= a.initialTotal * (1 - a.retreatAt) || a.morale <= 15) {
          this.applyPursuit(a, enemies)
          if (total(a.troops) < 8) this.destroyArmy(a, 'was annihilated in the rout')
          else this.withdraw(a, true)
        }
      }
    }

    A = this.forcesOf(b, 'A')
    B = this.forcesOf(b, 'B')
    if (A.length === 0 || B.length === 0) this.endBattle(b, A.length > 0 ? 'A' : 'B')
  }

  private sideCentroid(b: Battle, side: 'A' | 'B'): [number, number] {
    const ids = side === 'A' ? b.sideA.armyIds : b.sideB.armyIds
    let x = 0
    let z = 0
    let n = 0
    for (const id of ids) {
      const a = this.army(id)
      if (!a) continue
      x += a.x
      z += a.z
      n++
    }
    if (n === 0) return [b.x, b.z]
    return [x / n, z / n]
  }

  private arrangeBattle(b: Battle, castle: Castle | null, dt: number) {
    const slide = 18 * dt
    const place = (a: Army, tx: number, tz: number, faceX: number, faceZ: number) => {
      const dx = tx - a.x
      const dz = tz - a.z
      const d = Math.hypot(dx, dz)
      if (d > 0.5) {
        const s = Math.min(d, slide)
        a.x += (dx / d) * s
        a.z += (dz / d) * s
      }
      a.heading = Math.atan2(faceZ - a.z, faceX - a.x)
    }
    if (castle) {
      const R = castleRadius(castle.tier) + 26
      for (const id of [...b.sideA.armyIds, ...b.sideB.armyIds]) {
        const a = this.army(id)
        if (!a) continue
        let ang = Math.atan2(a.z - castle.z, a.x - castle.x)
        if (!Number.isFinite(ang)) ang = 0
        place(a, castle.x + Math.cos(ang) * R, castle.z + Math.sin(ang) * R, castle.x, castle.z)
      }
      return
    }
    const [ax, az] = this.sideCentroid(b, 'A')
    const [bx, bz] = this.sideCentroid(b, 'B')
    let dx = bx - ax
    let dz = bz - az
    const d = Math.hypot(dx, dz) || 1
    dx /= d
    dz /= d
    const px = -dz
    const pz = dx
    for (const side of ['A', 'B'] as const) {
      const ids = side === 'A' ? b.sideA.armyIds : b.sideB.armyIds
      const sign = side === 'A' ? -1 : 1
      ids.forEach((id, k) => {
        const a = this.army(id)
        if (!a) return
        const off = (k - (ids.length - 1) / 2) * 58
        const tx = b.x + dx * 21 * sign + px * off
        const tz = b.z + dz * 21 * sign + pz * off
        place(a, tx, tz, tx - dx * sign * 100, tz - dz * sign * 100)
      })
    }
  }

  private applyCasualties(forces: Force[], cas: Troops[], enemies: Force[]): number {
    let sum = 0
    forces.forEach((f, idx) => {
      for (const k in cas[idx]) {
        const c = Math.min(f.troops[k] ?? 0, cas[idx][k])
        f.troops[k] -= c
        sum += c
      }
    })
    const enemyN = enemies.reduce((s, f) => s + total(f.troops), 0) || 1
    for (const e of enemies) {
      const share = (sum * total(e.troops)) / enemyN
      if (e.army) e.army.kills += share
      const fid = e.army?.faction ?? e.castle?.faction
      if (fid) this.credit(fid).kills += share
    }
    return sum
  }

  private updateMorale(forces: Force[], losses: number, powerRatio: number, dt: number) {
    const n = forces.reduce((s, f) => s + total(f.troops), 0) || 1
    const lossFrac = losses / n
    for (const f of forces) {
      if (!f.army) continue
      const steady = 1 - clamp((f.cmd?.morale_bonus ?? 0) / 120, 0, 0.4)
      let drop = lossFrac * 120 * steady
      if (powerRatio < 0.45) drop += 1.6 * dt * steady
      else if (powerRatio > 2) drop -= 0.6 * dt
      if (f.sheltered && drop > 0) drop *= OUTPOST.steadiness
      f.army.morale = clamp(f.army.morale - drop, 0, 100)
    }
  }

  private applyPursuit(a: Army, enemies: Force[]) {
    let pursuit = 0
    for (const f of enemies) {
      for (const k in f.troops) pursuit += f.troops[k] * (this.units.get(k)?.pursuit ?? 0) * commanderMod(f.cmd, k, f.level) * f.traits.pursuit
    }
    const n = total(a.troops)
    const lost = Math.min(n * 0.35, pursuit * 0.12)
    if (lost > 0) {
      a.troops = scaleTroops(a.troops, (n - lost) / n)
      if (a.faction === PLAYER) this.state.stats.playerLost += lost
      else if (enemies.some((e) => e.army?.faction === PLAYER)) this.state.stats.enemyKilled += lost
    }
  }

  /** Leave combat; routed armies fall back to the nearest friendly castle. */
  private withdraw(a: Army, routed: boolean) {
    const b = this.battle(a.battleId)
    if (b) {
      b.sideA.armyIds = b.sideA.armyIds.filter((id) => id !== a.id)
      b.sideB.armyIds = b.sideB.armyIds.filter((id) => id !== a.id)
    }
    a.battleId = null
    a.routedAt = this.state.time
    if (!routed) {
      a.status = 'idle'
      return
    }
    a.status = 'retreating'
    a.path = []
    a.pathTarget = null
    const home = this.nearestCastle(a.x, a.z, a.faction)
    if (home) a.homeCastleId = home.id
    if (a.faction === PLAYER) {
      this.log('retreat', `${a.name} is falling back`, `Retreating with ${totalInt(a.troops)} survivors.`, a.x, a.z)
    } else if (b?.playerInvolved && this.isHostile(a.faction, PLAYER)) {
      this.log('victory', `${a.name} breaks and flees`, `The enemy retreats with ${totalInt(a.troops)} men.`, a.x, a.z)
    }
  }

  private destroyArmy(a: Army, how: string) {
    if (a.commanderKey) {
      const s = this.state.commanders[a.commanderKey]
      if (s) s.woundedUntil = this.state.time + 120
    }
    const b = this.battle(a.battleId)
    if (a.faction === PLAYER) {
      this.state.stats.playerLost += total(a.troops)
      this.log('defeat', `${a.name} is destroyed`, a.commanderKey ? `The army ${how}. ${this.armyLeader(a)} is carried from the field wounded.` : `The army ${how}.`, a.x, a.z)
    } else if (b?.playerInvolved && this.isHostile(a.faction, PLAYER)) {
      this.state.stats.enemyKilled += total(a.troops)
      this.log('victory', `${a.name} is annihilated`, `${this.armyLeader(a)}'s force ${how}.`, a.x, a.z)
    }
    this.removeArmy(a)
  }

  private endBattle(b: Battle, winner: 'A' | 'B') {
    this.state.battles = this.state.battles.filter((x) => x.id !== b.id)
    this.battleFx.delete(b.id)
    const castle = b.kind === 'siege' ? this.castle(b.castleId) : undefined
    if (castle && castle.battleId === b.id) castle.battleId = null
    const winSide = winner === 'A' ? b.sideA : b.sideB
    const winners = winSide.armyIds.map((id) => this.army(id)).filter((a): a is Army => !!a)
    let captured = false

    if (castle && winner === 'A' && this.team(castle.faction) !== b.sideA.team && total(castle.garrison) < 0.5 && winners.length > 0) {
      captured = true
      this.captureCastle(castle, winners)
    }
    for (const a of winners) {
      a.battleId = null
      a.status = 'idle'
      a.morale = Math.min(100, a.morale + 8)
      a.path = []
      a.pathTarget = null
      if (captured && castle) a.order = { type: 'station', castleId: castle.id }
      this.grantXp(a)
    }

    if (!b.playerInvolved) return
    // Which side is "ours" (the player's team)?
    const playerSide = b.sideA.team === 'A' ? 'A' : b.sideB.team === 'A' ? 'B' : null
    if (!playerSide) return
    const playerWon = playerSide === winner
    const pLoss = Math.round(playerSide === 'A' ? b.lossesA : b.lossesB)
    const eLoss = Math.round(playerSide === 'A' ? b.lossesB : b.lossesA)
    this.state.stats.playerLost += pLoss
    this.state.stats.enemyKilled += eLoss
    if (playerWon) this.state.stats.battlesWon++
    else this.state.stats.battlesLost++
    let outcome: BattleReportPayload['outcome']
    if (castle) {
      if (playerSide === 'A') outcome = captured ? 'captured' : playerWon ? 'victory' : 'withdrew'
      else outcome = playerWon ? 'victory' : this.team(castle.faction) !== 'A' ? 'lost' : 'defeat'
    } else {
      outcome = playerWon ? 'victory' : 'defeat'
    }
    if (!captured && castle && playerSide === 'B' && playerWon) {
      this.log('victory', `The siege of ${castle.name} is broken`, `The defenders held. Enemy losses: ${eLoss}.`, castle.x, castle.z)
    } else if (!castle) {
      this.log(playerWon ? 'victory' : 'defeat', playerWon ? `Victory at ${b.location}` : `Defeat at ${b.location}`, `Our losses ${pLoss}, enemy losses ${eLoss}.`, b.x, b.z)
    } else if (!captured && playerSide === 'A' && !playerWon) {
      this.log('defeat', `The siege of ${castle.name} has failed`, `Our losses ${pLoss}, enemy losses ${eLoss}.`, castle.x, castle.z)
    }
    this.events.push({
      type: 'battle_end',
      report: {
        game_time: Math.round(this.state.time * 10) / 10,
        location: b.location,
        kind: b.kind,
        outcome,
        player_force: playerSide === 'A' ? b.forceA : b.forceB,
        enemy_force: playerSide === 'A' ? b.forceB : b.forceA,
        player_losses: pLoss,
        enemy_losses: eLoss,
        details: { duration: Math.round(this.state.time - b.startedAt), initialPlayer: Math.round(playerSide === 'A' ? b.initialA : b.initialB), initialEnemy: Math.round(playerSide === 'A' ? b.initialB : b.initialA) },
      },
    })
    this.notify()
  }

  private grantXp(a: Army) {
    if (!a.commanderKey) return
    const s = this.state.commanders[a.commanderKey]
    if (!s) return
    s.xp += a.kills / 6
    a.kills = 0
    while (s.level < 5 && s.xp >= s.level * 100) {
      s.xp -= s.level * 100
      s.level++
      const def = this.commanders.get(a.commanderKey)
      const pool = TRAITS.filter((t) => !s.traits.includes(t.key)).map((t) => t.key)
      const shuffled = pool.sort(() => Math.random() - 0.5)
      if (s.owner === PLAYER && def) {
        s.traitChoices = shuffled.slice(0, 3)
        this.log('info', `${def.name} gains renown`, `Rank ${s.level}. Choose a new trait for ${def.name}.`)
      } else if (shuffled[0]) s.traits.push(shuffled[0])
    }
  }

  private captureCastle(c: Castle, winners: Army[]) {
    const prev = c.faction
    const main = [...winners].sort((x, y) => total(y.troops) - total(x.troops))[0]
    const captor = main.faction
    c.faction = captor
    c.lastCapturedAt = this.state.time
    c.walls = Math.round(c.maxWalls * 0.25)
    c.manpower = Math.min(c.manpower, maxManpowerForTier(c.tier) * 0.3)
    c.autoRecruit = null
    c.garrison = emptyTroops(this.unitList)
    const left = floorTroops(scaleTroops(main.troops, 0.2))
    for (const k in left) {
      main.troops[k] -= left[k]
      c.garrison[k] = left[k]
    }
    this.events.push({ type: 'captured', castleId: c.id, faction: captor })
    this.credit(captor).captures++
    const prevRel = this.relation(prev)
    if (captor === PLAYER) {
      this.state.stats.castlesTaken++
      this.log('capture', `${c.name} is ours!`, `Our banner flies over ${c.name}. Income +${incomeForTier(c.tier).toFixed(1)}/s.`, c.x, c.z)
    } else if (prev === PLAYER) {
      this.log('lost', `${c.name} has fallen`, `${this.factionName(captor)} has taken ${c.name}.`, c.x, c.z)
    } else if (this.team(captor) === 'A') {
      this.log('ally', `${this.factionName(captor)} takes ${c.name}`, `An allied victory${prevRel === 'enemy' ? ` over ${this.factionName(prev)}` : ''}.`, c.x, c.z)
    } else if (prevRel === 'ally') {
      this.log('ally', `${c.name} falls to ${this.factionName(captor)}`, `${this.factionName(prev)} has lost a castle.`, c.x, c.z)
    }
    this.ais.get(prev)?.onCastleLost(c)
    // Eliminate factions that hold nothing.
    const pf = this.state.factions[prev]
    if (pf && pf.team !== 'N' && !this.state.castles.some((x) => x.faction === prev)) {
      pf.alive = false
      if (prev !== PLAYER) {
        const kind: ChronicleKind = pf.team === 'A' ? 'ally' : 'victory'
        this.log(kind, `${pf.name} is destroyed`, pf.team === 'A' ? 'An ally has been wiped from the map.' : 'An enemy realm has fallen.', c.x, c.z)
      }
    }
    if (pf && pf.capitalId === c.id) {
      const next = this.state.castles.find((x) => x.faction === prev)
      pf.capitalId = next?.id ?? null
    }
  }

  /** Siege mode: towers, gatehouses and the keep shoot at enemies in range. */
  private towerFire() {
    // Watchtower outposts in every mode.
    for (const o of this.state.outposts) {
      const k = OUTPOST_KINDS[o.kind]
      if (!k.fireRange || o.progress < 1) continue
      let target: Army | null = null
      let best = k.fireRange
      for (const a of this.state.armies) {
        if (!this.isHostile(a.faction, o.faction) || a.status === 'retreating') continue
        const d = Math.hypot(a.x - o.x, a.z - o.z)
        if (d < best) {
          best = d
          target = a
        }
      }
      if (!target) continue
      const n = total(target.troops)
      const lost = Math.min(n, 0.9 * this.climate().ranged)
      target.troops = scaleTroops(target.troops, (n - lost) / Math.max(1, n))
      this.events.push({ type: 'hit', x: target.x, z: target.z, amount: lost, team: this.team(target.faction), ranged: true })
    }
    // Siege mode: towers, gatehouses and the citadel shoot back.
    if (this.state.rules.mode !== 'siege') return
    for (const c of this.state.castles) {
      if (!(c.tower || c.gate || c.capital)) continue
      const archers = c.garrison.archers ?? 0
      if (archers < 1) continue
      let target: Army | null = null
      let best = 210
      for (const a of this.state.armies) {
        if (!this.isHostile(a.faction, c.faction) || a.status === 'retreating') continue
        const d = Math.hypot(a.x - c.x, a.z - c.z)
        if (d < best) {
          best = d
          target = a
        }
      }
      if (!target) continue
      const n = total(target.troops)
      const lost = Math.min(n, archers * 0.012 * (c.walls > 0 ? 1 : 0.5) * this.climate().ranged)
      if (lost <= 0 || n <= 0) continue
      target.troops = scaleTroops(target.troops, (n - lost) / n)
      target.morale = Math.max(0, target.morale - (lost / n) * 40)
      this.credit(c.faction).kills += lost
      this.events.push({ type: 'hit', x: target.x, z: target.z, amount: lost, team: this.team(target.faction), ranged: true })
      if (total(target.troops) < 8) this.destroyArmy(target, 'was shot to pieces beneath the walls')
    }
  }

  /** Siege: the player has read the briefing; the battle begins. */
  confirmBriefing() {
    this.state.rules.deployPending = false
    this.notify()
  }

  private checkEnd() {
    const r = this.state.rules
    let status: 'victory' | 'defeat' | null = null
    if (r.timeLimit && this.state.time >= r.timeLimit) status = r.timeoutWinner === 'A' ? 'victory' : 'defeat'
    const lost = r.defeatCastles.some((id) => {
      const c = this.castle(id)
      return c && this.team(c.faction) !== 'A'
    })
    const eliminated = r.defeatOnEliminated && !this.state.castles.some((c) => c.faction === PLAYER) && !this.state.armies.some((a) => a.faction === PLAYER)
    const won = r.victoryCastles.length > 0 && r.victoryCastles.every((id) => {
      const c = this.castle(id)
      return c && this.team(c.faction) === 'A'
    })
    if (status) {
      // Time ran out.
    } else if (lost || eliminated) status = 'defeat'
    else if (won) status = 'victory'
    if (status) {
      this.state.status = status
      this.events.push({ type: 'game_over', status })
      this.notify()
    }
  }

  // -------------------------------------------------------------------------
  // Vision (fog of war) — shared across the player's alliance
  // -------------------------------------------------------------------------

  updateVision() {
    const vis = this.vision
    const R = this.visRes
    if (!FOG_OF_WAR) {
      if (this.visionVersion === 0) {
        vis.fill(1)
        this.explored.fill(1)
        this.visionTex.fill(255)
        this.visionVersion++
      }
      return
    }
    vis.fill(0)
    const cell = this.world.size / R
    const half = this.world.half
    const stamp = (x: number, z: number, r: number) => {
      const ci = (x + half) / cell
      const cj = (z + half) / cell
      const rc = r / cell
      const i0 = Math.max(0, Math.floor(ci - rc))
      const i1 = Math.min(R - 1, Math.ceil(ci + rc))
      const j0 = Math.max(0, Math.floor(cj - rc))
      const j1 = Math.min(R - 1, Math.ceil(cj + rc))
      const r2 = rc * rc
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i + 0.5 - ci
          const dz = j + 0.5 - cj
          if (dx * dx + dz * dz <= r2) vis[j * R + i] = 1
        }
      }
    }
    for (const c of this.state.castles) {
      const rel = this.relation(c.faction)
      if (rel === 'self') stamp(c.x, c.z, 250 + c.tier * 45)
      else if (rel === 'ally') stamp(c.x, c.z, 200 + c.tier * 30)
    }
    for (const a of this.state.armies) {
      const rel = this.relation(a.faction)
      if (rel === 'self') stamp(a.x, a.z, visionRadius(a.troops, this.units, this.commanderOf(a)))
      else if (rel === 'ally') stamp(a.x, a.z, 180)
    }
    for (const b of this.state.battles) if (b.playerInvolved) stamp(b.x, b.z, 160)
    const tex = this.visionTex
    for (let k = 0; k < vis.length; k++) {
      if (vis[k]) this.explored[k] = 1
      tex[k] = vis[k] ? 255 : this.explored[k] ? 105 : 0
    }
    if (this.blurTmp.length !== tex.length) this.blurTmp = new Uint8Array(tex.length)
    blur(tex, R, this.blurTmp)
    blur(tex, R, this.blurTmp)
    this.visionVersion++
  }
}

/** Separable 3x3 box blur, so fog-of-war edges are soft instead of stair-stepped. */
function blur(src: Uint8Array, R: number, tmp: Uint8Array) {
  for (let j = 0; j < R; j++) {
    const row = j * R
    for (let i = 0; i < R; i++) {
      const a = src[row + Math.max(0, i - 1)]
      const b = src[row + i]
      const c = src[row + Math.min(R - 1, i + 1)]
      tmp[row + i] = (a + b * 2 + c) >> 2
    }
  }
  for (let j = 0; j < R; j++) {
    const up = Math.max(0, j - 1) * R
    const row = j * R
    const dn = Math.min(R - 1, j + 1) * R
    for (let i = 0; i < R; i++) src[row + i] = (tmp[up + i] + tmp[row + i] * 2 + tmp[dn + i]) >> 2
  }
}

function outpostSupply(o: { kind: OutpostKind }) {
  return OUTPOST_KINDS[o.kind].supply
}

function encodeBits(bits: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function decodeBits(b64: string, out: Uint8Array) {
  try {
    const s = atob(b64)
    for (let i = 0; i < out.length; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1
  } catch {
    // Corrupt or missing data: start unexplored.
  }
}
