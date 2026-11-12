import * as THREE from 'three'
import type { Castle } from '../game/types'
import { Frame, PAL, bannerPole, brazier, cart, crate, barrel, gable, hip, house, newKit, tent, tree, type Kit } from './buildings'
import { bmerge, box, cone, cyl, groundShade, sphere } from './geo'
import { applyVision } from './vision'
import { buildMat } from './villages'

/**
 * The royal city's own strongholds (The Long Night): the gatehouses that close the gaps in its
 * walls, and its wards, each with a landmark of its own (the cathedral, the barracks, the market,
 * the smiths' quarter, the granaries). Built in world units, local +x pointing out from the city
 * centre; merged into a few meshes like the villages.
 */
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa04a })
const ROOT = new Frame(0, 0, 0)
const ST = 0xb3ab9b

export function buildWard(c: Castle, rnd: () => number, color: string): { group: THREE.Group; roofMat: THREE.MeshStandardMaterial; flag: THREE.Mesh; flagBase: Float32Array } {
  const k = newKit()
  let flagAt: [number, number, number]
  if (c.gate) flagAt = gatehouse(k, rnd)
  else if (c.id.includes('cathedral')) flagAt = cathedral(k, rnd)
  else if (c.id.includes('barracks')) flagAt = barracks(k, rnd)
  else if (c.id.includes('market')) flagAt = market(k, rnd)
  else if (c.id.includes('smiths')) flagAt = smiths(k, rnd)
  else flagAt = granary(k, rnd)

  const group = new THREE.Group()
  const mesh = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 4, 0.22), buildMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  const roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, vertexColors: true }))
  if (k.accents.length) {
    const acc = new THREE.Mesh(bmerge(k.accents), roofMat)
    acc.castShadow = true
    group.add(acc)
  }
  if (k.glow.length) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  const flagGeo = new THREE.PlaneGeometry(9, 5.4, 6, 2)
  flagGeo.translate(4.5, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
  flag.position.set(flagAt[0], flagAt[1], flagAt[2])
  const pk = newKit()
  ROOT.put(pk.walls, cyl(0.3, 0.35, 9, 6), PAL.timber, flagAt[0], flagAt[1] - 1.5, flagAt[2])
  group.add(new THREE.Mesh(bmerge(pk.walls), buildMat))
  group.add(flag)
  return { group, roofMat, flag, flagBase }
}

/** Crenellations along a run (local x from x0 to x1 at height y, at z). */
function merlons(k: Kit, f: Frame, x0: number, x1: number, y: number, z: number, along: 'x' | 'z' = 'x') {
  for (let t = x0; t <= x1; t += 3.2) f.put(k.walls, box(1.8, 2.2, 1.4), PAL.stoneD, along === 'x' ? t : z, y + 1.1, along === 'x' ? z : t, { ao: 0 })
}

/**
 * A gatehouse filling the gap in the city wall: two great drum towers, the curtain run in to the
 * gate passage, an arch with the portcullis half raised, braziers and the owner's banners.
 */
