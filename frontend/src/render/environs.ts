import * as THREE from 'three'
import { Frame, PAL, barrel, cart, crate, gable, horse, house, woodpile } from './buildings'
import { box, cone, cyl, sphere } from './geo'
import { laneClearRect, walker } from './castletown'
import { IRON, WOOD, WOOD_D, drape, facing, type Ctx } from './fortress'

/**
 * What stands beyond a castle's town, on the open ground round it (the fields are gone: the grange
 * feeds the castle now):
 *
 *   the wagon yard   beside the main road, where the grain wagons from the grange and the carts from
 *                    the villages unload before they go in: a fenced yard of beaten earth, the
 *                    weigh-house, an open shed, a jib crane over heaps of sacks, crates and barrels,
 *                    covered wagons with their teams, market stalls along the road, a mason's yard
 *                    with a treadwheel crane, a water trough; lanterns on posts by night;
 *   lanterns         on posts down the roads through the town outside the gates.
 *
 * Everything in the realm's own stone and colours, and lit by night.
 */
export function buildEnvirons(x: Ctx) {
  if (x.ruined || !x.roads.length) return
  wagonYard(x)
  roadLanterns(x)
}

/** A frame on the ground at a point of another frame (its own ground height). */
function on(x: Ctx, f: Frame, u: number, v: number, rot = 0): Frame {
  const [px, pz] = f.at(u, v)
  return new Frame(px, pz, f.ry + rot, x.G(px, pz))
}

/** Is this rectangle (turned like a Frame) open, firm, gentle ground, clear of the town and every lane? */
function lotClear(x: Ctx, cx: number, cz: number, ry: number, w: number, d: number, slope = 3.5) {
  const f = new Frame(cx, cz, ry)
  let lo = Infinity
  let hi = -Infinity
  for (let u = -w / 2; u <= w / 2 + 0.01; u += w / 4)
    for (let v = -d / 2; v <= d / 2 + 0.01; v += d / 3) {
      const [px, pz] = f.at(u, v)
      if (!x.firm(px, pz, 2) || x.inWalls(px, pz, 16)) return false
      const h = x.G(px, pz)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
  if (hi - lo > slope) return false
  return x.freeRect(cx, cz, w / 2 + 1, d / 2 + 1, ry) && laneClearRect(x, cx, cz, w / 2 + 0.5, d / 2 + 0.5, ry, [])
}

/** The ground of a lot, draped over the land (beaten earth, sand, turf). */
function patch(x: Ctx, f: Frame, w: number, d: number, color: number, lift = 0.22, cell = 4) {
  const quads: number[][] = []
  const p = (u: number, v: number): [number, number, number] => {
    const [px, pz] = f.at(u, v)
    return [px, x.G(px, pz) + lift, pz]
  }
  for (let u = -w / 2; u < w / 2 - 0.01; u += cell)
    for (let v = -d / 2; v < d / 2 - 0.01; v += cell) {
      const u1 = Math.min(w / 2, u + cell)
      const v1 = Math.min(d / 2, v + cell)
      quads.push([...p(u, v), ...p(u1, v), ...p(u1, v1), ...p(u, v1)])
    }
  x.flat.push(drape(quads, color, 0.07))
}

/** Cobbles over a lot, draped over the land: setts in three tones. */
function cobbles(x: Ctx, f: Frame, w: number, d: number, lift = 0.3, cell = 2.2) {
  const tones = [0xa89a80, 0x9a8c72, 0xb2a48a]
  const cells: number[][][] = [[], [], []]
  const p = (u: number, v: number): [number, number, number] => {
    const [px, pz] = f.at(u, v)
    return [px, x.G(px, pz) + lift, pz]
  }
  let i = 0
  for (let u = -w / 2; u < w / 2 - 0.01; u += cell)
    for (let v = -d / 2; v < d / 2 - 0.01; v += cell, i++) {
      const u1 = Math.min(w / 2, u + cell)
      const v1 = Math.min(d / 2, v + cell)
      cells[Math.abs(Math.round(Math.sin(i * 12.9898 + u * 3.1) * 4375.85)) % 3].push([...p(u, v), ...p(u1, v), ...p(u1, v1), ...p(u, v1)])
    }
  cells.forEach((c, t) => c.length && x.flat.push(drape(c, tones[t], 0.05)))
}

/** A kerb of dressed stone round a lot (or along one side of it), following the ground. */
function kerb(x: Ctx, f: Frame, w: number, d: number, sides: ('back' | 'front' | 'left' | 'right')[], lift = 0.34) {
  const quads: number[][] = []
  const p = (u: number, v: number): [number, number, number] => {
    const [px, pz] = f.at(u, v)
    return [px, x.G(px, pz) + lift, pz]
  }
  const run = (u0: number, v0: number, u1: number, v1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / 3))
    const du = (u1 - u0) / n
    const dv = (v1 - v0) / n
    const L = Math.hypot(du, dv)
    const nu = -dv / L
    const nv = du / L
    for (let i = 0; i < n; i++) {
      const a = [u0 + du * i, v0 + dv * i]
      const b = [a[0] + du, a[1] + dv]
      quads.push([...p(a[0] - nu * 0.3, a[1] - nv * 0.3), ...p(b[0] - nu * 0.3, b[1] - nv * 0.3), ...p(b[0] + nu * 0.3, b[1] + nv * 0.3), ...p(a[0] + nu * 0.3, a[1] + nv * 0.3)])
    }
  }
  if (sides.includes('back')) run(-w / 2, -d / 2, w / 2, -d / 2)
  if (sides.includes('front')) run(w / 2, d / 2, -w / 2, d / 2)
  if (sides.includes('left')) run(-w / 2, d / 2, -w / 2, -d / 2)
  if (sides.includes('right')) run(w / 2, -d / 2, w / 2, d / 2)
  x.flat.push(drape(quads, 0x847a6a, 0.06))
}

