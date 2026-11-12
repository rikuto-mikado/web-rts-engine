// ---------------------------------------------------------------------------
// Content served by the Django API (/api/content/)
// ---------------------------------------------------------------------------

export type UnitCategory = 'infantry' | 'ranged' | 'cavalry' | 'siege'
/** Faction id. 'player' is always the human; 'neutral' are passive free towns. */
export type Faction = string
/** Alliance id: 'A' is the player's side, 'B' the enemy side, 'N' neutral. */
export type Team = 'A' | 'B' | 'N'
export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal'
export type GameMode = 'campaign' | 'alliance' | 'survival' | 'convoy' | 'nightfall'
export type FormationKey = 'line' | 'wedge' | 'square' | 'loose'
export type MapSize = 'small' | 'medium' | 'large'

/** Unit counts keyed by unit type key. Values may be fractional internally. */
export type Troops = Record<string, number>

export interface UnitType {
  key: string
  name: string
  role: string
  description: string
  category: UnitCategory
  attack: number
  defense: number
  speed: number
  siege_power: number
  cost_gold: number
  cost_manpower: number
  vision: number
  pursuit: number
  counters: Record<string, number>
  color: string
}

export interface PortraitSpec {
  skin?: string
  hair?: string
  hair_style?: 'short' | 'cropped' | 'long' | 'bald' | 'shaved' | 'braid' | 'topknot' | 'wild' | 'tied'
  beard?: 'none' | 'full' | 'short' | 'forked' | 'goatee' | 'mustache' | 'stubble'
  beard_color?: string
  /** No helms: a crown or circlet, a cloth hat or headband at most. */
  headgear?: 'none' | 'crown' | 'circlet' | 'chaperon' | 'headband' | 'hood'
  hat?: string
  clothing?: 'gambeson' | 'tabard' | 'fur' | 'cloak' | 'robe' | 'jerkin'
  cloth?: string
  /** Older data called the clothing colour "armor". */
  armor?: string
  trim?: string
  fur?: string
  eyes?: string
  brows?: 'normal' | 'heavy'
  age?: 'young' | 'veteran' | 'old'
  scar?: boolean
  eyepatch?: boolean
  freckles?: boolean
  bg?: string
  female?: boolean
}

export interface CommanderDef {
  key: string
  faction: 'player' | 'enemy'
  name: string
  title: string
  specialty: string
  lore: string
  banner_color: string
  sigil: string
  unit_bonuses: Record<string, number>
  speed_mod: number
  siege_mod: number
  defense_mod: number
  morale_bonus: number
  vision_mod: number
  strengths: string[]
  weaknesses: string[]
  portrait: PortraitSpec
}

export interface CastleDef {
  id: string
  name: string
  subtitle: string
  faction: Faction
  tier: number
  x: number
  z: number
  capital?: boolean
  staging?: boolean
  /** Siege mode: a gatehouse in a wall ring; enemies cannot march past it. */
  gate?: boolean
  /** Siege mode: shoots arrows at nearby enemies. */
  tower?: boolean
  /** Siege mode: a town district strongpoint. */
  district?: boolean
  /** A village: small, won over by negotiation or plundered. */
  holding?: HoldingKind
  village?: boolean
  garrison: Troops
}

export interface FactionDef {
  id: Faction
  name: string
  color: string
  team: Team
  /** Leads its alliance: owns the named enemy commanders, its capital is the alliance's High Seat. */
  leader?: boolean
  /** Periodically gathers a Great Host from several castles. */
  musters?: boolean
  personality?: 'aggressive' | 'balanced' | 'defensive'
  /** The Endless Night: pays no upkeep, needs no supply, holds nothing and is never wiped out; its broken bands crumble to dust. */
  undying?: boolean
}