function gatehouse(k: Kit, rnd: () => number): [number, number, number] {
  const H = 24
  // The road through, paved.
  ROOT.put(k.walls, box(150, 0.5, 22), 0x9a8c72, 0, 0.1, 0, { ao: 0 })
  for (const s of [-1, 1]) {
    // A drum tower at each end of the gap.
    const tz = s * 50
    ROOT.put(k.walls, cyl(11, 12.5, H + 14, 12), ST, 0, (H + 14) / 2 - 1, tz)
    ROOT.put(k.walls, cyl(12.4, 12.4, 1.2, 12), PAL.stoneL, 0, H + 12.6, tz, { ao: 0 })
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      ROOT.put(k.walls, box(2.4, 2.4, 1.6), PAL.stoneD, Math.cos(a) * 11.6, H + 14.4, tz + Math.sin(a) * 11.6, { ry: -a, ao: 0 })
    }
    ROOT.put(k.roofs, cone(12, 12, 12), PAL.slate[0], 0, H + 21, tz, { ao: 0 })
    for (const y of [10, 20]) ROOT.put(k.walls, box(0.4, 2.6, 1), PAL.dark, 11.9, y, tz, { ao: 0 })
    // The owner's long banner down the tower's face.
    ROOT.put(k.accents, box(0.3, 12, 5), 0xffffff, 12.8, H - 2, tz)
    // Curtain from the tower in to the passage.
    ROOT.put(k.walls, box(9, H, 28), ST, 0, H / 2 - 1, s * 26)
    merlons(k, ROOT, s * 13 - 1, s * 39 + 1, H - 0.5, 4.2, 'z')
    merlons(k, ROOT, s * 13 - 1, s * 39 + 1, H - 0.5, -4.2, 'z')
    // The arch's piers, and braziers burning on the tower tops.
    ROOT.put(k.walls, box(16, H + 6, 5), PAL.stoneL, 0, (H + 6) / 2 - 1, s * 11)
    brazier(k, ROOT, 6, H + 13, tz + 6)
    brazier(k, ROOT, -6, H + 13, tz - 6)
  }
  // The gate block over the passage, its arch, the portcullis half up.
  ROOT.put(k.walls, box(16, 9, 27), ST, 0, H + 5.5, 0)
  merlons(k, ROOT, -12, 12, H + 10, 7.4, 'z')
  merlons(k, ROOT, -12, 12, H + 10, -7.4, 'z')
  ROOT.put(k.walls, box(0.8, 12, 17), PAL.dark, 8.3, H - 4, 0, { ao: 0 })
  for (let i = -3; i <= 3; i++) ROOT.put(k.walls, box(0.5, 10, 0.5), PAL.iron, 8.9, H - 5, i * 2.4, { ao: 0 })
  ROOT.put(k.accents, box(0.3, 6, 9), 0xffffff, 8.6, H + 5, 0)
  void rnd
  return [0, H + 16, 0]
}

/** The great cathedral: nave and aisles, transept, apse, twin west towers with spires, a close round it. */
function cathedral(k: Kit, rnd: () => number): [number, number, number] {
  const f = ROOT
  f.put(k.walls, box(120, 0.5, 80), 0xb5a88c, 0, 0.1, 0, { ao: 0 })
  const L = 72
  const W = 22
  f.put(k.walls, box(L, 24, W), PAL.stoneL, 0, 12, 0)
  f.put(k.roofs, gable(W + 2, L + 2, 12), PAL.slate[0], 0, 24, 0)
  // Aisles with their lean-to roofs, buttresses and flying arches.
  for (const s of [-1, 1]) {
    f.put(k.walls, box(L - 6, 13, 8), PAL.stone, 2, 6.5, s * (W / 2 + 4))
    f.put(k.roofs, box(L - 6, 1, 9), PAL.slate[1], 2, 13.6, s * (W / 2 + 4), { rx: s * 0.35 })
    for (let x = -L / 2 + 6; x <= L / 2 - 2; x += 8) {
      f.put(k.walls, box(2.2, 16, 2.2), PAL.stone, x, 8, s * (W / 2 + 9))
      f.put(k.walls, box(1.4, 1.4, 9), PAL.stone, x, 18, s * (W / 2 + 4.5), { rx: s * 0.5 })
      f.put(k.walls, box(2.4, 6.5, 0.2), 0x3a4a6a, x + 4, 17, s * (W / 2 + 0.1), { ao: 0 })
    }
  }
  // Transept across, and the round apse at the east end.
  f.put(k.walls, box(18, 22, 58), PAL.stoneL, 14, 11, 0)
  f.put(k.roofs, gable(20, 60, 10), PAL.slate[0], 14, 22, 0, { ry: Math.PI / 2 })
  f.put(k.walls, cyl(11, 11, 20, 10), PAL.stoneL, L / 2 + 2, 10, 0)
  f.put(k.roofs, cone(12, 10, 10), PAL.slate[1], L / 2 + 2, 25, 0)
  // A crossing tower with a lantern.
  f.put(k.walls, box(14, 14, 14), PAL.stone, 14, 31, 0)
  f.put(k.roofs, cone(10, 16, 4), PAL.slate[2], 14, 46, 0, { ry: Math.PI / 4 })
  // The west front: twin towers, spires, the great door and the rose window.
  for (const s of [-1, 1]) {
    f.put(k.walls, box(14, 52, 14), PAL.stoneL, -L / 2 - 6, 26, s * 12)
    f.put(k.walls, box(15, 1.4, 15), PAL.stone, -L / 2 - 6, 40, s * 12, { ao: 0 })
    f.put(k.roofs, cone(9.5, 30, 8), PAL.slate[0], -L / 2 - 6, 67, s * 12)
    f.put(k.walls, cyl(0.2, 0.2, 4, 4), PAL.iron, -L / 2 - 6, 83, s * 12, { ao: 0 })
    for (const y of [16, 30, 45]) f.put(k.walls, box(0.2, 5, 2), PAL.dark, -L / 2 - 13.1, y, s * 12, { ao: 0 })
  }
  f.put(k.walls, box(0.3, 14, 8), PAL.dark, -L / 2 - 13.2, 7, 0, { ao: 0 })
  f.put(k.walls, cyl(4.5, 4.5, 0.4, 16), 0x6a3a5a, -L / 2 - 13.1, 22, 0, { rz: Math.PI / 2, ao: 0 })
  f.put(k.accents, box(0.3, 9, 4), 0xffffff, -L / 2 - 13.4, 33, 0)
  // The close: canons' houses round the precinct.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    house(k, ROOT.sub(Math.cos(a) * 54, Math.sin(a) * 34, -a + Math.PI / 2), { w: 9, d: 7, storeys: 2, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
  }
  for (const [x, z] of [[-60, 30], [-60, -30]]) brazier(k, ROOT, x, 0, z)
  return [-L / 2 - 6, 88, -12]
}

