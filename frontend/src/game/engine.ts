import { FactionAI } from './ai'
import { generateCountryside, RESOURCE, RESOURCE_STOCK } from './countryside'
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
  HoldingKind,
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
  GameMode,
  MapSize,
  Outpost,
  Obstacle,
  Convoy,
  WorkJob,
  Scenario,
  Team,
  Troops,
  UnitType,
} from './types'
import { World, holdingRadius, wallRadius, type BridgeInfo } from './world'

export const TICK = 0.1
const ENGAGE_DIST = 46
const JOIN_DIST = 110
const CASUALTY_K = 0.026
export const WALL_K = 0.12
const FIELD_UPKEEP = 0.004
/** The whole map is visible: planning and reading the war matter more than scouting. */
/**
 * No fog over the map: land, holdings, wagons and armies are visible to everyone.
 * What stays hidden is local: troops lying hidden (woods, lodges) are invisible to
 * the other side, player and AI alike, until someone comes close (see canSee).
 */
export const FOG_OF_WAR = false
export const PLAYER = 'player'
export const NEUTRAL = 'neutral'
const HIDE_SECONDS = 8

/** Supply depots: quarters, stores and the wagon trains that keep them full. */
export const DEPOT = {
  capacity: 900,
  stockMax: 100,
  /** Stores used per second, plus a little per soldier drawing on them. */
  drainBase: 0.22,
  drainPerSoldier: 0.00035,
  convoyEvery: 35,
  cargo: 40,
  speed: 34,
  /** Wagons only set out from castles within this distance. */
  reach: 2600,
  /** An enemy army this close to a wagon train seizes it. */
  seizeDist: 42,
  /** Quartered troops march out to meet enemies this close. */
  alarmDist: 170,
}

/** Engineers' field works: obstacles, traps and simple bridges. */
export const WORKS: Record<WorkJob, { name: string; cost: number; engineers: number; seconds: number; description: string }> = {
  stakes: { name: 'Spike stakes', cost: 90, engineers: 10, seconds: 8, description: 'Rows of sharpened stakes. Charges against troops standing among them fail.' },
  pit: { name: 'Mud pit & caltrops', cost: 100, engineers: 10, seconds: 8, description: 'A hidden trap: enemies only see it within 100m. Whoever blunders in is slowed to a crawl, cannot charge and takes 20% more losses.' },
  barricade: { name: 'Road barricade', cost: 80, engineers: 10, seconds: 10, description: 'Logs and carts across the way. Enemy wagons cannot pass; enemy armies are held about 12 seconds hacking through. Friends pass freely.' },
  pitch: { name: 'Pitch barrels', cost: 150, engineers: 15, seconds: 10, description: 'Buried barrels that burst into flame under the first enemy to step on them: few deaths, but a sharp blow to morale. Hidden; one use.' },
  bridge: { name: 'Build a bridge', cost: 250, engineers: 15, seconds: 40, description: 'A simple timber bridge across the river here. Anyone may cross it, and enemy engineers can pull it down.' },
  demolish: { name: 'Demolish the bridge', cost: 0, engineers: 10, seconds: 15, description: 'Pull down an engineers\' bridge. The river\'s fords cannot be destroyed.' },
  tower: { name: 'Siege tower', cost: 220, engineers: 15, seconds: 20, description: 'A wheeled belfry that goes with the army (0.65x pace). At a castle its bridge drops onto the walls: from the first moment the stormers fight at full strength and the defenders lose their wall bonus. Enemy horse can burn it in the field.' },
  ram: { name: 'Tortoise ram', cost: 180, engineers: 15, seconds: 15, description: 'A roofed ram that goes with the army (0.85x pace). Batters walls 3x faster, shrugs off 40% of the arrows while it works, and the breach breaks the garrison\'s nerve (morale -25).' },
  mantlet: { name: 'Mantlet wagons', cost: 100, engineers: 10, seconds: 10, description: 'Wheeled timber shields pushed ahead of the ranks (0.85x pace): arrows do half the harm, in the field and before the walls.' },
  trebuchet: { name: 'Field trebuchet', cost: 250, engineers: 20, seconds: 25, description: 'Set up where the army stands. While troops of yours stay by it, it hurls a stone every 4 s at enemy walls, outposts or armies within 450m. Enemies who reach it unguarded wreck it.' },
}
/** Siege engines: how they slow the army, and their effects. */
export const ENGINES = { towerPace: 0.65, ramPace: 0.85, mantletPace: 0.85, ramSiege: 3, ramArrows: 0.6, ramShock: 25, mantletArrows: 0.5, trebRange: 450, trebWalls: 90, trebMax: 2 }
export const OBSTACLE = {
  stakes: { radius: 65, life: 420 },
  pit: { radius: 70, life: 300, slow: 0.35, taken: 1.2 },
  barricade: { radius: 42, life: 600, hp: 12 },
  pitch: { radius: 60, life: 600, blast: 120, morale: 18, losses: 0.05 },
  trebuchet: { radius: 30, life: 1e9 },
  /** Hidden traps show to an enemy army only this close. */
  reveal: 100,
  maxPerFaction: 6,
  /** Engineers' bridges a realm may have standing at once. */
  maxBridges: 4,
  /** Widest river engineers can span. */
  maxSpan: 300,
}
/** Sapping: 15+ engineers in a siege undermine the walls, stopping their repair for this long. */
export const SAPPING = { engineers: 15, seconds: 180 }

/**
 * Kinds of small holding. All are won over with envoys (or plundered) and then
 * run themselves; each pays its lord in its own way.
 */
export const HOLDINGS: Record<HoldingKind, {
  name: string
  icon: string
  blurb: string
  /** Negotiation price multiplier. */
  price: number
  /** Gold per second owed to the lord, by tier (shipped every `every` seconds). */
  tribute: number[]
  every: number
  /** Militia cap by tier, and its make-up. */
  militia: number[]
  mix: { infantry: number; cavalry: number; archers: number }
  /** Loot when plundered: [min, max]; and the infamy it costs. */
  loot: [number, number]
  infamy: number
}> = {
  village: { name: 'Village', icon: '🏘', blurb: 'Pays tribute by wagon every 45 seconds.', price: 1, tribute: [0, 4, 5.5], every: 45, militia: [0, 320, 520], mix: { infantry: 0.65, cavalry: 0, archers: 0.35 }, loot: [350, 600], infamy: 1 },
  caravanserai: { name: 'Caravanserai', icon: '🐪', blurb: 'A great trade wagon every 90 seconds (320 gold, 480 walled); your wagons within 600m roll 1.5x faster.', price: 1.4, tribute: [0, 320 / 90, 480 / 90], every: 90, militia: [0, 300, 480], mix: { infantry: 0.5, cavalry: 0.2, archers: 0.3 }, loot: [700, 950], infamy: 1 },
  abbey: { name: 'Abbey', icon: '⛪', blurb: 'No gold: every 45 seconds 50 volunteers (90 walled) for your nearest castle; commanders heal 25% faster (40% walled); every 3 minutes a point of infamy is forgiven. Plundering it costs 2 infamy.', price: 1.2, tribute: [0, 0, 0], every: 45, militia: [0, 260, 420], mix: { infantry: 0.6, cavalry: 0, archers: 0.4 }, loot: [300, 450], infamy: 2 },
  keep: { name: "Wardens' keep", icon: '🛡', blurb: 'No gold: a strong, horse-heavy garrison (400, 650 walled) that rides out on its own against scouts, wagons and raiding parties of up to 150 within 800m.', price: 1.3, tribute: [0, 0, 0], every: 45, militia: [0, 400, 650], mix: { infantry: 0.4, cavalry: 0.4, archers: 0.2 }, loot: [350, 550], infamy: 1 },
  guildhall: { name: 'Siege guildhall', icon: '⚒', blurb: 'No gold: engineers cost 18 (15 walled), outposts and castle upgrades 15% less (25% walled), and all your castle walls mend 1.5x faster.', price: 1.3, tribute: [0, 0, 0], every: 45, militia: [0, 280, 460], mix: { infantry: 0.6, cavalry: 0, archers: 0.4 }, loot: [400, 600], infamy: 1 },
}
export const HOLDING_EFFECTS = {
  caravanAura: 600,
  caravanSpeed: 1.5,
  abbeyManpower: [0, 50, 90],
  abbeyWounds: [0, 0.25, 0.4],
  abbeyCleanse: 180,
  keepPatrol: 800,
  keepBand: 150,
  keepPrey: 150,
  guildEngineer: [25, 18, 15],
  guildDiscount: [0, 0.15, 0.25],
  guildWalls: 1.5,
}

/** Villages: small holdings won by negotiation (or plundered). Index by tier: 1 = palisade, 2 = stone wall. */
export const VILLAGE = {
  capacity: [0, 320, 520] as number[],
  /** Gold per second a vassal village owes its lord, shipped in wagons. */
  income: [0, 4, 5.5] as number[],
  /** Militia a vassal village raises for itself, per second, up to its capacity. */
  militiaRegen: [0, 0.35, 0.55] as number[],
  /** Free villages rebuild their militia up to this many. */
  freeMilitia: 220,
  tributeEvery: 45,
  /** A vassal village raises stone walls on its own this long after it joins. */
  stoneAfter: 300,
  /** It sends militia to a besieged castle of its lord within this distance. */
  reliefReach: 1000,
  reliefMin: 90,
  walls: [0, 260, 700] as number[],
  manpower: 220,
  manpowerRegen: 0.9,
  stoneWallCost: 650,
  /** Envoys need one of your armies within this distance, or a castle of yours nearby. */
  envoyArmyReach: 420,
  envoyCastleReach: 1100,
}

/** Terrain features (see TerrainFeature): their effects in battle and on the march. */
export const FEATURES = {
  cragParty: 50,
  cragSight: 2.2,
  stonesTaken: 0.8,
  thicketArrows: 0.6,
  terraceRanged: 1.15,
  terraceDefense: 1.15,
  terraceCharge: 0.5,
  bogCavalry: 0.7,
}
/** What each terrain feature does, for the panels and help. */
export const FEATURE_INFO: Record<string, { name: string; effect: string }> = {
  stones: { name: 'Standing stones', effect: 'Charges fail here; 20% fewer losses to blades and arrows; a little slow.' },
  terraces: { name: 'Terraced slopes', effect: 'Archers here shoot 15% harder and everyone takes 15% less; charges against them lose half their force; 0.8x pace.' },
  thicket: { name: 'Windfall thicket', effect: 'Horses barely pass (0.2x), foot 0.7x; arrows do 40% less; troops waiting hide in 5 s.' },
  wadi: { name: 'Dry wadi', effect: 'Troops down in the ravine are hidden from anyone more than 200m away, even on the move.' },
  crag: { name: 'Crag overlook', effect: 'A party of 50 or fewer on top sees 2.2x as far: hidden troops and exact numbers.' },
}

/** How far each side sees enemy armies (castles and holdings are always known). */
export const SIGHT = { army: 600, castle: 800, holding: 500, outpost: 600, tower: 900 }

/**
 * The Sovereign and the Royal Guard: knights brought from the homeland, who
 * can never be replaced. Their presence steadies every army near them.
 */
export const ROYAL = {
  key: 'sovereign',
  guard: 520,
  attack: 1.2, // 2.4 against an ordinary knight's 2.0
  taken: 0.68, // defence 2.2 against 1.5
  speed: 1.75 / 1.7,
  retreatAt: 0.3,
  aura: 350,
  auraAttack: 1.15,
  auraTaken: 0.9,
  auraMorale: 0.6,
  charisma: 1.3,
  envoy: 0.15,
  flight: 1.3,
}

/** Hidden troops: how close the other side must come to find them. */
export const STEALTH = { uncover: 200, towerUncover: 400 }

/** Calls for aid: allies send men to stand in a threatened castle. */
export const AID = {
  /** A call lapses after this long, whatever happens. */
  duration: 300,
  /** Per castle, before it can call again. */
  cooldown: 180,
  /** Calls one lord may have open at once. */
  maxActive: 2,
  /** Allies answer only from a castle this close (grows with the map). */
  reach: 1500,
  /** Helpers stay at least this long, then go home once it has been quiet for `quiet` seconds. */
  minStay: 60,
  quiet: 40,
  /** An enemy army this close counts as danger. */
  threat: 1000,
}

/** Scouting: small parties spy out enemy positions; anyone who spots them sends riders after them. */
export const SCOUT = {
  maxSize: 80,
  arrive: 140,
  deliver: 260,
  /** Everything hostile within this distance of the scouts goes into the report. */
  sight: 480,
  /** Hidden armies are only found this close. */
  uncover: 170,
  /** Spotting ranges. */
  spotArmy: 300,
  spotCastle: 420,
  spotOutpost: 380,
  spotTower: 520,
  /** Chance per second that an observer in range spots the scouts. */
  spotChance: 0.065,
  pursuitMin: 20,
  pursuitGiveUp: 110,
  /** Reports count as fresh for this long, then fade. */
  fresh: 300,
  /** Being this close to one of our armies or castles shows the enemy exactly. */
  closeSight: 450,
}

/** Top realm rank per map size, and how far past its starting strength a realm must grow to reach the rank below the top. */
const RANK_MAX: Record<MapSize, number> = { small: 5, medium: 6, large: 7 }
const RANK_REACH: Record<GameMode, Record<MapSize, number>> = {
  campaign: { small: 2.6, medium: 2.6, large: 2.6 },
  survival: { small: 3.8, medium: 3.8, large: 4.4 },
  alliance: { small: 2.8, medium: 2.8, large: 3.0 },
}

/** Rear attacks: joining a fight already under way from behind the enemy line. */
export const REAR = {
  /** The front must have been locked this long. */
  minElapsed: 5,
  /** Angle test: cos of the angle between our line and us, seen from the enemy (< -0.34 ≈ beyond 110°). */
  cosine: -0.34,
  seconds: 8,
  /** Damage multiplier while the rear attack lasts. */
  attack: 1.25,
  moraleShock: 12,
}

