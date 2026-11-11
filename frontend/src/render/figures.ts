import * as THREE from 'three'
import { box, cone, cyl, merge, part, sphere } from './geo'

/**
 * Each figure kind is split into a "tinted" geometry (tabards, shields,
 * caparisons — coloured per faction via instance colour) and a "plain"
 * geometry (skin, steel, wood, horses) with baked vertex colours.
 * Models face +Z.
 */
export type FigureKind = 'spearmen' | 'men_at_arms' | 'archers' | 'light_cavalry' | 'knights' | 'siege' | 'engineer' | 'royal_guard'

const SKIN = 0xd9a77e
const STEEL = 0x9aa3ad
const DARK_STEEL = 0x5f6670
const WOOD = 0x6e4d2c
const LEATHER = 0x5a3d26
const HORSE = 0x6b4a32
const HORSE_DARK = 0x3d2b1f
const WHITE = 0xffffff

function horse(color: number): THREE.BufferGeometry[] {
  const g: THREE.BufferGeometry[] = [
    part(box(2.2, 2.4, 5.6), color, { y: 4.1 }),
    part(box(1.3, 2.6, 1.6), color, { y: 5.6, z: 2.9, rx: -0.5 }),
    part(box(1.1, 1.1, 2.4), color, { y: 6.6, z: 3.9, rx: 0.35 }),
    part(box(0.6, 1.6, 0.6), HORSE_DARK, { y: 5.0, z: -3.0, rx: 0.6 }),
  ]
  for (const [x, z] of [[-0.75, 2], [0.75, 2], [-0.75, -2], [0.75, -2]]) {
    g.push(part(box(0.55, 3.2, 0.6), color, { x, y: 1.6, z }))
  }
  return g
}