/** The Royal Barracks: long halls round a drill yard, a square keep, weapon racks and stables. */
function barracks(k: Kit, rnd: () => number): [number, number, number] {
  const f = ROOT
  f.put(k.walls, box(96, 0.5, 96), 0x9c8e70, 0, 0.1, 0, { ao: 0 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const hf = ROOT.sub(Math.cos(a) * 34, Math.sin(a) * 34, -a + Math.PI / 2)
    hf.put(k.walls, box(48, 9, 12), PAL.stone, 0, 4.5, 0)
    hf.put(k.roofs, gable(13.5, 49, 5), PAL.tile[i % 3], 0, 9, 0)
    for (let x = -20; x <= 20; x += 6) hf.put(k.walls, box(1.6, 2.2, 0.2), PAL.dark, x, 5, 6.05, { ao: 0 })
    hf.put(k.accents, box(3, 4, 0.2), 0xffffff, 0, 6, 6.2)
  }
  // The keep at one corner, crenellated.
  f.put(k.walls, box(16, 30, 16), ST, 38, 15, 38)
  for (const s of [-1, 1]) {
    merlons(k, ROOT, 31, 45, 30, 38 + s * 7.2)
    merlons(k, ROOT, 31, 45, 30, 38 + s * 7.2, 'z')
  }
  // Weapon racks and practice posts in the yard.
  for (let i = 0; i < 6; i++) {
    f.put(k.walls, box(5, 2.4, 0.4), PAL.timber, -12 + i * 5, 1.2, -10, { ao: 0 })
    for (let j = 0; j < 4; j++) f.put(k.walls, cyl(0.08, 0.08, 3.6, 4), PAL.iron, -14 + i * 5 + j, 2.2, -10, { ao: 0 })
    f.put(k.walls, cyl(0.35, 0.35, 3, 6), PAL.timberL, -12 + i * 5, 1.5, 10, { ao: 0 })
  }
  for (const [x, z] of [[-20, 0], [20, 0]]) brazier(k, ROOT, x, 0, z)
  bannerPole(k, ROOT, 0, 0, 12)
  void rnd
  return [38, 38, 38]
}

/** The Market Ward: a great square of stalls, a market cross, the guildhall and its clock tower. */
function market(k: Kit, rnd: () => number): [number, number, number] {
  const f = ROOT
  f.put(k.walls, box(100, 0.5, 100), 0xb0a080, 0, 0.1, 0, { ao: 0 })
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue
      if (rnd() < 0.15) continue
      const sf = ROOT.sub(i * 13, j * 13, rnd() < 0.5 ? 0 : Math.PI / 2)
      sf.put(k.walls, box(5, 1.2, 3), PAL.timberL, 0, 0.6, 0)
      for (const [x, z] of [[-2.3, -1.4], [2.3, -1.4], [-2.3, 1.4], [2.3, 1.4]]) sf.put(k.walls, box(0.25, 3.2, 0.25), PAL.timber, x, 1.6, z, { ao: 0 })
      sf.put(k.accents, box(5.6, 0.25, 3.6), 0xffffff, 0, 3.3, 0, { rx: 0.15 })
      if (rnd() < 0.5) crate(k, sf, 0, 1.2, 1.6)
      else barrel(k, sf, 0, 1.6)
    }
  // The market cross.
  f.put(k.walls, cyl(3, 3.6, 1.2, 8), PAL.stoneL, 0, 0.6, 0)
  f.put(k.walls, box(1, 9, 1), PAL.stone, 0, 5, 0)
  f.put(k.walls, box(4, 1, 1), PAL.stone, 0, 7.5, 0)
  // The guildhall, its clock tower above the square.
  const g = ROOT.sub(0, -44, 0)
  g.put(k.walls, box(40, 14, 16), PAL.plaster[3], 0, 7, 0)
  g.put(k.roofs, hip(17, 41, 7), PAL.tile[0], 0, 14, 0)
  for (let x = -16; x <= 16; x += 4) g.put(k.walls, box(1.4, 3, 0.2), PAL.dark, x, 9, 8.05, { ao: 0 })
  g.put(k.walls, box(9, 34, 9), PAL.stoneL, 0, 17, 0)
  g.put(k.walls, cyl(3, 3, 0.3, 16), 0xe8dcc0, 0, 26, 4.6, { rx: Math.PI / 2, ao: 0 })
  g.put(k.roofs, cone(7, 12, 4), PAL.slate[0], 0, 40, 0, { ry: Math.PI / 4 })
  for (let i = 0; i < 6; i++) house(k, ROOT.sub(-40 + i * 16, 46, 0), { w: 10, d: 8, storeys: 2, roof: 'tile', style: 'plaster', detail: 'mid', banner: true }, rnd)
  return [0, 52, -44]
}

