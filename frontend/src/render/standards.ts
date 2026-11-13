import * as THREE from 'three'
import { bmerge, bpart as part, box, cone, cyl, sphere } from './geo'
import { applyVision } from './vision'

/**
 * An army's war standard: a tall pole with a crossbar, a finial crest (a spear point, a crown for the
 * crowned heads, or the commander's own: a raven, a flame, a skull, a trident, thorns, a shield, a
 * vane), cords and tassels hanging from the bar, and below it a banner in the commander's colours,
 * painted with a bold heraldic pattern and cut into a swallowtail (or the three tails of a royal
 * gonfalon), rippling in the wind.
 */
export type Finial = 'spear' | 'crown' | 'raven' | 'flame' | 'skull' | 'trident' | 'thorn' | 'shield' | 'wind'
export type Pattern = 'pale' | 'fess' | 'chevron' | 'quarterly' | 'bend' | 'saltire' | 'royal' | 'plain'

const POLE = 0x3b2f25
const GOLD = 0xd4af37
const BAR_Y = 20.6
const FLAG_W = 7
const FLAG_H = 9.5
const COLS = 12
const ROWS = 16

const poleCache = new Map<Finial, THREE.BufferGeometry>()

/** The pole, crossbar, cords and finial (shared by every standard with the same finial). */
export function poleGeometry(finial: Finial): THREE.BufferGeometry {
  const hit = poleCache.get(finial)
  if (hit) return hit
  const g: THREE.BufferGeometry[] = []
  g.push(part(cyl(0.24, 0.34, 22, 6), POLE, { y: 11 }))
  g.push(part(cyl(0.4, 0.4, 0.5, 6), 0x2a2018, { y: 0.25, ao: 0 }))
  // The crossbar with its end caps, and cords with tassels hanging from either end.
  g.push(part(cyl(0.16, 0.16, FLAG_W + 1.2, 5), POLE, { y: BAR_Y, rz: Math.PI / 2, ao: 0 }))
  for (const s of [-1, 1]) {
    g.push(part(sphere(0.3, 0), GOLD, { x: s * (FLAG_W / 2 + 0.65), y: BAR_Y, ao: 0 }))
    g.push(part(cyl(0.05, 0.05, 3.6, 4), 0xc8a050, { x: s * (FLAG_W / 2 + 0.35), y: BAR_Y - 1.8, ao: 0 }))
    g.push(part(cone(0.24, 0.8, 5), GOLD, { x: s * (FLAG_W / 2 + 0.35), y: BAR_Y - 3.9, rx: Math.PI, ao: 0 }))
  }
  g.push(part(cyl(0.34, 0.34, 0.3, 6), GOLD, { y: 21.9, ao: 0 }))
  const top = 22.1
  switch (finial) {
    case 'crown':
      g.push(part(cyl(0.7, 0.6, 0.45, 8), GOLD, { y: top + 0.35, ao: 0 }))
      for (let i = 0; i < 5; i++) g.push(part(cone(0.16, 0.7, 4), GOLD, { x: Math.cos((i / 5) * 6.283) * 0.62, y: top + 0.9, z: Math.sin((i / 5) * 6.283) * 0.62, ao: 0 }))
      g.push(part(sphere(0.28, 0), 0xb3202c, { y: top + 0.7, ao: 0 }))
      g.push(part(cone(0.14, 0.6, 4), GOLD, { y: top + 1.35, ao: 0 }))
      break
    case 'raven':
      g.push(part(box(0.5, 0.55, 1.4), 0x1a1a1e, { y: top + 0.45, ao: 0 }))
      g.push(part(sphere(0.32, 0), 0x1a1a1e, { y: top + 0.85, z: 0.6, ao: 0 }))
      g.push(part(cone(0.12, 0.5, 4), 0x3a3428, { y: top + 0.8, z: 1.05, rx: Math.PI / 2, ao: 0 }))
      for (const s of [-1, 1]) g.push(part(box(1.2, 0.08, 0.7), 0x1a1a1e, { x: s * 0.8, y: top + 0.75, z: -0.1, rz: s * 0.45, ao: 0 }))
      break
    case 'flame':
      g.push(part(cyl(0.45, 0.25, 0.5, 6), 0x2a2420, { y: top + 0.25, ao: 0 }))
      g.push(part(cone(0.42, 1.4, 5), 0xff8a2a, { y: top + 1.15, ao: 0 }))
      g.push(part(cone(0.24, 0.9, 5), 0xffd060, { y: top + 1.0, ao: 0 }))
      break
    case 'skull':
      g.push(part(sphere(0.5, 0), 0xe2dccb, { y: top + 0.55, ao: 0 }))
      g.push(part(box(0.5, 0.3, 0.35), 0xe2dccb, { y: top + 0.15, z: 0.1, ao: 0 }))
      for (const s of [-1, 1]) g.push(part(box(0.16, 0.16, 0.1), 0x101010, { x: s * 0.18, y: top + 0.55, z: 0.45, ao: 0 }))
      break
    case 'trident':
      g.push(part(box(1.4, 0.18, 0.18), GOLD, { y: top + 0.3, ao: 0 }))
      for (const x of [-0.65, 0, 0.65]) g.push(part(cone(0.14, x === 0 ? 1.3 : 0.95, 4), 0xd4dbe2, { x, y: top + (x === 0 ? 1.0 : 0.85), ao: 0 }))
      break
    case 'thorn':
      g.push(part(cone(0.22, 1.6, 4), 0x9a6a2e, { y: top + 0.8, ao: 0 }))
      for (let i = 0; i < 4; i++) g.push(part(cone(0.1, 0.6, 3), 0x9a6a2e, { x: Math.cos(i * 1.57) * 0.25, y: top + 0.4 + i * 0.25, z: Math.sin(i * 1.57) * 0.25, rz: Math.cos(i * 1.57) * -1.1, rx: Math.sin(i * 1.57) * 1.1, ao: 0 }))
      break
    case 'shield':
      g.push(part(box(0.9, 0.9, 0.16), GOLD, { y: top + 0.65, ao: 0 }))
      g.push(part(box(0.62, 0.62, 0.16), GOLD, { y: top + 0.15, rz: Math.PI / 4, ao: 0 }))
      break
    case 'wind':
      g.push(part(cone(0.18, 1.3, 4), 0xd4dbe2, { y: top + 0.7, ao: 0 }))
      g.push(part(box(0.06, 0.5, 1.3), GOLD, { y: top + 0.45, z: -0.55, ao: 0 }))
      break
    default:
      // A leaf-bladed spear point with a collar.
      g.push(part(cone(0.32, 1.7, 4), 0xd4dbe2, { y: top + 0.95, sz: 0.45, ao: 0 }))
      g.push(part(cyl(0.18, 0.22, 0.4, 5), 0x6c747e, { y: top + 0.1, ao: 0 }))
  }
  const geo = bmerge(g)
  poleCache.set(finial, geo)
  return geo
}