export interface ScenarioDefinition {
  start: { gold: number; enemy_gold: number }
  victory: { capture: string }
  defeat: { lose: string }
  factions?: FactionDef[]
  castles: CastleDef[]
  rivers: { width: number; points: [number, number][] }[]
  /** Terrain features scattered over the map: standing stones, terraces, windfall, crags. */
  features?: TerrainFeature[]
  /** River crossings: permanent bridges, or shallow fords where `ford` is set. */
  bridges: { x: number; z: number; ford?: boolean }[]
  mountains: { x: number; z: number; r: number; h: number }[]
  lakes: { x: number; z: number; r: number }[]
  forest_density: number
  /** Siege mode: concentric curtain walls; impassable except through their gates. */
  walls?: CityWall[]
  /** Siege mode: a walled town with houses and streets around the citadel. */
  town?: { x: number; z: number; r: number; inner: number; streets: number[]; poly?: [number, number][]; lanes?: [number, number][][] }
  /** Map type / biome key (see biomes.ts); defaults to green vales. */
  biome?: string
  /** Roads: cleared of trees, drawn as packed earth, quicker to march along. */
  roads?: { width: number; points: [number, number][] }[]
  /** Glades: round patches kept clear of trees. */
  clearings?: { x: number; z: number; r: number }[]
  /** Great walls across the land (Frostfire's Long Wall): impassable but at their gates and breaches. */
  ramparts?: Rampart[]
  /** Escarpments: a long, sheer-sided plateau, crossed only through the canyons cut in it. */
  escarpments?: Escarpment[]
}

/**
 * A city wall. A circle round (x, z) of radius r with gates at the given angles; or, when `points`
 * is set, a closed outline following the lie of the land, with its gates at `gatePts` (x, z, r
 * then only bound it).
 */
export interface CityWall {
  x: number
  z: number
  r: number
  gates: number[]
  height: number
  points?: [number, number][]
  gatePts?: [number, number][]
}

export interface Rampart {
  points: [number, number][]
  width: number
  height: number
  /** Ways through: a gatehouse, or (breach) a tumbled gap. */
  gates: { x: number; z: number; breach?: boolean }[]
}
/**
 * An escarpment: the edge of a tableland. Everything to its north stands `height` higher, and the
 * step between is a cliff face `cliff` wide. Ravines (passes) climb from the plain to the top at a
 * walkable slope over `ramp`, between walls of rock.
 */
export interface Escarpment {
  /** The rough line of the edge, west to east (the land wanders well off it). */
  points: [number, number][]
  height: number
  cliff: number
  ramp: number
  passes: { x: number; z: number; w: number }[]
}

export interface Scenario {
  key: string
  name: string
  description: string
  seed: number
  map_size: number
  definition: ScenarioDefinition
}

export interface GameContent {
  unit_types: UnitType[]
  commanders: CommanderDef[]
  scenarios: Scenario[]
}

// ---------------------------------------------------------------------------
// Simulation state (fully JSON serialisable, stored in Campaign.state)
// ---------------------------------------------------------------------------

export interface FactionState extends FactionDef {
  gold: number
  alive: boolean
  capitalId: string | null
  ai: {
    nextDecisionAt: number
    nextRaidAt: number
    nextMusterAt?: number
    nextOutpostAt?: number
    /** A castle our scouts have spied out (raids favour it); or one we learned of from captured scouts. */
    knownTarget?: string | null
    nextScoutAt?: number
    /** Gold set aside for an outpost the lord wants to raise. */
    outpostReserve?: number
    /** An outpost the lord's engineers are on their way to raise. */
    buildPlan?: { armyId: string; kind: 'castrum' | 'laager' | 'redoubt' | 'pavilion' | 'depot'; x: number; z: number } | null
    retakeQueue: { castleId: string; at: number }[]
  }
  host: GreatHostState | null
  /** Realm rank (1 = lowest), driven by total military strength. */
  rank?: number
  /** Villages plundered: other villages distrust the realm. */
  infamy?: number
}

export interface Castle {
  id: string
  name: string
  subtitle: string
  faction: Faction
  tier: number
  baseTier: number
  x: number
  z: number
  capital: boolean
  staging: boolean
  gate: boolean
  tower: boolean
  garrison: Troops
  walls: number
  maxWalls: number
  manpower: number
  battleId: string | null
  lastCapturedAt: number
  /** Player-only: recruitment template applied automatically while gold allows. */
  autoRecruit: string | null
  /** Siege mode: a town district held as a strongpoint. */
  district: boolean
  /** A village (tier 1 = palisade, 2 = stone wall once it is ours). */
  village?: boolean
  /** A plundered village: burned and abandoned, of no use to anyone. */
  ruined?: boolean
  /** What kind of small holding this is (villages and the like); plain villages leave it unset. */
  holding?: HoldingKind
  /** Abbeys: when the next act of penance lifts some of the lord's infamy. */
  nextCleanseAt?: number
  /** Vassal villages: gold owed to the lord, shipped by wagon to the nearest castle. */
  tribute?: number
  nextTributeAt?: number
  /** A ram broke through: the garrison's nerve is shaken until this time. */
  shakenUntil?: number
  /** Sapped: engineers have undermined the walls; they do not mend themselves until this time. */
  sappedUntil?: number
  /** No new call for aid from this castle before this time. */
  aidCooldownUntil?: number
  /** The militia band this vassal village has out helping its lord, if any. */
  reliefArmyId?: string | null
  /** Negotiations broke down: no new envoys until this time. */
  talksCooldown?: number
}

