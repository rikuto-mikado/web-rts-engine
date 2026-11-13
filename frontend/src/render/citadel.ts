import * as THREE from 'three'
import type { Castle } from '../game/types'
import { Frame, PAL, bannerPole, brazier, cart, crate, barrel, gable, hip, house, newKit, tent, tree, well, type Kit } from './buildings'
import { ROYAL_SEAT_TIER, WARD_RING, castleRadius, type WardKind, type World } from '../game/world'
import { bmerge, bpart, box, cone, cyl, groundShade, sphere } from './geo'
import { applyVision } from './vision'
import { circleHitsRect, coursedCone, mottle, rectsOverlap, type Taken } from './fortress'
import { royalPrecinct } from './precinct'
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

export function buildWard(c: Castle, rnd: () => number, color: string): { group: THREE.Group; roofMat: THREE.MeshStandardMaterial; flag: THREE.Mesh; flagBase: Float32Array; smoke: [number, number, number][] } {
  const k = newKit()
  k.flat = []
  const smoke: [number, number, number][] = []
  let flagAt: [number, number, number]
  // Each ward's landmark, then the life round it (its footprint keeps the rest off it).
  if (c.gate) {
    flagAt = gatehouse(k, rnd)
    gateSquare(k, rnd, smoke)
  } else if (c.id.includes('cathedral')) {
    flagAt = cathedral(k, rnd)
    // (The close is its own ring of canons' houses: no second ring round it.)
    wardLife(k, rnd, smoke, [[0, 0, 50, 30], [-40, 0, 14, 22], ...CANONS.map(([x, z, ry]) => [x, z, 4.7, 3.7, ry] as [number, number, number, number, number])], 'close')
  } else if (c.id.includes('barracks')) {
    flagAt = barracks(k, rnd)
    wardLife(k, rnd, smoke, [[0, 0, 47, 47]], 'garrison')
  } else if (c.id.includes('market')) {
    flagAt = market(k, rnd)
    wardLife(k, rnd, smoke, [[0, 0, 36, 36], [0, -44, 21, 10], [0, 46, 46, 6]], 'market')
  } else if (c.id.includes('smiths')) {
    flagAt = smiths(k, rnd)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      smoke.push([Math.cos(a) * 32, 14, Math.sin(a) * 32])
    }
    for (const x of [-10, 0, 10]) smoke.push([x, 26.5, 0])
    wardLife(k, rnd, smoke, [[0, 0, 42, 42]], 'smiths')
  } else {
    flagAt = granary(k, rnd)
    wardLife(k, rnd, smoke, [[0, -14, 42, 18], [0, 26, 37, 7]], 'granary')
  }

  const group = new THREE.Group()
  const mesh = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 4, 0.22), buildMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  group.add(flatMesh(k))
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
  return { group, roofMat, flag, flagBase, smoke }
}

/**
 * The life of a ward round its landmark: the plaza paved in setts with a border of flagstones,
 * ringed by town houses and shops wall to wall facing in, stalls under awnings, carts, crates and
 * barrels, wells, trees and braziers. `keep` lists the landmark's footprint (x, z, half w, half d).
 */
