import * as THREE from 'three'
import { Frame, PAL, cart, fence, gable, haystack, horse, house, tree, wheel } from './buildings'
import { bpart, box, cone, cyl, sphere } from './geo'
import { WOOD, WOOD_D, drape, facing, type Ctx } from './fortress'
import { farmstead } from './castletown'

/**
 * A castle's farmland, beyond its suburbs.
 *
 * Fields laid out along the land as it falls from the walls: standing wheat in golden ridges,
 * harvested stubble with stooks of sheaves, cabbages in rows, vines on posts and wires, fresh
 * ploughed loam, hay meadows; each edged with wattle hurdles or layered hedgerows with hedge trees,
 * a stile at the gap, a scarecrow, haystacks, a cart at the gate. A tower windmill on the highest
 * rise near the castle, whitewashed over a stone footing, with a timber gallery round it, a shingled
 * cap turned into the wind, a tailpole down to a cartwheel, flour sacks at the door and the miller's
 * cottage beside it (the sails are turned by the view). An orchard in neat rows on a green inside a
 * low stone wall, with beehives. Pastures of sheep, cattle or horses behind fences, with a water
 * trough and a hayrick. Burnt and trampled round a ruin.
 */
export function buildFarmland(x: Ctx) {
  const { rnd, tier } = x
  // The windmill first (it wants the high ground), then the orchard and pastures, then fields.
  const big = x.country
  for (let i = 0; i < (big ? big.mills : tier >= 2 ? 1 : 0); i++) windmill(x)
  for (let i = 0; i < (big ? big.orchards : tier >= 2 ? 1 : 0); i++) orchard(x)
  pasture(x, 'sheep')
  if (tier >= 3) pasture(x, rnd() < 0.5 ? 'cattle' : 'horses')
  for (let i = 1; i < (big ? big.pastures : 0); i++) pasture(x, (['sheep', 'cattle', 'horses'] as const)[i % 3])
  // Farmsteads among the fields of a great city's country.
  for (let i = 0, tries = 0; big && i < big.farms && tries < 300; tries++) {
    const spot = findSpot(x, 14, 60, x.outer - x.rAt(0))
    if (!spot) continue
    i++
    farmstead(x, spot[0], spot[1], facing(-spot[0], -spot[1]))
  }
  const want = big ? big.fields : x.timber ? 6 : 8 + tier * 3
  for (let i = 0, tries = 0; i < want && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2
    if (x.gates.some((g) => g !== x.waterGate && Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.16)) continue
    const inner = x.rAt(a) + 40
    const d = inner + rnd() * Math.max(10, x.outer - inner)
    const px = Math.cos(a) * d
    const pz = Math.sin(a) * d
    const w = 26 + rnd() * 16
    const h = 18 + rnd() * 12
    const R = Math.hypot(w, h) * 0.5
    if (x.inWalls(px, pz, 32) || x.nearOuterWall(px, pz, R) || !gentle(x, px, pz, R) || !x.free(px, pz, R * 0.92) || !x.laneClear(px, pz, R * 0.85)) continue
    i++
    field(x, px, pz, a + Math.PI / 2 + (rnd() - 0.5) * 0.6, w, h)
    x.taken.push({ x: px, z: pz, r: R * 0.92 })
  }
}

/** Firm and not too steep for a field or a paddock. */
function gentle(x: Ctx, px: number, pz: number, r: number) {
  if (!x.firm(px, pz, r * 0.7)) return false
  const w = x.world
  for (const [dx, dz] of [[0, 0], [r * 0.6, 0], [-r * 0.6, 0], [0, r * 0.6], [0, -r * 0.6]]) if (w.slopeAt(x.c.x + px + dx, x.c.z + pz + dz) > 0.55) return false
  return true
}

/** Put a part on the ground at a field's local (u, v). */
function onGround(x: Ctx, f: Frame, out: THREE.BufferGeometry[], geo: THREE.BufferGeometry, col: number, u: number, lift: number, v: number, o: Parameters<typeof bpart>[2] = {}) {
  const [wx, wz] = f.at(u, v)
  f.put(out, geo, col, u, x.G(wx, wz) + lift, v, o)
}

