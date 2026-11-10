/**
 * Maps and their climates. Every map holds three climate zones laid out in its
 * own pattern (a mountain spine, a river delta, a basin...). A climate is a
 * palette and vegetation style plus a few rules: deserts stretch supply lines,
 * marshes bog armies down, volcanic ground ignores winter. Kept deliberately
 * stylised: a few strong colours per climate rather than realistic texturing.
 */

export type ClimateKey =
  | 'temperate'
  | 'taiga'
  | 'alpine'
  | 'desert'
  | 'oasis'
  | 'marsh'
  | 'icefield'
  | 'volcanic'
  | 'steam'
  | 'coast'
  | 'autumn'
  | 'mesa'
  | 'highland'
  | 'grain'
  | 'wasteland'
  | 'lakeland'

export type MapType = 'crown' | 'delta' | 'frostfire' | 'coast' | 'basin' | 'divide'

type RGB = [number, number, number]

export interface ClimateRules {
  /** Supply reach of castles and depots standing here. */
  supply: number
  /** Movement speed here. */
  speed: number
  /** Bogged down: no charging or squares, more losses (like a ford or a mud pit). */
  mired: boolean
  /** Winter: 'immune' (geothermal ground) ignores its march and supply penalties; 'harsh' makes them worse. */
  winter: 'normal' | 'immune' | 'harsh'
  /** How likely villages / mines are to be found here (1 = usual). */
  villages: number
  mines: number
}

export interface Climate {
  key: ClimateKey
  name: string
  grassA: RGB
  grassB: RGB
  forestFloor: RGB
  sand: RGB
  rock: RGB
  earth: RGB
  /** Height at which peaks turn white (lower = snowier). */
  snowLine: number
  /** Fraction of ground covered by snow regardless of height. */
  snowCover: number
  /** How wooded the climate is (multiplies the map's forest). */
  forest: number
  /** Probability a tree is a pine rather than a broadleaf. */
  pines: number
  treeHue: number
  treeLight: number
  /** Snow dusting on canopies, 0..1. */
  treeFrost: number
  /** Optional canopy colours, one picked per tree (autumn leaves, dead or charred woods). */
  canopy?: RGB[]
  /** Charred or dead woods: pines are recoloured too. */
  deadPines?: boolean
  rules: ClimateRules
}

/** What the rest of the code calls a biome: the map's water and haze plus its first climate's palette. */
export type Biome = Climate & { water: number; fog: number }

const R = (o: Partial<ClimateRules> = {}): ClimateRules => ({ supply: 1, speed: 1, mired: false, winter: 'normal', villages: 1, mines: 1, ...o })

