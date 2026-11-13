import * as THREE from 'three'
import { Frame, PAL, barrel, cart, crate, fence, gable, haystack, horse, house, tent, tree, well, woodpile, type HouseOpts, type RoofKind } from './buildings'
import { bpart, box, cone, cyl, sphere } from './geo'
import { chapel } from './villages'
import { WATER_LEVEL } from '../game/world'
import { IRON, WOOD, WOOD_D, drape, facing, type Ctx } from './fortress'

/**
 * The town inside a castle's walls and its suburbs outside them.
 *
 * Inside, the town is laid out in streets and blocks: the four streets from the gates to the keep's
 * square lined shoulder to shoulder with tall jettied houses and shops; a ring lane between the
 * square and the curtain, and back lanes off it, lined with smaller houses; and in the blocks the
 * great buildings of a garrison town (a guildhall with its arcade on the square, a smithy whose
 * forge smokes, an armoury and weapon racks, barracks with a training yard of archery butts and a
 * quintain, stables, a chapel), with walled gardens, wells and a fountain between. A motte and
 * bailey has only its bailey: a hall, stables, a smithy, a granary on stilts, pens and sheds.
 *
 * Outside, a faubourg grows out of the main gate (and the others as the castle grows): a curving
 * road lined first with tall townhouses and shops pressed together near the gate, an inn with its
 * sign on a little plaza with a well and a market cross, then cottages with walled yards, then
 * farmsteads with barns and haystacks; side alleys branch off with cottages and workshops (a
 * tannery's racks, a potter's kiln, a carpenter's yard). On a slope every building stands on a
 * stepped stone footing.
 */
export function buildCastleTown(x: Ctx, outsideOnly = false) {
  if (!outsideOnly) {
    if (x.timber) bailey(x)
    else townInside(x)
  }
  faubourgs(x)
  if (x.country) camps(x)
}

/** Travellers camped by the roads outside a great city's gates: tents, a fire, horses on a picket line. */
function camps(x: Ctx) {
  const k = x.kit
  for (const g of x.gates) {
    for (let tries = 0, made = 0; tries < 40 && made < 2; tries++) {
      const a = g + (x.rnd() - 0.5) * 0.5
      const r = x.rAt(a) + 70 + x.rnd() * 90
      const px = Math.cos(a) * r
      const pz = Math.sin(a) * r
      if (!x.firm(px, pz, 9) || !x.free(px, pz, 11) || !x.laneClear(px, pz, 9)) continue
      made++
      x.taken.push({ x: px, z: pz, r: 11 })
      const y = x.G(px, pz)
      const f = new Frame(px, pz, x.rnd() * 6, y)
      for (let i = 0; i < 4; i++) {
        const b = (i / 4) * Math.PI * 2 + 0.4
        const [tx, tz] = f.at(Math.cos(b) * 6.5, Math.sin(b) * 6.5)
        tent(k, new Frame(tx, tz, x.rnd() * 6, x.G(tx, tz)), 0, 0, 2.8 + x.rnd(), x.rnd() < 0.3 ? 'accent' : 'canvas')
      }
      // The fire, its ring of stones, a pot on a tripod.
      for (let i = 0; i < 7; i++) f.put(k.flat!, sphere(0.35, 0), 0x7a746a, Math.cos(i) * 1.1, 0.2, Math.sin(i) * 1.1, { ao: 0 })
      f.put(k.glow, cone(0.6, 1.2, 6), 0xff8a3a, 0, 0.6, 0)
      for (let i = 0; i < 3; i++) f.put(k.flat!, box(0.1, 2.4, 0.1), PAL.timber, Math.cos(i * 2.1) * 0.8, 1.1, Math.sin(i * 2.1) * 0.8, { rz: Math.cos(i * 2.1) * -0.35, rx: Math.sin(i * 2.1) * 0.35, ao: 0 })
      x.smoke.push([px, y + 2, pz])
      for (let i = 0; i < 2; i++) horse(k, f.sub(-3 + i * 3, -10, 0.3), [0x5a3a22, 0x8a6a48][i])
      cart(k, f.sub(9, -4, 1.1), x.rnd() < 0.5 ? 'sacks' : 'barrels', x.rnd)
    }
  }
}

type Path = [number, number][]

/** Walk a polyline: the point and direction at distance s along it. */
function walker(path: Path) {
  const cum = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  const total = cum[cum.length - 1]
  const at = (s: number): { x: number; z: number; tx: number; tz: number } => {
    s = Math.max(0, Math.min(total, s))
    let i = 1
    while (i < cum.length - 1 && cum[i] < s) i++
    const [ax, az] = path[i - 1]
    const [bx, bz] = path[i]
    const L = cum[i] - cum[i - 1] || 1
    const t = (s - cum[i - 1]) / L
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L }
  }
  return { at, total }
}

/** A lane or road over the ground as a draped strip. */
function paveStrip(x: Ctx, path: Path, half: number, color: number, inside: boolean) {
  if (path.length < 2) return
  const quads: number[][] = []
  const y = (px: number, pz: number) => (inside ? 1.0 : x.G(px, pz) + 0.32)
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]
    const [bx, bz] = path[i + 1]
    const L = Math.hypot(bx - ax, bz - az) || 1
    const nx = -(bz - az) / L
    const nz = (bx - ax) / L
    const p = (px: number, pz: number, s: number): [number, number, number] => [px + nx * s, y(px + nx * s, pz + nz * s), pz + nz * s]
    quads.push([...p(ax, az, -half), ...p(bx, bz, -half), ...p(bx, bz, half), ...p(ax, az, half)])
  }
  x.flat.push(drape(quads, x.ruined ? 0x5a5040 : color, 0.08))
  x.lanes.push({ pts: path, half })
}

type Kind = 'town' | 'shop' | 'cottage' | 'row'

/** One building of a lane's row, standing on its footing. Returns false if it did not fit. */
function building(x: Ctx, cx: number, cz: number, ry: number, w: number, d: number, kind: Kind, inside: boolean, detail: 'high' | 'mid') {
  const k = x.kit
  const r = x.rnd
  const y = inside ? 0 : x.foot(cx, cz, w, d, ry)
  const f = new Frame(cx, cz, ry, y)
  if (x.ruined) {
    house(k, f, { w, d, roof: 'thatch', ruined: true }, r)
    return
  }
  const S0 = x.S0
  const roofs: RoofKind[] = kind === 'cottage' ? ['thatch', 'thatch', 'shingle', S0.roofs[0]] : S0.roofs
  const o: HouseOpts = {
    w,
    d,
    storeys: kind === 'cottage' ? 1 : kind === 'row' ? 2 : r() < 0.82 ? 2 : 1,
    roof: roofs[Math.floor(r() * roofs.length)],
    style: kind === 'cottage' ? (r() < 0.2 ? 'stone' : 'timber') : S0.houses === 'timber' ? (r() < 0.2 ? 'stone' : 'timber') : S0.houses,
    detail,
    annex: kind === 'cottage' && r() < 0.3,
    banner: kind !== 'cottage' && r() < 0.1,
  }
  const top = house(k, f, o, r)
  if (kind === 'shop') {
    // An awning in the lord's colours over the shop front, its wares out on trestles.
    f.put(k.accents, box(w * 0.8, 0.14, 2.2), 0xffffff, 0, 3.1, d / 2 + 1.0, { rx: 0.32 })
    for (const s of [-1, 1]) f.put(k.flat!, box(0.16, 2.6, 0.16), PAL.timber, s * w * 0.38, 1.6, d / 2 + 2)
    f.put(k.flat!, box(w * 0.6, 0.9, 1), WOOD, 0, 1.3, d / 2 + 1.4)
    crate(k, f, -w * 0.25, 1.8, d / 2 + 1.4, 0.7)
    barrel(k, f, w * 0.3, d / 2 + 1.6, 0.6)
  }
  if (r() < 0.22) x.smoke.push([cx, y + top + 1.2, cz])
}