/** A forest to fell or a mine to dig. Engineers working it earn gold, sent home by wagon. */
export interface ResourceSite {
  id: string
  kind: 'mine' | 'lumber'
  x: number
  z: number
  /** Gold left to extract. Recovers slowly while nobody works it. */
  stock: number
  workerId: string | null
  /** Gold extracted and waiting for a wagon. */
  carry: number
  nextWagonAt: number
}

/** What the player's scouts last learned about an enemy castle or army. */
export interface Intel {
  at: number
  /** Soldiers counted (with the error the scouts could not avoid). */
  total: number
  troops: Troops
  /** ± fraction the count may be off by. */
  error: number
}

export type ArmyOrder =
  | { type: 'hold' }
  | { type: 'move'; x: number; z: number }
  | { type: 'attack'; castleId: string }
  | { type: 'intercept'; armyId: string }
  | { type: 'station'; castleId: string }
  | { type: 'reinforce'; castleId: string } // march and merge into the garrison
  | { type: 'join'; armyId: string } // march and merge into another army
  | { type: 'rally'; x: number; z: number; hostId: string }
  | { type: 'build'; outpostId: string } // stay and raise a field fortification
  | { type: 'garrison'; outpostId: string } // march into a supply depot and quarter there
  | { type: 'raidConvoy'; convoyId: string } // chase down an enemy supply train
  | { type: 'escort'; convoyId: string; ahead?: number } // walk beside one of our own wagons (Convoy Raid's gold train)
  | { type: 'work'; job: WorkJob; x: number; z: number; bridge: number | null; progress: number; tx?: number; tz?: number; then?: ArmyOrder } // engineers' field works (tx/tz: the river point a new bridge spans; then: the order to resume)
  | { type: 'gather'; siteId: string } // engineers work a mine or lumber camp
  | { type: 'scout'; targetId: string; x: number; z: number; phase: 'out' | 'back' } // spy out an enemy position and bring the news home

/** Corvin Ashe's sabotage: on a castle (wells, granary, postern) or a field work (stores, works). */
export type SabotageKind = 'wells' | 'granary' | 'postern' | 'stores' | 'works'

export type ArmyStatus = 'idle' | 'marching' | 'battle' | 'sieging' | 'retreating'

