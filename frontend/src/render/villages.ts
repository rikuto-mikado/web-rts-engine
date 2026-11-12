import * as THREE from 'three'
import type { Castle } from '../game/types'
import { Frame, PAL, bannerPole, horse, barrel, brazier, cart, crate, fence, gable, haystack, house, newKit, shade, tent, tree, well, wheel, woodpile, type Kit, type RoofKind } from './buildings'
import { bmerge, box, cone, cyl, groundShade, merge, sphere } from './geo'
import { applyVision } from './vision'

/**
 * Villages and the special holdings (caravanserai, abbey, wardens' keep,
 * siege guildhall) as miniature dioramas. Built in a local frame about 80
 * units across (the compound wall stands at r = 37, fields beyond), merged
 * into a few meshes: natural materials, the owner's colour only on cloth and
 * paint, and the things that glow.
 */
export const buildMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', false, false, true)
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa04a })
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc46a })
const waterMat = applyVision(new THREE.MeshStandardMaterial({ color: 0x4f7f96, roughness: 0.25, metalness: 0.1, flatShading: true }))

const NEUTRAL_CLOTH = '#b8aa88'

export function buildVillage(c: Castle, rnd: () => number, color: string) {
  const ruined = !!c.ruined
  const owned = c.faction !== 'neutral' && !ruined
  const walled = owned && c.tier >= 2
  const kind = c.holding ?? 'village'
  const k = newKit()
  const lamps: THREE.BufferGeometry[] = []
  const water: THREE.BufferGeometry[] = []
  const facing = (x: number, z: number, turn = 0) => new Frame(x, z, Math.atan2(-x, -z) + turn)

  // The compound's ground: beaten earth, a green in the middle, a skirt of soil beneath the edge.
  ROOT.put(k.walls, cyl(37, 41, 6, 28), ruined ? 0x3a352e : 0x86744f, 0, -2.75, 0, { ao: 0 })
  if (!ruined) ROOT.put(k.walls, cyl(13, 14, 0.4, 20), 0x6f8a3c, 0, 0.3, 0, { ao: 0, jitter: 0.1 })
  // Paths from the two gates to the heart of the place.
  if (!ruined) {
    ROOT.put(k.walls, box(78, 0.3, 5), 0xa08e6a, 0, 0.42, 0, { ao: 0 })
    ROOT.put(k.walls, box(5, 0.3, 30), 0xa08e6a, -6, 0.43, 14, { ao: 0 })
    for (let i = 0; i < 26; i++) ROOT.put(k.walls, box(0.9 + rnd() * 0.8, 0.2, 0.7 + rnd() * 0.6), 0x8f7f62, -36 + rnd() * 72, 0.6, (rnd() - 0.5) * 4, { ry: rnd() * 3, ao: 0 })
  }

  const roofFor = (): RoofKind => (kind === 'abbey' || kind === 'keep' ? (rnd() < 0.5 ? 'slate' : 'shingle') : kind === 'caravanserai' ? 'tile' : kind === 'guildhall' ? (rnd() < 0.5 ? 'tile' : 'shingle') : rnd() < 0.7 ? 'thatch' : 'shingle')
  const cottage = (f: Frame, w = 5.4 + rnd() * 1.6, d = 4.2 + rnd() * 0.8) =>
    house(k, f, { w, d, storeys: !ruined && rnd() < 0.3 ? 2 : 1, roof: roofFor(), style: kind === 'keep' || rnd() < 0.2 ? 'stone' : 'timber', ruined, annex: rnd() < 0.35, banner: owned && rnd() < 0.3 }, rnd)

  // Yard clutter about the compound.
  const clutter = (x: number, z: number) => {
    if (ruined) return
    const f = new Frame(x, z, rnd() * Math.PI * 2)
    const kk = Math.floor(rnd() * 6)
    if (kk === 0) for (let i = 0; i < 3; i++) barrel(k, f, i * 1.5 - 1.5, (i % 2) * 0.8)
    else if (kk === 1) {
      crate(k, f, 0, 0, 0)
      crate(k, f, 1.6, 0, 0.2, 1.3)
      crate(k, f, 0.7, 1.5, 0.1, 1.2)
    } else if (kk === 2) woodpile(k, f)
    else if (kk === 3) haystack(k, f, 0, 0)
    else if (kk === 4) cart(k, f, rnd() < 0.5 ? 'hay' : 'sacks', rnd)
    else fence(k, f, 7)
  }

  // Fields with furrows, hurdle fences and a scarecrow (none for the keep or the guildhall).
  if (!ruined && kind !== 'keep' && kind !== 'guildhall') {
    for (let q = 0; q < 3; q++) {
      const a = (q / 3) * Math.PI * 2 + 0.9
      const f = new Frame(Math.cos(a) * 49, Math.sin(a) * 49, -a + Math.PI / 2)
      const crop = [0xc9b25a, 0x7f9a3c, 0x9a7a4a][q % 3]
      f.put(k.walls, box(14, 0.4, 22), crop, 0, 0.2, 0, { ao: 0, jitter: 0.12 })
      for (let r = -6; r <= 6; r += 1.5) f.put(k.walls, box(0.55, 0.35, 21), shade(crop, -0.18), r, 0.45, 0, { ao: 0 })
      for (const s of [-1, 1]) fence(k, f.sub(s * 7.3, 0, Math.PI / 2), 22)
      if (q === 1) {
        f.put(k.walls, box(0.2, 3.2, 0.2), PAL.timber, 2, 1.6, 3)
        f.put(k.walls, box(2.4, 0.2, 0.2), PAL.timber, 2, 2.6, 3)
        f.put(k.walls, sphere(0.45, 0), 0xd8c49a, 2, 3.4, 3)
        f.put(k.accents, box(1.1, 1.2, 0.5), 0xffffff, 2, 2.3, 3)
      }
    }
  }
  let flagAt: [number, number, number] = [4.5, 20, -2]

  switch (kind) {
    case 'caravanserai':
      flagAt = caravanserai(k, water, ruined)
      for (let i = 0; i < 5; i++) {
        const a = 2.2 + i * 0.5
        cottage(facing(Math.cos(a) * 30, Math.sin(a) * 30))
      }
      break
    case 'abbey':
      flagAt = abbey(k, water, rnd, ruined)
      for (let i = 0; i < 3; i++) cottage(new Frame(-24 + i * 7.5, 25, Math.PI))
      break
    case 'keep':
      flagAt = wardensKeep(k, rnd, ruined, owned)
      break
    case 'guildhall':
      flagAt = guildhall(k, water, rnd, ruined, owned)
      for (let i = 0; i < 2; i++) cottage(new Frame(-26 + i * 8, -24, 0))
      break
    default: {
      // A village: cottages round the green, a chapel with its bell tower and churchyard, a well, a maypole.
      const n = 8
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2 + rnd() * 0.25
        if (Math.abs(Math.sin(a)) < 0.2) continue // keep the road to the gates clear
        const r = 21 + rnd() * 6
        cottage(facing(Math.cos(a) * r, Math.sin(a) * r))
      }
      flagAt = chapel(k, new Frame(2, -6, 0), rnd, ruined)
      if (!ruined) {
        well(k, new Frame(-6, 6, 0.3))
        // A maypole on the green, ribbons in the lord's colours.
        ROOT.put(k.walls, cyl(0.25, 0.3, 9, 6), 0xd8c49a, 7, 4.5, 5)
        ROOT.put(k.accents, cone(1.3, 1.4, 8), 0xffffff, 7, 8.6, 5)
        for (let i = 0; i < 6; i++) ROOT.put(k.accents, box(0.08, 7, 0.08), 0xffffff, 7 + Math.cos(i) * 1.4, 4.6, 5 + Math.sin(i) * 1.4, { rz: Math.cos(i) * 0.2, rx: Math.sin(i) * 0.2, ao: 0 })
      }
    }
  }
  // Clutter and trees in the yards.
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2
    const r = 15 + rnd() * 17
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (Math.abs(z) < 4) continue
    clutter(x, z)
  }
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2
    const r = 28 + rnd() * 7
    tree(k, ROOT, Math.cos(a) * r, Math.sin(a) * r, rnd, 0.9 + rnd() * 0.3, ruined)
  }

  if (walled) stoneCircuit(k, lamps, rnd)
  else if (owned) palisade(k)

  const group = new THREE.Group()
  const walls = groundShade(bmerge([...k.walls, ...k.roofs]), 3, 0.25)
  const wallMesh = new THREE.Mesh(walls, buildMat)
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  group.add(wallMesh)
  // The owner's colour: banners, awnings, shields and ribbons (plain undyed cloth while free).
  const roofMat = applyVision(new THREE.MeshStandardMaterial({ color: owned ? color : NEUTRAL_CLOTH, flatShading: true, roughness: 0.8, vertexColors: true }))
  if (k.accents.length && !ruined) {
    const acc = new THREE.Mesh(bmerge(k.accents), roofMat)
    acc.castShadow = true
    group.add(acc)
  }
  if (lamps.length) group.add(new THREE.Mesh(merge(lamps), lampMat))
  if (k.glow.length && !ruined) group.add(new THREE.Mesh(bmerge(k.glow), glowMat))
  if (water.length) group.add(new THREE.Mesh(merge(water), waterMat))
  // A banner: plain while free, the lord's colour once sworn.
  const flagGeo = new THREE.PlaneGeometry(6, 3.6, 6, 2)
  flagGeo.translate(3, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color: owned ? color : '#bdb8ac', side: THREE.DoubleSide, roughness: 0.8 })))
  flag.position.set(flagAt[0], flagAt[1], flagAt[2])
  flag.visible = !ruined
  if (!ruined) {
    const pk = newKit()
    ROOT.put(pk.walls, cyl(0.22, 0.26, 6, 6), PAL.timber, flagAt[0], flagAt[1] - 1, flagAt[2])
    ROOT.put(pk.walls, sphere(0.35, 0), 0xd9b24a, flagAt[0], flagAt[1] + 2.1, flagAt[2])
    group.add(new THREE.Mesh(bmerge(pk.walls), buildMat))
  }
  group.add(flag)
  return { group, roofMat, flag, flagBase }
}