/** A post-and-rail fence along a frame's x, following the ground. */
function rails(x: Ctx, f: Frame, u0: number, u1: number, v: number, rot = 0) {
  const g = f.sub(0, 0, rot)
  for (let u = u0; u < u1 - 0.1; u += 3) {
    const a = on(x, g, u, v)
    const len = Math.min(3, u1 - u)
    a.put(x.flat, box(0.28, 1.6, 0.28), WOOD_D, 0, 0.8, 0, { ao: 0.1 })
    for (const y of [0.6, 1.25]) a.put(x.flat, box(len, 0.16, 0.14), WOOD, len / 2, y, 0, { ao: 0 })
  }
  on(x, g, u1, v).put(x.flat, box(0.28, 1.6, 0.28), WOOD_D, 0, 0.8, 0, { ao: 0.1 })
}

/** A lantern on a post: lit by night, its flame and its pool of light. */
function lantern(x: Ctx, f: Frame, h = 4.4, pool = 0) {
  f.put(x.flat, cyl(0.14, 0.18, h, 6), WOOD_D, 0, h / 2, 0, { ao: 0.05 })
  f.put(x.flat, box(1.2, 0.14, 0.14), WOOD_D, 0.5, h - 0.2, 0, { ao: 0 })
  f.put(x.flat, box(0.6, 0.12, 0.6), IRON, 1, h - 0.5, 0, { ao: 0 })
  f.put(x.kit.lamps!, box(0.5, 0.62, 0.5), 0xffc070, 1, h - 0.92, 0, { ao: 0 })
  f.put(x.flat, cone(0.42, 0.36, 4), IRON, 1, h - 0.38, 0, { ry: Math.PI / 4, ao: 0 })
  const [lx, lz] = f.at(1, 0)
  x.flames.push([lx, f.y + h - 0.95, lz, 1.9])
  if (pool) x.lights.push({ x: lx, y: f.y + h, z: lz, r: pool, i: 0.42 })
}

