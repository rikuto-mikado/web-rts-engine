import * as THREE from 'three'
import { Frame, PAL, barrel, bannerPole, brazier, crate, fence, hip, horse, house, tree, type Kit } from './buildings'
import { circleHitsRect, coursedCone, facing, mottle, rectsOverlap, type Taken } from './fortress'
import { bpart, box, cone, cyl, sphere } from './geo'

/**
 * The royal precinct inside the Citadel's curtain: the ground the Great Keep, palace, great hall
 * and chapel stand in, filled as a royal court is.
 *
 *   Four processional avenues from the gates to the keep, paved in a chequer of two stones between
 *   kerbs, lit by braziers on iron posts; a ring road just inside the curtain.
 *   A cloister: a square arcade round a garden of clipped box parterres, flower beds and gravel
 *   walks, a great fountain, statues on their plinths and an obelisk.
 *   The Royal Guard's barracks facing each other over a drill yard with archery butts, a quintain
 *   and weapon racks, an armoury, and the royal stables with horses at the rail and a paddock.
 *   The mansions of the great lords and the chancellor: three storeys of dressed stone under slate,
 *   string courses, tall chimneys, banners and a carved shield over the door, a walled garden.
 *   The treasury (squat, buttressed, iron-bound), the library tower and an observatory under a
 *   copper dome.
 *   Formal gardens, statues and trees in what ground is left.
 *
 * Everything in the citadel's local frame (gates on the axes), into the kit's parts.
 */
