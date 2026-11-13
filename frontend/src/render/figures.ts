import * as THREE from 'three'
import type { PortraitSpec } from '../game/types'
import { bmerge, bpart as part, box, cone, cyl, sphere } from './geo'

/**
 * Each figure kind is split into a "tinted" geometry (tabards, shields, caparisons, plumes,
 * pennons: coloured per faction via instance colour) and a "plain" geometry (skin, steel, leather,
 * wood, horses) with baked vertex colours. Models face +Z, stand on y = 0, and are about 6.5 units
 * to the crown of the head (a man) or 8 to the poll (a horse).
 *
 * Figures are drawn by the thousand, so they are built like painted miniatures: a strong silhouette
 * first (helm, shield, weapon, horse), sculpted with tapered limbs rather than blocks, then the few
 * details that catch the light. The far model (`lo`) keeps the silhouette and drops the details.
 */
export type FigureKind =
  | 'spearmen'
  | 'spearmen_lv'
  | 'men_at_arms'
  | 'archers'
  | 'light_cavalry'
  | 'knights'
  | 'siege'
  | 'engineer'
  | 'royal_guard'
  | 'thorn_guard'
  | 'solar_guard'
  | 'assassin'
  | 'saboteur'
  | 'outrider'
  | 'pilgrim'
  | 'mule'
  | 'cart'
  | 'thrall'
  | 'bone'
  | 'wraith'
  | 'fiend'
  | 'giant'

const SKIN = 0xd9a77e
const STEEL = 0xaab3bd
const STEEL_L = 0xd4dbe2
const STEEL_D = 0x6c747e
const DARK_STEEL = 0x4a505c
const MAIL = 0x8a929c
const GOLD = 0xd9b04a
const BRONZE = 0x9a6a2e
const WOOD = 0x6e4d2c
const ASH = 0xb8955e
const LEATHER = 0x5a3d26
const LEATHER_L = 0x7a5536
const CLOTH = 0x5a5246
const LINEN = 0xe8dcc0
const HOSE = 0x4a4038
const BOOT = 0x2e241b
const IRON = 0x3a3d42
const BONE = 0xe2dccb
const WHITE = 0xffffff

type G = THREE.BufferGeometry[]
type V3 = [number, number, number]

/** Building the far (low-detail) version: the small touches are left out, round things are blocks. */
let lo = false
/** Add a detail part only to the near (high-detail) model. */
const fine = (g: G, geo: THREE.BufferGeometry) => {
  if (!lo) g.push(geo)
}
/** A head: a faceted ball near the camera, a block farther off. */
const head = (r: number) => (lo ? box(r * 1.45, r * 1.6, r * 1.45) : sphere(r, 0))
/** A shaft (spear, lance, haft): round near the camera, square farther off. */
const rod = (r1: number, r2: number, h: number) => (lo ? box(r2 * 1.8, h, r2 * 1.8) : cyl(r1, r2, h, 5))
/** A limb or a tapered body part: a tapered prism near the camera, a block farther off. */
const limb = (r1: number, r2: number, h: number, seg = 5) => (lo ? box(Math.max(r1, r2) * 1.7, h, Math.max(r1, r2) * 1.7) : cyl(r1, r2, h, seg))
/** A rounded lump (shoulder, croup, chest): a squashed ball near the camera. */
const lump = (r: number) => (lo ? box(r * 1.6, r * 1.6, r * 1.6) : sphere(r, 0))

const UP = new THREE.Vector3(0, 1, 0)
/** A rod from a to b (centre and tilt worked out), for straps, reins, shafts and bows' strings. */
function span(g: G, a: V3, b: V3, r: number, color: number, ao = 0) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx / len, dy / len, dz / len))
  const e = new THREE.Euler().setFromQuaternion(q)
  g.push(part(lo ? box(r * 2, len, r * 2) : cyl(r, r, len, 4), color, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: e.x, ry: e.y, rz: e.z, ao }))
}

// ---- The human frame --------------------------------------------------------------------------

/** Two legs standing (or striding: `stride` > 0 puts the left foot forward), with boots. */
function legs(g: G, hose = HOSE, boot = BOOT, stride = 0) {
  if (lo) {
    g.push(part(box(1.5, 2.7, 0.66), hose, { y: 1.55 }))
    return
  }
  for (const s of [-1, 1]) {
    const z = s * -stride * 0.35
    g.push(part(limb(0.38, 0.3, 1.55), hose, { x: s * 0.42, y: 2.3, z, rx: s * stride * 0.12 }))
    g.push(part(limb(0.3, 0.22, 1.45), hose, { x: s * 0.42, y: 0.95, z: z * 1.4 }))
    g.push(part(box(0.58, 0.5, 1.0), boot, { x: s * 0.42, y: 0.25, z: z * 1.4 + 0.16, ao: 0.05 }))
    fine(g, part(box(0.62, 0.2, 0.7), boot, { x: s * 0.42, y: 0.62, z: z * 1.4 - 0.05, ao: 0 }))
  }
}

/** A tapered torso (broad at the shoulders, narrow at the waist) with a belt. */
function torso(g: G, color: number, opts: { y?: number; w?: number; belt?: number } = {}) {
  const y = opts.y ?? 4.15
  const w = opts.w ?? 1
  g.push(part(limb(0.98 * w, 0.76 * w, 2.3, 6), color, { y, sz: 0.62, ry: Math.PI / 6 }))
  if (opts.belt !== undefined) fine(g, part(limb(0.8 * w, 0.8 * w, 0.24, 6), opts.belt, { y: y - 1.05, sz: 0.66, ry: Math.PI / 6, ao: 0 }))
}

/** A skirt below the waist (tunic, mail hauberk, robe): flaring a little toward the hem. */
function skirt(g: G, color: number, len = 1.3, y = 3.05, flare = 1.05) {
  g.push(part(limb(0.8, flare, len, 6), color, { y: y - len / 2, sz: 0.68, ry: Math.PI / 6 }))
}

/**
 * One arm from the shoulder: `reach` 0 hangs by the side, 1 points straight ahead, `lift` raises
 * the whole arm. Returns where the hand is (for the weapon it holds).
 */
function arm(g: G, side: -1 | 1, sleeve: number, reach: number, opts: { lift?: number; out?: number; hand?: number; y?: number; bracer?: number } = {}): V3 {
  const sy = opts.y ?? 5.05
  const sx = side * (1.12 + (opts.out ?? 0))
  const a1 = 0.18 + reach * 0.55 + (opts.lift ?? 0)
  const a2 = 0.25 + reach * 1.25 + (opts.lift ?? 0)
  const L1 = 1.3
  const L2 = 1.2
  const ex = sx + side * 0.08
  const ey = sy - Math.cos(a1) * L1
  const ez = Math.sin(a1) * L1
  const hx = ex + side * 0.04
  const hy = ey - Math.cos(a2) * L2
  const hz = ez + Math.sin(a2) * L2
  if (lo) {
    g.push(part(box(0.5, L1 + L2, 0.56), sleeve, { x: sx, y: (sy + hy) / 2, z: hz / 2, rx: -(a1 + a2) / 2 }))
    return [hx, hy, hz]
  }
  g.push(part(limb(0.3, 0.26, L1), sleeve, { x: (sx + ex) / 2, y: (sy + ey) / 2, z: ez / 2, rx: -a1 }))
  g.push(part(limb(0.26, 0.21, L2), opts.bracer ?? sleeve, { x: (ex + hx) / 2, y: (ey + hy) / 2, z: (ez + hz) / 2, rx: -a2 }))
  g.push(part(sphere(0.25, 0), opts.hand ?? SKIN, { x: hx, y: hy - 0.05, z: hz, ao: 0 }))
  return [hx, hy, hz]
}

/** Shoulders: rounded pauldrons (or just the swell of a padded coat). */
function shoulders(g: G, color: number, size = 0.55, y = 5.15) {
  for (const s of [-1, 1]) g.push(part(lump(size), color, { x: s * 1.12, y, sy: 0.72, ao: 0 }))
}

/** A neck and a head, with hair and a beard as the portrait has them. */
function face(g: G, y = 6.15, opts: { skin?: number; hair?: number; beard?: number; style?: string; beardStyle?: string; female?: boolean } = {}) {
  const skin = opts.skin ?? SKIN
  fine(g, part(limb(0.3, 0.34, 0.5), skin, { y: y - 0.7, ao: 0 }))
  g.push(part(head(0.72), skin, { y, sy: 1.08, ao: 0 }))
  fine(g, part(box(0.16, 0.3, 0.2), skin, { y: y - 0.05, z: 0.7, ao: 0 }))
  const hair = opts.hair
  if (hair !== undefined) {
    const st = opts.style ?? 'short'
    if (st !== 'bald' && st !== 'shaved') g.push(part(lump(0.76), hair, { y: y + 0.22, z: -0.1, sy: 0.75, ao: 0 }))
    if (st === 'long' || (opts.female && st !== 'braid' && st !== 'tied')) g.push(part(box(1.45, 2.0, 0.5), hair, { y: y - 0.75, z: -0.42, ao: 0 }))
    if (st === 'braid') {
      for (let i = 0; i < 4; i++) g.push(part(lump(0.26), hair, { y: y - 0.4 - i * 0.48, z: -0.62 - i * 0.05, ao: 0 }))
    }
    if (st === 'tied' || st === 'topknot') g.push(part(lump(0.32), hair, { y: st === 'topknot' ? y + 0.85 : y + 0.05, z: st === 'topknot' ? -0.1 : -0.85, ao: 0 }))
    if (st === 'wild') for (const s of [-1, 1]) g.push(part(cone(0.45, 1.0, 4), hair, { x: s * 0.55, y: y + 0.2, z: -0.3, rz: s * 1.2, ao: 0 }))
  }
  const b = opts.beardStyle
  if (b && b !== 'none' && opts.beard !== undefined) {
    if (b === 'full' || b === 'forked') {
      g.push(part(cone(0.55, 1.1, 5), opts.beard, { y: y - 0.65, z: 0.42, rx: Math.PI, ao: 0 }))
      if (b === 'forked') for (const s of [-1, 1]) fine(g, part(cone(0.18, 0.7, 4), opts.beard, { x: s * 0.2, y: y - 1.25, z: 0.5, rx: Math.PI, ao: 0 }))
    } else if (b === 'short' || b === 'goatee') g.push(part(box(b === 'goatee' ? 0.4 : 1.0, 0.55, 0.4), opts.beard, { y: y - 0.48, z: 0.5, ao: 0 }))
    else if (b === 'mustache') fine(g, part(box(0.8, 0.14, 0.18), opts.beard, { y: y - 0.22, z: 0.7, ao: 0 }))
    else if (b === 'stubble') fine(g, part(box(1.0, 0.5, 0.2), new THREE.Color(skin).multiplyScalar(0.7).getHex(), { y: y - 0.42, z: 0.58, ao: 0 }))
  }
}

// ---- Helms -------------------------------------------------------------------------------------

/** A kettle hat: a round crown and a broad brim, with a nasal bar. */
function kettleHat(g: G, y = 6.6, color = STEEL) {
  g.push(part(cyl(1.08, 1.1, 0.1, lo ? 6 : 10), STEEL_D, { y, ao: 0 }))
  g.push(part(lo ? box(1.2, 0.7, 1.2) : sphere(0.74, 0), color, { y: y + 0.25, sy: 0.75, ao: 0 }))
  fine(g, part(box(0.12, 0.65, 0.12), STEEL_D, { y: y - 0.3, z: 0.72, ao: 0 }))
}
/** A pointed bascinet with a snouted visor and a mail aventail. */
function bascinet(g: G, y = 6.25, color = STEEL) {
  g.push(part(lo ? box(1.25, 1.4, 1.25) : cyl(0.72, 0.78, 1.0, 8), color, { y, ao: 0 }))
  g.push(part(cone(0.74, 0.95, lo ? 4 : 8), color, { y: y + 0.95, z: -0.08, ao: 0 }))
  fine(g, part(cone(0.42, 0.9, 6), STEEL_L, { y: y - 0.05, z: 0.75, rx: Math.PI / 2, sy: 0.7, ao: 0 }))
  fine(g, part(box(0.75, 0.08, 0.1), 0x141414, { y: y + 0.12, z: 0.72, ao: 0 }))
  fine(g, part(limb(0.82, 1.05, 0.6, 8), MAIL, { y: y - 0.75, ao: 0 }))
}
/** A great helm: flat-topped barrel with an eye slit and breaths. */
function greatHelm(g: G, y = 6.35, color = STEEL) {
  g.push(part(lo ? box(1.3, 1.5, 1.35) : cyl(0.72, 0.75, 1.45, 8), color, { y, ao: 0 }))
  fine(g, part(cyl(0.66, 0.73, 0.18, 8), color, { y: y + 0.8, ao: 0 }))
  g.push(part(box(1.0, 0.14, 0.1), 0x101010, { y: y + 0.12, z: 0.72, ao: 0 }))
  fine(g, part(box(0.12, 0.9, 0.08), STEEL_L, { y: y - 0.15, z: 0.74, ao: 0 }))
  for (let i = 0; i < 3; i++) fine(g, part(box(0.06, 0.06, 0.06), 0x101010, { x: 0.3, y: y - 0.25 - i * 0.18, z: 0.72, ao: 0 }))
}
/**
 * A hood drawn over the head (the face showing under its brim), its point falling back as a short
 * tail, and a shoulder cape below. `depth` > 1 pulls it lower over the eyes.
 */
