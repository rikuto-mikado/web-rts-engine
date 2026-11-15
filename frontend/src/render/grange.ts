import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import type { Grange } from '../game/types'
import { mulberry32 } from '../game/noise'
import { Frame, PAL, barrel, cart, crate, fence, gable, haystack, hip, horse, newKit, shade, tree, well, woodpile, type Kit } from './buildings'
import { drape } from './fortress'
import { bmerge, box, cone, cyl, groundShade, merge, sphere } from './geo'
import { GRANGE } from '../game/granary'
import { buildMat } from './villages'
import { applyVision } from './vision'

/**
 * A grange: the home farm that feeds a castle, as a miniature diorama about 140 units across.
 *
 * Inside a drystone wall with a roofed gatehouse (its gate towards the castle it feeds):
 *   - the great tithe barn across the back of the yard: buttressed stone walls with ventilation
 *     slits, a steep roof, and two gabled wagon porches with their great doors open;
 *   - a granary standing on mushroom-capped staddle stones (no rat climbs them), its steps stopping
 *     short of the door;
 *   - a round stone dovecote with nesting holes and a lantern on its cone;
 *   - the reeve's stone house, a cart shed with its carts, the threshing floor heaped with sheaves,
 *     a well, sacks at the barn doors, draught horses;
 * and outside: a rickyard of corn ricks on staddles, strip fields of wheat, barley, green oats and
 * fresh plough behind hedges, a post mill whose sails turn, and a pond. The banner and the cloth
 * take the colours of whoever holds it.
 */

const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa04a })
const waterMat = applyVision(new THREE.MeshStandardMaterial({ color: 0x4f7f96, roughness: 0.25, metalness: 0.1, flatShading: true }))
const NEUTRAL_CLOTH = '#b8aa88'

/** The farmyard wall's half-extents (x along the front, z towards the castle). */
const WX = 36
const WZ = 28
/** The long, low wall round the fields: the grange's only defence. */
const OX = GRANGE.outerX
const OZ = GRANGE.outerZ

const STONE = 0xa89f8a
const STONE_D = 0x857c6a
const WHEAT = 0xcdb15c

type Rnd = () => number

/** The drystone wall round the yard, its coping, and the gaps for the two gates. */
function yardWall(k: Kit, f: Frame, rnd: Rnd) {
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(len / 5))
    const ry = Math.atan2(-(z1 - z0), x1 - x0)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const h = 1.6 + rnd() * 0.25
      f.put(k.walls, box(len / n + 0.15, h, 1.1), shade(STONE, (rnd() - 0.5) * 0.12), x, h / 2, z, { ry, jitter: 0.06 })
      f.put(k.walls, box(len / n + 0.2, 0.3, 1.35), STONE_D, x, h + 0.12, z, { ry, ao: 0 })
    }
  }
  // Front wall, gate gap in the middle; back wall, a small field gate off-centre.
  seg(-WX, WZ, -6, WZ)
  seg(6, WZ, WX, WZ)
  seg(-WX, -WZ, 5, -WZ)
  seg(11, -WZ, WX, -WZ)
  seg(-WX, -WZ, -WX, WZ)
  seg(WX, -WZ, WX, WZ)
  // Corner stones a little higher.
  for (const [x, z] of [[-WX, WZ], [WX, WZ], [-WX, -WZ], [WX, -WZ]]) f.put(k.walls, box(1.8, 2.2, 1.8), STONE_D, x, 1.1, z)
}

/** The gatehouse: stone piers, a roofed timber gate with its leaves open, lanterns; and the field gate behind. */
function gatehouse(k: Kit, f: Frame, lamps: THREE.BufferGeometry[], Z: number = WZ) {
  const g = f.sub(0, Z, 0)
  for (const s of [-1, 1]) {
    g.put(k.walls, box(2.6, 5, 2.6), STONE, s * 5.6, 2.5, 0, { ao: 0.15 })
    g.put(k.walls, box(3, 0.5, 3), STONE_D, s * 5.6, 5.2, 0, { ao: 0 })
    // A lantern on an iron bracket at each pier, towards the road.
    g.put(k.walls, box(0.15, 0.15, 1.2), PAL.iron, s * 5.6, 4.2, 1.6, { ao: 0 })
    g.put(lamps, box(0.6, 0.8, 0.6), 0xffc46a, s * 5.6, 3.7, 2.1)
    g.put(k.walls, cone(0.5, 0.45, 4), PAL.dark, s * 5.6, 4.35, 2.1, { ao: 0 })
  }
  // The gate frame: posts, a heavy lintel, a little gabled roof of shingles over it.
  for (const s of [-1, 1]) g.put(k.walls, box(0.7, 6.4, 0.7), PAL.timber, s * 4.1, 3.2, 0)
  g.put(k.walls, box(9.4, 0.8, 1.0), PAL.timberL, 0, 6.4, 0)
  for (const s of [-1, 1]) g.put(k.walls, box(0.4, 2.4, 0.4), PAL.timber, s * 3.2, 5.6, 0, { rz: s * 0.7, ao: 0 })
  g.put(k.roofs, gable(3.6, 11.2, 2), PAL.shingle[0], 0, 6.8, 0)
  g.put(k.walls, box(11.4, 0.3, 0.4), 0x4a3828, 0, 8.8, 0, { ao: 0 })
  // The two leaves standing open into the yard.
  for (const s of [-1, 1]) {
    const leaf = g.sub(s * 3.9, -0.4, s * -1.25)
    leaf.put(k.walls, box(3.6, 5, 0.3), 0x6b4b2e, -s * 1.8, 2.5, -0.1)
    for (const y of [1, 4]) leaf.put(k.walls, box(3.7, 0.35, 0.36), 0x4a3420, -s * 1.8, y, -0.1, { ao: 0 })
    leaf.put(k.walls, box(3.9, 0.3, 0.34), 0x4a3420, -s * 1.8, 2.5, -0.1, { rz: s * 0.9, ao: 0 })
  }
  // The field gate at the back: a hurdle gate between two posts.
  const b = f.sub(Z === WZ ? 8 : 0, -Z, 0)
  for (const s of [-1, 1]) b.put(k.walls, box(0.5, 2.6, 0.5), PAL.timber, s * 3, 1.3, 0)
  b.put(k.walls, box(5.6, 0.25, 0.2), 0x7a5a36, 0, 1.6, 0.9, { ry: 0.6, ao: 0 })
}