/** A village chapel: nave, bell tower with louvres and a spire, a porch, a churchyard. Returns where its banner flies. */
export function chapel(k: Kit, f: Frame, rnd: () => number, ruined: boolean): [number, number, number] {
  const ST = ruined ? 0x3a3530 : 0xb7ad99
  f.put(k.walls, box(10, 2.4, 7), PAL.stoneD, 0, -0.3, 0, { ao: 0.1 })
  f.put(k.walls, box(9, ruined ? 3.5 : 6.4, 6), ST, 0, ruined ? 2.6 : 4.1, 0)
  if (ruined) return [0, 0, 0]
  // Buttresses along the nave and lancet windows between them.
  for (const s of [-1, 1])
    for (const x of [-3.8, 0, 3.8]) {
      f.put(k.walls, box(0.8, 5, 1.0), PAL.stone, x, 3.4, s * 3.3)
      f.put(k.walls, box(0.8, 1.2, 0.7), PAL.stone, x, 6.2, s * 3.1, { rx: s * 0.5 })
    }
  for (const s of [-1, 1]) for (const x of [-1.9, 1.9]) f.put(k.walls, box(0.7, 2.2, 0.12), PAL.dark, x, 4.2, s * 3.02, { ao: 0 })
  f.put(k.roofs, gable(7.6, 10, 4.4), PAL.slate[0], 0, 7.2, 0)
  f.put(k.roofs, box(10.3, 0.3, 0.5), PAL.timber, 0, 11.6, 0)
  // West tower: belfry with louvres, a pyramid spire and a weathercock.
  f.put(k.walls, box(4, 13, 4), ST, 6.2, 6.6, 0)
  f.put(k.walls, box(4.4, 0.4, 4.4), PAL.stoneL, 6.2, 9.4, 0)
  for (const [dx, dz, ry] of [[0, 2.02, 0], [0, -2.02, 0], [2.02, 0, Math.PI / 2], [-2.02, 0, Math.PI / 2]] as const) {
    f.put(k.walls, box(1.4, 2.2, 0.14), PAL.dark, 6.2 + dx, 11.1, dz, { ry, ao: 0 })
    for (let i = 0; i < 3; i++) f.put(k.walls, box(1.5, 0.16, 0.3), PAL.timber, 6.2 + dx * 1.04, 10.4 + i * 0.6, dz * 1.04, { ry, ao: 0 })
  }
  f.put(k.roofs, cone(3.4, 7, 4), PAL.slate[1], 6.2, 16.6, 0, { ry: Math.PI / 4 })
  f.put(k.walls, cyl(0.06, 0.06, 1.6, 4), PAL.iron, 6.2, 20.8, 0, { ao: 0 })
  f.put(k.walls, box(0.9, 0.5, 0.1), PAL.iron, 6.2, 21.3, 0, { ao: 0 })
  // Porch and door, a round window over it.
  f.put(k.walls, box(2.6, 3.2, 2.2), ST, -5.6, 1.6, 0)
  f.put(k.roofs, gable(3.2, 3.0, 1.4), PAL.slate[2], -5.6, 3.2, 0, { ry: Math.PI / 2 })
  f.put(k.walls, box(0.14, 2.2, 1.3), PAL.dark, -6.92, 1.2, 0, { ao: 0 })
  f.put(k.walls, cyl(0.9, 0.9, 0.14, 12), PAL.dark, -4.52, 6.2, 0, { rz: Math.PI / 2, ao: 0 })
  // The churchyard: a low wall, crosses and a yew.
  for (let i = 0; i < 5; i++) {
    const x = -2 + i * 1.8
    const z = 6 + (i % 2) * 1.5
    f.put(k.walls, box(0.25, 1.4, 0.25), 0x9a9486, x, 0.7, z)
    f.put(k.walls, box(0.9, 0.22, 0.25), 0x9a9486, x, 1.05, z)
  }
  f.put(k.walls, box(12, 0.9, 0.6), PAL.stoneD, 1, 0.45, 9.4)
  tree(k, f, -4, 7.5, rnd, 0.8)
  return [6.2, 24, 0]
}