function wardLife(k: Kit, rnd: () => number, smoke: [number, number, number][], keep: ([number, number, number, number] | [number, number, number, number, number])[], kind: WardKind) {
  const taken: Taken[] = keep.map(([x, z, hw, hd, ry]) => ({ x, z, r: Math.hypot(hw, hd), hw, hd, ry: ry ?? 0 }))
  // Everything is laid out from the ring of houses (WARD_RING; the city keeps clear to wardReach).
  const RING = WARD_RING[kind]
  const OUT = RING || 55
  const free = (x: number, z: number, hw: number, hd: number, ry: number) => {
    const me: Taken = { x, z, r: Math.hypot(hw, hd), hw, hd, ry }
    return taken.every((t) => (Math.hypot(t.x - x, t.z - z) > t.r + me.r ? true : t.hw !== undefined ? !rectsOverlap(me, t) : !circleHitsRect(t.x, t.z, t.r, me)))
  }
  // The plaza: setts in rings, a flagstone border.
  for (let ring = 0; ring < (RING ? 3 : 0); ring++) {
    const r = RING - 18 + ring * 8
    const n = 40 + ring * 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const L = 2 * r * Math.sin(Math.PI / n) + 0.3
      ROOT.put(k.flat!, box(L, 0.2, 7.6), (i + ring) % 2 ? 0xa89c86 : 0x9a8f7a, Math.cos(a) * r, 0.42, Math.sin(a) * r, { ry: -a + Math.PI / 2, ao: 0 })
    }
  }
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2
    const r = OUT + 5.5
    ROOT.put(k.flat!, box(2 * r * Math.sin(Math.PI / 64) + 0.2, 0.35, 1.2), PAL.stoneD, Math.cos(a) * r, 0.45, Math.sin(a) * r, { ry: -a + Math.PI / 2, ao: 0 })
  }
  // Town houses and shops wall to wall round the plaza, facing in.
  const style = kind === 'close' ? 'stone' : kind === 'smiths' ? 'stone' : 'timber'
  const roofs: ('tile' | 'slate' | 'shingle' | 'thatch')[] = kind === 'close' ? ['slate', 'slate', 'tile'] : kind === 'granary' ? ['thatch', 'tile', 'shingle'] : ['tile', 'slate', 'tile', 'shingle']
  for (const R of [RING]) {
    if (!R) break
    let a = rnd() * Math.PI * 2
    const end = a + Math.PI * 2
    while (a < end) {
      const w = 6 + rnd() * 2.6
      const d = 7.5 + rnd() * 2
      const x = Math.cos(a) * R
      const z = Math.sin(a) * R
      const ry = Math.atan2(-x, -z)
      if (free(x, z, w / 2 + 0.1, d / 2 + 0.1, ry)) {
        const f = new Frame(x, z, ry, 0)
        const shop = kind === 'market' || rnd() < 0.3
        house(k, f, { w, d, storeys: rnd() < 0.85 ? 2 : 1, roof: roofs[Math.floor(rnd() * roofs.length)], style: rnd() < 0.25 ? 'plaster' : style, detail: 'high', banner: rnd() < 0.1 }, rnd)
        if (shop) {
          f.put(k.accents, box(w * 0.8, 0.14, 2.2), 0xffffff, 0, 3.1, d / 2 + 1, { rx: 0.32 })
          f.put(k.flat!, box(w * 0.6, 0.9, 1), PAL.timberL, 0, 1.3, d / 2 + 1.4)
          crate(k, f, -w * 0.22, 1.8, d / 2 + 1.4, 0.7)
        }
        if (rnd() < 0.3) smoke.push([x, 12, z])
        taken.push({ x, z, r: Math.hypot(w, d) / 2, hw: w / 2, hd: d / 2, ry })
        a += (w + 0.3) / R
      } else a += 2 / R
    }
  }
  // Life on the plaza: stalls, carts, stacks of crates and barrels, wells, trees, braziers.
  const props = kind === 'close' ? 8 : kind === 'garrison' ? 10 : 16
  for (let i = 0, tries = 0; i < props && tries < 200; tries++) {
    const a = rnd() * Math.PI * 2
    const r = RING ? RING - 22 + rnd() * 12 : 30 + rnd() * 24
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const ry = Math.atan2(-x, -z)
    if (!free(x, z, 3.2, 2.2, ry)) continue
    i++
    taken.push({ x, z, r: 4, hw: 3.2, hd: 2.2, ry })
    const f = new Frame(x, z, ry, 0)
    const roll = rnd()
    if (roll < 0.35 && kind !== 'garrison') {
      f.put(k.flat!, box(4.6, 1.1, 2.4), PAL.timberL, 0, 0.8, 0)
      for (const [lx, lz] of [[-2.2, -1.1], [2.2, -1.1], [-2.2, 1.3], [2.2, 1.3]]) f.put(k.flat!, box(0.22, 3, 0.22), PAL.timber, lx, 1.5, lz, { ao: 0 })
      f.put(k.accents, box(5.2, 0.16, 3.4), 0xffffff, 0, 3.1, 0.2, { rx: 0.22 })
      crate(k, f, -1, 1.35, 0, 0.8)
      barrel(k, f, 1.3, 0.2, 0.7)
    } else if (roll < 0.55) cart(k, f, kind === 'granary' ? 'sacks' : kind === 'smiths' ? 'barrels' : rnd() < 0.5 ? 'hay' : 'barrels', rnd)
    else if (roll < 0.75) {
      crate(k, f, -1, 0, 0, 1.4)
      crate(k, f, 0.6, 0, 0.6, 1.2)
      crate(k, f, -0.4, 1.4, 0.2, 1.1)
      barrel(k, f, 2, -0.5, 0.9)
      barrel(k, f, 2.6, 0.9, 0.9)
    } else if (roll < 0.88) tree(k, f, 0, 0, rnd, 1.2)
    else brazier(k, f, 0, 0, 0)
  }
  for (const a of [0.9, 0.9 + Math.PI]) {
    const x = Math.cos(a) * (OUT - 14)
    const z = Math.sin(a) * (OUT - 14)
    if (free(x, z, 2.5, 2.5, 0)) well(k, new Frame(x, z, a, 0))
  }
}

/**
 * Inside a city gate: a little square where the road comes in, a guard house and a toll booth by it,
 * carts waiting their turn, crates and barrels, a well, braziers.
 */