/** The tithe barn: the heart of the grange. */
function titheBarn(k: Kit, f: Frame, rnd: Rnd) {
  const L = 36
  const W = 13
  const H = 6.6
  const RH = 9.5
  const roofCol = rnd() < 0.5 ? 0x7f776a : 0xb08a52
  const thatch = roofCol === 0xb08a52
  // A deep stone plinth (the yard is never quite level).
  f.put(k.walls, box(L + 1.4, 2.4, W + 1.4), STONE_D, 0, -0.4, 0, { ao: 0.1 })
  const porches = [-9.5, 7.5]
  // Walls of coursed rubble, with string courses.
  f.put(k.walls, box(L, H, W), STONE, 0, 0.8 + H / 2, 0, { jitter: 0.04 })
  for (const y of [2.4, 4.4]) f.put(k.flat ?? k.walls, box(L + 0.12, 0.22, W + 0.12), STONE_D, 0, 0.8 + y, 0, { ao: 0 })
  // Stepped buttresses down both long sides (none where the porches stand) and at the corners.
  for (let x = -L / 2 + 2.5; x <= L / 2 - 2.4; x += 4.5) {
    if (porches.some((p) => Math.abs(p - x) < 4.6)) continue
    for (const s of [-1, 1]) {
      f.put(k.walls, box(1.3, 3.4, 1.8), STONE_D, x, 0.8 + 1.7, s * (W / 2 + 0.8))
      f.put(k.walls, box(1.0, 2.6, 1.2), STONE, x, 0.8 + 4.6, s * (W / 2 + 0.55))
      f.put(k.walls, box(1.05, 0.5, 1.5), STONE_D, x, 0.8 + 3.55, s * (W / 2 + 0.75), { rx: s * 0.6, ao: 0 })
      // A ventilation slit between each pair of buttresses.
      if (x < L / 2 - 4) f.put(k.flat ?? k.walls, box(0.35, 2.4, 0.15), PAL.dark, x + 2.25, 0.8 + 3.6, s * (W / 2 + 0.05), { ao: 0 })
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.put(k.walls, box(1.6, 4.2, 1.6), STONE_D, sx * (L / 2 + 0.3), 0.8 + 2.1, sz * (W / 2 + 0.3), { ry: Math.PI / 4 })
  // The gable ends, in stone, each with an owl hole, a cross finial and a cart door.
  for (const s of [-1, 1]) {
    f.put(k.walls, gable(W, 1.0, RH), STONE, s * (L / 2 - 0.4), 0.8 + H, 0)
    f.put(k.flat ?? k.walls, box(0.15, 0.8, 0.8), PAL.dark, s * (L / 2 + 0.12), 0.8 + H + RH * 0.55, 0, { ao: 0 })
    f.put(k.walls, box(0.5, 1.6, 0.5), STONE_D, s * (L / 2 - 0.4), 0.8 + H + RH + 0.6, 0)
    f.put(k.walls, box(0.5, 0.45, 1.4), STONE_D, s * (L / 2 - 0.4), 0.8 + H + RH + 0.9, 0)
    f.put(k.flat ?? k.walls, box(0.2, 3.4, 3.2), 0x4e3826, s * (L / 2 + 0.12), 0.8 + 1.7, 0, { ao: 0 })
  }
  // The roof: heavy and steep, with its courses and a ridge.
  f.put(k.roofs, gable(W + 2.6, L + 1.2, RH), roofCol, 0, 0.8 + H, 0)
  const slope = Math.atan2(RH, W / 2 + 1.3)
  for (const s of [-1, 1])
    for (let i = 1; i < 6; i++) {
      const t = i / 6
      f.put(k.flat ?? k.roofs, box(L + 1.25, 0.14, 0.4), shade(roofCol, thatch ? -0.12 : -0.18), 0, 0.8 + H + RH * t + 0.1, s * (W / 2 + 1.3) * (1 - t), { rx: s * slope, ao: 0 })
    }
  f.put(k.roofs, box(L + 1.6, 0.7, 1.1), shade(roofCol, -0.25), 0, 0.8 + H + RH + 0.1, 0, { ao: 0 })
  // Two wagon porches on the yard side, gabled, their great doors standing open.
  for (const px of porches) {
    const p = f.sub(px, W / 2 + 2.6, 0)
    p.put(k.walls, box(8, H, 5.2), STONE, 0, 0.8 + H / 2, 0)
    p.put(k.walls, gable(8, 5.6, 4.6), STONE, 0, 0.8 + H, 0.15, { ry: Math.PI / 2 })
    p.put(k.roofs, gable(9.6, 6.4, 4.8), roofCol, 0, 0.8 + H - 0.1, 0.6, { ry: Math.PI / 2 })
    p.put(k.roofs, box(0.9, 0.55, 6.5), shade(roofCol, -0.25), 0, 0.8 + H + 4.7, 0.6, { ao: 0 })
    // The doorway: a dark mouth under a timber lintel, big enough for a laden wain.
    p.put(k.flat ?? k.walls, box(5.6, 5.6, 0.3), 0x1c1915, 0, 0.8 + 2.8, 2.5, { ao: 0 })
    p.put(k.walls, box(6.6, 0.7, 0.6), PAL.timberL, 0, 0.8 + 5.9, 2.65)
    for (const s of [-1, 1]) {
      p.put(k.walls, box(0.6, 5.8, 0.6), PAL.timber, s * 3, 0.8 + 2.9, 2.7)
      // Door leaves folded back against the porch walls.
      p.put(k.walls, box(0.3, 5.4, 2.8), 0x6b4b2e, s * 4.25, 0.8 + 2.7, 3.9)
      for (const y of [1.2, 4.2]) p.put(k.flat ?? k.walls, box(0.34, 0.3, 2.9), 0x4a3420, s * 4.27, 0.8 + y, 3.9, { ao: 0 })
    }
    // A lantern over the doors.
    p.put(k.glow, box(0.6, 0.8, 0.6), 0xffb050, 3.6, 0.8 + 5.2, 3.0)
    // Sacks heaped by the doors, and a threshold of worn stone.
    p.put(k.walls, box(6, 0.3, 2.4), 0x9a8e78, 0, 0.9, 3.8, { ao: 0 })
  }
}

/**
 * The manor hall: the grange's administration, where the reeve keeps the tallies and the lord's
 * steward sits. A two-storey stone hall with a steep tiled roof and chimneys, and a square tower
 * at one end with a crenellated top and the holder's banner.
 */
function manorHall(k: Kit, f: Frame, lamps: THREE.BufferGeometry[]) {
  const L = 15
  const W = 8.5
  const H = 7.6
  f.put(k.walls, box(L + 1, 2.2, W + 1), STONE_D, 0, -0.3, 0, { ao: 0.1 })
  f.put(k.walls, box(L, H, W), 0xb8ae98, 0, 0.8 + H / 2, 0, { jitter: 0.03 })
  f.put(k.flat ?? k.walls, box(L + 0.1, 0.25, W + 0.1), STONE_D, 0, 0.8 + 3.7, 0, { ao: 0 })
  // The upper storey half-timbered over the stone: plaster panels between dark posts and braces.
  for (const sd of [-1, 1]) {
    const z = sd * (W / 2 + 0.06)
    f.put(k.flat ?? k.walls, box(L, 3.4, 0.08), 0xe3d6b8, 0, 0.8 + 5.9, z, { ao: 0 })
    for (let x = -L / 2 + 0.2; x <= L / 2; x += L / 6) f.put(k.flat ?? k.walls, box(0.32, 3.6, 0.16), PAL.timber, x, 0.8 + 5.9, z, { ao: 0 })
    for (const y of [4.25, 7.55]) f.put(k.flat ?? k.walls, box(L + 0.1, 0.3, 0.16), PAL.timber, 0, 0.8 + y, z, { ao: 0 })
    for (let i = 0; i < 6; i++) f.put(k.flat ?? k.walls, box(0.22, 3.4, 0.14), PAL.timber, -L / 2 + L / 12 + (i * L) / 6, 0.8 + 5.9, z + sd * 0.02, { rz: i % 2 ? 0.55 : -0.55, ao: 0 })
  }
  f.put(k.roofs, gable(W + 1.8, L + 1, 6.2), 0x8e4f35, 0, 0.8 + H, 0)
  f.put(k.roofs, box(L + 1.3, 0.45, 0.8), 0x6e3a26, 0, 0.8 + H + 6.25, 0, { ao: 0 })
  for (const s of [-1, 1]) f.put(k.walls, gable(W, 0.7, 6.2), 0xb8ae98, s * (L / 2 - 0.3), 0.8 + H, 0)
  // Chimneys, a porch with a pointed door, windows lit within.
  for (const x of [-4.5, 3.5]) {
    f.put(k.walls, box(1.3, 4, 1.3), STONE_D, x, 0.8 + H + 4.6, -W / 4)
    f.put(k.walls, box(1.5, 0.3, 1.5), 0x5e5648, x, 0.8 + H + 6.7, -W / 4, { ao: 0 })
  }
  f.put(k.walls, box(3.2, 3.6, 2.4), 0xb8ae98, -1.5, 0.8 + 1.8, W / 2 + 1.1)
  f.put(k.roofs, gable(3.8, 3, 1.6), 0x8e4f35, -1.5, 0.8 + 3.6, W / 2 + 1.2, { ry: Math.PI / 2 })
  f.put(k.flat ?? k.walls, box(1.5, 2.6, 0.2), 0x3b2a1a, -1.5, 0.8 + 1.3, W / 2 + 2.35, { ao: 0 })
  for (const x of [-5.5, 1.8, 4.6]) for (const y of [2.4, 5.8]) {
    f.put(k.flat ?? k.walls, box(1.1, 1.6, 0.15), PAL.dark, x, 0.8 + y, W / 2 + 0.05, { ao: 0 })
    f.put(lamps, box(0.8, 1.2, 0.1), 0xffc46a, x, 0.8 + y, W / 2 + 0.1)
  }
  // The tower at the east end: three stages, crenellations, a banner pole.
  const T = f.sub(L / 2 + 2.6, -0.6, 0)
  const TH = 15
  T.put(k.walls, box(6, TH, 6), 0xa89f8a, 0, 0.8 + TH / 2, 0)
  for (const y of [5, 10]) T.put(k.flat ?? k.walls, box(6.2, 0.3, 6.2), STONE_D, 0, 0.8 + y, 0, { ao: 0 })
  T.put(k.walls, box(6.6, 0.6, 6.6), STONE_D, 0, 0.8 + TH + 0.3, 0)
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const t = -2.4 + i * 1.6
      T.put(k.walls, box(0.9, 1.1, 0.6), STONE_D, t, 0.8 + TH + 1.15, s * 3)
      T.put(k.walls, box(0.6, 1.1, 0.9), STONE_D, s * 3, 0.8 + TH + 1.15, t)
    }
  for (const y of [4, 9, 13]) T.put(k.flat ?? k.walls, box(0.5, 1.4, 0.15), PAL.dark, 0, 0.8 + y, 3.05, { ao: 0 })
  T.put(k.walls, cyl(0.14, 0.18, 6, 5), PAL.timber, 0, 0.8 + TH + 3.6, 0, { ao: 0 })
}

/** The granary on its staddle stones. */
function granary(k: Kit, f: Frame) {
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const x = (i - 1) * 2.7
      const z = (j - 1) * 2.7
      f.put(k.walls, cyl(0.32, 0.62, 1.9, 6), 0x9a9282, x, 0.95, z)
      f.put(k.walls, cyl(1.05, 0.9, 0.38, 8), 0xa8a090, x, 2.05, z)
    }
  f.put(k.walls, box(6.8, 0.45, 6.8), PAL.timber, 0, 2.45, 0)
  // Weatherboarded walls, corner posts, a door; the steps stop short of it (no rat climbs in).
  f.put(k.walls, box(6.2, 4.2, 6.2), 0x7d5c3a, 0, 2.7 + 2.1, 0)
  for (let y = 3.1; y < 6.8; y += 0.62) f.put(k.flat ?? k.walls, box(6.3, 0.12, 6.3), 0x5e4429, 0, y, 0, { ao: 0 })
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.put(k.walls, box(0.45, 4.4, 0.45), 0x4a3420, sx * 3.05, 2.7 + 2.2, sz * 3.05)
  f.put(k.flat ?? k.walls, box(1.6, 2.6, 0.2), 0x3b2a1a, 0, 2.7 + 1.4, 3.15, { ao: 0 })
  for (let s = 0; s < 3; s++) f.put(k.walls, box(1.8, 0.45, 0.9), 0x9a9282, 0, 0.22 + s * 0.45, 5.2 - s * 0.8 + 1.2)
  f.put(k.roofs, hip(8.2, 8.2, 3.8), 0xb08a52, 0, 6.9, 0)
  f.put(k.walls, cyl(0.25, 0.25, 0.9, 5), 0x4a3420, 0, 10.9, 0)
}