/** Forward outposts (see outposts.ts for the kinds). */
export const OUTPOST = {
  /** Must be this far from the edge of any castle. */
  /** Distance an outpost must keep from a castle's walls (villages need far less room). */
  castleClearance: 90,
  villageClearance: 50,
  spacing: 270,
  maxPerFaction: 5,
  /** Friendly armies within this radius fight from behind the defences. */
  radius: 130,
  razeSeconds: 20,
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
  /** Attacking from behind an enemy already locked in combat. */
  flank: boolean
  /** Bogged in a mud pit or wading a ford: cannot charge, takes more losses. */
  mired?: boolean
  /** The Royal Guard itself; and armies within the Sovereign's presence. */
  royal?: boolean
  presence?: boolean
  /** Archers shooting from inside a wagon laager. */
  campArchers?: number
  /** The ground it fights on (terrain features): multipliers on what it takes and deals. */
  ground?: { melee: number; ranged: number; charge: number; rangedOut: number; cavOut: number; noCharge: boolean }
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
  /** Castle spacing relative to the original maps (scales the AI's sense of 'near' and 'far'). */
  spread = 1
  /** Reach of envoys, calls for aid and village relief, by map size. */
  reach = 1
  /** Marching pace: armies and wagons move a little faster on widely spread maps, so wars do not drag. */
  pace = 1
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
    // How spread out the castles are compared with the original layouts (about 680 between neighbours).
    // AI judgement distances scale with it; reach (envoys, aid, relief) grows with the map's size.
    {
      const cs = state.castles.filter((c) => !c.village)
      let acc = 0
      for (const c of cs) {
        let best = Infinity
        for (const d of cs) if (d !== c) best = Math.min(best, Math.hypot(c.x - d.x, c.z - d.z))
        if (best < Infinity) acc += best
      }
      this.spread = clamp(cs.length > 1 ? acc / cs.length / 680 : 1, 1, 2.5)
      this.reach = clamp(this.world.size / 3000, 1, 3.5)
      this.pace = Math.pow(this.spread, 0.6)
    }
    // Castles that grew since the map was made: their walls stand farther out.
    for (const c of state.castles) if (!c.village) this.world.setCastleTier(c.id, c.tier)
    // (The Royal Guard is raised once the engine is fully built; see the end of the constructor.)
    // Engineers' bridges from a saved game (indices must line up with the save).
    if (this.world.bridges.length === 0) {
      for (const b of state.builtBridges ?? []) {
        const i = this.world.addBridge(b.x, b.z)
        if (b.broken) this.world.setBridgeBroken(i, true)
      }
    }
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
    // A new war: the Sovereign rides with the Royal Guard from the capital's keep.
    if (state.royalId === undefined) this.spawnRoyal()
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
    // The countryside between the castles: villages and resource sites.
    const world0 = world ?? new World(scenario)
    world = world0
    const country = generateCountryside(world0, def.castles, scenario.seed)
    if (country.villages.length && !factions[NEUTRAL]) {
      factions[NEUTRAL] = {
        id: NEUTRAL,
        name: 'Free Towns',
        color: '#a08a56',
        team: 'N',
        gold: 0,
        alive: true,
        capitalId: null,
        ai: { nextDecisionAt: 1e9, nextRaidAt: 1e9, retakeQueue: [] },
        host: null,
      }
    }
    const castles: Castle[] = [...def.castles, ...country.villages].map((c) => ({
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
      walls: c.village ? 0 : wallsForTier(c.tier),
      maxWalls: c.village ? 0 : wallsForTier(c.tier),
      manpower: c.village ? 60 : maxManpowerForTier(c.tier) * 0.6,
      village: !!c.village,
      holding: c.holding,
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
      convoys: [],
      obstacles: [],
      sites: country.sites,
      intel: {},
      builtBridges: [],
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
    engine.initRanks()
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
    return armySpeed(army.troops, this.units, this.commanderOf(army)) * fm * this.traitsOf(army).speed * this.groundSeasonSpeed(army.x, army.z) * this.pace * this.enginePace(army) * (army.royal ? ROYAL.speed : 1) * ((army.fleeUntil ?? 0) > this.state.time ? ROYAL.flight : 1)
  }
  /** Siege engines slow the army that pushes them (the slowest one counts). */
  enginePace(a: Army): number {
    const e = a.engines
    if (!e) return 1
    return Math.min(e.tower ? ENGINES.towerPace : 1, e.ram ? ENGINES.ramPace : 1, e.mantlet ? ENGINES.mantletPace : 1)
  }
  /** Season and weather slow-down where an army stands: geothermal ground shrugs off winter, ice makes it worse. */
  groundSeasonSpeed(x: number, z: number): number {
    const e = this.climate()
    if (seasonAt(this.state.time) !== 'Winter') return e.speed
    const w = this.world.rulesAt(x, z).winter
    return w === 'immune' ? e.speed / 0.82 : w === 'harsh' ? e.speed * 0.85 : e.speed
  }
  /** Supply reach of a castle or depot standing here: deserts stretch it; winter shrinks it, more on ice, not at all on warm ground. */
  groundSupply(x: number, z: number, seasonal: number): number {
    const r = this.world.rulesAt(x, z)
    let s = seasonal
    if (seasonAt(this.state.time) === 'Winter') s = r.winter === 'immune' ? 1 : r.winter === 'harsh' ? seasonal * 0.8 : seasonal
    return s * r.supply
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
    if ((a.revealedUntil ?? 0) > this.state.time) return false
    return a.hiddenSince !== null && this.state.time - a.hiddenSince >= HIDE_SECONDS
  }
  /** True if two factions have a pact (no attacks between them). */
  atPeace(a: Faction, b: Faction): boolean {
    const p = this.state.pacts
    const t = this.state.time
    return (a === PLAYER && (p[b] ?? 0) > t) || (b === PLAYER && (p[a] ?? 0) > t)
  }
  supplyRange(c: Castle): number {
    if (c.ruined) return 0
    if (c.village) return 380 * this.spread
    return (520 + c.tier * 90) * this.spread
  }

  garrisonPower(c: Castle): number {
    return power(c.garrison, this.units) * (c.walls > 0 ? 1.6 : 1.15)
  }

  // -------------------------------------------------------------------------
  // What each side can see and know (the same rules for the player and the AI)
  // -------------------------------------------------------------------------

  /** The Royal Guard waiting in the keep of one of its castles: out of the fighting unless it sallies. */
  inKeep(a: Army): boolean {
    return !!a.royal && (a.order.type === 'station' || a.order.type === 'hold') && a.status !== 'marching' && this.insideWalls(a)
  }
  /** The Sovereign's presence: the Royal Guard of this side is in the field within 350m. */
  inPresence(a: Army): boolean {
    const team = this.team(a.faction)
    const r = ROYAL.aura
    for (const g of this.state.armies) {
      if (!g.royal || this.team(g.faction) !== team || this.insideWalls(g)) continue
      if (Math.abs(g.x - a.x) < r && Math.abs(g.z - a.z) < r && Math.hypot(g.x - a.x, g.z - a.z) < r) return true
    }
    return false
  }
  /** The Royal Guard of a realm, if it still rides. */
  royalArmy(f: Faction = PLAYER): Army | undefined {
    return this.state.armies.find((a) => a.royal && a.faction === f)
  }
  /** Raise the Royal Guard at the player's capital at the start of a war. */
  private spawnRoyal() {
    this.state.royalId = null
    if (!this.commanders.has(ROYAL.key)) return
    const cap = this.castle(this.state.factions[PLAYER]?.capitalId) ?? this.state.castles.find((c) => c.faction === PLAYER && !c.village)
    if (!cap) return
    cap.garrison.cavalry = (cap.garrison.cavalry ?? 0) + ROYAL.guard
    const res = this.formArmy(cap.id, PLAYER, { cavalry: ROYAL.guard }, { commanderKey: ROYAL.key, name: 'Royal Guard', retreatAt: ROYAL.retreatAt, order: { type: 'station', castleId: cap.id } })
    if (typeof res === 'string') {
      cap.garrison.cavalry = Math.max(0, (cap.garrison.cavalry ?? 0) - ROYAL.guard)
      return
    }
    res.royal = true
    this.state.royalId = res.id
  }
  /** A castle with the Royal Guard in its keep has fallen: the King rides out by the far gate. */
  private kingsFlight(c: Castle, winners: Army[]) {
    const g = this.state.armies.find((a) => a.royal && a.faction === c.faction && Math.hypot(a.x - c.x, a.z - c.z) < wallRadius(c.tier))
    if (!g) return
    const ax = winners.reduce((s, a) => s + a.x, 0) / Math.max(1, winners.length)
    const az = winners.reduce((s, a) => s + a.z, 0) / Math.max(1, winners.length)
    const gate = this.world.gateOf(c.id, c.x * 2 - ax, c.z * 2 - az)
    if (gate) [g.x, g.z] = this.world.nearestPassable(gate[0], gate[1])
    const refuge =
      this.nearestCastle(g.x, g.z, g.faction, c.id) ??
      this.state.castles.filter((x) => !x.village && x.id !== c.id && this.team(x.faction) === this.team(g.faction)).sort((p, q) => Math.hypot(p.x - g.x, p.z - g.z) - Math.hypot(q.x - g.x, q.z - g.z))[0]
    const depot = this.state.outposts.find((o) => o.faction === g.faction && o.kind === 'depot')
    g.path = []
    g.pathTarget = null
    g.battleId = null
    g.status = 'idle'
    g.fleeUntil = this.state.time + 10
    if (refuge) g.order = { type: 'station', castleId: refuge.id }
    else if (depot) g.order = { type: 'move', x: depot.x, z: depot.z }
    else g.order = { type: 'hold' }
    if (g.faction === PLAYER) this.log('warning', `${c.name} has fallen! The King rides out`, `The Royal Guard breaks out by the far gate${refuge ? ` and makes for ${refuge.name}` : ''}. Keep the pursuit off them.`, g.x, g.z)
  }

  /** How close an army must come to be 'at' a friendly holding: inside the walls of a castle, beside a village. */
  arriveDist(c: Castle): number {
    return c.village || !this.world.walls.has(c.id) ? holdingRadius(c) + 30 : wallRadius(c.tier) * 0.45
  }
  /** Is this army inside the walls of a castle of its own side (and so out of sight)? */
  insideWalls(a: Army): boolean {
    for (const c of this.state.castles) {
      if (c.village || this.team(c.faction) !== this.team(a.faction)) continue
      const r = wallRadius(c.tier) - 10
      if (Math.abs(c.x - a.x) < r && Math.abs(c.z - a.z) < r && Math.hypot(c.x - a.x, c.z - a.z) < r) return true
    }
    return false
  }

  /** Can this side see that army at all? Hidden troops show only to someone close by. */
  /**
   * Can this side see that army? Castles and holdings are known to all, but an
   * army shows only within sight of the side's troops, castles, holdings or
   * outposts (allies share what they see). Troops lying hidden are found only
   * close up. The same rule binds the player and the AI.
   */
  canSee(team: Team, a: Army): boolean {
    if (this.team(a.faction) === team) return true
    if (team === 'N') return false
    // Worked out once per tick for each side, then looked up.
    if (this.sightAt !== this.state.time || this.sightArmies !== this.state.armies.length) {
      this.sightCache.clear()
      this.sightAt = this.state.time
      this.sightArmies = this.state.armies.length
    }
    const key = `${team}:${a.id}`
    const hit = this.sightCache.get(key)
    if (hit !== undefined) return hit
    const v = this.computeSight(team, a)
    this.sightCache.set(key, v)
    return v
  }
  private sightCache = new Map<string, boolean>()
  private sightAt = -1
  private sightArmies = -1
  private computeSight(team: Team, a: Army): boolean {
    const hidden = this.isHidden(a)
    const near = (x: number, z: number, r: number) => Math.abs(x - a.x) < r && Math.abs(z - a.z) < r && Math.hypot(x - a.x, z - a.z) < r
    for (const b of this.state.armies) {
      if (this.team(b.faction) !== team) continue
      if (near(b.x, b.z, (hidden ? STEALTH.uncover : SIGHT.army * this.sightScale) * this.lookout(b))) return true
    }
    for (const c of this.state.castles) {
      if (c.ruined || this.team(c.faction) !== team) continue
      if (near(c.x, c.z, holdingRadius(c) + (hidden ? STEALTH.uncover : (c.village ? SIGHT.holding : SIGHT.castle) * this.sightScale))) return true
    }
    for (const o of this.state.outposts) {
      if (this.team(o.faction) !== team || o.progress < 1) continue
      const tower = o.kind === 'redoubt'
      if (near(o.x, o.z, hidden ? (tower ? STEALTH.towerUncover : STEALTH.uncover) : (tower ? SIGHT.tower : SIGHT.outpost) * this.sightScale)) return true
    }
    return false
  }
  /** Sight grows a little on bigger maps. */
  get sightScale(): number {
    return Math.sqrt(this.spread)
  }
  /** Is this side close enough (450m) to count that force exactly? */
  closeTo(team: Team, x: number, z: number): boolean {
    const r = SCOUT.closeSight
    for (const c of this.state.castles) if (this.team(c.faction) === team && Math.abs(c.x - x) < r && Math.hypot(c.x - x, c.z - z) < r) return true
    for (const a of this.state.armies) {
      if (this.team(a.faction) !== team) continue
      const rr = r * this.lookout(a)
      if (Math.abs(a.x - x) < rr && Math.abs(a.z - z) < rr && Math.hypot(a.x - x, a.z - z) < rr) return true
    }
    return false
  }
  /** A small party (50 or fewer) on a crag overlook sees 2.2x as far. */
  lookout(a: Army): number {
    return this.world.def.features?.length && total(a.troops) <= FEATURES.cragParty && this.world.featureKindAt(a.x, a.z) === 'crag' ? FEATURES.cragSight : 1
  }
  /** Movement through windfall depends on who is marching. */
  private featureStep(a: Army): number {
    if (!this.world.def.features?.length) return 1
    const k = this.world.featureKindAt(a.x, a.z)
    if (k !== 'thicket') return 1
    const n = total(a.troops) || 1
    // Windfall: horses can barely get through at all.
    return (a.troops.cavalry ?? 0) / n > 0.05 ? 0.2 : 0.7
  }
  /** Does the besieging side have a siege tower at the walls? */
  private towerAt(b: Battle): boolean {
    return b.kind === 'siege' && b.sideA.armyIds.some((id) => this.army(id)?.engines?.tower)
  }
  /** Rumour factor (about ±30%) a side has about a far-off force; changes every 90 s. */
  rumour(team: Team, id: string): number {
    let h = team.charCodeAt(0) * 7919
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const bucket = Math.floor(this.state.time / 90)
    return 1 + ((((h ^ (bucket * 2654435761)) >>> 0) % 1000) / 1000 - 0.5) * 0.6
  }
  /** An enemy army's strength as this side believes it (exact up close, a rumour farther off). */
  perceivedArmyPower(team: Team, a: Army): number {
    const p = this.armyPower(a)
    return this.closeTo(team, a.x, a.z) ? p : p * this.rumour(team, a.id)
  }
  perceivedGarrisonPower(team: Team, c: Castle): number {
    const p = this.garrisonPower(c)
    return this.team(c.faction) === team || this.closeTo(team, c.x, c.z) ? p : p * this.rumour(team, c.id)
  }
  /** Abbeys nurse the wounded: each shortens a commander's recovery (25%, 40% walled), down to 40% of the usual time. */
  woundFactor(f: Faction): number {
    let k = 1
    for (const c of this.state.castles) if (c.faction === f && c.holding === 'abbey' && this.isVassal(c)) k *= 1 - (HOLDING_EFFECTS.abbeyWounds[c.tier] ?? 0.25)
    return Math.max(0.4, k)
  }
  /** The best siege guildhall a realm holds (its tier), or 0. */
  guildTier(f: Faction): number {
    let t = 0
    for (const c of this.state.castles) if (c.faction === f && c.holding === 'guildhall' && this.isVassal(c)) t = Math.max(t, c.tier)
    return t
  }
  /** Gold cost of a unit for this realm (a guildhall makes engineers cheaper). */
  unitCost(f: Faction, key: string): number {
    const u = this.units.get(key)
    if (!u) return 0
    const g = key === 'engineers' ? this.guildTier(f) : 0
    return g ? Math.min(u.cost_gold, HOLDING_EFFECTS.guildEngineer[g]) : u.cost_gold
  }
  /** Building discount (outposts, castle upgrades) from a guildhall. */
  buildDiscount(f: Faction): number {
    return 1 - (HOLDING_EFFECTS.guildDiscount[this.guildTier(f)] ?? 0)
  }

  /** The kind of a small holding (plain villages leave it unset). */
  holdingOf(c: Castle): HoldingKind {
    return c.holding ?? 'village'
  }
  capacity(c: Castle) {
    return c.village ? HOLDINGS[this.holdingOf(c)].militia[c.tier] ?? 300 : capacityForTier(c.tier)
  }
  /** Gold per second a holding yields (before realm and season modifiers). */
  castleIncome(c: Castle): number {
    if (c.ruined || c.village) return 0
    return incomeForTier(c.tier)
  }
  /** Gold per second a vassal village sends its lord (by wagon). */
  tributeRate(c: Castle): number {
    if (!c.village || c.ruined || c.faction === NEUTRAL) return 0
    return HOLDINGS[this.holdingOf(c)].tribute[c.tier] ?? 0
  }
  /** A village that has sworn to a lord: it runs itself and pays tribute. */
  isVassal(c: Castle | undefined): boolean {
    return !!c && !!c.village && !c.ruined && c.faction !== NEUTRAL
  }
  maxManpower(c: Castle): number {
    return c.village ? VILLAGE.manpower : maxManpowerForTier(c.tier)
  }
  manpowerRegen(c: Castle): number {
    return c.village ? VILLAGE.manpowerRegen : manpowerRegenForTier(c.tier)
  }
  maxTier(c: Castle): number {
    return c.village ? 2 : 4
  }
  upgradeCostOf(c: Castle): number {
    return c.village ? VILLAGE.stoneWallCost : Math.round(upgradeCost(c.tier) * this.buildDiscount(c.faction))
  }
  private visIndex(x: number, z: number) {
    const half = this.world.half
    const R = this.visRes
    const i = clamp(Math.floor(((x + half) / this.world.size) * R), 0, R - 1)
    const j = clamp(Math.floor(((z + half) / this.world.size) * R), 0, R - 1)
    return j * R + i
  }
  /** In sight right now (armies and battles need this). */
  isVisible(x: number, z: number): boolean {
    return this.vision[this.visIndex(x, z)] > 0
  }
  /** Seen at least once, by us or an ally: the land, castles and sites stay revealed. */
  isExplored(x: number, z: number): boolean {
    return this.explored[this.visIndex(x, z)] > 0
  }
  freeCommanders(faction: Faction): CommanderDef[] {
    return this.content.commanders.filter((c) => {
      const s = this.state.commanders[c.key]
      return s && s.owner === faction && !s.armyId && !s.stationedAt && s.woundedUntil <= this.state.time
    })
  }
  /** Commanders quartered in a depot: the only ones who can lead armies raised there. */
  depotCommanders(outpostId: string): CommanderDef[] {
    return this.content.commanders.filter((c) => {
      const s = this.state.commanders[c.key]
      return s && s.stationedAt === outpostId && !s.armyId && s.woundedUntil <= this.state.time
    })
  }
  castleAt(x: number, z: number, extra = 30): Castle | undefined {
    const far = 82 + extra // larger than any castle radius + extra
    for (const c of this.state.castles) {
      if (Math.abs(c.x - x) > far || Math.abs(c.z - z) > far) continue
      if (Math.hypot(c.x - x, c.z - z) < holdingRadius(c) + extra) return c
    }
    return undefined
  }
  nearestCastle(x: number, z: number, faction: Faction, exclude?: string, noVillages = true): Castle | undefined {
    let best: Castle | undefined
    let bd = Infinity
    for (const c of this.state.castles) {
      if (c.faction !== faction || c.id === exclude || (noVillages && c.village)) continue
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
    let paid = 0
    for (const a of this.state.armies) {
      if (a.faction !== faction) continue
      field = addTroops(field, a.troops)
      fieldPower += this.armyPower(a)
      if (!a.royal) paid += total(a.troops)
    }
    let income = 0
    let manpower = 0
    let castles = 0
    let villages = 0
    for (const c of this.state.castles) {
      if (c.faction !== faction) continue
      garrison = addTroops(garrison, c.garrison)
      income += this.castleIncome(c)
      manpower += c.manpower
      if (c.village) villages++
      else castles++
    }
    // Matches what is actually charged: the Royal Guard is free, and the season can raise the cost.
    const upkeep = paid * FIELD_UPKEEP * this.climate().upkeep
    const all = addTroops(field, garrison)
    return {
      field,
      garrison,
      all,
      castles,
      villages,
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
      if (!c.village) castles++
    }
    for (const a of this.state.armies) if (this.team(a.faction) === team) p += this.armyPower(a)
    return { power: p, castles }
  }
  incomeMult(f: Faction) {
    if (f === PLAYER) return 1
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
    if (this.castle(castleId)?.village) return 'A vassal village raises its own militia.'
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
    const price = this.unitCost(faction, unitKey)
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
    return Math.max(0, Math.floor(Math.min(this.capacity(c) - total(c.garrison), c.manpower / u.cost_manpower, f.gold / this.unitCost(faction, unitKey))))
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
      const n = Math.floor((budget * (w / sum)) / this.unitCost(faction, key))
      if (n > 0) this.recruit(castleId, key, n, faction)
    }
    return before - f.gold
  }

  upgradeCastle(castleId: string, faction: Faction = PLAYER): string | null {
    if (this.castle(castleId)?.village) return 'The village raises its own stone walls in time.'
    const c = this.castle(castleId)
    const f = this.faction(faction)
    if (!c || !f || c.faction !== faction) return 'You do not hold this castle.'
    if (c.tier >= this.maxTier(c)) return c.village ? 'Already walled in stone.' : 'Already a citadel.'
    if (c.battleId) return 'Cannot build while under siege.'
    const cost = this.upgradeCostOf(c)
    if (f.gold < cost) return `Needs ${cost} gold.`
    f.gold -= cost
    c.tier++
    // The curtain wall moves out: anyone caught on the new line steps clear, and everyone replans.
    this.world.setCastleTier(c.id, c.tier)
    for (const a of this.state.armies) {
      if (Math.hypot(a.x - c.x, a.z - c.z) > holdingRadius(c) + 40) continue
      if (!this.world.isPassable(a.x, a.z)) [a.x, a.z] = this.world.nearestPassable(a.x, a.z)
      a.path = []
      a.pathTarget = null
    }
    const newMax = c.village ? VILLAGE.walls[c.tier] : wallsForTier(c.tier)
    c.walls += newMax - c.maxWalls
    c.maxWalls = newMax
    this.events.push({ type: 'castle_changed', castleId: c.id })
    if (faction === PLAYER) {
      if (c.village) this.log('info', `${c.name} is walled in stone`, 'Stronger walls, more room for troops and a little more income.', c.x, c.z)
      else this.log('info', `${c.name} is expanded`, `Now tier ${c.tier}: stronger walls, more income, manpower and room for troops.`, c.x, c.z)
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
      vassal?: boolean
    } = {},
  ): Army | string {
    const depot = this.castle(castleId) ? undefined : this.outpost(castleId)
    if (depot) return this.formArmyFromDepot(depot, faction, troops, opts)
    const c = this.castle(castleId)
    if (!c || c.faction !== faction) return 'You do not hold this castle.'
    if (c.village && !opts.vassal) return 'A vassal village keeps its militia: it fights for you on its own.'
    const take: Troops = {}
    for (const k in troops) take[k] = Math.max(0, Math.min(Math.floor(troops[k]), Math.floor(c.garrison[k] ?? 0)))
    const n = total(take)
    if (n < 10) return 'An army needs at least 10 soldiers.'
    if (opts.commanderKey) {
      const s = this.state.commanders[opts.commanderKey]
      if (!s || s.owner !== faction || s.armyId || s.stationedAt || s.woundedUntil > this.state.time) return 'That commander is not available.'
    }
    for (const k in take) c.garrison[k] -= take[k]
    const name = opts.name ?? (faction === PLAYER ? this.playerArmyName(opts.commanderKey ?? null) : 'Warband')
    let ang = Math.atan2(-c.z, -c.x)
    if (opts.order && 'castleId' in opts.order) {
      const t = this.castle(opts.order.castleId)
      if (t) ang = Math.atan2(t.z - c.z, t.x - c.x)
    }
    // A walled castle: the army forms in the bailey and marches out through a gate.
    // A village has no walls: they gather just outside it.
    const walled = !c.village && this.world.walls.has(c.id)
    const r = walled ? 0 : holdingRadius(c) + 34
    const [sx, sz] = walled ? [c.x, c.z] : this.world.nearestPassable(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r)
    if (walled && !opts.order) {
      const g = this.world.gateOf(c.id, c.x + Math.cos(ang) * 1000, c.z + Math.sin(ang) * 1000)
      if (g) {
        const [gx, gz] = this.world.nearestPassable(g[0] + Math.cos(ang) * 40, g[1] + Math.sin(ang) * 40)
        opts = { ...opts, order: { type: 'move', x: gx, z: gz } }
      }
    }
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
    // The Royal Guard is raised in the keep at the start of the war: it does not march anywhere yet.
    if (faction === PLAYER && army.commanderKey !== ROYAL.key) {
      this.log('deploy', `${army.name} marches out`, `${totalInt(army.troops)} soldiers set out from ${c.name}.`, army.x, army.z)
      this.notify()
    }
    return army
  }

  /** Raise an army from the troops quartered in a supply depot. */
  private formArmyFromDepot(
    o: Outpost,
    faction: Faction,
    troops: Troops,
    opts: { commanderKey?: string | null; captainName?: string; retreatAt?: number; order?: ArmyOrder; name?: string; formation?: FormationKey; column?: boolean },
  ): Army | string {
    if (o.kind !== 'depot' || o.faction !== faction || o.progress < 1) return 'You do not hold this depot.'
    const g = o.garrison ?? {}
    const take: Troops = {}
    for (const k in troops) take[k] = Math.max(0, Math.min(Math.floor(troops[k]), Math.floor(g[k] ?? 0)))
    const n = total(take)
    if (n < 10) return 'An army needs at least 10 soldiers.'
    if (opts.commanderKey) {
      const s = this.state.commanders[opts.commanderKey]
      if (!s || s.owner !== faction || s.armyId || s.stationedAt !== o.id || s.woundedUntil > this.state.time) return 'Only a commander quartered in this depot can lead troops raised here.'
    }
    for (const k in take) g[k] = (g[k] ?? 0) - take[k]
    o.garrison = g
    const home = this.nearestCastle(o.x, o.z, faction)
    let ang = Math.atan2(-o.z, -o.x)
    if (opts.order && 'castleId' in opts.order) {
      const t = this.castle(opts.order.castleId)
      if (t) ang = Math.atan2(t.z - o.z, t.x - o.x)
    }
    const [sx, sz] = this.world.nearestPassable(o.x + Math.cos(ang) * 40, o.z + Math.sin(ang) * 40)
    const army: Army = {
      id: this.newId('a'),
      name: opts.name ?? (faction === PLAYER ? this.playerArmyName(opts.commanderKey ?? null) : 'Depot Guard'),
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
      homeCastleId: home?.id ?? '',
      battleId: null,
      battleJoinedAt: 0,
      createdAt: this.state.time,
      kills: 0,
      routedAt: -999,
      hiddenSince: null,
      supplied: true,
    }
    army.morale = this.moraleCap(army)
    if (army.commanderKey) {
      const st = this.state.commanders[army.commanderKey]
      st.armyId = army.id
      st.stationedAt = null
      o.commanders = (o.commanders ?? []).filter((k) => k !== army.commanderKey)
    }
    this.state.armies.push(army)
    if (faction === PLAYER) {
      this.log('deploy', `${army.name} marches out`, `${totalInt(army.troops)} soldiers set out from ${o.name}.`, army.x, army.z)
      this.notify()
    }
    return army
  }

  /** An army moves into a depot's quarters: its troops and commander are kept there, out of sight. */
  private quarterInDepot(a: Army, o: Outpost) {
    const g = o.garrison ?? {}
    const room = Math.max(0, DEPOT.capacity - total(g))
    const n = total(a.troops)
    if (room < 1) {
      a.order = { type: 'hold' }
      if (a.faction === PLAYER) this.log('warning', `${o.name} is full`, `The depot can quarter ${DEPOT.capacity} soldiers. ${a.name} camps beside it.`, o.x, o.z)
      return
    }
    const frac = Math.min(1, room / n)
    for (const k in a.troops) {
      const moved = a.troops[k] * frac
      g[k] = (g[k] ?? 0) + moved
      a.troops[k] -= moved
    }
    o.garrison = g
    if (frac < 1) {
      a.order = { type: 'hold' }
      if (a.faction === PLAYER) this.log('info', `${o.name} is full`, `${Math.round(room)} soldiers moved in; the rest of ${a.name} camps beside it.`, o.x, o.z)
      return
    }
    if (a.commanderKey) {
      const st = this.state.commanders[a.commanderKey]
      if (st) {
        st.armyId = null
        st.stationedAt = o.id
        o.commanders = [...(o.commanders ?? []).filter((k) => k !== a.commanderKey), a.commanderKey]
      }
    }
    this.state.armies = this.state.armies.filter((x) => x.id !== a.id)
    if (a.faction === PLAYER) this.log('info', `${a.name} quarters in ${o.name}`, `${totalInt(g)} soldiers now wait in the depot.`, o.x, o.z)
  }

  /** Everyone quartered in a depot marches out (to defend it, or because it is lost). */
  private emptyDepot(o: Outpost, why: 'sally' | 'lost'): Army | null {
    const g = o.garrison ?? {}
    if (total(g) < 1) {
      for (const k of o.commanders ?? []) if (this.state.commanders[k]) this.state.commanders[k].stationedAt = null
      o.commanders = []
      return null
    }
    const cmds = o.commanders ?? []
    const lead = cmds.find((k) => (this.state.commanders[k]?.woundedUntil ?? 0) <= this.state.time) ?? null
    for (const k of cmds) if (this.state.commanders[k]) this.state.commanders[k].stationedAt = null
    o.commanders = []
    const troops: Troops = {}
    for (const k in g) troops[k] = g[k]
    o.garrison = {}
    const home = this.nearestCastle(o.x, o.z, o.faction)
    const [sx, sz] = this.world.nearestPassable(o.x, o.z)
    const army: Army = {
      id: this.newId('a'),
      name: o.faction === PLAYER ? this.playerArmyName(lead) : `${o.name} Guard`,
      faction: o.faction,
      commanderKey: lead,
      captainName: lead ? null : 'Quartermaster',
      x: sx,
      z: sz,
      heading: 0,
      path: [],
      pathTarget: null,
      repathAt: 0,
      order: { type: 'hold' },
      status: 'idle',
      troops: { ...emptyTroops(this.unitList), ...troops },
      initialTotal: total(troops),
      morale: 0,
      retreatAt: 0.5,
      formation: suggestFormation(troops, this.units),
      column: false,
      homeCastleId: home?.id ?? '',
      battleId: null,
      battleJoinedAt: 0,
      createdAt: this.state.time,
      kills: 0,
      routedAt: -999,
      hiddenSince: null,
      supplied: true,
    }
    army.morale = this.moraleCap(army)
    if (lead) this.state.commanders[lead].armyId = army.id
    this.state.armies.push(army)
    if (why === 'lost') {
      // The depot is gone: its people fall back to the nearest friendly hold.
      if (home) this.orderArmy(army.id, { type: 'reinforce', castleId: home.id })
      if (o.faction === PLAYER) this.log('warning', `The garrison of ${o.name} falls back`, `${totalInt(troops)} soldiers retreat toward ${home?.name ?? 'safety'}.`, o.x, o.z)
    } else if (o.faction === PLAYER) {
      this.log('warning', `${o.name} is threatened`, `The ${totalInt(troops)} soldiers quartered there march out to meet the enemy.`, o.x, o.z)
    }
    return army
  }

  // --- Engineers' field works ---------------------------------------------------

  /** An engineers' bridge (index) within reach of a point that is still standing. */
  bridgeNear(x: number, z: number, within = 90): { index: number } | null {
    let best: { index: number } | null = null
    let bd = within
    this.world.bridges.forEach((b, index) => {
      if (this.world.broken.has(index)) return
      const d = Math.hypot(b.x - x, b.z - z) - b.length / 2
      if (d < bd) {
        bd = d
        best = { index }
      }
    })
    return best
  }

  /** Where a new bridge would go if engineers built one from here, or why they cannot. */
  bridgeSite(x: number, z: number): { span: BridgeInfo; reason: string | null } | null {
    if (!this.world.def.rivers.length) return null
    const span = this.world.spanAt(x, z)
    const reach = Math.hypot(span.x - x, span.z - z) - span.length / 2
    if (reach > 90) return null
    const ends = [1, -1].map((s) => [span.x + span.dirX * s * (span.length / 2 + 14), span.z + span.dirZ * s * (span.length / 2 + 14)])
    let reason: string | null = null
    if (span.length > OBSTACLE.maxSpan) reason = 'The river is too wide to bridge here.'
    else if (this.world.crossings().some((c) => Math.hypot(c.x - span.x, c.z - span.z) < 160)) reason = 'There is already a crossing close by.'
    else if (ends.some(([ex, ez]) => !this.world.isPassable(ex, ez) || this.world.heightAt(ex, ez) < 2.5)) reason = 'The banks here are too steep or wet.'
    return { span, reason }
  }

  workOptions(armyId: string): { job: WorkJob; ok: boolean; reason: string | null }[] {
    const a = this.army(armyId)
    if (!a) return []
    const f = this.faction(a.faction)
    const eng = a.troops.engineers ?? 0
    const bridge = this.bridgeNear(a.x, a.z)
    const site = this.bridgeSite(a.x, a.z)
    const mine = (this.state.obstacles ?? []).filter((o) => o.faction === a.faction).length
    const bridges = (this.state.builtBridges ?? []).filter((b) => b.faction === a.faction && !b.broken).length
    const jobs: WorkJob[] = ['stakes', 'pit', 'barricade', 'pitch', 'bridge', 'demolish', 'tower', 'ram', 'mantlet', 'trebuchet']
    const trebs = (this.state.obstacles ?? []).filter((o) => o.kind === 'trebuchet' && o.faction === a.faction).length
    return jobs.map((job) => {
      const w = WORKS[job]
      const ground = job === 'stakes' || job === 'pit' || job === 'barricade' || job === 'pitch'
      let reason: string | null = null
      if (a.battleId || a.status === 'retreating') reason = 'Not while fighting or retreating.'
      else if (eng < w.engineers) reason = `Needs ${w.engineers}+ Engineers.`
      else if (f && f.gold < w.cost) reason = `Needs ${w.cost} gold.`
      else if (job === 'demolish' && !bridge) reason = 'Stand at an engineers\' bridge.'
      else if (job === 'bridge' && !site) reason = 'Stand on a river bank.'
      else if (job === 'bridge' && site?.reason) reason = site.reason
      else if (job === 'bridge' && bridges >= OBSTACLE.maxBridges) reason = `At most ${OBSTACLE.maxBridges} bridges.`
      else if ((job === 'tower' || job === 'ram' || job === 'mantlet') && a.engines?.[job]) reason = 'This army already has one.'
      else if (job === 'trebuchet' && trebs >= ENGINES.trebMax) reason = `At most ${ENGINES.trebMax} trebuchets.`
      else if (job === 'trebuchet' && (this.world.bridgeAt(a.x, a.z, 10) || this.world.fordAt(a.x, a.z) || !this.world.isPassable(a.x, a.z))) reason = 'Not on a bridge or in water.'
      else if (ground && mine >= OBSTACLE.maxPerFaction) reason = `At most ${OBSTACLE.maxPerFaction} works in the field.`
      else if (ground && (this.world.bridgeAt(a.x, a.z, 10) || this.world.fordAt(a.x, a.z) || !this.world.isPassable(a.x, a.z))) reason = 'Not on a bridge or in water.'
      else if (ground && this.castleAt(a.x, a.z, 40)) reason = 'Too close to a castle.'
      return { job, ok: !reason, reason }
    })
  }

  /** Start engineers' work where the army stands. */
  startWork(armyId: string, job: WorkJob, then?: ArmyOrder): string | null {
    const opt = this.workOptions(armyId).find((o) => o.job === job)
    if (!opt) return 'No such army.'
    if (!opt.ok) return opt.reason
    const a = this.army(armyId)!
    const w = WORKS[job]
    this.state.factions[a.faction].gold -= w.cost
    let x = a.x
    let z = a.z
    let bridge: number | null = null
    let tx: number | undefined
    let tz: number | undefined
    // Work from our own end of the span (an existing bridge, or the one to be built).
    const span = job === 'demolish' ? this.world.bridges[(bridge = this.bridgeNear(a.x, a.z)!.index)] : job === 'bridge' ? this.bridgeSite(a.x, a.z)!.span : null
    if (span) {
      const side = Math.sign((a.x - span.x) * span.dirX + (a.z - span.z) * span.dirZ) || 1
      x = span.x + side * span.dirX * (span.length / 2 + 14)
      z = span.z + side * span.dirZ * (span.length / 2 + 14)
      if (job === 'bridge') {
        tx = span.x
        tz = span.z
      }
    }
    const [px, pz] = this.world.nearestPassable(x, z)
    this.orderArmy(a.id, { type: 'work', job, x: px, z: pz, bridge, progress: 0, tx, tz, then })
    if (a.faction === PLAYER) this.log('deploy', `${a.name}: ${w.name.toLowerCase()}`, `The engineers set to work (about ${Math.round(this.workSeconds(a, job))}s).`, px, pz)
    this.notify()
    return null
  }

  private workSeconds(a: Army, job: WorkJob): number {
    const builder = a.commanderKey && this.state.commanders[a.commanderKey]?.traits.includes('master_builder') ? 2 : 1
    const extra = Math.max(0, (a.troops.engineers ?? 0) - WORKS[job].engineers)
    return (WORKS[job].seconds / builder) * Math.max(0.5, 1 - extra * 0.01)
  }

  private finishWork(a: Army, job: WorkJob, bridge: number | null, tx?: number, tz?: number) {
    const w = WORKS[job]
    if (job === 'bridge') {
      if (tx === undefined || tz === undefined) return
      const site = this.bridgeSite(tx, tz)
      if (!site || site.reason) {
        if (a.faction === PLAYER) this.log('warning', 'The bridge could not be finished', site?.reason ?? 'The river moved on us.', a.x, a.z)
        return
      }
      const index = this.world.addBridge(tx, tz)
      ;(this.state.builtBridges ??= []).push({ index, x: tx, z: tz, faction: a.faction, broken: false })
      this.replanAll()
      if (a.faction === PLAYER) this.log('capture', 'Bridge built', 'A timber bridge spans the river. Anyone may use it, and enemy engineers can pull it down.', tx, tz)
      return
    }
    if (job === 'demolish') {
      if (bridge !== null) this.demolishBridge(bridge, a.faction)
      return
    }
    if (job === 'tower' || job === 'ram' || job === 'mantlet') {
      a.engines = { ...(a.engines ?? {}), [job]: true }
      if (a.faction === PLAYER) this.log('capture', `${w.name} assembled`, w.description, a.x, a.z)
      return
    }
    const life = OBSTACLE[job].life
    const obs: Obstacle = { id: this.newId('x'), kind: job, faction: a.faction, x: a.x, z: a.z, until: this.state.time + life }
    if (job === 'barricade') obs.hp = OBSTACLE.barricade.hp
    ;(this.state.obstacles ??= []).push(obs)
    if (a.faction === PLAYER) this.log('capture', `${w.name} ready`, w.description, a.x, a.z)
  }

  /** Field trebuchets: while guarded, they hurl stones at walls, outposts or armies in range; unguarded, enemies wreck them. */
  private updateTrebuchets() {
    const t = this.state.time
    for (const o of this.state.obstacles ?? []) {
      if (o.kind !== 'trebuchet' || o.until <= t) continue
      const team = this.team(o.faction)
      const guard = this.state.armies.some((a) => this.team(a.faction) === team && a.status !== 'retreating' && Math.hypot(a.x - o.x, a.z - o.z) < 100)
      if (!guard) {
        const wrecker = this.state.armies.find((a) => this.isHostile(a.faction, o.faction) && a.status !== 'retreating' && Math.hypot(a.x - o.x, a.z - o.z) < 60)
        if (wrecker) {
          o.until = t
          this.events.push({ type: 'blast', x: o.x, z: o.z })
          if (o.faction === PLAYER) this.log('lost', 'A trebuchet is wrecked', `${wrecker.name} broke it apart while it stood unguarded.`, o.x, o.z)
          else if (wrecker.faction === PLAYER) this.log('victory', 'Enemy trebuchet wrecked', `${wrecker.name} broke it apart.`, o.x, o.z)
        }
        continue
      }
      if ((o.nextShotAt ?? 0) > t) continue
      o.nextShotAt = t + 4
      const R = ENGINES.trebRange
      const c = this.state.castles.find((c) => !c.village && c.walls > 0 && this.isHostile(c.faction, o.faction) && Math.hypot(c.x - o.x, c.z - o.z) < R + wallRadius(c.tier))
      if (c) {
        c.walls = Math.max(0, c.walls - ENGINES.trebWalls * this.climate().siege)
        const n = total(c.garrison)
        if (n > 0) c.garrison = scaleTroops(c.garrison, Math.max(0, n - 2) / n)
        this.events.push({ type: 'hit', x: c.x, z: c.z, amount: ENGINES.trebWalls, team: this.team(c.faction), ranged: true })
        continue
      }
      const post = this.state.outposts.find((p) => this.isHostile(p.faction, o.faction) && Math.hypot(p.x - o.x, p.z - o.z) < R)
      if (post) {
        post.raze += 0.1
        this.events.push({ type: 'hit', x: post.x, z: post.z, amount: 10, team: this.team(post.faction), ranged: true })
        if (post.raze >= 1) {
          this.emptyDepot(post, 'lost')
          this.state.outposts = this.state.outposts.filter((x) => x.id !== post.id)
          if (post.faction === PLAYER) this.log('lost', `${post.name} is smashed`, 'Trebuchet stones brought it down.', post.x, post.z)
        }
        continue
      }
      let target: Army | null = null
      let best = R
      for (const a of this.state.armies) {
        if (!this.isHostile(a.faction, o.faction) || a.status === 'retreating' || !this.canSee(team, a)) continue
        const d = Math.hypot(a.x - o.x, a.z - o.z)
        if (d < best) {
          best = d
          target = a
        }
      }
      if (target) {
        const n = total(target.troops)
        const lost = Math.min(n, Math.max(3, n * 0.025))
        target.troops = scaleTroops(target.troops, (n - lost) / Math.max(1, n))
        this.events.push({ type: 'hit', x: target.x, z: target.z, amount: lost, team: this.team(target.faction), ranged: true })
      }
    }
  }

  /** Every army and wagon replans its road (a crossing appeared or vanished). */
  private replanAll() {
    for (const a of this.state.armies) {
      if (!this.world.isPassable(a.x, a.z)) [a.x, a.z] = this.world.nearestPassable(a.x, a.z)
      a.path = []
      a.pathTarget = null
    }
    for (const w of this.state.convoys ?? []) {
      if (!this.world.isPassable(w.x, w.z)) [w.x, w.z] = this.world.nearestPassable(w.x, w.z)
      w.path = this.world.findPath(w.x, w.z, w.route[w.route.length - 1][0], w.route[w.route.length - 1][1])
    }
  }

  private demolishBridge(index: number, by: Faction) {
    if (this.world.broken.has(index)) return
    this.world.setBridgeBroken(index, true)
    const rec = (this.state.builtBridges ?? []).find((b) => b.index === index)
    if (rec) rec.broken = true
    this.replanAll()
    const b = this.world.bridges[index]
    const nearUs = this.state.castles.some((c) => c.faction === PLAYER && Math.hypot(c.x - b.x, c.z - b.z) < 1500)
    if (by === PLAYER) this.log('victory', 'The bridge comes down', 'The timbers are in the river. Only the fords remain.', b.x, b.z)
    else if (nearUs || rec?.faction === PLAYER) this.log('warning', 'A bridge is pulled down', `${this.factionName(by)}'s engineers wrecked the crossing.`, b.x, b.z)
  }

  /** Can this side's armies see that trap? (Hidden traps show to enemies only up close, or once sprung.) */
  obstacleSeenBy(o: Obstacle, team: Team): boolean {
    if (o.kind !== 'pit' && o.kind !== 'pitch') return true
    if (o.sprung || this.team(o.faction) === team) return true
    const r = OBSTACLE.reveal
    return this.state.armies.some((a) => this.team(a.faction) === team && Math.abs(a.x - o.x) < r && Math.abs(a.z - o.z) < r && Math.hypot(a.x - o.x, a.z - o.z) < r)
  }

  private updateWorks(dt: number) {
    const t = this.state.time
    const obs = this.state.obstacles
    if (!obs?.length) return
    for (const o of obs) {
      if (o.until <= t) continue
      if (o.kind === 'stakes' || o.kind === 'trebuchet') continue
      const r = o.kind === 'pit' ? OBSTACLE.pit.radius : o.kind === 'pitch' ? OBSTACLE.pitch.radius : OBSTACLE.barricade.radius
      const inside = this.state.armies.filter((a) => a.status !== 'retreating' && this.isHostile(a.faction, o.faction) && Math.abs(a.x - o.x) < r && Math.abs(a.z - o.z) < r && Math.hypot(a.x - o.x, a.z - o.z) < r)
      if (inside.length === 0) continue
      if (o.kind === 'pit' && !o.sprung) {
        o.sprung = true
        const victim = inside[0]
        if (victim.faction === PLAYER) this.log('warning', `${victim.name} is caught in a trap`, 'Mud and caltrops: the army is bogged down and cannot charge.', o.x, o.z)
        else if (o.faction === PLAYER) this.log('victory', 'The trap is sprung', `${victim.name} of ${this.factionName(victim.faction)} is stuck in the mud.`, o.x, o.z)
      } else if (o.kind === 'pitch') {
        this.blowPitch(o)
      } else if (o.kind === 'barricade') {
        // Every army at the barricade hacks at it; when it gives way, the road is open.
        o.hp = (o.hp ?? OBSTACLE.barricade.hp) - dt * inside.length
        if (o.hp <= 0) {
          o.until = t
          if (o.faction === PLAYER) this.log('warning', 'A barricade is torn down', `${inside[0].name} hacked through it.`, o.x, o.z)
        }
      }
    }
    this.state.obstacles = obs.filter((o) => o.until > t)
  }

  /** Pitch barrels go up: a few dead, a lot of panic. */
  private blowPitch(o: Obstacle) {
    o.until = this.state.time
    this.events.push({ type: 'blast', x: o.x, z: o.z })
    const R = OBSTACLE.pitch.blast
    let hit = 0
    for (const a of this.state.armies) {
      if (!this.isHostile(a.faction, o.faction) || Math.hypot(a.x - o.x, a.z - o.z) > R) continue
      for (const k in a.troops) a.troops[k] = Math.max(0, (a.troops[k] ?? 0) * (1 - OBSTACLE.pitch.losses))
      const steady = 1 - Math.min(0.4, (this.commanderOf(a)?.morale_bonus ?? 0) / 75)
      a.morale = Math.max(0, a.morale - OBSTACLE.pitch.morale * steady)
      hit++
      if (a.faction === PLAYER) this.log('warning', `${a.name} walks into fire`, 'Buried pitch barrels burst into flame. The ranks waver.', o.x, o.z)
    }
    if (o.faction === PLAYER && hit) this.log('victory', 'The pitch barrels go up', `${hit} enemy ${hit === 1 ? 'army is' : 'armies are'} shaken by fire.`, o.x, o.z)
  }

  /** Inside an enemy's sprung mud pit, or wading a ford: no charge, no square, and more losses. */
  private mired(a: Army): boolean {
    if (this.world.fordAt(a.x, a.z) || this.world.rulesAt(a.x, a.z).mired) return true
    const r = OBSTACLE.pit.radius
    return (this.state.obstacles ?? []).some((o) => o.kind === 'pit' && o.sprung && this.isHostile(o.faction, a.faction) && Math.abs(o.x - a.x) < r && Math.abs(o.z - a.z) < r && Math.hypot(o.x - a.x, o.z - a.z) < r)
  }

  /** Wagons can hardly get through windfall at all. */
  private wagonGround(w: Convoy): number {
    if (!this.world.def.features?.length) return this.caravanAura(w)
    const k = this.world.featureKindAt(w.x, w.z)
    return (k === 'thicket' ? 0.15 : 1) * this.caravanAura(w)
  }
  /** Wagons near a friendly caravanserai roll 1.5x faster. */
  private caravanAura(w: Convoy): number {
    const team = this.team(w.faction)
    const r = HOLDING_EFFECTS.caravanAura
    for (const c of this.state.castles) {
      if (c.holding !== 'caravanserai' || !this.isVassal(c) || this.team(c.faction) !== team) continue
      if (Math.abs(c.x - w.x) < r && Math.abs(c.z - w.z) < r && Math.hypot(c.x - w.x, c.z - w.z) < r) return HOLDING_EFFECTS.caravanSpeed
    }
    return 1
  }

  /** A hostile barricade blocks this wagon's road. */
  private wagonBlocked(w: Convoy): boolean {
    const r = OBSTACLE.barricade.radius + 8
    return (this.state.obstacles ?? []).some((o) => o.kind === 'barricade' && this.isHostile(o.faction, w.faction) && Math.abs(o.x - w.x) < r && Math.abs(o.z - w.z) < r && Math.hypot(o.x - w.x, o.z - w.z) < r)
  }

  /** Friendly spike stakes at this point (charges fail against troops standing among them). */
  private amongStakes(x: number, z: number, team: Team): boolean {
    return (this.state.obstacles ?? []).some((o) => o.kind === 'stakes' && this.team(o.faction) === team && Math.hypot(o.x - x, o.z - z) < OBSTACLE.stakes.radius)
  }


  /** Effective supply radius: a depot's reach shrinks as its stores run down, and fails when empty. */
  outpostSupplyRange(o: Outpost): number {
    const base = OUTPOST_KINDS[o.kind].supply * this.spread
    if (o.kind !== 'depot') return base
    const stock = o.stock ?? DEPOT.stockMax
    if (stock <= 0) return 0
    return base * (0.4 + 0.6 * (stock / DEPOT.stockMax))
  }

  convoy(id: string | null | undefined) {
    return id ? (this.state.convoys ?? []).find((c) => c.id === id) : undefined
  }

  private updateDepots(dt: number) {
    const convoys = (this.state.convoys ??= [])
    for (const o of this.state.outposts) {
      if (o.kind !== 'depot' || o.progress < 1) continue
      if (o.stock === undefined) o.stock = DEPOT.stockMax
      const team = this.team(o.faction)
      const range = this.outpostSupplyRange(o)
      let drawing = total(o.garrison ?? {})
      if (range > 0) {
        for (const a of this.state.armies) {
          if (this.team(a.faction) !== team) continue
          if (Math.hypot(a.x - o.x, a.z - o.z) < range) drawing += total(a.troops)
        }
      }
      o.stock = Math.max(0, o.stock - (DEPOT.drainBase + drawing * DEPOT.drainPerSoldier) * dt)
      if (o.faction === PLAYER) {
        if (o.stock < 25 && !o.lowWarned) {
          o.lowWarned = true
          this.log('warning', `${o.name} is running short`, o.stock <= 0 ? 'Its stores are empty: it no longer supplies anyone.' : 'Wagons are not getting through. Its supply reach is shrinking.', o.x, o.z)
        } else if (o.stock > 50) o.lowWarned = false
      }
      // Send a wagon train from the nearest friendly castle when stores are not full.
      if (o.stock > DEPOT.stockMax - 8) continue
      if (convoys.some((c) => c.outpostId === o.id)) continue
      if ((o.nextConvoyAt ?? 0) > this.state.time) continue
      o.nextConvoyAt = this.state.time + DEPOT.convoyEvery
      let src: Castle | undefined
      let bd = DEPOT.reach
      for (const c of this.state.castles) {
        if (c.faction === NEUTRAL || this.team(c.faction) !== team || c.battleId) continue
        const d = Math.hypot(c.x - o.x, c.z - o.z)
        if (d < bd) {
          bd = d
          src = c
        }
      }
      if (!src) continue
      const ang = Math.atan2(o.z - src.z, o.x - src.x)
      const g = this.world.gateOf(src.id, o.x, o.z)
      const r = holdingRadius(src) + 20
      const [sx, sz] = g ? this.world.nearestPassable(g[0], g[1]) : this.world.nearestPassable(src.x + Math.cos(ang) * r, src.z + Math.sin(ang) * r)
      const path = this.world.findPath(sx, sz, o.x, o.z)
      convoys.push({
        id: this.newId('w'),
        faction: o.faction,
        outpostId: o.id,
        fromCastleId: src.id,
        x: sx,
        z: sz,
        path: [...path],
        route: [[sx, sz], ...path],
        cargo: DEPOT.cargo,
        heading: ang,
      })
    }
  }

  private updateConvoys(dt: number) {
    const convoys = this.state.convoys
    if (!convoys?.length) return
    const speed = DEPOT.speed * this.climate().speed * this.pace
    for (const w of [...convoys]) {
      // A hostile barricade on the road: the wagons stand and wait (easy pickings).
      const blocked = this.wagonBlocked(w)
      if (w.kind === 'gold') {
        this.updateGoldWagon(w, blocked ? 0 : speed * dt * this.wagonGround(w))
        continue
      }
      const o = this.outpost(w.outpostId)
      if (!o || o.faction !== w.faction) {
        this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
        continue
      }
      // Any hostile army that reaches the wagons seizes them.
      const raider = this.state.armies.find(
        (a) => a.status !== 'retreating' && this.isHostile(a.faction, w.faction) && !this.atPeace(a.faction, w.faction) && Math.abs(a.x - w.x) < DEPOT.seizeDist && Math.abs(a.z - w.z) < DEPOT.seizeDist && Math.hypot(a.x - w.x, a.z - w.z) < DEPOT.seizeDist,
      )
      if (raider) {
        this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
        // The raiders help themselves to the stores.
        raider.morale = Math.min(this.moraleCap(raider), raider.morale + 6)
        if (w.faction === PLAYER) this.log('lost', 'Supply wagons seized', `${raider.name} of ${this.factionName(raider.faction)} took the wagons bound for ${o.name}.`, w.x, w.z)
        else if (raider.faction === PLAYER) this.log('victory', 'Enemy wagons seized', `${raider.name} cut the supply line to ${o.name}.`, w.x, w.z)
        continue
      }
      let step = blocked ? 0 : speed * dt * this.wagonGround(w)
      while (step > 0 && w.path.length) {
        const [px, pz] = w.path[0]
        const d = Math.hypot(px - w.x, pz - w.z)
        if (d <= step) {
          w.x = px
          w.z = pz
          w.path.shift()
          step -= d
        } else {
          w.heading = Math.atan2(pz - w.z, px - w.x)
          w.x += ((px - w.x) / d) * step
          w.z += ((pz - w.z) / d) * step
          step = 0
        }
      }
      if (!w.path.length || Math.hypot(o.x - w.x, o.z - w.z) < 30) {
        o.stock = Math.min(DEPOT.stockMax, (o.stock ?? 0) + w.cargo)
        this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
      }
    }
  }

  // --- Mines and lumber camps ---------------------------------------------------

  site(id: string | null | undefined) {
    return id ? (this.state.sites ?? []).find((x) => x.id === id) : undefined
  }

  /** Gold per second this army would earn at a site (engineers decide the pace, not army size). */
  gatherRate(armyId: string, siteId: string): number {
    const a = this.army(armyId)
    const site = this.site(siteId)
    if (!a || !site) return 0
    const eng = a.troops.engineers ?? 0
    if (eng < RESOURCE.minEngineers) return 0
    return RESOURCE.rate(eng, site.kind)
  }

  /** Why this army cannot work this site, or null. */
  gatherProblem(armyId: string, siteId: string): string | null {
    const a = this.army(armyId)
    const site = this.site(siteId)
    if (!a || !site) return 'Nothing to work here.'
    if ((a.troops.engineers ?? 0) < RESOURCE.minEngineers) return `Needs ${RESOURCE.minEngineers}+ Engineers.`
    if (a.battleId || a.status === 'retreating') return 'Not while fighting or retreating.'
    const w = this.army(site.workerId)
    if (w && w.id !== a.id && w.order.type === 'gather' && Math.hypot(w.x - site.x, w.z - site.z) < 60) {
      return w.faction === a.faction ? `${w.name} is already working it.` : `${this.factionName(w.faction)} holds it: drive them off first.`
    }
    return null
  }

  startGather(armyId: string, siteId: string): string | null {
    const err = this.gatherProblem(armyId, siteId)
    if (err) return err
    this.orderArmy(armyId, { type: 'gather', siteId })
    return null
  }

  private updateResources(dt: number) {
    for (const site of this.state.sites ?? []) {
      const w = this.army(site.workerId)
      const working =
        !!w && w.order.type === 'gather' && w.order.siteId === site.id && !w.battleId && (w.troops.engineers ?? 0) >= RESOURCE.minEngineers && Math.hypot(w.x - site.x, w.z - site.z) < 50
      if (!working) {
        site.workerId = null
        site.stock = Math.min(RESOURCE_STOCK, site.stock + RESOURCE.regen * dt)
        continue
      }
      const amt = Math.min(site.stock, RESOURCE.rate(w.troops.engineers ?? 0, site.kind) * dt)
      site.stock -= amt
      site.carry += amt
      if (amt > 0 && site.stock <= 0 && w.faction === PLAYER) this.log('info', `The ${site.kind === 'mine' ? 'mine' : 'forest'} is worked out`, 'It will recover slowly if left alone.', site.x, site.z)
      // Ship the takings home.
      if (site.carry >= RESOURCE.wagonLoad && this.state.time >= site.nextWagonAt) {
        const home = this.nearestCastle(site.x, site.z, w.faction)
        if (!home) continue
        site.nextWagonAt = this.state.time + RESOURCE.wagonEvery
        const path = this.world.findPath(site.x, site.z, home.x, home.z)
        ;(this.state.convoys ??= []).push({
          id: this.newId('w'),
          faction: w.faction,
          kind: 'gold',
          outpostId: '',
          fromCastleId: home.id,
          gold: Math.round(site.carry),
          x: site.x,
          z: site.z,
          path: [...path],
          route: [[site.x, site.z], ...path],
          cargo: 0,
          heading: Math.atan2(home.z - site.z, home.x - site.x),
        })
        site.carry = 0
      }
    }
  }

  // -------------------------------------------------------------------------
  // Calls for aid
  // -------------------------------------------------------------------------

  aidCallAt(castleId: string) {
    return (this.state.aidCalls ?? []).find((c) => c.castleId === castleId)
  }
  /** Allied lords who could in principle answer (they hold at least one castle). */
  aidAllies(faction: Faction = PLAYER): Faction[] {
    const team = this.team(faction)
    return Object.values(this.state.factions)
      .filter((f) => f.id !== faction && f.team === team && team !== 'N' && this.state.castles.some((c) => c.faction === f.id && !c.village))
      .map((f) => f.id)
  }
  aidReach(): number {
    return AID.reach * this.reach
  }
  /** Why this castle cannot call for aid right now, or null. */
  aidProblem(castleId: string, faction: Faction = PLAYER): string | null {
    const c = this.castle(castleId)
    if (!c || c.faction !== faction) return 'Not your castle.'
    if (c.village) return 'Villages do not call on your allies.'
    if (this.aidCallAt(c.id)) return 'Aid has already been called here.'
    if ((c.aidCooldownUntil ?? 0) > this.state.time) return `Your allies were asked only lately: wait ${Math.ceil((c.aidCooldownUntil ?? 0) - this.state.time)}s.`
    if ((this.state.aidCalls ?? []).filter((x) => x.faction === faction).length >= AID.maxActive) return `At most ${AID.maxActive} calls for aid at once.`
    if (this.aidAllies(faction).length === 0) return 'You have no allies to call on.'
    return null
  }
  /** Ask allied lords to send men to stand in this castle until the danger passes. */
  callForAid(castleId: string, faction: Faction = PLAYER): string | null {
    const err = this.aidProblem(castleId, faction)
    if (err) return err
    const c = this.castle(castleId)!
    const now = this.state.time
    ;(this.state.aidCalls ??= []).push({ id: this.newId('h'), castleId: c.id, faction, team: this.team(faction), startedAt: now, until: now + AID.duration, answered: [], armyIds: [], quietSince: null })
    c.aidCooldownUntil = now + AID.cooldown
    if (faction !== PLAYER && this.team(faction) === this.team(PLAYER) && Math.hypot(c.x - this.capitalOf(PLAYER).x, c.z - this.capitalOf(PLAYER).z) < 2500) this.log('ally', `${this.factionName(faction)} calls for aid`, `${c.name} is threatened. Send an army from the War tab, or station one there.`, c.x, c.z)
    if (faction === PLAYER) this.log('ally', `You call for aid at ${c.name}`, 'Riders go out to your allies. Those who can spare men will send them to stand in the castle until the danger passes.', c.x, c.z)
    this.notify()
    return null
  }
  /** An allied lord sent men in answer to a call. */
  addAidContingent(callId: string, army: Army) {
    const call = (this.state.aidCalls ?? []).find((x) => x.id === callId)
    if (!call) return
    army.aidFor = call.id
    call.armyIds.push(army.id)
  }
  /** Is a castle in danger: under attack, or with a hostile army close by? */
  inDanger(c: Castle): boolean {
    return !!c.battleId || this.threatTo(c) > 0
  }
  /** Soldiers in hostile armies marching on this castle or standing close to it. */
  threatTo(c: Castle): number {
    const r = AID.threat * this.reach
    let n = 0
    for (const a of this.state.armies) {
      if (!this.isHostile(a.faction, c.faction) || this.atPeace(a.faction, c.faction) || a.status === 'retreating') continue
      if (!this.canSee(this.team(c.faction), a)) continue
      // Marching on this castle (a Great Host on the march counts), or simply close by.
      const coming = a.order.type === 'attack' && a.order.castleId === c.id
      if (coming || (Math.abs(a.x - c.x) < r && Math.abs(a.z - c.z) < r && Math.hypot(a.x - c.x, a.z - c.z) < r)) n += total(a.troops)
    }
    return n
  }
  /** The player sends one of their armies to stand in an ally's castle that called for aid. */
  sendAid(callId: string, armyId: string): string | null {
    const call = (this.state.aidCalls ?? []).find((x) => x.id === callId)
    const a = this.army(armyId)
    const c = call && this.castle(call.castleId)
    if (!call || !c) return 'That call for aid is over.'
    if (!a || a.faction !== PLAYER || a.vassalOf) return 'Choose one of your armies.'
    if (a.battleId || a.status === 'retreating') return 'Not while it is fighting or retreating.'
    this.orderArmy(a.id, { type: 'station', castleId: c.id })
    if (!call.answered.includes(PLAYER)) call.answered.push(PLAYER)
    this.log('ally', `${a.name} marches to help ${c.name}`, `They will stand in the castle with ${this.factionName(call.faction)}'s garrison. Call them back whenever you like.`, c.x, c.z)
    this.notify()
    return null
  }
  private updateAidCalls() {
    const calls = this.state.aidCalls
    if (!calls?.length) return
    const now = this.state.time
    for (const call of [...calls]) {
      call.armyIds = call.armyIds.filter((id) => this.army(id))
      const c = this.castle(call.castleId)
      let why: string | null = null
      if (!c || c.faction !== call.faction) why = 'The castle is lost.'
      else if (now >= call.until) why = 'Their lords need them back.'
      else if (now - call.startedAt >= AID.minStay) {
        if (this.inDanger(c)) call.quietSince = null
        else {
          call.quietSince ??= now
          if (now - call.quietSince >= AID.quiet) why = 'The danger has passed.'
        }
      }
      if (!why) continue
      this.state.aidCalls = this.state.aidCalls!.filter((x) => x.id !== call.id)
      let sent = 0
      for (const id of call.armyIds) {
        const a = this.army(id)
        if (!a) continue
        a.aidFor = null
        sent++
        if (a.battleId || a.status === 'retreating') continue
        const home = this.nearestCastle(a.x, a.z, a.faction)
        if (home) this.orderArmy(a.id, { type: 'reinforce', castleId: home.id })
      }
      if (call.faction === PLAYER && c) this.log('ally', `The call for aid at ${c.name} ends`, `${why} ${sent ? `${sent} allied ${sent === 1 ? 'contingent marches' : 'contingents march'} home.` : 'No one came.'}`, c.x, c.z)
    }
  }

  /** A wardens' keep sends riders after an enemy scout, wagon or small raid within 800m. Returns true if it did. */
  private keepPatrol(c: Castle): boolean {
    const R = HOLDING_EFFECTS.keepPatrol * Math.sqrt(this.reach)
    const team = this.team(c.faction)
    let prey: { kind: 'army'; a: Army } | { kind: 'wagon'; w: Convoy } | null = null
    let bd = R
    for (const a of this.state.armies) {
      if (!this.isHostile(a.faction, c.faction) || this.atPeace(a.faction, c.faction) || a.battleId || a.status === 'retreating') continue
      if (total(a.troops) > HOLDING_EFFECTS.keepPrey || !this.canSee(team, a)) continue
      const d = Math.hypot(a.x - c.x, a.z - c.z)
      if (d < bd) {
        bd = d
        prey = { kind: 'army', a }
      }
    }
    for (const w of this.state.convoys ?? []) {
      if (!this.isHostile(w.faction, c.faction) || this.atPeace(w.faction, c.faction)) continue
      const d = Math.hypot(w.x - c.x, w.z - c.z)
      if (d < bd) {
        bd = d
        prey = { kind: 'wagon', w }
      }
    }
    if (!prey) return false
    const g = c.garrison
    const horse = Math.min(Math.floor(g.cavalry ?? 0), HOLDING_EFFECTS.keepBand)
    const send: Troops = horse >= 40 ? { cavalry: horse } : { cavalry: horse, infantry: Math.min(Math.floor(g.infantry ?? 0), HOLDING_EFFECTS.keepBand - horse) }
    if (total(send) < 40) return false
    const order: ArmyOrder = prey.kind === 'army' ? { type: 'intercept', armyId: prey.a.id } : { type: 'raidConvoy', convoyId: prey.w.id }
    const res = this.formArmy(c.id, c.faction, send, { vassal: true, captainName: `${c.name} Warden`, name: `${c.name} Riders`, retreatAt: 0.4, order })
    if (typeof res === 'string') return false
    res.vassalOf = c.id
    c.reliefArmyId = res.id
    if (c.faction === PLAYER) this.log('deploy', `${c.name} rides out`, `${totalInt(res.troops)} wardens give chase ${prey.kind === 'army' ? `to ${prey.a.name}` : 'to enemy wagons'}.`, c.x, c.z)
    return true
  }

  /** A vassal holding ships gold (or volunteers) by wagon to its lord's nearest castle. */
  private sendWagon(c: Castle, load: { gold?: number; manpower?: number }) {
    const home = this.nearestCastle(c.x, c.z, c.faction, undefined, true)
    const f = this.state.factions[c.faction]
    if (!home) {
      if (f && load.gold) f.gold += load.gold
      return
    }
    const path = this.world.findPath(c.x, c.z, home.x, home.z)
    ;(this.state.convoys ??= []).push({
      id: this.newId('w'),
      faction: c.faction,
      kind: 'gold',
      outpostId: '',
      fromCastleId: home.id,
      gold: load.gold ?? 0,
      manpower: load.manpower,
      x: c.x,
      z: c.z,
      path: [...path],
      route: [[c.x, c.z], ...path],
      cargo: 0,
      heading: Math.atan2(home.z - c.z, home.x - c.x),
    })
  }

  /**
   * Vassal villages run themselves: tribute goes out by wagon to the lord's nearest castle,
   * stone walls go up in time, and the militia march to help a besieged castle nearby.
   */
  private updateVassals() {
    const now = this.state.time
    // A band whose village was lost becomes an ordinary army of its lord and heads for the nearest castle.
    for (const a of this.state.armies) {
      if (!a.vassalOf) continue
      const home = this.castle(a.vassalOf)
      if (home && this.isVassal(home) && home.faction === a.faction) continue
      a.vassalOf = null
      const safe = this.nearestCastle(a.x, a.z, a.faction, undefined, true)
      if (safe && !a.battleId && a.status !== 'retreating') this.orderArmy(a.id, { type: 'reinforce', castleId: safe.id }, true)
    }
    for (const c of this.state.castles) {
      if (!this.isVassal(c)) continue
      const kind = this.holdingOf(c)
      const H = HOLDINGS[kind]
      // Tribute wagons (raidable on the road, like mine gold); an abbey sends volunteers instead.
      const due = now >= (c.nextTributeAt ?? 0) && !c.battleId
      if (due && (c.tribute ?? 0) >= 40) {
        c.nextTributeAt = now + H.every
        const gold = Math.round(c.tribute ?? 0)
        c.tribute = 0
        this.sendWagon(c, { gold })
      } else if (due && kind === 'abbey') {
        c.nextTributeAt = now + H.every
        this.sendWagon(c, { manpower: HOLDING_EFFECTS.abbeyManpower[c.tier] ?? 50 })
      }
      // An abbey's prayers: every three minutes the lord's infamy eases.
      if (kind === 'abbey') {
        if (c.nextCleanseAt === undefined) c.nextCleanseAt = now + HOLDING_EFFECTS.abbeyCleanse
        if (now >= c.nextCleanseAt) {
          c.nextCleanseAt = now + HOLDING_EFFECTS.abbeyCleanse
          const f = this.state.factions[c.faction]
          if (f && (f.infamy ?? 0) > 0) {
            f.infamy = (f.infamy ?? 0) - 1
            if (c.faction === PLAYER) this.log('info', `The monks of ${c.name} pray for you`, 'Your name is spoken a little more kindly: infamy -1.', c.x, c.z)
          }
        }
      }
      // Stone walls, raised by the villagers themselves.
      if (c.tier < 2 && now - c.lastCapturedAt > VILLAGE.stoneAfter && !c.battleId) {
        c.tier = 2
        c.maxWalls = VILLAGE.walls[2]
        if (c.faction === PLAYER) this.log('info', `${c.name} is walled in stone`, 'Your vassal village raised stone walls on its own: more militia, more tribute.', c.x, c.z)
      }
      // The militia band out helping the lord.
      let band = this.army(c.reliefArmyId)
      if (band && band.faction !== c.faction) band = undefined
      if (c.reliefArmyId && !band) c.reliefArmyId = null
      if (band) {
        const target = band.order.type === 'station' ? this.castle(band.order.castleId) : null
        // A wardens' patrol is done when its quarry is gone or has led it too far afield.
        const prey = band.order.type === 'intercept' ? this.army(band.order.armyId) : band.order.type === 'raidConvoy' ? this.convoy(band.order.convoyId) : null
        const hunting = (band.order.type === 'intercept' || band.order.type === 'raidConvoy') && !!prey && Math.hypot(band.x - c.x, band.z - c.z) < HOLDING_EFFECTS.keepPatrol * 1.6
        const done = hunting ? false : !target || target.faction !== c.faction || !target.battleId
        if (done && !band.battleId && band.status !== 'retreating' && band.order.type !== 'reinforce') this.orderArmy(band.id, { type: 'reinforce', castleId: c.id }, true)
        continue
      }
      if (c.battleId || total(c.garrison) < VILLAGE.reliefMin) continue
      // Wardens ride out against scouts, wagons and small raiding parties near their keep.
      if (kind === 'keep' && this.keepPatrol(c)) continue
      let need: Castle | undefined
      let bd = VILLAGE.reliefReach * this.reach
      for (const x of this.state.castles) {
        if (x.faction !== c.faction || x.village || !x.battleId) continue
        const d = Math.hypot(x.x - c.x, x.z - c.z)
        if (d < bd) {
          bd = d
          need = x
        }
      }
      if (!need) continue
      const send: Troops = {}
      for (const k in c.garrison) send[k] = Math.floor((c.garrison[k] ?? 0) * 0.6)
      const res = this.formArmy(c.id, c.faction, send, { vassal: true, captainName: `${c.name} Reeve`, name: `${c.name} Militia`, retreatAt: 0.45, order: { type: 'station', castleId: need.id } })
      if (typeof res === 'string') continue
      res.vassalOf = c.id
      c.reliefArmyId = res.id
      if (c.faction === PLAYER) this.log('deploy', `${c.name} sends its militia`, `${totalInt(res.troops)} villagers march to help ${need.name}.`, c.x, c.z)
    }
  }

  /** Gold wagons roll from a mine or lumber camp to a castle; raiders who reach them take the gold. */
  private updateGoldWagon(w: Convoy, step: number) {
    let dest = this.castle(w.fromCastleId)
    if (!dest || dest.faction !== w.faction) {
      dest = this.nearestCastle(w.x, w.z, w.faction)
      if (!dest) {
        this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
        return
      }
      w.fromCastleId = dest.id
      w.path = this.world.findPath(w.x, w.z, dest.x, dest.z)
    }
    const raider = this.state.armies.find(
      (a) => a.status !== 'retreating' && this.isHostile(a.faction, w.faction) && !this.atPeace(a.faction, w.faction) && Math.abs(a.x - w.x) < DEPOT.seizeDist && Math.abs(a.z - w.z) < DEPOT.seizeDist && Math.hypot(a.x - w.x, a.z - w.z) < DEPOT.seizeDist,
    )
    if (raider) {
      this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
      const rf = this.state.factions[raider.faction]
      if (rf) rf.gold += w.gold ?? 0
      const what = w.manpower ? `${w.manpower} volunteers` : `${w.gold} gold`
      if (w.faction === PLAYER) this.log('lost', w.manpower ? 'Volunteers waylaid' : 'Gold wagons seized', `${raider.name} of ${this.factionName(raider.faction)} took ${what}.`, w.x, w.z)
      else if (raider.faction === PLAYER) this.log('victory', w.manpower ? 'Volunteers waylaid' : 'Gold wagons seized', `${raider.name} took ${what} from ${this.factionName(w.faction)}.`, w.x, w.z)
      return
    }
    while (step > 0 && w.path.length) {
      const [px, pz] = w.path[0]
      const d = Math.hypot(px - w.x, pz - w.z)
      if (d <= step) {
        w.x = px
        w.z = pz
        w.path.shift()
        step -= d
      } else {
        w.heading = Math.atan2(pz - w.z, px - w.x)
        w.x += ((px - w.x) / d) * step
        w.z += ((pz - w.z) / d) * step
        step = 0
      }
    }
    if (!w.path.length || Math.hypot(dest.x - w.x, dest.z - w.z) < (dest.village ? holdingRadius(dest) + 25 : wallRadius(dest.tier) + 30)) {
      const f = this.state.factions[w.faction]
      if (f) f.gold += w.gold ?? 0
      // An abbey's volunteers swell the castle's manpower.
      if (w.manpower) dest.manpower = Math.min(this.maxManpower(dest) * 1.2, dest.manpower + w.manpower)
      this.state.convoys = this.state.convoys!.filter((x) => x.id !== w.id)
    }
  }

  /** Player armies are named after their commander; captain-led ones are numbered. */
  private playerArmyName(commanderKey: string | null): string {
    const cmd = commanderKey ? this.commanders.get(commanderKey) : undefined
    if (cmd) return cmd.name
    this.state.armyCounter++
    return `Army ${roman(this.state.armyCounter)}`
  }

  orderArmy(armyId: string, order: ArmyOrder, internal = false) {
    const a = this.army(armyId)
    if (!a || a.status === 'retreating') return
    if (a.vassalOf && !internal) return
    if (order.type === 'join' && this.army(order.armyId)?.vassalOf) return
    // The Royal Guard takes no recruits and joins no other host.
    if (order.type === 'join' && (a.royal || this.army(order.armyId)?.royal)) return
    if (order.type === 'reinforce' && a.royal) order = { type: 'station', castleId: order.castleId }
    // Villages take no outside troops: soldiers sent there stand by instead of vanishing into the militia.
    if (order.type === 'reinforce' && this.castle(order.castleId)?.village && a.vassalOf !== order.castleId) order = { type: 'station', castleId: order.castleId }
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
    if (a.royal) {
      // The Royal Guard does not join a garrison: it waits in the keep of the nearest castle.
      const keep = this.nearestCastle(a.x, a.z, a.faction)
      if (!keep) return 'There is no castle to withdraw to.'
      this.orderArmy(a.id, { type: 'station', castleId: keep.id })
      return null
    }
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
    // Scouts who fled home still tell what they saw.
    if (a.scoutReport && Object.keys(a.scoutReport).length) this.applyReport(a)
    a.scoutReport = undefined
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
    // Engines come along with the troops that pushed them.
    if (src.engines) dst.engines = { ...(dst.engines ?? {}), ...src.engines }
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
    if (a.royal) return 'The Royal Guard never leaves the King.'
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

  // --- Scouting and intelligence ------------------------------------------------

  scoutProblem(armyId: string): string | null {
    const a = this.army(armyId)
    if (!a) return 'No such army.'
    if (total(a.troops) > SCOUT.maxSize) return `Scouts must be a small party (${SCOUT.maxSize} or fewer).`
    if (a.battleId || a.status === 'retreating') return 'Not while fighting or retreating.'
    return null
  }

  startScout(armyId: string, targetId: string): string | null {
    const err = this.scoutProblem(armyId)
    if (err) return err
    const t = this.castle(targetId) ?? this.outpost(targetId) ?? this.army(targetId)
    if (!t) return 'Nothing there to scout.'
    const a = this.army(armyId)!
    a.scoutReport = {}
    a.spottedBy = null
    this.orderArmy(a.id, { type: 'scout', targetId, x: t.x, z: t.z, phase: 'out' })
    if (a.faction === PLAYER) this.log('deploy', `${a.name} rides out to scout`, `Toward ${'name' in t ? t.name : 'the enemy'}. They report only if they make it back.`, a.x, a.z)
    return null
  }

  /** Recall a pursuit party to the army or castle it came from. */
  recallPursuit(armyId: string) {
    const a = this.army(armyId)
    if (!a?.pursuit) return
    const parent = this.army(a.pursuit.parentId)
    const castle = this.castle(a.pursuit.parentId)
    a.pursuit = null
    if (parent && parent.faction === a.faction && parent.status !== 'retreating') this.orderArmy(a.id, { type: 'join', armyId: parent.id })
    else if (castle && castle.faction === a.faction) this.orderArmy(a.id, { type: 'reinforce', castleId: castle.id })
    else {
      const home = this.nearestCastle(a.x, a.z, a.faction)
      if (home) this.orderArmy(a.id, { type: 'reinforce', castleId: home.id })
    }
  }

  /** Does the player see this enemy castle or army exactly (own, allied, neutral, or close to our forces)? */
  seesExactly(target: { x: number; z: number; faction: Faction }): boolean {
    if (!this.isHostile(target.faction, PLAYER) || target.faction === NEUTRAL) return true
    const r = SCOUT.closeSight
    for (const c of this.state.castles) if (c.faction === PLAYER && Math.abs(c.x - target.x) < r && Math.hypot(c.x - target.x, c.z - target.z) < r) return true
    for (const a of this.state.armies) if (a.faction === PLAYER && Math.abs(a.x - target.x) < r && Math.hypot(a.x - target.x, a.z - target.z) < r) return true
    return false
  }

  /** What the player believes about an enemy force: exact, scouted (with age), or rumour. */
  knowledge(id: string): { kind: 'exact' | 'scouted' | 'rumour'; total: number; troops: Troops | null; error: number; age: number } {
    const c = this.castle(id)
    const a = c ? undefined : this.army(id)
    const troops = c?.garrison ?? a?.troops ?? {}
    const n = total(troops)
    const target = c ?? a
    if (!target || this.seesExactly(target)) return { kind: 'exact', total: n, troops, error: 0, age: 0 }
    const intel = this.state.intel?.[id]
    if (intel) {
      const age = this.state.time - intel.at
      // Armies move and fight; their reports go stale twice as fast.
      const life = a ? SCOUT.fresh / 2 : SCOUT.fresh
      if (age < life * 2) return { kind: 'scouted', total: intel.total, troops: intel.troops, error: intel.error + (age > life ? 0.15 : 0), age }
    }
    // A rumour: right order of magnitude, off by up to a third, changing now and then.
    let h = 0
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const bucket = Math.floor(this.state.time / 90)
    const noise = (((h ^ (bucket * 2654435761)) >>> 0) % 1000) / 1000 - 0.5
    const guess = Math.max(10, Math.round((n * (1 + noise * 0.66)) / 50) * 50)
    return { kind: 'rumour', total: guess, troops: null, error: 0.35, age: 0 }
  }

  private scoutHome(a: Army): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null
    let bd = Infinity
    const consider = (x: number, z: number) => {
      const d = Math.hypot(x - a.x, z - a.z)
      if (d < bd) {
        bd = d
        best = { x, z }
      }
    }
    for (const c of this.state.castles) if (c.faction === a.faction && !c.ruined) consider(c.x, c.z)
    for (const o of this.state.outposts) if (o.faction === a.faction && o.progress >= 1) consider(o.x, o.z)
    for (const b of this.state.armies) if (b.faction === a.faction && b.id !== a.id && b.order.type !== 'scout' && !b.pursuit) consider(b.x, b.z)
    return best
  }

  /** Scouts look around: everything hostile in sight goes into their report, counted with some error. */
  private scoutLook(a: Army) {
    const report = (a.scoutReport ??= {})
    const t = this.state.time
    const w = this.state.weather.kind
    const wErr = w === 'storm' ? 0.2 : w === 'rain' ? 0.1 : w === 'snow' ? 0.06 : 0
    const note = (id: string, x: number, z: number, troops: Troops) => {
      const d = Math.hypot(x - a.x, z - a.z)
      const error = 0.06 + wErr + (d / SCOUT.sight) * 0.14
      const skew = 1 + (Math.random() * 2 - 1) * error
      const counted: Troops = {}
      for (const k in troops) counted[k] = Math.max(0, Math.round((troops[k] ?? 0) * skew))
      const prev = report[id]
      if (!prev || prev.error >= error) report[id] = { at: t, total: total(counted), troops: counted, error }
    }
    for (const c of this.state.castles) {
      if (c.ruined || !this.isHostile(c.faction, a.faction) || c.faction === NEUTRAL) continue
      if (Math.hypot(c.x - a.x, c.z - a.z) < SCOUT.sight) note(c.id, c.x, c.z, c.garrison)
    }
    for (const b of this.state.armies) {
      if (!this.isHostile(b.faction, a.faction)) continue
      const d = Math.hypot(b.x - a.x, b.z - a.z)
      if (this.isHidden(b)) {
        // Only found by riding right up to the trees.
        if (d < SCOUT.uncover) {
          b.revealedUntil = t + 90
          if (a.faction === PLAYER) this.log('victory', 'An ambush uncovered', `${a.name} found ${b.name} lying in wait.`, b.x, b.z)
          note(b.id, b.x, b.z, b.troops)
        }
        continue
      }
      if (d < SCOUT.sight) note(b.id, b.x, b.z, b.troops)
    }
  }

  /** The scouts made it home: their report becomes what we know. */
  private deliverReport(a: Army) {
    this.applyReport(a)
    a.order = { type: 'hold' }
    a.status = 'idle'
    const here = this.castleAt(a.x, a.z, 200)
    if (here && here.faction === a.faction) this.orderArmy(a.id, { type: 'reinforce', castleId: here.id })
    else if (a.faction === PLAYER) this.notify()
  }

  private applyReport(a: Army) {
    const report = a.scoutReport ?? {}
    const ids = Object.keys(report)
    if (a.faction === PLAYER) {
      const intel = (this.state.intel ??= {})
      for (const id of ids) intel[id] = report[id]
      const names = ids
        .map((id) => {
          const c = this.castle(id)
          const b = c ? undefined : this.army(id)
          const r = report[id]
          const lo = Math.round((r.total * (1 - r.error)) / 10) * 10
          const hi = Math.round((r.total * (1 + r.error)) / 10) * 10
          return `${c?.name ?? b?.name ?? 'a force'} ${lo}–${hi}`
        })
        .slice(0, 4)
      this.log('info', `${a.name} is back with news`, ids.length ? `Seen: ${names.join(', ')}${ids.length > 4 ? ` and ${ids.length - 4} more` : ''}.` : 'They saw nothing worth reporting.', a.x, a.z)
    } else {
      const f = this.state.factions[a.faction]
      const o = a.order.type === 'scout' ? a.order : null
      if (f && o && this.castle(o.targetId)) {
        f.ai.knownTarget = o.targetId
        f.ai.nextRaidAt = Math.min(f.ai.nextRaidAt, this.state.time + 30)
      }
    }
    a.scoutReport = undefined
  }

  /** Scouts caught: the report is lost, and their captors may learn where they came from. */
  private scoutsLost(a: Army) {
    const killer = this.state.armies.find((b) => b.pursuit?.scoutId === a.id) ?? this.state.armies.find((b) => this.isHostile(b.faction, a.faction) && Math.hypot(b.x - a.x, b.z - a.z) < 120)
    if (a.faction === PLAYER) this.log('lost', `${a.name} never came back`, 'Their report is lost with them.', a.x, a.z)
    if (!killer || Math.random() > 0.6) return
    const home = this.castle(a.homeCastleId) ?? this.nearestCastle(a.x, a.z, a.faction)
    if (!home) return
    // Captives talk: their captors learn of the castle they rode from.
    if (killer.faction === PLAYER) {
      const intel = (this.state.intel ??= {})
      intel[home.id] = { at: this.state.time, total: total(home.garrison), troops: { ...home.garrison }, error: 0.1 }
      this.log('victory', 'Captured scouts talk', `They rode out from ${home.name} of ${this.factionName(home.faction)}. We now know its garrison.`, home.x, home.z)
    } else {
      const f = this.state.factions[killer.faction]
      if (f) {
        f.ai.knownTarget = home.id
        f.ai.nextRaidAt = Math.min(f.ai.nextRaidAt, this.state.time + 45)
      }
      if (a.faction === PLAYER) this.log('warning', 'Our scouts were taken alive', `${this.factionName(killer.faction)} may now know about ${home.name}.`, home.x, home.z)
    }
  }

  /** Scouts look around; observers in range may spot them and send riders; pursuers give up or come home. */
  private updateScouting(_dt: number) {
    const t = this.state.time
    const w = this.state.weather.kind
    const weather = w === 'storm' ? 0.5 : w === 'rain' ? 0.75 : w === 'snow' ? 0.85 : 1
    for (const a of [...this.state.armies]) {
      // Pursuit parties: chase, then come home.
      if (a.pursuit) {
        const p = a.pursuit
        const scout = this.army(p.scoutId)
        if (!(a.order.type === 'intercept' && a.order.armyId === p.scoutId)) a.pursuit = null
        else if (!scout || !scout.scoutReport || t - p.since > SCOUT.pursuitGiveUp || Math.hypot(scout.x - a.x, scout.z - a.z) > 1300) this.recallPursuit(a.id)
        continue
      }
      if (a.order.type !== 'scout' || a.battleId) continue
      this.scoutLook(a)
      if (a.spottedBy) continue
      const stealth = (this.world.forestAt(a.x, a.z) > 0.3 ? 0.6 : 1) * (this.traitsOf(a).ambush > 1 ? 0.7 : 1) * weather
      type Observer = { faction: Faction; army?: Army; castle?: Castle }
      const spotted: Observer[] = []
      const roll = (range: number, x: number, z: number, bonus = 1) => Math.hypot(x - a.x, z - a.z) < range && Math.random() < SCOUT.spotChance * stealth * bonus
      for (const b of this.state.armies) {
        if (b.id === a.id || b.battleId || b.status === 'retreating' || b.order.type === 'scout' || b.pursuit) continue
        if (!this.isHostile(b.faction, a.faction) || this.atPeace(b.faction, a.faction)) continue
        const horse = (b.troops.cavalry ?? 0) / Math.max(1, total(b.troops))
        if (roll(SCOUT.spotArmy * (horse > 0.25 ? 1.25 : 1), b.x, b.z)) spotted.push({ faction: b.faction, army: b })
      }
      for (const c of this.state.castles) {
        if (c.ruined || c.faction === NEUTRAL || total(c.garrison) < 20) continue
        if (!this.isHostile(c.faction, a.faction) || this.atPeace(c.faction, a.faction)) continue
        if (roll(SCOUT.spotCastle, c.x, c.z)) spotted.push({ faction: c.faction, castle: c })
      }
      for (const o of this.state.outposts) {
        if (o.progress < 1 || !this.isHostile(o.faction, a.faction)) continue
        if (roll(o.kind === 'redoubt' ? SCOUT.spotTower : SCOUT.spotOutpost, o.x, o.z)) {
          const guard = this.state.armies.find((b) => b.faction === o.faction && !b.battleId && Math.hypot(b.x - o.x, b.z - o.z) < OUTPOST.radius)
          spotted.push({ faction: o.faction, army: guard })
        }
      }
      if (spotted.length === 0) continue
      // Several saw them at once: the player's people act first, otherwise chance decides.
      const mine = spotted.filter((s) => s.faction === PLAYER)
      const who = mine.length ? mine[Math.floor(Math.random() * mine.length)] : spotted[Math.floor(Math.random() * spotted.length)]
      a.spottedBy = who.faction
      this.sendPursuit(a, who)
    }
  }

  private sendPursuit(scout: Army, who: { faction: Faction; army?: Army; castle?: Castle }) {
    const pool = who.army?.troops ?? who.castle?.garrison
    const where = who.army ?? who.castle
    const horse = Math.floor(pool?.cavalry ?? 0)
    const want = Math.max(SCOUT.pursuitMin, Math.round(total(scout.troops) * 1.6))
    const n = Math.min(horse, want)
    if (who.faction === PLAYER && where) this.log('warning', 'Enemy scouts spotted', n >= 12 ? `Riders from ${'name' in where ? where.name : 'our lines'} give chase.` : 'We have no riders to send after them.', scout.x, scout.z)
    if (scout.faction === PLAYER) this.log('warning', `${scout.name} has been spotted`, n >= 12 ? 'Enemy riders are on their heels. Ride hard.' : 'They have been seen, but nobody follows.', scout.x, scout.z)
    if (!pool || !where || n < 12) return
    pool.cavalry = (pool.cavalry ?? 0) - n
    if (who.army) who.army.initialTotal = Math.max(1, who.army.initialTotal - n)
    const [sx, sz] = this.world.nearestPassable(where.x + (scout.x - where.x) * 0.1, where.z + (scout.z - where.z) * 0.1)
    const home = who.castle ?? this.nearestCastle(where.x, where.z, who.faction)
    const army: Army = {
      id: this.newId('a'),
      name: who.faction === PLAYER ? 'Outriders' : 'Pursuers',
      faction: who.faction,
      commanderKey: null,
      captainName: 'Outrider Captain',
      x: sx,
      z: sz,
      heading: Math.atan2(scout.z - sz, scout.x - sx),
      path: [],
      pathTarget: null,
      repathAt: 0,
      order: { type: 'intercept', armyId: scout.id },
      status: 'marching',
      troops: { ...emptyTroops(this.unitList), cavalry: n },
      initialTotal: n,
      morale: 0,
      retreatAt: 0.5,
      formation: 'wedge',
      column: false,
      homeCastleId: home?.id ?? '',
      battleId: null,
      battleJoinedAt: 0,
      createdAt: this.state.time,
      kills: 0,
      routedAt: -999,
      hiddenSince: null,
      supplied: true,
      pursuit: { scoutId: scout.id, parentId: where.id, since: this.state.time },
    }
    army.morale = this.moraleCap(army)
    this.state.armies.push(army)
  }

  // --- Villages -----------------------------------------------------------------

  /** Terms a free village offers this realm, or why it will not talk. */
  villageTerms(castleId: string, faction: Faction = PLAYER): { price: number; chance: number; reason: string | null } {
    const c = this.castle(castleId)
    if (!c || !c.village) return { price: 0, chance: 0, reason: 'Not a village.' }
    if (c.ruined) return { price: 0, chance: 0, reason: 'Nothing is left to bargain with.' }
    if (c.faction !== NEUTRAL) return { price: 0, chance: 0, reason: 'The village already has a lord.' }
    if (c.battleId) return { price: 0, chance: 0, reason: 'Not while fighting rages there.' }
    const f = this.state.factions[faction]
    const rank = this.rankOf(faction)
    const infamy = f?.infamy ?? 0
    const near = this.state.castles.filter((x) => x.faction === faction && !x.village && Math.hypot(x.x - c.x, x.z - c.z) < 1400).length
    const militia = total(c.garrison)
    const price = Math.round((200 + militia * 1.7) * HOLDINGS[this.holdingOf(c)].price * (1.2 - 0.06 * rank) * (1 + 0.35 * infamy))
    const king = this.state.armies.some((a) => a.royal && a.faction === faction && Math.hypot(a.x - c.x, a.z - c.z) < 420)
    const chance = clamp(0.5 + 0.06 * rank + 0.1 * Math.min(2, near) - 0.14 * infamy + (king ? ROYAL.envoy : 0), 0.12, 0.95)
    let reason: string | null = null
    if ((c.talksCooldown ?? 0) > this.state.time) reason = `The elders will not hear envoys again for ${Math.ceil((c.talksCooldown ?? 0) - this.state.time)}s.`
    else {
      const army = this.state.armies.some((a) => a.faction === faction && Math.hypot(a.x - c.x, a.z - c.z) < VILLAGE.envoyArmyReach)
      const castle = this.state.castles.some((x) => x.faction === faction && !x.village && Math.hypot(x.x - c.x, x.z - c.z) < this.envoyReach())
      if (!army && !castle) reason = 'Too far from your lands: bring an army close, or hold a castle nearby.'
      else if (f && f.gold < price) reason = `Needs ${price} gold.`
    }
    return { price, chance, reason }
  }

  /** How far from one of your castles envoys can still reach a village (grows with the map). */
  envoyReach(): number {
    return VILLAGE.envoyCastleReach * this.reach
  }

  /** Offer a free village protection and coin. On success it joins the realm, militia and all. */
  negotiateVillage(castleId: string, faction: Faction = PLAYER): string | null {
    const c = this.castle(castleId)
    const t = this.villageTerms(castleId, faction)
    if (!c || t.reason) return t.reason
    const f = this.state.factions[faction]
    if (Math.random() < t.chance) {
      f.gold -= t.price
      c.faction = faction
      c.tier = 1
      c.maxWalls = VILLAGE.walls[1]
      c.walls = VILLAGE.walls[1]
      c.lastCapturedAt = this.state.time
      c.tribute = 0
      c.nextTributeAt = this.state.time + VILLAGE.tributeEvery
      this.events.push({ type: 'captured', castleId: c.id, faction })
      if (faction === PLAYER) this.log('capture', `${c.name} swears fealty`, `For ${t.price} gold the village becomes your vassal. Its ${totalInt(c.garrison)} militia defend it and help your castles nearby, and tribute rolls to your nearest castle.`, c.x, c.z)
      else if (this.isHostile(faction, PLAYER) && Math.hypot(c.x - this.capitalOf(PLAYER).x, c.z - this.capitalOf(PLAYER).z) < 2500) this.log('warning', `${c.name} sides with ${this.factionName(faction)}`, 'A village has joined the enemy.', c.x, c.z)
    } else {
      const lost = Math.round(t.price * 0.4)
      f.gold -= lost
      c.talksCooldown = this.state.time + 150
      if (faction === PLAYER) this.log('warning', `${c.name} turns your envoys away`, `${lost} gold in gifts is lost. They will not talk again for a while.`, c.x, c.z)
    }
    this.notify()
    return null
  }

  private capitalOf(f: Faction): { x: number; z: number } {
    const c = this.castle(this.state.factions[f]?.capitalId) ?? this.state.castles.find((x) => x.faction === f)
    return c ?? { x: 0, z: 0 }
  }

  /** A free village taken by force: loot, captives, and a burned ruin nobody can use. */
  private plunderVillage(c: Castle, winners: Army[]) {
    const main = [...winners].sort((x, y) => total(y.troops) - total(x.troops))[0]
    const captor = main.faction
    const H = HOLDINGS[this.holdingOf(c)]
    const loot = Math.round(H.loot[0] + Math.random() * (H.loot[1] - H.loot[0]))
    const captives = Math.round(40 + c.manpower * 0.6)
    const f = this.state.factions[captor]
    if (f) {
      f.gold += loot
      f.infamy = (f.infamy ?? 0) + H.infamy
    }
    const home = this.nearestCastle(c.x, c.z, captor)
    if (home) home.manpower = Math.min(this.maxManpower(home) * 1.2, home.manpower + captives)
    c.ruined = true
    c.garrison = emptyTroops(this.unitList)
    c.walls = 0
    c.maxWalls = 0
    c.manpower = 0
    c.subtitle = 'Ruins'
    c.lastCapturedAt = this.state.time
    this.events.push({ type: 'castle_changed', castleId: c.id })
    this.credit(captor).captures++
    if (captor === PLAYER) this.log('capture', `${c.name} is plundered`, `${loot} gold and ${captives} captives taken. The village burns; other villages will trust you less.`, c.x, c.z)
    else if (Math.hypot(c.x - this.capitalOf(PLAYER).x, c.z - this.capitalOf(PLAYER).z) < 2500) this.log('warning', `${this.factionName(captor)} plunders ${c.name}`, 'The village is burned to the ground.', c.x, c.z)
  }

  // --- Realm ranks -------------------------------------------------------------

  /**
   * Ranks measure a realm's total military strength against one yardstick
   * shared by every realm in this war: the player's starting strength.
   * Steady play takes the player to about one rank short of the top.
   */
  initRanks() {
    const size = this.state.rules.size ?? 'medium'
    const max = RANK_MAX[size]
    // Measured against the player's starting strength, so other lords' ranks read relative to yours.
    const start = Math.max(this.totals(PLAYER).totalPower, 300)
    const reach = RANK_REACH[this.state.rules.mode][size]
    // Rank 1 at the start; rank (max - 1) at start × reach.
    const growth = Math.pow(reach, 1 / Math.max(1, max - 2))
    this.state.ranks = { base: start * growth * 0.92, growth, max }
    for (const f of Object.keys(this.state.factions)) this.state.factions[f].rank = this.rankFor(this.totals(f).totalPower, 1)
  }

  /** Strength needed to hold a rank. */
  rankThreshold(rank: number): number {
    const r = this.state.ranks
    if (!r || rank <= 1) return 0
    return r.base * Math.pow(r.growth, rank - 2)
  }

  get maxRank(): number {
    return this.state.ranks?.max ?? 6
  }

  rankOf(f: Faction): number {
    if (f === NEUTRAL) return 0
    return this.state.factions[f]?.rank ?? 1
  }

  /** Castle splendour (0–5) follows the owner's realm rank. */
  splendourOf(c: Castle): number {
    if (c.village) return 0
    const r = this.rankOf(c.faction)
    if (r <= 1) return 0
    return Math.round(((r - 1) / Math.max(1, this.maxRank - 1)) * 5)
  }

  private rankFor(power: number, current: number): number {
    let r = 1
    while (r < this.maxRank && power >= this.rankThreshold(r + 1)) r++
    // Hysteresis: a rank is only lost once strength falls well below it.
    if (r < current && power >= this.rankThreshold(current) * 0.85) return current
    return r
  }

  private updateRanks() {
    if (!this.state.ranks) this.initRanks()
    for (const [fid, f] of Object.entries(this.state.factions)) {
      if (fid === NEUTRAL || !f.alive) continue
      const prev = f.rank ?? 1
      const next = this.rankFor(this.totals(fid).totalPower, prev)
      if (next === prev) continue
      f.rank = next
      if (fid === PLAYER) {
        if (next > prev) this.log('victory', `Your realm rises to rank ${next}`, next === this.maxRank ? 'The highest standing in this war. Your castles stand at their grandest.' : 'Your castles grow grander, and every lord takes note.')
        else this.log('warning', `Your realm falls to rank ${next}`, 'Heavy losses have cost us standing.')
      } else if (next === this.maxRank && next > prev) {
        this.log('info', `${f.name} reaches rank ${next}`, 'The mightiest realm in the war.')
      }
    }
  }

  /** Armies far from friendly castles, outposts or camps lose men and morale. */
  private updateSupply(dt: number) {
    const clim = this.climate()
    for (const a of this.state.armies) {
      const team = this.team(a.faction)
      const reach = this.traitsOf(a).supply
      let ok = false
      for (const c of this.state.castles) {
        if (this.team(c.faction) !== team || c.faction === NEUTRAL) continue
        if (Math.hypot(c.x - a.x, c.z - a.z) < this.supplyRange(c) * reach * this.groundSupply(c.x, c.z, clim.supply)) {
          ok = true
          break
        }
      }
      if (!ok) {
        for (const o of this.state.outposts) {
          if (o.progress >= 1 && this.team(o.faction) === team && Math.hypot(o.x - a.x, o.z - a.z) < this.outpostSupplyRange(o) * reach * this.groundSupply(o.x, o.z, clim.supply)) {
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

  /** Abandon an outpost; a wagon laager packs up and returns 70% of its cost. */
  dismantleOutpost(id: string, faction: Faction = PLAYER): string | null {
    const o = this.outpost(id)
    if (!o || o.faction !== faction) return 'Not your outpost.'
    const def = OUTPOST_KINDS[o.kind]
    const back = Math.round(this.outpostCost(faction, o.kind) * def.refund * (o.progress >= 1 ? 1 : o.progress))
    this.state.factions[faction].gold += back
    this.emptyDepot(o, 'sally')
    this.state.outposts = this.state.outposts.filter((x) => x.id !== id)
    if (faction === PLAYER && back) this.log('info', `${o.name} is packed up`, `The wagons roll on: ${back} gold recovered.`, o.x, o.z)
    this.notify()
    return null
  }

  /** What an outpost costs this realm (a guildhall knocks some off). */
  outpostCost(f: Faction, kind: OutpostKind): number {
    return Math.round(OUTPOST_KINDS[kind].cost * this.buildDiscount(f))
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
      const cost = this.outpostCost(a.faction, kind)
      if (!reason && (!f || f.gold < cost)) reason = `Needs ${cost} gold.`
      return { kind, ok: !reason, reason }
    })
  }

  private outpostSiteProblem(a: Army): string | null {
    if (a.battleId || a.status === 'retreating') return 'Not while fighting or retreating.'
    if ((a.troops.engineers ?? 0) < MIN_ENGINEERS) return `Needs at least ${MIN_ENGINEERS} Engineers in the army.`
    return this.siteProblemAt(a.faction, a.x, a.z)
  }

  /** Why an outpost cannot stand at this spot (ignoring who builds it), or null. */
  siteProblemAt(faction: Faction, x: number, z: number, kind?: OutpostKind): string | null {
    if (this.state.outposts.filter((o) => o.faction === faction).length >= OUTPOST.maxPerFaction) return `At most ${OUTPOST.maxPerFaction} outposts.`
    for (const c of this.state.castles) {
      const clear = c.village ? OUTPOST.villageClearance : OUTPOST.castleClearance
      if (Math.hypot(c.x - x, c.z - z) - holdingRadius(c) < clear) return `Too close to ${c.name}.`
    }
    for (const r of this.state.sites ?? []) if (Math.hypot(r.x - x, r.z - z) < 60) return 'Too close to a mine or lumber camp.'
    if (this.state.outposts.some((o) => Math.hypot(o.x - x, o.z - z) < OUTPOST.spacing)) return 'Too close to another outpost.'
    if (this.world.bridgeAt(x, z, 20) || this.world.heightAt(x, z) < 3 || !this.world.isPassable(x, z)) return 'Cannot build on a bridge or in the water.'
    if (kind && !this.terrainSuits(kind, x, z)) return `Needs: ${OUTPOST_KINDS[kind].terrain.toLowerCase()}.`
    return null
  }

  /** Outposts go up anywhere on dry ground that is not a cliff. */
  terrainSuits(_kind: OutpostKind, x: number, z: number): boolean {
    return this.world.slopeAt(x, z) < 0.8
  }

  /** Can this army build any outpost here? Returns null if yes. */
  canBuildOutpost(armyId: string): string | null {
    const opts = this.outpostOptions(armyId)
    if (opts.some((o) => o.ok)) return null
    return opts[0]?.reason ?? 'Cannot build here.'
  }

  /** Pay for an outpost where the army stands; its engineers stay to build it. */
  buildOutpost(armyId: string, kind: OutpostKind = 'castrum'): string | null {
    const opt = this.outpostOptions(armyId).find((o) => o.kind === kind)
    if (!opt) return 'No such army.'
    if (!opt.ok) return opt.reason
    const a = this.army(armyId)!
    const def = OUTPOST_KINDS[kind]
    this.state.factions[a.faction].gold -= this.outpostCost(a.faction, kind)
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
    if (a.faction === PLAYER) this.log('deploy', `Engineers begin a ${def.name}`, `${a.name} stays to build it (about ${Math.round(buildSeconds(a.troops.engineers ?? 0, kind))}s).`, o.x, o.z)
    return null
  }


  private updateOutposts(dt: number) {
    for (const o of [...this.state.outposts]) {
      const team = this.team(o.faction)
      let defended = false
      let attackers = 0
      let alarm = false
      for (const a of this.state.armies) {
        const d = Math.hypot(a.x - o.x, a.z - o.z)
        if (this.team(a.faction) === team) {
          if (d < OUTPOST.radius && a.status !== 'retreating') defended = true
        } else if (a.status !== 'retreating' && this.isHostile(a.faction, o.faction) && !this.atPeace(a.faction, o.faction)) {
          if (d < 70 && !a.battleId) attackers++
          if (d < DEPOT.alarmDist) alarm = true
        }
      }
      // Troops quartered in a depot march out to meet an enemy at the gate.
      if (alarm && !defended && o.kind === 'depot' && total(o.garrison ?? {}) >= 1) {
        if (this.emptyDepot(o, 'sally')) defended = true
      }
      if (attackers > 0 && !defended) o.raze += dt / OUTPOST.razeSeconds
      else o.raze = Math.max(0, o.raze - dt / 30)
      if (o.raze >= 1) {
        // An undefended outpost is taken, not burned: its new owners can use it (and its engines) against us.
        const taker = this.state.armies.find((a) => a.status !== 'retreating' && !a.battleId && this.isHostile(a.faction, o.faction) && Math.hypot(a.x - o.x, a.z - o.z) < 70)
        this.emptyDepot(o, 'lost')
        const was = o.faction
        o.raze = 0
        if (taker) {
          o.faction = taker.faction
          o.stock = o.kind === 'depot' ? Math.min(o.stock ?? DEPOT.stockMax, DEPOT.stockMax * 0.3) : o.stock
          if (was === PLAYER) this.log('lost', `${o.name} is taken`, `${this.factionName(taker.faction)} seized the undefended outpost.`, o.x, o.z)
          else if (taker.faction === PLAYER) this.log('victory', `${o.name} is ours`, `We seized an outpost of ${this.factionName(was)}.`, o.x, o.z)
        } else {
          this.state.outposts = this.state.outposts.filter((x) => x.id !== o.id)
        }
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
      const off = holdingRadius(castle) + 70
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
      if (!target || target.ruined || this.team(target.faction) === m.team) {
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
      this.updateDepots(1)
      this.updateWorks(1)
      this.updateResources(1)
      this.updateScouting(1)
      this.towerFire()
      this.updateSupply(1)
      this.updateRanks()
      this.nextEconomyAt = t + 1
    }
    if (t >= this.nextAutoRecruitAt) {
      this.autoRecruit()
      this.nextAutoRecruitAt = t + 3
    }
    for (const ai of this.ais.values()) ai.update()
    for (const a of [...this.state.armies]) this.updateArmy(a, dt)
    this.updateConvoys(dt)
    this.updateVassals()
    this.updateAidCalls()
    this.updateTrebuchets()
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
      if (c.ruined) continue
      if (f.team === 'N') {
        // Free towns and villages slowly rebuild their militia.
        const cap = c.village ? VILLAGE.freeMilitia * (this.holdingOf(c) === 'keep' ? 1.4 : 1) : c.tier * 260
        if (!c.battleId && total(c.garrison) < cap) {
          if (c.village) {
            const mix = HOLDINGS[this.holdingOf(c)].mix
            for (const k of ['infantry', 'cavalry', 'archers'] as const) c.garrison[k] = (c.garrison[k] ?? 0) + 0.22 * dt * mix[k]
          } else c.garrison.infantry = (c.garrison.infantry ?? 0) + 0.4 * dt
        }
      } else if (c.village) {
        // A vassal village: raises its own militia and owes its lord tribute.
        const n = total(c.garrison)
        if (!c.battleId && n < this.capacity(c)) {
          const add = (VILLAGE.militiaRegen[c.tier] ?? 0.35) * clim.manpower * dt * (this.holdingOf(c) === 'keep' ? 1.3 : 1)
          const mix = HOLDINGS[this.holdingOf(c)].mix
          c.garrison.infantry = (c.garrison.infantry ?? 0) + add * mix.infantry
          c.garrison.cavalry = (c.garrison.cavalry ?? 0) + add * mix.cavalry
          c.garrison.archers = (c.garrison.archers ?? 0) + add * mix.archers
        }
        if (!c.battleId) c.tribute = (c.tribute ?? 0) + this.tributeRate(c) * this.incomeMult(c.faction) * clim.income * dt
      } else {
        f.gold += this.castleIncome(c) * this.incomeMult(c.faction) * clim.income * dt
      }
      const mpBoost = clim.manpower
      c.manpower = Math.min(this.maxManpower(c), c.manpower + this.manpowerRegen(c) * mpBoost * dt)
      if (!c.battleId && c.walls < c.maxWalls && (c.sappedUntil ?? 0) <= s.time) c.walls = Math.min(c.maxWalls, c.walls + c.tier * 3 * dt * (!c.village && this.guildTier(c.faction) ? HOLDING_EFFECTS.guildWalls : 1))
    }
    const soldiers = new Map<Faction, number>()
    // The Royal Guard costs nothing to keep in the field.
    for (const a of s.armies) if (!a.royal) soldiers.set(a.faction, (soldiers.get(a.faction) ?? 0) + total(a.troops))
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
    // Riding out of an outrider pavilion: a burst of speed and a hard first blow.
    const inPavilion = !!lodge && OUTPOST_KINDS[lodge.kind].sortie
    if (a.inPavilion && !inPavilion && a.status !== 'retreating') a.sortieUntil = this.state.time + 20
    a.inPavilion = inPavilion
    const ground = this.world.def.features?.length ? this.world.featureKindAt(a.x, a.z) : null
    if (ground === 'wadi' || (a.status === 'idle' && lodge && OUTPOST_KINDS[lodge.kind].hides)) {
      // Down in a dry ravine (moving or not) or inside a forest lodge: out of sight at once.
      a.hiddenSince = Math.min(a.hiddenSince ?? this.state.time, this.state.time - HIDE_SECONDS)
    } else if (a.status === 'idle' && ground === 'thicket') {
      // Windfall: hidden after 5 seconds instead of 8.
      if (a.hiddenSince === null) a.hiddenSince = this.state.time - (HIDE_SECONDS - 5)
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
      if (this.moveTowards(a, c.x, c.z, dt, this.arriveDist(c), 1.1)) {
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
      if (Math.hypot(c.x - a.x, c.z - a.z) < holdingRadius(c) + 16) {
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
        if (c.ruined) {
          a.order = { type: 'hold' }
          break
        }
        if (!this.isHostile(c.faction, a.faction)) {
          a.order = { type: 'station', castleId: c.id }
          break
        }
        if (this.moveTowards(a, c.x, c.z, dt, c.village ? holdingRadius(c) + 28 : wallRadius(c.tier) + 40)) this.beginSiege(a, c)
        break
      }
      case 'station':
      case 'reinforce': {
        const c = this.castle(o.castleId)
        if (!c) {
          a.order = { type: 'hold' }
          break
        }
        if (this.moveTowards(a, c.x, c.z, dt, this.isHostile(c.faction, a.faction) ? holdingRadius(c) + 30 : this.arriveDist(c))) {
          a.status = 'idle'
          if (o.type === 'reinforce' && c.faction === a.faction && c.village && a.vassalOf !== c.id) a.order = { type: 'station', castleId: c.id }
          else if (o.type === 'reinforce' && c.faction === a.faction) this.mergeIntoCastle(a, c)
          else if (o.type === 'reinforce' && this.isHostile(c.faction, a.faction)) a.order = { type: 'hold' }
        }
        break
      }
      case 'garrison': {
        const site = this.outpost(o.outpostId)
        if (!site || site.kind !== 'depot' || site.faction !== a.faction || site.progress < 1) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          break
        }
        if (this.moveTowards(a, site.x, site.z, dt, 30)) {
          a.status = 'idle'
          this.quarterInDepot(a, site)
        }
        break
      }
      case 'work': {
        if (this.moveTowards(a, o.x, o.z, dt, 18)) {
          a.status = 'idle'
          if ((a.troops.engineers ?? 0) < WORKS[o.job].engineers) {
            a.order = { type: 'hold' }
            break
          }
          o.progress += dt / this.workSeconds(a, o.job)
          if (o.progress >= 1) {
            // Back to what the army was doing (an attack, say), or stand.
            a.order = o.then ?? { type: 'hold' }
            this.finishWork(a, o.job, o.bridge, o.tx, o.tz)
          }
        }
        break
      }
      case 'scout': {
        if (o.phase === 'out') {
          const t = this.army(o.targetId)
          if (t) {
            o.x = t.x
            o.z = t.z
          }
          if (this.state.time >= a.repathAt) {
            a.path = []
            a.pathTarget = null
            a.repathAt = this.state.time + 6
          }
          if (this.moveTowards(a, o.x, o.z, dt, SCOUT.arrive)) {
            o.phase = 'back'
            a.path = []
            a.pathTarget = null
          }
        } else {
          const home = this.scoutHome(a)
          if (!home) {
            a.order = { type: 'hold' }
            break
          }
          if (this.moveTowards(a, home.x, home.z, dt, SCOUT.deliver)) this.deliverReport(a)
        }
        break
      }
      case 'gather': {
        const site = this.site(o.siteId)
        if (!site) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          break
        }
        if (this.moveTowards(a, site.x, site.z, dt, 30)) {
          a.status = 'idle'
          const other = this.army(site.workerId)
          if (other && other.id !== a.id && other.order.type === 'gather' && Math.hypot(other.x - site.x, other.z - site.z) < 60) break
          site.workerId = a.id
        }
        break
      }
      case 'raidConvoy': {
        const w = this.convoy(o.convoyId)
        if (!w) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          break
        }
        if (this.state.time >= a.repathAt) {
          a.path = []
          a.pathTarget = null
          a.repathAt = this.state.time + 6
        }
        // Aim a little ahead of the wagons.
        const lead = w.path[0] ?? [w.x, w.z]
        const ld = Math.hypot(lead[0] - w.x, lead[1] - w.z) || 1
        const ahead = Math.min(60, ld)
        this.moveTowards(a, w.x + ((lead[0] - w.x) / ld) * ahead, w.z + ((lead[1] - w.z) / ld) * ahead, dt, 8, 1)
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
            site.progress = Math.min(1, site.progress + (dt * builder) / buildSeconds(a.troops.engineers ?? 0, site.kind))
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
          a.repathAt = this.state.time + 6
        }
        if (this.moveTowards(a, t.x, t.z, dt, 30) && !t.battleId) this.mergeArmies(t, a)
        break
      }
      case 'intercept': {
        const target = this.army(o.armyId)
        // Anyone (player or AI) loses an enemy that slips into hiding out of reach.
        if (!target || !this.canSee(this.team(a.faction), target)) {
          a.order = { type: 'hold' }
          a.status = 'idle'
          if (a.faction === PLAYER) this.log('info', `${a.name} lost the trail`, 'The enemy force slipped out of sight.', a.x, a.z)
          break
        }
        if (this.state.time >= a.repathAt) {
          a.path = []
          a.pathTarget = null
          a.repathAt = this.state.time + 6
        }
        const via = this.rearApproach(a, target)
        this.moveTowards(a, via ? via.x : target.x, via ? via.z : target.z, dt, 10, 1)
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
    // Re-plan only when the goal has moved a fair way relative to how far it still is.
    if (!a.pathTarget || Math.hypot(a.pathTarget[0] - tx, a.pathTarget[1] - tz) > Math.max(25, dGoal * 0.15) || a.path.length === 0) {
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
    for (const ob of this.state.obstacles ?? []) {
      // A sprung mud pit bogs the enemy down; a barricade stops them until they hack through.
      const r = ob.kind === 'pit' ? OBSTACLE.pit.radius : ob.kind === 'barricade' ? OBSTACLE.barricade.radius : 0
      if (!r || (ob.kind === 'pit' && !ob.sprung) || Math.abs(ob.x - a.x) > r || Math.abs(ob.z - a.z) > r) continue
      if (this.isHostile(ob.faction, a.faction) && Math.hypot(ob.x - a.x, ob.z - a.z) < r) zoc = Math.min(zoc, ob.kind === 'pit' ? OBSTACLE.pit.slow : 0)
    }
    const t = this.state.time
    const burst = ((a.sortieUntil ?? 0) > t ? 1.25 : 1) * ((a.slowedUntil ?? 0) > t ? 0.7 : 1)
    let budget = this.armySpeed(a) * this.world.speedAt(a.x, a.z) * this.featureStep(a) * burst * speedMult * zoc * dt
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
      if (a.order.type === 'scout') continue
      if (this.inKeep(a)) continue
      const team = this.team(a.faction)
      for (const b of this.state.battles) {
        const sc = b.kind === 'siege' ? this.castle(b.castleId) : undefined
        const near = sc ? holdingRadius(sc) + 70 : JOIN_DIST
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
        if (this.inKeep(a) || this.inKeep(b)) continue
        if (!this.isHostile(a.faction, b.faction) || this.atPeace(a.faction, b.faction)) continue
        if (Math.hypot(a.x - b.x, a.z - b.z) > ENGAGE_DIST) continue
        if (t - a.routedAt < 6 || t - b.routedAt < 6) continue
        // Scouts slip past everyone except riders sent after them.
        if (a.order.type === 'scout' && !(b.order.type === 'intercept' && b.order.armyId === a.id)) continue
        if (b.order.type === 'scout' && !(a.order.type === 'intercept' && a.order.armyId === b.id)) continue
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
    const rear = this.isRearAttack(a, b, side)
    if (rear) {
      a.flankUntil = this.state.time + REAR.seconds
      for (const id of (side === 'A' ? b.sideB : b.sideA).armyIds) {
        const e = this.army(id)
        if (!e) continue
        const steady = 1 - clamp((this.commanderOf(e)?.morale_bonus ?? 0) / 120, 0, 0.4)
        e.morale = Math.max(0, e.morale - REAR.moraleShock * steady)
      }
    }
    if (a.faction === PLAYER) {
      b.playerInvolved = true
      if (rear) this.log('victory', `${a.name} strikes from behind!`, `The enemy is pinned at ${b.location}: a charge into their rear, and their nerve wavers.`, b.x, b.z)
      else this.log('battle', `${a.name} joins the fight`, `Reinforcing at ${b.location}.`, b.x, b.z)
    } else if (rear && (side === 'A' ? b.sideB : b.sideA).armyIds.some((id) => this.army(id)?.faction === PLAYER)) {
      this.log('warning', 'Attacked from behind!', `${a.name} falls on our rear at ${b.location}.`, b.x, b.z)
    }
  }

  /**
   * A rear attack: joining a fight that is already under way, from the far
   * side of the enemy (opposite our own engaged line, or the walls they besiege).
   */
  private isRearAttack(a: Army, b: Battle, side: 'A' | 'B'): boolean {
    if (this.state.time - b.startedAt < REAR.minElapsed) return false
    const own = side === 'A' ? b.sideA : b.sideB
    const foe = side === 'A' ? b.sideB : b.sideA
    let ex = 0
    let ez = 0
    let en = 0
    for (const id of foe.armyIds) {
      const e = this.army(id)
      if (!e) continue
      ex += e.x
      ez += e.z
      en++
    }
    if (!en) return false
    ex /= en
    ez /= en
    let fx = 0
    let fz = 0
    let fn = 0
    for (const id of own.armyIds) {
      const f = id === a.id ? null : this.army(id)
      if (!f) continue
      fx += f.x
      fz += f.z
      fn++
    }
    if (!fn) {
      // Relieving a besieged castle: the walls are the anvil.
      const c = b.kind === 'siege' && side === 'B' ? this.castle(b.castleId) : null
      if (!c) return false
      fx = c.x
      fz = c.z
      fn = 1
    } else {
      fx /= fn
      fz /= fn
    }
    const ux = fx - ex
    const uz = fz - ez
    const vx = a.x - ex
    const vz = a.z - ez
    const d = Math.hypot(ux, uz) * Math.hypot(vx, vz)
    if (d < 1) return false
    return (ux * vx + uz * vz) / d < REAR.cosine
  }

  /** Where to approach an engaged enemy army so as to hit it from behind. */
  rearApproach(a: Army, target: Army): { x: number; z: number } | null {
    const b = target.battleId ? this.battle(target.battleId) : undefined
    if (!b) return null
    const side = b.sideA.armyIds.includes(target.id) ? 'A' : 'B'
    const other = side === 'A' ? b.sideB : b.sideA
    if (other.team !== this.team(a.faction)) return null
    let fx = 0
    let fz = 0
    let fn = 0
    for (const id of other.armyIds) {
      const f = id === a.id ? null : this.army(id)
      if (!f) continue
      fx += f.x
      fz += f.z
      fn++
    }
    if (!fn) {
      const c = b.kind === 'siege' ? this.castle(b.castleId) : null
      if (!c) return null
      fx = c.x
      fz = c.z
    } else {
      fx /= fn
      fz /= fn
    }
    let dx = target.x - fx
    let dz = target.z - fz
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    const vx = a.x - target.x
    const vz = a.z - target.z
    const vl = Math.hypot(vx, vz) || 1
    // Already coming in from behind: go straight in.
    if ((vx * dx + vz * dz) / vl > 0.5) return { x: target.x + dx * 40, z: target.z + dz * 40 }
    // Otherwise swing wide around the flank nearer to us, clear of the melee.
    const px = -dz
    const pz = dx
    const sideSign = vx * px + vz * pz >= 0 ? 1 : -1
    const ang = (75 * Math.PI) / 180
    const ox = dx * Math.cos(ang) + px * sideSign * Math.sin(ang)
    const oz = dz * Math.cos(ang) + pz * sideSign * Math.sin(ang)
    const wx = target.x + ox * 240
    const wz = target.z + oz * 240
    if (Math.hypot(a.x - wx, a.z - wz) < 60) return { x: target.x + dx * 40, z: target.z + dz * 40 }
    return { x: wx, z: wz }
  }

  private forcesOf(b: Battle, side: 'A' | 'B'): Force[] {
    const s = side === 'A' ? b.sideA : b.sideB
    const out: Force[] = []
    const t = this.state.time
    for (const id of s.armyIds) {
      const a = this.army(id)
      if (!a) continue
      const camp = b.kind === 'field' ? this.outpostAt(a.x, a.z, this.team(a.faction), OUTPOST.radius + 30) : undefined
      // Troops stationed at a besieged castle man its walls alongside the garrison.
      const sc = b.kind === 'siege' && side === 'B' && a.order.type === 'station' && a.order.castleId === b.castleId ? this.castle(b.castleId) : undefined
      const onWalls = !!sc && Math.hypot(a.x - sc.x, a.z - sc.z) < holdingRadius(sc) + 90
      const mired = b.kind === 'field' && this.mired(a)
      const feat = b.kind === 'field' && this.world.def.features?.length ? this.world.featureKindAt(a.x, a.z) : null
      const ground = feat
        ? {
            melee: feat === 'stones' ? FEATURES.stonesTaken : 1,
            ranged: feat === 'stones' ? FEATURES.stonesTaken : feat === 'thicket' ? FEATURES.thicketArrows : 1,
            charge: feat === 'terraces' ? FEATURES.terraceCharge : 1,
            rangedOut: feat === 'terraces' ? FEATURES.terraceRanged : 1,
            cavOut: 1,
            noCharge: false,
          }
        : undefined
      // No square can be formed in the water or the mud.
      const fm = mired && a.formation === 'square' ? FORMATIONS.line : (FORMATIONS[a.formation] ?? FORMATIONS.line)
      out.push({
        troops: a.troops,
        cmd: this.commanderOf(a),
        level: this.commanderLevel(a),
        morale: a.morale,
        terrainDef: onWalls ? (sc!.walls > 0 ? 2.2 : 1.3) : b.kind === 'field' ? this.world.defenseAt(a.x, a.z) * (camp ? OUTPOST_KINDS[camp.kind].defense : 1) * (feat === 'terraces' ? FEATURES.terraceDefense : 1) : 1,
        // Palisades and walls break any charge against their defenders.
        // Walls, palisades, stakes or a ring of standing stones break any charge.
        formation: onWalls || feat === 'stones' || (camp && OUTPOST_KINDS[camp.kind].braces) || (b.kind === 'field' && this.amongStakes(a.x, a.z, this.team(a.faction))) ? { ...fm, bracesCharge: true } : fm,
        inColumn: a.column && t - a.battleJoinedAt < COLUMN.reformSeconds,
        mired,
        ground,
        campArchers: camp ? OUTPOST_KINDS[camp.kind].archers : undefined,
        royal: !!a.royal,
        presence: this.inPresence(a),
        sheltered: !!camp || onWalls,
        traits: this.traitsOf(a),
        army: a,
        castle: null,
        flank: (a.flankUntil ?? 0) > t,
      })
    }
    if (b.kind === 'siege' && side === 'B') {
      const c = this.castle(b.castleId)
      if (c && this.team(c.faction) === s.team && total(c.garrison) >= 0.5) {
        out.push({
          troops: c.garrison,
          cmd: null,
          level: 1,
          morale: (c.shakenUntil ?? 0) > t ? 85 - ENGINES.ramShock : 85,
          // A siege tower's bridge on the walls robs the defenders of them.
          terrainDef: c.walls > 0 && !this.towerAt(b) ? 2.2 : 1.3,
          formation: FORMATIONS.line,
          inColumn: false,
          sheltered: true,
          traits: NO_TRAITS,
          army: null,
          castle: c,
          flank: false,
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
    // A siege tower lets the stormers fight on the walls as if they were down.
    const wallsUp = !!castle && castle.walls > 0 && !this.towerAt(b)
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
    const rear: Troops = {}
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
        if (f.flank) m *= REAR.attack
        if (f.ground) m *= u.category === 'ranged' ? f.ground.rangedOut : u.category === 'cavalry' ? f.ground.cavOut : 1
        if (u.category === 'ranged' && f.campArchers) m *= f.campArchers
        if (f.army && (f.army.sortieUntil ?? 0) > this.state.time) m *= 1.6
        if (f.royal) m *= ROYAL.attack
        if (f.presence) m *= ROYAL.auraAttack
        let extra = 0
        let rearExtra = 0
        if (f.flank && !f.inColumn) {
          // A charge into the back of a line: no spear wall or palisade faces it.
          if (u.category === 'cavalry') rearExtra = m * Math.max(0.5, 0.5 * fm.charge + (fm.charge - 1))
          else if (u.category === 'infantry') rearExtra = m * 0.15
        }
        if (b.kind === 'field') {
          if (elapsed < 6) m *= u.category === 'ranged' ? 1.8 : u.category === 'cavalry' ? 0.6 : 0.35
          else if (chargeWindow && !f.inColumn && !f.mired && !f.ground?.noCharge) {
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
          if (rearExtra > 0) rear[j] = (rear[j] ?? 0) + rearExtra * share * ctr
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
        const g = f.ground
        const dmg =
          (melee[j] ?? 0) * (g?.melee ?? 1) +
          (ranged[j] ?? 0) * fm.rangedTaken * (g?.ranged ?? 1) * (f.army?.engines?.mantlet ? ENGINES.mantletArrows : 1) * (f.army?.engines?.ram && wallsUp ? ENGINES.ramArrows : 1) +
          (cavalry[j] ?? 0) * fm.cavalryTaken * (g?.melee ?? 1) +
          (charge[j] ?? 0) * (fm.bracesCharge ? 0 : fm.cavalryTaken) * (g?.charge ?? 1) +
          (rear[j] ?? 0)
        let killed = (dmg * k * share * fm.taken * (f.cmd?.defense_mod ?? 1) * f.traits.taken * (f.mired ? OBSTACLE.pit.taken : 1) * (f.royal ? ROYAL.taken : 1) * (f.presence ? ROYAL.auraTaken : 1)) / f.terrainDef
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
      for (const f of A) sp += siegePower(f.troops, this.units, f.cmd) * f.traits.siege * (f.army?.engines?.ram ? ENGINES.ramSiege : 1)
      sp *= this.climate().siege
      // Sapping: enough engineers undermine the walls, and they will not mend for a while even if we fall back.
      const sappers = A.reduce((n, f) => n + (f.troops.engineers ?? 0), 0)
      if (sappers >= SAPPING.engineers) {
        if ((castle.sappedUntil ?? 0) <= this.state.time && castle.faction === PLAYER) this.log('warning', `${castle.name} is being undermined`, 'Enemy sappers dig under the walls: they will not mend for three minutes.', castle.x, castle.z)
        castle.sappedUntil = this.state.time + SAPPING.seconds
      }
      const before = castle.walls
      castle.walls = Math.max(0, castle.walls - sp * WALL_K * dt)
      if (before > 0 && castle.walls <= 0) {
        b.note = 'The walls are breached!'
        // The ram's thunder at the gate: the garrison's nerve breaks.
        if (A.some((f) => f.army?.engines?.ram)) castle.shakenUntil = this.state.time + 90
        if (castle.faction === PLAYER) this.log('warning', `${castle.name}'s walls are breached`, 'The enemy is pouring into the bailey.', castle.x, castle.z)
        else if (b.sideA.armyIds.some((id) => this.army(id)?.faction === PLAYER)) this.log('battle', `Breach at ${castle.name}`, 'Our troops storm through the broken walls.', castle.x, castle.z)
      }
    }

    // Enemy horse in a field fight put the torch to a siege tower.
    if (b.kind === 'field' && this.state.time - b.startedAt > 6) {
      for (const [mine, foes] of [[A, B], [B, A]] as const) {
        const horse = foes.reduce((n, f) => n + (f.troops.cavalry ?? 0), 0)
        if (horse < 30) continue
        for (const f of mine) {
          if (!f.army?.engines?.tower) continue
          f.army.engines = { ...f.army.engines, tower: false }
          if (f.army.faction === PLAYER) this.log('lost', 'The siege tower burns', `Enemy horsemen set fire to ${f.army.name}'s belfry.`, f.army.x, f.army.z)
        }
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
      const R = (castle.village ? holdingRadius(castle) : wallRadius(castle.tier)) + 30
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
      if (f.presence && drop > 0) drop *= ROYAL.auraMorale
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
    if (a.scoutReport) this.scoutsLost(a)
    if (a.royal && a.faction === PLAYER) {
      this.state.kingFallen = true
      this.state.royalId = null
      this.log('lost', 'The King has fallen', `The Royal Guard is ${how}. With the Sovereign gone, the realm cannot fight on.`, a.x, a.z)
    }
    if (a.commanderKey) {
      const s = this.state.commanders[a.commanderKey]
      if (s) s.woundedUntil = this.state.time + 120 * this.woundFactor(s.owner)
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
    // Taking a free village by force is plunder: loot and captives, and the village is gone.
    if (c.village && c.faction === NEUTRAL) {
      this.plunderVillage(c, winners)
      return
    }
    const prev = c.faction
    const main = [...winners].sort((x, y) => total(y.troops) - total(x.troops))[0]
    const captor = main.faction
    this.kingsFlight(c, winners)
    c.faction = captor
    c.lastCapturedAt = this.state.time
    c.tribute = 0
    c.nextTributeAt = this.state.time + VILLAGE.tributeEvery
    c.reliefArmyId = null
    c.walls = Math.round(c.maxWalls * 0.25)
    c.manpower = Math.min(c.manpower, this.maxManpower(c) * 0.3)
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
      this.log('capture', `${c.name} is ours!`, c.village ? `${c.name} is now our vassal village: it pays tribute and fights for us on its own.` : `Our banner flies over ${c.name}. Income +${this.castleIncome(c).toFixed(1)}/s.`, c.x, c.z)
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
  /** Mangonel redoubts, while manned, lob stones at enemy armies and walls in range. */
  private towerFire() {
    const t = this.state.time
    for (const o of this.state.outposts) {
      const k = OUTPOST_KINDS[o.kind]
      if (!k.bombard || o.progress < 1 || (o.nextShotAt ?? 0) > t) continue
      const team = this.team(o.faction)
      const manned = this.state.armies.some((a) => this.team(a.faction) === team && a.status !== 'retreating' && Math.hypot(a.x - o.x, a.z - o.z) < OUTPOST.radius + 20)
      if (!manned) continue
      const range = k.bombard * (this.world.heightAt(o.x, o.z) > 32 ? 1.2 : 1)
      let target: Army | null = null
      let best = range
      for (const a of this.state.armies) {
        if (!this.isHostile(a.faction, o.faction) || a.status === 'retreating' || !this.canSee(team, a)) continue
        const d = Math.hypot(a.x - o.x, a.z - o.z)
        if (d < best) {
          best = d
          target = a
        }
      }
      o.nextShotAt = t + 4
      if (target) {
        const n = total(target.troops)
        const lost = Math.min(n, Math.max(3, n * 0.02) * this.climate().siege)
        target.troops = scaleTroops(target.troops, (n - lost) / Math.max(1, n))
        target.slowedUntil = t + 4
        this.events.push({ type: 'hit', x: target.x, z: target.z, amount: lost, team: this.team(target.faction), ranged: true })
        continue
      }
      // No army in reach: batter an enemy castle's walls instead.
      const c = this.state.castles.find((c) => !c.village && c.walls > 0 && this.isHostile(c.faction, o.faction) && Math.hypot(c.x - o.x, c.z - o.z) < range + wallRadius(c.tier))
      if (c) {
        c.walls = Math.max(0, c.walls - 60)
        this.events.push({ type: 'hit', x: c.x, z: c.z, amount: 60, team: this.team(c.faction), ranged: true })
      }
    }
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
    } else if (lost || eliminated || this.state.kingFallen) status = 'defeat'
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
    // Sight grows with the map, so marching armies sweep wide lanes and leave no scattered fog pockets.
    const f = this.reach
    for (const c of this.state.castles) {
      const rel = this.relation(c.faction)
      if (rel === 'self') stamp(c.x, c.z, (450 + c.tier * 70) * f)
      else if (rel === 'ally') stamp(c.x, c.z, (380 + c.tier * 55) * f)
    }
    for (const o of this.state.outposts) if (this.relation(o.faction) === 'self' || this.relation(o.faction) === 'ally') stamp(o.x, o.z, 260 * f)
    for (const a of this.state.armies) {
      const rel = this.relation(a.faction)
      if (rel === 'self') stamp(a.x, a.z, visionRadius(a.troops, this.units, this.commanderOf(a)) * 1.6 * f)
      else if (rel === 'ally') stamp(a.x, a.z, 320 * f)
    }
    for (const b of this.state.battles) if (b.playerInvolved) stamp(b.x, b.z, 220 * f)
    const tex = this.visionTex
    for (let k = 0; k < vis.length; k++) {
      if (vis[k]) this.explored[k] = 1
      tex[k] = this.explored[k] ? 255 : 0
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