export interface Army {
  id: string
  name: string
  faction: Faction
  commanderKey: string | null
  captainName: string | null
  x: number
  z: number
  heading: number
  path: [number, number][]
  pathTarget: [number, number] | null
  repathAt: number
  order: ArmyOrder
  status: ArmyStatus
  troops: Troops
  initialTotal: number
  morale: number
  retreatAt: number // fraction of strength lost that triggers an automatic retreat
  formation: FormationKey
  /** March in column: faster, but caught out of formation for the first seconds of a battle. */
  column: boolean
  homeCastleId: string
  battleId: string | null
  battleJoinedAt: number
  createdAt: number
  kills: number
  routedAt: number
  /** Set when the army has lain still in a forest long enough to be hidden. */
  hiddenSince: number | null
  /** Within reach of a friendly castle, outpost or camp. */
  supplied: boolean
  /** Struck an engaged enemy from behind: rear-attack bonus lasts until this time. */
  flankUntil?: number
  /** Hidden army uncovered by enemy scouts until this time. */
  revealedUntil?: number
  /** A spymaster's band out of the enemy's sight: under cover (concealed) or passing as pilgrims and pedlars (disguised). */
  veil?: 'concealed' | 'disguised'
  /** Found out: it cannot slip back into hiding before this time. */
  unveiledUntil?: number
  /**
   * Steered by hand (the thumb stick): the way it is being pushed (a world direction) and how hard
   * (0-1). The army turns and gathers speed towards it; let go (mag 0), it rolls to a halt.
   */
  steer?: { dx: number; dz: number; mag: number }
  /** Steered by hand: how fast it is moving now (world units a second). */
  vel?: number
  /** The Endless Night: what kind of host this is (drawn as such: the dead, wraith riders, bone archers, demons, a giant). */
  horde?: 'thralls' | 'wraiths' | 'bones' | 'demons' | 'giant'
  /** Convoy Raid: a standing order the army carries out by itself (cleared by any order given by hand). */
  stance?: Stance
  /** Scouts: what they have seen so far, delivered when they get home. */
  scoutReport?: Record<string, Intel>
  /** Scouts who glimpsed the enemy's crowned head: where and when. */
  scoutQueen?: { x: number; z: number; t: number }
  /** Already spotted by the enemy (only one pursuit per scouting party). */
  spottedBy?: string | null
  /** An allied contingent answering a call for aid (the call's id). */
  aidFor?: string | null
  /** The Royal Guard: the Sovereign's household knights. Never reinforced; if they fall, the war is lost. */
  royal?: boolean
  /** The Whisper Blades: Corvin Ashe's own knife-men. Never reinforced (bar an abbey's sanctuary); they strike at commanders, not walls. */
  blades?: boolean
  /** Royal Guard / Whisper Blades: their full number (what an abbey's sanctuary fills them back up to). */
  fullStrength?: number
  /** Whisper Blades: ready to strike again at this time. */
  strikeReadyAt?: number
  /** Corvin Ashe's band at work on an enemy stronghold (done at `doneAt`). */
  sabotage?: { targetId: string; kind: SabotageKind; doneAt: number }
  /** Corvin Ashe's band: ready for the next piece of sabotage at this time. */
  sabotageReadyAt?: number
  /** Resting in one of our abbeys: the wounded tended, the empty places filled. */
  sanctuary?: string | null
  /** Fleeing a fallen castle: a burst of speed until this time. */
  fleeUntil?: number
  /** Siege engines built on the spot and pushed along with the army. */
  engines?: { tower?: boolean; ram?: boolean; mantlet?: boolean }
  /** Riding out of an outrider pavilion: faster and harder-hitting until this time. */
  sortieUntil?: number
  /** Was inside a pavilion last tick (to notice the sortie). */
  inPavilion?: boolean
  /** Shaken by bombardment: slowed until this time. */
  slowedUntil?: number
  /** Militia of a vassal village: they act on their own and go home when the fighting is done. */
  vassalOf?: string | null
  /** A pursuit party: the scouts it hunts, and the army or castle it came from. */
  pursuit?: { scoutId: string; parentId: string; since: number } | null
}

export interface Battle {
  id: string
  kind: 'field' | 'siege'
  x: number
  z: number
  castleId: string | null
  /** Attacker side (for sieges) or the side that started the engagement. */
  sideA: { team: Team; armyIds: string[] }
  sideB: { team: Team; armyIds: string[] }
  startedAt: number
  lossesA: number
  lossesB: number
  initialA: number
  initialB: number
  note: string
  location: string
  forceA: string
  forceB: string
  playerInvolved: boolean
  /** Side that sprang an ambush, and until when its first strike lasts. */
  ambush: { side: 'A' | 'B'; until: number; power: number } | null
}

export interface CommanderState {
  key: string
  owner: Faction
  level: number
  xp: number
  armyId: string | null
  woundedUntil: number
  traits: string[]
  /** Pending choice of traits after a rank-up (player commanders only). */
  traitChoices: string[] | null
  /** Quartered in this supply depot (only armies raised there can take them). */
  stationedAt?: string | null
}

export type ChronicleKind = 'deploy' | 'battle' | 'victory' | 'defeat' | 'retreat' | 'capture' | 'lost' | 'warning' | 'info' | 'ally'

export interface ChronicleEntry {
  id: number
  t: number
  kind: ChronicleKind
  title: string
  detail: string
  x?: number
  z?: number
}