/** A round stone dovecote with nesting holes, a cone of slates and a lantern on top. */
function dovecote(k: Kit, f: Frame, lamps: THREE.BufferGeometry[]) {
  f.put(k.walls, cyl(3.7, 3.9, 1.0, 14), STONE_D, 0, 0.3, 0)
  const H = 8.2
  f.put(k.walls, cyl(3.15, 3.35, H, 14), 0xc2b8a2, 0, 0.8 + H / 2, 0)
  f.put(k.flat ?? k.walls, box(1.1, 2.2, 0.3), PAL.dark, 0, 1.9, 3.3, { ao: 0 })
  f.put(k.walls, cyl(3.3, 3.3, 0.35, 14), STONE_D, 0, 5.2, 0, { ao: 0 })
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    f.put(k.flat ?? k.walls, box(0.45, 0.45, 0.2), PAL.dark, Math.cos(a) * 3.28, 6.6 + (i % 2) * 0.7, Math.sin(a) * 3.28, { ry: -a + Math.PI / 2, ao: 0 })
  }
  f.put(k.roofs, cone(4.1, 4.4, 14), 0x5f6670, 0, 9.0 + 2.2, 0)
  // The lantern (cupola) the doves fly in by.
  f.put(k.walls, cyl(0.75, 0.75, 1.2, 6), 0xd8d0bc, 0, 13.4, 0)
  f.put(lamps, cyl(0.5, 0.5, 0.6, 6), 0xffc46a, 0, 13.4, 0)
  f.put(k.roofs, cone(1.0, 1.2, 6), 0x5f6670, 0, 14.6, 0)
  // Doves on the roof.
  for (const [x, y, z] of [[1.6, 10.6, 1.4], [-1.9, 10.2, 0.9], [0.4, 11.8, -1.3]]) f.put(k.walls, box(0.45, 0.3, 0.7), 0xeeeae2, x, y, z, { ry: x, ao: 0 })
}

/** An open-fronted cart shed: posts, a lean-to roof, carts and a plough inside. */
function cartShed(k: Kit, f: Frame, rnd: Rnd) {
  const W = 16
  const D = 7
  f.put(k.walls, box(W + 0.6, 3.6, 0.5), PAL.timber, 0, 1.8, -D / 2)
  for (let x = -W / 2 + 0.2; x <= W / 2; x += W / 4) f.put(k.walls, box(0.45, 4.2, 0.45), PAL.timberL, x, 2.1, D / 2)
  for (const s of [-1, 1]) f.put(k.walls, box(0.5, 3.8, D), PAL.timber, s * (W / 2 + 0.05), 1.9, 0)
  f.put(k.roofs, box(W + 1.6, 0.35, D + 1.8), PAL.shingle[1], 0, 4.4, 0, { rx: -0.18 })
  f.put(k.walls, box(W + 0.6, 0.45, 0.45), PAL.timber, 0, 4.2, D / 2)
  cart(k, f.sub(-3.8, 0, Math.PI / 2), 'empty', rnd)
  cart(k, f.sub(3.4, 0.3, Math.PI / 2 + 0.1), 'hay', rnd)
  // A plough leaning on the back wall.
  f.put(k.walls, box(0.3, 0.3, 3.4), 0x6b4b2e, 6.6, 0.9, -1.6, { rx: 0.5, ao: 0 })
  f.put(k.walls, box(0.15, 0.9, 1.0), PAL.iron, 6.6, 0.5, -0.2, { ao: 0 })
}

/** A corn rick on staddles, thatched against the rain and roped down. */
function rick(k: Kit, f: Frame, lx: number, lz: number, s: number) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    f.put(k.walls, cyl(0.25, 0.4, 1.0, 5), 0x9a9282, lx + Math.cos(a) * 2.4 * s, 0.5, lz + Math.sin(a) * 2.4 * s)
  }
  f.put(k.walls, cyl(3.1 * s, 3.0 * s, 3.6 * s, 10), WHEAT, lx, 1.1 + 1.8 * s, lz, { jitter: 0.05 })
  f.put(k.roofs, cone(3.6 * s, 3.4 * s, 10), 0xb08a52, lx, 1.1 + 3.6 * s + 1.7 * s, lz)
  for (const y of [2.0, 3.4]) f.put(k.flat ?? k.walls, cyl(3.15 * s, 3.15 * s, 0.14, 10), 0x6b5a3a, lx, 1.1 + y * s, lz, { ao: 0 })
  f.put(k.walls, cyl(0.12, 0.12, 1.4, 4), PAL.timber, lx, 1.1 + 7 * s + 0.4, lz, { ao: 0 })
}

// --- Out in the walled fields ------------------------------------------------------------------

/** Everything the walled fields are built into, with the lie of the land under them. */
interface Site {
  k: Kit
  rnd: Rnd
  /** Height of the land at a point of the grange (its own frame), relative to its middle. */
  G: (lx: number, lz: number) => number
  lamps: THREE.BufferGeometry[]
  water: THREE.BufferGeometry[]
  /** The stretches of the outer wall that come down when it is breached, and what is left then. */
  breachWall: THREE.BufferGeometry[]
  breachRubble: THREE.BufferGeometry[]
  breachAt: [number, number, number][]
  /** Chimneys (for their smoke). */
  smoke: [number, number, number][]
}

/** A frame standing on the land at a point of the grange. */
const on = (s: Site, lx: number, lz: number, ry = 0) => new Frame(lx, lz, ry, s.G(lx, lz))

/** The outer wall's height (above its footing), and its thickness. */
const OW_H = 3.4
const OW_T = 2.0
/** The stretches that fall when the wall is breached: (side, index of the piece along it). */
const BREACHES: Record<string, number[]> = { front: [3, 4, 5], west: [8, 9], east: [5, 6, 7], back: [12, 13] }

/**
 * The outer wall: coursed stone on a deep footing (it follows the land, and never shows daylight
 * under it), a walk along its top behind a crenellated parapet, buttresses and arrow slits; gaps for
 * the two gatehouses. Some stretches are built so they can fall (see BREACHES).
 */