function hood(g: G, color: number, y = 6.2, depth = 1.0) {
  g.push(part(lump(0.86), color, { y: y + 0.14, z: -0.28, sy: 1.1, ao: 0.1 }))
  fine(g, part(box(1.25, 0.22, 0.5), color, { y: y + 0.62 - (depth - 1) * 0.6, z: 0.38, rx: 0.35, ao: 0 }))
  g.push(part(cone(0.42, 1.2, lo ? 4 : 5), color, { y: y + 0.45, z: -1.0, rx: -1.25, ao: 0 }))
  g.push(part(limb(0.9, 1.3, 0.7, 6), color, { y: y - 0.75, sz: 0.8, ao: 0 }))
}
/** A plume or a crest on top of a helm (into `tinted` in white when given, else in `color`). */
function plume(g: G, color: number, y: number, tinted?: G) {
  const to = tinted ?? g
  const c = tinted ? WHITE : color
  to.push(part(lump(0.36), c, { y: y + 0.3, z: -0.15, sy: 1.4, ao: 0 }))
  to.push(part(cone(0.3, 1.5, 5), c, { y: y + 0.55, z: -0.75, rx: -1.15, ao: 0 }))
  fine(to, part(cone(0.24, 1.2, 5), c, { y: y + 0.15, z: -1.2, rx: -1.6, ao: 0 }))
}
/** A crown of points. */
function crown(g: G, y: number, r = 0.82, color = GOLD) {
  const n = lo ? 4 : 6
  g.push(part(cyl(r, r, 0.38, lo ? 6 : 10), color, { y, ao: 0 }))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.push(part(cone(0.16, 0.55, 4), color, { x: Math.cos(a) * r * 0.92, y: y + 0.42, z: Math.sin(a) * r * 0.92, ao: 0 }))
  }
  fine(g, part(box(0.22, 0.22, 0.12), 0xb3202c, { y, z: r + 0.02, ao: 0 }))
}

// ---- Arms and armour ---------------------------------------------------------------------------

/** A round shield: a painted face (tinted), a dark rim and an iron boss. */
function roundShield(plain: G, tinted: G, r = 1.35, x = -1.55, y = 4.1, z = 0.55) {
  tinted.push(part(cyl(r, r * 0.96, 0.18, lo ? 6 : 12), WHITE, { x, y, z, rz: Math.PI / 2, ao: 0.1 }))
  fine(plain, part(cyl(r + 0.12, r + 0.12, 0.14, 12), 0x3b2a18, { x: x + 0.05, y, z, rz: Math.PI / 2, ao: 0 }))
  fine(plain, part(box(0.06, r * 1.7, 0.3), LINEN, { x: x - 0.1, y, z, ao: 0 }))
  fine(plain, part(lump(0.36), STEEL, { x: x - 0.14, y, z, sx: 0.5, ao: 0 }))
}
/** A heater shield: a tinted face with a pale chevron, a dark edge behind. */
function heaterShield(plain: G, tinted: G, x = -1.55, y = 4.2, z = 0.45, s = 1) {
  tinted.push(part(box(0.2, 1.9 * s, 1.75 * s), WHITE, { x, y: y + 0.25 * s, z, ao: 0.1 }))
  tinted.push(part(box(0.2, 1.2 * s, 1.2 * s), WHITE, { x, y: y - 0.85 * s, z, rx: Math.PI / 4, sy: 0.9, ao: 0.1 }))
  fine(plain, part(box(0.14, 2.15 * s, 1.95 * s), 0x2e2a26, { x: x + 0.07, y: y + 0.2 * s, z, ao: 0 }))
  fine(plain, part(box(0.24, 0.3 * s, 1.55 * s), LINEN, { x: x - 0.05, y: y + 0.6 * s, z, ao: 0 }))
  fine(plain, part(box(0.24, 1.3 * s, 0.26 * s), LINEN, { x: x - 0.05, y: y - 0.1 * s, z, ao: 0 }))
}
/** A sword in the hand: blade, cross-guard, grip and pommel. `up` 0 points it straight up, π/2 straight ahead. */
function sword(g: G, at: V3, opts: { up?: number; len?: number; blade?: number } = {}) {
  const up = opts.up ?? 0.5
  const len = opts.len ?? 2.8
  const dy = Math.cos(up)
  const dz = Math.sin(up)
  const guard: V3 = [at[0], at[1] + dy * 0.35, at[2] + dz * 0.35]
  const tip: V3 = [at[0], at[1] + dy * (len + 0.35), at[2] + dz * (len + 0.35)]
  if (lo) {
    span(g, at, tip, 0.1, opts.blade ?? STEEL_L)
    return
  }
  g.push(part(cone(0.18, len, 4), opts.blade ?? STEEL_L, { x: (guard[0] + tip[0]) / 2, y: (guard[1] + tip[1]) / 2, z: (guard[2] + tip[2]) / 2, rx: up, sx: 0.45, ao: 0 }))
  g.push(part(box(0.95, 0.14, 0.18), GOLD, { x: guard[0], y: guard[1], z: guard[2], rx: up, ao: 0 }))
  g.push(part(lump(0.16), GOLD, { x: at[0], y: at[1] - dy * 0.35, z: at[2] - dz * 0.35, ao: 0 }))
}
/** A spear in the hand, upright (or `level`led): an ash shaft, a leaf-shaped steel head, a little pennon. */
function spear(plain: G, tinted: G, at: V3, opts: { len?: number; level?: number; pennon?: boolean } = {}) {
  const len = opts.len ?? 11.5
  const tilt = opts.level ?? 0.1
  const dy = Math.cos(tilt)
  const dz = Math.sin(tilt)
  const back = len * 0.32
  const butt: V3 = [at[0], at[1] - dy * back, at[2] - dz * back]
  const top: V3 = [at[0], at[1] + dy * (len - back), at[2] + dz * (len - back)]
  plain.push(part(rod(0.09, 0.12, len), ASH, { x: (butt[0] + top[0]) / 2, y: (butt[1] + top[1]) / 2, z: (butt[2] + top[2]) / 2, rx: tilt }))
  plain.push(part(cone(0.26, 1.4, 4), STEEL_L, { x: top[0], y: top[1] + dy * 0.7, z: top[2] + dz * 0.7, rx: tilt, sz: 0.45, ao: 0 }))
  fine(plain, part(cyl(0.14, 0.14, 0.4, 5), STEEL_D, { x: top[0], y: top[1] - dy * 0.1, z: top[2] - dz * 0.1, rx: tilt, ao: 0 }))
  if (opts.pennon) fine(tinted, part(box(0.05, 0.75, 1.5), WHITE, { x: top[0], y: top[1] - dy * 0.8, z: top[2] - dz * 0.8 - 0.75, rx: tilt, ao: 0 }))
}
/** A couched lance: tapered shaft, a vamplate (hand guard), a steel point and a forked pennon. */
function lance(plain: G, tinted: G, opts: { x?: number; y?: number; z?: number; color?: number; tip?: number; len?: number; tilt?: number } = {}) {
  const x = opts.x ?? 1.3
  const y = opts.y ?? 8.5
  const z = opts.z ?? 3.2
  const len = opts.len ?? 12
  const tilt = opts.tilt ?? 1.25
  const dy = Math.cos(tilt)
  const dz = Math.sin(tilt)
  plain.push(part(rod(0.12, 0.24, len), opts.color ?? 0xd8cfc0, { x, y, z, rx: tilt }))
  plain.push(part(cone(0.24, 1.1, 4), opts.tip ?? STEEL_L, { x, y: y + dy * (len / 2 + 0.5), z: z + dz * (len / 2 + 0.5), rx: tilt, ao: 0 }))
  fine(plain, part(cone(0.6, 0.9, 8), opts.tip ?? STEEL, { x, y: y - dy * (len * 0.22), z: z - dz * (len * 0.22), rx: tilt, ao: 0 }))
  // A forked pennon just behind the point.
  const py = y + dy * (len / 2 - 1.2)
  const pz = z + dz * (len / 2 - 1.2)
  tinted.push(part(box(0.05, 0.45, 1.7), WHITE, { x, y: py + 0.3, z: pz - 0.85, rx: 0.12, ao: 0 }))
  fine(tinted, part(box(0.05, 0.45, 1.7), WHITE, { x, y: py - 0.25, z: pz - 0.85, rx: -0.1, ao: 0 }))
}
/** A longbow held up in the hand (string and a nocked arrow drawn back to `draw`). */
function longbow(g: G, hand: V3, draw: V3, opts: { r?: number; wood?: number } = {}) {
  const r = opts.r ?? 2.7
  g.push(part(new THREE.TorusGeometry(r, 0.13, lo ? 3 : 4, lo ? 7 : 14, Math.PI * 0.9), opts.wood ?? WOOD, { x: hand[0], y: hand[1] - r * 0.15, z: hand[2] - r * 0.05, rz: Math.PI / 2 + Math.PI * 0.05, ry: -Math.PI / 2, ao: 0 }))
  if (lo) return
  const top: V3 = [hand[0], hand[1] + r * 0.95, hand[2] - r * 0.3]
  const bot: V3 = [hand[0], hand[1] - r * 0.95, hand[2] - r * 0.3]
  span(g, top, draw, 0.025, LINEN)
  span(g, bot, draw, 0.025, LINEN)
  span(g, draw, [hand[0], hand[1], hand[2] + 0.9], 0.04, ASH)
  g.push(part(cone(0.1, 0.3, 4), STEEL, { x: hand[0], y: hand[1], z: hand[2] + 1.0, rx: Math.PI / 2, ao: 0 }))
}
/** A quiver on the hip or the back, fanned with fletched arrows. */
function quiver(g: G, x: number, y: number, z: number, tilt = 0.3, fletch = LINEN) {
  g.push(part(limb(0.42, 0.34, 2.3, 6), LEATHER, { x, y, z, rx: tilt }))
  if (lo) return
  g.push(part(cyl(0.45, 0.45, 0.18, 6), LEATHER_L, { x, y: y + 1.1 * Math.cos(tilt), z: z + 1.1 * Math.sin(tilt), rx: tilt, ao: 0 }))
  for (let i = 0; i < 4; i++) {
    const ox = (i - 1.5) * 0.17
    g.push(part(box(0.06, 0.55, 0.22), fletch, { x: x + ox, y: y + 1.45 * Math.cos(tilt), z: z + 1.45 * Math.sin(tilt) - 0.02 * i, rx: tilt + (i - 1.5) * 0.08, ao: 0 }))
  }
}

// ---- Horses ------------------------------------------------------------------------------------

interface HorseOpts {
  mane?: number
  blaze?: boolean
  saddle?: number
  /** Steel (or bone) plate down the face. */
  chanfron?: number
  /** A full caparison down to the fetlocks (tinted), with a trim at the hem. */
  caparison?: { trim: number; scallop?: boolean; split?: boolean; spikes?: number }
  /** A saddle cloth under the saddle (tinted) with a trim of this colour. */
  cloth?: number
  /** Lean and long-legged (coursers, steppe horses), or heavy (destriers). */
  build?: 'lean' | 'heavy'
  /** Saddlebags and a bedroll behind the cantle. */
  packs?: boolean
}

/**
 * A horse: a barrel body between a deep chest and a rounded croup, an arched neck, a long head
 * tapering to the muzzle, ears, mane and tail, jointed legs with hooves; saddle with pommel and
 * cantle, stirrups, bridle and reins. Barding (caparison, saddle cloth) goes to `tinted`.
 */