/** Caravanserai: a fortified court of arcades round a fountain, a great gate, tents, camels and bales. */
function caravanserai(k: Kit, water: THREE.BufferGeometry[], ruined: boolean): [number, number, number] {
  const S = 30
  const SAND = ruined ? 0x3a3430 : 0xd8c49a
  const SAND_D = ruined ? 0x2c2825 : 0xbfa77a
  const H = ruined ? 3 : 7.5
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2
    const f = new Frame(Math.cos(a) * (S / 2), Math.sin(a) * (S / 2), Math.atan2(-Math.cos(a), -Math.sin(a)))
    // The outer wall of the range, with a crenellated parapet.
    f.put(k.walls, box(S + 6, H, 2), SAND, 0, H / 2, -1.5)
    if (ruined) continue
    f.put(k.walls, box(S + 6.4, 0.6, 2.4), SAND_D, 0, H, -1.5)
    for (let x = -S / 2 - 2; x <= S / 2 + 2; x += 2.2) f.put(k.walls, box(1.1, 1.1, 0.6), SAND, x, H + 0.85, -2.4)
    // Arcade along the court: columns, capitals, round arches, and the vaulted walk behind.
    f.put(k.walls, box(S - 4, 0.6, 5), SAND_D, 0, 0.3, 1.5)
    for (let i = 0; i <= 6; i++) {
      const x = -S / 2 + 3 + i * ((S - 6) / 6)
      f.put(k.walls, cyl(0.45, 0.55, 4.2, 8), SAND, x, 2.7, 3.6)
      f.put(k.walls, box(1.3, 0.4, 1.3), SAND_D, x, 4.9, 3.6)
      if (i < 6) f.put(k.walls, new THREE.TorusGeometry((S - 6) / 12, 0.4, 4, 10, Math.PI), SAND, x + (S - 6) / 12, 5.0, 3.6, { ao: 0 })
      if (i < 6) f.put(k.walls, box(1.6, 2.4, 0.12), PAL.dark, x + (S - 6) / 12, 2.8, -0.3, { ao: 0 })
    }
    f.put(k.walls, box(S - 2, 1.6, 5.4), SAND, 0, 6.2, 1.2)
    f.put(k.roofs, box(S - 1.6, 0.35, 5.8), shade(PAL.tile[1], 0.05), 0, 7.1, 1.2)
    // Awnings and goods along the walk.
    for (let i = 0; i < 3; i++) {
      const x = -9 + i * 9
      f.put(k.accents, box(3.4, 0.12, 2.2), 0xffffff, x, 4.4, 5.0, { rx: 0.35 })
      crate(k, f, x - 1, 0.6, 2.4, 1.2)
      f.put(k.walls, sphere(0.7, 0), 0xcdbf98, x + 1, 1.2, 2.2, { sy: 0.7 })
    }
  }
  // Corner towers with little domes.
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    O().put(k.walls, cyl(3, 3.4, ruined ? 4 : 10, 12), SAND, x * (S / 2 + 1), ruined ? 2 : 5, z * (S / 2 + 1))
    if (ruined) continue
    O().put(k.walls, cyl(3.4, 3.4, 0.6, 12), SAND_D, x * (S / 2 + 1), 10.2, z * (S / 2 + 1))
    O().put(k.roofs, new THREE.SphereGeometry(2.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9c28f, x * (S / 2 + 1), 10.4, z * (S / 2 + 1))
    O().put(k.walls, cone(0.3, 1.4, 6), 0xd9b24a, x * (S / 2 + 1), 13.6, z * (S / 2 + 1), { ao: 0 })
  }
  if (ruined) return [0, 0, 0]
  // The great gate on the road: a tall portal with a deep arch.
  const g = new Frame(S / 2 + 1.5, 0, Math.PI / 2)
  g.put(k.walls, box(12, 13, 5), SAND, 0, 6.5, 0)
  g.put(k.walls, box(12.6, 0.8, 5.6), SAND_D, 0, 13, 0)
  for (let x = -5.6; x <= 5.6; x += 2.24) g.put(k.walls, box(1.1, 1.3, 0.8), SAND, x, 14, 2.2)
  g.put(k.walls, box(6, 8, 5.4), PAL.dark, 0, 4, 0.2, { ao: 0 })
  g.put(k.walls, new THREE.TorusGeometry(3.2, 0.6, 4, 12, Math.PI), SAND_D, 0, 8, 2.6, { ao: 0 })
  g.put(k.walls, box(7.6, 0.7, 0.5), SAND_D, 0, 11.4, 2.6)
  for (const s of [-1, 1]) g.put(k.accents, box(1.6, 4.6, 0.12), 0xffffff, s * 4.6, 7.6, 2.62)
  // In the court: a fountain, tents, camels and stacked bales.
  O().put(k.walls, cyl(4.2, 4.6, 1.2, 8), SAND_D, 0, 0.6, 0)
  O().put(k.walls, cyl(1, 1.2, 2.4, 8), SAND, 0, 1.6, 0)
  O().put(k.walls, cyl(1.8, 1.4, 0.4, 8), SAND, 0, 2.9, 0)
  water.push(cyl(3.6, 3.6, 0.2, 8).translate(0, 1.15, 0))
  tent(k, new Frame(-8, 8, 0.4), 0, 0, 3.2, 'accent')
  tent(k, new Frame(-9, -7, -0.3), 0, 0, 2.8, 'canvas')
  camel(k, new Frame(7, 7, 2.2))
  camel(k, new Frame(8, -6, 0.6))
  for (let i = 0; i < 5; i++) crate(k, O(), -2 + (i % 3) * 1.4, Math.floor(i / 3) * 1.3, -10 + (i % 2) * 0.4, 1.3)
  return [S / 2 + 1.5, 19, 0]
}