function outerWall(s: Site) {
  const { k, rnd } = s
  const run = (name: string, x0: number, z0: number, x1: number, z1: number, out: [number, number]) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(len / 5.2))
    const ry = Math.atan2(out[0], out[1])
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const L = len / n + 0.12
      const f = on(s, x, z, ry)
      const falls = (BREACHES[name] ?? []).includes(i)
      const W = falls ? s.breachWall : k.walls
      const col = shade(0xa49a84, (rnd() - 0.5) * 0.12)
      // The wall on its footing, a string course, the walk and the parapet with its merlons.
      f.put(W, box(L, OW_H + 3, OW_T), col, 0, (OW_H - 3) / 2, 0, { jitter: 0.05 })
      f.put(W, box(L + 0.05, 0.35, OW_T + 0.35), STONE_D, 0, 1.2, 0, { ao: 0 })
      f.put(W, box(L + 0.1, 0.35, OW_T + 0.5), 0x8f8673, 0, OW_H + 0.17, 0, { ao: 0 })
      f.put(W, box(L, 0.6, 0.55), col, 0, OW_H + 0.65, OW_T / 2 - 0.1)
      for (let m = -L / 2 + 0.7; m < L / 2 - 0.3; m += 1.75) f.put(W, box(1.0, 1.0, 0.6), col, m + 0.3, OW_H + 1.45, OW_T / 2 - 0.1, { jitter: 0.06 })
      if (i % 3 === 1) f.put(W, box(0.3, 1.3, 0.15), PAL.dark, 0, OW_H - 1.2, OW_T / 2 + 0.03, { ao: 0 })
      if (i % 4 === 2 && !falls) {
        f.put(k.walls, box(1.5, OW_H + 2.6, 1.4), STONE_D, L / 2 - 0.4, (OW_H - 2.6) / 2, OW_T / 2 + 0.6)
        f.put(k.walls, box(1.3, 0.6, 1.5), STONE_D, L / 2 - 0.4, OW_H - 0.6, OW_T / 2 + 0.55, { rx: 0.7, ao: 0 })
      }
      if (falls) {
        // Brought down: a broken stump, the stones spilled out both ways, a fallen block or two.
        const h = 0.6 + rnd() * 1.2
        f.put(s.breachRubble, box(L * 0.6, h + 3, OW_T * 0.9), shade(col, -0.08), (rnd() - 0.5) * L * 0.3, (h - 3) / 2, 0, { jitter: 0.12 })
        for (const side of [-1, 1])
          for (let q = 0; q < 5; q++) {
            const u = (rnd() - 0.5) * L
            const v = side * (OW_T / 2 + 0.6 + rnd() * 3.4)
            const [wx, wz] = f.at(u, v)
            const y = s.G(wx, wz) - f.y
            f.put(s.breachRubble, new THREE.DodecahedronGeometry(0.5 + rnd() * 0.6, 0), shade(col, (rnd() - 0.5) * 0.2), u, y + 0.3, v, { ry: rnd() * 3, sy: 0.7 })
          }
        f.put(s.breachRubble, cone(2.4, 1.3, 7), 0x8a8070, 0, s.G(...f.at(0, OW_T + 1.5)) - f.y + 0.4, OW_T + 1.5, { jitter: 0.25 })
        f.put(s.breachRubble, box(1.0, 1.0, 0.6), col, L * 0.3, s.G(...f.at(L * 0.3, OW_T + 2.6)) - f.y + 0.4, OW_T + 2.6, { rz: 0.5, ry: 0.3 })
        s.breachAt.push([x, f.y + 1.5, z])
      }
    }
  }
  run('front', -OX + 4, OZ, -8, OZ, [0, 1])
  run('front2', 8, OZ, OX - 4, OZ, [0, 1])
  run('back', -OX + 4, -OZ, -8, -OZ, [0, -1])
  run('back2', 8, -OZ, OX - 4, -OZ, [0, -1])
  run('west', -OX, -OZ + 4, -OX, OZ - 4, [-1, 0])
  run('east', OX, -OZ + 4, OX, OZ - 4, [1, 0])
  for (const [x, z] of [[-OX, OZ], [OX, OZ], [-OX, -OZ], [OX, -OZ]]) cornerTower(s, x, z)
  archGate(s, OZ, 0)
  archGate(s, -OZ, Math.PI)
}

/** A square stone watch tower at a corner: footing, string courses, slits, crenellations, a slate roof over the watch, torches. */
function cornerTower(s: Site, x: number, z: number) {
  const { k } = s
  const f = on(s, x, z, Math.atan2(x, z))
  const H = 10
  f.put(k.walls, box(7.4, H + 3, 7.4), 0x9e947e, 0, (H - 3) / 2, 0, { jitter: 0.04 })
  for (const y of [3.4, 7]) f.put(k.flat!, box(7.6, 0.3, 7.6), STONE_D, 0, y, 0, { ao: 0 })
  f.put(k.walls, box(8.2, 0.6, 8.2), STONE_D, 0, H + 0.3, 0)
  for (let i = 0; i < 4; i++)
    for (const sd of [-1, 1]) {
      const t = -3 + i * 2
      f.put(k.walls, box(1.1, 1.2, 0.7), 0x9e947e, t, H + 1.2, sd * 3.75)
      f.put(k.walls, box(0.7, 1.2, 1.1), 0x9e947e, sd * 3.75, H + 1.2, t)
    }
  // The watch room's roof on its corner posts.
  for (const [px, pz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) f.put(k.walls, box(0.45, 2.6, 0.45), PAL.timber, px, H + 1.9, pz)
  f.put(k.roofs, hip(7.2, 7.2, 3.6), 0x5f6670, 0, H + 3.2, 0)
  f.put(k.walls, cyl(0.12, 0.12, 1.4, 4), PAL.iron, 0, H + 7.4, 0, { ao: 0 })
  // Arrow slits, a door to the wall walk, a torch on each outer face.
  for (const [lx, lz, ry] of [[0, 3.72, 0], [3.72, 0, Math.PI / 2]] as const) {
    for (const y of [4.8, 8.4]) f.put(k.flat!, box(0.35, 1.5, 0.15), PAL.dark, lx, y, lz, { ry, ao: 0 })
    const [bx, bz] = [lx * 1.08, lz * 1.08]
    f.put(k.flat!, box(0.15, 0.15, 0.9), PAL.iron, bx * 0.98, 6.2, bz * 0.98, { ry, ao: 0 })
    f.put(s.lamps, box(0.45, 0.7, 0.45), 0xffb050, bx, 6.5, bz)
  }
  f.put(k.flat!, box(1.2, 2.2, 0.2), PAL.door, -3.72, OW_H + 1.1, 0, { ry: Math.PI / 2, ao: 0 })
}

/**
 * A gatehouse in the outer wall: two round flanking towers with conical roofs, the gate passage
 * between them under a heavy arch with its voussoirs, the portcullis half raised, the leaves open,
 * a chamber over the gate behind a crenellated parapet, torches either side.
 */
function archGate(s: Site, Z: number, ry: number) {
  const { k } = s
  const f = on(s, 0, Z, ry)
  const H = 8.6
  for (const sd of [-1, 1]) {
    f.put(k.walls, cyl(3.5, 3.9, H + 3, 12), 0xa49a84, sd * 7, (H - 3) / 2, 0.4, { jitter: 0.04 })
    f.put(k.walls, cyl(3.75, 3.75, 0.5, 12), STONE_D, sd * 7, H + 0.25, 0.4, { ao: 0 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      f.put(k.walls, box(0.9, 1.1, 0.7), 0xa49a84, sd * 7 + Math.cos(a) * 3.45, H + 1.05, 0.4 + Math.sin(a) * 3.45, { ry: -a })
    }
    f.put(k.roofs, cone(4.3, 4.6, 12), 0x5f6670, sd * 7, H + 3.9, 0.4)
    for (const y of [3.5, 6.6]) f.put(k.flat!, box(0.35, 1.5, 0.15), PAL.dark, sd * 7, y, 4.25, { ao: 0 })
    // Torches by the gate.
    f.put(k.flat!, box(0.15, 0.15, 1.0), PAL.iron, sd * 4.2, 4.2, 3.6, { ao: 0 })
    f.put(s.lamps, box(0.45, 0.7, 0.45), 0xffb050, sd * 4.2, 4.5, 4.05)
  }
  // The gate block: piers either side of the passage, the arch and the chamber over it.
  for (const sd of [-1, 1]) f.put(k.walls, box(1.8, H, 7), 0x9e947e, sd * 3.7, H / 2 - 0.2, 0)
  f.put(k.walls, box(5.8, H - 6.2, 7), 0x9e947e, 0, 6.2 + (H - 6.2) / 2, 0)
  // The arch: a ring of voussoirs over the opening, on both faces.
  for (const face of [-3.55, 3.55])
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI
      f.put(k.walls, box(0.7, 0.9, 0.3), 0xb8ae98, Math.cos(a) * 2.9, 4.6 + Math.sin(a) * 1.7, face, { rz: a - Math.PI / 2, ao: 0 })
    }
  f.put(k.flat!, box(5.6, 1.7, 7.1), 0x1c1915, 0, 5.4, 0, { ao: 0 })
  // The portcullis, half raised: iron bars in a grid.
  for (let i = 0; i < 6; i++) f.put(k.flat!, box(0.14, 2.2, 0.14), PAL.iron, -2.4 + i * 0.96, 5.0, 2.6, { ao: 0 })
  for (const y of [4.3, 5.4]) f.put(k.flat!, box(5.2, 0.14, 0.14), PAL.iron, 0, y, 2.6, { ao: 0 })
  // The leaves, swung back into the passage.
  for (const sd of [-1, 1]) f.put(k.walls, box(0.3, 4.4, 2.8), 0x6b4b2e, sd * 2.6, 2.2, -1.6)
  // Parapet over the gate, and the chamber's little roof.
  for (let i = 0; i < 4; i++) f.put(k.walls, box(1.0, 1.1, 0.7), 0x9e947e, -2.4 + i * 1.6, H + 0.55, 3.2)
  f.put(k.roofs, gable(5, 6.6, 2.2), 0x6f5a42, 0, H, -1.2)
  // The road through it.
  f.put(k.flat!, box(5.4, 0.3, 14), 0x9c8a66, 0, 0.32, 0, { ao: 0 })
}

/** Lay a patch of ground over the land (a field's soil, a green): quads draped on the terrain. */
function soil(s: Site, f: Frame, w: number, h: number, color: number, lift: number) {
  const quads: number[][] = []
  const nu = Math.max(3, Math.round(w / 6))
  const nv = Math.max(2, Math.round(h / 6))
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const p = (a: number, b: number): [number, number, number] => {
        const [x, z] = f.at((a / nu - 0.5) * w, (b / nv - 0.5) * h)
        return [x, s.G(x, z) + lift, z]
      }
      quads.push([...p(i, j), ...p(i + 1, j), ...p(i + 1, j + 1), ...p(i, j + 1)])
    }
  s.k.flat!.push(drape(quads, color, 0.07))
  // A footing of earth round it, so no edge ever floats on a slope.
  for (const [u, v, a, b] of [[0, h / 2, w, 0.6], [0, -h / 2, w, 0.6], [w / 2, 0, 0.6, h], [-w / 2, 0, 0.6, h]] as const) {
    const [x, z] = f.at(u, v)
    f.put(s.k.flat!, box(a, 3, b), shade(color, -0.25), u, s.G(x, z) - f.y - 1.3, v, { ao: 0.3 })
  }
}

