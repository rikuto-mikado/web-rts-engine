import * as THREE from 'three'
import { Frame } from './buildings'
import { bpart, box, cone, cyl, sphere } from './geo'
import { IRON, STYLES, WOOD, WOOD_D, lordCone, lordDome, mottle, type FortStyle } from './fortress'
import { gable, hip } from './buildings'

/**
 * The hearts of castles and strongholds, and the masonry they share.
 *
 *   citadelHeart  a lord's castle: a raised citadel terrace (a battered octagonal platform reached by
 *                 four great stairs through inner gates) with the fortress's heart on it: a square
 *                 donjon joined by bridges and flying buttresses to a war hall behind it and vaulted
 *                 arsenals on either hand, four corner keep-turrets about them;
 *   greatKeep     a stronghold: a great keep standing alone in the bailey: a square tower with
 *                 buttresses, corner turrets and a forebuilding (the Sun Emperor's an octagon under a
 *                 dome, with four minarets).
 *
 * Both in the realm's way: pale limestone under pyramid roofs in the lord's hue for the King; black
 * basalt with sawtooth battlements, iron thorns, crimson spires and red fires for the Usurper;
 * sandstone, ribbed domes and gilt for the Sun Emperor; grey stone, timber hoardings and shingle for
 * free lords.
 */

/** What a builder lays its parts into, and how. */
export interface Mason {
  style: FortStyle
  tier: number
  ruined: boolean
  rnd: () => number
  stone: THREE.BufferGeometry[]
  /** Painted in the lord's colour. */
  roof: THREE.BufferGeometry[]
  gold: THREE.BufferGeometry[]
  flat: THREE.BufferGeometry[]
  glow: THREE.BufferGeometry[]
  /** Flames standing alone, burning by night (x, y, z, size). */
  flames?: [number, number, number, number][]
}