/**
 * Line one side of a lane with buildings, front doors to it, from distance `from` to `to` along it.
 * `pick` chooses what goes up at a distance (or null to leave a gap); `gap` is the space between.
 */
function lineLane(x: Ctx, path: Path, side: 1 | -1, off: number, from: number, to: number, inside: boolean, pick: (s: number) => { kind: Kind; detail: 'high' | 'mid'; gap: number } | null) {
  const { at, total } = walker(path)
  let s = from
  const end = Math.min(to, total)
  while (s < end - 4) {
    const p = pick(s)
    if (!p) {
      s += 4
      continue
    }
    const r = x.rnd
    // Row houses: a terrace of two-storey houses under one long roof.
    const w = p.kind === 'cottage' ? 5.5 + r() * 2 : p.kind === 'row' ? 12 + r() * 4 : 6 + r() * 2.6
    const d = p.kind === 'cottage' ? 6.5 + r() * 2 : p.kind === 'row' ? 7 + r() : 8 + r() * 2.2
    const q = at(s + w / 2)
    const nx = -q.tz * side
    const nz = q.tx * side
    const cx = q.x + nx * (off + d / 2)
    const cz = q.z + nz * (off + d / 2)
    const rr = Math.max(w, d) * 0.5
    const ry = facing(-nx, -nz)
    const ok = inside ? x.inWalls(cx, cz, -12) && !x.onStreet(cx, cz, 7 + rr * 0.7) && Math.hypot(cx - x.keepAt[0], cz - x.keepAt[1]) > (x.innerR ? x.innerR + 6 : x.sq + 4) : !x.inWalls(cx, cz, 13) && x.firm(cx, cz, rr * 0.8) && !x.nearOuterWall(cx, cz, rr * 0.8)
    // The footprint itself (a house is deeper than it is wide: neighbours along the lane stand
    // wall to wall), clear of every lane but this one by a little.
    if (ok && x.freeRect(cx, cz, w / 2 + 0.1, d / 2 + 0.1, ry) && laneClearRect(x, cx, cz, w / 2, d / 2, ry, path)) {
      building(x, cx, cz, ry, w, d, p.kind, inside, p.detail)
      x.taken.push({ x: cx, z: cz, r: Math.hypot(w, d) / 2, hw: w / 2, hd: d / 2, ry })
      s += w + p.gap
    } else s += 1.5
  }
}

/** Are the corners and middle of a building's footprint clear of every lane (but its own)? */
function laneClearRect(x: Ctx, cx: number, cz: number, hw: number, hd: number, ry: number, own: Path) {
  const cs = Math.cos(ry)
  const sn = Math.sin(ry)
  for (const [lx, lz] of [[0, 0], [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, -hd], [0, hd]]) {
    if (!x.laneClear(cx + lx * cs + lz * sn, cz - lx * sn + lz * cs, 0.6, own)) return false
  }
  return true
}

/** A low wall of dry stone (or a wattle fence) round a yard, following the ground. */
export function yardWall(x: Ctx, cx: number, cz: number, ry: number, w: number, d: number, inside: boolean, gapSide = 2) {
  const cs = Math.cos(ry)
  const sn = Math.sin(ry)
  const sides: [number, number, number, number][] = [
    [0, -d / 2, w, 0],
    [0, d / 2, w, 0],
    [-w / 2, 0, d, Math.PI / 2],
    [w / 2, 0, d, Math.PI / 2],
  ]
  sides.forEach(([lx, lz, len, rot], i) => {
    for (let t = -len / 2; t < len / 2 - 0.5; t += 4) {
      const seg = Math.min(4, len / 2 - t)
      // A gap for the gate in the middle of one side.
      if (i === gapSide && Math.abs(t + seg / 2) < 1.6) continue
      const ux = rot ? 0 : t + seg / 2
      const uz = rot ? t + seg / 2 : 0
      const px = cx + (lx + ux) * cs + (lz + uz) * sn
      const pz = cz - (lx + ux) * sn + (lz + uz) * cs
      const y = inside ? 0.9 : x.G(px, pz)
      x.F(box(seg + 0.2, 1.3, 0.8), x.ruined ? 0x5a5448 : 0x9a9282, { x: px, y: y + 0.55, z: pz, ry: ry + rot, ao: 0.2, jitter: 0.14 })
    }
  })
}

/** A walled garden: rows of greens and herbs, a fruit tree, a bench. */
function garden(x: Ctx, cx: number, cz: number, ry: number, inside: boolean) {
  const w = 10 + x.rnd() * 4
  const d = 8 + x.rnd() * 3
  yardWall(x, cx, cz, ry, w, d, inside)
  if (x.ruined) return
  const f = new Frame(cx, cz, ry, inside ? 0.9 : x.G(cx, cz))
  for (let v = -d / 2 + 1.6; v < d / 2 - 1; v += 1.5) f.put(x.flat, box(w - 3, 0.5, 0.8), [0x5f8a3a, 0x7a9a4a, 0x6a7a3a][Math.abs(Math.round(v)) % 3], -0.8, 0.3, v, { ao: 0.2, jitter: 0.15 })
  tree(x.kit, f, w / 2 - 2, -d / 2 + 2, x.rnd, 0.75)
}

// ---------------------------------------------------------------------------------------------
// The town inside the walls.
// ---------------------------------------------------------------------------------------------