/** Put a part on the land at a point of a frame. */
function onGround(s: Site, f: Frame, out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, col: number, u: number, lift: number, v: number, o: Parameters<Frame['put']>[6] = {}) {
  const [x, z] = f.at(u, v)
  f.put(out, geo, col, u, s.G(x, z) - f.y + lift, v, o)
}

/** A hedgerow (or a run of hurdles) along a line of a field, with a gap for the gate. */
function hedge(s: Site, f: Frame, u0: number, v0: number, u1: number, v1: number, gapAt: number | null, hurdles: boolean) {
  const len = Math.hypot(u1 - u0, v1 - v0)
  const tu = (u1 - u0) / len
  const tv = (v1 - v0) / len
  const rot = Math.atan2(-tv, tu)
  const r = s.rnd
  for (let t = 0; t < len - 0.5; t += hurdles ? 6 : 2.6) {
    if (gapAt !== null && Math.abs(t - gapAt) < 3) continue
    const u = u0 + tu * t
    const v = v0 + tv * t
    if (hurdles) {
      const seg = Math.min(6, len - t)
      const [x, z] = f.at(u + (tu * seg) / 2, v + (tv * seg) / 2)
      fence(s.k, new Frame(x, z, f.ry + rot, s.G(x, z)), seg)
      continue
    }
    onGround(s, f, s.k.flat!, sphere(1.5 + r() * 0.5, 0), r() < 0.5 ? 0x45642a : 0x506e30, u, 1.0, v, { sy: 0.85, sx: 1.2, ao: 0.3, jitter: 0.14, ry: r() * 3 })
    onGround(s, f, s.k.flat!, sphere(1.0 + r() * 0.5, 0), r() < 0.5 ? 0x587a34 : 0x62843a, u + tu * 1.2, 2.1, v + tv * 1.2, { sy: 0.8, ao: 0.2, jitter: 0.14 })
  }
}

type Crop = 'wheat' | 'stubble' | 'barley' | 'oats' | 'ploughed' | 'meadow'

/**
 * A field: its soil draped over the land, the crop in raised rows (standing wheat in golden ridges,
 * barley, green oats, fresh plough), or the harvest under way: stubble with stooks of sheaves, a
 * rick going up, a wain being loaded; haystacks on the meadow. Hedged or hurdled on its long sides.
 */
function field(s: Site, x: number, z: number, ry: number, w: number, h: number, crop: Crop) {
  const r = s.rnd
  const f = on(s, x, z, ry)
  const ground = { wheat: 0x9a8656, stubble: 0xc0a868, barley: 0x9a8a5a, oats: 0x6a7a3e, ploughed: 0x5e4a34, meadow: 0x7a9a48 }[crop]
  soil(s, f, w, h, ground, 0.28)
  const seg = w / 5
  for (let v = -h / 2 + 1.4; v < h / 2 - 1; v += 1.8)
    for (let k = 0; k < 5; k++) {
      const u = -w / 2 + seg * (k + 0.5)
      if (crop === 'wheat') onGround(s, f, s.k.flat!, box(seg - 0.3, 1.1, 1.25), r() < 0.5 ? 0xd4b45a : 0xc8a64e, u, 0.8, v, { ao: 0.35, jitter: 0.1 })
      else if (crop === 'barley') onGround(s, f, s.k.flat!, box(seg - 0.3, 0.9, 1.2), r() < 0.5 ? 0xc6b468 : 0xbaa85e, u, 0.7, v, { ao: 0.35, jitter: 0.1 })
      else if (crop === 'oats') onGround(s, f, s.k.flat!, box(seg - 0.3, 0.8, 1.15), r() < 0.5 ? 0x86a046 : 0x7a9440, u, 0.65, v, { ao: 0.35, jitter: 0.1 })
      else if (crop === 'ploughed') onGround(s, f, s.k.flat!, box(seg - 0.2, 0.45, 0.95), 0x4a3a28, u, 0.45, v, { ao: 0.3 })
      else if (crop === 'stubble') onGround(s, f, s.k.flat!, box(seg - 0.2, 0.22, 0.9), 0xb09858, u, 0.4, v, { ao: 0.3 })
      else if (r() < 0.35) onGround(s, f, s.k.flat!, cone(0.4, 1.4, 3), 0x9ab85a, u + (r() - 0.5) * seg, 0.9, v)
    }
  if (crop === 'stubble') {
    // Stooks of sheaves leaning together down the rows.
    for (let v = -h / 2 + 3; v < h / 2 - 2; v += 4.5)
      for (let u = -w / 2 + 3; u < w / 2 - 2; u += 5) {
        if (r() < 0.25) continue
        onGround(s, f, s.k.flat!, cone(0.9, 2.2, 6), 0xd8bc68, u + (r() - 0.5), 1.2, v, { ao: 0.25, jitter: 0.12 })
        onGround(s, f, s.k.flat!, cyl(0.25, 0.25, 0.3, 5), 0x8a6a3a, u, 1.0, v, { ao: 0 })
      }
    // The wain being loaded at the end of the field, its horse, a heap of sheaves waiting.
    const [cx, cz] = f.at(w / 2 - 7, 0)
    cart(s.k, new Frame(cx, cz, f.ry + Math.PI / 2, s.G(cx, cz)), 'hay', r)
    const [hx, hz] = f.at(w / 2 - 7, 5.5)
    horse(s.k, new Frame(hx, hz, f.ry + Math.PI, s.G(hx, hz)), 0x6a4a2a)
    for (let i = 0; i < 6; i++) onGround(s, f, s.k.flat!, cyl(0.45, 0.6, 2.2, 6), 0xd4b866, w / 2 - 10 + (i % 3) * 0.9, 0.6 + Math.floor(i / 3) * 0.7, -3.5, { rz: 1.4, ry: i, ao: 0.2 })
  }
  if (crop === 'meadow')
    for (let i = 0; i < 3; i++) {
      const [hx, hz] = f.at((r() - 0.5) * w * 0.6, (r() - 0.5) * h * 0.6)
      haystack(s.k, new Frame(hx, hz, 0, s.G(hx, hz)), 0, 0, 0.95)
    }
  if (crop === 'wheat' && r() < 0.7) {
    // A scarecrow in the lord's colours.
    const u = (r() - 0.5) * w * 0.4
    const v = (r() - 0.5) * h * 0.3
    onGround(s, f, s.k.flat!, box(0.2, 3.4, 0.2), PAL.timber, u, 1.7, v)
    onGround(s, f, s.k.flat!, box(2.6, 0.18, 0.18), PAL.timber, u, 2.7, v)
    onGround(s, f, s.k.flat!, sphere(0.45, 0), 0xd8c49a, u, 3.6, v)
    onGround(s, f, s.k.flat!, cone(0.7, 0.6, 5), 0x6a5a3a, u, 4.1, v)
    onGround(s, f, s.k.accents, box(1.2, 1.3, 0.5), 0xffffff, u, 2.4, v)
  }
  const hurdles = r() < 0.4
  hedge(s, f, -w / 2, -h / 2 - 1, w / 2, -h / 2 - 1, w * (0.3 + r() * 0.4), hurdles)
  hedge(s, f, -w / 2, h / 2 + 1, w / 2, h / 2 + 1, null, hurdles)
}

/** A low dry-stone wall (or a fence) round a rectangle, in pieces over the land, a gap for the gate. */
function enclose(s: Site, f: Frame, w: number, h: number, kind: 'stone' | 'fence') {
  const sides: [number, number, number, number][] = [
    [-w / 2, -h / 2, w / 2, -h / 2],
    [w / 2, -h / 2, w / 2, h / 2],
    [w / 2, h / 2, -w / 2, h / 2],
    [-w / 2, h / 2, -w / 2, -h / 2],
  ]
  sides.forEach(([u0, v0, u1, v1], i) => {
    const len = Math.hypot(u1 - u0, v1 - v0)
    const tu = (u1 - u0) / len
    const tv = (v1 - v0) / len
    const rot = Math.atan2(-tv, tu)
    const step = kind === 'stone' ? 4 : 6
    for (let t = 0; t < len - 0.5; t += step) {
      const seg = Math.min(step, len - t)
      if (i === 0 && Math.abs(t + seg / 2 - len / 2) < 2.5) continue
      const [x, z] = f.at(u0 + tu * (t + seg / 2), v0 + tv * (t + seg / 2))
      const g = new Frame(x, z, f.ry + rot, s.G(x, z))
      if (kind === 'stone') g.put(s.k.walls, box(seg + 0.2, 1.4 + 2, 0.9), 0x9a9282, 0, -0.4, 0, { ao: 0.25, jitter: 0.14 })
      else fence(s.k, g, seg)
    }
  })
}