/** A covered wagon: the cart under hoops and a canvas tilt, its team before it or not. */
function wagon(x: Ctx, f: Frame, load: 'sacks' | 'barrels' | 'hay' | 'empty', team: boolean) {
  const k = x.kit
  cart(k, f, load, x.rnd)
  if (load !== 'hay') {
    const tilt = new THREE.CylinderGeometry(1.35, 1.35, 4, 9, 1, true, -Math.PI / 2, Math.PI)
    f.put(x.flat, tilt, x.rnd() < 0.3 ? 0xd8c8a0 : PAL.canvas, 0, 2.5, -0.1, { rx: Math.PI / 2, ao: 0.15 })
    for (const v of [-1.9, 0, 1.9]) f.put(x.flat, new THREE.TorusGeometry(1.38, 0.07, 3, 9, Math.PI), WOOD_D, 0, 2.5, v - 0.1, { ry: Math.PI / 2, ao: 0 })
  }
  if (team) {
    const coats = [0x5a3a22, 0x7a5232, 0x3a2a1e, 0x8a6a48]
    for (const s of [-0.7, 0.7]) horse(k, f.sub(s, 6.4), coats[Math.floor(x.rnd() * coats.length)])
    f.put(x.flat, box(0.12, 0.12, 3), WOOD_D, 0, 1.6, 4.6, { ao: 0 })
  }
}

// ---------------------------------------------------------------------------------------------
// The wagon yard.
// ---------------------------------------------------------------------------------------------