/** A camel, sitting down to rest or standing to be loaded. */
function camel(k: Kit, f: Frame) {
  const C = 0xc69a62
  f.put(k.walls, box(1.6, 1.5, 3.6), C, 0, 2.6, 0)
  f.put(k.walls, sphere(0.9, 0), C, 0, 3.6, -0.3)
  f.put(k.walls, box(0.6, 2.2, 0.6), C, 0, 3.6, 2.0, { rx: -0.5 })
  f.put(k.walls, box(0.6, 0.6, 1.3), C, 0, 4.7, 2.7)
  for (const [x, z] of [[-0.55, 1.3], [0.55, 1.3], [-0.55, -1.3], [0.55, -1.3]]) f.put(k.walls, box(0.3, 2, 0.3), shade(C, -0.15), x, 1, z)
  f.put(k.accents, box(1.8, 0.5, 1.2), 0xffffff, 0, 3.4, 0.8)
}

/** Abbey: a church with aisles, flying buttresses and an apse, a crossing tower and spire, a cloister, gardens, beehives and a fishpond. */
function abbey(k: Kit, water: THREE.BufferGeometry[], rnd: () => number, ruined: boolean): [number, number, number] {
  const ST = ruined ? 0x3a3530 : 0xd6cdb6
  const ST_D = ruined ? 0x2c2825 : 0xb9af98
  const f = new Frame(-2, -8, 0)
  const L = 24
  f.put(k.walls, box(L + 6, 2.6, 15), PAL.stoneD, 1, -0.3, 0, { ao: 0.1 })
  // Nave (tall, with a clerestory) and lower aisles either side.
  f.put(k.walls, box(L, ruined ? 5 : 12, 7), ST, 0, ruined ? 3.5 : 7, 0)
  if (ruined) {
    for (const s of [-1, 1]) f.put(k.walls, box(L, 3, 3.4), ST_D, 0, 2.5, s * 5)
    return [0, 0, 0]
  }
  for (const s of [-1, 1]) {
    f.put(k.walls, box(L, 6, 3.4), ST_D, 0, 4, s * 5.2)
    f.put(k.roofs, box(L + 0.6, 0.3, 4.4), PAL.slate[0], 0, 7.4, s * 5.4, { rx: s * 0.42 })
    for (let i = 0; i < 5; i++) {
      const x = -L / 2 + 2.4 + i * ((L - 4.8) / 4)
      // Buttress pier on the aisle wall with a pinnacle; a flying buttress arching up to the clerestory.
      f.put(k.walls, box(1.1, 8, 1.4), ST_D, x, 4, s * 7.4)
      f.put(k.walls, cone(0.6, 2, 4), ST, x, 9, s * 7.4, { ry: Math.PI / 4 })
      f.put(k.walls, box(0.7, 0.8, 4.6), ST, x, 9.2, s * 5.4, { rx: s * -0.55 })
      // Aisle windows and clerestory lancets.
      if (i < 4) {
        f.put(k.walls, box(1, 2.6, 0.14), PAL.dark, x + (L - 4.8) / 8, 4, s * 6.92, { ao: 0 })
        f.put(k.walls, box(0.8, 2.2, 0.14), PAL.dark, x + (L - 4.8) / 8, 10.6, s * 3.52, { ao: 0 })
      }
    }
  }
  f.put(k.roofs, gable(8.4, L + 0.8, 5.6), PAL.slate[1], 0, 13, 0)
  f.put(k.roofs, box(L + 1, 0.35, 0.6), 0x4a4e55, 0, 18.6, 0)
  // Apse: a rounded east end with a half-cone roof.
  f.put(k.walls, new THREE.CylinderGeometry(3.5, 3.5, 12, 12, 1, false, 0, Math.PI), ST, L / 2, 7, 0, { ry: Math.PI / 2 })
  f.put(k.roofs, new THREE.ConeGeometry(4, 4.5, 12, 1, false, 0, Math.PI), PAL.slate[2], L / 2, 15.2, 0, { ry: Math.PI / 2 })
  // West front: a great door and a rose window.
  f.put(k.walls, box(0.2, 4.4, 2.6), PAL.dark, -L / 2 - 0.02, 3.2, 0, { ao: 0 })
  f.put(k.walls, new THREE.TorusGeometry(1.3, 0.25, 4, 12, Math.PI), ST_D, -L / 2 - 0.1, 5.4, 0, { ry: Math.PI / 2, ao: 0 })
  f.put(k.walls, cyl(1.7, 1.7, 0.16, 16), PAL.dark, -L / 2 - 0.04, 9.6, 0, { rz: Math.PI / 2, ao: 0 })
  f.put(k.walls, cyl(1.9, 1.9, 0.1, 16), ST_D, -L / 2 - 0.02, 9.6, 0, { rz: Math.PI / 2, ao: 0 })
  // Crossing tower with belfry and a tall spire ringed by pinnacles.
  const tx = 3
  f.put(k.walls, box(6, 26, 6), ST, tx, 13, 0)
  f.put(k.walls, box(6.6, 0.6, 6.6), ST_D, tx, 20, 0)
  for (const [dx, dz, ry] of [[0, 3.02, 0], [0, -3.02, 0], [3.02, 0, Math.PI / 2], [-3.02, 0, Math.PI / 2]] as const)
    for (const o of [-1.2, 1.2]) f.put(k.walls, box(0.9, 3.2, 0.14), PAL.dark, tx + dx + (ry ? 0 : o), 23, dz + (ry ? o : 0), { ry, ao: 0 })
  f.put(k.walls, box(6.8, 0.8, 6.8), ST_D, tx, 26.3, 0)
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) f.put(k.walls, cone(0.6, 3.4, 4), ST, tx + x * 3, 28.3, z * 3)
  f.put(k.roofs, cone(3.6, 15, 8), PAL.slate[0], tx, 34.2, 0)
  f.put(k.walls, cyl(0.08, 0.08, 2, 4), 0xd9b24a, tx, 42.6, 0, { ao: 0 })
  f.put(k.walls, box(1, 0.16, 0.16), 0xd9b24a, tx, 42.9, 0, { ao: 0 })
  // Cloister: arcaded walks round a green garth with a well-head and a tree.
  const cf = new Frame(-3, 12, 0)
  cf.put(k.walls, box(17, 0.4, 17), 0x6f8f3a, 0, 0.3, 0, { ao: 0 })
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2
    const side = cf.sub(Math.cos(a) * 8, Math.sin(a) * 8, Math.atan2(-Math.cos(a), -Math.sin(a)))
    side.put(k.walls, box(17, 4.6, 1.2), ST_D, 0, 2.3, -1.4)
    side.put(k.roofs, box(17.4, 0.3, 3.4), PAL.slate[2], 0, 5.0, -0.2, { rx: 0.3 })
    for (let i = 0; i < 6; i++) {
      const x = -7.5 + i * 3
      side.put(k.walls, cyl(0.25, 0.3, 3.2, 6), ST, x, 1.6, 1)
      if (i < 5) side.put(k.walls, new THREE.TorusGeometry(1.5, 0.22, 3, 8, Math.PI), ST, x + 1.5, 3.2, 1, { ao: 0 })
    }
  }
  cf.put(k.walls, cyl(1, 1.1, 1, 8), PAL.stone, 0, 0.8, 0)
  tree(k, cf, 3.5, 3.5, rnd, 0.8)
  // Herb beds, beehives (skeps) and a fishpond.
  for (let i = 0; i < 6; i++) O().put(k.walls, box(4, 0.6, 2.2), [0x7a8a3a, 0x8a6a8a, 0x6a8a5a][i % 3], 16 + (i % 2) * 5, 0.4, 6 + Math.floor(i / 2) * 3.4, { jitter: 0.15 })
  for (let i = 0; i < 4; i++) {
    O().put(k.walls, box(0.9, 0.9, 0.9), PAL.timber, 25, 0.45, 6 + i * 2)
    O().put(k.walls, cone(0.8, 1.3, 8), 0xc9a45a, 25, 1.55, 6 + i * 2)
  }
  water.push(cyl(5, 5, 0.2, 14).translate(18, 0.5, 20))
  O().put(k.walls, cyl(5.6, 5.8, 0.6, 14), PAL.stoneD, 18, 0.3, 20)
  return [tx - 2, 44, -8]
}