/** An orchard in rows inside a low stone wall, white box hives and straw skeps for the bees. */
function orchard(s: Site, x: number, z: number, ry: number) {
  const w = 32
  const h = 24
  const f = on(s, x, z, ry)
  soil(s, f, w, h, 0x7aa04a, 0.3)
  enclose(s, f, w, h, 'stone')
  const fruit = [0xb8302a, 0xd8b040, 0xe8a0b8][Math.floor(s.rnd() * 3)]
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const u = -12 + i * 6
      const v = -7 + j * 6.5
      onGround(s, f, s.k.walls, cyl(0.25, 0.4, 2.6, 5), 0x5b4027, u, 1.3, v)
      onGround(s, f, s.k.walls, sphere(2.2, 0), (i + j) % 2 ? 0x4f7a32 : 0x5a8638, u, 3.6, v, { sy: 0.85, ao: 0.3, jitter: 0.1 })
      for (let q = 0; q < 5; q++) {
        const a = q * 1.26 + i
        onGround(s, f, s.k.flat!, sphere(0.28, 0), fruit, u + Math.cos(a) * 1.9, 3.2 + (q % 2) * 0.9, v + Math.sin(a) * 1.9, { ao: 0 })
      }
    }
  // The bees: white box hives on a bench, straw skeps in a row.
  for (let i = 0; i < 4; i++) {
    onGround(s, f, s.k.flat!, box(1.3, 0.3, 1.3), PAL.timber, -12 + i * 2.4, 0.6, h / 2 - 2.2)
    onGround(s, f, s.k.walls, box(1.1, 1.3, 1.1), 0xeeeae0, -12 + i * 2.4, 1.4, h / 2 - 2.2)
    onGround(s, f, s.k.flat!, box(1.4, 0.25, 1.4), 0xd8d2c4, -12 + i * 2.4, 2.15, h / 2 - 2.2, { ao: 0 })
  }
  for (let i = 0; i < 3; i++) onGround(s, f, s.k.flat!, cone(0.75, 1.3, 6), 0xc8a050, 4 + i * 2, 0.9, h / 2 - 2.2)
}

function sheep(s: Site, x: number, z: number, ry: number) {
  const f = on(s, x, z, ry)
  f.put(s.k.flat!, sphere(0.95, 0), 0xe8e2d4, 0, 1.2, 0, { sx: 0.85, sz: 1.25, ao: 0.2 })
  f.put(s.k.flat!, box(0.5, 0.55, 0.7), 0x2a2420, 0, 1.45, 1.25)
  for (const [lx, lz] of [[-0.4, 0.55], [0.4, 0.55], [-0.4, -0.55], [0.4, -0.55]]) f.put(s.k.flat!, box(0.16, 0.8, 0.16), 0x2a2420, lx, 0.4, lz, { ao: 0 })
}

function cow(s: Site, x: number, z: number, ry: number) {
  const f = on(s, x, z, ry)
  const coat = [0x5a3a22, 0x2a2420, 0x8a6a48, 0xe0d8c8][Math.floor(s.rnd() * 4)]
  f.put(s.k.flat!, box(1.4, 1.3, 2.8), coat, 0, 1.75, 0)
  f.put(s.k.flat!, box(0.8, 0.8, 1.0), coat, 0, 2.0, 1.75)
  for (const sd of [-1, 1]) f.put(s.k.flat!, cone(0.1, 0.6, 4), 0xe8dcc0, sd * 0.45, 2.55, 1.7, { rz: -sd * 1.1, ao: 0 })
  for (const [lx, lz] of [[-0.5, 1], [0.5, 1], [-0.5, -1], [0.5, -1]]) f.put(s.k.flat!, box(0.28, 1.2, 0.28), coat, lx, 0.6, lz, { ao: 0.2 })
}

/** A pasture behind a fence: cattle, sheep and a pair of plough horses, a water trough, a hayrick under its roof. */
function pasture(s: Site, x: number, z: number, ry: number) {
  const w = 34
  const h = 24
  const f = on(s, x, z, ry)
  soil(s, f, w, h, 0x86ac52, 0.26)
  enclose(s, f, w, h, 'fence')
  onGround(s, f, s.k.walls, box(4, 1, 1.4), PAL.timberL, w / 2 - 5, 0.5, h / 2 - 4)
  onGround(s, f, s.k.flat!, box(3.6, 0.1, 1.0), 0x4a7a8a, w / 2 - 5, 0.98, h / 2 - 4, { ao: 0 })
  const [hx, hz] = f.at(-w / 2 + 5, h / 2 - 5)
  const hy = s.G(hx, hz)
  haystack(s.k, new Frame(hx, hz, 0, hy), 0, 0, 0.8)
  for (const [sx, sz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) new Frame(hx, hz, f.ry, hy).put(s.k.walls, box(0.25, 5.4, 0.25), PAL.timber, sx, 2.7, sz)
  new Frame(hx, hz, f.ry, hy).put(s.k.roofs, gable(6, 6, 1.6), 0x6f5a42, 0, 5.4, 0)
  for (let i = 0; i < 7; i++) {
    const [px, pz] = f.at((s.rnd() - 0.5) * (w - 8), (s.rnd() - 0.5) * (h - 8))
    sheep(s, px, pz, s.rnd() * 6.3)
  }
  for (let i = 0; i < 3; i++) {
    const [px, pz] = f.at(-6 + i * 5, -4 + (i % 2) * 5)
    cow(s, px, pz, s.rnd() * 6.3)
  }
  for (let i = 0; i < 2; i++) {
    const [px, pz] = f.at(8 + i * 3, -6)
    horse(s.k, new Frame(px, pz, f.ry + 0.4 + i * 0.3, s.G(px, pz)), [0x5a3a22, 0x8a6a48][i])
  }
}

/**
 * A tower mill: a stone footing, a whitewashed tower narrowing upward with little windows, a timber
 * gallery round it on brackets, a shingled cap turned into the wind with its tailpole down to a cart
 * wheel, flour sacks at the door, a cart, the miller's cottage. Returns where the sails turn.
 */
function towerMill(s: Site, x: number, z: number, ry: number): { at: [number, number, number]; ry: number } {
  const { k } = s
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < 8; i++) {
    const h = s.G(x + Math.cos(i * 0.785) * 6, z + Math.sin(i * 0.785) * 6)
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  const f = new Frame(x, z, ry, hi + 0.6)
  f.put(k.walls, cyl(5.6, 6, hi - lo + 4, 12), 0x8a8274, 0, -(hi - lo + 4) / 2 + 0.2, 0, { ao: 0.2 })
  f.put(k.walls, new THREE.CylinderGeometry(3.7, 4.8, 13, 12, 3), 0xdcd4c2, 0, 6.5, 0, { ao: 0.15 })
  f.put(k.walls, cyl(4.9, 5.1, 1.4, 12), 0x8a8274, 0, 0.7, 0)
  f.put(k.flat!, box(1.8, 2.8, 0.3), PAL.door, 0, 1.6, 4.7)
  f.put(k.flat!, box(2.4, 0.4, 0.5), PAL.timber, 0, 3.1, 4.75)
  for (const [yy, rot] of [[9, 0], [5.5, 0.7], [11, -0.7], [3.5, 2.6]] as const) f.sub(0, 0, rot).put(k.flat!, box(0.9, 1.3, 0.3), PAL.dark, 0, yy, 4.75 - yy * 0.087, { ao: 0 })
  f.put(k.walls, new THREE.CylinderGeometry(6.4, 6.4, 0.35, 16, 1), PAL.timberL, 0, 6.4, 0)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    f.put(k.flat!, box(0.2, 1.3, 0.2), PAL.timber, Math.cos(a) * 6.2, 7.1, Math.sin(a) * 6.2, { ao: 0 })
    f.put(k.flat!, box(0.25, 2, 0.25), PAL.timber, Math.cos(a) * 4.9, 5.4, Math.sin(a) * 4.9, { rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, ao: 0 })
  }
  f.put(k.flat!, new THREE.TorusGeometry(6.2, 0.1, 3, 24), PAL.timber, 0, 7.7, 0, { rx: Math.PI / 2, ao: 0 })
  const cap = f.sub(0, 0, 0, 13)
  cap.put(k.walls, box(6.6, 3, 6.4), PAL.timber, 0, 1.4, 0)
  cap.put(k.roofs, gable(7.4, 7.6, 3.2), 0x6f5a42, 0, 2.9, 0, { ry: Math.PI / 2 })
  cap.put(k.flat!, box(0.5, 0.5, 13), PAL.timberL, 0, -3.6, -7.4, { rx: -0.85 })
  // Flour sacks at the door, a cart, the miller's cottage with its chimney.
  for (let i = 0; i < 6; i++) f.put(k.flat!, sphere(0.7, 0), 0xe0d6bc, -2 + (i % 3) * 1.2, 0.6 + Math.floor(i / 3) * 0.9, 6.4, { sy: 0.8, ao: 0.15 })
  const [cx2, cz2] = f.at(5, 9)
  cart(k, new Frame(cx2, cz2, ry + 0.4, s.G(cx2, cz2)), 'sacks', s.rnd)
  const [hx, hz] = f.at(-13, 4)
  const hr = ry + Math.PI / 2
  new Frame(hx, hz, hr, s.G(hx, hz)).put(k.walls, box(9, 3, 7.5), STONE_D, 0, -1, 0)
  houseLite(s, new Frame(hx, hz, hr, s.G(hx, hz) + 0.4))
  const [ax, az] = cap.at(0, 3.6)
  return { at: [ax, f.y + 14.4, az], ry }
}