function gateSquare(k: Kit, rnd: () => number, smoke: [number, number, number][]) {
  // (Local +x is out through the gate; the city lies towards -x.)
  for (let i = 0; i < 6; i++) ROOT.put(k.flat!, box(10, 0.25, 34 - i * 2), i % 2 ? 0xa89c86 : 0x9a8f7a, -32 - i * 9, 0.3, 0, { ao: 0 })
  house(k, ROOT.sub(-36, -26, 0), { w: 10, d: 7, storeys: 2, roof: 'slate', style: 'stone', detail: 'high', banner: true }, rnd)
  smoke.push([-36, 12, -26])
  // The toll booth: a little timber hut with a barrier pole across the way in.
  const tb = ROOT.sub(-24, 15, Math.PI)
  tb.put(k.walls, box(4, 3.4, 3.6), PAL.timberL, 0, 1.7, 0)
  tb.put(k.roofs, gable(4.6, 5, 1.6), PAL.slate[0], 0, 3.4, 0)
  tb.put(k.walls, box(0.3, 1.2, 0.3), PAL.timber, 0, 0.6, -3)
  tb.put(k.accents, box(0.3, 0.3, 11), 0xffffff, 0, 1.2, -8.4)
  for (let i = 0; i < 3; i++) cart(k, ROOT.sub(-44 - i * 9, 4 + (i % 2) * 3, Math.PI / 2 + (rnd() - 0.5) * 0.3), (['hay', 'barrels', 'sacks'] as const)[i % 3], rnd)
  for (const [x, z] of [[-30, -16], [-52, 18]]) {
    crate(k, ROOT, x, 0, z, 1.4)
    crate(k, ROOT, x + 1.6, 0, z + 0.4, 1.2)
    barrel(k, ROOT, x - 1.6, z + 1, 0.9)
  }
  well(k, ROOT.sub(-58, -14, 0.3))
  for (const z of [-12, 12]) brazier(k, ROOT, -20, 0, z)
  for (const [x, z] of [[-62, 24], [-66, -24]]) tree(k, ROOT, x, z, rnd, 1.2)
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

/** The canons' houses of the cathedral close (x, z, ry), on an ellipse round the church. */
const CANONS: [number, number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.2
  return [Math.cos(a) * 54, Math.sin(a) * 34, -a + Math.PI / 2]
})

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
  for (const [x, z, ry] of CANONS) house(k, ROOT.sub(x, z, ry), { w: 9, d: 7, storeys: 2, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
  for (const [x, z] of [[-56, 26], [-56, -26]]) brazier(k, ROOT, x, 0, z)
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
 * The Sovereign's Citadel crowning the royal city: a curtain of great drum towers on the level
 * summit of its mount, four gatehouses on the axis roads, and within, the royal palace complex.
 *
 * Round the mount, a battered stone revetment in two stages with buttresses hides the steep face,
 * and four grand ramps with balustrades, steps and lamps climb to the gates.
 *
 * The Great Keep rises in three stages over a square plan: the main block with a pavilion on each
 * face (an arcade below, a gabled front, a balcony), corbelled and crenellated; the upper stage;
 * and a lantern of stained glass under the great spire. Eight spires stand round it (four corner
 * turrets and four bartizans) with flying buttresses springing to the upper stages; pointed
 * windows, pilasters, giant banners and gilded bands on its faces. A grand entrance at the head of
 * the stair: twin towers, a great arch, a rose window, the royal arms in gold. Covered arcaded
 * galleries join it to the palace and its gilded dome (east), the great hall (north) and the royal
 * chapel (west). Gilding is real gold (a metal material). Built in world units round the citadel's
 * centre (gates on the map's axes, where the engine's castle gates are).
 */
export function buildRoyalCitadel(c: Castle, rnd: () => number, color: string, wallR: number, gateHalf: number, world?: World): { group: THREE.Group; roofMat: THREE.MeshStandardMaterial; flag: THREE.Mesh; flagBase: Float32Array; smoke: [number, number, number][] } {
  const k = newKit()
  k.flat = []
  const windows: THREE.BufferGeometry[] = []
  const gold: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const f = ROOT
  const SL = PAL.slate
  const GOLD = 0xffffff
  const WH = 30
  const W = k.walls
  const FL = k.flat
  const M = (a = 0.05) => mottle(W[W.length - 1], a)
  const G = (geo: THREE.BufferGeometry, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {}) => gold.push(bpart(geo, GOLD, { x, y, z, ao: 0, ...o }))
  const base = world ? world.heightAt(c.x, c.z) : 0
  /** Ground height below the summit at a local point (negative off the mount). */
  const ground = (x: number, z: number) => (world ? world.heightAt(c.x + x, c.z + z) - base : 0)
  const mount = castleRadius(ROYAL_SEAT_TIER)

  // --- The summit: paved out to its edge ---
  f.put(FL, cyl(mount * 0.995, mount * 0.995, 2, 64), 0x8a8273, 0, -0.7, 0, { ao: 0 })
  for (const rr of [wallR + 14, mount * 0.9]) f.put(FL, new THREE.TorusGeometry(rr, 0.45, 3, 64), 0x76705f, 0, 0.35, 0, { rx: Math.PI / 2, ao: 0 })

  // --- The revetment round the mount: a battered face of dressed stone laid along the mount's
  // steep side, a projecting course half way down (the line of an older, lower wall), buttresses,
  // and a parapet along the summit's edge. ---
  {
    const R1 = mount * 0.995
    const n = 120
    const ramp = (a: number) => [0, 1, 2, 3].some((q) => Math.abs(Math.atan2(Math.sin(a - (q * Math.PI) / 2), Math.cos(a - (q * Math.PI) / 2))) * R1 < 15)
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2
      if (ramp(a)) continue
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      // From just outside the summit's edge down to below the ground at the foot, 1.5m proud of the slope.
      const y0 = 0.4
      const y1 = ground(ca * (R1 + 24), sa * (R1 + 24)) - 2.5
      const r0 = R1 + 1.5
      const r1 = R1 + 23
      const H = y0 - y1
      const tilt = Math.atan2(r1 - r0, H)
      const rm = (r0 + r1) / 2
      const L = (2 * Math.PI * (R1 + 12)) / n + 1.2
      const sf = new Frame(ca * rm, sa * rm, -a + Math.PI / 2, 0)
      const len = Math.hypot(H, r1 - r0)
      sf.put(W, new THREE.BoxGeometry(L, len, 3.2, 1, 4, 1), i % 2 ? 0xa39c8c : 0x9a9384, 0, (y0 + y1) / 2, 0, { rx: -tilt, ao: 0.2, jitter: 0.06 })
      M(0.08)
      // The course half way down, standing proud of the face.
      const yc = y0 - H * 0.45
      const rc = r0 + (r1 - r0) * 0.45 + 0.8
      new Frame(ca * rc, sa * rc, -a + Math.PI / 2, 0).put(W, box(L + 0.2, 1.6, 2.8), 0x8a8274, 0, yc, 0, { ao: 0.1 })
      // Buttresses down the face.
      if (i % 4 === 0) new Frame(ca * (rm + 1.6), sa * (rm + 1.6), -a + Math.PI / 2, 0).put(W, box(3.6, len, 3), 0x8f887a, 0, (y0 + y1) / 2, 0, { rx: -tilt, ao: 0.2 })
      // A parapet along the summit's edge.
      const pf = new Frame(ca * (R1 - 0.6), sa * (R1 - 0.6), -a + Math.PI / 2, 0)
      pf.put(W, box((2 * Math.PI * R1) / n + 0.3, 1.4, 1.2), PAL.stoneL, 0, 0.9, 0)
      if (i % 2 === 0) pf.put(FL, box(1.4, 0.9, 1.3), PAL.stoneL, 0, 2, 0, { ao: 0 })
    }
    // --- The four grand ramps to the gates: paved, stepped, balustraded, lit ---
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2
      const rf = new Frame(0, 0, -a, 0)
      const r0 = R1 - 4
      const r1 = mount * 1.5
      const steps = 34
      for (let i = 0; i < steps; i++) {
        const u0 = r0 + ((r1 - r0) * i) / steps
        const u1 = r0 + ((r1 - r0) * (i + 1)) / steps
        const [x0, z0] = rf.at(u0, 0)
        const [x1, z1] = rf.at(u1, 0)
        const y0 = Math.min(0, ground(x0, z0))
        const y1 = Math.min(0, ground(x1, z1))
        const um = (u0 + u1) / 2
        const ym = (y0 + y1) / 2
        // A broad flight of shallow steps in stone, on a solid footing.
        rf.put(W, box(u1 - u0 + 0.2, 4 + Math.abs(y1 - y0), 26), 0x9a9284, um, ym - 2, 0, { ao: 0.15 })
        rf.put(FL, box(u1 - u0 - 0.6, 0.35, 24), i % 2 ? 0xb0a896 : 0xa49c8a, um - 0.3, Math.max(y0, y1) + 0.25, 0, { ao: 0 })
        for (const sd of [-1, 1]) {
          rf.put(W, box(u1 - u0 + 0.2, 1.8, 1.4), PAL.stoneL, um, ym + 0.9, sd * 13.4, { rz: Math.atan2(y0 - y1, u1 - u0) })
          if (i % 2 === 0) rf.put(FL, box(0.8, 1.2, 0.8), PAL.stoneD, um, ym + 2.3, sd * 13.4, { ao: 0 })
          if (i % 6 === 3) {
            rf.put(FL, cyl(0.18, 0.24, 5, 6), PAL.iron, um, ym + 4, sd * 14.6, { ao: 0 })
            rf.put(k.glow, box(0.7, 0.9, 0.7), 0xffc46a, um, ym + 6.8, sd * 14.6)
          }
        }
      }
      // Great piers with lions at the foot of each ramp.
      const [bx, bz] = rf.at(r1, 0)
      const by = ground(bx, bz)
      for (const sd of [-1, 1]) {
        rf.put(W, box(4, 5, 4), PAL.stoneL, r1 + 2, by + 2.5, sd * 14)
        rf.put(W, box(2.6, 1.6, 3.4), 0xc8b88a, r1 + 2, by + 5.8, sd * 14)
        G(sphere(0.8, 0), rf.at(r1 + 2, sd * 14)[0], by + 7.2, rf.at(r1 + 2, sd * 14)[1])
      }
    }
  }

  // --- The curtain and its towers ---
  const n = 40
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * wallR
    const z = Math.sin(a) * wallR
    if (Math.abs(x) < gateHalf + 8 || Math.abs(z) < gateHalf + 8) continue
    const L = (Math.PI * 2 * wallR) / n + 1
    const sf = new Frame(x, z, -a + Math.PI / 2, 0)
    sf.put(W, box(L, 8, 16), PAL.stoneD, 0, 1, -1.5, { ao: 0.15 })
    sf.put(W, new THREE.BoxGeometry(L, WH, 10, 2, 5, 1), PAL.stoneL, 0, WH / 2, 0, { ao: 0.2, jitter: 0.04 })
    M()
    for (let t = -L / 2 + 1; t < L / 2; t += 2.6) sf.put(FL, box(0.9, 1.8, 2), PAL.stoneD, t, WH - 0.9, -6, { ao: 0 })
    sf.put(W, box(L, 1.1, 2.6), PAL.stoneL, 0, WH + 0.2, -6.3, { ao: 0 })
    for (let t = -L / 2 + 1.5; t < L / 2; t += 3.2) sf.put(W, box(1.9, 2.4, 1.5), PAL.stoneL, t, WH + 1.9, -6.6, { ao: 0 })
    sf.put(FL, box(0.6, 3.6, 0.25), PAL.dark, 0, WH * 0.6, -5.1, { ao: 0 })
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    const x = Math.cos(a) * wallR
    const z = Math.sin(a) * wallR
    f.put(W, cyl(11, 13, 12, 14), PAL.stoneD, x, 2, z, { ao: 0.15 })
    f.put(W, new THREE.CylinderGeometry(10, 11, WH + 16, 14, 6), PAL.stoneL, x, (WH + 16) / 2, z, { ao: 0.2 })
    M()
    for (let j = 0; j < 12; j++) {
      const b = (j / 12) * Math.PI * 2
      f.put(W, box(1.3, 1.6, 1.3), PAL.stoneD, x + Math.cos(b) * 10.6, WH + 15.2, z + Math.sin(b) * 10.6, { ao: 0 })
    }
    f.put(W, cyl(11.4, 11.4, 1, 14), PAL.stoneL, x, WH + 16.4, z, { ao: 0 })
    coursedCone(k.roofs, x, WH + 17, z, 12, 18, SL[i % 3], 14)
    G(sphere(1, 0), x, WH + 35.6, z)
    for (const y of [12, 24]) f.put(windows, box(0.8, 2.4, 0.8), 0xffc46a, x + Math.cos(a) * 10.4, y, z + Math.sin(a) * 10.4)
  }
  for (let q = 0; q < 4; q++) {
    const gf = new Frame(0, 0, (-q * Math.PI) / 2, 0).sub(wallR, 0, 0)
    for (const s of [-1, 1]) {
      gf.put(W, cyl(9, 10, WH + 12, 12), PAL.stoneL, 0, (WH + 12) / 2, s * (gateHalf + 9))
      const [rx, rz] = gf.at(0, s * (gateHalf + 9))
      coursedCone(k.roofs, rx, WH + 12, rz, 10, 14, SL[0], 12)
      G(sphere(0.8, 0), rx, WH + 26.6, rz)
      gf.put(k.accents, box(0.3, 12, 5), 0xffffff, 9.6, WH - 2, s * (gateHalf + 9))
    }
    gf.put(W, box(14, 10, gateHalf * 2 + 4), PAL.stone, 0, WH + 1, 0)
    for (let t = -gateHalf; t <= gateHalf; t += 3.2) gf.put(W, box(1.6, 2.2, 1.4), PAL.stoneL, 7, WH + 7, t, { ao: 0 })
    gf.put(W, box(0.8, 14, gateHalf * 2 - 4), PAL.dark, 7.2, WH - 8, 0, { ao: 0 })
    gf.put(k.accents, box(0.3, 7, 10), 0xffffff, 7.6, WH + 2, 0)
  }

  // --- The grand stair from the south avenue up to the keep's entrance ---
  for (let i = 0; i < 10; i++) f.put(W, box(30 - i, 1.6, 6), PAL.stoneL, 0, 0.8 + i * 1.6, 120 - i * 6, { ao: 0.05 })
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) f.put(FL, box(1, 1.6, 5.6), PAL.stoneD, s * (15.5 - i * 0.5), 2.4 + i * 1.6, 120 - i * 6, { ao: 0 })

  // --- The Great Keep ---
  const KW = 46
  const H1 = 44
  const U = 34
  const H2 = 22
  const LW = 22
  const H3 = 16
  const T2 = H1 + H2
  const T3 = T2 + H3
  f.put(W, box(KW + 10, 6, KW + 10), PAL.stoneD, 0, 1, 0, { ao: 0.2 })
  // A balustraded terrace round the keep's platform.
  for (let sd = 0; sd < 4; sd++) {
    const tf = new Frame(0, 0, (sd * Math.PI) / 2, 0)
    for (let u = -KW / 2 - 4; u <= KW / 2 + 4; u += 2) if (Math.abs(u) > 14) tf.put(FL, box(0.5, 1.4, 0.5), PAL.stoneL, u, 4.7, KW / 2 + 4.6, { ao: 0 })
    for (const s of [-1, 1]) tf.put(W, box(KW / 2 - 10, 0.5, 0.8), PAL.stoneL, s * (KW / 4 + 10), 5.6, KW / 2 + 4.6, { ao: 0 })
  }
  // Stage one: the main block, its pilasters, pointed windows, string courses, a gilded band.
  f.put(W, new THREE.BoxGeometry(KW, H1, KW, 4, 6, 4), 0xbcb4a3, 0, H1 / 2 + 4, 0, { ao: 0.25, jitter: 0.03 })
  M(0.045)
  for (let sd = 0; sd < 4; sd++) {
    const sf = new Frame(0, 0, (sd * Math.PI) / 2, 0)
    for (const u of [-KW * 0.42, -KW * 0.14, KW * 0.14, KW * 0.42]) sf.put(W, box(1.8, H1 - 4, 1.2), PAL.stoneL, u, H1 / 2 + 4, KW / 2 + 0.5)
    for (const y of [24, 36]) for (const u of [-KW * 0.28, 0, KW * 0.28]) {
      sf.put(FL, box(2.6, 6, 0.3), PAL.dark, u, y, KW / 2 + 0.1, { ao: 0 })
      sf.put(FL, cone(1.9, 2.4, 4), PAL.dark, u, y + 4.1, KW / 2 + 0.1, { ry: Math.PI / 4, sz: 0.12, ao: 0 })
      sf.put(windows, box(2, 5.2, 0.2), 0xffc46a, u, y, KW / 2 + 0.22)
    }
    for (const y of [16, 30]) sf.put(W, box(KW + 1, 0.9, 1.2), PAL.stoneL, 0, y, KW / 2 + 0.3, { ao: 0 })
    gold.push(bpart(box(KW + 1.4, 0.7, 0.6), GOLD, { ...frameXZ(sf, 0, KW / 2 + 0.75), y: H1 + 2.4, ry: (sd * Math.PI) / 2, ao: 0 }))
    // Corbels and crenellations on the main block.
    for (let t = -KW / 2; t <= KW / 2; t += 2.8) {
      sf.put(FL, box(1.2, 2, 2), PAL.stoneD, t, H1 + 3, KW / 2 + 1, { ao: 0 })
      sf.put(W, box(1.8, 2.6, 1.6), PAL.stoneL, t, H1 + 6.6, KW / 2 + 1.6, { ao: 0 })
    }
    sf.put(W, box(KW + 4, 1.4, 3), PAL.stoneL, 0, H1 + 4.7, KW / 2 + 1)
    // The giant royal banner down the face (not over the entrance).
    if (sd !== 0) sf.put(k.accents, box(7, 24, 0.4), 0xffffff, KW * 0.28, H1 - 8, KW / 2 + 1.3)
  }
  // The four pavilions: an arcade below, a gabled front with a balcony, on each face (the south
  // one is the grand entrance).
  for (let sd = 1; sd < 4; sd++) {
    const pf = new Frame(0, 0, (sd * Math.PI) / 2, 0).sub(0, KW / 2 + 6, 0)
    pf.put(W, new THREE.BoxGeometry(26, 20, 12, 3, 2, 1), 0xc4bcaa, 0, 14, 0)
    M(0.04)
    for (let i = 0; i < 5; i++) {
      const u = -10 + i * 5
      pf.put(W, cyl(0.9, 1.1, 8, 10), PAL.stoneL, u, 4, 6.2)
      if (i < 4) pf.put(W, new THREE.TorusGeometry(2.5, 0.6, 4, 12, Math.PI), PAL.stoneL, u + 2.5, 8, 6.2, { ao: 0 })
    }
    pf.put(FL, box(25, 7, 0.3), PAL.dark, 0, 3.8, 5.8, { ao: 0 })
    pf.put(W, box(27, 1.2, 14), PAL.stoneL, 0, 24.6, 0)
    k.roofs.push(bpart(gable(13, 27, 7), SL[1], { ...frameXZ(pf, 0, 0), y: 25.2, ry: pf.ry + Math.PI / 2, order: 'YXZ' }))
    // The balcony on the front, its balustrade, the tall windows behind.
    pf.put(W, box(20, 0.8, 3.4), PAL.stoneL, 0, 13, 7.4)
    for (let u = -9.5; u <= 9.5; u += 1.2) pf.put(FL, box(0.4, 1.4, 0.4), PAL.stoneL, u, 14.1, 8.9, { ao: 0 })
    pf.put(W, box(20, 0.4, 0.6), PAL.stoneL, 0, 14.9, 8.9)
    for (const u of [-6, 0, 6]) pf.put(windows, box(2.4, 6, 0.2), 0xffc46a, u, 17, 6.12)
    G(cone(0.5, 3, 6), ...gableTop(pf, 0, 6))
  }
  // Stage two: the upper block, corbelled out, crenellated, gilded band, tall windows.
  f.put(W, new THREE.BoxGeometry(U, H2, U, 3, 3, 3), 0xc2baa8, 0, H1 + 4 + H2 / 2 + 2, 0, { ao: 0.2 })
  M(0.045)
  for (let sd = 0; sd < 4; sd++) {
    const sf = new Frame(0, 0, (sd * Math.PI) / 2, 0)
    for (const u of [-U * 0.3, 0, U * 0.3]) {
      sf.put(FL, box(2.4, 8, 0.3), PAL.dark, u, T2 - 6, U / 2 + 0.1, { ao: 0 })
      sf.put(windows, box(1.8, 7.2, 0.2), 0xffc46a, u, T2 - 6, U / 2 + 0.22)
    }
    for (let t = -U / 2; t <= U / 2; t += 2.6) sf.put(W, box(1.6, 2.4, 1.4), PAL.stoneL, t, T2 + 7.4, U / 2 + 0.8, { ao: 0 })
    sf.put(W, box(U + 2, 1.2, 2), PAL.stoneD, 0, T2 + 5.6, U / 2 + 0.6)
    gold.push(bpart(box(U + 1.2, 0.6, 0.5), GOLD, { ...frameXZ(sf, 0, U / 2 + 0.45), y: T2 + 2, ry: (sd * Math.PI) / 2, ao: 0 }))
  }
  // Stage three: the lantern of stained glass, and the great spire over it.
  f.put(W, box(LW, H3, LW), PAL.stoneL, 0, T2 + 6 + H3 / 2, 0, { ao: 0.2 })
  const stain = [0xb8302a, 0x2f4f9a, 0xd9b04a, 0x3f7a4a]
  for (let sd = 0; sd < 4; sd++) {
    const sf = new Frame(0, 0, (sd * Math.PI) / 2, 0)
    for (const u of [-6, 0, 6]) {
      for (let j = 0; j < 4; j++) sf.put(glass, box(1.1, 2.6, 0.2), stain[(j + sd + Math.round(u)) & 3], u + (j % 2 ? 0.6 : -0.6), T2 + 10 + Math.floor(j / 2) * 2.8, LW / 2 + 0.12)
      sf.put(FL, cone(1.8, 2.2, 4), PAL.stoneD, u, T2 + 16.2, LW / 2 + 0.1, { ry: Math.PI / 4, sz: 0.12, ao: 0 })
    }
    for (const u of [-LW / 2, LW / 2]) sf.put(W, box(1.4, H3 + 2, 1.4), PAL.stoneL, u, T2 + 6 + H3 / 2, LW / 2)
  }
  f.put(W, box(LW + 3, 1.4, LW + 3), PAL.stoneL, 0, T3 + 6.6, 0)
  coursedCone(k.roofs, 0, T3 + 7.2, 0, LW * 0.72, 40, SL[0], 4, Math.PI / 4)
  G(cyl(0.3, 0.3, 10, 6), 0, T3 + 52, 0)
  G(sphere(1.6, 1), 0, T3 + 48, 0)
  G(cone(0.8, 3, 6), 0, T3 + 58, 0)
  // Eight spires round it: four great corner turrets, four corbelled bartizans mid-face, each with
  // a flying buttress springing to the upper stage.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = x * KW * 0.5
    const tz = z * KW * 0.5
    f.put(W, new THREE.CylinderGeometry(6.5, 7, H1 + 26, 12, 6), PAL.stoneL, tx, (H1 + 26) / 2 + 4, tz, { ao: 0.15 })
    M()
    for (let j = 0; j < 10; j++) {
      const b = (j / 10) * Math.PI * 2
      f.put(FL, box(1.2, 1.6, 1.2), PAL.stoneD, tx + Math.cos(b) * 6.8, H1 + 30.8, tz + Math.sin(b) * 6.8, { ao: 0 })
    }
    for (const y of [24, 40, 54]) f.put(windows, box(1.2, 3.2, 1.2), 0xffc46a, tx + x * 4.9, y, tz + z * 4.9)
    coursedCone(k.roofs, tx, H1 + 30, tz, 7.6, 24, SL[2], 12)
    G(sphere(0.9, 0), tx, H1 + 55.5, tz)
    G(cone(0.3, 3, 5), tx, H1 + 57.5, tz)
    flyer(W, tx, tz, H1 + 22, x * U * 0.5, z * U * 0.5, T2 - 2)
  }
  for (let sd = 0; sd < 4; sd++) {
    const sf = new Frame(0, 0, (sd * Math.PI) / 2, 0)
    const [bx, bz] = sf.at(0, KW / 2 + 2.6)
    f.put(W, cone(3.8, 6, 10), PAL.stoneL, bx, H1 + 4, bz, { rx: Math.PI, ao: 0.2 })
    f.put(W, cyl(3.6, 3.6, 16, 10), PAL.stoneL, bx, H1 + 15, bz)
    coursedCone(k.roofs, bx, H1 + 23, bz, 4.2, 13, SL[1], 10)
    G(sphere(0.6, 0), bx, H1 + 36.6, bz)
    const [ux, uz] = sf.at(0, U / 2)
    flyer(W, bx, bz, H1 + 18, ux, uz, T2 + 2)
  }
  // The grand entrance at the head of the stair: twin towers, the great arch, the rose window,
  // the royal arms in gold.
  {
    const ef = new Frame(0, KW / 2 + 15, 0, 0)
    ef.put(W, new THREE.BoxGeometry(30, 26, 20, 3, 3, 2), 0xc4bcaa, 0, 17, 0)
    M(0.04)
    for (const s of [-1, 1]) {
      ef.put(W, new THREE.CylinderGeometry(5, 5.6, 40, 12, 4), PAL.stoneL, s * 17, 20, 6)
      M()
      const [tx, tz] = ef.at(s * 17, 6)
      coursedCone(k.roofs, tx, 40, tz, 6, 16, SL[0], 12)
      G(sphere(0.7, 0), tx, 56.6, tz)
      for (const y of [16, 28]) ef.put(windows, box(1, 3, 1), 0xffc46a, s * 17, y, 11.4)
    }
    ef.put(W, box(14, 18, 2), PAL.stoneL, 0, 13, 10.4)
    ef.put(FL, box(9, 13, 0.4), PAL.dark, 0, 10.5, 11.5, { ao: 0 })
    ef.put(W, new THREE.TorusGeometry(5.6, 1.2, 4, 16, Math.PI), PAL.stoneL, 0, 17, 11.5, { ao: 0 })
    for (const y of [4, 8, 12]) ef.put(W, box(9.6, 0.5, 0.5), PAL.stoneD, 0, y, 11.6, { ao: 0 })
    // The rose window over the arch: a stone wheel, glass between the spokes.
    ef.put(W, new THREE.TorusGeometry(4.2, 0.6, 4, 20), PAL.stoneL, 0, 26, 11.4, { ao: 0 })
    for (let j = 0; j < 8; j++) {
      const b = (j / 8) * Math.PI * 2
      ef.put(glass, box(1.6, 3.2, 0.2), stain[j & 3], Math.cos(b) * 2.2, 26 + Math.sin(b) * 2.2, 11.3, { rz: b })
      ef.put(FL, box(0.4, 4, 0.3), PAL.stoneL, Math.cos(b) * 2, 26 + Math.sin(b) * 2, 11.5, { rz: b + Math.PI / 2, ao: 0 })
    }
    gold.push(bpart(cyl(1.6, 1.6, 0.4, 12), GOLD, { ...frameXZ(ef, 0, 11.6), y: 26, rx: Math.PI / 2, ao: 0 }))
    // The royal arms in gold over the rose, a crown on top.
    gold.push(bpart(box(6, 7, 0.5), GOLD, { ...frameXZ(ef, 0, 11.3), y: 34.5, ao: 0 }))
    ef.put(k.accents, box(4.6, 5.6, 0.3), 0xffffff, 0, 34.5, 11.6)
    gold.push(bpart(cyl(2, 2.4, 1.4, 10), GOLD, { ...frameXZ(ef, 0, 11), y: 39, ao: 0 }))
    for (let j = 0; j < 5; j++) gold.push(bpart(cone(0.35, 1.4, 4), GOLD, { ...frameXZ(ef, -1.6 + j * 0.8, 11), y: 40.3, ao: 0 }))
    ef.put(W, box(32, 1.6, 22), PAL.stoneL, 0, 30.8, 0)
    k.roofs.push(bpart(gable(22, 32, 9), SL[1], { ...frameXZ(ef, 0, 0), y: 31.4, ry: Math.PI / 2, order: 'YXZ' }))
  }

  // --- The palace and its gilded dome (east) ---
  const pf = new Frame(78, -10, 0, 0)
  pf.put(W, new THREE.BoxGeometry(56, 26, 40, 5, 4, 4), 0xc9bfa9, 0, 13, 0, { ao: 0.2 })
  M(0.04)
  pf.put(k.roofs, hip(42, 58, 10), SL[1], 0, 26, 0)
  for (const x of [-20, -10, 0, 10, 20]) for (const y of [8, 18]) pf.put(windows, box(2.4, 4.4, 0.3), 0xffc46a, x, y, 20.1)
  for (const x of [-26, 26]) pf.put(W, box(3, 28, 3), PAL.stoneL, x, 14, 20.5, { ao: 0.1 })
  pf.put(W, cyl(15, 15, 14, 20), PAL.stoneL, 0, 37, 0, { ao: 0.15 })
  for (let j = 0; j < 12; j++) pf.put(windows, box(1.4, 4, 0.3), 0xffc46a, Math.cos((j / 12) * 6.28) * 15.1, 37, Math.sin((j / 12) * 6.28) * 15.1, { ry: -(j / 12) * 6.28 + Math.PI / 2 })
  gold.push(bpart(new THREE.SphereGeometry(15.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), GOLD, { x: 78, y: 44, z: -10, sy: 1.15, ao: 0.2 }))
  for (let j = 0; j < 8; j++) gold.push(bpart(new THREE.TorusGeometry(15.6, 0.25, 3, 16, Math.PI), 0xd8c070, { x: 78, y: 44, z: -10, ry: (j * Math.PI) / 8, sy: 1.15, ao: 0 }))
  pf.put(W, cyl(2.4, 2.8, 6, 10), PAL.stoneL, 0, 62, 0, { ao: 0 })
  G(cone(2.8, 6, 10), 78, 68, -10)
  G(sphere(1, 0), 78, 72, -10)

  // --- The great hall (north), its tall windows lit ---
  const hf = new Frame(0, -86, 0, 0)
  hf.put(W, new THREE.BoxGeometry(90, 30, 28, 8, 4, 3), 0xbdb5a5, 0, 15, 0, { ao: 0.2 })
  M(0.04)
  hf.put(k.roofs, gable(30, 92, 16), SL[0], 0, 30, 0)
  for (let x = -40; x <= 40; x += 10) {
    for (const s of [-1, 1]) {
      hf.put(W, box(3, 26, 4), PAL.stone, x, 13, s * 15.5, { ao: 0.1 })
      hf.put(W, box(2.4, 2.6, 2.6), PAL.stoneD, x, 27, s * 14.8, { rx: s * 0.6, ao: 0 })
    }
    if (x < 40) for (const s of [-1, 1]) hf.put(windows, box(3, 12, 0.3), 0xffc46a, x + 5, 16, s * 14.1)
  }
  hf.put(glass, cyl(7, 7, 0.4, 16), 0x6a3a8a, -45.2, 22, 0, { rz: Math.PI / 2 })
  for (let x = -44; x <= 44; x += 8) G(cone(0.4, 2, 4), x, 46.4, -86)

  // --- The royal chapel and its spire (west) ---
  const cf = new Frame(-84, 18, 0, 0)
  cf.put(W, box(40, 26, 18), PAL.stoneL, 0, 13, 0, { ao: 0.2 })
  cf.put(k.roofs, gable(20, 42, 12), SL[2], 0, 26, 0)
  cf.put(W, box(14, 52, 14), PAL.stoneL, -24, 26, 0, { ao: 0.2 })
  coursedCone(k.roofs, -108, 52, 18, 10, 52, SL[0], 8)
  G(sphere(0.9, 0), -108, 105, 18)
  G(cone(0.25, 4, 4), -108, 107.5, 18)
  for (const x of [-10, 0, 10]) for (const s of [-1, 1]) cf.put(glass, box(2.4, 9, 0.3), stain[(x / 10 + 1 + (s > 0 ? 1 : 0)) & 3], x, 14, s * 9.1)

  // --- Covered galleries from the keep's pavilions to the palace, the hall and the chapel ---
  gallery(k, FL, windows, [KW / 2 + 12, -6], [50, -6])
  gallery(k, FL, windows, [-2, -(KW / 2 + 12)], [-2, -72])
  gallery(k, FL, windows, [-(KW / 2 + 12), 12], [-64, 12])

  // --- Four beacon towers ablaze ---
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const x = Math.cos(a) * wallR * 0.66
    const z = Math.sin(a) * wallR * 0.66
    f.put(W, cyl(4.5, 6, 64, 10), PAL.stoneL, x, 32, z, { ao: 0.2 })
    f.put(W, cyl(7, 5, 3, 10), PAL.iron, x, 65.5, z, { ao: 0 })
    f.put(k.glow, cone(5.5, 11, 8), 0xff8a3a, x, 72, z)
    f.put(k.glow, cone(3, 7, 6), 0xffd27a, x, 74, z)
  }
  // The precinct round them: avenues and a ring road, a cloister and its fountain garden, the
  // Guard's barracks and the royal stables, the great lords' mansions, the treasury, the library
  // tower, the observatory, gardens.
  const smoke: [number, number, number][] = []
  royalPrecinct(k, rnd, wallR, gateHalf, smoke)

  const group = new THREE.Group()
  const mesh = new THREE.Mesh(groundShade(bmerge([...k.walls, ...k.roofs]), 6, 0.25), buildMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  group.add(flatMesh(k))
  const roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, vertexColors: true }))
  if (k.accents.length) {
    const acc = new THREE.Mesh(bmerge(k.accents), roofMat)
    acc.castShadow = true
    group.add(acc)
  }
  if (gold.length) {
    const gm = new THREE.Mesh(bmerge(gold), goldMat)
    gm.castShadow = true
    group.add(gm)
  }
  if (glass.length) group.add(new THREE.Mesh(bmerge(glass), glassMat))
  if (k.glow.length) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  if (windows.length) group.add(new THREE.Mesh(bmerge(windows), new THREE.MeshBasicMaterial({ color: 0xffc46a })))
  // The royal standard over the great spire.
  const flagGeo = new THREE.PlaneGeometry(16, 9.6, 8, 2)
  flagGeo.translate(8, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
  flag.position.set(0, T3 + 54, 0)
  group.add(flag)
  return { group, roofMat, flag, flagBase, smoke }
}