/** The Smiths' Ward: forges with their chimneys and glowing hearths, anvils, coal and iron stock. */
function smiths(k: Kit, rnd: () => number): [number, number, number] {
  const f = ROOT
  f.put(k.walls, box(96, 0.5, 96), 0x7a6e5a, 0, 0.1, 0, { ao: 0 })
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const hf = ROOT.sub(Math.cos(a) * 32, Math.sin(a) * 32, -a + Math.PI / 2)
    house(k, hf, { w: 12, d: 9, storeys: 1, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
    hf.put(k.walls, box(2.4, 14, 2.4), PAL.soot, 4, 7, 0)
    hf.put(k.glow, box(3, 2, 0.4), 0xff6a2a, 0, 1.6, 4.7)
  }
  // The great forge in the middle: a hall with three chimneys.
  f.put(k.walls, box(30, 12, 18), PAL.stoneD, 0, 6, 0)
  f.put(k.roofs, gable(19, 31, 6), PAL.slate[2], 0, 12, 0)
  for (const x of [-10, 0, 10]) f.put(k.walls, box(3, 26, 3), PAL.soot, x, 13, 0)
  f.put(k.glow, box(12, 4, 0.5), 0xff5a1a, 0, 3, 9.1)
  for (let i = 0; i < 6; i++) {
    const sf = ROOT.sub(-18 + i * 7, 18, 0)
    sf.put(k.walls, box(1.6, 1.2, 0.8), PAL.iron, 0, 1.4, 0)
    if (i % 2) barrel(k, sf, 2, 0)
  }
  cart(k, ROOT.sub(22, -18, 0.6), 'barrels', rnd)
  return [0, 30, 0]
}

/** The Granary Ward: great barns and round silos, carts and the stores of a long siege. */
function granary(k: Kit, rnd: () => number): [number, number, number] {
  const f = ROOT
  f.put(k.walls, box(96, 0.5, 96), 0xa08e64, 0, 0.1, 0, { ao: 0 })
  for (let i = 0; i < 3; i++) {
    const bf = ROOT.sub(-28 + i * 28, -14, 0)
    bf.put(k.walls, box(22, 12, 34), PAL.timberL, 0, 6, 0)
    bf.put(k.roofs, gable(24, 35, 9), PAL.thatch[i % 3], 0, 12, 0, { ry: Math.PI / 2 })
    bf.put(k.walls, box(0.2, 7, 6), PAL.dark, 11.05, 3.5, 0, { ao: 0 })
  }
  for (let i = 0; i < 4; i++) {
    f.put(k.walls, cyl(5, 5.5, 18, 10), PAL.stoneL, -30 + i * 20, 9, 26)
    f.put(k.roofs, cone(6, 6, 10), PAL.tile[i % 3], -30 + i * 20, 21, 26)
  }
  for (let i = 0; i < 4; i++) cart(k, ROOT.sub(-30 + i * 18, 10, rnd() * 3), i % 2 ? 'sacks' : 'hay', rnd)
  tent(k, ROOT, 36, 10, 4.5)
  return [-30, 32, 26]
}

/**
 * The Sovereign's Citadel crowning the royal city (The Long Night): a curtain of great drum towers
 * on the summit of the mount, four gatehouses on the cardinal roads, and within, the Great Keep
 * with its corner turrets and spired crown, the palace with its gilded dome, the great hall with
 * its lit windows, the royal chapel's spire, four beacon towers ablaze, a grand stair to the keep's
 * forebuilding, and gardens. Built in world units round the citadel's centre (not rotated: the
 * curtain's gates lie on the map's axes, where the engine's castle gates are).
 */
export function buildRoyalCitadel(c: Castle, rnd: () => number, color: string, wallR: number, gateHalf: number): { group: THREE.Group; roofMat: THREE.MeshStandardMaterial; flag: THREE.Mesh; flagBase: Float32Array } {
  const k = newKit()
  const windows: THREE.BufferGeometry[] = []
  const f = ROOT
  const SL = PAL.slate
  const GOLD = 0xd9b04a
  const WH = 30
  // The bailey: paving over the summit.
  f.put(k.walls, cyl(wallR + 8, wallR + 12, 3, 32), 0x8a8273, 0, -1.2, 0, { ao: 0 })
  // --- The curtain and its towers ---
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * wallR
    const z = Math.sin(a) * wallR
    if (Math.abs(x) < gateHalf + 8 || Math.abs(z) < gateHalf + 8) continue
    const L = (Math.PI * 2 * wallR) / n + 1
    const sf = new Frame(x, z, -a + Math.PI / 2, 0)
    sf.put(k.walls, box(L, 8, 16), PAL.stoneD, 0, 1, -1.5, { ao: 0.15 })
    sf.put(k.walls, box(L, WH, 10), PAL.stoneL, 0, WH / 2, 0, { ao: 0.2, jitter: 0.04 })
    for (let t = -L / 2 + 1; t < L / 2; t += 2.6) sf.put(k.walls, box(0.9, 1.8, 2), PAL.stoneD, t, WH - 0.9, -6, { ao: 0 })
    sf.put(k.walls, box(L, 1.1, 2.6), PAL.stoneL, 0, WH + 0.2, -6.3, { ao: 0 })
    for (let t = -L / 2 + 1.5; t < L / 2; t += 3.2) sf.put(k.walls, box(1.9, 2.4, 1.5), PAL.stoneL, t, WH + 1.9, -6.6, { ao: 0 })
    sf.put(k.walls, box(0.6, 3.6, 0.25), PAL.dark, 0, WH * 0.6, -5.1, { ao: 0 })
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    const x = Math.cos(a) * wallR
    const z = Math.sin(a) * wallR
    f.put(k.walls, cyl(11, 13, 12, 14), PAL.stoneD, x, 2, z, { ao: 0.15 })
    f.put(k.walls, cyl(10, 11, WH + 16, 14), PAL.stoneL, x, (WH + 16) / 2, z, { ao: 0.2 })
    for (let j = 0; j < 12; j++) {
      const b = (j / 12) * Math.PI * 2
      f.put(k.walls, box(1.3, 1.6, 1.3), PAL.stoneD, x + Math.cos(b) * 10.6, WH + 15.2, z + Math.sin(b) * 10.6, { ao: 0 })
    }
    f.put(k.walls, cyl(11.4, 11.4, 1, 14), PAL.stoneL, x, WH + 16.4, z, { ao: 0 })
    f.put(k.roofs, cone(12, 18, 14), SL[i % 3], x, WH + 26, z)
    f.put(k.walls, sphere(1, 0), GOLD, x, WH + 35.6, z, { ao: 0 })
    for (const y of [12, 24]) f.put(windows, box(0.8, 2.4, 0.8), 0xffc46a, x + Math.cos(a) * 10.4, y, z + Math.sin(a) * 10.4)
  }
  // Four gatehouses on the cardinal roads.
  for (let q = 0; q < 4; q++) {
    const gf = new Frame(0, 0, (-q * Math.PI) / 2, 0).sub(wallR, 0, 0)
    for (const s of [-1, 1]) {
      gf.put(k.walls, cyl(9, 10, WH + 12, 12), PAL.stoneL, 0, (WH + 12) / 2, s * (gateHalf + 9))
      gf.put(k.roofs, cone(10, 14, 12), SL[0], 0, WH + 19, s * (gateHalf + 9))
      gf.put(k.accents, box(0.3, 12, 5), 0xffffff, 9.6, WH - 2, s * (gateHalf + 9))
    }
    gf.put(k.walls, box(14, 10, gateHalf * 2 + 4), PAL.stone, 0, WH + 1, 0)
    for (let t = -gateHalf; t <= gateHalf; t += 3.2) gf.put(k.walls, box(1.6, 2.2, 1.4), PAL.stoneL, 7, WH + 7, t, { ao: 0 })
    gf.put(k.walls, box(0.8, 14, gateHalf * 2 - 4), PAL.dark, 7.2, WH - 8, 0, { ao: 0 })
    gf.put(k.accents, box(0.3, 7, 10), 0xffffff, 7.6, WH + 2, 0)
  }

  // --- The grand stair and forebuilding (from the south road up to the keep) ---
  for (let i = 0; i < 10; i++) f.put(k.walls, box(30 - i, 1.6, 6), PAL.stoneL, 0, 0.8 + i * 1.6, 120 - i * 6, { ao: 0.05 })
  f.put(k.walls, box(26, 22, 18), PAL.stone, 0, 11, 56, { ao: 0.2 })
  f.put(k.roofs, gable(19, 27, 7), SL[1], 0, 22, 56, { ry: Math.PI / 2 })
  f.put(k.walls, box(10, 12, 0.4), PAL.dark, 0, 7, 65.2, { ao: 0 })
  for (const s of [-1, 1]) f.put(k.walls, cyl(4, 4.4, 30, 10), PAL.stoneL, s * 13, 15, 64)

  // --- The Great Keep: battered base, corner turrets, a corbelled crown and a spired upper stage ---
  const KW = 46
  const KH = 72
  f.put(k.walls, box(KW + 8, 12, KW + 8), PAL.stoneD, 0, 2, 0, { ao: 0.2 })
  f.put(k.walls, box(KW, KH, KW), 0xb7af9f, 0, KH / 2, 0, { ao: 0.25, jitter: 0.03 })
  for (const y of [18, 34, 50]) f.put(k.walls, box(KW + 1, 1, KW + 1), PAL.stoneL, 0, y, 0, { ao: 0 })
  for (let s = 0; s < 4; s++) {
    const sf = new Frame(0, 0, (s * Math.PI) / 2, 0)
    for (const y of [24, 40, 56]) for (const x of [-12, 0, 12]) sf.put(windows, box(2.2, 4.6, 0.3), 0xffc46a, x, y, KW / 2 + 0.1)
    sf.put(k.walls, box(6, KH * 0.8, 3), PAL.stone, 0, KH * 0.4, KW / 2 + 1.2, { ao: 0.1 })
    for (let t = -KW / 2; t <= KW / 2; t += 2.8) {
      sf.put(k.walls, box(1.2, 2, 2), PAL.stoneD, t, KH - 1, KW / 2 + 1, { ao: 0 })
      sf.put(k.walls, box(1.8, 2.6, 1.6), PAL.stoneL, t, KH + 2.6, KW / 2 + 1.6, { ao: 0 })
    }
    sf.put(k.accents, box(7, 22, 0.4), 0xffffff, 0, KH - 16, KW / 2 + 2.9)
  }
  f.put(k.walls, box(KW + 4, 1.4, KW + 4), PAL.stoneL, 0, KH + 0.7, 0, { ao: 0 })
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    f.put(k.walls, cyl(6.5, 7, KH + 18, 12), PAL.stoneL, x * KW * 0.5, (KH + 18) / 2, z * KW * 0.5, { ao: 0.15 })
    f.put(k.roofs, cone(7.5, 22, 12), SL[2], x * KW * 0.5, KH + 29, z * KW * 0.5)
    f.put(k.walls, sphere(0.9, 0), GOLD, x * KW * 0.5, KH + 40.5, z * KW * 0.5, { ao: 0 })
  }
  // The upper stage and its spire: the highest point in the land.
  f.put(k.walls, box(28, 26, 28), PAL.stoneL, 0, KH + 13, 0, { ao: 0.2 })
  for (let s = 0; s < 4; s++) new Frame(0, 0, (s * Math.PI) / 2, 0).put(windows, box(3, 6, 0.3), 0xffc46a, 0, KH + 14, 14.1)
  f.put(k.roofs, cone(21, 44, 4), SL[0], 0, KH + 48, 0, { ry: Math.PI / 4 })
  f.put(k.walls, cyl(0.3, 0.3, 10, 6), GOLD, 0, KH + 75, 0, { ao: 0 })
  f.put(k.walls, sphere(1.6, 0), GOLD, 0, KH + 71, 0, { ao: 0 })

  // --- The palace and its gilded dome (east) ---
  const pf = new Frame(78, -10, 0, 0)
  pf.put(k.walls, box(56, 26, 40), 0xc9bfa9, 0, 13, 0, { ao: 0.2 })
  pf.put(k.roofs, hip(42, 58, 10), SL[1], 0, 26, 0)
  for (const x of [-20, -10, 0, 10, 20]) for (const y of [8, 18]) pf.put(windows, box(2.4, 4.4, 0.3), 0xffc46a, x, y, 20.1)
  for (const x of [-26, 26]) pf.put(k.walls, box(3, 28, 3), PAL.stoneL, x, 14, 20.5, { ao: 0.1 })
  pf.put(k.walls, cyl(15, 15, 14, 20), PAL.stoneL, 0, 37, 0, { ao: 0.15 })
  for (let j = 0; j < 12; j++) pf.put(windows, box(1.4, 4, 0.3), 0xffc46a, Math.cos((j / 12) * 6.28) * 15.1, 37, Math.sin((j / 12) * 6.28) * 15.1, { ry: -(j / 12) * 6.28 + Math.PI / 2 })
  pf.put(k.walls, sphere(15.5, 1), GOLD, 0, 44, 0, { sy: 0.95, ao: 0 })
  pf.put(k.walls, cyl(2.4, 2.8, 6, 10), PAL.stoneL, 0, 60, 0, { ao: 0 })
  pf.put(k.walls, cone(2.8, 6, 10), GOLD, 0, 66, 0, { ao: 0 })
  pf.put(k.walls, sphere(1, 0), GOLD, 0, 70, 0, { ao: 0 })

  // --- The great hall (north), its tall windows lit ---
  const hf = new Frame(0, -86, 0, 0)
  hf.put(k.walls, box(90, 30, 28), 0xbdb5a5, 0, 15, 0, { ao: 0.2 })
  hf.put(k.roofs, gable(30, 92, 16), SL[0], 0, 30, 0)
  for (let x = -40; x <= 40; x += 10) {
    for (const s of [-1, 1]) {
      hf.put(k.walls, box(3, 26, 4), PAL.stone, x, 13, s * 15.5, { ao: 0.1 })
      hf.put(k.walls, box(2.4, 2.6, 2.6), PAL.stoneD, x, 27, s * 14.8, { rx: s * 0.6, ao: 0 })
    }
    if (x < 40) for (const s of [-1, 1]) hf.put(windows, box(3, 12, 0.3), 0xffc46a, x + 5, 16, s * 14.1)
  }
  hf.put(k.walls, cyl(7, 7, 0.4, 16), 0x6a3a5a, -45.2, 22, 0, { rz: Math.PI / 2, ao: 0 })

  // --- The royal chapel and its spire (west) ---
  const cf = new Frame(-84, 18, 0, 0)
  cf.put(k.walls, box(40, 26, 18), PAL.stoneL, 0, 13, 0, { ao: 0.2 })
  cf.put(k.roofs, gable(20, 42, 12), SL[2], 0, 26, 0)
  cf.put(k.walls, box(14, 52, 14), PAL.stoneL, -24, 26, 0, { ao: 0.2 })
  cf.put(k.roofs, cone(10, 52, 8), SL[0], -24, 78, 0)
  cf.put(k.walls, sphere(0.9, 0), GOLD, -24, 105, 0, { ao: 0 })
  for (const x of [-10, 0, 10]) for (const s of [-1, 1]) cf.put(windows, box(2.4, 9, 0.3), 0xffc46a, x, 14, s * 9.1)

  // --- Four beacon towers ablaze ---
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const x = Math.cos(a) * wallR * 0.66
    const z = Math.sin(a) * wallR * 0.66
    f.put(k.walls, cyl(4.5, 6, 64, 10), PAL.stoneL, x, 32, z, { ao: 0.2 })
    f.put(k.walls, cyl(7, 5, 3, 10), PAL.iron, x, 65.5, z, { ao: 0 })
    f.put(k.glow, cone(5.5, 11, 8), 0xff8a3a, x, 72, z)
    f.put(k.glow, cone(3, 7, 6), 0xffd27a, x, 74, z)
  }
  // Gardens: trees round the bailey.
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2
    const r = wallR * (0.62 + rnd() * 0.22)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(x) < 24 || Math.abs(z) < 24) continue
    tree(k, ROOT, x, z, rnd, 1.5)
  }

  const group = new THREE.Group()
  const mesh = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 6, 0.25), buildMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  const roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, vertexColors: true }))
  if (k.accents.length) {
    const acc = new THREE.Mesh(bmerge(k.accents), roofMat)
    acc.castShadow = true
    group.add(acc)
  }
  if (k.glow.length) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  if (windows.length) group.add(new THREE.Mesh(bmerge(windows), new THREE.MeshBasicMaterial({ color: 0xffc46a })))
  // The royal standard over the keep's spire.
  const flagGeo = new THREE.PlaneGeometry(16, 9.6, 8, 2)
  flagGeo.translate(8, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
  flag.position.set(0, KH + 78, 0)
  group.add(flag)
  void c
  return { group, roofMat, flag, flagBase }
}