/** The shared parts: battlements, caps, fires and banners in the realm's way. */
export function masonry(m: Mason) {
  const { style, ruined, rnd, stone, roof, gold, flat, glow, flames } = m
  const S0 = STYLES[style]
  const live = !ruined
  const thorn = style === 'thorn'
  const S = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => void stone.push(bpart(geo, col, o))
  const F = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => void flat.push(bpart(geo, col, o))
  const crumble = (h: number) => (ruined ? h * (0.35 + rnd() * 0.45) : h)
  const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
  /** Fire: the Usurper's burns red. */
  const FIRE = thorn ? 0xff3a1a : 0xff8a3a
  /** A frame on a stretch of wall from a to b (round the heart): local x along it, local z outwards. */
  const along = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    let nx = -(bz - az) / len
    let nz = (bx - ax) / len
    if (nx * mx + nz * mz < 0) {
      nx = -nx
      nz = -nz
    }
    return { f: new Frame(mx, mz, Math.atan2(nx, nz)), len, mx, mz }
  }
  /** One merlon (local to a frame): a block, or for the Usurper a sawtooth with now and then an iron thorn. */
  const merlon = (f: Frame, u: number, y: number, z: number, i: number) => {
    if (thorn) {
      f.put(stone, cone(1.15, 2.6, 4), S0.stone, u, y + 1.1, z, { ry: Math.PI / 4 })
      if (i % 2 === 0) f.put(flat, cone(0.14, 1.8, 4), IRON, u, y + 3.2, z, { ao: 0 })
    } else f.put(stone, box(1.7, 1.9, 1.3), S0.stone, u, y + 0.95, z)
  }
  /** A run of battlements along a frame's x from -len/2 to len/2. */
  const battlements = (f: Frame, len: number, y: number, z: number) => {
    let i = 0
    for (let u = -len / 2 + 1.2; u < len / 2 - 0.8; u += 3.2) merlon(f, u, y, z, i++)
  }
  /** A cap on a turret or cupola of half-width r from y: pyramid, spire, dome or shingle. Returns its top. */
  const crown = (x: number, y: number, z: number, r: number, tall = 1, ry = Math.PI / 4) => {
    if (style === 'sun') {
      S(cyl(r * 0.85, r * 0.85, 1.2, 12), S0.stoneL, { x, y: y + 0.6, z })
      lordDome(roof, gold, x, y + 1.2, z, r * 0.85, 1.15 * tall)
      const top = y + 1.2 + r * 0.85 * 1.15 * tall
      gold.push(bpart(cone(0.3, 1.8 * tall, 6), 0xffffff, { x, y: top + 0.9 * tall, z, ao: 0 }))
      gold.push(bpart(sphere(0.35, 1), 0xffffff, { x, y: top + 0.2, z, ao: 0 }))
      return top + 1.8 * tall
    }
    if (style === 'free') {
      S(box(r * 2 + 1.6, 1.8, r * 2 + 1.6), WOOD, { x, y: y + 0.9, z, ry: ry - Math.PI / 4 })
      stone.push(mottle(bpart(new THREE.ConeGeometry((r + 1.2) * Math.SQRT2, r * 1.3 * tall, 4, 2), 0x6f5a42, { x, y: y + 1.8 + (r * 1.3 * tall) / 2, z, ry, ao: 0.3 }), 0.08))
      return y + 1.8 + r * 1.3 * tall
    }
    if (thorn) {
      // A sharp four-sided spire in her crimson, an iron thorn at its tip.
      const h = r * 3.2 * tall
      lordCone(roof, stone, x, y, z, r * Math.SQRT2, h, 4, ry)
      F(cone(0.22, 2.2 * tall, 4), IRON, { x, y: y + h + 1.1 * tall, z, ao: 0 })
      return y + h + 2.2 * tall
    }
    const h = r * 1.25 * tall
    lordCone(roof, stone, x, y, z, r * Math.SQRT2, h, 4, ry)
    F(cyl(0.08, 0.08, 2, 4), IRON, { x, y: y + h + 1, z, ao: 0 })
    return y + h + 2
  }
  /** A great brazier on a deck or a terrace. */
  const fire = (x: number, y: number, z: number, s = 1) => {
    for (let i = 0; i < 3; i++) F(box(0.16 * s, 1.6 * s, 0.16 * s), IRON, { x: x + Math.cos(i * 2.1) * 0.6 * s, y: y + 0.8 * s, z: z + Math.sin(i * 2.1) * 0.6 * s, ao: 0 })
    F(cyl(1.1 * s, 0.6 * s, 0.8 * s, 8), IRON, { x, y: y + 1.9 * s, z, ao: 0 })
    glow.push(bpart(cone(0.8 * s, 1.6 * s, 7), FIRE, { x, y: y + 2.9 * s, z }))
    flames?.push([x, y + 3.1 * s, z, 7 * s])
  }
  /** A lord's banner hung down a wall (local to a frame). */
  const banner = (f: Frame, u: number, y: number, z: number, h = 5) => {
    f.put(flat, box(2.2, 0.2, 0.2), WOOD_D, u, y, z + 0.1, { ao: 0 })
    f.put(roof, box(1.8, h, 0.12), 0xffffff, u, y - h / 2, z + 0.12, { ao: 0.1 })
  }
  return { S0, S, F, live, thorn, crumble, angDiff, along, FIRE, merlon, battlements, crown, fire, banner }
}