/** Wardens' keep: a battered tower with machicolations and a beacon, barracks, stables, a smithy, a training yard. */
function wardensKeep(k: Kit, rnd: () => number, ruined: boolean, owned: boolean): [number, number, number] {
  const ST = ruined ? 0x3a3530 : 0xa8a294
  const ST_D = ruined ? 0x2c2825 : 0x8d877b
  const th = ruined ? 9 : 26
  const f = new Frame(0, -2, 0)
  // A splayed (battered) base, the tower, string courses.
  f.put(k.walls, box(14.5, 4, 14.5), ST_D, 0, 1, 0)
  f.put(k.walls, box(12.4, 1.6, 12.4), ST_D, 0, 3.6, 0, { rx: 0 })
  f.put(k.walls, box(11, th, 11), ST, 0, th / 2, 0)
  if (ruined) return [0, 0, 0]
  for (const y of [9, 17]) f.put(k.walls, box(11.4, 0.4, 11.4), ST_D, 0, y, 0)
  // Arrow slits on every face, three tiers.
  for (const [dx, dz, ry] of [[0, 5.52, 0], [0, -5.52, 0], [5.52, 0, Math.PI / 2], [-5.52, 0, Math.PI / 2]] as const)
    for (const y of [7, 13, 20]) for (const o of [-2.4, 2.4]) f.put(k.walls, box(0.3, 1.8, 0.12), PAL.dark, dx + (ry ? 0 : o), y, dz + (ry ? o : 0), { ry, ao: 0 })
  // Corbels and machicolations under the parapet, then the crenellations.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const side = f.sub(Math.cos(a) * 5.5, Math.sin(a) * 5.5, -a + Math.PI / 2)
    for (let x = -5; x <= 5; x += 1.25) side.put(k.walls, box(0.5, 1.1, 1.2), ST_D, x, th - 0.4, 0.5, { ao: 0.1 })
    side.put(k.walls, box(12.6, 1.6, 1.4), ST, 0, th + 0.9, 0.6)
    for (let x = -5.6; x <= 5.6; x += 1.6) side.put(k.walls, box(0.9, 1.4, 1.2), ST, x, th + 2.4, 0.7)
  }
  // The beacon: a great iron basket ready to be lit.
  brazier(k, f, 0, th + 0.2, 0)
  f.put(k.walls, box(9.6, 0.4, 9.6), ST_D, 0, th + 0.1, 0)
  // Door up a timber stair.
  f.put(k.walls, box(1.6, 2.4, 0.2), PAL.dark, 0, 7.4, 5.52, { ao: 0 })
  for (let i = 0; i < 6; i++) f.put(k.walls, box(2, 0.3, 1), PAL.timberL, 0, 0.6 + i * 1.1, 11.5 - i * 1.1)
  f.put(k.walls, box(2.6, 0.3, 2.2), PAL.timber, 0, 6.3, 6.6)
  // Barracks and the stable with open stalls.
  house(k, new Frame(-15, 13, Math.PI), { w: 14, d: 6, storeys: 1, roof: 'shingle', style: 'stone', annex: false, banner: owned }, rnd)
  const st = new Frame(15, 14, Math.PI)
  st.put(k.walls, box(14, 3.6, 0.5), PAL.timberL, 0, 1.8, -3)
  for (let i = 0; i < 5; i++) {
    st.put(k.walls, box(0.35, 3.8, 0.35), PAL.timber, -7 + i * 3.5, 1.9, 2.8)
    st.put(k.walls, box(0.2, 1.4, 5.6), PAL.timberL, -7 + i * 3.5, 0.9, 0)
  }
  st.put(k.roofs, gable(8.2, 15.4, 3), PAL.thatch[0], 0, 3.7, 0)
  st.put(k.roofs, box(15.6, 0.5, 0.8), PAL.thatchD, 0, 6.6, 0)
  for (const x of [-5.2, -1.7, 1.8]) horse(k, st.sub(x, 0, Math.PI / 2), [0x5a3e2a, 0x7a5a3a, 0x3a2a20][Math.floor(rnd() * 3)])
  haystack(k, st, 9, 2, 0.7)
  // Smithy: an open-fronted shed, a forge glowing under its hood, an anvil.
  const sm = new Frame(-16, -12, 0.2)
  sm.put(k.walls, box(8, 4, 0.5), PAL.stoneL, 0, 2, -2.6)
  for (const s of [-1, 1]) sm.put(k.walls, box(0.4, 4, 5.4), PAL.stone, s * 3.9, 2, 0)
  sm.put(k.roofs, box(9, 0.3, 6.4), PAL.shingle[0], 0, 4.4, 0.2, { rx: 0.15 })
  sm.put(k.walls, box(2.6, 1.4, 2), PAL.stone, -1.6, 0.7, -1.2)
  sm.put(k.glow, box(1.8, 0.4, 1.4), 0xffffff, -1.6, 1.5, -1.2)
  sm.put(k.walls, box(1.2, 5, 1.2), PAL.stone, -1.6, 5.5, -2.2)
  sm.put(k.walls, box(1.2, 0.8, 0.5), PAL.iron, 1.5, 1.1, 0.6)
  sm.put(k.walls, cyl(0.4, 0.5, 0.8, 6), PAL.timber, 1.5, 0.4, 0.6)
  // Training yard: a fenced ring, pell posts, archery butts, a weapon rack.
  const ty = new Frame(14, -12, 0)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    ty.put(k.walls, box(0.3, 1.6, 0.3), PAL.timber, Math.cos(a) * 9, 0.8, Math.sin(a) * 9, { ao: 0.1 })
    ty.put(k.walls, box(2.9, 0.18, 0.14), PAL.timberL, Math.cos(a + 0.157) * 9, 1.3, Math.sin(a + 0.157) * 9, { ry: -a - 0.157 + Math.PI / 2, ao: 0 })
  }
  for (const [x, z] of [[-3, 2], [0, -3], [3, 2]]) ty.put(k.walls, cyl(0.35, 0.4, 2.6, 6), PAL.timberL, x, 1.3, z)
  for (const x of [-3, 3]) {
    ty.put(k.walls, cyl(1.3, 1.3, 0.5, 12), 0xd4b866, x, 1.8, -7, { rx: Math.PI / 2 })
    ty.put(k.accents, cyl(0.7, 0.7, 0.52, 12), 0xffffff, x, 1.8, -7, { rx: Math.PI / 2 })
    ty.put(k.walls, cyl(0.25, 0.25, 0.54, 8), 0x2a2420, x, 1.8, -7, { rx: Math.PI / 2, ao: 0 })
  }
  ty.put(k.walls, box(3, 0.2, 0.2), PAL.timber, 6, 1.8, 3)
  for (let i = 0; i < 4; i++) ty.put(k.walls, box(0.08, 2.6, 0.08), 0x9a9a98, 4.9 + i * 0.7, 1.3, 3.1, { rz: 0.1, ao: 0 })
  for (const s of [-1, 1]) bannerPole(k, new Frame(s * 6.5, 6.5, 0), 0, 0, 8)
  return [0, th + 9.5, -2]
}

