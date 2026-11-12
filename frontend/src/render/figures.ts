import * as THREE from 'three'
import { bmerge, bpart as part, box, cone, cyl, sphere } from './geo'

/**
 * Each figure kind is split into a "tinted" geometry (tabards, shields,
 * caparisons, plumes, pennons: coloured per faction via instance colour) and a
 * "plain" geometry (skin, steel, leather, wood, horses) with baked vertex
 * colours. Models face +Z. Figures are drawn by the thousand, so every part
 * earns its place: a readable silhouette first (helmet, shield, weapon, horse),
 * then the few details that catch the light.
 */
export type FigureKind = 'spearmen' | 'men_at_arms' | 'archers' | 'light_cavalry' | 'knights' | 'siege' | 'engineer' | 'royal_guard' | 'thorn_guard' | 'pilgrim' | 'mule' | 'cart' | 'thrall' | 'bone' | 'wraith' | 'fiend' | 'giant'

const SKIN = 0xd9a77e
const STEEL = 0xaab3bd
const STEEL_D = 0x6c747e
const GOLD = 0xd9b04a
const WOOD = 0x6e4d2c
const LEATHER = 0x5a3d26
const LEATHER_L = 0x7a5536
const CLOTH = 0x5a5246
const HOSE = 0x4a4038
const BOOT = 0x2e241b
const WHITE = 0xffffff

type G = THREE.BufferGeometry[]

/** Building the far (low-detail) version: the small touches are left out. */
let lo = false
/** Add a detail part only to the near (high-detail) model. */
const fine = (g: G, geo: THREE.BufferGeometry) => {
  if (!lo) g.push(geo)
}
/** A head: a faceted ball near the camera, a block farther off. */
const head = (r: number) => (lo ? box(r * 1.45, r * 1.6, r * 1.45) : sphere(r, 0))
/** A shaft (spear, lance, haft): round near the camera, square farther off. */
const rod = (r1: number, r2: number, h: number) => (lo ? box(r2 * 1.8, h, r2 * 1.8) : cyl(r1, r2, h, 5))

/** Legs, boots, a belt and two arms: the common frame of a man on foot. */
function legsAndArms(g: G, hose = HOSE, sleeve = CLOTH) {
  if (lo) g.push(part(box(1.5, 2.7, 0.66), hose, { y: 1.55 }))
  for (const s of [-1, 1]) {
    if (!lo) g.push(part(box(0.62, 2.7, 0.66), hose, { x: s * 0.42, y: 1.55 }))
    fine(g, part(box(0.7, 0.55, 0.95), BOOT, { x: s * 0.42, y: 0.28, z: 0.12, ao: 0.05 }))
    g.push(part(box(0.5, 2.2, 0.56), sleeve, { x: s * 1.18, y: 4.15, rz: s * 0.08 }))
    fine(g, part(box(0.46, 0.46, 0.46), SKIN, { x: s * 1.24, y: 2.95, ao: 0 }))
  }
  fine(g, part(box(1.9, 0.28, 1.22), LEATHER, { y: 3.05, ao: 0 }))
}

/** A round shield on the left arm: tinted face (returned), a steel boss and a dark rim (plain). */
function roundShield(plain: G, tinted: G, r = 1.35, x = -1.55, y = 4.1, z = 0.55) {
  tinted.push(part(cyl(r, r, 0.18, lo ? 6 : 10), WHITE, { x, y, z, rz: Math.PI / 2, ao: 0.1 }))
  fine(plain, part(cyl(r + 0.12, r + 0.12, 0.14, 10), 0x3b2a18, { x: x - 0.06, y, z, rz: Math.PI / 2, ao: 0 }))
  fine(plain, part(box(0.3, 0.5, 0.5), STEEL, { x: x - 0.14, y, z, ao: 0 }))
}

/** A heater shield: tinted face with a pale band across it, a dark edge behind. */
function heaterShield(plain: G, tinted: G, x = -1.55, y = 4.2, z = 0.45, s = 1) {
  tinted.push(part(box(0.2, 2.1 * s, 1.75 * s), WHITE, { x, y: y + 0.2 * s, z, ao: 0.1 }))
  tinted.push(part(box(0.2, 1.1 * s, 1.1 * s), WHITE, { x, y: y - 1.0 * s, z, rx: Math.PI / 4, sy: 0.9, ao: 0.1 }))
  fine(plain, part(box(0.16, 2.3 * s, 1.95 * s), 0x2e2a26, { x: x + 0.06, y: y + 0.2 * s, z, ao: 0 }))
  fine(plain, part(box(0.24, 0.3 * s, 1.5 * s), 0xe8dcc0, { x: x - 0.04, y: y + 0.55 * s, z, ao: 0 }))
}