/** A run of fence or hedge along a line in the field's frame, piece by piece over the ground. */
function boundary(x: Ctx, f: Frame, u0: number, v0: number, u1: number, v1: number, kind: 'hurdle' | 'hedge', gapAt: number | null) {
  const len = Math.hypot(u1 - u0, v1 - v0)
  const tu = (u1 - u0) / len
  const tv = (v1 - v0) / len
  const rot = Math.atan2(-tv, tu)
  for (let t = 0; t < len - 0.5; t += kind === 'hurdle' ? 6 : 2.6) {
    if (gapAt !== null && Math.abs(t - gapAt) < 2.6) continue
    const u = u0 + tu * t
    const v = v0 + tv * t
    if (kind === 'hurdle') {
      const seg = Math.min(6, len - t)
      const [wx, wz] = f.at(u + (tu * seg) / 2, v + (tv * seg) / 2)
      fence(x.kit, new Frame(wx, wz, f.ry + rot, x.G(wx, wz)), seg)
    } else {
      // A layered hedgerow: a thick base of bushes, a ragged top, a hedge tree now and then.
      const r = x.rnd
      onGround(x, f, x.flat, sphere(1.6 + r() * 0.6, 0), r() < 0.5 ? 0x45642a : 0x506e30, u, 1.0, v, { sy: 0.85, sx: 1.2, ao: 0.3, jitter: 0.14, ry: r() * 3 })
      onGround(x, f, x.flat, sphere(1.1 + r() * 0.5, 0), r() < 0.5 ? 0x587a34 : 0x62843a, u + tu * 1.2, 2.2, v + tv * 1.2, { sy: 0.8, ao: 0.2, jitter: 0.14 })
      if (r() < 0.07) {
        const [wx, wz] = f.at(u, v)
        tree(x.kit, new Frame(wx, wz, 0, x.G(wx, wz)), 0, 0, r, 1.1 + r() * 0.4, x.ruined)
      }
    }
  }
  // A stile at the gap in a hedge.
  if (kind === 'hedge' && gapAt !== null && !x.ruined) {
    const u = u0 + tu * gapAt
    const v = v0 + tv * gapAt
    onGround(x, f, x.flat, box(0.25, 1.6, 0.25), WOOD_D, u - tu * 1.2, 0.8, v - tv * 1.2)
    onGround(x, f, x.flat, box(0.25, 1.6, 0.25), WOOD_D, u + tu * 1.2, 0.8, v + tv * 1.2)
    onGround(x, f, x.flat, box(2.6, 0.2, 0.7), WOOD, u, 0.5, v, { ry: rot })
    onGround(x, f, x.flat, box(2.6, 0.18, 0.18), WOOD, u, 1.3, v, { ry: rot })
  }
}