function wagonYard(x: Ctx) {
  const W = 46
  const D = 32
  const roads = [...x.roads].sort((a, b) => Number(b.main) - Number(a.main))
  let f: Frame | null = null
  for (const r of roads) {
    const { at, total } = walker(r.path)
    const half = r.main ? 6.5 : 4.8
    for (let s = 60; s < total - W / 2 && !f; s += 4)
      for (const side of [1, -1]) {
        const q = at(s)
        const nx = -q.tz * side
        const nz = q.tx * side
        const cx = q.x + nx * (half + D / 2 + 4)
        const cz = q.z + nz * (half + D / 2 + 4)
        const ry = facing(-nx, -nz)
        if (!lotClear(x, cx, cz, ry, W, D)) continue
        f = new Frame(cx, cz, ry)
        break
      }
    if (f) break
  }
  if (!f) return
  x.taken.push({ x: f.x, z: f.z, r: Math.hypot(W, D) / 2, hw: W / 2 + 1, hd: D / 2 + 1, ry: f.ry })
  const { kit: k, rnd } = x
  // (Local x along the road, +z toward it.)
  // The ground: beaten earth rutted by the wheels, cobbles where the wagons unload along the back
  // and in a strip along the front, an apron of cobbles out to the road, kerbs round the edge.
  patch(x, f, W, D, 0x8e7e5e, 0.22, 4)
  cobbles(x, f.sub(0, -D / 2 + 7), W - 2, 12)
  cobbles(x, f.sub(0, D / 2 - 2.5), W - 2, 4)
  cobbles(x, f.sub(0, D / 2 + 2.6), 15, 5.6)
  kerb(x, f, W, D, ['back', 'left', 'right'])
  for (const u of [-1.2, 1.2]) for (const [v0, v1, a] of [[D / 2 - 4, 4, 0], [4, -3, 0.35]] as const) {
    const g = f.sub(u + a * 2, (v0 + v1) / 2, a)
    patch(x, g, 0.55, Math.abs(v1 - v0) + 1, 0x6a5c44, 0.27, 1)
  }
  // Fenced on three sides, open to the road between gateposts with the yard's sign.
  rails(x, f, -W / 2, W / 2, -D / 2)
  rails(x, f.sub(-W / 2, 0), -D / 2, D / 2 - 4, 0, -Math.PI / 2)
  rails(x, f.sub(W / 2, 0), -D / 2, D / 2 - 4, 0, -Math.PI / 2)
  for (const s of [-1, 1]) on(x, f, s * 7, D / 2 - 0.5).put(x.flat, box(0.5, 4.6, 0.5), WOOD_D, 0, 2.3, 0)
  on(x, f, 0, D / 2 - 0.5).put(x.flat, box(14.6, 0.4, 0.4), WOOD_D, 0, 4.4, 0)
  on(x, f, 0, D / 2 - 0.5).put(x.roof, box(3, 1.4, 0.12), 0xffffff, 0, 3.4, 0.2, { ao: 0 })
  // The weigh-house in the corner, the open shed along the back.
  house(k, on(x, f, -W / 2 + 7, -D / 2 + 6), { w: 10, d: 7, storeys: 2, roof: x.S0.roofs[0], style: x.S0.houses === 'plaster' ? 'plaster' : 'stone', stone: x.S0.stoneL, banner: true }, rnd)
  {
    const sh = on(x, f, 8, -D / 2 + 4.5)
    for (let u = -10; u <= 10; u += 5) for (const v of [-3, 3]) sh.put(x.flat, box(0.45, 4.6, 0.45), WOOD_D, u, 2.3, v)
    sh.put(x.stone, gable(8.4, 21.6, 2.2), PAL.shingle[1], 0, 4.6, 0, { ao: 0.15 })
    for (let i = 0; i < 6; i++) crate(k, sh, -8 + i * 2.6, 0, -1.2 + (i % 2) * 1.6, 1.4)
    for (let i = 0; i < 5; i++) barrel(k, sh, 5 + (i % 3) * 1.4, 1.6 - Math.floor(i / 3) * 1.4)
  }
  // The jib crane over a heap of sacks.
  {
    const cr = on(x, f, -6, -4)
    cr.put(x.flat, box(2.2, 0.8, 2.2), x.S0.stoneD, 0, 0.4, 0)
    cr.put(x.stone, box(0.7, 8, 0.7), WOOD, 0, 4.6, 0)
    cr.put(x.stone, box(6.4, 0.55, 0.55), WOOD, 2.6, 8.2, 0)
    cr.put(x.flat, box(0.4, 0.4, 3.6), WOOD_D, 1.2, 6.8, 0, { rz: 0.9, ry: Math.PI / 2 })
    cr.put(x.flat, box(0.07, 3.6, 0.07), 0x8a7a5a, 5.4, 6.2, 0, { ao: 0 })
    cr.put(x.flat, box(1.6, 1.2, 1.2), 0xcdbf98, 5.4, 3.8, 0, { jitter: 0.1 })
    for (let i = 0; i < 14; i++) cr.put(x.flat, sphere(0.7, 0), i % 3 ? 0xcdbf98 : 0xbfae84, 4 + (i % 5) * 1.1, 0.5 + Math.floor(i / 5) * 0.65, 2 + (i % 2) * 0.9, { sy: 0.65, jitter: 0.12 })
  }
  // The wagons: two with their teams, unloading; two drawn up empty.
  wagon(x, on(x, f, 2, 3, Math.PI / 2 + 0.1), 'sacks', true)
  wagon(x, on(x, f, -14, 4, -Math.PI / 2 + 0.15), 'barrels', true)
  wagon(x, on(x, f, 14, -6, 0.2), 'empty', false)
  wagon(x, on(x, f, 18.5, -5.4, 0.12), 'hay', false)
  // Stalls along the road, under awnings in the lord's colours.
  for (const u of [-18, -11, 11, 18]) {
    const st = on(x, f, u, D / 2 - 3.2)
    for (const [a, b] of [[-2.2, -1], [2.2, -1], [-2.2, 1], [2.2, 1]]) st.put(x.flat, box(0.18, 2.6, 0.18), WOOD_D, a, 1.3, b)
    st.put(x.flat, box(4.4, 0.9, 1.6), WOOD, 0, 0.9, 0)
    for (let i = 0; i < 4; i++) st.put(i % 2 ? x.roof : x.flat, box(1.2, 0.12, 2.8), i % 2 ? 0xffffff : 0xe8dcc0, -1.8 + i * 1.2, 2.7, 0, { rx: 0.18, ao: 0 })
    for (let i = 0; i < 3; i++) st.put(x.flat, i === 1 ? sphere(0.4, 0) : box(0.7, 0.4, 0.5), [0xb85a3a, 0x9a8a3a, 0xcdbf98][i], -1.3 + i * 1.3, 1.6, 0)
  }
  // The mason's yard: dressed blocks, one on the banker, a treadwheel crane.
  {
    const ms = on(x, f, -W / 2 + 8, 5)
    for (let i = 0; i < 9; i++) ms.put(x.flat, box(1.8, 1, 1.1), i % 2 ? x.S0.stoneL : x.S0.stone, -2 + (i % 3) * 2, 0.5 + Math.floor(i / 3) * 1, -2, { jitter: 0.1 })
    ms.put(x.flat, box(1.6, 1.2, 1.2), WOOD_D, 3, 0.6, 1)
    ms.put(x.flat, box(1.4, 0.8, 1), x.S0.stoneL, 3, 1.6, 1)
    const tw = ms.sub(-1, 3.6)
    tw.put(x.stone, new THREE.TorusGeometry(2.6, 0.22, 4, 14), WOOD, 0, 2.9, 0, { ao: 0 })
    for (let i = 0; i < 4; i++) tw.put(x.flat, box(0.14, 5.2, 0.14), WOOD_D, 0, 2.9, 0, { rx: (i * Math.PI) / 4, ao: 0 })
    for (const s of [-1, 1]) tw.put(x.flat, box(0.3, 6, 0.3), WOOD_D, s * 0.9, 3, 0, { rz: s * 0.25 })
    tw.put(x.stone, box(0.4, 0.4, 7), WOOD, 0, 6.2, -2.4, { rx: 0.5 })
  }
  // A water trough and a horse at it; timber stacked by the fence.
  {
    const tr = on(x, f, 0, -D / 2 + 3)
    tr.put(x.flat, box(4.6, 0.9, 1.2), x.S0.stoneD, 0, 0.45, 0)
    tr.put(x.flat, box(4.2, 0.1, 0.9), 0x4a6a7a, 0, 0.92, 0, { ao: 0 })
    horse(x.kit, tr.sub(-1, 2, Math.PI), 0x5a3a22)
    woodpile(x.kit, on(x, f, W / 2 - 4, 4, Math.PI / 2))
  }
  // Lanterns on posts round the yard, and a brazier by the weigh-house.
  for (const [u, v] of [[-W / 2 + 1.5, D / 2 - 2], [W / 2 - 1.5, D / 2 - 2], [-6.5, D / 2 - 1.5], [6.5, D / 2 - 1.5], [0, -2]] as const) lantern(x, on(x, f, u, v), 4.6, 0)
  {
    const b = on(x, f, -W / 2 + 13.5, -D / 2 + 9)
    for (let i = 0; i < 3; i++) b.put(x.flat, box(0.12, 1.2, 0.12), IRON, Math.cos(i * 2.1) * 0.45, 0.6, Math.sin(i * 2.1) * 0.45, { ao: 0 })
    b.put(x.flat, cyl(0.75, 0.45, 0.55, 7), IRON, 0, 1.4, 0, { ao: 0 })
    b.put(x.kit.glow, cone(0.55, 1, 6), 0xff8a3a, 0, 2, 0)
    x.flames.push([b.x, b.y + 2.3, b.z, 5])
  }
  x.lights.push({ x: f.x, y: x.G(f.x, f.z) + 6, z: f.z, r: 38, i: 0.5 })
}

/** Lanterns on posts down the roads through the town outside the gates, lit by night. */
function roadLanterns(x: Ctx) {
  for (const r of x.roads) {
    const { at, total } = walker(r.path)
    const half = r.main ? 6.5 : 4.8
    let side = 1
    for (let s = 10; s < Math.min(total - 4, r.main ? 150 : 110); s += r.main ? 20 : 26) {
      const q = at(s)
      const px = q.x - q.tz * side * (half + 0.9)
      const pz = q.z + q.tx * side * (half + 0.9)
      side = -side
      if (!x.firm(px, pz, 1) || !x.free(px, pz, 0.9) || x.inWalls(px, pz, 8)) continue
      x.taken.push({ x: px, z: pz, r: 1 })
      lantern(x, new Frame(px, pz, Math.atan2(q.x - px, q.z - pz) - Math.PI / 2, x.G(px, pz)), 4.2, 0)
    }
  }
}