export interface GreatHostState {
  phase: 'idle' | 'mustering' | 'gathered' | 'marching'
  hostId: string | null
  rallyX: number
  rallyZ: number
  detachmentIds: string[]
  nextAt: number
  startedAt: number
  wave: number
}

/** A palisaded field camp built by an army away from castles. */
export interface Outpost {
  id: string
  name: string
  kind: 'castrum' | 'laager' | 'redoubt' | 'pavilion' | 'depot'
  /** Mangonel redoubt: when it may loose its next stone. */
  nextShotAt?: number
  faction: Faction
  x: number
  z: number
  /** A hidden camp raised by a spymaster's band: the enemy does not know it is there until they stumble on it. */
  secret?: boolean
  /** 0..1 construction progress; only a finished outpost gives its bonuses. */
  progress: number
  /** 0..1 progress of enemies burning it down while it stands undefended. */
  raze: number
  builtAt: number
  /** Supply depots: troops quartered inside (out of sight, like a castle garrison). */
  garrison?: Troops
  /** Supply depots: commanders quartered inside; only they can lead armies raised here. */
  commanders?: string[]
  /** Supply depots: stores on hand (0–100). Wagons from friendly castles refill them. */
  stock?: number
  nextConvoyAt?: number
  lowWarned?: boolean
}

export type WorkJob = 'stakes' | 'pit' | 'barricade' | 'pitch' | 'bridge' | 'demolish' | 'tower' | 'ram' | 'mantlet' | 'trebuchet'

/** Field obstacles raised by engineers. */
export interface Obstacle {
  id: string
  kind: 'stakes' | 'pit' | 'barricade' | 'pitch' | 'trebuchet'
  /** Trebuchet: when it may throw again. */
  nextShotAt?: number
  faction: Faction
  x: number
  z: number
  /** Game time when it rots or is cleared away. */
  until: number
  /** Hidden traps (pit, pitch): set off by the first enemy to step in. */
  sprung?: boolean
  /** Barricade: army-seconds of hacking left before it gives way. */
  hp?: number
}

/**
 * A wagon train. Supply wagons run from a castle to a depot; gold wagons run
 * from a mine or lumber camp to a castle. Unarmed: any enemy army that
 * reaches it seizes it (and keeps the gold).
 */
export interface Convoy {
  id: string
  faction: Faction
  kind?: 'supply' | 'gold'
  /** An abbey's wagon of volunteers and nursed men: manpower for the castle it reaches. */
  manpower?: number
  /** Supply wagons: the depot they feed ('' for gold wagons). */
  outpostId: string
  /** Supply wagons: the castle they left. Gold wagons: the castle they head for. */
  fromCastleId: string
  gold?: number
  x: number
  z: number
  /** Remaining waypoints. */
  path: [number, number][]
  /** The whole road, for drawing the supply line. */
  route: [number, number][]
  cargo: number
  heading: number
  /** Convoy Raid: this is gold-train wagon number n (1-based). */
  race?: number
  /** Convoy Raid: the river crossing it is heading for was pulled down; it has turned for a ford. */
  detour?: boolean
  /** Convoy Raid: raiders are unhitching it (seconds so far; it is theirs at TRAIN.seizeSeconds). */
  seize?: number
  seizer?: string
}

/** Small holdings between the castles: all are won by envoys (or plundered) and run themselves as vassals. */
export type HoldingKind = 'village' | 'caravanserai' | 'abbey' | 'keep' | 'guildhall'

export type FeatureKind = 'stones' | 'terraces' | 'thicket' | 'crag'
/** A terrain feature: a round patch of ground with its own rules. */
export interface TerrainFeature {
  kind: FeatureKind
  x: number
  z: number
  r: number
}

/** A call for aid: allies who can spare men send them to stand in the castle until the danger passes. */
export interface AidCall {
  id: string
  castleId: string
  faction: Faction
  team: Team
  startedAt: number
  until: number
  /** Lords who have already decided (yes or no). */
  answered: Faction[]
  armyIds: string[]
  /** When the castle last stopped being in danger. */
  quietSince: number | null
}