export const CLIMATES: Record<ClimateKey, Climate> = {
  temperate: {
    key: 'temperate', name: 'Green lowlands',
    grassA: [0.2, 0.4, 0.1], grassB: [0.4, 0.45, 0.14], forestFloor: [0.14, 0.27, 0.09], sand: [0.7, 0.63, 0.45], rock: [0.47, 0.44, 0.4], earth: [0.5, 0.43, 0.3],
    snowLine: 175, snowCover: 0, forest: 1, pines: 0.35, treeHue: 0.27, treeLight: 0.42, treeFrost: 0, rules: R(),
  },
  taiga: {
    key: 'taiga', name: 'Taiga',
    grassA: [0.22, 0.32, 0.18], grassB: [0.36, 0.4, 0.27], forestFloor: [0.12, 0.2, 0.12], sand: [0.6, 0.58, 0.5], rock: [0.45, 0.45, 0.46], earth: [0.42, 0.38, 0.32],
    snowLine: 120, snowCover: 0.22, forest: 1.35, pines: 0.95, treeHue: 0.36, treeLight: 0.3, treeFrost: 0.2, rules: R({ winter: 'harsh' }),
  },
  alpine: {
    key: 'alpine', name: 'Snowbound peaks',
    grassA: [0.34, 0.42, 0.28], grassB: [0.6, 0.63, 0.62], forestFloor: [0.22, 0.28, 0.2], sand: [0.6, 0.6, 0.58], rock: [0.52, 0.52, 0.54], earth: [0.46, 0.42, 0.38],
    snowLine: 80, snowCover: 0.45, forest: 0.55, pines: 1, treeHue: 0.38, treeLight: 0.3, treeFrost: 0.45, rules: R({ winter: 'harsh', mines: 1.3 }),
  },
  desert: {
    key: 'desert', name: 'Sand sea',
    grassA: [0.78, 0.62, 0.36], grassB: [0.88, 0.74, 0.48], forestFloor: [0.55, 0.45, 0.25], sand: [0.9, 0.78, 0.52], rock: [0.68, 0.5, 0.36], earth: [0.72, 0.56, 0.36],
    snowLine: 999, snowCover: 0, forest: 0.04, pines: 0, treeHue: 0.22, treeLight: 0.36, treeFrost: 0, rules: R({ supply: 0.8, villages: 0.5 }),
  },
  oasis: {
    key: 'oasis', name: 'River jungle',
    grassA: [0.1, 0.36, 0.07], grassB: [0.22, 0.45, 0.1], forestFloor: [0.07, 0.2, 0.05], sand: [0.72, 0.64, 0.42], rock: [0.45, 0.42, 0.36], earth: [0.42, 0.34, 0.22],
    snowLine: 999, snowCover: 0, forest: 1.3, pines: 0.04, treeHue: 0.3, treeLight: 0.36, treeFrost: 0, rules: R({ villages: 1.6 }),
  },
  marsh: {
    key: 'marsh', name: 'Mud flats',
    grassA: [0.26, 0.32, 0.15], grassB: [0.36, 0.36, 0.2], forestFloor: [0.2, 0.24, 0.14], sand: [0.4, 0.38, 0.28], rock: [0.4, 0.38, 0.34], earth: [0.32, 0.27, 0.19],
    snowLine: 999, snowCover: 0, forest: 0.45, pines: 0.15, treeHue: 0.24, treeLight: 0.32, treeFrost: 0, rules: R({ speed: 0.6, mired: true, villages: 0.7 }),
  },
  icefield: {
    key: 'icefield', name: 'Ice fields',
    grassA: [0.84, 0.87, 0.91], grassB: [0.7, 0.75, 0.79], forestFloor: [0.58, 0.63, 0.66], sand: [0.72, 0.74, 0.76], rock: [0.42, 0.45, 0.5], earth: [0.55, 0.53, 0.52],
    snowLine: 60, snowCover: 0.7, forest: 1.05, pines: 1, treeHue: 0.38, treeLight: 0.3, treeFrost: 0.45, rules: R({ winter: 'harsh' }),
  },
  volcanic: {
    key: 'volcanic', name: 'Ash wastes',
    grassA: [0.13, 0.12, 0.1], grassB: [0.22, 0.18, 0.12], forestFloor: [0.1, 0.09, 0.08], sand: [0.3, 0.26, 0.2], rock: [0.12, 0.11, 0.12], earth: [0.2, 0.14, 0.1],
    snowLine: 999, snowCover: 0, forest: 0, pines: 0.5, treeHue: 0.1, treeLight: 0.2, treeFrost: 0, rules: R({ winter: 'immune', mines: 1.6, villages: 0.6 }),
  },
  steam: {
    key: 'steam', name: 'Steaming deadwood',
    grassA: [0.3, 0.29, 0.23], grassB: [0.42, 0.38, 0.28], forestFloor: [0.2, 0.18, 0.15], sand: [0.5, 0.46, 0.38], rock: [0.35, 0.33, 0.32], earth: [0.32, 0.26, 0.2],
    snowLine: 999, snowCover: 0, forest: 0.95, pines: 0.5, treeHue: 0.12, treeLight: 0.3, treeFrost: 0,
    canopy: [[1.25, 0.62, 1.0], [1.65, 0.8, 0.85], [1.05, 0.58, 0.95]], deadPines: true, rules: R({ winter: 'immune' }),
  },
  coast: {
    key: 'coast', name: 'Sunny coast',
    grassA: [0.3, 0.46, 0.14], grassB: [0.5, 0.54, 0.2], forestFloor: [0.18, 0.3, 0.1], sand: [0.88, 0.8, 0.58], rock: [0.55, 0.5, 0.42], earth: [0.55, 0.45, 0.3],
    snowLine: 999, snowCover: 0, forest: 0.55, pines: 0.2, treeHue: 0.26, treeLight: 0.42, treeFrost: 0, rules: R({ villages: 1.8 }),
  },
  autumn: {
    key: 'autumn', name: 'Autumn woods',
    grassA: [0.3, 0.33, 0.12], grassB: [0.46, 0.36, 0.14], forestFloor: [0.34, 0.22, 0.1], sand: [0.7, 0.6, 0.42], rock: [0.48, 0.44, 0.4], earth: [0.5, 0.38, 0.24],
    snowLine: 200, snowCover: 0, forest: 1.45, pines: 0.12, treeHue: 0.27, treeLight: 0.42, treeFrost: 0,
    canopy: [[3.4, 0.9, 0.3], [3.8, 0.55, 0.3], [3.2, 1.35, 0.3], [3.0, 1.1, 0.22], [2.4, 0.42, 0.28], [3.5, 0.7, 0.25]], rules: R(),
  },
  mesa: {
    key: 'mesa', name: 'Red mesas',
    grassA: [0.6, 0.34, 0.18], grassB: [0.72, 0.46, 0.26], forestFloor: [0.45, 0.3, 0.18], sand: [0.8, 0.6, 0.4], rock: [0.6, 0.3, 0.18], earth: [0.6, 0.38, 0.24],
    snowLine: 999, snowCover: 0, forest: 0.12, pines: 0.3, treeHue: 0.18, treeLight: 0.32, treeFrost: 0, rules: R({ villages: 0.5, mines: 2.2 }),
  },
  highland: {
    key: 'highland', name: 'Windswept steppe',
    grassA: [0.48, 0.48, 0.22], grassB: [0.64, 0.58, 0.3], forestFloor: [0.36, 0.36, 0.2], sand: [0.78, 0.7, 0.5], rock: [0.58, 0.52, 0.44], earth: [0.56, 0.46, 0.32],
    snowLine: 260, snowCover: 0, forest: 0.22, pines: 0.15, treeHue: 0.22, treeLight: 0.38, treeFrost: 0, rules: R(),
  },
  grain: {
    key: 'grain', name: 'Golden plains',
    grassA: [0.6, 0.54, 0.18], grassB: [0.78, 0.66, 0.24], forestFloor: [0.36, 0.4, 0.14], sand: [0.82, 0.72, 0.5], rock: [0.56, 0.5, 0.42], earth: [0.58, 0.46, 0.28],
    snowLine: 400, snowCover: 0, forest: 0.32, pines: 0.1, treeHue: 0.24, treeLight: 0.4, treeFrost: 0, rules: R({ villages: 1.6 }),
  },
  wasteland: {
    key: 'wasteland', name: 'Old battlefield',
    grassA: [0.28, 0.26, 0.19], grassB: [0.4, 0.34, 0.24], forestFloor: [0.18, 0.15, 0.12], sand: [0.42, 0.38, 0.3], rock: [0.38, 0.36, 0.34], earth: [0.3, 0.24, 0.18],
    snowLine: 999, snowCover: 0, forest: 0.25, pines: 0.5, treeHue: 0.12, treeLight: 0.3, treeFrost: 0,
    canopy: [[1.25, 0.62, 1.0], [1.65, 0.8, 0.85], [0.8, 0.85, 0.7]], deadPines: true, rules: R({ villages: 0.7, mines: 1.2 }),
  },
  lakeland: {
    key: 'lakeland', name: 'Misty lakes',
    grassA: [0.2, 0.38, 0.2], grassB: [0.3, 0.44, 0.26], forestFloor: [0.12, 0.26, 0.12], sand: [0.7, 0.66, 0.5], rock: [0.46, 0.45, 0.42], earth: [0.46, 0.4, 0.3],
    snowLine: 200, snowCover: 0, forest: 0.7, pines: 0.3, treeHue: 0.3, treeLight: 0.38, treeFrost: 0, rules: R({ villages: 1.2 }),
  },
}