function field(x: Ctx, px: number, pz: number, ang: number, w: number, h: number) {
  const r = x.rnd
  const f = new Frame(px, pz, ang)
  const crops = ['wheat', 'stubble', 'cabbage', 'vines', 'ploughed', 'meadow'] as const
  const crop = x.ruined ? 'burnt' : crops[Math.floor(r() * crops.length)]
  const soil = { wheat: 0x9a8656, stubble: 0xc0a868, cabbage: 0x6a5a3e, vines: 0x7a6a4a, ploughed: 0x5e4a34, meadow: 0x7a9a48, burnt: 0x4e4436 }[crop]
  // The soil, laid over the ground.
  const quads: number[][] = []
  const nu = 6
  const nv = 4
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const p = (a: number, b: number): [number, number, number] => {
        const u = (a / nu - 0.5) * w
        const v = (b / nv - 0.5) * h
        const [wx, wz] = f.at(u, v)
        return [wx, x.G(wx, wz) + 0.28, wz]
      }
      quads.push([...p(i, j), ...p(i + 1, j), ...p(i + 1, j + 1), ...p(i, j + 1)])
    }
  x.flat.push(drape(quads, soil, 0.07))
  // The crop, row by row along the field, each row in pieces that follow the ground.
  const seg = w / 5
  for (let v = -h / 2 + 1.4; v < h / 2 - 1; v += crop === 'vines' ? 2.6 : 1.8) {
    for (let k = 0; k < 5; k++) {
      const u = -w / 2 + seg * (k + 0.5)
      if (crop === 'wheat') onGround(x, f, x.flat, box(seg - 0.3, 1.0, 1.25), r() < 0.5 ? 0xd4b45a : 0xc8a64e, u, 0.75, v, { ao: 0.35, jitter: 0.1 })
      else if (crop === 'ploughed' || crop === 'burnt') onGround(x, f, x.flat, box(seg - 0.2, 0.45, 0.95), crop === 'burnt' ? 0x3e3830 : 0x4a3a28, u, 0.45, v, { ao: 0.3 })
      else if (crop === 'vines') {
        onGround(x, f, x.flat, box(seg - 0.6, 1.1, 0.9), r() < 0.5 ? 0x4f7a32 : 0x5a8638, u, 1.5, v, { ao: 0.3, jitter: 0.12 })
        onGround(x, f, x.flat, box(0.18, 2.2, 0.18), WOOD_D, u - seg / 2 + 0.3, 1.1, v)
      } else if (crop === 'cabbage') {
        for (let t = -seg / 2 + 1; t < seg / 2; t += 2) onGround(x, f, x.flat, sphere(0.55, 0), r() < 0.5 ? 0x6a9a44 : 0x8aac5a, u + t, 0.6, v, { sy: 0.8, ao: 0.2 })
      } else if (crop === 'meadow' && r() < 0.35) onGround(x, f, x.flat, cone(0.4, 1.4, 3), 0x9ab85a, u + (r() - 0.5) * seg, 0.9, v)
    }
    if (crop === 'stubble' && r() < 0.6) for (let t = -w / 2 + 3; t < w / 2 - 2; t += 5) onGround(x, f, x.flat, cone(0.8, 1.9, 5), 0xd8bc68, t, 1.2, v, { ao: 0.2 })
  }
  // Its bounds: hurdles or a hedgerow on the long sides, with a gap; a gate post at the gap.
  const kind = r() < 0.5 ? 'hurdle' : 'hedge'
  boundary(x, f, -w / 2, -h / 2, w / 2, -h / 2, kind, w * (0.3 + r() * 0.4))
  boundary(x, f, -w / 2, h / 2, w / 2, h / 2, kind, null)
  if (r() < 0.5) boundary(x, f, -w / 2, -h / 2, -w / 2, h / 2, kind, null)
  if (x.ruined) return
  // A scarecrow over the crop, haystacks on the stubble and meadow, a cart by the gate.
  if ((crop === 'wheat' || crop === 'cabbage') && r() < 0.6) {
    const u = (r() - 0.5) * w * 0.5
    const v = (r() - 0.5) * h * 0.4
    onGround(x, f, x.flat, box(0.2, 3.4, 0.2), PAL.timber, u, 1.7, v)
    onGround(x, f, x.flat, box(2.6, 0.18, 0.18), PAL.timber, u, 2.7, v)
    onGround(x, f, x.flat, sphere(0.45, 0), 0xd8c49a, u, 3.6, v)
    onGround(x, f, x.flat, cone(0.7, 0.6, 5), 0x6a5a3a, u, 4.1, v)
    onGround(x, f, x.kit.accents, box(1.2, 1.3, 0.5), 0xffffff, u, 2.4, v)
  }
  if (crop === 'stubble' || crop === 'meadow') for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
    const u = (r() - 0.5) * w * 0.7
    const v = (r() - 0.5) * h * 0.6
    const [wx, wz] = f.at(u, v)
    haystack(x.kit, new Frame(wx, wz, 0, x.G(wx, wz)), 0, 0, 0.9)
  }
  if (r() < 0.25) {
    const [wx, wz] = f.at(w * 0.3, -h / 2 - 3)
    cart(x.kit, new Frame(wx, wz, f.ry + 1.2, x.G(wx, wz)), crop === 'cabbage' ? 'sacks' : 'hay', r)
  }
}

/** A spot on the castle's country for something of radius rr, tried a number of times. */
function findSpot(x: Ctx, rr: number, near: number, far: number, prefer?: (px: number, pz: number) => number): [number, number] | null {
  let best: [number, number] | null = null
  let bv = -Infinity
  for (let t = 0; t < 60; t++) {
    const a = x.rnd() * Math.PI * 2
    if (x.gates.some((g) => g !== x.waterGate && Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.25)) continue
    const d = x.rAt(a) + near + x.rnd() * (far - near)
    const px = Math.cos(a) * d
    const pz = Math.sin(a) * d
    if (x.inWalls(px, pz, 30) || x.nearOuterWall(px, pz, rr) || !gentle(x, px, pz, rr) || !x.free(px, pz, rr) || !x.laneClear(px, pz, rr * 0.9)) continue
    const v = prefer ? prefer(px, pz) : 0
    if (v > bv) {
      bv = v
      best = [px, pz]
    }
    if (!prefer) break
  }
  return best
}