/** A kit's small parts (paving, props, fine work) as a mesh that casts no shadow. */
function flatMesh(k: Kit): THREE.Object3D {
  if (!k.flat?.length) return new THREE.Group()
  const m = new THREE.Mesh(bmerge(k.flat), buildMat)
  m.castShadow = false
  m.receiveShadow = true
  return m
}

const goldMat = applyVision(new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.8, roughness: 0.3, flatShading: true, vertexColors: true }))
/** Stained glass: lit from within, in its own colours. */
const glassMat = applyVision(new THREE.MeshBasicMaterial({ vertexColors: true }))

/** A frame's local point as part options (x, z). */
function frameXZ(f: Frame, lx: number, lz: number) {
  const [x, z] = f.at(lx, lz)
  return { x, z }
}
/** The apex of a pavilion's gable (world x, y, z). */
function gableTop(f: Frame, lx: number, lz: number): [number, number, number] {
  const [x, z] = f.at(lx, lz)
  return [x, 33.6, z]
}

/** A flying buttress: a pier's top springing in an arch to a wall higher up. */
function flyer(W: THREE.BufferGeometry[], x0: number, z0: number, y0: number, x1: number, z1: number, y1: number) {
  const L = Math.hypot(x1 - x0, z1 - z0, y1 - y0)
  const yaw = Math.atan2(x1 - x0, z1 - z0)
  const pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0))
  // The flyer itself, a slab leaning up to the wall; the half-arch under it.
  W.push(bpart(box(1.4, 1.6, L), PAL.stoneL, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, ry: yaw, rx: -pitch, order: 'YXZ', ao: 0.1 }))
  W.push(bpart(new THREE.TorusGeometry(L * 0.5, 0.5, 3, 8, Math.PI / 2), PAL.stone, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - L * 0.35, z: (z0 + z1) / 2, ry: yaw + Math.PI / 2, order: 'YXZ', ao: 0 }))
  W.push(bpart(cone(0.7, 3, 4), PAL.stoneL, { x: x0, y: y0 + 2.4, z: z0, ao: 0 }))
}