function horse(g: G, coat: number, opts: HorseOpts = {}, tinted?: G) {
  const mane = opts.mane ?? 0x2a1d14
  const dark = new THREE.Color(coat).multiplyScalar(0.7).getHex()
  const w = opts.build === 'heavy' ? 1.12 : opts.build === 'lean' ? 0.9 : 1
  if (lo) {
    g.push(part(box(2.2 * w, 2.3, 5.0), coat, { y: 4.2 }))
    g.push(part(box(1.2, 2.6, 1.4), coat, { y: 5.9, z: 2.9, rx: -0.55 }))
    g.push(part(box(0.95, 1.0, 2.2), coat, { y: 7.0, z: 3.95, rx: 0.4 }))
    for (const [x, z] of [[-0.72, 1.95], [0.72, 1.95], [-0.72, -1.95], [0.72, -1.95]]) g.push(part(box(0.55, 3.0, 0.62), coat, { x, y: 1.6, z }))
    g.push(part(box(0.45, 2.0, 0.5), mane, { y: 3.9, z: -3.0, rx: 0.45 }))
    if (opts.caparison && tinted) tinted.push(part(box(2.7 * w, 2.4, 5.6), WHITE, { y: 3.85 }))
    else if (opts.cloth !== undefined && tinted) tinted.push(part(box(2.45 * w, 1.0, 2.4), WHITE, { y: 4.9, z: -0.3 }))
    if (opts.chanfron !== undefined) g.push(part(box(0.75, 0.9, 1.8), opts.chanfron, { y: 7.4, z: 3.95, rx: 0.4 }))
    return
  }
  // Body: barrel, chest and croup.
  g.push(part(cyl(1.12 * w, 1.04 * w, 4.2, 8), coat, { y: 4.3, rx: Math.PI / 2, sx: 0.95 }))
  g.push(part(sphere(1.2 * w, 0), coat, { y: 4.45, z: 1.95, sz: 0.85, sx: 0.92 }))
  g.push(part(sphere(1.22 * w, 0), coat, { y: 4.6, z: -1.85, sx: 0.95, sy: 0.9 }))
  // Neck arched forward, head tapering to the muzzle.
  g.push(part(cyl(0.55, 0.88 * w, 2.9, 7), coat, { y: 6.0, z: 2.85, rx: 0.62, sx: 0.85 }))
  g.push(part(box(0.82, 0.9, 1.05), coat, { y: 7.45, z: 3.7, rx: 0.5 }))
  g.push(part(cyl(0.34, 0.48, 1.9, 6), coat, { y: 6.9, z: 4.45, rx: Math.PI / 2 + 0.6, sx: 0.85 }))
  g.push(part(box(0.62, 0.42, 0.55), dark, { y: 6.35, z: 5.2, rx: 0.6, ao: 0 }))
  for (const s of [-1, 1]) {
    g.push(part(cone(0.15, 0.6, 4), coat, { x: s * 0.28, y: 8.1, z: 3.45, rz: -s * 0.15, ao: 0 }))
    g.push(part(box(0.1, 0.16, 0.2), 0x141010, { x: s * 0.42, y: 7.45, z: 4.0, ao: 0 }))
  }
  if (opts.blaze) g.push(part(box(0.26, 0.9, 0.12), 0xf0e6d6, { y: 7.05, z: 4.55, rx: 0.6, ao: 0 }))
  // Mane along the crest of the neck, forelock, tail.
  g.push(part(box(0.26, 2.7, 0.6), mane, { y: 6.55, z: 2.55, rx: 0.62, ao: 0.05 }))
  g.push(part(cone(0.22, 0.6, 4), mane, { y: 7.85, z: 3.95, rx: 0.9, ao: 0 }))
  g.push(part(limb(0.36, 0.14, 2.6, 5), mane, { y: 3.6, z: -3.0, rx: 0.32 }))
  // Legs: forearm/gaskin, cannon, fetlock, hoof. The hind legs bend back at the hock.
  for (const [x, z, hind] of [[-0.66, 1.85, 0], [0.66, 1.85, 0], [-0.66, -1.8, 1], [0.66, -1.8, 1]] as [number, number, number][]) {
    const xs = x * w
    if (hind) {
      g.push(part(limb(0.48 * w, 0.3, 1.9, 6), coat, { x: xs, y: 3.0, z: z - 0.15, rx: -0.28 }))
      g.push(part(limb(0.2, 0.19, 1.65, 5), coat, { x: xs, y: 1.2, z: z - 0.25, rx: 0.1 }))
    } else {
      g.push(part(limb(0.42 * w, 0.26, 1.8, 6), coat, { x: xs, y: 2.95, z }))
      g.push(part(limb(0.19, 0.19, 1.65, 5), coat, { x: xs, y: 1.2, z: z + 0.05 }))
    }
    g.push(part(lump(0.24), dark, { x: xs, y: 0.45, z: z + (hind ? -0.22 : 0.08), ao: 0 }))
    g.push(part(cyl(0.24, 0.3, 0.32, 6), 0x1c1612, { x: xs, y: 0.16, z: z + (hind ? -0.2 : 0.1), ao: 0 }))
  }
  // Tack: saddle with pommel and cantle, girth, stirrups, bridle and reins.
  const saddle = opts.saddle ?? LEATHER
  g.push(part(box(1.5, 0.35, 1.9), saddle, { y: 5.5, z: -0.25 }))
  g.push(part(box(0.9, 0.5, 0.3), saddle, { y: 5.85, z: 0.72, rx: 0.2, ao: 0 }))
  g.push(part(box(1.25, 0.6, 0.28), saddle, { y: 5.95, z: -1.18, rx: -0.25, ao: 0 }))
  g.push(part(box(2.3 * w, 0.2, 0.32), LEATHER, { y: 4.25, z: 0.6, ao: 0 }))
  for (const s of [-1, 1]) {
    span(g, [s * 0.95 * w, 5.4, -0.1], [s * 1.2 * w, 3.85, 0.05], 0.05, LEATHER)
    g.push(part(box(0.45, 0.1, 0.4), STEEL_D, { x: s * 1.22 * w, y: 3.75, z: 0.05, ao: 0 }))
    span(g, [s * 0.35, 6.55, 5.0], [s * 0.6, 6.0, 1.0], 0.04, LEATHER)
    g.push(part(box(0.06, 0.95, 0.08), LEATHER, { x: s * 0.44, y: 7.15, z: 4.0, rx: 0.5, ao: 0 }))
  }
  g.push(part(box(0.86, 0.08, 0.08), LEATHER, { y: 7.55, z: 4.35, rx: 0.5, ao: 0 }))
  if (opts.packs) {
    g.push(part(box(0.9, 0.9, 0.55), LEATHER_L, { x: -1.05 * w, y: 4.95, z: -1.55 }))
    g.push(part(box(0.9, 0.9, 0.55), LEATHER_L, { x: 1.05 * w, y: 4.95, z: -1.55 }))
    g.push(part(cyl(0.38, 0.38, 2.1, 6), 0x7a6a4c, { y: 5.95, z: -1.65, rz: Math.PI / 2 }))
  }
  if (opts.chanfron !== undefined) {
    g.push(part(box(0.72, 0.9, 1.8), opts.chanfron, { y: 7.2, z: 4.15, rx: 0.55, ao: 0 }))
    g.push(part(cone(0.12, 0.6, 4), opts.chanfron, { y: 7.85, z: 4.0, rx: -0.3, ao: 0 }))
  }
  if (!tinted) return
  if (opts.caparison) {
    const c = opts.caparison
    // The trapper: from the withers to just above the hooves, flaring at the hem, and a crinet down the neck.
    tinted.push(part(cyl(1.35 * w, 1.62 * w, 2.7, 10), WHITE, { y: 3.95, sz: 2.25, ao: 0.15 }))
    tinted.push(part(cyl(0.95, 1.05, 2.3, 7), WHITE, { y: 6.0, z: 2.85, rx: 0.62, sx: 0.88, sz: 0.95 }))
    g.push(part(cyl(1.64 * w, 1.66 * w, 0.24, 10), c.trim, { y: 2.66, sz: 2.25, ao: 0 }))
    g.push(part(cyl(1.37 * w, 1.37 * w, 0.18, 10), c.trim, { y: 5.25, sz: 2.25, ao: 0 }))
    if (c.split) g.push(part(box(0.18, 2.6, 0.12), c.trim, { y: 3.95, z: 3.62, ao: 0 }))
    if (c.scallop || c.spikes !== undefined)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const px = Math.cos(a) * 1.64 * w
        const pz = Math.sin(a) * 1.64 * 2.25 * 0.97
        if (c.spikes !== undefined) g.push(part(cone(0.2, 0.7, 4), c.spikes, { x: px * 0.85, y: 4.6, z: pz * 0.85, rz: -Math.cos(a) * 1.4, rx: Math.sin(a) * 1.4, ao: 0 }))
        else tinted.push(part(cone(0.32, 0.5, 4), WHITE, { x: px, y: 2.35, z: pz, rx: Math.PI, ao: 0 }))
      }
  } else if (opts.cloth !== undefined) {
    tinted.push(part(box(2.5 * w, 1.15, 2.6), WHITE, { y: 4.85, z: -0.3, ao: 0.1 }))
    g.push(part(box(2.54 * w, 0.16, 2.64), opts.cloth, { y: 4.3, z: -0.3, ao: 0 }))
  }
}

/** A man in the saddle: thighs along the horse, shins down to the stirrups, a tapered torso. */
function rider(g: G, body: number, hose: number, opts: { y0?: number; boot?: number; skirt?: number } = {}) {
  const y0 = opts.y0 ?? 5.6
  for (const s of [-1, 1]) {
    g.push(part(limb(0.36, 0.32, 1.7), hose, { x: s * 0.95, y: y0 + 0.25, z: 0.25, rx: Math.PI / 2 - 0.15 }))
    if (lo) continue
    g.push(part(limb(0.3, 0.24, 1.6), hose, { x: s * 1.18, y: y0 - 0.75, z: 0.75, rx: 0.15 }))
    g.push(part(box(0.55, 0.42, 0.9), opts.boot ?? BOOT, { x: s * 1.2, y: y0 - 1.7, z: 0.95, ao: 0 }))
  }
  torso(g, body, { y: y0 + 2.05 })
  if (opts.skirt !== undefined) g.push(part(limb(0.82, 1.15, 0.9, 6), opts.skirt, { y: y0 + 0.6, sz: 0.75, ry: Math.PI / 6 }))
}

// ---- The figures -------------------------------------------------------------------------------