export function figureGeometries(kind: FigureKind): { tinted: THREE.BufferGeometry; plain: THREE.BufferGeometry; scale: number } {
  switch (kind) {
    case 'spearmen':
      return {
        tinted: merge([part(box(2, 2.6, 1.3), WHITE, { y: 4.3 })]),
        plain: merge([
          part(box(1.5, 3, 1), LEATHER, { y: 1.5 }),
          part(sphere(0.8), SKIN, { y: 6.2 }),
          part(cone(0.95, 1.2, 6), STEEL, { y: 7.1 }),
          part(cyl(0.12, 0.12, 11, 4), WOOD, { x: 1.2, y: 5.5, z: 0.6, rx: 0.12 }),
          part(cone(0.3, 1.4, 4), STEEL, { x: 1.2, y: 11.6, z: 1.3, rx: 0.12 }),
        ]),
        scale: 1,
      }
    case 'men_at_arms':
      return {
        tinted: merge([
          part(box(2.5, 2.9, 1.6), WHITE, { y: 4.4 }),
          part(box(0.4, 3.2, 2.4), WHITE, { x: -1.6, y: 4.2, z: 0.4 }),
        ]),
        plain: merge([
          part(box(1.7, 3, 1.2), DARK_STEEL, { y: 1.5 }),
          part(box(1.5, 1.6, 1.5), STEEL, { y: 6.6 }),
          part(box(2.7, 0.8, 1.8), STEEL, { y: 5.9 }),
          part(box(0.25, 4, 0.5), STEEL, { x: 1.5, y: 4.5, z: 1.0, rx: 0.5 }),
        ]),
        scale: 1.05,
      }
    case 'archers':
      return {
        tinted: merge([part(box(1.8, 2.5, 1.2), WHITE, { y: 4.2 })]),
        plain: merge([
          part(box(1.4, 3, 1), LEATHER, { y: 1.5 }),
          part(sphere(0.8), SKIN, { y: 6.1 }),
          part(cone(1, 1.6, 6), 0x4a5a33, { y: 6.9 }),
          part(new THREE.TorusGeometry(2.4, 0.13, 4, 10, Math.PI), WOOD, { x: -1.2, y: 4.8, z: 0.4, rz: Math.PI / 2 }),
          part(cyl(0.45, 0.45, 2.6, 6), LEATHER, { x: 0.5, y: 5, z: -0.9, rx: 0.3 }),
        ]),
        scale: 0.95,
      }
    case 'light_cavalry':
      return {
        tinted: merge([part(box(1.8, 2.4, 1.2), WHITE, { y: 7.4 })]),
        plain: merge([
          ...horse(HORSE),
          part(box(2.6, 1.2, 1.6), LEATHER, { y: 5.6 }),
          part(sphere(0.75), SKIN, { y: 9.2 }),
          part(cone(0.85, 1, 6), STEEL, { y: 10 }),
          part(cyl(0.11, 0.11, 10, 4), WOOD, { x: 1.2, y: 8.4, z: 2.5, rx: 1.15 }),
        ]),
        scale: 1,
      }
    case 'knights':
      return {
        tinted: merge([
          part(box(2.8, 2.2, 6.0), WHITE, { y: 3.6 }),
          part(box(1.6, 1.4, 1.2), WHITE, { y: 6.0, z: 2.9, rx: -0.5 }),
          part(box(0.4, 2.8, 2.2), WHITE, { x: -1.5, y: 7.6, z: 0.4 }),
        ]),
        plain: merge([
          ...horse(0x4a4038),
          part(box(2.1, 2.6, 1.4), STEEL, { y: 7.6 }),
          part(box(1.5, 1.6, 1.5), STEEL, { y: 9.6 }),
          part(cone(0.3, 1.6, 4), 0xd4af37, { y: 11.2 }),
          part(cyl(0.16, 0.22, 12, 5), 0xd8cfc0, { x: 1.3, y: 8.4, z: 3.2, rx: 1.25 }),
        ]),
        scale: 1.1,
      }
    case 'royal_guard':
      // The King's household knights: blackened plate on black horses, gilt trim, a crimson plume.
      return {
        tinted: merge([part(cone(0.35, 1.8, 5), WHITE, { y: 12.1, z: -0.3, rx: -0.4 })]),
        plain: merge([
          ...horse(0x17161a),
          part(box(2.9, 2.3, 6.1), 0x202024, { y: 3.6 }),
          part(box(3.0, 0.3, 6.2), 0xb8932a, { y: 2.5 }),
          part(box(1.7, 1.5, 1.3), 0x202024, { y: 6.0, z: 2.9, rx: -0.5 }),
          part(box(2.2, 2.7, 1.5), 0x26272c, { y: 7.7 }),
          part(box(2.3, 0.3, 1.6), 0xb8932a, { y: 6.5 }),
          part(box(1.55, 1.7, 1.55), 0x1c1d21, { y: 9.7 }),
          part(box(1.6, 0.25, 0.3), 0xb8932a, { y: 9.9, z: 0.8 }),
          part(box(0.45, 3, 2.3), 0x1c1d21, { x: -1.55, y: 7.6, z: 0.4 }),
          part(cyl(0.16, 0.22, 12, 5), 0x2a2a2e, { x: 1.3, y: 8.4, z: 3.2, rx: 1.25 }),
          part(cone(0.3, 1.2, 4), 0xb8932a, { x: 1.3, y: 13.4, z: 8.6, rx: 1.25 }),
        ]),
        scale: 1.15,
      }
    case 'engineer':
      return {
        tinted: merge([part(box(1.9, 2.4, 1.3), WHITE, { y: 4.2 })]),
        plain: merge([
          part(box(1.5, 3, 1), LEATHER, { y: 1.5 }),
          part(sphere(0.8), SKIN, { y: 6.1 }),
          part(cyl(1.0, 1.0, 0.5, 6), DARK_STEEL, { y: 6.9 }),
          part(cyl(0.12, 0.12, 3.4, 4), WOOD, { x: 1.2, y: 4.6, z: 0.4, rz: 0.5 }),
          part(box(0.9, 0.7, 0.7), DARK_STEEL, { x: 1.9, y: 6.1, z: 0.4, rz: 0.5 }),
          part(box(0.8, 0.8, 4.5), WOOD, { x: -1.3, y: 5.4, z: -0.3, rx: 0.2 }),
        ]),
        scale: 0.95,
      }
    case 'siege': {
      const plain: THREE.BufferGeometry[] = [
        part(box(5, 1.4, 9), WOOD, { y: 2.6 }),
        part(cyl(0.8, 0.8, 11, 6), 0x5a3f22, { y: 4, z: 1, rx: Math.PI / 2 }),
        part(cone(1.0, 1.6, 6), DARK_STEEL, { y: 4, z: 7.2, rx: Math.PI / 2 }),
      ]
      for (const [x, z] of [[-2.8, 3], [2.8, 3], [-2.8, -3], [2.8, -3]]) {
        plain.push(part(cyl(1.5, 1.5, 0.8, 8), 0x4a3520, { x, y: 1.5, z, rz: Math.PI / 2 }))
      }
      return {
        tinted: merge([part(cyl(3.6, 3.6, 10, 3), WHITE, { y: 5.6, rx: Math.PI / 2, rz: Math.PI / 2, sy: 1, sx: 0.8 })]),
        plain: merge(plain),
        scale: 1.1,
      }
    }
  }
}