/** The bottom edge of the banner, as a share of its height, across it (u 0..1): the tails. */
function hem(u: number, royal: boolean): number {
  if (royal) {
    // A gonfalon of three tails.
    const k = Math.abs(((u * 3) % 1) - 0.5) * 2
    return 1 - 0.22 * (1 - k)
  }
  // A swallowtail: forked up the middle.
  return 1 - 0.32 * (1 - Math.abs(u - 0.5) * 2)
}

/** The colour of the banner at (u across, v down), both 0..1. */
function paint(u: number, v: number, pattern: Pattern, field: THREE.Color, charge: THREE.Color, trim: THREE.Color): THREE.Color {
  const edge = u < 0.08 || u > 0.92 || v < 0.06
  if (edge) return trim
  const c = Math.abs(u - 0.5)
  switch (pattern) {
    case 'pale':
      return c < 0.17 ? charge : field
    case 'fess':
      return Math.abs(v - 0.42) < 0.12 ? charge : field
    case 'chevron':
      return v > 0.22 + c * 0.9 && v < 0.42 + c * 0.9 ? charge : field
    case 'quarterly':
      return u < 0.5 !== v < 0.45 ? charge : field
    case 'bend':
      return Math.abs(u - v * 0.95) < 0.14 ? charge : field
    case 'saltire':
      return Math.abs(u - v) < 0.1 || Math.abs(u + v - 1) < 0.1 ? charge : field
    case 'royal':
      // A gold lozenge on the field, a gold bar beneath it.
      if (c + Math.abs(v - 0.38) * 0.75 < 0.2) return charge
      return Math.abs(v - 0.7) < 0.035 ? charge : field
    default:
      return c + Math.abs(v - 0.42) < 0.16 ? charge : field
  }
}

export interface StandardFlag {
  mesh: THREE.Mesh
  /** Rest positions (x, y) of every vertex: the wind moves them about these. */
  rest: Float32Array
  phase: number
  royal: boolean
}

/**
 * A banner hanging from the crossbar: a grid of flat-shaded faces (each painted one colour, so the
 * pattern's edges stay crisp), its bottom cut into tails.
 */