export function figureGeometries(kind: FigureKind, detail: 'near' | 'far' = 'near'): { tinted: THREE.BufferGeometry; plain: THREE.BufferGeometry; scale: number } {
  lo = detail === 'far'
  const plain: G = []
  const tinted: G = []
  let scale = 1
  switch (kind) {
    case 'spearmen':
    case 'spearmen_lv': {
      // A spearman: a quilted gambeson over a short tunic, a kettle hat with a nasal, a bossed
      // round shield with a painted rim, and a long ash spear (levelled when the lines meet).
      const lv = kind === 'spearmen_lv'
      legs(plain, HOSE, BOOT, lv ? 0.6 : 0.15)
      skirt(plain, 0x8a7a5a, 1.1)
      torso(plain, 0x9a8a68, { belt: LEATHER })
      fine(plain, part(box(1.6, 0.12, 1.02), 0x7a6a4c, { y: 4.6, ao: 0 }))
      fine(plain, part(box(1.6, 0.12, 1.02), 0x7a6a4c, { y: 3.9, ao: 0 }))
      tinted.push(part(limb(0.82, 0.74, 1.6, 6), WHITE, { y: 4.0, sz: 0.66, ry: Math.PI / 6 }))
      shoulders(plain, 0x8a7a5a, 0.5)
      const h = arm(plain, 1, 0x8a7a5a, lv ? 0.9 : 0.55)
      arm(plain, -1, 0x8a7a5a, 0.45)
      face(plain, 6.1, { hair: 0x4a3424 })
      kettleHat(plain, 6.55)
      roundShield(plain, tinted, 1.35, -1.6, 4.2, 0.6)
      spear(plain, tinted, h, lv ? { level: 1.42, len: 11 } : { pennon: true })
      break
    }
    case 'men_at_arms': {
      // A man-at-arms: mail hauberk under a heraldic surcoat, plate pauldrons and a fauld, a
      // visored bascinet with an aventail, a trimmed heater shield and a broadsword.
      legs(plain, MAIL, STEEL_D, 0.25)
      skirt(plain, MAIL, 1.25, 3.05, 1.1)
      torso(plain, MAIL, { belt: LEATHER })
      tinted.push(part(limb(0.9, 0.84, 2.0, 6), WHITE, { y: 4.05, sz: 0.68, ry: Math.PI / 6 }))
      tinted.push(part(limb(0.86, 1.12, 1.3, 6), WHITE, { y: 2.55, sz: 0.7, ry: Math.PI / 6 }))
      shoulders(plain, STEEL, 0.62)
      fine(plain, part(box(0.75, 0.12, 0.6), STEEL_D, { x: 1.12, y: 4.85, ao: 0 }))
      const h = arm(plain, 1, MAIL, 0.6, { hand: STEEL_D, bracer: STEEL })
      arm(plain, -1, MAIL, 0.4, { hand: STEEL_D, bracer: STEEL })
      fine(plain, part(limb(0.32, 0.34, 0.5), MAIL, { y: 5.45, ao: 0 }))
      bascinet(plain, 6.25)
      heaterShield(plain, tinted, -1.6, 4.2, 0.55)
      sword(plain, h, { up: 0.9 })
      scale = 1.05
      break
    }
    case 'archers': {
      // A longbowman: a brigandine jerkin, a hooded chaperon in the band's colour, leather bracer,
      // the bow drawn, a quiver of fletched arrows at the hip, buckler and short sword at the belt.
      legs(plain, 0x4f5a3a, BOOT, 0.45)
      skirt(plain, LEATHER_L, 0.9)
      torso(plain, LEATHER_L, { belt: LEATHER })
      fine(plain, part(limb(0.9, 0.72, 1.5, 6), 0x5a3a24, { y: 4.3, sz: 0.66, ry: Math.PI / 6 }))
      for (let i = 0; i < 3; i++) fine(plain, part(box(0.12, 0.12, 0.12), GOLD, { x: -0.35 + i * 0.35, y: 4.6, z: 0.66, ao: 0 }))
      const bowHand = arm(plain, -1, LEATHER_L, 1.0, { lift: 0.35, bracer: LEATHER })
      const draw = arm(plain, 1, LEATHER_L, 0.85, { lift: 0.25, out: -0.15 })
      face(plain, 6.1, { hair: 0x5a3a24 })
      // The chaperon: the hood and its shoulder cape take the band's colour.
      tinted.push(part(lump(0.84), WHITE, { y: 6.25, z: -0.28, sy: 1.08, ao: 0.1 }))
      tinted.push(part(cone(0.4, 1.1, lo ? 4 : 5), WHITE, { y: 6.55, z: -1.0, rx: -1.25, ao: 0 }))
      tinted.push(part(limb(0.95, 1.25, 0.65, 6), WHITE, { y: 5.4, sz: 0.8, ao: 0 }))
      longbow(plain, bowHand, [draw[0] - 0.4, draw[1] + 0.1, draw[2] - 0.6])
      quiver(plain, 0.95, 3.4, -0.35, 0.25)
      fine(plain, part(cyl(0.45, 0.45, 0.12, 8), STEEL_D, { x: -0.95, y: 3.0, z: 0.1, rz: Math.PI / 2, ao: 0 }))
      fine(plain, part(box(0.1, 1.6, 0.18), STEEL_L, { x: -0.9, y: 2.6, z: -0.5, rx: -0.4, ao: 0 }))
      scale = 0.95
      break
    }
    case 'engineer': {
      // A sapper: leather apron over a work tunic, a kettle hat, a pack and tool roll on the back,
      // and a heavy iron-shod pick over the shoulder.
      legs(plain, HOSE, BOOT, 0.2)
      skirt(plain, CLOTH, 1.0)
      torso(plain, CLOTH, { belt: LEATHER })
      tinted.push(part(limb(0.86, 0.78, 1.3, 6), WHITE, { y: 4.45, sz: 0.64, ry: Math.PI / 6 }))
      plain.push(part(box(1.4, 2.6, 0.14), LEATHER_L, { y: 3.3, z: 0.62 }))
      const h = arm(plain, 1, CLOTH, 0.2, { lift: 0.9 })
      arm(plain, -1, CLOTH, 0.35)
      face(plain, 6.1, { hair: 0x3a2a1a, beard: 0x3a2a1a, beardStyle: 'short' })
      kettleHat(plain, 6.55, STEEL_D)
      plain.push(part(box(1.3, 1.5, 0.75), 0x6a5a40, { y: 4.4, z: -0.95 }))
      fine(plain, part(cyl(0.3, 0.3, 1.5, 6), 0x9a8a6a, { y: 5.25, z: -0.95, rz: Math.PI / 2, ao: 0 }))
      // The pick: haft over the shoulder, iron head behind.
      span(plain, [h[0], h[1] - 0.4, h[2] + 0.3], [0.9, 7.4, -1.6], 0.11, WOOD)
      plain.push(part(box(0.24, 0.3, 2.3), IRON, { x: 0.9, y: 7.45, z: -1.6, rx: 0.6, ao: 0 }))
      fine(plain, part(cone(0.14, 0.6, 4), IRON, { x: 0.9, y: 8.15, z: -0.65, rx: 0.6 + Math.PI / 2, ao: 0 }))
      fine(plain, part(new THREE.TorusGeometry(0.5, 0.15, 4, 8), 0xb8ab8a, { x: -1.0, y: 3.3, z: -0.45, ry: Math.PI / 2, ao: 0 }))
      scale = 0.95
      break
    }
    case 'light_cavalry': {
      // A hobelar: a riding cloak over leather, an open-faced spangenhelm, a small targe, a javelin
      // poised and spares at the saddle, on a sleek bay courser with a coloured saddle cloth.
      horse(plain, 0x7a4f30, { blaze: true, cloth: 0xd8c8a0, build: 'lean' }, tinted)
      rider(plain, LEATHER_L, 0x4f5a3a)
      tinted.push(part(limb(0.9, 0.8, 1.4, 6), WHITE, { y: 7.95, sz: 0.66, ry: Math.PI / 6 }))
      plain.push(part(box(2.0, 2.6, 0.2), 0x3a4a5a, { y: 7.9, z: -0.95, rx: 0.45 }))
      shoulders(plain, LEATHER_L, 0.48, 8.7)
      const h = arm(plain, 1, LEATHER_L, 0.6, { y: 8.7, lift: 0.8 })
      arm(plain, -1, LEATHER_L, 0.45, { y: 8.7 })
      face(plain, 9.75, { hair: 0x4a3424, beard: 0x4a3424, beardStyle: 'short' })
      plain.push(part(cone(0.8, 1.0, lo ? 4 : 6), STEEL, { y: 10.35, ao: 0 }))
      fine(plain, part(cyl(0.8, 0.8, 0.15, 8), BRONZE, { y: 9.9, ao: 0 }))
      fine(plain, part(box(0.12, 0.65, 0.12), STEEL_D, { y: 9.7, z: 0.72, ao: 0 }))
      roundShield(plain, tinted, 0.85, -1.5, 7.9, 0.4)
      span(plain, [h[0], h[1] - 1.4, h[2] - 1.6], [h[0], h[1] + 1.2, h[2] + 2.6], 0.08, WOOD)
      plain.push(part(cone(0.15, 0.8, 4), STEEL_L, { x: h[0], y: h[1] + 1.45, z: h[2] + 3.0, rx: 1.02, ao: 0 }))
      for (let i = 0; i < 3; i++) fine(plain, part(cyl(0.06, 0.06, 3.2, 4), WOOD, { x: 1.25 + i * 0.12, y: 5.2, z: -0.9, rx: 1.25, ao: 0 }))
      break
    }
    case 'knights': {
      // A knight: a heavy destrier in a split caparison with a scalloped hem and a steel chanfron,
      // plate and a heraldic surcoat, a plumed great helm, a couched lance with a forked pennon.
      horse(plain, 0x4a4038, { chanfron: STEEL, caparison: { trim: LINEN, scallop: true, split: true }, build: 'heavy' }, tinted)
      rider(plain, STEEL, STEEL_D, { boot: STEEL_D })
      tinted.push(part(limb(0.95, 0.85, 1.7, 6), WHITE, { y: 7.75, sz: 0.68, ry: Math.PI / 6 }))
      shoulders(plain, STEEL, 0.66, 8.75)
      arm(plain, 1, STEEL, 0.65, { y: 8.75, hand: STEEL_D })
      arm(plain, -1, STEEL, 0.4, { y: 8.75, hand: STEEL_D })
      greatHelm(plain, 10.0)
      plume(plain, WHITE, 10.8, tinted)
      heaterShield(plain, tinted, -1.6, 8.0, 0.45, 0.9)
      lance(plain, tinted)
      scale = 1.1
      break
    }
    case 'royal_guard': {
      // The King's household knights: burnished dark steel with gold filigree, crowned helm crests
      // with tall plumes, grey chargers in caparisons of the realm's colours with gilt chest plates,
      // gilded lances.
      horse(plain, 0x9a948a, { mane: 0xe8e2d6, chanfron: DARK_STEEL, caparison: { trim: GOLD, scallop: true, split: true }, build: 'heavy' }, tinted)
      fine(plain, part(box(2.0, 1.5, 0.3), GOLD, { y: 4.4, z: 3.25, rx: -0.2, ao: 0 }))
      rider(plain, DARK_STEEL, 0x3a3f48, { boot: DARK_STEEL })
      plain.push(part(limb(0.98, 0.98, 0.26, 6), GOLD, { y: 7.05, sz: 0.65, ry: Math.PI / 6, ao: 0 }))
      tinted.push(part(limb(0.96, 0.86, 1.6, 6), WHITE, { y: 7.85, sz: 0.68, ry: Math.PI / 6 }))
      shoulders(plain, DARK_STEEL, 0.7, 8.75)
      for (const s of [-1, 1]) fine(plain, part(box(0.75, 0.12, 0.72), GOLD, { x: s * 1.12, y: 9.05, ao: 0 }))
      arm(plain, 1, DARK_STEEL, 0.65, { y: 8.75, hand: GOLD })
      arm(plain, -1, DARK_STEEL, 0.4, { y: 8.75, hand: GOLD })
      greatHelm(plain, 10.0, DARK_STEEL)
      fine(plain, part(cyl(0.76, 0.76, 0.2, 8), GOLD, { y: 10.55, ao: 0 }))
      crown(plain, 10.95, 0.62)
      plume(plain, WHITE, 11.4, tinted)
      heaterShield(plain, tinted, -1.65, 8.0, 0.45, 0.95)
      fine(plain, part(box(0.26, 1.0, 1.0), GOLD, { x: -1.78, y: 8.3, z: 0.45, rx: Math.PI / 4, ao: 0 }))
      lance(plain, tinted, { color: 0x3a3f48, tip: GOLD })
      scale = 1.15
      break
    }
    case 'thorn_guard': {
      // The Usurper's Thorn Guard: crimson-lacquered gothic plate with bronze, fluted and thorned
      // pauldrons, horned crowned visors, black chargers with bone chanfrons and spiked barding.
      horse(plain, 0x231c1a, { mane: 0x101010, chanfron: 0xd8cdb0, caparison: { trim: BRONZE, spikes: 0xd8cdb0 }, build: 'heavy' }, tinted)
      rider(plain, 0x6a1e24, 0x3a1416, { boot: 0x3a1416 })
      plain.push(part(limb(0.98, 0.98, 0.26, 6), BRONZE, { y: 7.05, sz: 0.65, ry: Math.PI / 6, ao: 0 }))
      tinted.push(part(limb(0.96, 0.86, 1.6, 6), WHITE, { y: 7.85, sz: 0.68, ry: Math.PI / 6 }))
      shoulders(plain, 0x6a1e24, 0.72, 8.75)
      for (const s of [-1, 1]) {
        plain.push(part(cone(0.18, 1.1, 4), BRONZE, { x: s * 1.5, y: 9.3, rz: -s * 0.7, ao: 0 }))
        fine(plain, part(cone(0.14, 0.8, 4), BRONZE, { x: s * 1.2, y: 9.45, z: -0.35, rz: -s * 0.3, rx: -0.4, ao: 0 }))
      }
      arm(plain, 1, 0x6a1e24, 0.65, { y: 8.75, hand: 0x3a1416 })
      arm(plain, -1, 0x6a1e24, 0.4, { y: 8.75, hand: 0x3a1416 })
      bascinet(plain, 9.9, 0x6a1e24)
      for (const s of [-1, 1]) plain.push(part(cone(0.22, 1.4, 4), 0xd8cdb0, { x: s * 0.62, y: 11.0, rz: -s * 0.55, ao: 0 }))
      fine(plain, part(cyl(0.6, 0.62, 0.16, 8), BRONZE, { y: 10.45, ao: 0 }))
      heaterShield(plain, tinted, -1.65, 8.0, 0.45, 0.95)
      lance(plain, tinted, { color: 0x2a1a1a, tip: BRONZE })
      scale = 1.15
      break
    }
    case 'solar_guard': {
      // The Sun Emperor's Solar Guard: burnished bronze plate inlaid with gold over ivory surcoats,
      // sun-disc crests with rays round their helms, white chargers in gold-and-ivory caparisons with
      // a sunburst on the chest, gilded lances.
      horse(plain, 0xe8e2d4, { mane: 0xd8b060, chanfron: 0xb8862a, caparison: { trim: GOLD, scallop: true, split: true }, build: 'heavy' }, tinted)
      fine(plain, part(cyl(0.9, 0.9, 0.2, 10), GOLD, { y: 4.6, z: 3.3, rx: Math.PI / 2 - 0.2, ao: 0 }))
      rider(plain, 0xb8862a, 0x8a6a2a, { boot: 0x8a6a2a })
      plain.push(part(limb(0.98, 0.98, 0.26, 6), GOLD, { y: 7.05, sz: 0.65, ry: Math.PI / 6, ao: 0 }))
      tinted.push(part(limb(0.96, 0.86, 1.6, 6), WHITE, { y: 7.85, sz: 0.68, ry: Math.PI / 6 }))
      plain.push(part(limb(0.6, 0.6, 1.4, 6), 0xf0e8d8, { y: 7.6, z: 0.35, sz: 0.3, ao: 0 }))
      shoulders(plain, 0xb8862a, 0.7, 8.75)
      for (const sd of [-1, 1]) fine(plain, part(cone(0.3, 0.9, 5), GOLD, { x: sd * 1.45, y: 9.2, rz: -sd * 1.2, ao: 0 }))
      arm(plain, 1, 0xb8862a, 0.65, { y: 8.75, hand: GOLD })
      arm(plain, -1, 0xb8862a, 0.4, { y: 8.75, hand: GOLD })
      greatHelm(plain, 10.0, 0xc8963a)
      // The sun-disc crest with its rays.
      plain.push(part(cyl(0.75, 0.75, 0.16, lo ? 6 : 12), GOLD, { y: 11.6, z: -0.1, rx: Math.PI / 2, ao: 0 }))
      if (!lo) for (let i = 0; i < 8; i++) plain.push(part(cone(0.12, 0.6, 3), GOLD, { x: Math.cos((i / 8) * Math.PI * 2) * 0.95, y: 11.6 + Math.sin((i / 8) * Math.PI * 2) * 0.95, z: -0.1, rz: (i / 8) * Math.PI * 2 - Math.PI / 2, ao: 0 }))
      heaterShield(plain, tinted, -1.65, 8.0, 0.45, 0.95)
      fine(plain, part(cyl(0.45, 0.45, 0.12, 10), GOLD, { x: -1.8, y: 8.3, z: 0.45, rz: Math.PI / 2, ao: 0 }))
      lance(plain, tinted, { color: 0xd8b060, tip: GOLD })
      scale = 1.15
      break
    }
    case 'assassin': {
      // An assassin of the Blades (or the Grey Sisters): low in a crouch, layered cowls over a
      // shadowed face, a split cloak flowing behind, a sash and a bandolier across the chest, and a
      // curved dagger in each hand catching the light.
      const coat = 0x3a3d48
      const cloak = 0x272a33
      legs(plain, 0x1e1f24, 0x1a1a1e, 0.55)
      // The crouch: everything above the hips leans forward and sits lower.
      const k = 0.4
      plain.push(part(limb(0.9, 0.72, 2.1, 6), coat, { y: 3.95, z: 0.35, rx: k, sz: 0.62, ry: Math.PI / 6 }))
      tinted.push(part(box(1.75, 0.38, 1.0), WHITE, { y: 3.15, z: 0.1, rx: k * 0.5, ao: 0 }))
      tinted.push(part(box(0.3, 2.3, 0.12), WHITE, { x: 0.05, y: 4.1, z: 0.88, rx: k, rz: 0.55, ao: 0 }))
      fine(plain, part(box(0.32, 2.4, 0.14), LEATHER, { x: -0.05, y: 4.1, z: 0.9, rx: k, rz: -0.55, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(1.05, 2.9, 0.16), cloak, { x: s * 0.6, y: 3.6, z: -0.65, rx: 0.35, rz: s * 0.12 }))
      plain.push(part(limb(1.0, 1.3, 0.7, 6), cloak, { y: 5.2, z: 0.6, rx: k, sz: 0.8 }))
      const hy = 5.7
      fine(plain, part(limb(0.3, 0.34, 0.45), SKIN, { y: hy - 0.5, z: 0.95, ao: 0 }))
      plain.push(part(head(0.64), SKIN, { y: hy + 0.05, z: 1.05, ao: 0 }))
      // Two cowls, one over the other, pulled low; a mask over the mouth.
      plain.push(part(lump(0.82), cloak, { y: hy + 0.15, z: 0.82, sy: 1.12, ao: 0.1 }))
      fine(plain, part(lump(0.9), coat, { y: hy - 0.2, z: 0.7, sy: 0.7, ao: 0 }))
      plain.push(part(cone(0.4, 1.3, lo ? 4 : 5), cloak, { y: hy + 0.4, z: 0.1, rx: -1.3, ao: 0 }))
      fine(plain, part(box(1.2, 0.22, 0.45), cloak, { y: hy + 0.5, z: 1.55, rx: 0.5, ao: 0 }))
      fine(plain, part(box(0.85, 0.4, 0.12), coat, { y: hy - 0.35, z: 1.68, ao: 0 }))
      for (const sd of [-1, 1] as const) {
        const h = arm(plain, sd, coat, 0.75, { y: 4.85, hand: 0x1a1a1e })
        // A curved dagger: a bright blade bending forward, a dark grip.
        plain.push(part(cone(0.16, 1.4, 4), STEEL_L, { x: h[0], y: h[1] + 0.15, z: h[2] + 0.75, rx: Math.PI / 2 - 0.25, sx: 0.4, ao: 0 }))
        fine(plain, part(box(0.5, 0.1, 0.14), BRONZE, { x: h[0], y: h[1], z: h[2] + 0.12, ao: 0 }))
      }
      scale = 0.95
      break
    }
    case 'saboteur': {
      // A saboteur of the Night Sappers (or the Rootcutters): a short hooded work-cloak over a
      // leather jerkin, a miner's mattock in hand, a shuttered dark-lantern at the belt glowing
      // through its slits, a coil of fuse-rope and a powder-pot satchel on the back.
      const coat = 0x4a3a2a
      const cloak = 0x2e261e
      legs(plain, 0x2a2420, BOOT, 0.35)
      skirt(plain, coat, 0.9)
      torso(plain, coat, { belt: LEATHER })
      tinted.push(part(limb(0.86, 0.78, 1.2, 6), WHITE, { y: 4.5, sz: 0.62, ry: Math.PI / 6 }))
      plain.push(part(box(2.0, 2.7, 0.16), cloak, { y: 4.3, z: -0.75, rx: 0.2 }))
      const h = arm(plain, 1, coat, 0.45, { lift: 0.6, hand: 0x2a2420 })
      const l = arm(plain, -1, coat, 0.35, { hand: 0x2a2420 })
      face(plain, 6.0, { hair: 0x3a2a1a, beard: 0x3a2a1a, beardStyle: 'stubble' })
      hood(plain, cloak, 6.0, 1.0)
      // A soot-dark scarf over mouth and nose.
      fine(plain, part(box(0.95, 0.38, 0.14), 0x1e1a16, { y: 5.75, z: 0.66, ao: 0 }))
      // The mattock: a short haft held across the body, an iron head with pick and adze.
      span(plain, [h[0], h[1] - 0.6, h[2] - 0.1], [h[0] - 0.3, h[1] + 2.4, h[2] + 0.6], 0.1, WOOD)
      plain.push(part(box(0.22, 0.26, 1.9), IRON, { x: h[0] - 0.3, y: h[1] + 2.45, z: h[2] + 0.6, ao: 0 }))
      fine(plain, part(cone(0.12, 0.5, 4), IRON, { x: h[0] - 0.3, y: h[1] + 2.45, z: h[2] + 1.75, rx: Math.PI / 2, ao: 0 }))
      // The dark-lantern swinging from the left hand, its light through the slits.
      plain.push(part(box(0.5, 0.65, 0.5), IRON, { x: l[0], y: l[1] - 0.55, z: l[2] + 0.1, ao: 0 }))
      fine(plain, part(box(0.52, 0.16, 0.52), 0xffb050, { x: l[0], y: l[1] - 0.5, z: l[2] + 0.1, ao: 0 }))
      // The satchel with its powder pot, and the coil of fuse-rope.
      plain.push(part(box(1.25, 1.35, 0.7), 0x6a5236, { y: 4.4, z: -1.0 }))
      fine(plain, part(sphere(0.38, 0), 0x3a3a36, { y: 5.3, z: -1.05, ao: 0 }))
      fine(plain, part(new THREE.TorusGeometry(0.48, 0.13, 4, 8), 0xb8a070, { x: 0.95, y: 3.4, z: -0.3, ry: Math.PI / 2, ao: 0 }))
      scale = 0.95
      break
    }
    case 'outrider': {
      // An outrider of the Wardens (or the Thorn Hunt): a mounted bowman on a lean steppe horse with
      // saddlebags and a bedroll, a sweeping hooded ranger cloak, a composite recurve bow held at
      // the ready with an arrow on the string, a feathered quiver at the hip.
      const jerkin = 0x5a6b3a
      const cloak = 0x46602f
      horse(plain, 0xa07c50, { mane: 0x3a2618, cloth: LINEN, build: 'lean', packs: true }, tinted)
      rider(plain, jerkin, 0x5a4630)
      tinted.push(part(box(1.9, 0.45, 1.25), WHITE, { y: 8.45, ao: 0 }))
      plain.push(part(box(2.1, 3.0, 0.22), cloak, { y: 7.7, z: -1.05, rx: 0.5 }))
      fine(plain, part(box(1.7, 1.5, 0.18), cloak, { y: 6.6, z: -2.15, rx: 0.95 }))
      const bowHand = arm(plain, -1, jerkin, 0.85, { y: 8.65, lift: 0.2, bracer: LEATHER })
      const draw = arm(plain, 1, jerkin, 0.6, { y: 8.65, out: -0.2 })
      face(plain, 9.75, { hair: 0x5a3a24 })
      hood(plain, cloak, 9.75, 0.95)
      longbow(plain, bowHand, [draw[0] - 0.5, draw[1], draw[2] - 0.4], { r: 2.1, wood: 0x9a6a36 })
      for (const sd of [-1, 1]) fine(plain, part(cone(0.1, 0.6, 4), 0x2a1a10, { x: bowHand[0], y: bowHand[1] + sd * 1.95 - 0.3, z: bowHand[2] - 0.2, rx: sd * -0.9, ao: 0 }))
      quiver(plain, 1.45, 6.6, -0.6, -0.35, 0xc8a060)
      break
    }
    // ---- A spymaster's band in disguise: pilgrims, pedlars' mules and a covered cart. ----
    case 'pilgrim': {
      // A pilgrim (or a soldier dressed as one): a long hooded robe with a cord, a scrip and a
      // strapped pack, a travel staff with a gourd and a little lantern, a scallop badge.
      const robe = 0x6a5e4c
      const cowl = 0x4e4436
      plain.push(part(limb(0.95, 1.3, 4.4, lo ? 5 : 8), robe, { y: 2.3, sz: 0.8 }))
      torso(plain, robe, { y: 4.6, belt: 0xb8a070 })
      const h = arm(plain, 1, robe, 0.5)
      arm(plain, -1, robe, 0.3)
      face(plain, 6.05, { hair: 0x4a3a2a, beard: 0x4a3a2a, beardStyle: 'short' })
      hood(plain, cowl, 6.05)
      span(plain, [h[0], -0.1, h[2] + 0.1], [h[0], 8.8, h[2] + 0.4], 0.1, WOOD)
      fine(plain, part(lump(0.32), 0xc9a46a, { x: h[0] + 0.2, y: 7.6, z: h[2] + 0.4, sy: 1.3, ao: 0 }))
      fine(plain, part(box(0.4, 0.55, 0.4), 0xe8c060, { x: h[0] - 0.05, y: 8.0, z: h[2] + 0.7, ao: 0 }))
      plain.push(part(box(1.4, 1.7, 0.9), 0x8a7a5a, { y: 4.7, z: -0.95 }))
      fine(plain, part(box(1.5, 0.12, 1.0), LEATHER, { y: 5.0, z: -0.95, ao: 0 }))
      fine(plain, part(cyl(0.35, 0.35, 1.5, 6), 0x9a8a68, { y: 5.75, z: -0.95, rz: Math.PI / 2, ao: 0 }))
      tinted.push(part(box(0.5, 0.5, 0.12), WHITE, { x: -0.45, y: 5.0, z: 0.62, ao: 0 }))
      scale = 0.95
      break
    }
    case 'mule': {
      // A pack mule: bales and a pack frame roped across its back, a water skin and a pot hanging.
      horse(plain, 0x5e5048, { mane: 0x2a201a, saddle: 0x4a3a2a }, tinted)
      plain.push(part(box(3.4, 1.5, 2.1), 0x9a8a68, { y: 6.2, z: -0.3 }))
      fine(plain, part(box(2.4, 1.0, 1.5), 0x7a6a4c, { y: 7.35, z: -0.3 }))
      fine(plain, part(box(3.5, 0.16, 0.24), LEATHER, { y: 6.2, z: 0.75, ao: 0 }))
      fine(plain, part(box(3.5, 0.16, 0.24), LEATHER, { y: 6.2, z: -1.35, ao: 0 }))
      fine(plain, part(lump(0.45), 0x6a4a2a, { x: 1.85, y: 5.4, z: 0.4, sy: 1.3, ao: 0 }))
      fine(plain, part(cyl(0.4, 0.3, 0.5, 6), IRON, { x: -1.85, y: 5.4, z: -0.4, ao: 0 }))
      tinted.push(part(box(2.4, 0.3, 2.6), WHITE, { y: 5.45, z: -0.3, ao: 0 }))
      scale = 0.8
      break
    }
    case 'cart': {
      // A pedlar's covered cart: two big spoked wheels, a bed of planks, canvas over hooped ribs,
      // roped cargo at the tail and the shafts out in front.
      plain.push(part(box(4.2, 0.6, 7), WOOD, { y: 2.6 }))
      fine(plain, part(box(4.3, 0.8, 0.2), 0x5a3f22, { y: 3.2, z: 3.4, ao: 0 }))
      for (const s of [-1, 1]) {
        plain.push(part(new THREE.TorusGeometry(1.75, 0.2, 4, lo ? 6 : 14), 0x4a3520, { x: s * 2.4, y: 1.9, ry: Math.PI / 2 }))
        if (!lo) for (let i = 0; i < 4; i++) plain.push(part(box(0.12, 3.4, 0.16), 0x5a3f22, { x: s * 2.4, y: 1.9, rx: (i / 4) * Math.PI, ao: 0 }))
        fine(plain, part(cyl(0.4, 0.4, 0.6, 6), 0x2e2116, { x: s * 2.4, y: 1.9, rz: Math.PI / 2, ao: 0 }))
        plain.push(part(rod(0.12, 0.12, 6), WOOD, { x: s * 1.1, y: 2.5, z: 6.2, rx: Math.PI / 2 + 0.1 }))
      }
      plain.push(part(cyl(2.1, 2.1, 6.0, lo ? 5 : 9), LINEN, { y: 3.8, rx: Math.PI / 2 }))
      if (!lo) for (const z of [-2.6, 0, 2.6]) plain.push(part(new THREE.TorusGeometry(2.15, 0.1, 3, 9, Math.PI), 0x5a3f22, { y: 3.8, z, ao: 0 }))
      fine(plain, part(box(3.4, 1.2, 1.4), 0x9a8a68, { y: 3.4, z: -3.6 }))
      fine(plain, part(box(3.5, 0.12, 0.14), LEATHER, { y: 4.0, z: -3.6, ao: 0 }))
      tinted.push(part(box(0.1, 0.9, 1.4), WHITE, { x: 0, y: 6.4, z: -2.6, ao: 0 }))
      scale = 1
      break
    }
    case 'siege': {
      // A tortoise ram: a timber frame on four spoked wheels, a pitched roof of planks under hide
      // and iron plates, the beam slung on chains with its iron ram's head.
      plain.push(part(box(5, 1.0, 9), WOOD, { y: 2.6 }))
      for (const s of [-1, 1]) {
        for (const z of [-3.6, 0, 3.6]) plain.push(part(box(0.5, 4.4, 0.5), 0x5a3f22, { x: s * 2.3, y: 4.7, z }))
        fine(plain, part(box(0.3, 0.3, 9), 0x5a3f22, { x: s * 2.3, y: 6.8, ao: 0 }))
        fine(plain, part(box(0.25, 0.25, 4.6), 0x5a3f22, { x: s * 2.3, y: 4.6, z: -1.8, rx: 0.75, ao: 0 }))
      }
      plain.push(part(cyl(0.65, 0.75, 11, lo ? 5 : 7), 0x5a3f22, { y: 4.2, z: 1, rx: Math.PI / 2 }))
      fine(plain, part(cyl(0.8, 0.8, 0.3, 7), IRON, { y: 4.2, z: 4.2, rx: Math.PI / 2, ao: 0 }))
      fine(plain, part(cyl(0.8, 0.8, 0.3, 7), IRON, { y: 4.2, z: -2.4, rx: Math.PI / 2, ao: 0 }))
      plain.push(part(cyl(1.0, 0.3, 1.8, 6), IRON, { y: 4.2, z: 7.3, rx: Math.PI / 2, ao: 0 }))
      fine(plain, part(cone(0.35, 0.9, 4), IRON, { x: 0.6, y: 4.6, z: 7.2, rz: -0.9, ao: 0 }))
      fine(plain, part(cone(0.35, 0.9, 4), IRON, { x: -0.6, y: 4.6, z: 7.2, rz: 0.9, ao: 0 }))
      if (!lo) for (const z of [-1.5, 3]) span(plain, [0, 6.9, z], [0, 4.8, z], 0.08, IRON)
      for (const [x, z] of [[-2.8, 3], [2.8, 3], [-2.8, -3], [2.8, -3]]) {
        plain.push(part(new THREE.TorusGeometry(1.35, 0.22, 4, lo ? 6 : 12), 0x4a3520, { x, y: 1.5, z, ry: Math.PI / 2 }))
        if (!lo) for (let i = 0; i < 3; i++) plain.push(part(box(0.14, 2.6, 0.16), 0x5a3f22, { x, y: 1.5, z, rx: (i / 3) * Math.PI, ao: 0 }))
        plain.push(part(cyl(0.4, 0.4, 0.8, 6), 0x2e2116, { x, y: 1.5, z, rz: Math.PI / 2, ao: 0 }))
      }
      // The roof: tinted hides over the ridge, iron plates riveted along the eaves.
      tinted.push(part(cyl(3.6, 3.6, 10, 3), WHITE, { y: 6.6, rx: Math.PI / 2, rz: Math.PI / 2, sx: 0.8 }))
      plain.push(part(box(0.3, 0.3, 10.2), 0x4a3520, { y: 8.4, ao: 0 }))
      if (!lo) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) plain.push(part(box(0.15, 1.0, 2.0), IRON, { x: s * 2.25, y: 6.4, z: -3.6 + i * 2.4, rz: s * 0.9, ao: 0 }))
      scale = 1.1
      break
    }
    // ---- The Endless Night: the risen dead, bone archers, wraith riders, fiends and giants. ----
    case 'thrall': {
      // A risen corpse: hunched and gaunt, grey-green skin over the bones and the ribs bare, rags
      // of old war-gear (a dented helm, a broken shield), arms reaching, eyes burning pale.
      const skin = 0x7d8a72
      const rag = 0x2a2622
      for (const s of [-1, 1]) {
        plain.push(part(limb(0.3, 0.22, 2.8), skin, { x: s * 0.45, y: 1.5, rz: s * 0.06 }))
        fine(plain, part(box(0.6, 0.4, 0.9), 0x3a3a34, { x: s * 0.45, y: 0.2, z: 0.15, ao: 0 }))
        plain.push(part(limb(0.24, 0.18, 2.6), skin, { x: s * 1.05, y: 4.2, z: 0.9, rx: -1.05, rz: s * 0.15 }))
        for (let c = 0; c < 3; c++) fine(plain, part(cone(0.07, 0.5, 3), BONE, { x: s * 1.1 + (c - 1) * 0.15, y: 3.65, z: 2.25, rx: 1.4, ao: 0 }))
      }
      plain.push(part(limb(0.85, 0.65, 2.4, 6), skin, { y: 4.0, z: 0.25, rx: 0.4, sz: 0.62 }))
      for (let i = 0; i < 4; i++) fine(plain, part(box(1.45 - i * 0.12, 0.14, 0.14), BONE, { y: 3.4 + i * 0.42, z: 0.8 + i * 0.13, rx: 0.4, ao: 0 }))
      plain.push(part(limb(0.8, 1.0, 1.4, 6), rag, { y: 2.8, sz: 0.7 }))
      for (let i = 0; i < 4; i++) fine(plain, part(box(0.4, 1.4 + (i % 2) * 0.5, 0.1), rag, { x: -0.7 + i * 0.47, y: 1.7, z: -0.5, rx: 0.15, ao: 0 }))
      plain.push(part(head(0.66), 0xcfc8b0, { y: 5.5, z: 0.9, ao: 0 }))
      plain.push(part(box(0.7, 0.35, 0.5), 0xb8b19a, { y: 4.95, z: 1.2, rx: 0.4, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.22, 0.16, 0.12), 0xb8ffe0, { x: s * 0.24, y: 5.6, z: 1.52, ao: 0 }))
      fine(plain, part(lump(0.72), 0x5a5048, { y: 5.85, z: 0.8, sy: 0.6, rz: 0.3, ao: 0 }))
      fine(plain, part(cyl(0.9, 0.9, 0.12, 7), 0x4a3a2a, { x: -1.4, y: 3.4, z: 0.4, rz: Math.PI / 2, sy: 0.6, ao: 0 }))
      tinted.push(part(box(1.9, 0.5, 1.3), WHITE, { y: 5.1, z: 0.1, rx: 0.4 }))
      fine(tinted, part(box(1.7, 2.2, 0.12), WHITE, { y: 3.9, z: -0.55, rx: 0.25 }))
      scale = 0.98
      break
    }
    case 'bone': {
      // A skeleton archer: bare bones (a skull with its jaw, a rib cage, a spine), a ragged hood and
      // a tattered cape, a black bow drawn, eyes like coals.
      for (const s of [-1, 1]) {
        plain.push(part(rod(0.15, 0.18, 1.5), BONE, { x: s * 0.42, y: 2.3 }))
        plain.push(part(rod(0.13, 0.15, 1.5), BONE, { x: s * 0.42, y: 0.85 }))
        fine(plain, part(lump(0.2), BONE, { x: s * 0.42, y: 1.55, ao: 0 }))
        fine(plain, part(box(0.45, 0.22, 0.8), BONE, { x: s * 0.42, y: 0.12, z: 0.15, ao: 0 }))
      }
      plain.push(part(box(1.25, 0.5, 0.7), BONE, { y: 3.0 }))
      plain.push(part(rod(0.14, 0.14, 2.3), BONE, { y: 4.05, z: -0.2 }))
      for (let i = 0; i < (lo ? 2 : 5); i++) plain.push(part(new THREE.TorusGeometry(0.62 - i * 0.04, 0.07, 3, 8), BONE, { y: 3.65 + i * 0.36, rx: Math.PI / 2, sy: 0.75, ao: 0 }))
      const bowHand = arm(plain, -1, BONE, 1.0, { lift: 0.3, hand: BONE })
      const draw = arm(plain, 1, BONE, 0.8, { lift: 0.2, out: -0.15, hand: BONE })
      plain.push(part(head(0.6), BONE, { y: 5.85, ao: 0 }))
      fine(plain, part(box(0.62, 0.28, 0.55), BONE, { y: 5.3, z: 0.25, rx: 0.25, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.22, 0.2, 0.1), 0xff4a2a, { x: s * 0.22, y: 5.9, z: 0.56, ao: 0 }))
      longbow(plain, bowHand, [draw[0] - 0.4, draw[1], draw[2] - 0.5], { wood: 0x1c1a1e })
      fine(plain, part(limb(0.36, 0.3, 2.2), 0x2a2420, { x: 0.5, y: 4.6, z: -0.7, rx: 0.3 }))
      tinted.push(part(cone(0.95, 1.5, lo ? 4 : 6), WHITE, { y: 6.45, ao: 0.1 }))
      fine(tinted, part(box(1.4, 2.2, 0.1), WHITE, { y: 4.6, z: -0.55, rx: 0.1, ao: 0 }))
      for (let i = 0; i < 3; i++) fine(tinted, part(cone(0.2, 0.7, 3), WHITE, { x: -0.5 + i * 0.5, y: 3.25, z: -0.6, rx: Math.PI, ao: 0 }))
      scale = 0.95
      break
    }
    case 'wraith': {
      // A wraith rider: a skeletal black horse with a mane of fire, a hooded shadow in billowing
      // tatters, pale eyes, and a cursed scythe glowing cold.
      horse(plain, 0x1b1a1f, { mane: 0xff7a2a, saddle: 0x2a1a2e }, tinted)
      for (let i = 0; i < 4; i++) fine(plain, part(box(2.3, 0.14, 0.16), 0x8a8478, { y: 3.6 + i * 0.4, z: 0.6 - i * 0.5, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.2, 0.2, 0.12), 0xff6a2a, { x: s * 0.38, y: 7.4, z: 4.2, ao: 0 }))
      fine(plain, part(cone(0.5, 1.6, 5), 0xff9a3a, { y: 7.2, z: 2.4, rx: -0.9, ao: 0 }))
      tinted.push(part(limb(0.85, 1.25, 3.0, 6), WHITE, { y: 7.4, sz: 0.8 }))
      tinted.push(part(cone(1.05, 2.4, lo ? 4 : 6), WHITE, { y: 9.9, ao: 0.1 }))
      for (let i = 0; i < (lo ? 1 : 5); i++) tinted.push(part(box(0.55, 3.6 - (i % 2) * 0.9, 0.12), WHITE, { x: -1.0 + i * 0.5, y: 6.3, z: -1.1 - (i % 2) * 0.3, rx: 0.45 + (i % 3) * 0.12, ao: 0 }))
      plain.push(part(box(0.9, 0.9, 0.3), 0x0a080c, { y: 9.3, z: 0.62, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.18, 0.14, 0.1), 0xa8fff0, { x: s * 0.22, y: 9.35, z: 0.8, ao: 0 }))
      const h = arm(plain, 1, 0x141218, 0.5, { y: 8.6, lift: 0.6, hand: BONE })
      span(plain, [h[0], h[1] - 3, h[2] - 0.6], [h[0], h[1] + 5, h[2] + 1.2], 0.1, 0x2a2420)
      plain.push(part(box(0.12, 0.5, 3.4), 0x9ffcff, { x: h[0], y: h[1] + 5.1, z: h[2] + 2.6, rx: 0.5, ao: 0 }))
      fine(plain, part(box(0.06, 0.2, 3.0), 0xe8ffff, { x: h[0], y: h[1] + 4.95, z: h[2] + 2.55, rx: 0.5, ao: 0 }))
      scale = 1.05
      break
    }
    case 'fiend': {
      // A fiend of the pit: broad and stooped, cracked hide, ram's horns, membraned bat wings half
      // spread, a barbed tail, hooked claws, and eyes like coals.
      const hide = 0x4a1612
      const dark = 0x241010
      for (const s of [-1, 1]) {
        plain.push(part(limb(0.42, 0.3, 1.6), hide, { x: s * 0.62, y: 2.2, z: 0.2, rx: -0.3 }))
        plain.push(part(limb(0.3, 0.24, 1.5), hide, { x: s * 0.62, y: 0.9, z: 0.1, rx: 0.35 }))
        fine(plain, part(cone(0.5, 0.8, 4), dark, { x: s * 0.6, y: 0.15, z: 0.5, rx: Math.PI / 2, ao: 0 }))
        plain.push(part(limb(0.42, 0.32, 2.8), hide, { x: s * 1.55, y: 4.0, z: 0.4, rx: -0.4, rz: s * 0.25 }))
        for (let c = 0; c < 3; c++) fine(plain, part(cone(0.12, 0.8, 4), 0xd8c8a0, { x: s * 1.7 + (c - 1) * 0.2, y: 2.6, z: 1.3, rx: 1.8, ao: 0 }))
        plain.push(part(cone(0.32, 1.6, 5), 0xd8c8a0, { x: s * 0.75, y: 7.2, z: -0.1, rz: -s * 0.9, ao: 0 }))
        fine(plain, part(cone(0.22, 1.0, 5), 0xd8c8a0, { x: s * 1.35, y: 7.6, z: -0.4, rz: -s * 2.2, ao: 0 }))
        // Wings: a bony arm and two membranes, half spread.
        plain.push(part(rod(0.12, 0.16, 4.0), dark, { x: s * 1.9, y: 7.0, z: -1.0, rz: s * 1.0 }))
        tinted.push(part(box(0.12, 3.2, 2.4), WHITE, { x: s * 2.2, y: 6.2, z: -1.6, rz: s * 0.85, rx: 0.2 }))
        fine(tinted, part(box(0.12, 2.6, 1.8), WHITE, { x: s * 3.1, y: 6.9, z: -1.9, rz: s * 1.3, rx: 0.25 }))
        fine(plain, part(cone(0.12, 0.6, 4), 0xd8c8a0, { x: s * 3.55, y: 8.5, z: -1.0, rz: -s * 0.4, ao: 0 }))
      }
      plain.push(part(limb(1.25, 0.9, 2.6, 6), hide, { y: 4.3, rx: 0.25, sz: 0.65 }))
      fine(plain, part(box(2.2, 0.3, 1.5), dark, { y: 3.6, z: 0.15, ao: 0 }))
      for (let i = 0; i < 3; i++) fine(plain, part(box(1.6 - i * 0.2, 0.12, 0.12), 0x8a2a1a, { y: 4.2 + i * 0.5, z: 0.9 + i * 0.1, rx: 0.25, ao: 0 }))
      plain.push(part(box(1.8, 1.2, 1.2), dark, { y: 2.6 }))
      plain.push(part(head(0.85), hide, { y: 6.2, z: 0.4, ao: 0 }))
      plain.push(part(box(0.9, 0.4, 0.6), dark, { y: 5.7, z: 0.95, ao: 0 }))
      for (const s of [-1, 1]) {
        plain.push(part(box(0.26, 0.18, 0.12), 0xffc02a, { x: s * 0.3, y: 6.35, z: 1.2, ao: 0 }))
        fine(plain, part(cone(0.1, 0.4, 3), BONE, { x: s * 0.3, y: 5.55, z: 1.25, rx: Math.PI, ao: 0 }))
      }
      fine(plain, part(rod(0.12, 0.25, 3.2), hide, { y: 2.2, z: -1.5, rx: 1.0 }))
      fine(plain, part(cone(0.35, 0.8, 4), dark, { y: 1.0, z: -2.8, rx: 1.6, ao: 0 }))
      scale = 1.35
      break
    }
    case 'giant': {
      // A giant of the waste: grey hide hung with chained armour plates, trophy skulls and a shield
      // at the belt, tusks, a mane of matted hair, eyes burning amber, and an iron-bound tree-trunk club.
      const hide = 0x6f7a80
      const dark = 0x3a3f44
      for (const s of [-1, 1]) {
        plain.push(part(limb(0.7, 0.55, 3.4, 6), hide, { x: s * 0.85, y: 1.8 }))
        fine(plain, part(box(1.3, 0.6, 1.7), dark, { x: s * 0.85, y: 0.3, z: 0.25, ao: 0 }))
        plain.push(part(limb(0.6, 0.48, 3.6, 6), hide, { x: s * 2.0, y: 4.9, z: 0.3, rz: s * 0.2, rx: -0.2 }))
        fine(plain, part(box(1.2, 1.0, 1.2), dark, { x: s * 2.25, y: 3.0, z: 0.7, ao: 0 }))
        plain.push(part(cone(0.18, 1.0, 4), 0xe8e0c8, { x: s * 0.35, y: 7.6, z: 1.2, rx: -0.6, ao: 0 }))
        plain.push(part(box(1.6, 0.3, 1.6), 0x55595e, { x: s * 1.75, y: 7.0, rz: s * 0.35, ao: 0 }))
      }
      plain.push(part(limb(1.8, 1.4, 3.8, 7), hide, { y: 5.2, rx: 0.2, sz: 0.65 }))
      fine(plain, part(box(2.2, 2.0, 0.25), 0x55595e, { y: 5.6, z: 1.15, rx: 0.2, ao: 0 }))
      plain.push(part(box(3.0, 1.6, 2.1), 0x4a3a2a, { y: 3.2 }))
      for (let i = 0; i < 5; i++) fine(plain, part(box(0.25, 0.25, 2.4), 0x55595e, { x: -1.4 + i * 0.7, y: 6.4 - i * 0.35, z: 0.1, ry: 0.4, ao: 0 }))
      if (!lo) for (let i = 0; i < 3; i++) plain.push(part(sphere(0.32, 0), BONE, { x: -1.0 + i * 1.0, y: 2.5, z: 1.15, ao: 0 }))
      fine(plain, part(cyl(0.8, 0.8, 0.15, 7), 0x7a2a2a, { x: 1.55, y: 2.9, z: 0.5, rz: Math.PI / 2 + 0.3, ao: 0 }))
      plain.push(part(head(1.1), hide, { y: 7.9, z: 0.6, ao: 0 }))
      fine(plain, part(box(2.2, 1.6, 1.6), 0x2a2420, { y: 8.3, z: 0.1, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.3, 0.24, 0.14), 0xffa83a, { x: s * 0.42, y: 8.0, z: 1.62, ao: 0 }))
      // The club, raised over the right shoulder, bound with iron.
      const cx = 2.3
      const cy = 8.4
      const cz = -0.4
      plain.push(part(limb(0.45, 0.85, 6.5, 6), 0x4a3524, { x: cx, y: cy, z: cz, rz: -0.5, rx: 0.3 }))
      if (!lo) {
        const ax = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(0.3, 0, -0.5))
        for (const t of [-1.6, 0.4, 2.2]) plain.push(part(cyl(0.62 + t * 0.06, 0.62 + t * 0.06, 0.28, 6), IRON, { x: cx + ax.x * t, y: cy + ax.y * t, z: cz + ax.z * t, rz: -0.5, rx: 0.3, ao: 0 }))
      }
      for (let i = 0; i < 6; i++) fine(plain, part(cone(0.18, 0.6, 4), 0x55595e, { x: 3.0 + (i % 2) * 0.4, y: 10.2 + i * 0.4, z: -0.6, rz: -1.5 + (i % 3), ao: 0 }))
      tinted.push(part(limb(1.6, 1.75, 1.3, 7), WHITE, { y: 2.5, sz: 0.72 }))
      scale = 3.2
      break
    }
  }
  lo = false
  return { tinted: bmerge(tinted), plain: bmerge(plain), scale }
}