/** The miller's cottage: timber-framed, thatched, a chimney. */
function houseLite(s: Site, f: Frame) {
  const { k } = s
  f.put(k.walls, box(8, 3.4, 6.5), 0xe3d6b8, 0, 1.7, 0)
  for (const x of [-3.9, -1.3, 1.3, 3.9]) f.put(k.flat!, box(0.3, 3.4, 6.6), PAL.timber, x, 1.7, 0, { ao: 0 })
  f.put(k.flat!, box(8.1, 0.3, 6.6), PAL.timber, 0, 3.3, 0, { ao: 0 })
  f.put(k.flat!, box(8.1, 0.3, 6.6), PAL.timber, 0, 0.3, 0, { ao: 0 })
  for (const x of [-2.6, 2.6]) f.put(k.flat!, box(0.25, 3, 6.6), PAL.timber, x, 1.7, 0, { rz: 0.6, ao: 0 })
  f.put(k.roofs, gable(7.8, 9, 3.4), 0xb08a52, 0, 3.4, 0)
  f.put(k.flat!, box(1.1, 2.2, 0.15), PAL.door, 0, 1.1, 3.3, { ao: 0 })
  f.put(s.lamps, box(0.8, 0.8, 0.1), 0xffc46a, 2.4, 2, 3.3)
  f.put(k.walls, box(1, 3, 1), STONE_D, 3, 5.6, -1.4)
  const [x, z] = f.at(3, -1.4)
  s.smoke.push([x, f.y + 7.4, z])
}

/** A cypress: a tall, dark green spire of a tree. */
function cypress(s: Site, x: number, z: number, scale: number) {
  const f = on(s, x, z)
  f.put(s.k.walls, cyl(0.25, 0.35, 1.6, 5), 0x5b4027, 0, 0.8, 0)
  f.put(s.k.walls, cone(1.5 * scale, 8 * scale, 7), 0x2e5a2a, 0, 1.4 + 4 * scale, 0, { jitter: 0.08 })
  f.put(s.k.walls, cone(1.2 * scale, 5 * scale, 7), 0x36652f, 0, 1.4 + 5.6 * scale, 0, { jitter: 0.08 })
}