export function makeFlag(opts: { field: number; charge: number; trim: number; pattern: Pattern; royal: boolean; seed: number }, material: THREE.Material): StandardFlag {
  const quads = COLS * ROWS
  const pos = new Float32Array(quads * 6 * 3)
  const col = new Float32Array(quads * 6 * 3)
  const rest = new Float32Array(quads * 6 * 2)
  const vx = (i: number) => (i / COLS - 0.5) * FLAG_W
  const vy = (i: number, j: number) => BAR_Y - 0.25 - (j / ROWS) * FLAG_H * hem(i / COLS, opts.royal)
  let n = 0
  const put = (i: number, j: number) => {
    const x = vx(i)
    const y = vy(i, j)
    pos[n * 3] = x
    pos[n * 3 + 1] = y
    pos[n * 3 + 2] = 0
    rest[n * 2] = x
    rest[n * 2 + 1] = y
    n++
  }
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      put(i, j)
      put(i, j + 1)
      put(i + 1, j)
      put(i + 1, j)
      put(i, j + 1)
      put(i + 1, j + 1)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeBoundingSphere()
  const mesh = new THREE.Mesh(geo, material)
  mesh.castShadow = true
  const flag = { mesh, rest, phase: opts.seed * 0.37, royal: opts.royal }
  paintFlag(flag, opts.field, opts.charge, opts.trim, opts.pattern)
  return flag
}

/** Paint (or repaint, when a holding changes hands) a banner's pattern in new colours. */
export function paintFlag(f: StandardFlag, fieldHex: number, chargeHex: number, trimHex: number, pattern: Pattern) {
  const field = new THREE.Color(fieldHex)
  const charge = new THREE.Color(chargeHex)
  const trim = new THREE.Color(trimHex)
  const attr = f.mesh.geometry.attributes.color as THREE.BufferAttribute
  const col = attr.array as Float32Array
  let n = 0
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const c = paint((i + 0.5) / COLS, (j + 0.5) / ROWS, pattern, field, charge, trim)
      for (let k = 0; k < 6; k++, n++) {
        col[n * 3] = c.r
        col[n * 3 + 1] = c.g
        col[n * 3 + 2] = c.b
      }
    }
  attr.needsUpdate = true
}

/** Materials for standards set up outside the armies (outposts, holdings, wagons). */
export const STANDARD_POLE_MAT = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.1 }))
export const STANDARD_FLAG_MAT = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.85 }))

/**
 * A standard on its pole, ready to place: `scale` 1 is an army's (22 tall); outposts, holdings and
 * wagons fly smaller ones. The banner is painted in a colour with a lighter charge and a dark trim.
 */
export function makeBanner(opts: { color: number | string; pattern?: Pattern; finial?: Finial; scale?: number; seed?: number }): { group: THREE.Group; flag: StandardFlag } {
  const c = new THREE.Color(opts.color)
  const flag = makeFlag(
    { field: c.getHex(), charge: c.clone().lerp(new THREE.Color(0xffffff), 0.55).getHex(), trim: new THREE.Color(0x2a2018).getHex(), pattern: opts.pattern ?? 'plain', royal: false, seed: opts.seed ?? 1 },
    STANDARD_FLAG_MAT,
  )
  const group = new THREE.Group()
  const pole = new THREE.Mesh(poleGeometry(opts.finial ?? 'spear'), STANDARD_POLE_MAT)
  pole.castShadow = true
  group.add(pole, flag.mesh)
  group.scale.setScalar(opts.scale ?? 1)
  return { group, flag }
}

/** Repaint a banner from `makeBanner` in a new colour. */
export function recolorBanner(f: StandardFlag, color: number | string, pattern: Pattern = 'plain') {
  const c = new THREE.Color(color)
  paintFlag(f, c.getHex(), c.clone().lerp(new THREE.Color(0xffffff), 0.55).getHex(), 0x2a2018, pattern)
}

/** Let the banner ripple: the top is held by the bar, the tails swing most. No allocation. */
export function waveFlag(f: StandardFlag, time: number, gust: number) {
  const attr = f.mesh.geometry.attributes.position as THREE.BufferAttribute
  const a = attr.array as Float32Array
  const r = f.rest
  for (let k = 0, n = r.length / 2; k < n; k++) {
    const x = r[k * 2]
    const y = r[k * 2 + 1]
    const d = BAR_Y - y
    const amp = d * 0.075 * gust
    a[k * 3 + 2] = Math.sin(d * 0.55 - time * 3.6 + x * 0.35 + f.phase) * amp + Math.sin(d * 0.2 - time * 1.7 + f.phase) * amp * 0.6
    a[k * 3] = x + Math.sin(time * 1.3 + d * 0.3 + f.phase) * d * 0.012
  }
  attr.needsUpdate = true
}

/** A pattern for a commander (fixed by their key) or a captain's band (by its name). */
export function patternFor(seed: string, royal: boolean): Pattern {
  if (royal) return 'royal'
  const list: Pattern[] = ['pale', 'fess', 'chevron', 'quarterly', 'bend', 'saltire', 'plain']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return list[h % list.length]
}

/** The finial of a commander's standard, from their sigil. */
export function finialFor(sigil: string | undefined, royal: boolean): Finial {
  if (royal) return 'crown'
  switch (sigil) {
    case 'raven':
    case 'flame':
    case 'skull':
    case 'trident':
    case 'thorn':
    case 'shield':
    case 'wind':
      return sigil
    default:
      return 'spear'
  }
}