// ---- Commanders ---------------------------------------------------------------------------------

/** What `leaderGeometry` needs to know of a commander. */
export interface LeaderLook {
  key: string
  portrait?: PortraitSpec
  /** Their banner colour (barding and shield when the portrait gives none). */
  color: number
  who: 'commander' | 'king' | 'queen'
}

const hex = (c: string | undefined, fallback: number) => (c ? new THREE.Color(c).getHex() : fallback)

/** Signature mounts and harness of the named commanders. */
interface Sign {
  coat: number
  mane?: number
  horse: HorseOpts
  plate: number
  cloak: number
}

/**
 * A mounted commander at the head of the army, built from the portrait (skin, hair and its style,
 * beard, a crown, circlet, hood, headband or chaperon, the colours of the coat, trim and fur) and
 * given the signature wargear and mount of the named commanders. Anyone else gets a captain's
 * harness in the portrait's colours and a sword.
 */
export function leaderGeometry(look: LeaderLook): THREE.BufferGeometry {
  lo = false
  const p = look.portrait ?? {}
  const g: G = []
  const barding: G = []
  const key = look.key
  const king = look.who === 'king'
  const queen = look.who === 'queen'
  const skin = hex(p.skin, SKIN)
  const hair = hex(p.hair, 0x4a3424)
  const beard = hex(p.beard_color ?? p.hair, hair)
  const cloth = hex(p.cloth ?? p.armor, look.color)
  const trim = hex(p.trim, GOLD)
  const fur = hex(p.fur, 0x4a3a2a)
  const female = !!p.female
  const SIGNS: Record<string, Sign> = {
    sovereign: { coat: 0x9a948a, mane: 0xe8e2d6, horse: { chanfron: DARK_STEEL, caparison: { trim: GOLD, scallop: true, split: true }, build: 'heavy' }, plate: DARK_STEEL, cloak: 0x7a1f2b },
    usurper: { coat: 0x1a1414, mane: 0x0a0808, horse: { chanfron: 0xd8cdb0, caparison: { trim: BRONZE, spikes: 0xd8cdb0 }, build: 'heavy' }, plate: 0x3a0c14, cloak: 0x5a0f1a },
    godfrey: { coat: 0x4a3a30, horse: { chanfron: STEEL, caparison: { trim, split: true }, build: 'heavy' }, plate: STEEL, cloak: cloth },
    elowen: { coat: 0xd8c8a8, mane: 0xf0e8d8, horse: { cloth: trim, build: 'lean' }, plate: 0x2f5a44, cloak: 0x1f6a46 },
    varian: { coat: 0x5a4030, horse: { chanfron: STEEL, caparison: { trim: 0xb7c4d6, scallop: true }, build: 'heavy' }, plate: STEEL, cloak: 0x3d4f6e },
    isolde: { coat: 0x8a5a3a, horse: { cloth: GOLD, blaze: true }, plate: 0x3a2a2a, cloak: 0xb0362a },
    bran: { coat: 0x6a4a2a, horse: { chanfron: STEEL, caparison: { trim: 0xc8902a, scallop: true }, build: 'heavy' }, plate: STEEL_D, cloak: 0xb03a2e },
    emperor: { coat: 0xe8e2d4, mane: 0xd8b060, horse: { chanfron: 0xb8862a, caparison: { trim: GOLD, scallop: true, split: true }, build: 'heavy' }, plate: 0xb8862a, cloak: 0xe8dcc0 },
    ashe: { coat: 0x1e1c1e, mane: 0x0a0a0a, horse: { cloth: 0x3a3a3a, build: 'lean' }, plate: 0x2a2e2c, cloak: 0x1e2422 },
    abbess: { coat: 0x4a4440, mane: 0x2a2420, horse: { saddle: 0x3a3a3a }, plate: 0x55555e, cloak: 0x55555e },
    warden: { coat: 0xa07c50, mane: 0x3a2618, horse: { cloth: 0xa8b878, build: 'lean', packs: true }, plate: 0x41512f, cloak: 0x2e4a2a },
    huntmaster: { coat: 0x2a201a, mane: 0x101010, horse: { cloth: 0x8a5a2e, build: 'lean', packs: true }, plate: 0x3a2418, cloak: fur },
    sapmaster: { coat: 0x6a5a48, mane: 0x2a201a, horse: { saddle: 0x4a3a2a, packs: true }, plate: 0x5a3a1e, cloak: 0x3a2a1a },
    rootcutter: { coat: 0x3a3430, mane: 0x1a1612, horse: { saddle: 0x3a2a22, packs: true }, plate: 0x3a2a22, cloak: 0x2a201a },
  }
  const s: Sign = SIGNS[key] ?? { coat: 0x5a3e2a, horse: { cloth: trim, blaze: true }, plate: cloth, cloak: cloth }
  horse(g, s.coat, { mane: s.mane ?? 0x1a120c, saddle: LEATHER, ...s.horse }, barding)
  if (king) fine(g, part(box(2.0, 1.5, 0.3), GOLD, { y: 4.4, z: 3.25, rx: -0.2, ao: 0 }))
  // The rider: plate, or cloth for the spymasters.
  const robed = key === 'abbess' || key === 'ashe' || key === 'rootcutter'
  const light = robed || ['elowen', 'isolde', 'warden', 'huntmaster', 'sapmaster'].includes(key)
  rider(g, s.plate, robed ? s.plate : new THREE.Color(s.plate).multiplyScalar(0.8).getHex(), { boot: light ? BOOT : STEEL_D, skirt: robed ? s.plate : undefined })
  g.push(part(limb(0.98, 0.98, 0.24, 6), trim, { y: 7.05, sz: 0.65, ry: Math.PI / 6, ao: 0 }))
  // A surcoat or tabard over it.
  if (king || queen || key === 'isolde' || key === 'varian') g.push(part(limb(0.96, 0.86, 1.6, 6), king ? 0x7a1f2b : queen ? 0x2a0c12 : key === 'isolde' ? 0xb0362a : 0x3d4f6e, { y: 7.85, sz: 0.68, ry: Math.PI / 6 }))
  shoulders(g, s.plate, light ? 0.5 : 0.66, 8.75)
  if (!light) for (const sd of [-1, 1]) g.push(part(box(0.72, 0.1, 0.7), trim, { x: sd * 1.12, y: 9.05, ao: 0 }))
  // The cloak, with a fur collar for those who wear fur.
  g.push(part(box(2.6, 4.2, 0.3), s.cloak, { y: 7.3, z: -1.05, rx: 0.3 }))
  g.push(part(box(2.3, 2.0, 0.22), s.cloak, { y: 5.6, z: -2.0, rx: 0.75 }))
  if (p.clothing === 'fur' || key === 'godfrey') g.push(part(limb(1.15, 1.25, 0.55, 7), fur, { y: 9.05, sz: 0.8, ao: 0 }))
  // Arms: the right raises the signature weapon; the left holds the reins, a shield or a bow.
  const y = 8.75
  const bowman = key === 'isolde' || key === 'warden'
  const raised = ['sovereign', 'usurper', 'godfrey', 'elowen', 'ashe'].includes(key)
  const hand = light ? skin : s.plate
  const right = arm(g, 1, s.plate, key === 'bran' || key === 'varian' ? 0.6 : bowman ? 0.6 : 0.4, { y, lift: raised ? 1.1 : bowman ? 0.2 : 0.4, out: bowman ? -0.2 : 0, hand })
  const left = arm(g, -1, s.plate, bowman ? 0.85 : 0.45, { y, lift: bowman ? 0.2 : 0, hand })
  // Head: face, hair, beard and headgear.
  const hy = 9.85
  const hooded = p.headgear === 'hood'
  face(g, hy, { skin, hair: hooded ? undefined : hair, beard, style: p.hair_style, beardStyle: p.beard, female })
  if (p.headgear === 'crown') crown(g, hy + 0.65, 0.82)
  else if (p.headgear === 'circlet') g.push(part(cyl(0.8, 0.8, 0.16, 10), GOLD, { y: hy + 0.35, ao: 0 }))
  else if (p.headgear === 'headband') g.push(part(cyl(0.79, 0.79, 0.22, 10), hex(p.hat, trim), { y: hy + 0.3, ao: 0 }))
  else if (p.headgear === 'chaperon') g.push(part(limb(0.75, 0.9, 0.6, 8), hex(p.hat, cloth), { y: hy + 0.55, ao: 0 }))
  else if (hooded) {
    hood(g, key === 'abbess' ? 0x6a6a72 : s.cloak, hy, 1.05)
    if (female) g.push(part(box(1.2, 1.4, 0.35), key === 'abbess' ? 0xe8e4dc : hair, { y: hy - 0.85, z: 0.5, ao: 0 }))
  }
  if (p.eyepatch) g.push(part(box(0.32, 0.3, 0.1), 0x101010, { x: 0.28, y: hy + 0.1, z: 0.72, ao: 0 }))
  // A shield face in the commander's colour, when they carry one.
  const shield = () => heaterShield(g, barding, -1.65, 8.0, 0.45, 0.95)

  switch (key) {
    case 'sovereign':
      // A great sword raised high.
      sword(g, right, { up: 0.25, len: 4.2 })
      shield()
      break
    case 'emperor':
      // A golden sun-staff raised high, a sun-disc behind the crown.
      span(g, right, [right[0], right[1] + 4.2, right[2] + 0.8], 0.13, GOLD)
      g.push(part(cyl(0.7, 0.7, 0.14, 12), GOLD, { x: right[0], y: right[1] + 4.6, z: right[2] + 0.9, rx: Math.PI / 2, ao: 0 }))
      for (let i = 0; i < 8; i++) g.push(part(cone(0.1, 0.55, 3), 0xffd060, { x: right[0] + Math.cos((i / 8) * Math.PI * 2) * 0.9, y: right[1] + 4.6 + Math.sin((i / 8) * Math.PI * 2) * 0.9, z: right[2] + 0.9, rz: (i / 8) * Math.PI * 2 - Math.PI / 2, ao: 0 }))
      g.push(part(cyl(1.1, 1.1, 0.12, 14), GOLD, { y: hy + 0.4, z: -0.75, rx: Math.PI / 2, ao: 0 }))
      shield()
      break
    case 'usurper':
      // A sceptre of black iron and gold, its head set with red thorns.
      span(g, right, [right[0], right[1] + 3.8, right[2] + 0.9], 0.12, 0x1a1414)
      g.push(part(sphere(0.38, 0), GOLD, { x: right[0], y: right[1] + 4.0, z: right[2] + 0.95, ao: 0 }))
      for (let i = 0; i < 4; i++) g.push(part(cone(0.1, 0.6, 3), 0xb3202c, { x: right[0] + Math.cos(i * 1.57) * 0.3, y: right[1] + 4.45, z: right[2] + 0.95 + Math.sin(i * 1.57) * 0.3, ao: 0 }))
      break
    case 'godfrey':
      // A great siege maul raised, a tower shield on the arm, a great helm.
      span(g, [right[0], right[1] - 1, right[2] - 0.3], [right[0], right[1] + 3.2, right[2] + 0.6], 0.13, WOOD)
      g.push(part(box(0.8, 0.8, 1.6), IRON, { x: right[0], y: right[1] + 3.35, z: right[2] + 0.62, rx: 0.2, ao: 0 }))
      barding.push(part(box(0.24, 3.2, 1.6), WHITE, { x: -1.7, y: 8.2, z: 0.4, ao: 0.1 }))
      g.push(part(box(0.18, 3.35, 1.75), trim, { x: -1.62, y: 8.2, z: 0.4, ao: 0 }))
      greatHelm(g, hy + 0.15, STEEL)
      break
    case 'elowen':
      // A curved cavalry sabre raised, a bow and quiver slung behind.
      g.push(part(cone(0.2, 3.0, 4), STEEL_L, { x: right[0], y: right[1] + 1.7, z: right[2] + 0.5, rx: 0.3, sx: 0.4, ao: 0 }))
      g.push(part(box(0.7, 0.12, 0.16), GOLD, { x: right[0], y: right[1] + 0.2, z: right[2], ao: 0 }))
      g.push(part(new THREE.TorusGeometry(2.0, 0.12, 4, 12, Math.PI), WOOD, { y: 8.3, z: -0.8, rz: 0.8, ao: 0 }))
      quiver(g, 0.6, 8.2, -0.9, -0.3)
      break
    case 'varian':
      // A long steel pike levelled, a large heater shield in blue and silver, a bascinet.
      spear(g, g, right, { len: 14, level: 1.2 })
      barding.push(part(box(0.22, 2.6, 2.1), WHITE, { x: -1.7, y: 8.2, z: 0.45, ao: 0.1 }))
      g.push(part(box(0.16, 2.8, 2.3), 0xb7c4d6, { x: -1.62, y: 8.2, z: 0.45, ao: 0 }))
      g.push(part(box(0.26, 0.4, 1.7), 0xb7c4d6, { x: -1.84, y: 8.6, z: 0.45, ao: 0 }))
      bascinet(g, hy, STEEL)
      break
    case 'isolde':
      // A gilded war-bow drawn, a quiver of red-fletched arrows, a flame crest in her hair.
      longbow(g, left, [right[0] - 0.4, right[1], right[2] - 0.5], { wood: GOLD, r: 2.6 })
      quiver(g, 1.4, 6.6, -0.6, -0.35, 0xb0362a)
      g.push(part(cone(0.3, 1.0, 5), 0xff8a2a, { y: hy + 1.25, z: -0.3, ao: 0 }))
      g.push(part(cone(0.18, 0.6, 5), 0xffd060, { y: hy + 1.4, z: -0.1, ao: 0 }))
      break
    case 'bran':
      // A massive couched lance, a skull crest with an amber plume.
      lance(g, barding, { len: 14, color: 0xc8902a, tip: STEEL_L })
      g.push(part(lump(0.4), BONE, { y: hy + 1.2, z: 0.1, ao: 0 }))
      plume(g, 0xd89a2a, hy + 1.2)
      shield()
      break
    case 'ashe':
      // Twin daggers, one raised and one low; knife belts across the chest.
      g.push(part(cone(0.16, 1.5, 4), STEEL_L, { x: right[0], y: right[1] + 0.9, z: right[2] + 0.25, rx: 0.25, sx: 0.4, ao: 0 }))
      g.push(part(cone(0.16, 1.3, 4), STEEL_L, { x: left[0], y: left[1] + 0.1, z: left[2] + 0.75, rx: Math.PI / 2 - 0.2, sx: 0.4, ao: 0 }))
      for (const sd of [-1, 1]) g.push(part(box(0.14, 2.4, 0.14), LEATHER, { x: sd * 0.1, y: 7.9, z: 0.62, rz: sd * 0.6, ao: 0 }))
      break
    case 'abbess':
      // The Grey Abbess: a pilgrim's staff topped with a lantern.
      span(g, [right[0], right[1] - 3, right[2]], [right[0], right[1] + 3.5, right[2] + 0.4], 0.11, WOOD)
      g.push(part(box(0.5, 0.65, 0.5), 0xe8c060, { x: right[0], y: right[1] + 3.8, z: right[2] + 0.45, ao: 0 }))
      g.push(part(cone(0.35, 0.4, 4), IRON, { x: right[0], y: right[1] + 4.3, z: right[2] + 0.45, ao: 0 }))
      break
    case 'warden':
      // A recurve bow at the ready, a feathered quiver.
      longbow(g, left, [right[0] - 0.4, right[1], right[2] - 0.5], { r: 2.2, wood: 0x9a6a36 })
      quiver(g, 1.4, 6.6, -0.6, -0.35, 0xc8a060)
      break
    case 'sapmaster':
    case 'rootcutter':
      // A miner's mattock on the shoulder and a dark-lantern held up to light the way.
      span(g, [right[0], right[1] - 0.6, right[2]], [right[0] - 0.2, right[1] + 2.8, right[2] - 1.0], 0.12, WOOD)
      g.push(part(box(0.26, 0.3, 2.0), IRON, { x: right[0] - 0.2, y: right[1] + 2.85, z: right[2] - 1.0, rx: 0.4, ao: 0 }))
      g.push(part(box(0.6, 0.75, 0.6), IRON, { x: left[0], y: left[1] - 0.2, z: left[2] + 0.5, ao: 0 }))
      g.push(part(box(0.62, 0.2, 0.62), key === 'sapmaster' ? 0xffb050 : 0xc8d870, { x: left[0], y: left[1] - 0.15, z: left[2] + 0.5, ao: 0 }))
      break
    case 'huntmaster':
      // A boar spear and a hunting horn.
      spear(g, g, right, { len: 10, level: 0.5 })
      g.push(part(cone(0.3, 1.4, 6), LINEN, { x: -1.3, y: 7.6, z: -0.2, rz: 1.2, ao: 0 }))
      break
    default:
      // A drawn sword raised to lead the advance, a shield of their colours.
      sword(g, right, { up: 0.5, len: 3.2 })
      shield()
  }
  // Barding and shield faces: white parts painted in the commander's colour (the realm's for the crowned heads).
  const col = new THREE.Color(king ? 0x7a1f2b : queen ? 0x5a0f1a : look.color)
  for (const b of barding) {
    const c = b.attributes.color as THREE.BufferAttribute
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * col.r, c.getY(i) * col.g, c.getZ(i) * col.b)
    g.push(b)
  }
  return bmerge(g)
}