export function royalPrecinct(k: Kit, rnd: () => number, wallR: number, gateHalf: number, smoke: [number, number, number][]) {
  const taken: Taken[] = []
  const rect = (x: number, z: number, hw: number, hd: number, ry = 0) => taken.push({ x, z, r: Math.hypot(hw, hd), hw, hd, ry })
  const circ = (x: number, z: number, r: number) => taken.push({ x, z, r })
  // What stands already: the keep and its turrets, the forebuilding and grand stair, the palace,
  // the great hall, the chapel and its tower, the beacons.
  // (The Great Keep with its pavilions, the grand entrance, the stair, the covered galleries.)
  rect(0, 0, 37, 37)
  rect(0, 40, 23, 12)
  rect(0, 88, 17, 40)
  rect(42.5, -6, 8, 6)
  rect(-2, -53.5, 6, 19)
  rect(-49.5, 12, 15, 6)
  rect(78, -10, 31, 23)
  rect(0, -86, 47, 17)
  rect(-84, 18, 22, 11)
  rect(-108, 18, 9, 9)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    circ(Math.cos(a) * wallR * 0.66, Math.sin(a) * wallR * 0.66, 9)
  }
  const ST_L = PAL.stoneL
  const ST = PAL.stone
  const ST_D = PAL.stoneD
  const W = k.walls
  // Paving, gardens, props and fine work cast no shadow.
  const FL = k.flat ?? k.walls

  // --- The avenues and the ring road -------------------------------------------------------
  // (As wide as the gate passages, at least.)
  const AW = Math.max(22, gateHalf * 2)
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2
    const f = new Frame(0, 0, -a, 0)
    // Each avenue runs in from its gate to the front of the building on that side (Frame(0, 0,
    // -a) turns local +x to (cos a, sin a)): the palace east, the foot of the grand stair south,
    // the chapel west, the great hall north. None runs through a building.
    const front = [108, 126, 117, 102][q]
    const runs: [number, number][] = [[front, wallR - 4]]
    for (const [r0, r1] of runs) {
      const len = r1 - r0
      if (len <= 0) continue
      f.put(FL, box(len, 0.5, AW), 0x9a9284, (r0 + r1) / 2, 0.2, 0, { ao: 0 })
      // A chequer of paler and darker stone.
      for (let u = r0 + 2; u < r1 - 1; u += 4) for (let v = -AW / 2 + 2; v < AW / 2 - 1; v += 4) if ((Math.round(u / 4) + Math.round(v / 4)) % 2 === 0) f.put(FL, box(3.9, 0.12, 3.9), 0xb4ab98, u, 0.5, v, { ao: 0 })
      for (const s of [-1, 1]) {
        f.put(FL, box(len, 0.6, 1.1), ST_D, (r0 + r1) / 2, 0.5, s * (AW / 2 + 0.4), { ao: 0 })
        // Braziers on iron posts down both kerbs.
        for (let u = r0 + 8; u < r1 - 4; u += 18) {
          f.put(FL, cyl(0.2, 0.28, 5, 6), PAL.iron, u, 2.5, s * (AW / 2 + 2), { ao: 0 })
          f.put(FL, cyl(0.9, 0.55, 0.7, 8), PAL.iron, u, 5.2, s * (AW / 2 + 2), { ao: 0 })
          f.put(k.glow, cone(0.6, 1.2, 6), 0xff8a3a, u, 6, s * (AW / 2 + 2))
        }
      }
      for (let u = r0; u < r1; u += 6) circ(...f.at(u, 0), AW / 2 + 3)
    }
  }
  // The ring road just inside the curtain.
  const RR = wallR - 26
  for (let i = 0; i < 64; i++) {
    const a0 = (i / 64) * Math.PI * 2
    const a1 = ((i + 1) / 64) * Math.PI * 2
    const mx = (Math.cos(a0) + Math.cos(a1)) * 0.5 * RR
    const mz = (Math.sin(a0) + Math.sin(a1)) * 0.5 * RR
    if (Math.abs(mx) < AW / 2 || Math.abs(mz) < AW / 2) continue
    const len = 2 * RR * Math.sin(Math.PI / 64) + 0.6
    const ry = -((a0 + a1) / 2) + Math.PI / 2
    FL.push(bpart(box(len, 0.45, 10), 0x8f8778, { x: mx, y: 0.2, z: mz, ry, ao: 0 }))
    for (const s of [-1, 1]) FL.push(bpart(box(len, 0.5, 0.8), ST_D, { x: mx + Math.cos((a0 + a1) / 2) * s * 5.4, y: 0.45, z: mz + Math.sin((a0 + a1) / 2) * s * 5.4, ry, ao: 0 }))
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    circ(Math.cos(a) * RR, Math.sin(a) * RR, 8)
  }
  // The curtain itself and its towers.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    circ(Math.cos(a) * wallR, Math.sin(a) * wallR, 16)
  }

  // --- Placing the great buildings ----------------------------------------------------------
  const freeRect = (x: number, z: number, hw: number, hd: number, ry: number) => {
    const me: Taken = { x, z, r: Math.hypot(hw, hd), hw, hd, ry }
    return taken.every((t) => (Math.hypot(t.x - x, t.z - z) > t.r + me.r ? true : t.hw !== undefined ? !rectsOverlap(me, t) : !circleHitsRect(t.x, t.z, t.r, me)))
  }
  /** Somewhere for a building w by d, near bearing `pref` if it can, its front to the keep. */
  const site = (w: number, d: number, pref: number | null, make: (f: Frame) => void) => {
    for (let t = 0; t < 220; t++) {
      const a = pref !== null && t < 140 ? pref + (rnd() - 0.5) * 0.9 : rnd() * Math.PI * 2
      const r = 50 + rnd() * (RR - 12 - 50 - Math.max(w, d) / 2)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const ry = facing(-x, -z)
      if (!freeRect(x, z, w / 2 + 1.5, d / 2 + 1.5, ry)) continue
      rect(x, z, w / 2 + 1.5, d / 2 + 1.5, ry)
      make(new Frame(x, z, ry, 0))
      return true
    }
    return false
  }

  // The cloister and its fountain garden.
  site(46, 46, Math.PI / 4, (f) => {
    const S = 21
    f.put(FL, box(46, 0.4, 46), 0xb8ae98, 0, 0.25, 0, { ao: 0 })
    for (let side = 0; side < 4; side++) {
      const sf = f.sub(0, 0, (side * Math.PI) / 2)
      sf.put(W, box(46, 7, 1.2), ST_L, 0, 3.5, -22.4)
      for (let u = -S + 2; u <= S - 2; u += 4) {
        sf.put(W, cyl(0.42, 0.5, 5, 8), ST_L, u, 2.5, -S + 3.2)
        if (u < S - 4) sf.put(W, new THREE.TorusGeometry(2, 0.35, 3, 10, Math.PI), ST_L, u + 2, 5, -S + 3.2, { ao: 0 })
      }
      sf.put(k.roofs, box(44, 0.4, 5.6), PAL.slate[1], 0, 7.2, -S + 0.6, { rx: 0.32 })
      sf.put(W, box(44, 0.6, 0.6), ST_D, 0, 5.9, -S + 3.2, { ao: 0 })
    }
    // The garden: lawns, clipped box hedges in a knot, flower beds, gravel walks.
    f.put(FL, box(34, 0.3, 34), 0x6f9a44, 0, 0.5, 0, { ao: 0 })
    for (const s of [-1, 1]) {
      f.put(FL, box(34, 0.32, 2.4), 0xc8bca0, 0, 0.52, 0, { ry: s > 0 ? 0 : Math.PI / 2, ao: 0 })
    }
    for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = qx * 8.5
      const cz = qz * 8.5
      for (const [w, d, ox, oz] of [[12, 1, 0, -5.5], [12, 1, 0, 5.5], [1, 12, -5.5, 0], [1, 12, 5.5, 0], [6, 1, 0, 0], [1, 6, 0, 0]] as const) f.put(FL, box(w, 1.1, d), 0x3f6a2c, cx + ox, 1.1, cz + oz, { ao: 0.2, jitter: 0.08 })
      for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) f.put(FL, box(3.4, 0.6, 3.4), [0xb8302a, 0xd8b040, 0x8a5ab8, 0xe8e0f0][(Math.abs(qx + ox) + Math.abs(qz + oz)) % 4], cx + ox, 0.9, cz + oz, { ao: 0.1, jitter: 0.12 })
    }
    // The great fountain.
    f.put(FL, cyl(5.5, 6, 1.4, 16), ST_L, 0, 1.2, 0)
    f.put(FL, cyl(4.8, 4.8, 1.42, 16), 0x4f7f96, 0, 1.25, 0, { ao: 0 })
    f.put(FL, cyl(0.8, 1.1, 4.5, 10), ST, 0, 3.6, 0)
    f.put(FL, cyl(2.4, 1.2, 0.6, 12), ST_L, 0, 5.8, 0)
    f.put(FL, cyl(0.4, 0.6, 2, 8), ST, 0, 7, 0)
    f.put(FL, sphere(0.7, 1), 0xd9b04a, 0, 8.3, 0, { ao: 0 })
    // Statues at the corners of the walks, an obelisk at the end.
    for (const [x, z] of [[-14, 0], [14, 0], [0, -14]]) {
      f.put(FL, box(2.4, 2.6, 2.4), ST_L, x, 1.6, z)
      f.put(FL, box(1, 3, 0.8), 0xd8d2c4, x, 4.4, z)
      f.put(FL, sphere(0.5, 0), 0xd8d2c4, x, 6.3, z)
    }
    f.put(FL, box(3, 1.4, 3), ST_D, 0, 1, 14)
    f.put(FL, cyl(0.6, 1.2, 12, 4), ST_L, 0, 7.6, 14, { ry: Math.PI / 4 })
    f.put(FL, cone(0.85, 1.6, 4), 0xd9b04a, 0, 14.4, 14, { ry: Math.PI / 4, ao: 0 })
  })

  // The Royal Guard's barracks and drill yard, the armoury, the royal stables.
  site(56, 44, (3 * Math.PI) / 4, (f) => {
    f.put(FL, box(54, 0.4, 42), 0xc8b48a, 0, 0.25, 0, { ao: 0, jitter: 0.06 })
    for (const s of [-1, 1]) house(k, f.sub(0, s * 16, s < 0 ? 0 : Math.PI), { w: 40, d: 10, storeys: 2, roof: 'slate', style: 'stone', detail: 'mid', banner: true }, rnd)
    for (let i = 0; i < 3; i++) {
      const b = f.sub(-18 + i * 6, 0, Math.PI / 2)
      b.put(FL, box(0.25, 2.6, 0.25), PAL.timber, -0.9, 1.3, -0.5, { rx: 0.3 })
      b.put(FL, box(0.25, 2.6, 0.25), PAL.timber, 0.9, 1.3, -0.5, { rx: 0.3 })
      b.put(FL, cyl(1.2, 1.2, 0.5, 8), 0xd8c070, 0, 2.2, 0, { rx: Math.PI / 2 - 0.25 })
      b.put(FL, cyl(0.6, 0.6, 0.52, 8), 0xb8302a, 0, 2.2, 0.02, { rx: Math.PI / 2 - 0.25, ao: 0 })
    }
    const q = f.sub(8, 0, 0)
    q.put(FL, cyl(0.25, 0.3, 4.2, 6), PAL.timber, 0, 2.1, 0)
    q.put(FL, box(4.4, 0.25, 0.25), PAL.timberL, 0.6, 4, 0)
    q.put(k.accents, box(0.8, 1.2, 0.2), 0xffffff, -1.4, 3.6, 0.1)
    for (const u of [16, 22]) {
      const wr = f.sub(u, 0, Math.PI / 2)
      wr.put(FL, box(6, 0.25, 0.25), PAL.timber, 0, 2.2, 0)
      for (const s of [-1, 1]) wr.put(FL, box(0.25, 2.4, 0.25), PAL.timber, s * 2.8, 1.2, 0)
      for (let i = 0; i < 9; i++) {
        wr.put(FL, box(0.12, 4.2, 0.12), 0x6a5034, -2.4 + i * 0.6, 2.1, 0.35, { rx: -0.12 })
        wr.put(FL, cone(0.16, 0.6, 4), 0xb8bec4, -2.4 + i * 0.6, 4.4, 0.6, { ao: 0 })
      }
    }
    bannerPole(k, f, -24, 0, 12)
  })
  site(30, 34, (3 * Math.PI) / 4 + 0.7, (f) => {
    house(k, f.sub(0, -8, 0), { w: 28, d: 9, storeys: 1, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
    for (let i = 0; i < 6; i++) horse(k, f.sub(-11 + i * 4.4, -1.5, Math.PI), [0x5a3a22, 0x2a2420, 0x8a6a48, 0xd8d0c0, 0x3a2a1e, 0x6a4a2a][i])
    f.put(FL, box(26, 0.3, 14), 0x7a9a48, 0, 0.3, 8, { ao: 0 })
    for (const [lx, lz, len, rot] of [[0, 15, 26, 0], [-13, 8, 14, Math.PI / 2], [13, 8, 14, Math.PI / 2]] as const) fence(k, f.sub(lx, lz, rot), len)
    for (let i = 0; i < 3; i++) horse(k, f.sub(-6 + i * 6, 8 + (i % 2) * 3, i * 1.3), [0x8a6a48, 0xe0d8c8, 0x5a3a22][i])
    f.put(FL, box(5, 1, 1.4), PAL.timberL, 9, 0.5, 4)
    f.put(FL, box(4.6, 0.1, 1.0), 0x4a7a8a, 9, 1.0, 4, { ao: 0 })
  })
  // The armoury: a squat stone store, iron-bound, by the barracks.
  site(16, 12, (3 * Math.PI) / 4 - 0.7, (f) => {
    f.put(W, box(16, 9, 12), ST_D, 0, 4.5, 0)
    for (const s of [-1, 1]) for (const u of [-5, 0, 5]) f.put(W, box(1.6, 7, 1.6), ST, u, 3.5, s * 6.4)
    f.put(W, box(3.4, 4.6, 0.4), 0x2a2420, 0, 2.3, 6.2)
    for (const y of [1, 2.5, 4]) f.put(W, box(3.6, 0.25, 0.5), PAL.iron, 0, y, 6.3, { ao: 0 })
    for (let u = -7; u <= 7; u += 2.4) f.put(W, box(1.4, 1.6, 1.2), ST_D, u, 9.8, 5.5, { ao: 0 })
    f.put(k.roofs, hip(13, 17, 3), PAL.slate[2], 0, 9, 0)
  })

  // The mansions of the great lords and the chancellor.
  const mansion = (f: Frame) => {
    const w = 18
    const d = 13
    f.put(W, box(w + 1.2, 1.4, d + 1.2), ST_D, 0, 0.5, 0)
    const floors = [0xcfc6b2, 0xd8d0be, 0xe0d8c6]
    let y = 1.2
    for (let i = 0; i < 3; i++) {
      const h = i === 0 ? 5.6 : 4.8
      W.push(mottle(bpart(new THREE.BoxGeometry(w, h, d, 3, 2, 2), floors[i], { x: f.x, y: y + h / 2, z: f.z, ry: f.ry, order: 'YXZ' }), 0.04))
      for (let u = -w / 2 + 2; u <= w / 2 - 1.5; u += 3) {
        if (i === 0 && Math.abs(u) < 2) continue
        f.put(FL, box(1.4, 2.4, 0.2), PAL.dark, u, y + h * 0.55, d / 2 + 0.05, { ao: 0 })
        f.put(FL, box(1.8, 0.25, 0.4), ST_L, u, y + h * 0.55 - 1.35, d / 2 + 0.15, { ao: 0 })
      }
      f.put(W, box(w + 0.5, 0.45, d + 0.5), ST_D, 0, y + h, 0, { ao: 0 })
      y += h
    }
    // The door under a carved shield, steps up to it, the owner's banner.
    f.put(FL, box(2.6, 3.6, 0.4), PAL.door, 0, 3, d / 2 + 0.1)
    f.put(FL, box(3.6, 0.5, 0.6), ST_L, 0, 5, d / 2 + 0.2)
    f.put(k.accents, box(1.8, 2.2, 0.25), 0xffffff, 0, 6.6, d / 2 + 0.3)
    for (let i = 0; i < 3; i++) f.put(FL, box(4.4, 0.4, 1.2), ST_D, 0, 0.2 + i * 0.4, d / 2 + 1.6 - i * 0.6, { ao: 0.05 })
    f.put(k.roofs, hip(d + 1.8, w + 1.8, 6), PAL.slate[0], 0, y, 0)
    for (const s of [-1, 1]) {
      f.put(W, box(1.6, 7, 1.6), ST, s * (w / 2 - 2), y + 3, -2)
      f.put(W, box(2, 0.4, 2), ST_L, s * (w / 2 - 2), y + 6.6, -2, { ao: 0 })
      const [cx, cz] = f.at(s * (w / 2 - 2), -2)
      smoke.push([cx, y + 7.4, cz])
    }
    f.put(k.accents, box(0.3, 7, 2.6), 0xffffff, w / 2 + 0.2, y - 4, d / 2 - 1.5)
    // A walled garden before it.
    for (const [lx, lz, len, rot] of [[0, d / 2 + 9, w + 4, 0], [-(w / 2 + 2), d / 2 + 4.5, 9, Math.PI / 2], [w / 2 + 2, d / 2 + 4.5, 9, Math.PI / 2]] as const) {
      if (rot === 0) for (const s of [-1, 1]) f.sub(lx + s * (len / 4 + 1.2), lz, rot).put(FL, box(len / 2 - 2.4, 1.6, 0.8), ST_L, 0, 0.8, 0)
      else f.sub(lx, lz, rot).put(FL, box(len, 1.6, 0.8), ST_L, 0, 0.8, 0)
    }
    f.put(FL, box(w + 2, 0.3, 8), 0x6f9a44, 0, 0.3, d / 2 + 4.6, { ao: 0 })
    for (const s of [-1, 1]) tree(k, f, s * (w / 2 - 1), d / 2 + 5, rnd, 1)
  }
  for (const pref of [Math.PI * 1.25, Math.PI * 1.75, -Math.PI / 4 + 0.5, Math.PI * 0.6, Math.PI * 1.1]) site(22, 31, pref, mansion)

  // The treasury: squat, buttressed, iron-bound, a turret at each corner, guards at the door.
  site(22, 18, -Math.PI / 4, (f) => {
    k.walls.push(mottle(bpart(new THREE.BoxGeometry(18, 11, 14, 3, 2, 2), 0x8a8478, { x: f.x, y: 5.5, z: f.z, ry: f.ry, order: 'YXZ' }), 0.05))
    for (const s of [-1, 1]) for (const u of [-6, 0, 6]) f.put(W, box(1.8, 9, 2), ST_D, u, 4.5, s * 7.6)
    for (const [x, z] of [[-9, -7], [9, -7], [-9, 7], [9, 7]]) {
      f.put(W, cyl(2.2, 2.4, 15, 10), ST, x, 7.5, z)
      const [wx, wz] = f.at(x, z)
      coursedCone(k.roofs, wx, 15, wz, 2.8, 5, PAL.slate[0], 10)
    }
    for (let u = -8; u <= 8; u += 2.4) for (const s of [-1, 1]) f.put(W, box(1.3, 1.6, 1), 0x8a8478, u, 11.8, s * 6.6, { ao: 0 })
    f.put(W, box(3, 4.4, 0.4), 0x2a2420, 0, 2.2, 7.1)
    for (const y of [0.8, 2.2, 3.6]) f.put(W, box(3.2, 0.25, 0.5), PAL.iron, 0, y, 7.2, { ao: 0 })
    for (const s of [-1, 1]) brazier(k, f, s * 3.2, 0, 8.6)
  })
  // The library tower: a tall square tower of books over a reading hall.
  site(16, 24, Math.PI * 0.35, (f) => {
    house(k, f.sub(0, 4, 0), { w: 14, d: 9, storeys: 2, roof: 'slate', style: 'stone', detail: 'mid' }, rnd)
    k.walls.push(mottle(bpart(new THREE.BoxGeometry(10, 36, 10, 2, 8, 2), ST_L, { ...frameAt(f, 0, -8), y: 18, ry: f.ry, order: 'YXZ' }), 0.05))
    for (const y of [10, 17, 24, 31]) for (let s = 0; s < 4; s++) f.sub(0, -8, (s * Math.PI) / 2).put(W, box(1.6, 3, 0.2), PAL.dark, 0, y, 5.05, { ao: 0 })
    for (let u = -4.5; u <= 4.5; u += 2.25) for (const s of [-1, 1]) {
      f.put(W, box(1.2, 1.4, 1), ST_L, u, 37, -8 + s * 4.8, { ao: 0 })
      f.put(W, box(1, 1.4, 1.2), ST_L, s * 4.8, 37, -8 + u, { ao: 0 })
    }
    const [tx, tz] = f.at(0, -8)
    coursedCone(k.roofs, tx, 36, tz, 7.4, 16, PAL.slate[0], 4, f.ry + Math.PI / 4)
  })
  // The observatory: a round drum under a copper dome with its slit, a balcony round it.
  site(18, 18, Math.PI * 1.45, (f) => {
    k.walls.push(mottle(bpart(new THREE.CylinderGeometry(7, 7.6, 14, 16, 3), ST_L, { x: f.x, y: 7, z: f.z }), 0.05))
    f.put(W, cyl(8.4, 8.4, 0.5, 16), PAL.timberL, 0, 9, 0)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      f.put(W, box(0.18, 1.2, 0.18), PAL.timber, Math.cos(a) * 8.2, 9.8, Math.sin(a) * 8.2, { ao: 0 })
    }
    k.walls.push(mottle(bpart(new THREE.SphereGeometry(7.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x5f9a8a, { x: f.x, y: 14, z: f.z, ao: 0.3 }), 0.05))
    f.put(W, box(1.4, 7, 0.4), PAL.dark, 0, 17.4, 5.6, { rx: -0.6, ao: 0 })
    f.put(W, box(2.6, 4, 0.3), PAL.door, 0, 2, 7.4)
  })

  // Gardens, statues and trees in the ground that is left.
  for (let i = 0, tries = 0; i < 26 && tries < 600; tries++) {
    const a = rnd() * Math.PI * 2
    const r = 44 + rnd() * (RR - 56)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (!freeRect(x, z, 6, 6, 0)) continue
    i++
    rect(x, z, 6, 6)
    const f = new Frame(x, z, facing(-x, -z), 0)
    if (i % 3 === 0) {
      // A parterre of clipped hedges round a statue.
      f.put(FL, box(11, 0.3, 11), 0x6f9a44, 0, 0.3, 0, { ao: 0 })
      for (const [w, d, ox, oz] of [[10, 0.9, 0, -4.6], [10, 0.9, 0, 4.6], [0.9, 10, -4.6, 0], [0.9, 10, 4.6, 0]] as const) f.put(FL, box(w, 1, d), 0x3f6a2c, ox, 0.9, oz, { ao: 0.2 })
      f.put(FL, box(1.8, 2, 1.8), ST_L, 0, 1.3, 0)
      f.put(FL, box(0.9, 2.6, 0.7), 0xd8d2c4, 0, 3.6, 0)
      f.put(FL, sphere(0.45, 0), 0xd8d2c4, 0, 5.2, 0)
    } else if (i % 3 === 1) {
      for (let t = 0; t < 3; t++) tree(k, f, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8, rnd, 1.3)
    } else {
      crate(k, f, -1.5, 0, 0, 1.4)
      barrel(k, f, 1.6, 0.5, 0.9)
      barrel(k, f, 2.4, -1.2, 0.9)
    }
  }
}

/** A frame's local point as bpart options. */
function frameAt(f: Frame, lx: number, lz: number) {
  const [x, z] = f.at(lx, lz)
  return { x, z }
}