function millSails(): THREE.BufferGeometry {
  const k = newKit()
  const O = new Frame(0, 0, 0)
  O.put(k.walls, cyl(0.5, 0.5, 1.2, 6), PAL.timber, 0, 0, 0, { rx: Math.PI / 2 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const c = Math.cos(a)
    const sn = Math.sin(a)
    O.put(k.walls, box(0.4, 12.5, 0.3), PAL.timber, c * 6.2, sn * 6.2, 0.5, { rz: a - Math.PI / 2 })
    // The lattice and its sailcloth, set off to one side of each stock.
    O.put(k.walls, box(2.1, 9.6, 0.12), 0xeee4cc, c * 7 - sn * 1.2, sn * 7 + c * 1.2, 0.6, { rz: a - Math.PI / 2 })
    for (let j = 0; j < 5; j++) O.put(k.walls, box(2.2, 0.14, 0.16), PAL.timberL, c * (2.8 + j * 2.1) - sn * 1.2, sn * (2.8 + j * 2.1) + c * 1.2, 0.68, { rz: a - Math.PI / 2, ao: 0 })
  }
  return groundShade(bmerge(k.walls), 1, 0)
}

interface Built {
  group: THREE.Group
  sails: THREE.Mesh | null
  breachWall: THREE.Mesh
  breachRubble: THREE.Mesh
  flag: THREE.Mesh
  flagBase: Float32Array
  /** In the grange's own frame: chimneys and breaches. */
  smoke: [number, number, number][]
  breachAt: [number, number, number][]
}

/** One grange, its fields following the land about its levelled farmyard. */
function buildGrange(g: Grange, world: { heightAt: (x: number, z: number) => number }, accent: THREE.Material, flagMat: THREE.Material): Built {
  let seed = 0
  for (let i = 0; i < g.id.length; i++) seed = (seed * 31 + g.id.charCodeAt(i)) >>> 0
  const rnd = mulberry32(seed)
  const k = newKit()
  k.flat = []
  const base = world.heightAt(g.x, g.z)
  const c = Math.cos(g.heading)
  const sn = Math.sin(g.heading)
  const s: Site = {
    k,
    rnd,
    G: (lx, lz) => world.heightAt(g.x + lx * c + lz * sn, g.z - lx * sn + lz * c) - base,
    lamps: [],
    water: [],
    breachWall: [],
    breachRubble: [],
    breachAt: [],
    smoke: [],
  }
  const O = new Frame(0, 0, 0)

  // --- The farmyard -------------------------------------------------------------------------
  O.put(k.walls, box(WX * 2 + 3, 6, WZ * 2 + 3), 0x8a7650, 0, -2.75, 0, { ao: 0 })
  O.put(k.flat, box(40, 0.25, 9), 0x9a8f78, -1, 0.3, -2.5, { ao: 0.2 })
  for (let i = 0; i < 40; i++) O.put(k.flat, box(1 + rnd() * 0.6, 0.18, 0.8 + rnd() * 0.5), 0x857a64, -20 + rnd() * 38, 0.48, -6.5 + rnd() * 8, { ry: rnd() * 3, ao: 0.2 })
  O.put(k.flat, box(6, 0.28, WZ + 4), 0xa08e6a, 0, 0.34, WZ / 2, { ao: 0.2 })
  yardWall(k, O, rnd)
  gatehouse(k, O, s.lamps)
  titheBarn(k, O.sub(-3, -14.5, 0), rnd)
  granary(k, O.sub(25, -9, 0.08))
  dovecote(k, O.sub(-28, 4, 0), s.lamps)
  cartShed(k, O.sub(-16.5, 20, Math.PI), rnd)
  const hall = O.sub(17, 15, Math.PI + 0.05)
  manorHall(k, hall, s.lamps)
  for (const x of [-4.5, 3.5]) {
    const [hx, hz] = hall.at(x, -8.5 / 4)
    s.smoke.push([hx, 15.2, hz])
  }
  O.put(k.flat, cyl(5.4, 5.6, 0.35, 16), 0xc9b78e, 4, 0.35, 5, { ao: 0.2 })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    O.put(k.walls, cyl(0.45, 0.6, 2.2, 6), WHEAT, 4 + Math.cos(a) * 6.8, 1.1, 5 + Math.sin(a) * 6.8, { rz: Math.cos(a) * 0.2, rx: Math.sin(a) * 0.2 })
  }
  for (let i = 0; i < 6; i++) O.put(k.walls, cyl(0.4, 0.5, 1.8, 6), WHEAT, 2 + (i % 3) * 1.2, 0.9, 4 + Math.floor(i / 3) * 1.3, { rz: 1.2, ry: i, ao: 0 })
  well(k, O.sub(13, 3, 0.4))
  for (const [x, z] of [[-14.6, -1.4], [-10.4, -1.2], [2.2, -1.3], [6.8, -1.5], [-21.5, -6.5], [14.5, -6.8]]) for (let i = 0; i < 5; i++) O.put(k.walls, sphere(0.75, 0), 0xcdbf98, x + (i % 2) * 1.1, 0.9 + Math.floor(i / 2) * 0.75, z + (i % 3) * 0.3, { sy: 0.75, ry: i })
  for (let i = 0; i < 3; i++) barrel(k, O, 27 + i * 1.5, 7 + (i % 2))
  crate(k, O, 28, 0, 10.5, 1.4)
  woodpile(k, O.sub(30, 21, Math.PI / 2))
  cart(k, O.sub(-6, 10, 0.4), 'sacks', rnd)
  O.put(k.walls, box(5, 0.9, 1.2), 0x6b5232, 9.5, 0.45, 23.5)
  O.put(k.flat, box(4.6, 0.2, 0.9), 0x4f7f96, 9.5, 0.95, 23.5, { ao: 0 })
  horse(k, O.sub(8, 20.5, 0), 0x6a4a2a)
  horse(k, O.sub(11.2, 20.2, 0.2), 0x8a6a48)
  for (let i = 0; i < 9; i++) O.put(k.flat, box(0.45, 0.45, 0.6), i % 3 ? 0xd8c8a8 : 0x8a4a2a, -10 + rnd() * 26, 0.6, 2 + rnd() * 12, { ry: rnd() * 6, ao: 0 })
  O.put(k.walls, cone(3, 1.6, 7), 0x4a3a28, 30, 0.6, -22, { jitter: 0.2 })

  // --- The walled fields ----------------------------------------------------------------------
  // Cart tracks from the farmyard's gates to the gatehouses in the outer wall.
  for (const sd of [1, -1]) {
    const f = new Frame(0, sd * (OZ + WZ) / 2, 0)
    soil(s, f, 6, OZ - WZ, 0x9c8a66, 0.34)
  }
  field(s, -60, -52, 0.03, 30, 28, 'wheat')
  field(s, -22, -53, -0.02, 30, 28, 'stubble')
  field(s, 22, -53, 0.02, 28, 28, 'barley')
  field(s, 62, -52, -0.03, 26, 28, 'ploughed')
  field(s, -26, 54, 0.02, 30, 26, 'wheat')
  field(s, 26, 54, -0.03, 28, 26, 'meadow')
  field(s, 68, 50, 0.04, 22, 26, 'oats')
  orchard(s, -64, -8, Math.PI / 2)
  pasture(s, 66, 18, Math.PI / 2)
  // The rickyard: corn ricks on staddles, one half built with its ladder.
  for (const [x, z] of [[50, -18], [60, -18], [50, -6], [60, -6]]) {
    const f = on(s, x, z)
    f.put(k.walls, box(6.4, 3, 6.4), 0x9a8a66, 0, -1.4, 0, { ao: 0.2 })
    rick(k, f, 0, 0, 1)
  }
  const half = on(s, 70, -12)
  half.put(k.walls, cyl(3, 3, 2.4, 10), WHEAT, 0, 2.1, 0)
  half.put(k.flat!, box(0.3, 6, 0.3), PAL.timber, 2.6, 2.6, 0, { rz: -0.35, ao: 0 })
  half.put(k.flat!, box(0.3, 6, 0.3), PAL.timber, 3.4, 2.6, 0, { rz: -0.35, ao: 0 })
  for (let i = 0; i < 5; i++) half.put(k.flat!, box(1.0, 0.15, 0.15), PAL.timber, 3.0 + (i - 2) * -0.35, 0.8 + i, 0, { ao: 0 })
  // The pond, with reeds and a pair of ducks.
  const pond = on(s, -62, 28)
  pond.put(s.water, cyl(7, 7, 0.25, 16), 0x4f7f96, 0, 0.3, 0, { sz: 0.75 })
  pond.put(k.walls, cyl(7.8, 8.2, 2.4, 16), 0x5a6a38, 0, -0.9, 0, { sz: 0.78, ao: 0.2 })
  for (let i = 0; i < 10; i++) pond.put(k.flat!, box(0.15, 1.7, 0.15), 0x6a7a38, -7 + rnd() * 14, 1.0, -5 + rnd() * 3, { rz: (rnd() - 0.5) * 0.4, ao: 0 })
  for (const dx of [-2, 1.5]) pond.put(k.flat!, box(0.6, 0.45, 0.9), 0xf0ece0, dx, 0.6, 1, { ao: 0 })
  // The mill on the front field's rise.
  const mill = towerMill(s, -66, 54, 0.6)
  // Trees: along the outer wall, by the pond, in the corners of the yard; cypresses by the front gate.
  const trees: [number, number, number][] = [
    [-82, 66, 1.2], [82, 66, 1.1], [-84, -66, 1.2], [84, -66, 1.0], [-82, 24, 1.0], [84, 4, 1.1],
    [-52, 34, 1.0], [-72, 36, 0.9], [-31, -24, 0.9], [44, 30, 1.0], [40, -66, 1.0], [-40, 68, 0.9],
  ]
  for (const [x, z, sc] of trees) tree(k, on(s, x, z), 0, 0, rnd, sc)
  for (const sd of [-1, 1]) for (const z of [62, 70]) cypress(s, sd * 9, z, 0.95)
  outerWall(s)

  // --- Into meshes ------------------------------------------------------------------------------
  const group = new THREE.Group()
  const solid = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 3, 0.24), buildMat)
  solid.castShadow = true
  solid.receiveShadow = true
  group.add(solid)
  const flat = new THREE.Mesh(groundShade(bmerge(k.flat), 2, 0.16), buildMat)
  flat.receiveShadow = true
  group.add(flat)
  if (k.accents.length) {
    const acc = new THREE.Mesh(bmerge(k.accents), accent)
    acc.castShadow = true
    group.add(acc)
  }
  if (s.lamps.length) group.add(new THREE.Mesh(merge(s.lamps), glowMat))
  if (k.glow.length) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  if (s.water.length) group.add(new THREE.Mesh(merge(s.water), waterMat))
  const breachWall = new THREE.Mesh(groundShade(bmerge(s.breachWall), 3, 0.24), buildMat)
  breachWall.castShadow = true
  breachWall.receiveShadow = true
  group.add(breachWall)
  const breachRubble = new THREE.Mesh(groundShade(bmerge(s.breachRubble), 2, 0.2), buildMat)
  breachRubble.castShadow = true
  breachRubble.visible = false
  group.add(breachRubble)
  const sails = new THREE.Mesh(millSails(), buildMat)
  sails.castShadow = true
  sails.position.set(mill.at[0], mill.at[1], mill.at[2])
  sails.rotation.order = 'YXZ'
  sails.rotation.y = mill.ry
  group.add(sails)
  // The holder's banner on the manor tower: cloth that ripples in the wind.
  const [tx, tz] = hall.at(15 / 2 + 2.6, -0.6)
  const flagGeo = new THREE.PlaneGeometry(6, 3.6, 8, 3)
  flagGeo.translate(3, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, flagMat)
  flag.position.set(tx, 0.8 + 15 + 5.4, tz)
  flag.rotation.y = hall.ry - Math.PI / 2
  flag.castShadow = true
  group.add(flag)
  return { group, sails, breachWall, breachRubble, flag, flagBase, smoke: s.smoke, breachAt: s.breachAt }
}

interface View {
  root: THREE.Group
  built: Built
  accent: THREE.MeshStandardMaterial
  flagMat: THREE.MeshStandardMaterial
  owner: string
  breached: boolean
}

/** Draws the granges, in the colours of whoever holds each: the mill turning, the banner flying, the wall breached when battered. */
export class GrangeRenderer {
  readonly group = new THREE.Group()
  private views = new Map<string, View>()
  private engine: GameEngine

  constructor(engine: GameEngine) {
    this.engine = engine
    const world = engine.world
    for (const g of engine.state.granges ?? []) {
      const owner = engine.grangeOwner(g)
      const color = owner === 'neutral' ? NEUTRAL_CLOTH : engine.factionColor(owner)
      const accent = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, vertexColors: true }))
      const flagMat = applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }))
      const built = buildGrange(g, world, accent, flagMat)
      const root = new THREE.Group()
      root.position.set(g.x, world.heightAt(g.x, g.z), g.z)
      root.rotation.y = g.heading
      root.add(built.group)
      root.updateMatrixWorld(true)
      this.group.add(root)
      this.views.set(g.id, { root, built, accent, flagMat, owner, breached: false })
    }
  }

  /** Chimneys and breaches of one grange, in world space (for smoke and dust). */
  points(id: string): { smoke: [number, number, number][]; breach: [number, number, number][] } | null {
    const v = this.views.get(id)
    if (!v) return null
    const m = v.root.matrixWorld
    const w = (p: [number, number, number]): [number, number, number] => {
      const q = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m)
      return [q.x, q.y, q.z]
    }
    return { smoke: v.built.smoke.map(w), breach: v.breached ? v.built.breachAt.map(w) : [] }
  }

  update(time: number) {
    const engine = this.engine
    for (const g of engine.state.granges ?? []) {
      const v = this.views.get(g.id)
      if (!v) continue
      const owner = engine.grangeOwner(g)
      if (owner !== v.owner) {
        v.owner = owner
        const color = owner === 'neutral' ? NEUTRAL_CLOTH : engine.factionColor(owner)
        v.accent.color.set(color)
        v.flagMat.color.set(color)
      }
      // A battered wall comes down in places.
      const breached = g.walls < GRANGE.walls * 0.5
      if (breached !== v.breached) {
        v.breached = breached
        v.built.breachWall.visible = !breached
        v.built.breachRubble.visible = breached
      }
      // The mill turns slowly in the wind (faster in a storm); the banner ripples.
      const storm = engine.state.weather.kind === 'storm'
      if (v.built.sails) v.built.sails.rotation.z = time * (storm ? 1.4 : 0.55) + g.x * 0.01
      const pos = v.built.flag.geometry.attributes.position as THREE.BufferAttribute
      const base = v.built.flagBase
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3]
        pos.setZ(i, Math.sin(x * 0.55 - time * (storm ? 6 : 4) + g.x) * x * 0.12)
      }
      pos.needsUpdate = true
    }
  }
}