/** A player-led alliance muster: allies gather at a rally point, then attack together. */
export interface AllianceMuster {
  id: string
  /** The lord who called it (the player or an AI lord). */
  organizer: Faction
  team: Team
  targetCastleId: string
  /** Rally on one of the player's armies (follows it) or at one of the player's castles. */
  rallyArmyId: string | null
  rallyCastleId: string | null
  rallyX: number
  rallyZ: number
  phase: 'gathering' | 'marching'
  contingentIds: string[]
  answered: Faction[]
  startedAt: number
  /** Gathering ends automatically at this time even if some contingents are late. */
  deadline: number
  marchedAt: number
}

export interface GameRules {
  mode: GameMode
  /** Win when the team holds every listed castle. */
  victoryCastles: string[]
  /** Lose when any of these castles is lost to the enemy team. */
  defeatCastles: string[]
  /** Lose when the player holds no castles at all. */
  defeatOnEliminated: boolean
  /** Siege mode: the battle ends at this game time. */
  timeLimit?: number
  /** Who wins when time runs out. */
  timeoutWinner?: 'A' | 'B'
  size?: MapSize
  /** Convoy Raid: the gold train and the road it takes. */
  convoy?: ConvoyRules
  /** The Long Night: where the dead come from. */
  night?: { rifts: { x: number; z: number; name: string }[] }
}

/** Convoy Raid: a train of gold wagons runs the forest road; one side guards it, the other robs it. */
export interface ConvoyRules {
  /** The side the player takes. */
  side: 'escort' | 'raid'
  /** The commander the player chose (escorts; raiders always follow the spymaster). */
  commander: string
  wagons: number
  /** Seconds between departures. */
  every: number
  /** Wagons the escort must bring in (the raiders win by seizing wagons - needed + 1). */
  needed: number
  /** Wagon speed (world units per second). */
  speed: number
  fromId: string
  toId: string
  /** The road, south to north. */
  road: [number, number][]
  /** Where the road crosses the river: an engineers' bridge that can be pulled down. */
  bridge: [number, number]
  /** Index of the first road point past the river (where wagons rejoin the road after a ford). */
  rejoin: number
  /** The raiders' hidden camps in the forest. */
  camps: [number, number][]
}

/**
 * Convoy Raid standing orders. Escort side: escort (walk beside the next wagon nobody guards),
 * hunt (ride down raiders seen near the wagons), picket (watch a stretch of road from a post; engineers
 * there rebuild the bridge). Raiders: ambush (lie in the trees at a spot and fall on a weakly guarded
 * wagon), harass (pin a wagon's guards in a fight so others can take it), bridge (engineers pull the
 * bridge down as the wagons near it, then wait at the ford).
 */
export type StanceKind = 'escort' | 'hunt' | 'picket' | 'ambush' | 'harass' | 'bridge'
export interface Stance {
  kind: StanceKind
  /** Where to wait (picket, ambush, harass). */
  x?: number
  z?: number
}

/** The Long Night: how the night goes. */
export interface NightState {
  /** Surges so far (the Great Rift's eruptions), and when the next one comes. */
  wave: number
  nextWaveAt: number
  /** The dead slain (in battle and by the walls). */
  slain: number
  /** What the host is about: shown to the player as a warning ("A host gathers before the West Gate"). */
  intent?: { text: string; x: number; z: number; until: number } | null
}

/** Convoy Raid: how the gold train stands. */
export interface TrainState {
  sent: number
  delivered: number
  seized: number
  /** When the next wagon leaves. */
  nextAt: number
  /** The escort has stopped the train. */
  halted: boolean
  /** Each wagon: waiting, on the road (its convoy id), delivered or seized. */
  wagons: ('waiting' | 'delivered' | 'seized' | string)[]
}