function townInside(x: Ctx) {
  const { gates, sq, innerR, rAt, rnd } = x
  const minR = innerR ? innerR + 7 : sq + 6
  // The great buildings first, one to each quarter between the streets.
  const spot = (a: number, rr: number, w: number, d: number): [number, number] | null => {
    for (let t = 0; t < 14; t++) {
      const aa = a + (rnd() - 0.5) * 0.5
      const r = rr + (rnd() - 0.3) * 10
      const px = Math.cos(aa) * r
      const pz = Math.sin(aa) * r
      const R = Math.max(w, d) * 0.55
      if (x.onStreet(px, pz, 8 + R) || !x.inWalls(px, pz, -12 - R) || !x.free(px, pz, R)) continue
      return [px, pz]
    }
    return null
  }
  const quarter = (k: number) => gates[k] + Math.PI / 4
  const special = (k: number, rr: number, w: number, d: number, make: (f: Frame) => void) => {
    const p = spot(quarter(k), rr, w, d)
    if (!p) return
    const [px, pz] = p
    x.taken.push({ x: px, z: pz, r: Math.max(w, d) * 0.55 })
    make(new Frame(px, pz, facing(-px, -pz)))
  }
  const mid = (a: number) => (minR + rAt(a) - 12) / 2
  const k = x.kit
  if (!x.ruined) {
    // The guildhall on the square: a tall stone hall over an open arcade.
    special(0, minR + 12, 22, 12, (f) => {
      house(k, f, { w: 20, d: 10, storeys: 2, roof: x.S0.roofs[0], style: 'stone', detail: 'high', banner: true }, rnd)
      for (let i = 0; i < 6; i++) {
        const u = -8.5 + i * 3.4
        f.put(k.walls, cyl(0.45, 0.5, 3.6, 8), x.S0.stoneL, u, 1.8, 6.4)
        if (i < 5) f.put(k.walls, new THREE.TorusGeometry(1.5, 0.35, 3, 8, Math.PI), x.S0.stoneL, u + 1.7, 3.5, 6.4, { ao: 0 })
      }
      f.put(k.walls, box(20, 0.6, 3.2), x.S0.stoneD, 0, 5.1, 5.4)
      f.put(k.flat!, box(20, 0.3, 3), 0xb8a888, 0, 1.0, 5.2, { ao: 0 })
    })
    // The smithy and armoury: an open forge under a lean-to with a tall chimney, anvil, quench
    // trough, weapon racks; the armoury beside it, iron-bound.
    special(1, mid(quarter(1)), 22, 12, (f) => {
      house(k, f.sub(-5, 0, 0), { w: 10, d: 8, storeys: 1, roof: 'slate', style: 'stone', detail: 'high' }, rnd)
      house(k, f.sub(7, -1, 0), { w: 9, d: 9, storeys: 2, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
      const lf = f.sub(-5, 6.5, 0)
      lf.put(k.flat!, box(9, 0.3, 4.4), 0x5a4a3a, 0, 3.6, 0, { rx: 0.2 })
      for (const s of [-1, 1]) lf.put(k.flat!, box(0.3, 3.4, 0.3), PAL.timber, s * 4.2, 1.7, 2)
      lf.put(k.flat!, box(2.6, 1.4, 2), x.S0.stoneD, -2.5, 0.7, -0.8)
      lf.put(k.glow, box(1.6, 0.5, 1.2), 0xff7a2a, -2.5, 1.5, -0.6)
      lf.put(k.walls, box(1.4, 8.5, 1.4), x.S0.stoneD, -3.4, 4.2, -1.6)
      const [sx, sz] = lf.at(-3.4, -1.6)
      x.smoke.push([sx, 9.5, sz])
      lf.put(k.flat!, box(1.6, 0.9, 0.7), IRON, 1, 1.1, 0.2)
      lf.put(k.flat!, box(0.9, 0.7, 0.9), 0x4a3a2a, 1, 0.35, 0.2)
      lf.put(k.flat!, box(2.6, 0.9, 1.1), WOOD, 3, 0.45, -0.6)
      lf.put(k.flat!, box(2.4, 0.15, 0.9), 0x4a6a7a, 3, 0.95, -0.6, { ao: 0 })
      // A weapon rack: spears and halberds leaning on a rail.
      const wr = f.sub(8, 6.5, 0)
      wr.put(k.flat!, box(5, 0.25, 0.25), WOOD_D, 0, 2.2, 0)
      for (const s of [-1, 1]) wr.put(k.flat!, box(0.25, 2.4, 0.25), WOOD_D, s * 2.4, 1.2, 0)
      for (let i = 0; i < 8; i++) {
        wr.put(k.flat!, box(0.12, 4.2, 0.12), 0x6a5034, -2.1 + i * 0.6, 2.1, 0.35, { rx: -0.12 })
        wr.put(k.flat!, cone(0.16, 0.6, 4), 0xb8bec4, -2.1 + i * 0.6, 4.4, 0.6, { ao: 0 })
      }
    })
    // The barracks and their training yard: archery butts and a quintain on raked sand.
    special(2, mid(quarter(2)), 30, 24, (f) => {
      house(k, f.sub(0, -6, 0), { w: 26, d: 9, storeys: 2, roof: x.S0.roofs[0], style: 'stone', detail: 'mid' }, rnd)
      f.put(k.flat!, box(24, 0.3, 12), 0xc8b48a, 0, 1.0, 6, { ao: 0, jitter: 0.08 })
      for (let i = 0; i < 3; i++) {
        const b = f.sub(-8 + i * 5, 10.5, Math.PI)
        b.put(k.flat!, box(0.25, 2.6, 0.25), WOOD_D, -0.9, 1.3, -0.5, { rx: 0.3 })
        b.put(k.flat!, box(0.25, 2.6, 0.25), WOOD_D, 0.9, 1.3, -0.5, { rx: 0.3 })
        b.put(k.flat!, cyl(1.2, 1.2, 0.5, 8), 0xd8c070, 0, 2.2, 0, { rx: Math.PI / 2 - 0.25 })
        b.put(k.flat!, cyl(0.7, 0.7, 0.52, 8), 0xb8302a, 0, 2.2, 0.02, { rx: Math.PI / 2 - 0.25, ao: 0 })
        b.put(k.flat!, cyl(0.3, 0.3, 0.54, 6), 0xe8e0c8, 0, 2.2, 0.04, { rx: Math.PI / 2 - 0.25, ao: 0 })
      }
      const q = f.sub(8, 5, 0.6)
      q.put(k.flat!, cyl(0.25, 0.3, 4.2, 6), WOOD_D, 0, 2.1, 0)
      q.put(k.flat!, box(4.4, 0.25, 0.25), WOOD, 0.6, 4, 0)
      q.put(k.accents, box(0.8, 1.2, 0.2), 0xffffff, -1.4, 3.6, 0.1)
      q.put(k.flat!, sphere(0.55, 0), 0xb8a070, 2.6, 3.3, 0)
    })
    // The chapel, with a walled garden and a cistern beside it.
    special(3, mid(quarter(3)), 16, 20, (f) => {
      chapel(k, new Frame(f.x, f.z, f.ry + Math.PI / 2), rnd, false)
    })
    // Stables inside the main gate.
    special(0, mid(gates[0] + 0.4), 20, 12, (f) => {
      house(k, f, { w: 18, d: 7, storeys: 1, roof: 'shingle', style: 'timber', detail: 'mid' }, rnd)
      for (let i = 0; i < 4; i++) horse(k, f.sub(-6 + i * 4, 6, Math.PI), [0x5a3a22, 0x3a2a1e, 0x8a6a48, 0x2a2420][i])
      fence(k, f.sub(0, 8.4, 0), 17)
      f.put(k.flat!, box(4, 0.8, 1), WOOD, 7, 0.4, 5)
      haystack(k, f, -10, 4, 0.6)
    })
    // A fountain in the square.
    {
      const a = gates[0] + Math.PI / 4
      const fx = Math.cos(a) * sq * 0.62
      const fz = Math.sin(a) * sq * 0.62
      const n = x.style === 'sun' ? 8 : 16
      x.F(cyl(4, 4.3, 1.2, n), x.S0.stoneL, { x: fx, y: 1.5, z: fz })
      x.F(cyl(3.4, 3.4, 1.22, n), 0x4a7a8a, { x: fx, y: 1.55, z: fz, ao: 0 })
      x.F(cyl(0.5, 0.7, 3.4, 8), x.S0.stoneL, { x: fx, y: 3, z: fz })
      x.F(cyl(1.6, 0.6, 0.6, 10), x.S0.stoneL, { x: fx, y: 4.6, z: fz })
      if (x.style === 'sun') x.gold.push(bpart(sphere(0.6, 1), 0xffffff, { x: fx, y: 5.6, z: fz, ao: 0 }))
      else x.F(sphere(0.5, 0), x.S0.stoneL, { x: fx, y: 5.3, z: fz })
    }
  }

  // The four streets: tall houses and shops shoulder to shoulder, the grandest nearest the square.
  for (const g of gates) {
    const len = rAt(g) - 10
    const path: Path = [
      [Math.cos(g) * (minR - 2), Math.sin(g) * (minR - 2)],
      [Math.cos(g) * len, Math.sin(g) * len],
    ]
    const span = len - minR
    for (const side of [1, -1] as const)
      lineLane(x, path, side, 7.6, 0, span, true, (s) => ({ kind: rnd() < 0.3 ? 'shop' : 'town', detail: s < span * 0.6 ? 'high' : 'mid', gap: 0.35 }))
  }
  // The ring lane between the square and the curtain, and the houses along it.
  const ringPath: Path = []
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const r = mid(a) + 4
    ringPath.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  if (Math.min(...ringPath.map(([px, pz]) => Math.hypot(px, pz))) > minR + 14) {
    // Cobbles in pieces between the streets.
    let run: Path = []
    for (const p of ringPath) {
      if (x.onStreet(p[0], p[1], 9)) {
        if (run.length > 1) paveStrip(x, run, 2.6, 0x9c8e72, true)
        run = []
      } else run.push(p)
    }
    if (run.length > 1) paveStrip(x, run, 2.6, 0x9c8e72, true)
    for (const side of [1, -1] as const) lineLane(x, ringPath, side, 3.2, 0, Infinity, true, () => (rnd() < 0.12 ? null : { kind: rnd() < 0.15 ? 'shop' : 'town', detail: 'mid', gap: 0.5 + rnd() * 1.5 }))
  }
  // Back lanes off the ring into each quarter.
  for (let q = 0; q < 4; q++) {
    const a = quarter(q) + (rnd() - 0.5) * 0.3
    const r0 = minR + 4
    const r1 = rAt(a) - 14
    if (r1 - r0 < 24) continue
    const path: Path = [
      [Math.cos(a) * r0, Math.sin(a) * r0],
      [Math.cos(a + 0.04) * (r0 + r1) * 0.5, Math.sin(a + 0.04) * (r0 + r1) * 0.5],
      [Math.cos(a) * r1, Math.sin(a) * r1],
    ]
    paveStrip(x, path, 2, 0x8f8268, true)
    for (const side of [1, -1] as const) lineLane(x, path, side, 2.6, 2, Infinity, true, () => (rnd() < 0.2 ? null : { kind: 'town', detail: 'mid', gap: 0.8 + rnd() * 2 }))
  }
  // In the blocks: walled gardens, wells, woodpiles and carts.
  for (let i = 0, tries = 0; tries < 260 && i < 10 + x.tier * 4; tries++) {
    const a = rnd() * Math.PI * 2
    const r = minR + 4 + rnd() * (rAt(a) - 18 - minR)
    const px = Math.cos(a) * r
    const pz = Math.sin(a) * r
    if (x.onStreet(px, pz, 12) || !x.free(px, pz, 7) || !x.laneClear(px, pz, 6)) continue
    i++
    const ry = facing(-px, -pz)
    const roll = rnd()
    if (roll < 0.55) {
      garden(x, px, pz, ry, true)
      x.taken.push({ x: px, z: pz, r: 7.5 })
    } else if (roll < 0.7 && !x.ruined) {
      well(k, new Frame(px, pz, ry, 0.9))
      x.taken.push({ x: px, z: pz, r: 3 })
    } else if (!x.ruined) {
      woodpile(k, new Frame(px, pz, ry, 0.9))
      cart(k, new Frame(px + 3, pz + 2, ry + 0.8, 0.9), rnd() < 0.5 ? 'hay' : 'barrels', rnd)
      x.taken.push({ x: px, z: pz, r: 4 })
    }
  }
}

/** A motte and bailey's bailey: its hall and sheds round the yard below the mound. */
function bailey(x: Ctx) {
  const { rnd, kit: k, rAt, keepAt } = x
  const lots: [number, number][] = []
  for (let tries = 0; tries < 300 && lots.length < 12; tries++) {
    const a = rnd() * Math.PI * 2
    const r = rAt(a) * (0.5 + rnd() * 0.3)
    const px = Math.cos(a) * r
    const pz = Math.sin(a) * r
    if (Math.hypot(px - keepAt[0], pz - keepAt[1]) < 32 || x.onStreet(px, pz, 8) || lots.some(([lx, lz]) => Math.hypot(lx - px, lz - pz) < 13)) continue
    lots.push([px, pz])
  }
  lots.forEach(([px, pz], i) => {
    const f = new Frame(px, pz, facing(-px, -pz))
    x.taken.push({ x: px, z: pz, r: 7 })
    if (x.ruined) {
      house(k, f, { w: 7, d: 7, roof: 'thatch', ruined: true }, rnd)
      return
    }
    if (i === 0) house(k, f, { w: 16, d: 8, storeys: 1, roof: 'thatch', style: 'timber', detail: 'high', banner: true }, rnd)
    else if (i === 1) {
      house(k, f, { w: 13, d: 6, storeys: 1, roof: 'shingle', style: 'timber', detail: 'mid' }, rnd)
      for (let j = 0; j < 3; j++) horse(k, f.sub(-4 + j * 4, 5.5, Math.PI), [0x5a3a22, 0x3a2a1e, 0x8a6a48][j])
    } else if (i === 2) {
      house(k, f, { w: 7, d: 6, storeys: 1, roof: 'shingle', style: 'timber', detail: 'mid' }, rnd)
      f.put(k.glow, box(1.4, 0.5, 1), 0xff7a2a, 2, 1.2, 4)
      x.smoke.push([px, 7, pz])
    } else if (i === 3) {
      // A granary on staddle stones, out of the rats' reach.
      for (const [sx, sz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        f.put(k.flat!, cyl(0.3, 0.5, 1.4, 6), 0x9a9282, sx, 0.7, sz)
        f.put(k.flat!, cyl(0.7, 0.7, 0.25, 8), 0x9a9282, sx, 1.5, sz)
      }
      f.put(k.walls, box(5.5, 3, 5.5), WOOD, 0, 3.2, 0)
      f.put(k.roofs, gable(6.4, 6.4, 2.4), 0xb48e54, 0, 4.7, 0)
    } else if (i === 4) {
      // A pig pen.
      for (const [lx, lz, len, rot] of [[0, -3, 8, 0], [0, 3, 8, 0], [-4, 0, 6, Math.PI / 2], [4, 0, 6, Math.PI / 2]] as const) fence(k, f.sub(lx, lz, rot), len)
      for (let j = 0; j < 3; j++) f.put(k.flat!, box(0.9, 0.8, 1.6), 0xd89a8a, -2 + j * 2, 0.6, (rnd() - 0.5) * 2, { ry: rnd() * 3 })
    } else if (i % 3 === 0) {
      woodpile(k, f)
      cart(k, f.sub(3, 2, 0.5), 'hay', rnd)
    } else house(k, f, { w: 6 + rnd() * 2, d: 6 + rnd() * 2, storeys: 1, roof: 'thatch', style: 'timber', detail: 'mid' }, rnd)
  })
  if (!x.ruined) well(k, new Frame(Math.cos(x.main) * 14, Math.sin(x.main) * 14, 0.3, 0.9))
}

// ---------------------------------------------------------------------------------------------
// Outside the walls: the faubourgs.
// ---------------------------------------------------------------------------------------------

/** The curving road out of a gate, until the water, a cliff or the edge of the map stops it. */
function gateRoad(x: Ctx, g: number, from: number, len: number): Path {
  const cx = Math.cos(g)
  const cz = Math.sin(g)
  const ph = x.rnd() * 6.28
  const path: Path = []
  for (let d = 0; d <= len; d += 6) {
    const wob = Math.sin(d * 0.022 + ph) * 13 * Math.min(1, d / 55) + Math.sin(d * 0.057 + ph * 2) * 3 * Math.min(1, d / 40)
    const px = cx * (from + d) - cz * wob
    const pz = cz * (from + d) + cx * wob
    if (!x.firm(px, pz, 3)) break
    path.push([px, pz])
  }
  return path
}

function inn(x: Ctx, cx: number, cz: number, ry: number) {
  const k = x.kit
  const y = x.foot(cx, cz, 13, 11, ry)
  const f = new Frame(cx, cz, ry, y)
  const top = house(k, f, { w: 12, d: 10, storeys: 2, roof: x.S0.roofs[0] === 'thatch' ? 'thatch' : 'tile', style: 'timber', detail: 'high', annex: true }, x.rnd)
  // The sign on its bracket, tables and benches out front, barrels by the door.
  f.put(k.flat!, box(0.18, 0.18, 2.4), IRON, 4.5, 4.6, 5.9)
  f.put(k.accents, box(1.6, 1.3, 0.14), 0xffffff, 4.5, 3.7, 6.9)
  f.put(k.flat!, box(1.8, 0.14, 1.5), WOOD_D, 4.5, 4.45, 6.9)
  for (const u of [-3, 1.5]) {
    const t = f.sub(u, 8.2, 0)
    t.put(k.flat!, box(3.2, 0.25, 1.3), WOOD, 0, 1.2, 0)
    for (const s of [-1, 1]) t.put(k.flat!, box(0.25, 1.1, 1), WOOD_D, s * 1.3, 0.55, 0)
    for (const s of [-1, 1]) t.put(k.flat!, box(3.2, 0.2, 0.5), WOOD, 0, 0.7, s * 1.2)
  }
  barrel(k, f, -5.2, 6, 0.8)
  barrel(k, f, -5.8, 7.4, 0.8)
  x.smoke.push([cx, y + top + 1.5, cz])
}

function workshop(x: Ctx, cx: number, cz: number, ry: number) {
  const k = x.kit
  const y = x.foot(cx, cz, 10, 9, ry)
  const f = new Frame(cx, cz, ry, y)
  const kind = Math.floor(x.rnd() * 3)
  house(k, f.sub(0, -2, 0), { w: 7, d: 6, storeys: 1, roof: 'thatch', style: 'timber', detail: 'mid' }, x.rnd)
  if (kind === 0) {
    // A tannery: hides stretched on racks, a row of vats.
    for (let i = 0; i < 3; i++) {
      const r = f.sub(-4 + i * 4, 4, 0)
      for (const s of [-1, 1]) r.put(k.flat!, box(0.2, 2.6, 0.2), WOOD_D, s * 1.4, 1.3, 0)
      r.put(k.flat!, box(3, 0.18, 0.18), WOOD_D, 0, 2.5, 0)
      r.put(k.flat!, box(2.4, 1.8, 0.08), [0x8a6a48, 0xa8865a, 0x6a4a30][i], 0, 1.5, 0.08)
    }
    for (let i = 0; i < 3; i++) barrel(k, f, -3 + i * 2.2, 7, 0.9)
  } else if (kind === 1) {
    // A potter's kiln and pots drying in rows.
    f.put(k.flat!, cyl(1.9, 2.2, 2.4, 10), 0x9a6a48, 3, 1.2, 4.5)
    f.put(k.flat!, sphere(1.9, 1), 0x9a6a48, 3, 2.4, 4.5, { sy: 0.7 })
    f.put(k.glow, box(0.9, 0.7, 0.2), 0xff7a2a, 3, 0.8, 6.6)
    const [kx, kz] = f.at(3, 4.5)
    x.smoke.push([kx, y + 4, kz])
    for (let i = 0; i < 8; i++) f.put(k.flat!, cyl(0.35, 0.25, 0.8, 7), 0xb87a52, -4 + (i % 4) * 1.1, 0.4, 3.5 + Math.floor(i / 4) * 1.2)
  } else {
    // A carpenter's yard: stacked timber, a sawhorse, planks.
    for (let i = 0; i < 6; i++) f.put(k.flat!, box(6, 0.5, 0.5), i % 2 ? 0x8a6a40 : 0x7a5a38, 0, 0.3 + Math.floor(i / 3) * 0.55, 3.5 + (i % 3) * 0.6)
    f.put(k.flat!, box(0.25, 1, 2), WOOD_D, -2.5, 0.5, 6.5, { rx: 0.4 })
    f.put(k.flat!, box(0.25, 1, 2), WOOD_D, -0.5, 0.5, 6.5, { rx: -0.4 })
    f.put(k.flat!, box(3, 0.25, 0.6), 0xa88a5a, -1.5, 1.05, 6.5)
  }
  x.taken.push({ x: cx, z: cz, r: 7 })
}

/** A farmstead: a farmhouse, a big barn, a haystack, a fenced yard, a cart. */
export function farmstead(x: Ctx, cx: number, cz: number, ry: number) {
  const k = x.kit
  const y = x.foot(cx, cz, 9, 8, ry)
  const f = new Frame(cx, cz, ry, y)
  if (x.ruined) {
    house(k, f, { w: 8, d: 7, roof: 'thatch', ruined: true }, x.rnd)
    x.taken.push({ x: cx, z: cz, r: 12 })
    return
  }
  house(k, f, { w: 8, d: 7, storeys: 1, roof: 'thatch', style: x.rnd() < 0.3 ? 'stone' : 'timber', detail: 'mid', annex: true }, x.rnd)
  const [bx, bz] = f.at(11, -3)
  const by = x.foot(bx, bz, 9, 14, ry)
  const b = new Frame(bx, bz, ry + Math.PI / 2, by)
  b.put(k.walls, box(14, 6, 9), 0x7a5a38, 0, 3, 0)
  for (let u = -6; u <= 6; u += 3) b.put(k.flat!, box(0.35, 6, 0.4), WOOD_D, u, 3, 4.6)
  b.put(k.flat!, box(4, 4.6, 0.3), 0x4a3322, 0, 2.3, 4.65)
  b.put(k.roofs, gable(10.6, 15, 4.4), 0x6f5a42, 0, 5.9, 0)
  haystack(k, f, -7, 4, 0.9)
  const [hx, hz] = f.at(-2, 8)
  fence(k, new Frame(hx, hz, ry, x.G(hx, hz)), 10)
  if (x.rnd() < 0.6) cart(k, f.sub(4, 6, 0.7), 'hay', x.rnd)
  x.smoke.push([cx, y + 8, cz])
  x.taken.push({ x: cx + 4, z: cz, r: 13 })
}

/**
 * A castle on the water: a road down from the gate that faces it to a landing on the bank, a stone
 * quay with a timber jetty running out into the water, boats tied up, fishermen's huts and nets
 * drying on racks.
 */
function harbour(x: Ctx): number | null {
  const water = x.shape.water
  if (water === undefined || x.waterGate !== null) return null
  let g = x.gates[0]
  for (const a of x.gates) if (Math.abs(Math.atan2(Math.sin(a - water), Math.cos(a - water))) < Math.abs(Math.atan2(Math.sin(g - water), Math.cos(g - water)))) g = a
  if (Math.abs(Math.atan2(Math.sin(g - water), Math.cos(g - water))) > 0.9) return null
  const from = x.rAt(g) + 8
  const path = gateRoad(x, g, from, 260)
  if (path.length < 2) return null
  const [ex, ez] = path[path.length - 1]
  const [px, pz] = path[path.length - 2]
  const L = Math.hypot(ex - px, ez - pz) || 1
  const dx = (ex - px) / L
  const dz = (ez - pz) / L
  // It must really end at the water.
  let wd = 0
  for (let d = 2; d < 40; d += 2) if (x.world.heightAt(x.c.x + ex + dx * d, x.c.z + ez + dz * d) < 2.5) {
    wd = d
    break
  }
  if (!wd) return null
  paveStrip(x, [[Math.cos(g) * (x.rAt(g) + 4), Math.sin(g) * (x.rAt(g) + 4)], path[0]], 4.5, 0x9a8a68, false)
  paveStrip(x, path, 4.5, 0x9a8a68, false)
  const base = x.world.heightAt(x.c.x, x.c.z)
  const wy = WATER_LEVEL - base
  const qx = ex + dx * wd * 0.5
  const qz = ez + dz * wd * 0.5
  const ry = facing(dx, dz)
  const f = new Frame(qx, qz, ry, 0)
  const gy = x.G(ex, ez)
  // The quay: a stone landing stepped down to the water, bollards along its edge.
  f.put(x.flat, box(16, gy - wy + 1.2, wd + 4), 0x6e685e, 0, (gy + wy) / 2 - 0.5, 0, { ao: 0.35, jitter: 0.1 })
  f.put(x.flat, box(16.4, 0.3, wd + 4.4), 0x8a8478, 0, gy + 0.2, 0, { ao: 0, jitter: 0.1 })
  for (let u = -6; u <= 6; u += 4) f.put(x.flat, cyl(0.35, 0.45, 1.1, 5), 0x5a554c, u, gy + 0.8, wd / 2 + 1.6)
  x.taken.push({ x: qx, z: qz, r: 12 })
  if (x.ruined) return g
  // The jetty: planks on posts running out over the water.
  const jl = 26
  for (let t = 0; t < jl; t += 3.2) {
    for (const s of [-1.6, 1.6]) f.put(x.flat, cyl(0.28, 0.3, gy - wy + 3, 5), WOOD_D, s, (gy + wy) / 2 - 0.5, wd / 2 + 2 + t)
    f.put(x.flat, box(4.2, 0.3, 3.0), 0x7a5a38, 0, Math.max(wy + 1.2, gy - 0.1), wd / 2 + 3.6 + t, { ao: 0.05, jitter: 0.12 })
  }
  // Boats: two moored along the jetty, one drawn up on the landing.
  for (const [u, v, rot] of [[5, wd / 2 + 10, 0.1], [-5, wd / 2 + 18, -0.15]] as const) {
    const b = f.sub(u, v, rot)
    b.put(x.flat, box(3, 1.4, 10), 0x5a4026, 0, wy + 0.5, 0, { ao: 0.2 })
    b.put(x.flat, box(2.3, 0.3, 8.8), 0x7a5a38, 0, wy + 1.25, 0, { ao: 0 })
    b.put(x.flat, cone(1.5, 2.4, 4), 0x5a4026, 0, wy + 0.6, 6, { rx: Math.PI / 2, ry: Math.PI / 4 })
    b.put(x.flat, box(0.25, 6, 0.25), WOOD_D, 0, wy + 4, 1)
    b.put(x.kit.accents, box(0.1, 4, 3.4), 0xffffff, 0, wy + 4.4, 0.4, { ao: 0 })
  }
  // Fishermen's huts and nets drying on racks beside the landing.
  for (const s of [-1, 1]) {
    const [hx, hz] = f.at(s * 18, -6)
    if (!x.firm(hx, hz, 4) || !x.free(hx, hz, 5)) continue
    const hr = facing(qx - hx, qz - hz)
    house(x.kit, new Frame(hx, hz, hr, x.foot(hx, hz, 6, 6, hr)), { w: 6, d: 6, storeys: 1, roof: 'thatch', style: 'timber', detail: 'mid' }, x.rnd)
    x.taken.push({ x: hx, z: hz, r: 5 })
    const [rx, rz] = f.at(s * 12, -14)
    const rf = new Frame(rx, rz, ry + Math.PI / 2, x.G(rx, rz))
    for (const u of [-3, 0, 3]) rf.put(x.flat, box(0.2, 2.6, 0.2), WOOD_D, u, 1.3, 0)
    rf.put(x.flat, box(6.6, 0.15, 0.15), WOOD_D, 0, 2.5, 0)
    rf.put(x.flat, box(6.2, 1.8, 0.08), 0x9a8e70, 0, 1.6, 0.1, { ao: 0 })
  }
  barrel(x.kit, f, 6, -wd / 2 + 1, 0.8)
  crate(x.kit, f, -7, gy + 0.9, -wd / 2 + 2, 1.2)
  return g
}

/** A lane laid parallel to a road at a distance `off` to one side, between s0 and s1 along it, in runs where the ground allows. */
function sideLane(x: Ctx, road: Path, off: number, s0: number, s1: number, avoid: { x: number; z: number; r: number }[]): Path[] {
  const { at, total } = walker(road)
  const runs: Path[] = []
  let run: Path = []
  for (let s = s0; s <= Math.min(s1, total); s += 5) {
    const q = at(s)
    const px = q.x - q.tz * off
    const pz = q.z + q.tx * off
    const ok = x.firm(px, pz, 2) && !x.inWalls(px, pz, 11) && !x.nearOuterWall(px, pz, 3) && avoid.every((a) => Math.hypot(a.x - px, a.z - pz) > a.r)
    if (ok) run.push([px, pz])
    else {
      if (run.length >= 4) runs.push(run)
      run = []
    }
  }
  if (run.length >= 4) runs.push(run)
  return runs
}

/** A lane out from a point in a direction, bending a little, until it meets something it cannot cross. */
function alleyFrom(x: Ctx, sx: number, sz: number, dir: number, len: number): Path {
  const path: Path = []
  let ax = sx
  let az = sz
  const turn = (x.rnd() - 0.5) * 0.06
  for (let d = 0; d <= len; d += 5) {
    if (!x.firm(ax, az, 2) || x.inWalls(ax, az, 10) || x.nearOuterWall(ax, az, 3)) break
    path.push([ax, az])
    ax += Math.cos(dir) * 5
    az += Math.sin(dir) * 5
    dir += turn
  }
  return path
}

/** Houses and stalls all round a plaza, facing in. */
function ringPlaza(x: Ctx, px: number, pz: number, r: number) {
  let a = x.rnd() * Math.PI * 2
  const end = a + Math.PI * 2
  while (a < end) {
    const w = 6 + x.rnd() * 2.4
    const d = 8 + x.rnd() * 2
    const R = r + 1 + d / 2
    const cx = px + Math.cos(a) * R
    const cz = pz + Math.sin(a) * R
    const ry = facing(px - cx, pz - cz)
    if (x.firm(cx, cz, 3) && !x.inWalls(cx, cz, 13) && !x.nearOuterWall(cx, cz, 4) && x.freeRect(cx, cz, w / 2 + 0.1, d / 2 + 0.1, ry) && laneClearRect(x, cx, cz, w / 2, d / 2, ry, [])) {
      building(x, cx, cz, ry, w, d, x.rnd() < 0.35 ? 'shop' : 'town', false, 'mid')
      x.taken.push({ x: cx, z: cz, r: Math.hypot(w, d) / 2, hw: w / 2, hd: d / 2, ry })
      a += (w + 0.5) / (r + 1)
    } else a += 2 / (r + 1)
  }
}

/** A little square: paving laid over the ground, a well, a stall or two. */
function square(x: Ctx, px: number, pz: number, r: number, cross: boolean) {
  const quads: number[][] = []
  const n = 10
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const r0 = r + Math.sin(i * 2.3) * r * 0.18
    const r1 = r + Math.sin((i + 1) * 2.3) * r * 0.18
    const p = (a: number, rr: number): [number, number, number] => [px + Math.cos(a) * rr, x.G(px + Math.cos(a) * rr, pz + Math.sin(a) * rr) + 0.36, pz + Math.sin(a) * rr]
    quads.push([...p(a0, 0.01), ...p(a0, r0), ...p(a1, r1), ...p(a1, 0.02)])
  }
  x.flat.push(drape(quads, x.ruined ? 0x5a5040 : 0xa49478, 0.06))
  x.taken.push({ x: px, z: pz, r: r * 0.7 })
  if (x.ruined) return
  well(x.kit, new Frame(px + r * 0.25, pz - r * 0.15, 0.4, x.G(px + r * 0.25, pz - r * 0.15)))
  if (cross) {
    const my = x.G(px - 3, pz + 3)
    for (let s = 0; s < 3; s++) x.F(box(4 - s * 1.1, 0.6, 4 - s * 1.1), x.S0.stoneD, { x: px - 3, y: my + 0.3 + s * 0.6, z: pz + 3 })
    x.F(box(0.6, 5, 0.6), x.S0.stoneL, { x: px - 3, y: my + 4.3, z: pz + 3 })
    x.F(box(2.2, 0.5, 0.5), x.S0.stoneL, { x: px - 3, y: my + 5.8, z: pz + 3 })
  }
  for (let i = 0; i < (cross ? 3 : 2); i++) {
    const a = 2 + i * 1.3
    const sx = px + Math.cos(a) * r * 0.62
    const sz = pz + Math.sin(a) * r * 0.62
    const f = new Frame(sx, sz, facing(px - sx, pz - sz), x.G(sx, sz))
    f.put(x.flat, box(4.4, 1.1, 2.4), WOOD, 0, 0.8, 0)
    for (const [lx, lz] of [[-2.1, -1.1], [2.1, -1.1], [-2.1, 1.3], [2.1, 1.3]]) f.put(x.flat, box(0.22, 3, 0.22), PAL.timber, lx, 1.5, lz, { ao: 0 })
    f.put(x.kit.accents, box(5, 0.16, 3.4), 0xffffff, 0, 3.1, 0.2, { rx: 0.22 })
    crate(x.kit, f, -1, 1.35, 0, 0.8)
  }
}

type Pick = (s: number) => { kind: Kind; detail: 'high' | 'mid'; gap: number } | null

/**
 * The faubourgs. All the lanes are laid first (the roads out of the gates, back lanes behind their
 * first row of houses, side alleys crossing them, a lane round the outside of the walls joining the
 * gates, lanes beside the barbican), then lined with buildings, densest near the gates.
 */
function faubourgs(x: Ctx) {
  const port = harbour(x)
  const { gates, main, waterGate, rAt, tier, rnd } = x
  const ang = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  const land = gates.filter((g) => g !== waterGate && g !== port)
  const opposite = land.reduce((best, g) => (ang(g, main) > ang(best, main) ? g : best), main)
  // Every castle gets a gate town at each gate as it grows: two at tier 1, three at tier 2.
  const which = tier <= 1 ? [main, opposite].filter((g, i, a) => a.indexOf(g) === i) : tier === 2 ? land.filter((g) => g === main || land.length <= 3 || g !== land.filter((h) => h !== main && h !== opposite)[0]) : land
  const barbican = x.barbican ?? (tier >= 3 && !x.timber)
  const work: { lane: Path; side: 1 | -1; off: number; from: number; pick: Pick }[] = []
  const later: (() => void)[] = []
  const plazas: { x: number; z: number; r: number }[] = []
  const GH = 20

  for (const g of which) {
    const isMain = g === main
    const from = rAt(g) + (isMain && barbican ? 34 : 8)
    const len = isMain ? x.outer - rAt(g) + 40 : (x.outer - rAt(g)) * 0.8
    const path = gateRoad(x, g, from, len)
    if (path.length < 4) continue
    const half = isMain ? 6.5 : 4.8
    paveStrip(x, [[Math.cos(g) * (rAt(g) + 4), Math.sin(g) * (rAt(g) + 4)], path[0]], half, 0x9a8a68, false)
    paveStrip(x, path, half, 0x9a8a68, false)
    const { at, total } = walker(path)
    const dense = isMain ? 62 + tier * 6 : 40 + tier * 4
    const loose = dense + 50
    // The plaza on the main road, with the inn.
    let plaza: { x: number; z: number; r: number } | null = null
    if (isMain && tier >= 2 && total > 50) {
      const q = at(34)
      const side = rnd() < 0.5 ? 1 : -1
      const pxp = q.x - q.tz * side * (half + 10)
      const pzp = q.z + q.tx * side * (half + 10)
      if (x.firm(pxp, pzp, 10)) {
        plaza = { x: pxp, z: pzp, r: 13 }
        plazas.push(plaza)
        square(x, pxp, pzp, 12, true)
        if (!x.ruined) {
          const ia = Math.atan2(pzp - q.z, pxp - q.x)
          const ix = pxp + Math.cos(ia) * 18
          const iz = pzp + Math.sin(ia) * 18
          if (x.firm(ix, iz, 7) && x.free(ix, iz, 7)) {
            inn(x, ix, iz, facing(pxp - ix, pzp - iz))
            x.taken.push({ x: ix, z: iz, r: 8 })
          }
        }
      }
    }
    const avoid = plaza ? [{ x: plaza.x, z: plaza.z, r: plaza.r + 3 }] : []
    // The road itself: shoulder to shoulder near the gate, then cottages; farmsteads beyond.
    const roadPick: Pick = (s) => {
      if (plaza && Math.hypot(at(s).x - plaza.x, at(s).z - plaza.z) < plaza.r + 9) return null
      if (s < dense) return { kind: rnd() < 0.3 ? 'shop' : rnd() < 0.15 ? 'row' : 'town', detail: s < dense * 0.55 ? 'high' : 'mid', gap: 0.25 }
      if (s < loose) return rnd() < 0.2 ? null : { kind: 'cottage', detail: 'mid', gap: 1.5 + rnd() * 4 }
      return null
    }
    for (const side of [1, -1] as const) work.push({ lane: path, side, off: half + 0.8, from: 0, pick: roadPick })
    // Back lanes behind the first row (and on the main road a third row behind those).
    const backs: [number, number, number][] = [[half + 14.2, 4, dense]]
    if (isMain) backs.push([half + 30, 6, dense * 0.8])
    for (const [off, s0, s1] of backs)
      for (const side of [1, -1] as const)
        for (const lane of sideLane(x, path, off * side, s0, s1, avoid)) {
          paveStrip(x, lane, 2.3, 0x8f8268, false)
          // Line the side away from the road (its back gardens face the first row's backs).
          const away = (side === 1 ? 1 : -1) as 1 | -1
          work.push({ lane, side: away, off: 2.9, from: 0, pick: () => (rnd() < 0.08 ? null : { kind: rnd() < 0.2 ? 'row' : rnd() < 0.25 ? 'cottage' : 'town', detail: 'mid', gap: 0.35 + rnd() * 0.6 }) })
        }
    // Side alleys crossing the back lanes, four to six of them near the gate.
    const n = isMain ? 6 : tier <= 2 ? 3 : 4
    for (let k = 0; k < n; k++) {
      const s = 8 + ((k + 0.5) * (dense - 8)) / n
      if (s > total - 6) break
      const q = at(s)
      const side = k % 2 ? 1 : -1
      const dir = Math.atan2(q.tx * side, -q.tz * side) + (rnd() - 0.5) * 0.3
      const alley = alleyFrom(x, q.x - q.tz * side * half, q.z + q.tx * side * half, dir, isMain ? 46 : 32)
      if (alley.length < 4 || alley.some(([ax, az]) => avoid.some((a) => Math.hypot(a.x - ax, a.z - az) < a.r))) continue
      paveStrip(x, alley, 2.1, 0x8f8268, false)
      for (const s2 of [1, -1] as const) work.push({ lane: alley, side: s2, off: 2.7, from: 1, pick: () => (rnd() < 0.1 ? null : { kind: rnd() < 0.35 ? 'cottage' : 'town', detail: 'mid', gap: 0.4 + rnd() * 1.2 }) })
    }
    // Further out: an alley or two to workshops, and farmsteads down the road.
    later.push(() => {
      const branches = isMain ? [dense + 12] : [dense + 4]
      for (const bs of branches) {
        if (bs > total - 10) continue
        const q = at(bs)
        const side = rnd() < 0.5 ? 1 : -1
        const dir = Math.atan2(q.tz, q.tx) + side * (1.05 + rnd() * 0.35)
        const alley = alleyFrom(x, q.x - q.tz * side * half, q.z + q.tx * side * half, dir, 50)
        if (alley.length < 5) continue
        paveStrip(x, alley, 2.3, 0x8f8268, false)
        for (const s2 of [1, -1] as const) lineLane(x, alley, s2, 3.1, 3, Infinity, false, () => (rnd() < 0.25 ? null : { kind: 'cottage', detail: 'mid', gap: 1 + rnd() * 3 }))
        const [ex, ez] = alley[alley.length - 1]
        const [px, pz] = alley[alley.length - 2]
        const ox = ex + (ex - px) * 1.6
        const oz = ez + (ez - pz) * 1.6
        if (x.firm(ox, oz, 6) && x.free(ox, oz, 7) && !x.inWalls(ox, oz, 14) && !x.ruined) workshop(x, ox, oz, facing(ex - ox, ez - oz))
      }
      for (let s = loose + 6; s < total - 6; s += 24 + rnd() * 14) {
        const q = at(s)
        const side = rnd() < 0.5 ? 1 : -1
        const fx = q.x - q.tz * side * (half + 12)
        const fz = q.z + q.tx * side * (half + 12)
        if (!x.firm(fx, fz, 9) || !x.free(fx, fz, 12) || x.inWalls(fx, fz, 20) || !x.laneClear(fx, fz, 8)) continue
        farmstead(x, fx, fz, facing(q.x - fx, q.z - fz))
      }
    })
    if (plaza) later.unshift(() => ringPlaza(x, plaza!.x, plaza!.z, plaza!.r))
  }

  // The lane round the outside of the walls (beyond the outer wall on the greatest castles),
  // from beside one gate to beside the next, with a little square half way.
  const outerWall = !x.timber && (tier >= 4 || x.grand >= 4)
  const off = x.ringOff ?? (outerWall ? 46 : 24)
  for (let i = 0; i < gates.length && !x.noRing; i++) {
    const g0 = gates[i]
    const g1 = gates[(i + 1) % gates.length] + (i === gates.length - 1 ? Math.PI * 2 : 0)
    const clear = (g: number) => ((g === main || g - Math.PI * 2 === main) && barbican ? GH + 14 : GH) / (rAt(g) + off)
    const a0 = g0 + clear(g0)
    const a1 = g1 - clear(g1)
    let run: Path = []
    const runs: Path[] = []
    for (let a = a0; a <= a1; a += 6 / (rAt(a) + off)) {
      const r = rAt(a) + off
      const px = Math.cos(a) * r
      const pz = Math.sin(a) * r
      if (x.firm(px, pz, 2.5) && !x.nearOuterWall(px, pz, 2)) run.push([px, pz])
      else {
        if (run.length >= 4) runs.push(run)
        run = []
      }
    }
    if (run.length >= 4) runs.push(run)
    for (const lane of runs) {
      paveStrip(x, lane, 2.8, 0x938670, false)
      // A little square half way round, if there is room.
      const [mx, mz] = lane[Math.floor(lane.length / 2)]
      const d = Math.hypot(mx, mz) || 1
      const sx = mx + (mx / d) * 13
      const sz = mz + (mz / d) * 13
      if (lane.length > 10 && x.firm(sx, sz, 8) && x.free(sx, sz, 9)) {
        square(x, sx, sz, 8, false)
        later.unshift(() => ringPlaza(x, sx, sz, 8))
      }
      // Outside the lane: houses, shops, row houses; inside, between it and the wall, where there is room.
      const outward: 1 | -1 = -1
      work.push({ lane, side: outward, off: 3.2, from: 0, pick: () => (rnd() < 0.06 ? null : { kind: rnd() < 0.2 ? 'shop' : rnd() < 0.2 ? 'row' : 'town', detail: 'mid', gap: 0.3 + rnd() * 0.6 }) })
      work.push({ lane, side: (-outward) as 1 | -1, off: 3.0, from: 0, pick: () => (rnd() < 0.15 ? null : { kind: rnd() < 0.5 ? 'cottage' : 'town', detail: 'mid', gap: 0.4 + rnd() * 1 }) })
    }
  }
  // Lanes down either side of the barbican, so the town comes right up to the walls there.
  if (barbican && which.includes(main)) {
    for (const s of [-1, 1]) {
      const cx = Math.cos(main)
      const cz = Math.sin(main)
      const lat = GH + 13
      const lane: Path = []
      for (let d = rAt(main) + 12; d <= rAt(main) + 40; d += 5) {
        const px = cx * d - cz * s * lat
        const pz = cz * d + cx * s * lat
        if (!x.firm(px, pz, 2)) break
        lane.push([px, pz])
      }
      if (lane.length < 4) continue
      paveStrip(x, lane, 2.2, 0x8f8268, false)
      // (The side away from the barbican: the lane runs outwards, so that is side s.)
      work.push({ lane, side: s as 1 | -1, off: 2.8, from: 0, pick: () => ({ kind: rnd() < 0.3 ? 'shop' : 'town', detail: 'mid', gap: 0.3 }) })
    }
  }

  // Now build along them all, the roads out of the gates first (they take the best frontage).
  for (const w of work) lineLane(x, w.lane, w.side, w.off, w.from, Infinity, false, w.pick)
  for (const f of later) f()
  // Walled yards, kitchen gardens and sheds in what space is left between the houses.
  for (let i = 0, tries = 0; tries < 260 && i < 6 + tier * 4; tries++) {
    const a = rnd() * Math.PI * 2
    const r = rAt(a) + 18 + rnd() * 70
    const px = Math.cos(a) * r
    const pz = Math.sin(a) * r
    if (!x.firm(px, pz, 6) || !x.free(px, pz, 6.5) || !x.laneClear(px, pz, 6) || x.nearOuterWall(px, pz, 8) || x.inWalls(px, pz, 14)) continue
    if (!x.taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + 10)) continue
    i++
    if (rnd() < 0.7) garden(x, px, pz, facing(-px, -pz), false)
    else if (!x.ruined) {
      const f = new Frame(px, pz, facing(-px, -pz), x.G(px, pz))
      woodpile(x.kit, f)
      cart(x.kit, f.sub(3, 2, 0.6), rnd() < 0.5 ? 'hay' : 'barrels', rnd)
    }
    x.taken.push({ x: px, z: pz, r: 7 })
  }
}