function windmill(x: Ctx) {
  const spot = findSpot(x, 16, 55, x.country ? (x.outer - x.rAt(0)) * 0.8 : 115, (px, pz) => x.G(px, pz))
  if (!spot) return
  const [px, pz] = spot
  x.taken.push({ x: px, z: pz, r: 16 })
  const S = x.S
  const k = x.kit
  // Face the sails across the castle (so they read from the walls).
  const ry = facing(-px, -pz) + 0.6
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < 8; i++) {
    const h = x.G(px + Math.cos(i * 0.785) * 5.5, pz + Math.sin(i * 0.785) * 5.5)
    lo = Math.min(lo, h)
    hi = Math.max(hi, h)
  }
  S(cyl(5.6, 6, hi - lo + 1.6, 12), 0x8a8274, { x: px, y: (hi + lo) / 2 - 0.2, z: pz, ao: 0.2 })
  const y = hi + 0.6
  if (x.ruined) {
    S(cyl(4.2, 4.8, 6, 12), 0x3a342c, { x: px, y: y + 3, z: pz })
    return
  }
  x.stone.push(bpart(new THREE.CylinderGeometry(3.7, 4.8, 13, 12, 3), 0xdcd4c2, { x: px, y: y + 6.5, z: pz, ao: 0.15 }))
  S(cyl(4.9, 5.1, 1.4, 12), 0x8a8274, { x: px, y: y + 0.7, z: pz })
  const f = new Frame(px, pz, ry, y)
  f.put(x.flat, box(1.8, 2.8, 0.3), PAL.door, 0, 1.6, 4.7)
  f.put(x.flat, box(2.4, 0.4, 0.5), PAL.timber, 0, 3.1, 4.75)
  // Little windows up the tower, each a little round from the last.
  for (const [yy, rot] of [[9, 0], [5.5, 0.7], [11, -0.7], [3.5, 2.6]] as const) f.sub(0, 0, rot).put(x.flat, box(0.9, 1.3, 0.3), PAL.dark, 0, yy, 4.75 - yy * 0.087, { ao: 0 })
  // The gallery round the tower: a planked deck on brackets, a railing.
  S(new THREE.CylinderGeometry(6.4, 6.4, 0.35, 16, 1), WOOD, { x: px, y: y + 6.4, z: pz })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    S(box(0.2, 1.3, 0.2), WOOD_D, { x: px + Math.cos(a) * 6.2, y: y + 7.1, z: pz + Math.sin(a) * 6.2, ao: 0 })
    S(box(0.25, 2, 0.25), WOOD_D, { x: px + Math.cos(a) * 4.9, y: y + 5.4, z: pz + Math.sin(a) * 4.9, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, ao: 0 })
  }
  S(new THREE.TorusGeometry(6.2, 0.1, 3, 24), WOOD_D, { x: px, y: y + 7.7, z: pz, rx: Math.PI / 2, ao: 0 })
  // The cap, turned into the wind: a boat-shaped body under a shingled gable, the tailpole behind.
  const cap = new Frame(px, pz, ry, y + 13)
  cap.put(x.stone, box(6.6, 3, 6.4), WOOD_D, 0, 1.4, 0)
  cap.put(k.roofs, gable(7.4, 7.6, 3.2), 0x6f5a42, 0, 2.9, 0, { ry: Math.PI / 2 })
  cap.put(x.flat, box(0.5, 0.5, 13), WOOD, 0, -3.6, -7.4, { rx: -0.85 })
  const [tx, tz] = f.at(0, -11.6)
  wheel(k, new Frame(tx, tz, ry, x.G(tx, tz)), 0, 1.2, 0, 1.1)
  const [hx, hz] = cap.at(0, 3.6)
  x.mills.push({ x: hx, y: y + 14.4, z: hz, ry, r: 12 })
  // Flour sacks by the door, a cart, the miller's cottage.
  for (let i = 0; i < 5; i++) f.put(x.flat, sphere(0.7, 0), 0xe0d6bc, -2 + (i % 3) * 1.2, 0.6 + Math.floor(i / 3) * 0.9, 6.4, { sy: 0.8, ao: 0.15 })
  cart(k, f.sub(4.5, 8, 0.4), 'sacks', x.rnd)
  const [cx, cz] = f.at(-14, 4)
  if (x.firm(cx, cz, 5)) {
    const cr = facing(px - cx, pz - cz)
    house(k, new Frame(cx, cz, cr, x.foot(cx, cz, 8, 7, cr)), { w: 8, d: 7, storeys: 1, roof: 'thatch', style: 'timber', detail: 'mid' }, x.rnd)
    x.smoke.push([cx, x.G(cx, cz) + 8, cz])
  }
}