/** A horse: deep chest, arched neck, head with ears and a blaze, mane, tail, legs with hooves. */
function horse(g: G, coat: number, opts: { mane?: number; blaze?: boolean; chanfron?: number; saddle?: number } = {}) {
  const mane = opts.mane ?? 0x2a1d14
  const dark = new THREE.Color(coat).multiplyScalar(0.72).getHex()
  g.push(part(box(2.2, 2.3, 5.0), coat, { y: 4.2 }))
  fine(g, part(box(2.35, 2.5, 1.6), coat, { y: 4.35, z: 2.1 }))
  fine(g, part(box(2.25, 2.35, 1.5), coat, { y: 4.4, z: -2.0 }))
  g.push(part(box(1.25, 2.7, 1.5), coat, { y: 5.9, z: 2.9, rx: -0.55 }))
  g.push(part(box(1.0, 1.05, 2.3), coat, { y: 7.05, z: 3.95, rx: 0.4 }))
  fine(g, part(box(0.85, 0.8, 0.8), dark, { y: 6.7, z: 4.95, rx: 0.4, ao: 0 }))
  for (const s of [-1, 1]) fine(g, part(cone(0.16, 0.6, 4), coat, { x: s * 0.32, y: 7.85, z: 3.25, ao: 0 }))
  fine(g, part(box(0.32, 2.4, 1.1), mane, { y: 6.6, z: 2.6, rx: -0.55, ao: 0.05 }))
  g.push(part(box(0.45, 2.0, 0.5), mane, { y: 3.9, z: -3.0, rx: 0.45 }))
  if (opts.blaze) fine(g, part(box(0.3, 0.9, 0.12), 0xf0e6d6, { y: 7.1, z: 5.08, rx: 0.4, ao: 0 }))
  if (opts.chanfron) g.push(part(box(0.75, 0.9, 1.8), opts.chanfron, { y: 7.45, z: 3.95, rx: 0.4, ao: 0 }))
  for (const [x, z] of [[-0.72, 1.95], [0.72, 1.95], [-0.72, -1.95], [0.72, -1.95]]) {
    g.push(part(box(0.55, 3.0, 0.62), coat, { x, y: 1.75, z }))
    fine(g, part(box(0.6, 0.45, 0.68), 0x1c1612, { x, y: 0.22, z, ao: 0 }))
  }
  if (opts.saddle) g.push(part(box(2.3, 0.4, 1.9), opts.saddle, { y: 5.55, z: -0.2 }))
}

/** A mounted man: thighs along the saddle, torso, arms, head. */
function rider(g: G, body: number, hose: number, y0 = 5.6) {
  for (const s of [-1, 1]) {
    g.push(part(box(0.6, 0.6, 1.8), hose, { x: s * 1.0, y: y0 + 0.3, z: 0.3 }))
    fine(g, part(box(0.55, 2.0, 0.6), hose, { x: s * 1.25, y: y0 - 0.7, z: 0.9 }))
    fine(g, part(box(0.62, 0.45, 0.95), BOOT, { x: s * 1.25, y: y0 - 1.7, z: 1.1, ao: 0 }))
    g.push(part(box(0.5, 2.0, 0.55), body, { x: s * 1.2, y: y0 + 2.2, z: 0.3, rx: -0.35 }))
  }
  g.push(part(box(1.8, 2.4, 1.15), body, { y: y0 + 2.0 }))
}