/** How many soldiers one figure represents, per kind. */
export const SOLDIERS_PER_FIGURE: Record<FigureKind, number> = {
  spearmen: 5,
  spearmen_lv: 5,
  men_at_arms: 5,
  archers: 5,
  light_cavalry: 5,
  knights: 4,
  royal_guard: 4,
  thorn_guard: 4,
  solar_guard: 4,
  assassin: 5,
  saboteur: 5,
  outrider: 5,
  siege: 4,
  engineer: 5,
  pilgrim: 5,
  mule: 5,
  cart: 4,
  thrall: 3,
  bone: 3,
  wraith: 4,
  fiend: 4,
  giant: 60,
}

/**
 * Visual figures for a unit: a mix of looks so a block of the same unit type
 * still reads as a varied host (spears and shields, light horse and knights,
 * engineers with a ram for every few men).
 */
export function figuresFor(unitKey: string, category: string, figures: number): [FigureKind, number][] {
  if (figures <= 0) return []
  // The fixed bands' own troops wear their own harness.
  if (unitKey === 'assassins') return [['assassin', figures]]
  if (unitKey === 'saboteurs') return [['saboteur', figures]]
  if (unitKey === 'outriders') return [['outrider', figures]]
  if (unitKey === 'guard') return [['royal_guard', figures]]
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

/**
 * A draught horse (or mule) for the wagons, facing +Z: the sculpted horse of the figures with a
 * padded collar and hames, a bridle, and the traces running back from the collar.
 */
export function draughtHorseGeometry(coat: number, opts: { mane?: number; blaze?: boolean; mule?: boolean } = {}): THREE.BufferGeometry {
  lo = false
  const g: G = []
  horse(g, coat, { mane: opts.mane ?? 0x2a1d14, blaze: opts.blaze, saddle: LEATHER, build: opts.mule ? 'lean' : 'heavy' })
  // The collar round the base of the neck, the hames on it, a breeching strap behind.
  g.push(part(new THREE.TorusGeometry(1.05, 0.32, 5, 10), 0x4a3020, { y: 5.35, z: 2.55, rx: 0.95 }))
  for (const s of [-1, 1]) {
    g.push(part(box(0.18, 1.8, 0.2), 0xb8a070, { x: s * 0.95, y: 5.6, z: 2.55, rx: 0.5, ao: 0 }))
    span(g, [s * 1.05, 4.9, 2.3], [s * 1.25, 4.6, -3.2], 0.08, LEATHER)
  }
  g.push(part(box(2.4, 0.24, 0.3), LEATHER, { y: 4.1, z: -2.6, ao: 0 }))
  if (opts.mule) for (const s of [-1, 1]) g.push(part(cone(0.22, 1.2, 4), coat, { x: s * 0.32, y: 8.35, z: 3.35, rz: -s * 0.35, ao: 0 }))
  return bmerge(g)
}