/** A lord's castle's heart: the citadel terrace and the fortress on it. Returns the top of the donjon and the terrace's reach. */
export function citadelHeart(m: Mason, main: number, gates: number[], minWall: number): { keepTop: number; radius: number } {
  const { style, tier, ruined, rnd, stone, roof, gold, flat } = m
  const { S0, S, F, live, thorn, crumble, angDiff, along, battlements, crown, fire, banner } = masonry(m)
  // ---------------------------------------------------------------------------------------------
  // The citadel terrace: a battered octagonal platform of stone, a stair and an inner gate up to it
  // from each street, its parapet round the edge.
  // ---------------------------------------------------------------------------------------------
  const TR = Math.min(38 + tier * 4, minWall * 0.58)
  const TRi = TR * Math.cos(Math.PI / 8)
  const TH = 7 + (tier - 2) * 1.5
  const octRy = Math.PI / 2 - main - Math.PI / 8
  const vert = (i: number, r = TR): [number, number] => {
    const a = main + Math.PI / 8 - (i * Math.PI) / 4
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  stone.push(mottle(bpart(new THREE.CylinderGeometry(TR, TR + 3.2, TH + 3, 8, 2), S0.stoneD, { y: TH / 2 - 1.5, ry: octRy }), 0.05))
  F(cyl(TR - 0.4, TR - 0.4, 0.3, 8), ruined ? 0x6a6050 : 0xa89a7c, { y: TH + 0.1, ry: octRy, ao: 0 })
  const stairHere = (a: number) => gates.some((g) => Math.abs(angDiff(a, g)) < 0.15)
  for (let i = 0; i < 8; i++) {
    const { f, len } = along(...vert(i, TR - 0.6), ...vert(i + 1, TR - 0.6))
    const faceA = main - (i * Math.PI) / 4
    // A string course round the platform, and its parapet (broken where a stair comes up).
    f.put(flat, box(len + 1, 0.6, 1), S0.stone, 0, TH - 1.2, 0.9, { ao: 0 })
    if (ruined) continue
    const gap = stairHere(faceA) ? 15 : 0
    for (const s of gap ? [-1, 1] : [0]) {
      const l = gap ? (len - gap) / 2 : len
      const u = gap ? s * (gap / 2 + l / 2) : 0
      const p = f.sub(u, 0)
      p.put(stone, box(l, 1.6, 1.2), S0.stone, 0, TH + 0.8, 0)
      battlements(p, l, TH + 1.6, 0)
    }
  }
  // The stairs and inner gates.
  const steps = Math.ceil(TH / 0.55)
  const stairLen = steps * 1.4
  for (const g of gates) {
    const f = new Frame(Math.cos(g) * TRi, Math.sin(g) * TRi, Math.atan2(Math.cos(g), Math.sin(g)))
    for (let s = 0; s < steps; s++) {
      const y = TH * (1 - s / steps)
      f.put(stone, box(12, y + 1, 1.45), S0.stoneD, 0, y / 2 - 0.5, 0.7 + s * 1.4, { ao: 0.1 })
    }
    for (const s of [-1, 1]) {
      f.put(stone, box(1.4, 1.4, Math.hypot(stairLen, TH)), S0.stone, s * 6.6, TH / 2 + 0.7, stairLen / 2, { rx: Math.atan2(TH, stairLen) })
      // The inner gate's turrets at the stairhead.
      const th = crumble(TH + 9)
      f.put(stone, box(5.4, th + 1, 5.4), S0.stone, s * 9.6, th / 2 - 0.5, -1.5)
      if (live) {
        battlements(f.sub(s * 9.6, -1.5 + 2.7), 5.4, th, 0)
        const [tx, tz] = f.at(s * 9.6, -1.5)
        crown(tx, th + 1.2, tz, 2.8, 0.8, f.ry + Math.PI / 4)
      }
    }
    if (live) {
      f.put(stone, box(14.2, 2.6, 4), S0.stone, 0, TH + 7.2, -1.5)
      f.put(flat, new THREE.TorusGeometry(5.6, 0.6, 3, 12, Math.PI), S0.stoneD, 0, TH + 1.2, 0.6, { sy: 1.05, ao: 0 })
      for (let u = -5; u <= 5; u += 1.4) f.put(flat, box(0.3, 1.6, 0.3), IRON, u, TH + 5.6, 0.4, { ao: 0 })
      battlements(f.sub(0, 0.4), 14, TH + 8.5, 0)
      banner(f, 0, TH + 7, 0.6, 3.4)
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The fortress's heart on the terrace: the donjon, the war hall behind it, the vaulted arsenals
  // on either hand, four corner keep-turrets, bridges and flying buttresses binding them together.
  // ---------------------------------------------------------------------------------------------
  const reach = (TRi - 4) / Math.SQRT2
  const k = Math.max(14, Math.min(16 + tier * 3, 2 * (reach - 13.5)))
  const kh = crumble(24 + tier * 5)
  const kf = new Frame(0, 0, Math.atan2(Math.cos(main), Math.sin(main)), TH)
  kf.put(stone, box(k + 4, 3, k + 4), S0.stoneD, 0, 0.5, 0, { ao: 0.1 })
  stone.push(mottle(bpart(new THREE.BoxGeometry(k, kh, k, 3, 5, 3), S0.keep, { y: TH + kh / 2, ry: kf.ry, order: 'YXZ' }), 0.045))
  for (let side = 0; side < 4; side++) {
    const f = kf.sub(0, 0, (side * Math.PI) / 2)
    for (const u of [-k / 2, k / 2]) f.put(stone, box(2.8, kh, 1.8), S0.keep, u + (u < 0 ? 0.6 : -0.6), kh / 2, k / 2 + 0.7)
    f.put(stone, box(2.2, kh - 3, 1), S0.keep, 0, (kh - 3) / 2, k / 2 + 0.45)
    for (const y of [kh * 0.3, kh * 0.62]) f.put(flat, box(k + 0.8, 0.5, 0.6), S0.stoneD, 0, y, k / 2 + 0.25, { ao: 0 })
    for (let i = 0; i < 3; i++) for (const u of [-k * 0.25, k * 0.25]) f.put(flat, box(0.6, 2.8, 0.3), S0.dark, u, kh * (0.4 + i * 0.18), k / 2 + 0.06, { ao: 0 })
    if (ruined) continue
    for (let u = -k / 2 + 0.8; u <= k / 2 - 0.6; u += 2.4) f.put(flat, box(0.9, 1.5, 1.6), S0.stoneD, u, kh - 0.5, k / 2 + 0.9, { ao: 0.25 })
    f.put(stone, box(k + 3, 2, 1.2), S0.keep, 0, kh + 1, k / 2 + 1.1)
    battlements(f.sub(0, k / 2 + 1.1), k + 2.6, kh + 2, 0)
    banner(f, -k * 0.25, kh * 0.86, k / 2 + 0.6, 7)
    banner(f, k * 0.25, kh * 0.86, k / 2 + 0.6, 7)
    if (style === 'free') {
      f.put(stone, box(k + 3, 2.6, 2.4), WOOD, 0, kh + 2.6, k / 2 + 2.4)
      for (let u = -k / 2; u <= k / 2; u += 3) f.put(flat, box(0.3, 2.4, 0.3), WOOD_D, u, kh + 0.4, k / 2 + 3.4, { ao: 0 })
    }
    if (thorn) for (const u of [-k / 2 - 1, k / 2 + 1]) f.put(flat, cone(0.25, 3.4, 4), IRON, u, kh + 1, k / 2 + 2, { rx: 1.2, ao: 0 })
  }
  let keepTop = TH + kh
  if (live) {
    // The donjon's crown.
    const rh = 12 + tier
    const y0 = TH + kh + 1.6
    if (style === 'sun') {
      S(cyl(k * 0.36, k * 0.36, 4, 16), S0.stoneL, { y: TH + kh + 3 })
      lordDome(roof, gold, 0, TH + kh + 5, 0, k * 0.4, 1.25)
      const top = TH + kh + 5 + k * 0.4 * 1.25
      gold.push(bpart(sphere(0.9, 1), 0xffffff, { y: top + 0.6, ao: 0 }))
      gold.push(bpart(cone(0.7, 5, 8), 0xffffff, { y: top + 3.5, ao: 0 }))
      keepTop = top + 6
    } else if (style === 'free') {
      stone.push(mottle(bpart(new THREE.ConeGeometry(k * 0.72, rh, 4, 4), 0x6f5a42, { y: TH + kh + 2.8 + rh / 2, ry: kf.ry + Math.PI / 4, ao: 0.3 }), 0.08))
      keepTop = TH + kh + 2.8 + rh
    } else if (thorn) {
      lordCone(roof, stone, 0, y0, 0, k * 0.5, rh * 2, 4, kf.ry + Math.PI / 4)
      F(cone(0.45, 5, 4), IRON, { y: y0 + rh * 2 + 2.5, ao: 0 })
      keepTop = y0 + rh * 2 + 5
    } else {
      lordCone(roof, stone, 0, y0, 0, k * 0.68, rh, 4, kf.ry + Math.PI / 4)
      keepTop = y0 + rh
    }
    // The forebuilding before the door, its stair up the side, braziers on the forecourt.
    const fb = kf.sub(0, k / 2 + 4.5)
    fb.put(stone, box(9, kh * 0.34, 7), S0.keep, 0, kh * 0.17, 0)
    fb.put(stone, box(9.6, 1.2, 7.6), S0.stoneD, 0, kh * 0.34 + 0.6, 0)
    battlements(fb.sub(0, 3.4), 9, kh * 0.34 + 1.2, 0)
    fb.put(flat, box(2.4, 3.6, 0.3), S0.dark, 0, kh * 0.34 - 2.6, 3.55, { ao: 0 })
    for (let i = 0; i < 8; i++) fb.put(stone, box(3.2, 0.6, 1.6), S0.stoneD, 6.4, 0.4 + (i * (kh * 0.31)) / 8, 3 - i * 0.9, { ao: 0.05 })
    for (const s of [-1, 1]) {
      const [bx, bz] = kf.at(s * 9, k / 2 + 13)
      fire(bx, TH, bz, 1)
    }
  } else for (let i = 0; i < 8; i++) S(new THREE.DodecahedronGeometry(2 + rnd() * 2.5, 0), S0.stoneD, { x: (rnd() - 0.5) * k * 1.6, y: TH + 1.2, z: (rnd() - 0.5) * k * 1.6, ry: rnd() * 3 })

  /** A roof in the realm's way over a wing of the heart (lord's hue, natural for free lords). */
  const wingRoof = (f: Frame, w: number, d: number, y: number) => {
    if (style === 'sun') {
      f.put(stone, box(w + 0.8, 0.8, d + 0.8), S0.stoneD, 0, y + 0.4, 0)
      for (const u of [-w / 3, 0, w / 3]) {
        const [x, z] = f.at(u, 0)
        lordDome(roof, gold, x, f.y + y + 0.8, z, d * 0.3, 1.1)
        gold.push(bpart(cone(0.3, 2, 6), 0xffffff, { x, y: f.y + y + 0.8 + d * 0.33 + 1, z, ao: 0 }))
      }
    } else if (style === 'free') f.put(stone, hip(d + 1.6, w + 1.6, d * 0.45), 0x6f5a42, 0, y, 0, { ao: 0.2 })
    else if (thorn) {
      f.put(roof, gable(d + 1.4, w + 1.2, d * 0.95), 0xffffff, 0, y, 0, { ao: 0.2 })
      for (let u = -w / 2 + 1; u <= w / 2 - 1; u += 3) f.put(flat, cone(0.18, 2, 4), IRON, u, y + d * 0.95 + 0.8, 0, { ao: 0 })
    } else f.put(roof, hip(d + 1.6, w + 1.6, d * 0.5), 0xffffff, 0, y, 0, { ao: 0.2 })
  }
  if (live) {
    // The great war hall behind the donjon: tall windows between buttresses.
    const hw = k + 4
    const hd = 10
    const hh = 15
    const hf = kf.sub(0, -(k / 2 + 4 + hd / 2), Math.PI)
    hf.put(stone, box(hw, hh, hd), S0.keep, 0, hh / 2, 0)
    for (const s of [-1, 1]) {
      for (let u = -hw / 2 + 2; u <= hw / 2 - 2; u += 4) {
        hf.put(stone, box(1.3, hh * 0.85, 1.8), S0.stone, u, (hh * 0.85) / 2, s * (hd / 2 + 0.8))
        if (u < hw / 2 - 3) hf.put(flat, box(1.2, 5, 0.2), S0.dark, u + 2, hh * 0.55, s * (hd / 2 + 0.05), { ao: 0 })
      }
    }
    battlements(hf.sub(0, hd / 2 + 0.4), hw, hh, 0)
    wingRoof(hf, hw, hd, hh)
    banner(hf, -hw / 4, hh - 1, hd / 2 + 0.3, 6)
    banner(hf, hw / 4, hh - 1, hd / 2 + 0.3, 6)
    // A bridge from the donjon's upper floor into the hall, on an arch.
    const bf = kf.sub(0, -(k / 2 + 2))
    bf.put(stone, box(6, 3, 4.2), S0.stone, 0, kh * 0.55, 0)
    // The vaulted arsenals on either hand: barrel vaults between heavy buttresses, joined to the
    // donjon by flying buttresses.
    for (const s of [-1, 1]) {
      const af = kf.sub(s * (k / 2 + 4 + 5), 0, s * Math.PI / 2)
      const al = k
      af.put(stone, box(al, 9, 10), S0.keep, 0, 4.5, 0)
      af.put(stone, new THREE.CylinderGeometry(5, 5, al, 10, 1, false, 0, Math.PI), S0.stoneD, 0, 9, 0, { rz: Math.PI / 2 })
      for (let u = -al / 2 + 1; u <= al / 2 - 1; u += 4) for (const v of [-1, 1]) af.put(stone, box(1.4, 8, 2), S0.stone, u, 4, v * 5.8, { rx: v * 0.12 })
      af.put(flat, box(3, 4, 0.2), S0.dark, 0, 2.2, 5.05, { ao: 0 })
      af.put(flat, new THREE.TorusGeometry(1.5, 0.35, 3, 8, Math.PI), S0.stone, 0, 4.2, 5.2, { ao: 0 })
      for (let u = -al / 2 + 3; u <= al / 2 - 3; u += 6) {
        const [x, z] = af.at(u, 0)
        // (The arsenal's x runs against the donjon's z on the right hand, with it on the left.)
        const [dx, dz] = kf.at(s * (k / 2 + 0.6), -s * u)
        const len = Math.hypot(x - dx, z - dz) + 4
        stone.push(bpart(box(1.2, 1.4, len), S0.stone, { x: (x + dx) / 2, y: TH + 13.5, z: (z + dz) / 2, ry: Math.atan2(dx - x, dz - z), rx: -0.5, order: 'YXZ', ao: 0.1 }))
      }
      if (style === 'sun') gold.push(bpart(cone(0.35, 2.4, 6), 0xffffff, { x: af.x, y: TH + 15.6, z: af.z, ao: 0 }))
      banner(af, -al / 4, 7.5, 5.4, 4)
      banner(af, al / 4, 7.5, 5.4, 4)
    }
    // The four corner keep-turrets, square, with a curtain of battlements between them.
    const cc = k / 2 + 10
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const tf = kf.sub(u * cc, v * cc)
      const th = kh * 0.72
      tf.put(stone, box(7, th, 7), S0.keep, 0, th / 2, 0)
      for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) tf.put(stone, box(1.6, th, 1.6), S0.stone, p * 3.3, th / 2, q * 3.3)
      for (const y of [th * 0.45, th * 0.75]) for (let side = 0; side < 4; side++) tf.sub(0, 0, (side * Math.PI) / 2).put(flat, box(0.5, 2.2, 0.2), S0.dark, 0, y, 3.55, { ao: 0 })
      for (let side = 0; side < 4; side++) {
        const sf = tf.sub(0, 0, (side * Math.PI) / 2)
        sf.put(flat, box(7.4, 1.2, 1.4), S0.stoneD, 0, th - 0.4, 3.9, { ao: 0.25 })
        battlements(sf.sub(0, 4), 7.6, th + 0.2, 0)
      }
      const [x, z] = tf.at(0, 0)
      crown(x, TH + th + 0.4, z, 3.2, 1, kf.ry + Math.PI / 4)
    }
  }

  return { keepTop, radius: TR + 3.2 }
}

/** A stronghold's great keep, standing alone. Returns its top and how far its turrets and forebuilding reach. */
export function greatKeep(m: Mason, main: number): { keepTop: number; radius: number } {
  const { style, tier, ruined, rnd, stone, roof, gold } = m
  const { S0, S, crumble } = masonry(m)
  const cone4 = (x: number, y0: number, z: number, r: number, h: number, seg = 12, ry = 0) => lordCone(roof, stone, x, y0, z, r, h, seg, ry)
  const dome4 = (x: number, y0: number, z: number, r: number, stretch: number) => lordDome(roof, gold, x, y0, z, r, stretch)
  let keepTop = 0
  if (style === 'sun') {
    const k = 13 + tier * 3
    const kh = crumble(22 + tier * 7)
    S(cyl(k + 3, k + 4, 5, 8), S0.stoneD, { y: 1.5, ry: Math.PI / 8, ao: 0.1 })
    stone.push(mottle(bpart(new THREE.CylinderGeometry(k, k, kh, 8, 5), S0.keep, { y: kh / 2, ry: Math.PI / 8 }), 0.04))
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      S(box(4, 6, 0.6), S0.dark, { x: Math.cos(a) * (k - 0.1), y: 4.2, z: Math.sin(a) * (k - 0.1), ry: -a + Math.PI / 2, ao: 0 })
      S(new THREE.TorusGeometry(2, 0.5, 4, 10, Math.PI), S0.stoneL, { x: Math.cos(a) * (k + 0.2), y: 7.2, z: Math.sin(a) * (k + 0.2), ry: -a + Math.PI / 2, ao: 0 })
      for (const y of [kh * 0.5, kh * 0.75]) S(box(1.4, 3.2, 0.3), S0.dark, { x: Math.cos(a) * (k + 0.05), y, z: Math.sin(a) * (k + 0.05), ry: -a + Math.PI / 2, ao: 0 })
    }
    if (!ruined) {
      S(cyl(k + 1.4, k + 1.4, 1.4, 8), S0.stoneD, { y: kh + 0.7, ry: Math.PI / 8 })
      S(cyl(k * 0.72, k * 0.72, 5, 16), S0.stoneL, { y: kh + 3.5 })
      dome4(0, kh + 6, 0, k * 0.74, 1.15)
      gold.push(bpart(cyl(k * 0.75, k * 0.75, 0.8, 16), 0xffffff, { y: kh + 6.2, ao: 0 }))
      gold.push(bpart(cone(0.9, 6, 8), 0xffffff, { y: kh + 6 + k * 0.85 + 3, ao: 0 }))
      gold.push(bpart(sphere(1.2, 1), 0xffffff, { y: kh + 6 + k * 0.85 + 0.6, ao: 0 }))
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const x = Math.cos(a) * (k + 2.5)
        const z = Math.sin(a) * (k + 2.5)
        S(cyl(1.8, 2.1, kh + 12, 10), S0.stoneL, { x, y: (kh + 12) / 2, z })
        S(cyl(2.6, 1.8, 1.4, 10), S0.stoneD, { x, y: kh + 12.2, z })
        dome4(x, kh + 12.9, z, 2.2, 1.5)
        gold.push(bpart(cone(0.3, 2.4, 5), 0xffffff, { x, y: kh + 17.3, z, ao: 0 }))
      }
    }
    keepTop = kh + 6 + k * 0.85 + 6
  } else {
    const k = 16 + tier * 4
    const kh = crumble(20 + tier * 7)
    const kf = new Frame(0, 0, Math.PI / 4 + main)
    kf.put(stone, box(k + 5, 5, k + 5), S0.stoneD, 0, 1.5, 0, { ao: 0.1 })
    stone.push(mottle(bpart(new THREE.BoxGeometry(k, kh, k, 3, 5, 3), S0.keep, { y: kh / 2, ry: Math.PI / 4 + main, order: 'YXZ' }), 0.045))
    for (let side = 0; side < 4; side++) {
      const f = kf.sub(0, 0, (side * Math.PI) / 2)
      for (const u of [-k * 0.25, k * 0.25]) f.put(stone, box(1.6, kh - 2, 1.2), S0.keep, u, kh / 2, k / 2 + 0.5)
      for (const y of [kh * 0.33, kh * 0.66]) f.put(stone, box(k + 0.4, 0.5, 0.5), S0.stoneD, 0, y, k / 2 + 0.2, { ao: 0 })
      for (let i = 0; i < 2; i++) for (const u of [-k * 0.38, 0, k * 0.38]) f.put(stone, box(1.4, 2.8, 0.3), S0.dark, u, kh * (0.5 + i * 0.22), k / 2 + 0.05, { ao: 0 })
      if (ruined) continue
      f.put(stone, box(k, 1.4, 1.6), S0.stoneD, 0, kh - 0.4, k / 2 + 0.6, { ao: 0.3 })
      f.put(stone, box(k + 2.4, 1.6, 1.2), S0.keep, 0, kh + 0.8, k / 2 + 0.7)
      for (let u = -k / 2 + 0.6; u <= k / 2; u += 2.4) {
        f.put(stone, box(1.3, 1.6, 1.0), S0.keep, u, kh + 2.4, k / 2 + 0.8)
      }
      if (style === 'free') {
        f.put(stone, box(k + 3, 2.8, 2.4), WOOD, 0, kh + 2.6, k / 2 + 2)
        for (let u = -k / 2; u <= k / 2; u += 3) f.put(stone, box(0.3, 2.4, 0.3), WOOD_D, u, kh + 0.4, k / 2 + 3, { ao: 0 })
      }
    }
    if (!ruined) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + main
        const x = Math.cos(a) * k * 0.72
        const z = Math.sin(a) * k * 0.72
        const n = 12
        S(cyl(3, 3.2, kh + 7, n), S0.keep, { x, y: (kh + 7) / 2, z, ry: main })
        S(cyl(3.6, 3, 1.2, n), S0.stoneD, { x, y: kh + 7.4, z, ry: main, ao: 0.1 })
        for (let j = 0; j < 6; j++) {
          const b = (j / 6) * Math.PI * 2
          S(box(1, 1.2, 0.8), S0.keep, { x: x + Math.cos(b) * 3.3, y: kh + 8.6, z: z + Math.sin(b) * 3.3, ry: -b + Math.PI / 2 })
        }
        if (style === 'free') stone.push(mottle(bpart(new THREE.ConeGeometry(4.2, 7, 8, 3), 0x6f5a42, { x, y: kh + 12.2, z, ao: 0.3 }), 0.08))
        else cone4(x, kh + 8.7, z, 3.6, 7, 12)
      }
      const fb = kf.sub(0, k / 2 + 3, 0)
      fb.put(stone, box(7, kh * 0.38, 6), S0.keep, 0, kh * 0.19, 0)
      fb.put(stone, box(2.4, 3.6, 0.3), S0.dark, 0, kh * 0.38 - 2.4, 3.05, { ao: 0 })
      for (let i = 0; i < 7; i++) fb.put(stone, box(3.4, 0.6, 1.6), S0.stoneD, 4.8, 0.4 + (i * (kh * 0.33)) / 7, 2.6 - i * 0.8, { ao: 0.05 })
      if (style === 'free') {
        stone.push(mottle(bpart(new THREE.ConeGeometry(k * 0.78, 13 + tier, 4, 4), 0x6f5a42, { y: kh + 3 + (13 + tier) / 2, ry: Math.PI / 4 + main, ao: 0.3 }), 0.08))
        keepTop = kh + 14 + tier
      } else {
        cone4(0, kh + 1.8, 0, k * 0.72, 13 + tier, 4, Math.PI / 4 + main)
        keepTop = kh + 14 + tier
      }
    } else {
      keepTop = kh
      for (let i = 0; i < 8; i++) S(new THREE.DodecahedronGeometry(2 + rnd() * 2.5, 0), S0.stoneD, { x: (rnd() - 0.5) * k * 1.6, y: 1.2, z: (rnd() - 0.5) * k * 1.6, ry: rnd() * 3 })
    }
  }
  return { keepTop, radius: style === 'sun' ? 13 + tier * 3 + 5.5 : (16 + tier * 4) * 0.72 + 4.5 }
}
