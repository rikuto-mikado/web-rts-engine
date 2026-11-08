/**
 * Map types for random maps: a colour palette and vegetation style (the
 * biome) plus terrain-generation presets. Kept deliberately stylised: a few
 * strong colours per biome rather than realistic texturing.
 */

export type MapType = 'vales' | 'highlands' | 'frozen' | 'steppe' | 'lakelands'

type RGB = [number, number, number]

export interface Biome {
  key: MapType
  name: string
  tagline: string
  description: string
  grassA: RGB
  grassB: RGB
  forestFloor: RGB
  sand: RGB
  rock: RGB
  earth: RGB
  /** Height at which peaks turn white (lower = snowier). */
  snowLine: number
  /** Fraction of ground covered by snow regardless of height (frozen maps). */
  snowCover: number
  water: number
  fog: number
  /** Probability a tree is a pine rather than a broadleaf. */
  pines: number
  /** Hue shift / lightness for tree canopies. */
  treeHue: number
  treeLight: number
  /** Snow dusting on canopies, 0..1. */
  treeFrost: number
  gen: {
    mountains: [number, number] // count for survival, alliance
    mountainSize: [number, number] // radius range
    mountainHeight: [number, number]
    rivers: [number, number] // min, max
    lakes: [number, number] // count for survival, alliance
    lakeSize: [number, number]
    forest: [number, number]
  }
  /** Swatch colours for the menu card. */
  swatch: [string, string, string]
}

export const BIOMES: Record<MapType, Biome> = {
  vales: {
    key: 'vales',
    name: 'Green Vales',
    tagline: 'Balanced',
    description: 'Rolling meadows, scattered woods and a river or two. A fair fight anywhere.',
    grassA: [0.2, 0.4, 0.1],
    grassB: [0.4, 0.45, 0.14],
    forestFloor: [0.14, 0.27, 0.09],
    sand: [0.7, 0.63, 0.45],
    rock: [0.47, 0.44, 0.4],
    earth: [0.5, 0.43, 0.3],
    snowLine: 175,
    snowCover: 0,
    water: 0x3b7ea1,
    fog: 0xa9bccb,
    pines: 0.45,
    treeHue: 0.27,
    treeLight: 0.42,
    treeFrost: 0,
    gen: { mountains: [6, 11], mountainSize: [170, 330], mountainHeight: [140, 230], rivers: [1, 2], lakes: [2, 3], lakeSize: [80, 150], forest: [0.45, 0.62] },
    swatch: ['#5f8a2e', '#3b7ea1', '#2f5d34'],
  },
  highlands: {
    key: 'highlands',
    name: 'Highland Passes',
    tagline: 'Chokepoints',
    description: 'Mountain ranges split the land into valleys. Whoever holds the passes holds the war.',
    grassA: [0.27, 0.38, 0.17],
    grassB: [0.46, 0.43, 0.27],
    forestFloor: [0.16, 0.26, 0.13],
    sand: [0.62, 0.58, 0.46],
    rock: [0.5, 0.48, 0.45],
    earth: [0.45, 0.4, 0.32],
    snowLine: 145,
    snowCover: 0,
    water: 0x356f8c,
    fog: 0xa3b2bd,
    pines: 0.8,
    treeHue: 0.3,
    treeLight: 0.36,
    treeFrost: 0,
    gen: { mountains: [12, 22], mountainSize: [200, 380], mountainHeight: [170, 260], rivers: [1, 1], lakes: [1, 2], lakeSize: [70, 130], forest: [0.45, 0.55] },
    swatch: ['#6b6a4a', '#8d8a83', '#e9edf2'],
  },
  frozen: {
    key: 'frozen',
    name: 'Frozen North',
    tagline: 'Snow & pine',
    description: 'Snowfields and dark pine forests under a pale sky. Forests are thick and slow.',
    grassA: [0.84, 0.87, 0.91],
    grassB: [0.7, 0.75, 0.79],
    forestFloor: [0.58, 0.63, 0.66],
    sand: [0.72, 0.74, 0.76],
    rock: [0.42, 0.45, 0.5],
    earth: [0.55, 0.53, 0.52],
    snowLine: 60,
    snowCover: 0.7,
    water: 0x5b8aa3,
    fog: 0xc7d3dd,
    pines: 1,
    treeHue: 0.38,
    treeLight: 0.3,
    treeFrost: 0.45,
    gen: { mountains: [6, 11], mountainSize: [170, 320], mountainHeight: [140, 220], rivers: [1, 2], lakes: [2, 3], lakeSize: [80, 150], forest: [0.58, 0.7] },
    swatch: ['#dfe6ee', '#2f4f3c', '#5b8aa3'],
  },
  steppe: {
    key: 'steppe',
    name: 'Sunscorched Steppe',
    tagline: 'Open plains',
    description: 'Dry grassland with few trees and fewer rivers. Cavalry rule the open ground.',
    grassA: [0.6, 0.55, 0.3],
    grassB: [0.74, 0.63, 0.38],
    forestFloor: [0.42, 0.42, 0.22],
    sand: [0.84, 0.74, 0.52],
    rock: [0.62, 0.5, 0.4],
    earth: [0.62, 0.5, 0.34],
    snowLine: 400,
    snowCover: 0,
    water: 0x3d8c9a,
    fog: 0xd8c9a8,
    pines: 0.05,
    treeHue: 0.2,
    treeLight: 0.38,
    treeFrost: 0,
    gen: { mountains: [3, 6], mountainSize: [150, 260], mountainHeight: [110, 180], rivers: [1, 1], lakes: [1, 2], lakeSize: [60, 110], forest: [0.18, 0.26] },
    swatch: ['#c4a45c', '#9c7a4a', '#3d8c9a'],
  },
  lakelands: {
    key: 'lakelands',
    name: 'Lakelands',
    tagline: 'Bridges & fords',
    description: 'A maze of lakes and rivers. Bridges become battlefields; outposts guard the crossings.',
    grassA: [0.18, 0.42, 0.16],
    grassB: [0.33, 0.5, 0.2],
    forestFloor: [0.12, 0.28, 0.1],
    sand: [0.74, 0.68, 0.5],
    rock: [0.46, 0.45, 0.42],
    earth: [0.48, 0.42, 0.3],
    snowLine: 190,
    snowCover: 0,
    water: 0x2f7fa8,
    fog: 0xa4c0cf,
    pines: 0.3,
    treeHue: 0.29,
    treeLight: 0.4,
    treeFrost: 0,
    gen: { mountains: [3, 5], mountainSize: [150, 260], mountainHeight: [120, 190], rivers: [2, 3], lakes: [8, 14], lakeSize: [90, 200], forest: [0.45, 0.58] },
    swatch: ['#3f8a35', '#2f7fa8', '#d8cfa0'],
  },
}

export const MAP_TYPES: MapType[] = ['vales', 'highlands', 'frozen', 'steppe', 'lakelands']

export function biomeOf(key: string | undefined): Biome {
  return BIOMES[(key as MapType) ?? 'vales'] ?? BIOMES.vales
}
