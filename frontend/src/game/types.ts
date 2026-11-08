// ---------------------------------------------------------------------------
// Content served by the Django API (/api/content/)
// ---------------------------------------------------------------------------

export type UnitCategory = 'infantry' | 'ranged' | 'cavalry' | 'siege'
/** Faction id. 'player' is always the human; 'neutral' are passive free towns. */
export type Faction = string
/** Alliance id: 'A' is the player's side, 'B' the enemy side, 'N' neutral. */
export type Team = 'A' | 'B' | 'N'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type GameMode = 'campaign' | 'alliance' | 'survival' | 'siege'
export type SiegeSide = 'attack' | 'defend'
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
  hair_style?: 'short' | 'long' | 'bald' | 'braid' | 'topknot' | 'wild'
  beard?: 'none' | 'full' | 'goatee' | 'mustache' | 'stubble'
  headgear?: 'none' | 'helm' | 'greathelm' | 'crown' | 'circlet' | 'hood' | 'feather_cap' | 'horned'
  armor?: string
  trim?: string
  eyes?: string
  scar?: boolean
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
}

export interface ScenarioDefinition {
  start: { gold: number; enemy_gold: number }
  victory: { capture: string }
  defeat: { lose: string }
  factions?: FactionDef[]
  castles: CastleDef[]
  rivers: { width: number; points: [number, number][] }[]
  bridges: { x: number; z: number }[]
  mountains: { x: number; z: number; r: number; h: number }[]
  lakes: { x: number; z: number; r: number }[]
  forest_density: number
  /** Siege mode: concentric curtain walls; impassable except through their gates. */
  walls?: { x: number; z: number; r: number; gates: number[]; height: number }[]
  /** Siege mode: a walled town with houses and streets around the citadel. */
  town?: { x: number; z: number; r: number; inner: number; streets: number[] }
  /** Map type / biome key (see biomes.ts); defaults to green vales. */
  biome?: string
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
    retakeQueue: { castleId: string; at: number }[]
  }
  host: GreatHostState | null
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
  kind: 'camp' | 'watchtower' | 'lodge' | 'bridgefort' | 'depot'
  faction: Faction
  x: number
  z: number
  /** 0..1 construction progress; only a finished outpost gives its bonuses. */
  progress: number
  /** 0..1 progress of enemies burning it down while it stands undefended. */
  raze: number
  builtAt: number
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
  siegeSide?: SiegeSide
  size?: MapSize
  /** Deployment still pending (siege mode). */
  deployPending?: boolean
}

export interface GameState {
  version: 2
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
  commanders: Record<string, CommanderState>
  chronicle: ChronicleEntry[]
  explored: string // base64 of the explored grid
  armyCounter: number
  status: 'active' | 'victory' | 'defeat'
  /** Alliance-wide target requested by the player ("call to arms"). */
  callToArms: { castleId: string; until: number } | null
  /** Alliance musters under way (several at once, called by the player or AI lords). */
  musters: AllianceMuster[]
  /** Offensive target chosen by each alliance's leader; allied lords converge on it. */
  teamFocus: { A: { castleId: string; until: number } | null; B: { castleId: string; until: number } | null }
  weather: { kind: 'clear' | 'rain' | 'storm' | 'snow'; until: number }
  /** War honours: what each lord has contributed (kills, castles captured). */
  contrib: Record<Faction, { kills: number; captures: number }>
  /** Non-aggression pacts with AI factions: faction id -> expiry time. */
  pacts: Record<Faction, number>
  /** Diplomatic cooldowns after failed or completed approaches. */
  diploCooldown: Record<Faction, number>
  stats: {
    battlesWon: number
    battlesLost: number
    enemyKilled: number
    playerLost: number
    castlesTaken: number
  }
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