export interface GameState {
  version: 2
  /** Realm ranks: strength needed for rank 2, growth per rank, and the top rank in this war. */
  ranks?: { base: number; growth: number; max: number }
  scenario: Scenario
  rules: GameRules
  difficulty: Difficulty
  time: number
  nextId: number
  factions: Record<Faction, FactionState>
  castles: Castle[]
  armies: Army[]
  battles: Battle[]
  outposts: Outpost[]
  convoys?: Convoy[]
  obstacles?: Obstacle[]
  sites?: ResourceSite[]
  /** The player's scouting reports, by castle or army id. */
  intel?: Record<string, Intel>
  /** Bridges engineers have built (in order: index = position in the world's bridge list). */
  builtBridges?: { index: number; x: number; z: number; faction: Faction; broken: boolean }[]
  commanders: Record<string, CommanderState>
  chronicle: ChronicleEntry[]
  explored: string // base64 of the explored grid
  /** The Sovereign's Royal Guard (army id); null once it has fallen. */
  royalId?: string | null
  /** Corvin Ashe's Whisper Blades (null: none in this war, or they are gone). */
  bladesId?: string | null
  /** Attempts made on the Usurper Queen's life: each one makes her guard warier. */
  foeAttempts?: number
  /** Convoy Raid: the gold train. */
  train?: TrainState
  /** The Long Night: the waves of the dead. */
  night?: NightState
  /** The Sovereign has fallen: the war is lost. */
  kingFallen?: boolean
  /** The enemy's crowned head (the Usurper Queen) and her Thorn Guard (army id); null once they have fallen. */
  foeRoyalId?: string | null
  /** The Usurper has fallen: the war is won. */
  foeFallen?: boolean
  /** Where the player's side last knew the Usurper to be. */
  foeSighting?: { x: number; z: number; t: number; castleId: string | null; how: 'seen' | 'scouts' | 'court' } | null
  armyCounter: number
  status: 'active' | 'victory' | 'defeat'
  /** Alliance-wide target requested by the player ("call to arms"). */
  callToArms: { castleId: string; until: number } | null
  /** Alliance musters under way (several at once, called by the player or AI lords). */
  musters: AllianceMuster[]
  /** Calls for aid: allied lords may send troops to stand with a threatened castle. */
  aidCalls?: AidCall[]
  /** Offensive target chosen by each alliance's leader; allied lords converge on it. */
  teamFocus: { A: { castleId: string; until: number } | null; B: { castleId: string; until: number } | null }
  weather: { kind: 'clear' | 'rain' | 'storm' | 'snow'; until: number }
  /** War honours: what each lord has contributed (kills, castles captured). */
  contrib: Record<Faction, { kills: number; captures: number }>
  /** Non-aggression pacts with AI factions: faction id -> expiry time. */
  pacts: Record<Faction, number>
  /** Diplomatic cooldowns after failed or completed approaches. */
  diploCooldown: Record<Faction, number>
  /** How the war unfolded, for the timelapse on the war report. */
  history?: WarHistory
  /** Deeds worth honouring at the end of the war. */
  tally?: WarTally
  stats: {
    battlesWon: number
    battlesLost: number
    enemyKilled: number
    playerLost: number
    castlesTaken: number
  }
}

/** Ownership of every castle and village through the war, sampled every few seconds, and where battles flared. */
export interface WarHistory {
  every: number
  castleIds: string[]
  factionIds: string[]
  /** Per frame: the time, and for each castle an index into `factionIds` (-1: free or ruined). */
  frames: { t: number; owners: number[] }[]
  /** Battles as they began: where, when and how many fought. */
  sparks: { t: number; x: number; z: number; n: number }[]
}

export interface WarTally {
  /** Enemy soldiers slain by armies under each of the player's commanders. */
  commanderKills: Record<string, number>
  /** Wall damage done by each of the player's armies and engines (by id, with the name it bore). */
  wallBreakers: Record<string, { name: string; damage: number }>
  /** Gold taken by seizing enemy wagons, and how many wagons in all. */
  raidGold: number
  wagonsTaken: number
}

/** Emitted by the engine for the renderer (visual effects) and UI (toasts, reports). */
export type GameEvent =
  | { type: 'hit'; x: number; z: number; amount: number; team: Team; ranged: boolean }
  | { type: 'battle_start'; battleId: string; x: number; z: number }
  | { type: 'battle_end'; report: BattleReportPayload }
  | { type: 'captured'; castleId: string; faction: Faction }
  | { type: 'castle_changed'; castleId: string }
  | { type: 'chronicle'; entry: ChronicleEntry }
  | { type: 'game_over'; status: 'victory' | 'defeat' }
  | { type: 'blast'; x: number; z: number }

export interface BattleReportPayload {
  game_time: number
  location: string
  kind: 'field' | 'siege'
  outcome: 'victory' | 'defeat' | 'retreat' | 'withdrew' | 'captured' | 'lost'
  player_force: string
  enemy_force: string
  player_losses: number
  enemy_losses: number
  details: Record<string, unknown>
}