/** A covered gallery between two points on the ground: an arcade each side, a roof terrace with a balustrade. */
function gallery(k: Kit, FL: THREE.BufferGeometry[], windows: THREE.BufferGeometry[], a: [number, number], b: [number, number]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const gf = new Frame((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0]) * -1, 0)
  const W = k.walls
  gf.put(FL, box(L, 0.5, 9), 0xb0a896, 0, 0.5, 0, { ao: 0 })
  for (let u = -L / 2 + 1; u <= L / 2 - 1; u += 4) {
    for (const s of [-1, 1]) {
      gf.put(W, cyl(0.45, 0.55, 7, 8), PAL.stoneL, u, 3.6, s * 4)
      if (u < L / 2 - 4) gf.put(W, new THREE.TorusGeometry(2, 0.4, 3, 10, Math.PI), PAL.stoneL, u + 2, 7, s * 4, { ao: 0 })
    }
    gf.put(windows, box(0.5, 0.7, 0.5), 0xffc46a, u, 8, 0)
  }
  gf.put(W, box(L, 1.4, 9.6), PAL.stoneL, 0, 9.6, 0)
  for (let u = -L / 2; u <= L / 2; u += 1.4) for (const s of [-1, 1]) gf.put(FL, box(0.35, 1.2, 0.35), PAL.stoneL, u, 10.9, s * 4.5, { ao: 0 })
  for (const s of [-1, 1]) gf.put(W, box(L, 0.35, 0.6), PAL.stoneL, 0, 11.6, s * 4.5)
}