/** A low dry-stone wall round a rectangle in a frame, in pieces over the ground, a gap for the gate. */
function enclose(x: Ctx, f: Frame, w: number, h: number, kind: 'stone' | 'fence') {
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
      const u = u0 + tu * (t + seg / 2)
      const v = v0 + tv * (t + seg / 2)
      const [wx, wz] = f.at(u, v)
      if (kind === 'stone') x.F(box(seg + 0.2, 1.4, 0.9), x.ruined ? 0x5a5448 : 0x9a9282, { x: wx, y: x.G(wx, wz) + 0.6, z: wz, ry: f.ry + rot, ao: 0.25, jitter: 0.14 })
      else fence(x.kit, new Frame(wx, wz, f.ry + rot, x.G(wx, wz)), seg)
    }
  })
  // The gate: two posts and a field gate swung half open.
  if (!x.ruined) {
    const [gx, gz] = f.at(0, -h / 2)
    const gy = x.G(gx, gz)
    const g = new Frame(gx, gz, f.ry, gy)
    for (const s of [-1, 1]) g.put(x.flat, box(0.35, 1.8, 0.35), WOOD_D, s * 2.4, 0.9, 0)
    g.put(x.flat, box(2.4, 1.1, 0.12), WOOD, -1.1, 0.8, -0.9, { ry: 0.8 })
  }
}

function orchard(x: Ctx) {
  const w = 30
  const h = 22
  const spot = findSpot(x, 19, 45, x.country ? (x.outer - x.rAt(0)) * 0.8 : 100)
  if (!spot) return
  const [px, pz] = spot
  x.taken.push({ x: px, z: pz, r: 19 })
  const f = new Frame(px, pz, facing(-px, -pz) + Math.PI / 2)
  const quads: number[][] = []
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const p = (a: number, b: number): [number, number, number] => {
        const [wx, wz] = f.at((a / 4 - 0.5) * w, (b / 3 - 0.5) * h)
        return [wx, x.G(wx, wz) + 0.3, wz]
      }
      quads.push([...p(i, j), ...p(i + 1, j), ...p(i + 1, j + 1), ...p(i, j + 1)])
    }
  x.flat.push(drape(quads, x.ruined ? 0x4e4436 : 0x7aa04a, 0.06))
  enclose(x, f, w, h, 'stone')
  const fruit = [0xb8302a, 0xd8b040, 0xf0e8f0][Math.floor(x.rnd() * 3)]
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const u = -11 + i * 5.5
      const v = -6 + j * 6
      const [wx, wz] = f.at(u, v)
      const y = x.G(wx, wz)
      if (x.ruined) {
        tree(x.kit, new Frame(wx, wz, 0, y), 0, 0, x.rnd, 0.8, true)
        continue
      }
      x.S(cyl(0.25, 0.4, 2.6, 5), 0x5b4027, { x: wx, y: y + 1.3, z: wz })
      x.S(sphere(2.1, 0), (i + j) % 2 ? 0x4f7a32 : 0x5a8638, { x: wx, y: y + 3.6, z: wz, sy: 0.85, ao: 0.3, jitter: 0.1 })
      for (let q = 0; q < 5; q++) {
        const a = q * 1.26 + i
        x.F(sphere(0.28, 0), fruit, { x: wx + Math.cos(a) * 1.8, y: y + 3.2 + (q % 2) * 0.9, z: wz + Math.sin(a) * 1.8, ao: 0 })
      }
    }
  if (!x.ruined)
    for (let i = 0; i < 3; i++) {
      // Straw skeps for the bees along the wall.
      const [wx, wz] = f.at(-12 + i * 2.2, h / 2 - 2)
      const y = x.G(wx, wz)
      x.F(box(1.6, 0.6, 1.2), WOOD, { x: wx, y: y + 0.6, z: wz })
      x.F(cone(0.7, 1.2, 5), 0xc8a050, { x: wx, y: y + 1.5, z: wz })
    }
}