/** Siege guildhall: workshops round a yard, a watermill with a paddle wheel on its race, a forge, a treadwheel crane over a half-built tower, stone and timber stacks. */
function guildhall(k: Kit, water: THREE.BufferGeometry[], rnd: () => number, ruined: boolean, owned: boolean): [number, number, number] {
  house(k, new Frame(-6, -8, 0), { w: 16, d: 8, storeys: 2, roof: 'tile', style: 'stone', ruined, banner: owned }, rnd)
  house(k, new Frame(11, -10, 0), { w: 10, d: 7, storeys: 1, roof: 'shingle', style: 'timber', ruined, annex: true }, rnd)
  if (ruined) return [0, 0, 0]
  // Mill pond, race and the mill with its wheel.
  water.push(cyl(9, 9, 0.2, 18).translate(-15, 0.35, 13))
  water.push(new THREE.BoxGeometry(14, 0.2, 3).translate(-3, 0.45, 13))
  O().put(k.walls, cyl(9.6, 10, 0.5, 18), PAL.stoneD, -15, 0.15, 13, { ao: 0 })
  for (const s of [-1, 1]) O().put(k.walls, box(14, 1.2, 0.6), PAL.stone, -3, 0.6, 13 + s * 1.8)
  const mf = new Frame(3, 18, 0)
  house(k, mf, { w: 8, d: 6, storeys: 2, roof: 'shingle', style: 'stone', annex: false }, rnd)
  // The wheel: twin rims, spokes, paddles round the rim, an axle into the mill.
  const wf = mf.sub(-7, -5, 0, 0)
  for (const s of [-0.8, 0.8]) wf.put(k.walls, new THREE.TorusGeometry(4.6, 0.25, 4, 20), 0x5a3f24, s, 5, 0, { ry: Math.PI / 2, ao: 0 })
  for (let i = 0; i < 8; i++) wf.put(k.walls, box(1.8, 9, 0.25), 0x6b4a2a, 0, 5, 0, { rx: (i / 8) * Math.PI, ao: 0 })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    wf.put(k.walls, box(2, 0.12, 1.2), 0x7a5a36, 0, 5 + Math.sin(a) * 4.8, Math.cos(a) * 4.8, { rx: -a, ao: 0 })
  }
  wf.put(k.walls, cyl(0.45, 0.45, 5, 8), PAL.iron, 2.2, 5, 0, { rz: Math.PI / 2, ao: 0 })
  // Forge: a stone hearth glowing under a great hood and chimney; an anvil and a quench tub.
  const fg = new Frame(16, 8, -Math.PI / 2)
  fg.put(k.walls, box(9, 5, 0.6), PAL.stone, 0, 2.5, -3)
  for (const s of [-1, 1]) fg.put(k.walls, box(0.6, 5, 6), PAL.stone, s * 4.4, 2.5, 0)
  fg.put(k.roofs, box(10, 0.3, 7), PAL.tile[0], 0, 5.3, 0.2, { rx: 0.18 })
  fg.put(k.walls, box(3.2, 1.6, 2.4), PAL.stone, -1.6, 0.8, -1.4)
  fg.put(k.glow, box(2.4, 0.5, 1.6), 0xffffff, -1.6, 1.8, -1.3)
  fg.put(k.walls, box(3, 1.6, 2.6), PAL.stoneD, -1.6, 3.6, -1.6)
  fg.put(k.walls, box(1.3, 7, 1.3), PAL.stone, -1.6, 7, -2.2)
  fg.put(k.walls, box(1.4, 0.8, 0.6), PAL.iron, 1.8, 1.2, 0.8)
  fg.put(k.walls, cyl(0.45, 0.55, 0.8, 6), PAL.timber, 1.8, 0.4, 0.8)
  barrel(k, fg, 3.2, 1.5, 0.9)
  // A half-built tower in scaffolding, with a treadwheel crane lifting a block.
  const tw = new Frame(-17, -2, 0.3)
  tw.put(k.walls, cyl(4, 4.4, 9, 12), PAL.stoneL, 0, 4.5, 0)
  for (let y = 9; y < 11; y += 0.8) for (let i = 0; i < 12; i += 2) tw.put(k.walls, box(1.6, 0.7, 1), PAL.stoneL, Math.cos((i / 12) * 6.28) * 4, y, Math.sin((i / 12) * 6.28) * 4, { ry: -(i / 12) * 6.28 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    tw.put(k.walls, cyl(0.12, 0.12, 13, 4), 0x8a6a40, Math.cos(a) * 5.4, 6.5, Math.sin(a) * 5.4, { ao: 0 })
  }
  for (const y of [4, 8, 12]) tw.put(k.walls, cyl(5.6, 5.6, 0.18, 12), 0x9a7a4c, 0, y, 0, { ao: 0 })
  const cr = tw.sub(7, 1, 0)
  for (const s of [-1, 1]) cr.put(k.walls, box(0.4, 16, 0.4), PAL.timber, s * 1.6, 7.6, 0, { rz: s * -0.1 })
  cr.put(k.walls, box(0.4, 0.4, 3), PAL.timber, 0, 15, 0)
  cr.put(k.walls, box(12, 0.45, 0.45), PAL.timberL, -4, 15.4, 0, { rz: 0.12 })
  cr.put(k.walls, box(0.06, 6, 0.06), 0xb8ab8a, -9.4, 12, 0, { ao: 0 })
  cr.put(k.walls, box(1.6, 1.1, 1.2), PAL.stoneL, -9.4, 8.6, 0)
  for (const s of [-1, 1]) cr.put(k.walls, new THREE.TorusGeometry(2.4, 0.2, 4, 16), PAL.timberL, 0, 2.6, s * 1.2, { ao: 0 })
  for (let i = 0; i < 8; i++) cr.put(k.walls, box(0.2, 0.2, 2.4), PAL.timber, Math.cos((i / 8) * 6.28) * 2.4, 2.6 + Math.sin((i / 8) * 6.28) * 2.4, 0, { ao: 0 })
  // Stacks of dressed stone and seasoned timber.
  for (let i = 0; i < 9; i++) O().put(k.walls, box(1.8, 1.1, 1.2), PAL.stoneL, 4 + (i % 3) * 1.9, 0.55 + Math.floor(i / 3) * 1.1, -22 + (Math.floor(i / 3) % 2) * 0.3)
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) O().put(k.walls, box(0.9, 0.9, 9), i % 2 ? 0x8a6a40 : 0x7a5a36, 20 + i * 1 + r * 0.5, 0.45 + r * 0.9, -4, { ao: 0.1 })
  wheel(k, O(), 12, 1.2, 2, 1.2)
  cart(k, new Frame(8, 4, 0.8), 'barrels', rnd)
  return [-6, 24, -8]
}