export interface MapGen {
  /** Map-wide forest density (each climate scales it). */
  forest: number
}

export interface MapDef {
  key: MapType
  name: string
  tagline: string
  description: string
  /** The three climates, and where each one lies. */
  zones: [ClimateKey, ClimateKey, ClimateKey]
  /** Short labels for the menu ("North: taiga"...). */
  regions: [string, string, string]
  water: number
  fog: number
  gen: MapGen
  /** Swatch colours for the menu card. */
  swatch: [string, string, string]
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Raw weights of the three zones at a point. u, v run from -1 (west, north) to
 * 1 (east, south); n is a smooth noise value in -1..1 that makes borders wander.
 */
export function zoneWeights(map: MapType, u: number, v: number, n: number): [number, number, number] {
  switch (map) {
    case 'crown': {
      // A snowy spine east-west across the middle; taiga to the north, green lowlands south.
      const t = v + n * 0.14
      const north = sm(0.12, 0.28, -t)
      const south = sm(0.12, 0.28, t)
      return [north, Math.max(0, 1 - north - south), south]
    }
    case 'delta': {
      // Desert all round; a jungle strip along the great river; mud flats at its mouth in the south.
      const d = Math.abs(u + n * 0.12)
      const mouth = sm(0.35, 0.55, v + n * 0.1) * (1 - sm(0.36, 0.5, d))
      const jungle = (1 - sm(0.2, 0.36, d)) * (1 - mouth)
      return [Math.max(0, 1 - jungle - mouth), jungle, mouth]
    }
    case 'frostfire': {
      // Ice in the north-east, ash and obsidian in the south-west, steaming deadwood on the border.
      const s = (u - v) / 2 + n * 0.14
      const ice = sm(0.06, 0.2, s)
      const fire = sm(0.06, 0.2, -s)
      return [ice, Math.max(0, 1 - ice - fire), fire]
    }
    case 'coast': {
      // Red mesas inland (north), autumn woods between, the sunny coast down to the sea (south).
      const t = v + n * 0.15
      const mesa = 1 - sm(-0.25, -0.05, t)
      const coast = sm(0.22, 0.42, t)
      return [mesa, Math.max(0, 1 - mesa - coast), coast]
    }
    case 'basin': {
      // Concentric: misty lakes at the heart, a ring of autumn forest, windswept steppe round the rim.
      const r = Math.hypot(u, v) + n * 0.1
      const lakes = 1 - sm(0.3, 0.42, r)
      const rim = sm(0.62, 0.76, r)
      return [lakes, Math.max(0, 1 - lakes - rim), rim]
    }
    case 'divide': {
      // Snowmelt taiga in the north, the old battlefield in the middle, golden plains in the south.
      const t = v + n * 0.15
      const north = 1 - sm(-0.42, -0.26, t)
      const south = sm(0.18, 0.34, t)
      return [north, Math.max(0, 1 - north - south), south]
    }
  }
}

export const MAPS: Record<MapType, MapDef> = {
  crown: {
    key: 'crown',
    name: 'Shattered Crown',
    tagline: 'Three passes',
    description: 'A snowbound range splits the land east to west. Three passes carry the war across it: ambushes in the northern taiga, open cavalry ground in the green south.',
    zones: ['taiga', 'alpine', 'temperate'],
    regions: ['North: taiga', 'Centre: snowy range', 'South: green lowlands'],
    water: 0x3b7ea1,
    fog: 0xb6c6d4,
    gen: { forest: 0.55 },
    swatch: ['#2f4f3c', '#e9edf2', '#5f8a2e'],
  },
  delta: {
    key: 'delta',
    name: 'Twin Sun Delta',
    tagline: 'River of plenty',
    description: 'Sand sea all round, where cavalry ride fast but supply lines stretch thin. The great river is rich in villages and jungle, slow to cross; its mouth is a sea of mud.',
    zones: ['desert', 'oasis', 'marsh'],
    regions: ['Rim: sand sea (supply 0.8x)', 'River: jungle and villages', 'Mouth: mud flats (slow, no charge)'],
    water: 0x3d8c9a,
    fog: 0xd8c9a8,
    gen: { forest: 0.55 },
    swatch: ['#d9b26a', '#2f7a3a', '#5a5a3a'],
  },
  frostfire: {
    key: 'frostfire',
    name: 'Frostfire Reach',
    tagline: 'Ice and ash',
    description: 'Blizzard-swept ice to the north-east, volcanic ash to the south-west, steaming dead woods between. Winter cripples the ice but never touches the warm ground.',
    zones: ['icefield', 'steam', 'volcanic'],
    regions: ['North-east: ice (harsh winters)', 'Border: steaming deadwood', 'South-west: ash (no winter)'],
    water: 0x5b8aa3,
    fog: 0xb8b4b0,
    gen: { forest: 0.55 },
    swatch: ['#dfe6ee', '#6e675a', '#2a2420'],
  },
  coast: {
    key: 'coast',
    name: 'Gilded Coast',
    tagline: 'Gold and canyons',
    description: 'A rich, open coast thick with villages runs along the sea; inland, red mesas full of mines make a natural fortress of narrow valleys and high ground.',
    zones: ['mesa', 'autumn', 'coast'],
    regions: ['Inland: red mesas and mines', 'Middle: autumn woods', 'Seaward: rich coast'],
    water: 0x2f7fa8,
    fog: 0xcfc4ae,
    gen: { forest: 0.55 },
    swatch: ['#b0583a', '#c0632a', '#3f8a35'],
  },
  basin: {
    key: 'basin',
    name: 'Whispering Basin',
    tagline: 'Lakes in the ring',
    description: 'A great bowl: misty lakes and fords at the heart, the shortest way across; a ring of autumn forest full of ambushes; open steppe round the rim for riders to go the long way.',
    zones: ['lakeland', 'autumn', 'highland'],
    regions: ['Heart: misty lakes', 'Ring: autumn forest', 'Rim: steppe'],
    water: 0x3f7590,
    fog: 0xa9bccb,
    gen: { forest: 0.55 },
    swatch: ['#2f7fa8', '#d9a23a', '#c4a45c'],
  },
  divide: {
    key: 'divide',
    name: 'The Great Divide',
    tagline: 'Rivers to the plain',
    description: 'Two rivers run from the snowy north through an old battlefield of mud and rock to the golden plains of the south. In winter the north freezes and the war moves south.',
    zones: ['taiga', 'wasteland', 'grain'],
    regions: ['North: snowmelt taiga', 'Centre: old battlefield', 'South: golden plains'],
    water: 0x3b7ea1,
    fog: 0xbcc2b8,
    gen: { forest: 0.55 },
    swatch: ['#2f4f3c', '#6e6250', '#d9b84a'],
  },
}

export const MAP_TYPES: MapType[] = ['crown', 'delta', 'frostfire', 'coast', 'basin', 'divide']

export function mapOf(key: string | undefined): MapDef {
  return MAPS[(key as MapType) ?? 'crown'] ?? MAPS.crown
}

/** The map's water and haze with its first climate's palette (for code that needs one palette). */
export function biomeOf(key: string | undefined): Biome {
  const m = mapOf(key)
  return { ...CLIMATES[m.zones[0]], water: m.water, fog: m.fog }
}