export function figureGeometries(kind: FigureKind, detail: 'near' | 'far' = 'near'): { tinted: THREE.BufferGeometry; plain: THREE.BufferGeometry; scale: number } {
  lo = detail === 'far'
  const plain: G = []
  const tinted: G = []
  let scale = 1
  switch (kind) {
    case 'spearmen': {
      // A spearman in a quilted jack and kettle hat, round shield and long spear.
      legsAndArms(plain)
      plain.push(part(box(1.8, 2.4, 1.1), 0x8a7a5a, { y: 4.2 }))
      tinted.push(part(box(1.5, 2.5, 0.16), WHITE, { y: 3.9, z: 0.6 }))
      fine(tinted, part(box(1.5, 2.5, 0.16), WHITE, { y: 3.9, z: -0.6 }))
      plain.push(part(head(0.72), SKIN, { y: 6.15, ao: 0 }))
      fine(plain, part(cyl(1.05, 1.05, 0.12, 8), STEEL_D, { y: 6.55, ao: 0 }))
      plain.push(part(cone(0.68, 0.75, 8), STEEL, { y: 6.95, ao: 0 }))
      roundShield(plain, tinted)
      plain.push(part(rod(0.09, 0.11, 11.5), WOOD, { x: 1.25, y: 5.6, z: 0.5, rx: 0.1 }))
      plain.push(part(cone(0.24, 1.3, 4), STEEL, { x: 1.25, y: 11.9, z: 1.12, rx: 0.1, ao: 0 }))
      break
    }
    case 'men_at_arms': {
      // A man-at-arms: mail and a surcoat, a visored helm with a crest, heater shield and sword.
      legsAndArms(plain, 0x5f6670, STEEL_D)
      plain.push(part(box(1.85, 2.5, 1.15), STEEL_D, { y: 4.2 }))
      tinted.push(part(box(1.95, 2.0, 1.22), WHITE, { y: 4.35 }))
      tinted.push(part(box(1.95, 0.9, 1.22), WHITE, { y: 2.85, sx: 1.05 }))
      for (const s of [-1, 1]) fine(plain, part(sphere(0.55, 0), STEEL, { x: s * 1.15, y: 5.3, sy: 0.7, ao: 0 }))
      plain.push(part(box(1.15, 1.3, 1.15), STEEL, { y: 6.35 }))
      plain.push(part(box(0.9, 0.16, 0.08), 0x141414, { y: 6.4, z: 0.6, ao: 0 }))
      tinted.push(part(box(0.18, 0.7, 1.0), WHITE, { y: 7.25, ao: 0 }))
      heaterShield(plain, tinted)
      plain.push(part(box(0.12, 2.8, 0.32), 0xd4dbe2, { x: 1.35, y: 3.5, z: 0.8, rx: 0.5, ao: 0 }))
      fine(plain, part(box(0.9, 0.16, 0.2), GOLD, { x: 1.35, y: 2.3, z: 0.15, rx: 0.5, ao: 0 }))
      scale = 1.05
      break
    }
    case 'archers': {
      // A longbowman: leather jerkin, a hood, the bow drawn half up, a full quiver.
      legsAndArms(plain, 0x4f5a3a, LEATHER_L)
      plain.push(part(box(1.75, 2.4, 1.05), LEATHER_L, { y: 4.2 }))
      tinted.push(part(box(1.82, 1.4, 1.1), WHITE, { y: 4.55 }))
      plain.push(part(head(0.7), SKIN, { y: 6.1, ao: 0 }))
      plain.push(part(cone(0.95, 1.6, 6), 0x4a5a33, { y: 6.75, ao: 0.1 }))
      plain.push(part(box(1.9, 0.5, 1.2), 0x4a5a33, { y: 5.45, ao: 0 }))
      plain.push(part(new THREE.TorusGeometry(2.6, 0.12, 4, 12, Math.PI), WOOD, { x: -1.35, y: 4.8, z: 0.5, rz: Math.PI / 2, ao: 0 }))
      fine(plain, part(box(0.04, 5.2, 0.04), 0xe8dcc0, { x: -1.2, y: 4.8, z: 0.5, ao: 0 }))
      plain.push(part(cyl(0.42, 0.36, 2.4, 6), LEATHER, { x: 0.55, y: 4.9, z: -0.85, rx: 0.3 }))
      for (let i = 0; i < 3; i++) fine(plain, part(box(0.18, 0.5, 0.18), 0xe8dcc0, { x: 0.35 + i * 0.2, y: 6.35, z: -1.25, rx: 0.3, ao: 0 }))
      scale = 0.95
      break
    }
    case 'engineer': {
      // A sapper: leather apron, a coif, a pick over the shoulder, a coil of rope.
      legsAndArms(plain, HOSE, CLOTH)
      plain.push(part(box(1.8, 2.4, 1.1), CLOTH, { y: 4.2 }))
      tinted.push(part(box(1.82, 1.3, 1.14), WHITE, { y: 4.7 }))
      plain.push(part(box(1.5, 2.4, 0.16), LEATHER_L, { y: 3.4, z: 0.62 }))
      plain.push(part(head(0.72), SKIN, { y: 6.1, ao: 0 }))
      plain.push(part(cyl(0.8, 0.85, 0.6, 8), STEEL_D, { y: 6.55, ao: 0 }))
      plain.push(part(rod(0.1, 0.1, 4.2), WOOD, { x: 1.2, y: 5.4, z: -0.2, rz: 0.7, ao: 0 }))
      plain.push(part(box(0.25, 0.3, 2.2), STEEL_D, { x: 2.5, y: 6.9, z: -0.2, rz: 0.7, ao: 0 }))
      fine(plain, part(new THREE.TorusGeometry(0.55, 0.16, 4, 8), 0xb8ab8a, { x: -1.0, y: 3.4, z: -0.5, ry: Math.PI / 2, ao: 0 }))
      scale = 0.95
      break
    }
    case 'light_cavalry': {
      // A hobelar: leather and a steel cap on a bay with a coloured saddle cloth, javelin and buckler.
      horse(plain, 0x7a4f30, { blaze: true, saddle: LEATHER })
      tinted.push(part(box(2.45, 1.3, 2.6), WHITE, { y: 4.85, z: -0.3 }))
      rider(plain, LEATHER_L, 0x4f5a3a)
      tinted.push(part(box(1.86, 1.3, 1.2), WHITE, { y: 7.9 }))
      plain.push(part(head(0.7), SKIN, { y: 9.25, ao: 0 }))
      plain.push(part(cone(0.75, 0.8, 7), STEEL, { y: 9.85, ao: 0 }))
      roundShield(plain, tinted, 0.95, -1.5, 7.6, 0.4)
      plain.push(part(cyl(0.09, 0.09, 8, 4), WOOD, { x: 1.3, y: 8.4, z: 2.0, rx: 1.15, ao: 0 }))
      plain.push(part(cone(0.18, 0.9, 4), STEEL, { x: 1.3, y: 10.0, z: 5.7, rx: 1.15, ao: 0 }))
      break
    }
    case 'knights': {
      // A knight: plate and a great helm with a plume, a lance with a pennon, a horse in a full caparison.
      horse(plain, 0x4a4038, { chanfron: STEEL })
      tinted.push(part(box(2.65, 2.4, 5.6), WHITE, { y: 3.85 }))
      tinted.push(part(box(1.7, 1.6, 1.3), WHITE, { y: 5.8, z: 2.85, rx: -0.55 }))
      plain.push(part(box(2.7, 0.3, 5.65), 0xe8dcc0, { y: 2.7, ao: 0 }))
      rider(plain, STEEL, STEEL_D)
      tinted.push(part(box(1.9, 1.6, 1.24), WHITE, { y: 7.55 }))
      for (const s of [-1, 1]) fine(plain, part(sphere(0.6, 0), STEEL, { x: s * 1.2, y: 8.7, sy: 0.7, ao: 0 }))
      plain.push(part(box(1.25, 1.45, 1.3), STEEL, { y: 9.9 }))
      plain.push(part(box(1.0, 0.16, 0.08), 0x141414, { y: 10.0, z: 0.66, ao: 0 }))
      tinted.push(part(cone(0.36, 1.9, 5), WHITE, { y: 11.5, z: -0.2, rx: -0.35, ao: 0 }))
      heaterShield(plain, tinted, -1.55, 7.8, 0.4, 0.9)
      plain.push(part(rod(0.14, 0.2, 12), 0xd8cfc0, { x: 1.3, y: 8.5, z: 3.2, rx: 1.25, ao: 0 }))
      tinted.push(part(box(0.06, 0.9, 1.6), WHITE, { x: 1.3, y: 13.3, z: 6.9, rx: 1.25, ao: 0 }))
      scale = 1.1
      break
    }
    case 'royal_guard': {
      // The King's household knights: burnished dark steel with gilding, on grey chargers in the realm's colours.
      horse(plain, 0x9a948a, { mane: 0xe8e2d6, chanfron: 0x4a505c })
      tinted.push(part(box(2.7, 2.45, 5.7), WHITE, { y: 3.85 }))
      tinted.push(part(box(1.75, 1.65, 1.35), WHITE, { y: 5.8, z: 2.85, rx: -0.55 }))
      plain.push(part(box(2.75, 0.35, 5.75), GOLD, { y: 2.65, ao: 0 }))
      fine(plain, part(box(2.75, 0.3, 0.3), GOLD, { y: 5.0, z: 2.9, ao: 0 }))
      rider(plain, 0x4a505c, 0x3a3f48)
      plain.push(part(box(1.95, 0.3, 1.25), GOLD, { y: 6.9, ao: 0 }))
      tinted.push(part(box(1.92, 1.5, 1.26), WHITE, { y: 7.7 }))
      for (const s of [-1, 1]) {
        plain.push(part(sphere(0.66, 0), 0x5a6170, { x: s * 1.2, y: 8.7, sy: 0.7, ao: 0 }))
        plain.push(part(box(0.7, 0.14, 0.7), GOLD, { x: s * 1.2, y: 8.95, ao: 0 }))
      }
      plain.push(part(box(1.3, 1.5, 1.35), 0x4a505c, { y: 9.95 }))
      plain.push(part(box(1.36, 0.2, 1.4), GOLD, { y: 10.75, ao: 0 }))
      plain.push(part(box(1.0, 0.16, 0.08), 0x101010, { y: 10.05, z: 0.69, ao: 0 }))
      // A tall plume and a gilt crown crest: unmistakable from afar.
      for (let i = 0; i < 4; i++) plain.push(part(cone(0.16, 0.45, 4), GOLD, { x: Math.cos((i / 4) * 6.28) * 0.45, y: 11.05, z: Math.sin((i / 4) * 6.28) * 0.45, ao: 0 }))
      tinted.push(part(cone(0.42, 2.6, 5), WHITE, { y: 12.4, z: -0.3, rx: -0.4, ao: 0 }))
      heaterShield(plain, tinted, -1.6, 7.8, 0.4, 0.95)
      plain.push(part(rod(0.15, 0.2, 12.5), 0x3a3f48, { x: 1.3, y: 8.5, z: 3.2, rx: 1.25, ao: 0 }))
      plain.push(part(cone(0.3, 1.2, 4), GOLD, { x: 1.3, y: 13.7, z: 8.9, rx: 1.25, ao: 0 }))
      tinted.push(part(box(0.06, 1.0, 1.9), WHITE, { x: 1.3, y: 13.1, z: 6.8, rx: 1.25, ao: 0 }))
      scale = 1.15
      break
    }
    case 'thorn_guard': {
      // The Usurper's Thorn Guard: crimson-lacquered plate with bronze, spiked pauldrons, on black chargers with bone chanfrons.
      horse(plain, 0x231c1a, { mane: 0x101010, chanfron: 0xd8cdb0 })
      tinted.push(part(box(2.7, 2.45, 5.7), WHITE, { y: 3.85 }))
      for (let i = 0; i < 6; i++) fine(tinted, part(cone(0.32, 0.8, 4), WHITE, { x: (i % 2 ? 1 : -1) * 1.38, y: 2.4, z: -2.4 + Math.floor(i / 2) * 2.4, rx: Math.PI, ao: 0 }))
      plain.push(part(box(2.75, 0.35, 5.75), 0x9a6a2e, { y: 2.65, ao: 0 }))
      rider(plain, 0x6a1e24, 0x3a1416)
      plain.push(part(box(1.95, 0.3, 1.25), 0x9a6a2e, { y: 6.9, ao: 0 }))
      tinted.push(part(box(1.92, 1.5, 1.26), WHITE, { y: 7.7 }))
      for (const s of [-1, 1]) {
        plain.push(part(sphere(0.66, 0), 0x6a1e24, { x: s * 1.2, y: 8.7, sy: 0.7, ao: 0 }))
        plain.push(part(cone(0.18, 1.1, 4), 0x9a6a2e, { x: s * 1.55, y: 9.2, rz: -s * 0.7, ao: 0 }))
      }
      plain.push(part(box(1.3, 1.5, 1.35), 0x6a1e24, { y: 9.95 }))
      plain.push(part(box(1.0, 0.16, 0.08), 0x101010, { y: 10.05, z: 0.69, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(cone(0.22, 1.3, 4), 0xd8cdb0, { x: s * 0.6, y: 11.1, rz: -s * 0.5, ao: 0 }))
      tinted.push(part(cone(0.4, 2.4, 5), WHITE, { y: 12.1, z: -0.4, rx: -0.5, ao: 0 }))
      heaterShield(plain, tinted, -1.6, 7.8, 0.4, 0.95)
      plain.push(part(rod(0.15, 0.2, 12.5), 0x2a1a1a, { x: 1.3, y: 8.5, z: 3.2, rx: 1.25, ao: 0 }))
      plain.push(part(cone(0.3, 1.4, 4), 0x9a6a2e, { x: 1.3, y: 13.7, z: 8.9, rx: 1.25, ao: 0 }))
      scale = 1.15
      break
    }
    // ---- The Endless Night: the risen dead, bone archers, wraith riders, fiends and giants. ----
    case 'thrall': {
      // A risen corpse: hunched and gaunt, grey-green skin over the bones, rags and a torn shroud,
      // arms reaching out, a skull of a face with pale burning eyes.
      const skin = 0x7d8a72
      const rag = 0x2a2622
      for (const s of [-1, 1]) {
        plain.push(part(box(0.5, 2.8, 0.55), skin, { x: s * 0.45, y: 1.5, rz: s * 0.06 }))
        fine(plain, part(box(0.6, 0.4, 0.9), 0x3a3a34, { x: s * 0.45, y: 0.2, z: 0.15, ao: 0 }))
        // Arms reaching forward, clawed hands.
        plain.push(part(box(0.42, 2.6, 0.42), skin, { x: s * 1.05, y: 4.2, z: 0.9, rx: -1.05, rz: s * 0.15 }))
        fine(plain, part(box(0.5, 0.35, 0.8), 0x5d6656, { x: s * 1.1, y: 3.6, z: 2.1, ao: 0 }))
      }
      // A hunched torso: ribs showing through rags.
      plain.push(part(box(1.6, 2.4, 1.0), skin, { y: 4.0, z: 0.25, rx: 0.4 }))
      for (let i = 0; i < 3; i++) fine(plain, part(box(1.5, 0.16, 0.12), 0xcfc8b0, { y: 3.5 + i * 0.5, z: 0.82 + i * 0.12, rx: 0.4, ao: 0 }))
      plain.push(part(box(1.8, 1.4, 1.2), rag, { y: 2.8 }))
      for (let i = 0; i < 4; i++) fine(plain, part(box(0.4, 1.4 + (i % 2) * 0.5, 0.1), rag, { x: -0.7 + i * 0.47, y: 1.7, z: -0.5, rx: 0.15, ao: 0 }))
      // The head thrust forward: skull, jaw hanging, eyes burning.
      plain.push(part(head(0.66), 0xcfc8b0, { y: 5.5, z: 0.9, ao: 0 }))
      plain.push(part(box(0.7, 0.35, 0.5), 0xb8b19a, { y: 4.95, z: 1.2, rx: 0.4, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.22, 0.16, 0.12), 0xb8ffe0, { x: s * 0.24, y: 5.6, z: 1.52, ao: 0 }))
      // A torn shroud over the shoulders (in the host's colour).
      tinted.push(part(box(1.9, 0.5, 1.3), WHITE, { y: 5.1, z: 0.1, rx: 0.4 }))
      fine(tinted, part(box(1.7, 2.2, 0.12), WHITE, { y: 3.9, z: -0.55, rx: 0.25 }))
      scale = 0.98
      break
    }
    case 'bone': {
      // A skeleton archer: bare bones, a ragged hood, a black bow and red points of light for eyes.
      const B = 0xe2dccb
      for (const s of [-1, 1]) {
        plain.push(part(rod(0.16, 0.18, 2.8), B, { x: s * 0.42, y: 1.5 }))
        fine(plain, part(box(0.5, 0.25, 0.8), B, { x: s * 0.42, y: 0.15, z: 0.15, ao: 0 }))
        plain.push(part(rod(0.14, 0.16, 2.3), B, { x: s * 1.0, y: 4.1, rz: s * 0.12 }))
      }
      plain.push(part(box(1.2, 0.5, 0.7), B, { y: 3.0 }))
      plain.push(part(rod(0.14, 0.14, 2.2), B, { y: 4.0 }))
      for (let i = 0; i < 4; i++) plain.push(part(box(1.5 - i * 0.12, 0.14, 0.9), B, { y: 3.7 + i * 0.42, ao: 0 }))
      plain.push(part(head(0.62), B, { y: 5.75, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.22, 0.2, 0.1), 0xff4a2a, { x: s * 0.22, y: 5.8, z: 0.58, ao: 0 }))
      plain.push(part(new THREE.TorusGeometry(2.6, 0.12, 4, 12, Math.PI), 0x1c1a1e, { x: -1.35, y: 4.6, z: 0.5, rz: Math.PI / 2, ao: 0 }))
      fine(plain, part(cyl(0.36, 0.3, 2.2, 6), 0x2a2420, { x: 0.5, y: 4.6, z: -0.7, rx: 0.3 }))
      tinted.push(part(cone(0.95, 1.5, 6), WHITE, { y: 6.35, ao: 0.1 }))
      fine(tinted, part(box(1.4, 1.8, 0.1), WHITE, { y: 4.9, z: -0.5, ao: 0 }))
      scale = 0.95
      break
    }
    case 'wraith': {
      // A wraith rider: a skeletal black horse with a mane of fire, a hooded shadow on its back with
      // pale eyes, a scythe raised.
      horse(plain, 0x1b1a1f, { mane: 0xff7a2a, saddle: 0x2a1a2e })
      for (let i = 0; i < 4; i++) fine(plain, part(box(2.3, 0.14, 0.16), 0x8a8478, { y: 3.6 + i * 0.4, z: 0.6 - i * 0.5, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.2, 0.2, 0.12), 0xff6a2a, { x: s * 0.38, y: 7.2, z: 4.95, ao: 0 }))
      fine(plain, part(cone(0.5, 1.6, 5), 0xff9a3a, { y: 7.2, z: 2.4, rx: -0.9, ao: 0 }))
      // The rider: a tall ragged hood and cloak over nothing.
      tinted.push(part(box(1.9, 3.0, 1.3), WHITE, { y: 7.4 }))
      tinted.push(part(cone(1.05, 2.4, 6), WHITE, { y: 9.9, ao: 0.1 }))
      fine(tinted, part(box(2.4, 3.6, 0.2), WHITE, { y: 6.6, z: -1.0, rx: 0.35 }))
      plain.push(part(box(0.9, 0.9, 0.3), 0x0a080c, { y: 9.3, z: 0.62, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.18, 0.14, 0.1), 0xa8fff0, { x: s * 0.22, y: 9.35, z: 0.8, ao: 0 }))
      // The scythe.
      plain.push(part(rod(0.09, 0.1, 9), 0x2a2420, { x: 1.4, y: 9, z: 0.6, rx: 0.15 }))
      plain.push(part(box(0.12, 0.5, 3.2), 0xb8c0c8, { x: 1.4, y: 13.1, z: 1.9, rx: 0.5, ao: 0 }))
      scale = 1.05
      break
    }
    case 'fiend': {
      // A fiend of the pit: broad and stooped, cracked black-red hide, ram's horns, bat wings folded
      // up behind, a barbed tail, claws, and eyes like coals.
      const hide = 0x4a1612
      const dark = 0x241010
      for (const s of [-1, 1]) {
        plain.push(part(box(0.75, 2.8, 0.8), hide, { x: s * 0.6, y: 1.5, rz: s * 0.05 }))
        fine(plain, part(cone(0.5, 0.8, 4), dark, { x: s * 0.6, y: 0.1, z: 0.4, rx: Math.PI / 2, ao: 0 }))
        plain.push(part(box(0.7, 2.8, 0.7), hide, { x: s * 1.55, y: 4.0, z: 0.4, rx: -0.4, rz: s * 0.25 }))
        for (let c = 0; c < 3; c++) fine(plain, part(cone(0.12, 0.7, 4), 0xd8c8a0, { x: s * 1.7 + (c - 1) * 0.2, y: 2.6, z: 1.3, rx: 1.8, ao: 0 }))
        // Horns curling out and back.
        plain.push(part(cone(0.32, 1.6, 5), 0xd8c8a0, { x: s * 0.75, y: 7.2, z: -0.1, rz: -s * 0.9, ao: 0 }))
        fine(plain, part(cone(0.22, 1.0, 5), 0xd8c8a0, { x: s * 1.35, y: 7.6, z: -0.4, rz: -s * 2.2, ao: 0 }))
        // Bat wings, folded high behind the shoulders.
        tinted.push(part(box(0.15, 3.6, 2.6), WHITE, { x: s * 1.3, y: 6.4, z: -1.3, rz: s * 0.5, rx: 0.3 }))
        fine(plain, part(rod(0.1, 0.12, 4.2), dark, { x: s * 1.1, y: 6.8, z: -0.8, rz: s * 0.55, ao: 0 }))
      }
      plain.push(part(box(2.4, 2.6, 1.5), hide, { y: 4.3, rx: 0.25 }))
      fine(plain, part(box(2.2, 0.3, 1.5), dark, { y: 3.6, z: 0.15, ao: 0 }))
      plain.push(part(box(1.8, 1.2, 1.2), dark, { y: 2.6 }))
      plain.push(part(head(0.85), hide, { y: 6.2, z: 0.4, ao: 0 }))
      plain.push(part(box(0.9, 0.4, 0.6), dark, { y: 5.7, z: 0.95, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.26, 0.18, 0.12), 0xffc02a, { x: s * 0.3, y: 6.35, z: 1.2, ao: 0 }))
      fine(plain, part(rod(0.12, 0.25, 3.2), hide, { y: 2.2, z: -1.5, rx: 1.0 }))
      fine(plain, part(cone(0.35, 0.8, 4), dark, { y: 1.0, z: -2.8, rx: 1.6, ao: 0 }))
      scale = 1.35
      break
    }
    case 'giant': {
      // A giant of the waste: three times a man's height, grey hide hung with chains, tusks, a mane of
      // matted hair, a tree-trunk club studded with iron, eyes burning amber.
      const hide = 0x6f7a80
      const dark = 0x3a3f44
      for (const s of [-1, 1]) {
        plain.push(part(box(1.1, 3.4, 1.2), hide, { x: s * 0.85, y: 1.8 }))
        fine(plain, part(box(1.3, 0.6, 1.7), dark, { x: s * 0.85, y: 0.3, z: 0.25, ao: 0 }))
        plain.push(part(box(0.95, 3.6, 0.95), hide, { x: s * 2.0, y: 4.9, z: 0.3, rz: s * 0.2, rx: -0.2 }))
        fine(plain, part(box(1.2, 1.0, 1.2), dark, { x: s * 2.25, y: 3.0, z: 0.7, ao: 0 }))
        plain.push(part(cone(0.18, 1.0, 4), 0xe8e0c8, { x: s * 0.35, y: 7.6, z: 1.2, rx: -0.6, ao: 0 }))
      }
      plain.push(part(box(3.4, 3.8, 2.2), hide, { y: 5.2, rx: 0.2 }))
      plain.push(part(box(3.0, 1.6, 2.1), 0x4a3a2a, { y: 3.2 }))
      for (let i = 0; i < 5; i++) fine(plain, part(box(0.25, 0.25, 2.4), 0x55595e, { x: -1.4 + i * 0.7, y: 6.4 - i * 0.35, z: 0.1, ry: 0.4, ao: 0 }))
      plain.push(part(head(1.1), hide, { y: 7.9, z: 0.6, ao: 0 }))
      fine(plain, part(box(2.2, 1.6, 1.6), 0x2a2420, { y: 8.3, z: 0.1, ao: 0 }))
      for (const s of [-1, 1]) plain.push(part(box(0.3, 0.24, 0.14), 0xffa83a, { x: s * 0.42, y: 8.0, z: 1.62, ao: 0 }))
      // The club, raised over the right shoulder.
      plain.push(part(cyl(0.45, 0.8, 6.5, 6), 0x4a3524, { x: 2.3, y: 8.4, z: -0.4, rz: -0.5, rx: 0.3 }))
      for (let i = 0; i < 6; i++) fine(plain, part(cone(0.18, 0.6, 4), 0x55595e, { x: 3.0 + (i % 2) * 0.4, y: 10.2 + i * 0.4, z: -0.6, rz: -1.5 + (i % 3), ao: 0 }))
      // A rag of the host's colour about the loins.
      tinted.push(part(box(3.1, 1.2, 2.3), WHITE, { y: 2.5 }))
      scale = 3.2
      break
    }
    // ---- A spymaster's band in disguise: pilgrims, pedlars' mules and a covered cart. ----
    case 'pilgrim': {
      // A pilgrim (or a soldier dressed as one): a long hooded robe, a staff with a gourd, a bundle on the back, a small badge.
      const robe = 0x6a5e4c
      const cowl = 0x4e4436
      plain.push(part(cyl(0.95, 1.3, 4.4, lo ? 5 : 8), robe, { y: 2.3 }))
      plain.push(part(box(1.8, 1.9, 1.1), robe, { y: 4.7 }))
      for (const s of [-1, 1]) plain.push(part(box(0.55, 2.2, 0.6), robe, { x: s * 1.15, y: 4.25, rz: s * 0.1 }))
      fine(plain, part(box(0.46, 0.46, 0.46), SKIN, { x: 1.25, y: 3.05, ao: 0 }))
      fine(plain, part(box(1.9, 0.26, 1.2), LEATHER, { y: 3.4, ao: 0 }))
      plain.push(part(head(0.66), SKIN, { y: 6.05, ao: 0 }))
      plain.push(part(cone(1.0, 2.0, 6), cowl, { y: 6.65, z: -0.15, ao: 0.1 }))
      plain.push(part(box(1.95, 0.6, 1.3), cowl, { y: 5.55, ao: 0 }))
      plain.push(part(rod(0.09, 0.11, 8.6), WOOD, { x: 1.4, y: 4.3, z: 0.45 }))
      fine(plain, part(sphere(0.34, 0), 0xc9a46a, { x: 1.5, y: 7.6, z: 0.5, ao: 0 }))
      plain.push(part(box(1.4, 1.6, 0.9), 0x8a7a5a, { y: 4.7, z: -1.0 }))
      tinted.push(part(box(0.55, 0.55, 0.12), WHITE, { x: -0.4, y: 5.0, z: 0.6, ao: 0 }))
      scale = 0.95
      break
    }
    case 'mule': {
      // A pack mule laden with bales across its back.
      horse(plain, 0x5e5048, { mane: 0x2a201a, saddle: 0x4a3a2a })
      plain.push(part(box(3.6, 1.6, 2.2), 0x9a8a68, { y: 6.2, z: -0.3 }))
      fine(plain, part(box(2.6, 1.1, 1.6), 0x7a6a4c, { y: 7.4, z: -0.3 }))
      fine(plain, part(box(3.7, 0.2, 0.3), LEATHER, { y: 6.2, z: 0.85, ao: 0 }))
      tinted.push(part(box(2.4, 0.3, 2.6), WHITE, { y: 5.45, z: -0.3, ao: 0 }))
      scale = 0.8
      break
    }
    case 'cart': {
      // A pedlar's covered cart: two big wheels, a canvas tilt over the bales, the shafts out in front.
      plain.push(part(box(4.2, 0.6, 7), WOOD, { y: 2.6 }))
      for (const s of [-1, 1]) {
        plain.push(part(cyl(1.9, 1.9, 0.4, lo ? 6 : 12), 0x4a3520, { x: s * 2.4, y: 1.9, rz: Math.PI / 2 }))
        fine(plain, part(cyl(0.35, 0.35, 0.6, 6), 0x2e2116, { x: s * 2.4, y: 1.9, rz: Math.PI / 2, ao: 0 }))
        plain.push(part(rod(0.12, 0.12, 6), WOOD, { x: s * 1.1, y: 2.5, z: 6.2, rx: Math.PI / 2 + 0.1 }))
      }
      plain.push(part(cyl(2.1, 2.1, 6.4, lo ? 5 : 9), 0xd8ccb0, { y: 3.8, rx: Math.PI / 2, sx: 0.98 }))
      fine(plain, part(box(3.4, 1.2, 1.4), 0x9a8a68, { y: 3.4, z: -3.6 }))
      tinted.push(part(box(0.1, 0.9, 1.4), WHITE, { x: 0, y: 6.4, z: -2.6, ao: 0 }))
      scale = 1
      break
    }
    case 'siege': {
      // A tortoise ram under hides: a wheeled frame, a roof of planks and hide, the iron-shod beam.
      plain.push(part(box(5, 1.2, 9), WOOD, { y: 2.6 }))
      for (const s of [-1, 1]) for (const z of [-3.5, 0, 3.5]) plain.push(part(box(0.5, 4.2, 0.5), 0x5a3f22, { x: s * 2.3, y: 4.6, z }))
      plain.push(part(cyl(0.75, 0.75, 11, 6), 0x5a3f22, { y: 4.2, z: 1, rx: Math.PI / 2 }))
      plain.push(part(cone(1.0, 1.8, 6), STEEL_D, { y: 4.2, z: 7.3, rx: Math.PI / 2, ao: 0 }))
      for (const [x, z] of [[-2.8, 3], [2.8, 3], [-2.8, -3], [2.8, -3]]) {
        plain.push(part(cyl(1.5, 1.5, 0.6, 10), 0x4a3520, { x, y: 1.5, z, rz: Math.PI / 2 }))
        plain.push(part(cyl(0.4, 0.4, 0.8, 6), 0x2e2116, { x, y: 1.5, z, rz: Math.PI / 2, ao: 0 }))
      }
      tinted.push(part(cyl(3.6, 3.6, 10, 3), WHITE, { y: 6.6, rx: Math.PI / 2, rz: Math.PI / 2, sx: 0.8 }))
      plain.push(part(box(0.3, 0.3, 10.2), 0x4a3520, { y: 8.4, ao: 0 }))
      scale = 1.1
      break
    }
  }
  lo = false
  return { tinted: bmerge(tinted), plain: bmerge(plain), scale }
}

/**
 * A mounted commander at the head of the army: a horse in a caparison of his
 * colours, a long coat and cloak, bare-headed. The King rides crowned on a grey
 * in crimson; the Usurper Queen crowned on a black in her dark red, her hair long.
 */
export function leaderGeometry(color: number, who: 'commander' | 'king' | 'queen'): THREE.BufferGeometry {
  const king = who === 'king'
  const queen = who === 'queen'
  const coat = king ? 0x2a2a34 : queen ? 0x2a0c12 : 0x3a3028
  const cloak = king ? 0x7a1f2b : queen ? 0x5a0f1a : color
  const g: G = []
  horse(g, king ? 0x9a948a : queen ? 0x231c1a : 0x5a3e2a, { mane: king ? 0xe8e2d6 : 0x1a120c, blaze: !king && !queen, saddle: LEATHER })
  g.push(part(box(2.9, 2.4, 6.0), cloak, { y: 3.7 }))
  g.push(part(box(2.95, 0.35, 6.05), GOLD, { y: 2.55, ao: 0 }))
  rider(g, coat, king ? 0x3a3f48 : 0x2e241b)
  g.push(part(box(1.95, 0.3, 1.25), GOLD, { y: 6.9, ao: 0 }))
  g.push(part(head(0.78), SKIN, { y: 9.4, ao: 0 }))
  g.push(part(box(1.3, 0.5, 1.2), king ? 0x8a7a68 : queen ? 0x1a1216 : 0x4a3424, { y: 9.95, z: -0.1, ao: 0 }))
  // A cloak flowing behind, its collar of fur.
  g.push(part(box(2.8, 4.4, 0.35), cloak, { y: 7.2, z: -1.05, rx: 0.22 }))
  g.push(part(box(2.6, 0.7, 1.5), king || queen ? 0x4a3a2a : coat, { y: 8.6, z: -0.25, ao: 0 }))
  if (queen) g.push(part(box(1.2, 2.6, 0.4), 0x1a1216, { y: 8.4, z: -0.55, ao: 0 }))
  if (king || queen) {
    g.push(part(cyl(0.88, 0.88, 0.45, 8), GOLD, { y: 10.35, ao: 0 }))
    for (let i = 0; i < 5; i++) g.push(part(cone(0.2, 0.6, 4), GOLD, { x: Math.cos((i / 5) * Math.PI * 2) * 0.8, y: 10.85, z: Math.sin((i / 5) * Math.PI * 2) * 0.8, ao: 0 }))
    g.push(part(rod(0.12, 0.12, 9), 0x2a2a2e, { x: 1.4, y: 8, z: 1.4, rx: 0.15, ao: 0 }))
    g.push(part(sphere(0.35, 0), GOLD, { x: 1.4, y: 12.4, z: 2.05, ao: 0 }))
  } else {
    // A drawn sword raised to lead the advance.
    g.push(part(box(0.14, 3.6, 0.36), 0xd4dbe2, { x: 1.4, y: 9.4, z: 1.3, rx: 0.5, ao: 0 }))
    g.push(part(box(0.9, 0.16, 0.2), GOLD, { x: 1.4, y: 7.85, z: 0.45, rx: 0.5, ao: 0 }))
  }
  return bmerge(g)
}

/** How many soldiers one figure represents, per kind. */
export const SOLDIERS_PER_FIGURE: Record<FigureKind, number> = {
  spearmen: 5,
  men_at_arms: 5,
  archers: 5,
  light_cavalry: 5,
  knights: 4,
  royal_guard: 4,
  thorn_guard: 4,
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