/** The stone circuit of a walled holding: curtain, walk, merlons, towers, gatehouses, lanterns and painted shields. */
function stoneCircuit(k: Kit, lamps: THREE.BufferGeometry[], rnd: () => number) {
  const n = 20
  const R = 37
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const mid = (a0 + a1) / 2
    if (Math.abs(Math.sin(mid)) < 0.16) continue // two gates
    const f = new Frame(Math.cos(mid) * R, Math.sin(mid) * R, Math.atan2(Math.cos(mid), Math.sin(mid)))
    const len = 2 * R * Math.sin(Math.PI / n) + 0.4
    f.put(k.walls, box(len, 2.4, 2.8), 0x8d877b, 0, -0.2, 0, { ao: 0.1 })
    f.put(k.walls, box(len, 6, 2), 0xa39d90, 0, 3, 0)
    f.put(k.walls, box(len + 0.1, 0.4, 2.6), 0x8d877b, 0, 6.1, 0)
    for (let x = -len / 2 + 0.7; x < len / 2; x += 1.8) f.put(k.walls, box(0.9, 1.2, 0.6), 0xa39d90, x, 6.9, 0.8)
    if (i % 2 === 0) f.put(k.walls, box(0.25, 1.1, 0.12), PAL.dark, 0, 3.6, 1.02, { ao: 0 })
  }
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(a) * R
    const z = Math.sin(a) * R
    O().put(k.walls, cyl(3.1, 3.6, 10, 14), 0x9a9486, x, 5, z)
    O().put(k.walls, cyl(3.5, 3.5, 0.6, 14), 0x8d877b, x, 10.1, z)
    O().put(k.roofs, cone(4, 5, 14), PAL.slate[Math.floor(rnd() * 3)], x, 12.9, z)
    O().put(k.accents, box(0.8, 2, 0.08), 0xffffff, x * 1.09, 6.5, z * 1.09, { ry: Math.atan2(x, z) })
  }
  for (const g of [0, Math.PI]) {
    const f = new Frame(Math.cos(g) * R, 0, g === 0 ? Math.PI / 2 : -Math.PI / 2)
    for (const s of [-1, 1]) {
      f.put(k.walls, box(4, 10, 4.6), 0xa39d90, s * 5.6, 5, 0)
      f.put(k.walls, box(4.4, 0.5, 5), 0x8d877b, s * 5.6, 10.2, 0)
      for (const o of [-1.4, 1.4]) f.put(k.walls, box(1.1, 1.2, 1), 0xa39d90, s * 5.6 + o, 11, 2)
    }
    f.put(k.walls, box(8, 3, 4.6), 0xa39d90, 0, 8.5, 0)
    f.put(k.walls, new THREE.TorusGeometry(3.4, 0.5, 4, 12, Math.PI), 0x8d877b, 0, 6.6, 2.4, { ao: 0 })
    for (let i = -3; i <= 3; i++) f.put(k.walls, box(0.18, 2.4, 0.18), PAL.iron, i * 0.9, 8.4, 2.1, { ao: 0 })
    f.put(k.accents, box(2.2, 2.6, 0.12), 0xffffff, 0, 8.6, 2.42)
    for (const s of [-1, 1]) lamps.push(sphere(0.6, 1).translate(...rot(f, s * 3.2, 5.5, 2.6)))
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13
    lamps.push(sphere(0.5, 0).translate(Math.cos(a) * 36, 7.6, Math.sin(a) * 36))
  }
}