function sheep(x: Ctx, wx: number, wz: number, ry: number) {
  const y = x.G(wx, wz)
  const f = new Frame(wx, wz, ry, y)
  f.put(x.flat, sphere(0.95, 0), 0xe8e2d4, 0, 1.2, 0, { sx: 0.85, sz: 1.25, ao: 0.2 })
  f.put(x.flat, box(0.5, 0.55, 0.7), 0x2a2420, 0, 1.45, 1.25)
  for (const [lx, lz] of [[-0.4, 0.55], [0.4, 0.55], [-0.4, -0.55], [0.4, -0.55]]) f.put(x.flat, box(0.16, 0.8, 0.16), 0x2a2420, lx, 0.4, lz, { ao: 0 })
}

function cow(x: Ctx, wx: number, wz: number, ry: number) {
  const y = x.G(wx, wz)
  const f = new Frame(wx, wz, ry, y)
  const coat = [0x5a3a22, 0x2a2420, 0x8a6a48, 0xe0d8c8][Math.floor(x.rnd() * 4)]
  f.put(x.flat, box(1.4, 1.3, 2.8), coat, 0, 1.75, 0)
  f.put(x.flat, box(0.8, 0.8, 1.0), coat, 0, 2.0, 1.75)
  for (const s of [-1, 1]) f.put(x.flat, cone(0.1, 0.6, 4), 0xe8dcc0, s * 0.45, 2.55, 1.7, { rz: -s * 1.1, ao: 0 })
  for (const [lx, lz] of [[-0.5, 1], [0.5, 1], [-0.5, -1], [0.5, -1]]) f.put(x.flat, box(0.28, 1.2, 0.28), coat, lx, 0.6, lz, { ao: 0.2 })
  f.put(x.flat, box(0.12, 1.1, 0.12), coat, 0, 1.6, -1.45, { rx: 0.3 })
}

function pasture(x: Ctx, kind: 'sheep' | 'cattle' | 'horses') {
  const w = 36
  const h = 26
  const spot = findSpot(x, 22, 45, x.country ? (x.outer - x.rAt(0)) * 0.8 : 110)
  if (!spot) return
  const [px, pz] = spot
  x.taken.push({ x: px, z: pz, r: 22 })
  const f = new Frame(px, pz, facing(-px, -pz) + Math.PI / 2 + (x.rnd() - 0.5) * 0.4)
  const quads: number[][] = []
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const p = (a: number, b: number): [number, number, number] => {
        const [wx, wz] = f.at((a / 4 - 0.5) * w, (b / 3 - 0.5) * h)
        return [wx, x.G(wx, wz) + 0.26, wz]
      }
      quads.push([...p(i, j), ...p(i + 1, j), ...p(i + 1, j + 1), ...p(i, j + 1)])
    }
  x.flat.push(drape(quads, x.ruined ? 0x4e4436 : 0x86ac52, 0.08))
  enclose(x, f, w, h, 'fence')
  if (x.ruined) return
  // A trough of water and a hayrick under its little roof.
  const [tx, tz] = f.at(w / 2 - 5, h / 2 - 4)
  const ty = x.G(tx, tz)
  x.F(box(4, 1, 1.4), WOOD, { x: tx, y: ty + 0.5, z: tz, ry: f.ry })
  x.F(box(3.6, 0.1, 1.0), 0x4a7a8a, { x: tx, y: ty + 0.98, z: tz, ry: f.ry, ao: 0 })
  const [hx, hz] = f.at(-w / 2 + 5, h / 2 - 5)
  const hy = x.G(hx, hz)
  haystack(x.kit, new Frame(hx, hz, 0, hy), 0, 0, 0.8)
  for (const [sx, sz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) x.F(box(0.25, 5.4, 0.25), WOOD_D, { x: hx + sx, y: hy + 2.7, z: hz + sz })
  x.kit.roofs.push(bpart(gable(6, 6, 1.6), 0x6f5a42, { x: hx, y: hy + 5.4, z: hz, ry: f.ry }))
  const n = kind === 'sheep' ? 10 + Math.floor(x.rnd() * 5) : kind === 'cattle' ? 6 : 4
  for (let i = 0; i < n; i++) {
    const [wx, wz] = f.at((x.rnd() - 0.5) * (w - 6), (x.rnd() - 0.5) * (h - 6))
    const ry = x.rnd() * Math.PI * 2
    if (kind === 'sheep') sheep(x, wx, wz, ry)
    else if (kind === 'cattle') cow(x, wx, wz, ry)
    else horse(x.kit, new Frame(wx, wz, ry, x.G(wx, wz)), [0x5a3a22, 0x3a2a1e, 0x8a6a48, 0xd8d0c0][i % 4])
  }
}