/**
 * A mounted commander at the head of the army: a horse in a caparison of his
 * colours, a long coat and cloak, bare-headed (or crowned, for the King).
 */
export function leaderGeometry(color: number, king: boolean): THREE.BufferGeometry {
  const coat = king ? 0x1e1c22 : 0x3a3028
  const cloak = king ? 0x7a1f2b : color
  const parts: THREE.BufferGeometry[] = [
    ...horse(king ? 0x17161a : 0x5a3e2a),
    part(box(3.0, 2.4, 6.3), cloak, { y: 3.5 }),
    part(box(3.1, 0.35, 6.4), 0xd4af37, { y: 2.4 }),
    part(box(2.2, 2.8, 1.5), coat, { y: 7.8 }),
    part(box(2.4, 0.35, 1.7), 0xd4af37, { y: 6.6 }),
    part(sphere(0.85), SKIN, { y: 9.8 }),
    part(box(1.4, 0.6, 1.3), king ? 0x8a7a68 : 0x4a3424, { y: 10.5, z: -0.1 }),
    // A cloak down the back, fur-trimmed for the King.
    part(box(2.8, 4.2, 0.4), cloak, { y: 7.4, z: -1.0, rx: 0.18 }),
    part(box(2.9, 0.7, 1.4), king ? 0x3a3028 : coat, { y: 9.0, z: -0.3 }),
  ]
  if (king) {
    parts.push(part(cyl(0.95, 0.95, 0.5, 8), 0xe3bd5a, { y: 10.9 }))
    for (let i = 0; i < 5; i++) parts.push(part(cone(0.22, 0.6, 4), 0xe3bd5a, { x: Math.cos((i / 5) * Math.PI * 2) * 0.85, y: 11.4, z: Math.sin((i / 5) * Math.PI * 2) * 0.85 }))
    parts.push(part(cyl(0.12, 0.12, 9, 5), 0x2a2a2e, { x: 1.4, y: 8, z: 1.4, rx: 0.15 }))
  } else {
    parts.push(part(cyl(0.12, 0.12, 4, 5), 0xb8b0a0, { x: 1.4, y: 7.6, z: 1.6, rx: 0.8 }))
  }
  return merge(parts)
}

/** How many soldiers one figure represents, per kind. */
export const SOLDIERS_PER_FIGURE: Record<FigureKind, number> = {
  spearmen: 5,
  men_at_arms: 5,
  archers: 5,
  light_cavalry: 5,
  knights: 4,
  royal_guard: 4,
  siege: 4,
  engineer: 5,
}

/**
 * Visual figures for a unit: a mix of looks so a block of the same unit type
 * still reads as a varied host (spears and shields, light horse and knights,
 * engineers with a ram for every few men).
 */
export function figuresFor(unitKey: string, category: string, figures: number): [FigureKind, number][] {
  if (figures <= 0) return []
  if (unitKey === 'infantry' || (category === 'infantry' && !(unitKey in SOLDIERS_PER_FIGURE))) {
    const spear = Math.round(figures * 0.6)
    return [['spearmen', spear], ['men_at_arms', figures - spear]]
  }
  if (unitKey === 'cavalry' || (category === 'cavalry' && !(unitKey in SOLDIERS_PER_FIGURE))) {
    const knights = Math.round(figures * 0.35)
    return [['light_cavalry', figures - knights], ['knights', knights]]
  }
  if (unitKey === 'engineers' || category === 'siege') {
    const rams = Math.max(1, Math.round(figures / 6))
    return [['siege', rams], ['engineer', Math.max(0, figures - rams)]]
  }
  return [[kindFor(unitKey, category), figures]]
}

export function kindFor(unitKey: string, category: string): FigureKind {
  if (unitKey in SOLDIERS_PER_FIGURE) return unitKey as FigureKind
  if (category === 'ranged') return 'archers'
  if (category === 'cavalry') return 'light_cavalry'
  if (category === 'siege') return 'siege'
  return 'spearmen'
}