/** A timber palisade with a fighting walk, and gate towers with shields. */
function palisade(k: Kit) {
  const R = 37
  for (let i = 0; i < 58; i++) {
    const a = (i / 58) * Math.PI * 2
    if (Math.abs(Math.sin(a)) < 0.12) continue
    const h = 5.2 + (i % 3) * 0.35
    O().put(k.walls, cyl(0.7, 0.85, h, 6), i % 2 ? 0x6b4a2a : 0x5a3d22, Math.cos(a) * R, h / 2 - 0.4, Math.sin(a) * R, { jitter: 0.1 })
    O().put(k.walls, cone(0.7, 1.2, 6), 0x4a321c, Math.cos(a) * R, h + 0.2, Math.sin(a) * R, { ao: 0 })
    if (i % 2 === 0) O().put(k.walls, box(2.2, 0.25, 1.4), 0x7a5a36, Math.cos(a) * (R - 1.3), 3.4, Math.sin(a) * (R - 1.3), { ry: -a + Math.PI / 2, ao: 0 })
  }
  for (const g of [0, Math.PI]) {
    const f = new Frame(Math.cos(g) * R, 0, g === 0 ? Math.PI / 2 : -Math.PI / 2)
    for (const s of [-1, 1]) {
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) f.put(k.walls, cyl(0.32, 0.38, 10, 5), 0x5a3d22, s * 6 + dx, 5, dz)
      f.put(k.walls, box(4.4, 0.6, 4.4), 0x6b4a2a, s * 6, 9.6, 0)
      for (const o of [-2.1, 2.1]) f.put(k.walls, box(4.4, 1.2, 0.2), 0x7a5a36, s * 6, 10.4, o)
      f.put(k.roofs, cone(3.6, 3, 4), PAL.shingle[0], s * 6, 12.4, 0, { ry: Math.PI / 4 })
      f.put(k.accents, cyl(0.9, 0.9, 0.12, 10), 0xffffff, s * 6, 7.2, 2.3, { rx: Math.PI / 2 })
    }
    f.put(k.walls, box(9, 0.6, 2.4), 0x6b4a2a, 0, 8.2, 0)
  }
}

/** The compound's own frame (no rotation). */
function O() {
  return ROOT
}
const ROOT = new Frame(0, 0, 0)

function rot(f: Frame, lx: number, ly: number, lz: number): [number, number, number] {
  const [x, z] = f.at(lx, lz)
  return [x, ly, z]
}
