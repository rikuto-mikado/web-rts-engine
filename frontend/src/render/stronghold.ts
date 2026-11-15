import * as THREE from 'three'
import type { Castle } from '../game/types'
import { GATE_HALF, type CastleShape, type World, wallRAt } from '../game/world'
import { Frame, PAL, barrel, cart, crate, gable, horse, newKit, tent, woodpile } from './buildings'
import { bpart, box, cone, cyl, sphere } from './geo'
import { EARTH, IRON, LOG, STYLES, WOOD, WOOD_D, mottle, rectsOverlap, type FortStyle, type Fortress, type Taken } from './fortress'
import { greatKeep, masonry, type Mason } from './keeps'

/**
 * A stronghold: a fortress built for war and nothing else, and shaped nothing like a lord's castle.
 *
 * Outside: a dry ditch, a palisade on its far bank, a belt of chevaux-de-frise. The curtain stands on
 * a battered talus with machicolations, and in place of a castle's slender round towers under tall
 * roofs it has squat octagonal bastions with flat fighting decks behind their battlements, each deck
 * mounting a ballista, a mangonel, a great brazier or a low watch-cupola. Twin bastions guard each
 * gate, the main one with a drawbridge on chains over the ditch (and from rank 3 a barbican).
 *
 * Inside, against the back of the curtain all round: casemates, an arcade of stone vaults on the
 * ground with barracks or a firing deck above. In the middle a raised citadel terrace, a battered
 * stone platform reached by four great stairs through inner gates, and on it the fortress's heart:
 * a square donjon joined by bridges and flying buttresses to a great war hall behind it and vaulted
 * arsenals on either hand, four corner keep-turrets about them. Between the terrace and the casemates,
 * the four wards packed with the works of a garrison: the great barracks and drill yard; the foundry
 * and siege works; the warhorse stables; the granaries, the vaulted cistern and the stores.
 *
 * Every realm builds it the same way; the stone and what crowns it are its own: pale limestone under
 * pyramid roofs in the King's colour; black basalt with sawtooth battlements, iron thorns, crimson
 * spires and red fires for the Usurper; sandstone with ribbed domes and gilt finials for the Sun
 * Emperor; weathered grey stone with timber hoardings and brown shingle for free lords.
 */
export function buildStronghold(c: Castle, world: World, shape: CastleShape, style: FortStyle, rnd: () => number): Fortress {
  const S0 = STYLES[style]
  const tier = Math.max(2, c.tier)
  const ruined = !!c.ruined
  const live = !ruined
  const kit = newKit()
  const stone = kit.walls
  const flat: THREE.BufferGeometry[] = []
  kit.flat = flat
  const lamps: THREE.BufferGeometry[] = []
  kit.lamps = lamps
  const flames: Fortress['flames'] = []
  const lights: Fortress['lights'] = []
  const roof: THREE.BufferGeometry[] = []
  const gold: THREE.BufferGeometry[] = []
  const ring: [number, number][] = []
  const smoke: [number, number, number][] = []
  const base = world.heightAt(c.x, c.z)
  const G = (lx: number, lz: number) => world.heightAt(c.x + lx, c.z + lz) - base
  const m: Mason = { style, tier, ruined, rnd, stone, roof, gold, flat, glow: kit.glow, flames }
  const { S, F, crumble, angDiff, along, FIRE, merlon, battlements, crown, fire, banner } = masonry(m)
  const rAt = (a: number) => wallRAt(shape, a)
  const pt = (a: number, extra = 0): [number, number] => [Math.cos(a) * (rAt(a) + extra), Math.sin(a) * (rAt(a) + extra)]
  const GH = GATE_HALF + 2
  const gates = shape.gates
  const main = gates[0]
  const atGate = (a: number, extra: number, half: number) => gates.some((g) => Math.abs(angDiff(a, g)) * (rAt(a) + extra) < half)
  const onStreet = (x: number, z: number, half: number) => gates.some((g) => x * Math.cos(g) + z * Math.sin(g) > -4 && Math.abs(-x * Math.sin(g) + z * Math.cos(g)) < half)
  const thorn = style === 'thorn'
  /** The roofs of the works in the wards: natural slate, dark slate, tile or shingle. */
  const WORK_ROOF = style === 'sun' ? PAL.tile[0] : style === 'free' ? PAL.shingle[0] : thorn ? 0x3e434a : PAL.slate[0]

  const wallH = 13 + tier * 2.5
  const bastionR = 6 + tier
  const bastionH = wallH + 5 + tier

  // ---------------------------------------------------------------------------------------------
  // The bastions' decks (the battlements, caps, fires and banners are the shared masonry: keeps.ts).
  // ---------------------------------------------------------------------------------------------
  /** What stands on a bastion's deck. */
  const deck = (x: number, y: number, z: number, kind: number, face: number) => {
    const f = new Frame(x, z, face, y)
    if (kind === 0) {
      // A ballista on its turning post, aimed out.
      f.put(flat, cyl(0.5, 0.7, 1.4, 6), WOOD_D, 0, 0.7, 0)
      f.put(flat, box(0.9, 0.6, 4.6), WOOD, 0, 1.6, 0.6)
      for (const s of [-1, 1]) f.put(flat, box(2.6, 0.3, 0.3), WOOD_D, s * 1.2, 1.7, 2.5, { ry: s * 0.45 })
      f.put(flat, box(0.12, 0.12, 4.4), IRON, 0, 1.95, 1.2, { ao: 0 })
    } else if (kind === 1) {
      // A mangonel: its frame, its arm cocked back, a pile of shot.
      for (const s of [-1, 1]) {
        f.put(flat, box(0.5, 0.5, 6), WOOD_D, s * 1.6, 0.25, 0)
        f.put(flat, box(0.4, 3.2, 0.4), WOOD, s * 1.6, 1.6, 0.4)
      }
      f.put(flat, box(3.6, 0.4, 0.4), WOOD_D, 0, 3, 0.4)
      f.put(flat, box(0.4, 0.4, 6.4), WOOD, 0, 2.2, -1.6, { rx: 0.9 })
      f.put(flat, box(1.1, 0.5, 1.1), WOOD_D, 0, 0.6, -3.4)
      for (let i = 0; i < 5; i++) f.put(flat, sphere(0.45, 0), 0x8a8478, -2.6 + (i % 3) * 0.8, 0.45 + Math.floor(i / 3) * 0.6, 2.6)
    } else {
      // A low watch-cupola, open on its posts, capped in the realm's way.
      for (const [u, v] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) f.put(stone, box(0.5, 3, 0.5), S0.stoneD, u, 1.5, v)
      f.put(stone, box(4.2, 0.5, 4.2), S0.stoneD, 0, 3.2, 0)
      crown(x, y + 3.4, z, 2.4, 0.8, face + Math.PI / 4)
    }
  }
  const deckAt = (x: number, y: number, z: number, kind: number, face: number) => (kind === 2 ? fire(x, y, z, 1.6) : deck(x, y, z, kind, face))

  // ---------------------------------------------------------------------------------------------
  // Ground: the bailey levelled and gravelled inside the walls, the streets from the gates.
  // ---------------------------------------------------------------------------------------------
  {
    const pts = Array.from({ length: 96 }, (_, i) => pt((i / 96) * Math.PI * 2, 6))
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 6, bevelEnabled: false, curveSegments: 1 })
    g.rotateX(-Math.PI / 2)
    F(g, ruined ? 0x5a5040 : 0x8c7d62, { y: -5.2, ao: 0 })
    for (const gt of gates) {
      const len = rAt(gt) + 10
      F(box(len, 0.4, 13), ruined ? 0x6a6050 : 0xa09276, { x: (Math.cos(gt) * len) / 2, y: 0.95, z: (Math.sin(gt) * len) / 2, ry: -gt, ao: 0 })
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Beyond the walls: the dry ditch, the palisade on its far bank, the chevaux-de-frise beyond.
  // ---------------------------------------------------------------------------------------------
  const DITCH = 14
  const ditchW = 13
  const PALI = DITCH + ditchW / 2 + 4
  const ABATIS = PALI + 9
  {
    const n = 96
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const mid = (a0 + a1) / 2
      // A causeway of earth crosses the ditch at each gate but the main one (that has the drawbridge).
      if (gates.some((g) => g !== main && Math.abs(angDiff(mid, g)) * (rAt(mid) + DITCH) < GH + 2)) continue
      const [ax, az] = pt(a0, DITCH)
      const [bx, bz] = pt(a1, DITCH)
      const { f, len, mx, mz } = along(ax, az, bx, bz)
      const y = G(mx, mz)
      f.put(flat, box(len + 0.6, 0.3, ditchW - 4), 0x3e3628, 0, y + 0.1, 0, { ao: 0 })
      for (const s of [-1, 1]) f.put(flat, box(len + 0.6, 0.4, 3), 0x6a5a40, 0, y + 0.35, s * (ditchW / 2 - 1), { rx: s * 0.35, ao: 0 })
      f.put(stone, box(len + 1, 2.2, 6), EARTH, 0, y + 0.6, ditchW / 2 + 3.5, { ao: 0.15 })
    }
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2
      if (atGate(a, PALI, GH + 4)) continue
      if (ruined && rnd() < 0.5) continue
      for (let k = 0; k < 3; k++) {
        const [x, z] = pt(a + (k / 3) * ((Math.PI * 2) / 180), PALI)
        const h = ruined ? 2 + rnd() * 3 : 6.2 + rnd() * 1.2
        const y = G(x, z)
        F(cyl(0.5, 0.55, h, 5), rnd() < 0.5 ? LOG : 0x6e5032, { x, y: y + 1.4 + h / 2, z, ao: 0.15 })
        if (live) F(cone(0.5, 1.1, 5), 0x8a6a48, { x, y: y + 1.9 + h, z, ao: 0 })
      }
    }
    const nA = Math.round(((rAt(0) + ABATIS) * Math.PI * 2) / 9)
    for (let i = 0; i < nA; i++) {
      const a = (i / nA) * Math.PI * 2
      if (atGate(a, ABATIS, GH + 8)) continue
      if (ruined && rnd() < 0.5) continue
      const { f, len, mx, mz } = along(...pt(a, ABATIS), ...pt(a + ((Math.PI * 2) / nA) * 0.8, ABATIS))
      const y = G(mx, mz)
      f.put(flat, cyl(0.35, 0.35, len, 6), 0x5b4027, 0, y + 1.5, 0, { rz: Math.PI / 2, ao: 0 })
      for (let t = -len / 2 + 0.8; t < len / 2; t += 1.6) for (const s of [-1, 1]) f.put(flat, cyl(0.12, 0.2, 4.4, 4), 0x7a5a38, t, y + 1.5, 0, { rx: s * 0.8, ao: 0 })
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The curtain, and the casemates against its back.
  // ---------------------------------------------------------------------------------------------
  const curtain = (ax: number, az: number, bx: number, bz: number) => {
    const { f, len, mx, mz } = along(ax, az, bx, bz)
    if (len < 1) return
    for (let t = 0.15; t < 1; t += 0.25) ring.push([ax + (bx - ax) * t, az + (bz - az) * t])
    const low = Math.min(G(mx, mz), G(ax, az), G(bx, bz), 0)
    f.put(stone, box(len + 0.8, 4 - low, 12), S0.stoneD, 0, (low - 4) / 2 + 1.2, 0.6, { ao: 0.15 })
    const h = crumble(wallH)
    if (ruined && rnd() < 0.3) {
      for (let i = 0; i < 4; i++) S(new THREE.DodecahedronGeometry(2.2 + rnd() * 2, 0), S0.stoneD, { x: mx + (rnd() - 0.5) * len * 0.6, y: 1.5, z: mz + (rnd() - 0.5) * len * 0.6, ry: rnd() * 3 })
      return
    }
    f.put(stone, box(len + 0.4, h * 0.4, 3.6), S0.stoneD, 0, h * 0.18, 3.5, { rx: -0.32, ao: 0.2 })
    stone.push(mottle(bpart(new THREE.BoxGeometry(len + 0.4, h, 6, Math.max(1, Math.round(len / 6)), 3, 1), S0.stone, { x: mx, y: h / 2, z: mz, ry: f.ry }), 0.05))
    f.put(stone, box(len, 0.6, 6.6), S0.stoneD, 0, h * 0.42, 0, { ao: 0 })
    for (let t = -len / 2 + 3; t < len / 2 - 2; t += 6) f.put(flat, box(0.45, 2.6, 0.2), S0.dark, t, h * 0.64, 3.05, { ao: 0 })
    if (ruined) return
    f.put(stone, box(len, 1.2, 8), S0.stoneD, 0, h + 0.6, -1)
    for (let t = -len / 2 + 1.2; t < len / 2 - 0.8; t += 2.4) f.put(flat, box(0.9, 1.6, 1.8), S0.stoneD, t, h - 0.5, 3.7, { ao: 0.25 })
    f.put(stone, box(len, 2.4, 1.4), S0.stone, 0, h + 1.2, 4.2)
    battlements(f, len, h + 2.4, 4.2)
    // A torch in its bracket on the inside of the parapet, for the watch on the wall-walk.
    if (len > 18) {
      f.put(flat, box(0.25, 0.25, 1.2), IRON, 0, h + 2.4, 2.6, { ao: 0 })
      f.put(flat, cyl(0.12, 0.1, 1.6, 5), WOOD_D, 0, h + 3, 2, { rx: -0.2, ao: 0 })
      f.put(kit.glow, cyl(0.22, 0.16, 0.4, 6), FIRE, 0, h + 3.9, 1.9)
      const [tx, tz] = f.at(0, 1.9)
      flames.push([tx, h + 4.4, tz, 3.4])
    }
    if (style === 'free') {
      f.put(stone, box(len, 2.4, 2.6), WOOD, 0, h + 2.6, 5.4)
      f.put(stone, box(len + 0.4, 0.3, 3.6), 0x6f5a42, 0, h + 4.1, 5.2, { rx: -0.25 })
    }
  }
  /**
   * A casemate along the back of a stretch of curtain: a ground floor of stone vaults opening on the
   * bailey through an arcade, and above either a barracks under a lean-to roof or a firing deck.
   */
  const CASE = 9
  const casemate = (ax: number, az: number, bx: number, bz: number, i: number) => {
    const { f, len } = along(ax, az, bx, bz)
    const L = len - 2 * (bastionR + 2)
    if (L < 8) return
    const z0 = -3 - CASE / 2
    const front = -3 - CASE
    const h1 = crumble(6.4)
    f.put(stone, box(L, h1, CASE), S0.stoneD, 0, h1 / 2, z0)
    if (ruined) return
    const bays = Math.max(2, Math.round(L / 4.2))
    const bw = L / bays
    for (let b = 0; b <= bays; b++) f.put(stone, box(1.1, h1, 1.2), S0.stone, -L / 2 + b * bw, h1 / 2, front - 0.3)
    for (let b = 0; b < bays; b++) {
      const u = -L / 2 + (b + 0.5) * bw
      f.put(flat, box(bw - 1.3, 3.8, 0.2), S0.dark, u, 2.4, front - 0.02, { ao: 0 })
      f.put(flat, new THREE.TorusGeometry((bw - 1.1) / 2, 0.4, 3, 8, Math.PI), S0.stone, u, 4.3, front - 0.3, { ao: 0 })
    }
    f.put(stone, box(L, 0.7, CASE + 0.8), S0.stoneD, 0, h1 + 0.35, z0)
    if (i % 2 === 0) {
      // Barracks over the vaults, under a lean-to roof against the curtain.
      const h2 = 4.4
      f.put(stone, box(L, h2, CASE - 1), S0.stoneL, 0, h1 + 0.7 + h2 / 2, z0 + 0.5)
      for (let u = -L / 2 + 2.5; u < L / 2 - 1.5; u += 3.6) {
        f.put(flat, box(0.8, 1.3, 0.2), S0.dark, u, h1 + 3, front + 0.95, { ao: 0 })
        if (rnd() < 0.45) f.put(lamps, box(0.62, 1.05, 0.05), 0xffb35a, u, h1 + 3, front + 0.84, { ao: 0, jitter: 0.12 })
      }
      const pitch = Math.atan2(2.4, CASE)
      f.put(stone, box(L + 0.6, 0.4, CASE + 1.6), WORK_ROOF, 0, h1 + 0.7 + h2 + 1.3, z0 + 0.2, { rx: -pitch, ao: 0.1 })
      for (let u = -L / 2 + 6; u < L / 2 - 4; u += 14) {
        f.put(stone, box(1.4, 3.5, 1.4), S0.stoneD, u, h1 + h2 + 3.2, -4.5)
        const [sx, sz] = f.at(u, -4.5)
        if (rnd() < 0.5) smoke.push([sx, h1 + h2 + 5, sz])
      }
    } else {
      // A firing deck behind a parapet, a ballista or a brazier on it.
      battlements(f, L, h1 + 0.7, front + 0.4)
      if (L > 16) {
        const [dx, dz] = f.at(rnd() * L * 0.4 - L * 0.2, z0)
        deckAt(dx, h1 + 0.7, dz, rnd() < 0.5 ? 0 : 2, f.ry + Math.PI)
      }
    }
    // A stair up the end of the range, and the lord's banners down its front.
    for (let s = 0; s < 7; s++) f.put(stone, box(2.2, 0.5, 2.2), S0.stoneD, L / 2 - 1.2, 0.5 + s * (h1 / 7), front - 1.4 - s * 0.05, { ao: 0.05 })
    for (let u = -L / 2 + 5; u < L / 2 - 4; u += 12) banner(f, u, h1 - 0.2, front - 0.5, 3.6)
  }
  /** A bastion: a squat octagon on a battered foot, its flat deck behind battlements. */
  const bastion = (x: number, z: number, r: number, h: number, kind: number) => {
    const rot = Math.atan2(x, z) + Math.PI / 8
    const face = Math.atan2(x, z)
    const hh = crumble(h)
    S(cyl(r + 0.6, r + 3.4, hh * 0.42, 8), S0.stoneD, { x, y: hh * 0.21 - 0.4, z, ry: rot, ao: 0.15 })
    stone.push(mottle(bpart(new THREE.CylinderGeometry(r, r + 0.3, hh, 8, 4), S0.stone, { x, y: hh / 2, z, ry: rot }), 0.05))
    S(cyl(r + 0.25, r + 0.25, 0.6, 8), S0.stoneD, { x, y: hh * 0.45, z, ry: rot, ao: 0 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      F(box(0.5, 2.6, 0.3), S0.dark, { x: x + Math.cos(a) * (r * 0.93 + 0.1), y: hh * 0.66, z: z + Math.sin(a) * (r * 0.93 + 0.1), ry: -a + Math.PI / 2, ao: 0 })
    }
    if (ruined) return
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      F(box(1.1, 1.6, 1.6), S0.stoneD, { x: x + Math.cos(a) * (r + 0.4), y: h - 0.5, z: z + Math.sin(a) * (r + 0.4), ry: -a + Math.PI / 2, ao: 0.25 })
    }
    S(cyl(r + 1.4, r + 1.4, 1.6, 8), S0.stone, { x, y: h + 0.8, z, ry: rot })
    const mf = new Frame(x, z, 0, h + 1.6)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const m = mf.sub(Math.cos(a) * (r + 0.7), Math.sin(a) * (r + 0.7), Math.atan2(Math.cos(a), Math.sin(a)))
      merlon(m, 0, 0, 0, i)
    }
    if (thorn) {
      // Iron thorns jutting from the corners of the deck.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8
        F(cone(0.22, 2.8, 4), IRON, { x: x + Math.cos(a) * (r + 2.2), y: h + 0.8, z: z + Math.sin(a) * (r + 2.2), rz: Math.cos(a) * -1.4, rx: Math.sin(a) * 1.4, ao: 0 })
      }
    }
    if (style === 'free') {
      S(cyl(r + 2.2, r + 2.2, 2.4, 8), WOOD, { x, y: h + 2.8, z, ry: rot })
      stone.push(bpart(new THREE.CylinderGeometry(r + 2.4, r + 3.2, 0.4, 8, 1, true), 0x6f5a42, { x, y: h + 4.2, z, ry: rot, ao: 0 }))
    }
    deckAt(x, h + 1.6, z, kind, face)
  }

  // The stations round the walls between the gates (corners of the outline and evenly between).
  const spacing = 40 + tier * 3
  const flank = GH + bastionR + 2
  let station = 0
  for (let i = 0; i < 4; i++) {
    const g0 = gates[i]
    const g1 = gates[(i + 1) % 4] + (i === 3 ? Math.PI * 2 : 0)
    const a0 = g0 + flank / rAt(g0)
    const a1 = g1 - flank / rAt(g1)
    const keys = [a0, a1]
    for (const k of shape.corners) {
      let a = k
      while (a < a0) a += Math.PI * 2
      while (a > a0 + Math.PI * 2) a -= Math.PI * 2
      if (a > a0 + 0.08 && a < a1 - 0.08) keys.push(a)
    }
    keys.sort((p, q) => p - q)
    const stations: { a: number; tower: boolean }[] = []
    for (let j = 0; j < keys.length - 1; j++) {
      const arc = ((keys[j + 1] - keys[j]) * (rAt(keys[j]) + rAt(keys[j + 1]))) / 2
      const n = Math.max(1, Math.round(arc / spacing))
      for (let k = j === 0 ? 0 : 1; k <= n; k++) stations.push({ a: keys[j] + ((keys[j + 1] - keys[j]) * k) / n, tower: true })
    }
    stations[0].tower = stations[stations.length - 1].tower = false
    for (let k = 0; k < stations.length - 1; k++) {
      curtain(...pt(stations[k].a), ...pt(stations[k + 1].a))
      casemate(...pt(stations[k].a), ...pt(stations[k + 1].a), station + k)
    }
    for (const st of stations) if (st.tower) bastion(...pt(st.a), bastionR, bastionH, station++ % 3)
  }

  // ---------------------------------------------------------------------------------------------
  // The gates: twin bastions with a fighting gallery between, a portcullis, the doors; at the main
  // gate a drawbridge on chains over the ditch (and from rank 3 a barbican before it).
  // ---------------------------------------------------------------------------------------------
  const gh = wallH + 6
  for (const g of gates) {
    const isMain = g === main
    const f = new Frame(...pt(g), Math.atan2(Math.cos(g), Math.sin(g)))
    const br = bastionR + (isMain ? 1.5 : 0.5)
    for (const s of [-1, 1]) {
      const [x, z] = f.at(s * (GH + br - 1), 1.5)
      bastion(x, z, br, crumble(gh + (isMain ? 7 : 4)), 3)
    }
    if (ruined) continue
    f.put(stone, box(GH * 2 + 4, 7, 11), S0.stone, 0, gh - 2.5, -0.5)
    f.put(stone, box(GH * 2 + 6, 1.4, 12), S0.stoneD, 0, gh + 1.6, -0.5)
    battlements(f.sub(0, 4.8), GH * 2 + 4, gh + 2.3, 0)
    f.put(flat, new THREE.TorusGeometry(GH - 0.5, 0.9, 4, 16, Math.PI), S0.stoneD, 0, gh - 5.2, 5.1, { sy: 3.6 / (GH - 0.5), ao: 0 })
    for (let u = -GH + 1.5; u <= GH - 1.5; u += 1.6) f.put(flat, box(0.35, 3.4, 0.35), IRON, u, gh - 6.4, 4.6, { ao: 0 })
    for (const y of [gh - 7.8, gh - 5.4]) f.put(flat, box(GH * 2 - 2, 0.35, 0.35), IRON, 0, y, 4.6, { ao: 0 })
    for (const s of [-1, 1]) {
      f.put(stone, box(1, 9, 10), WOOD, s * (GH - 2), 4.5, -5, { ry: s * 0.6 })
      for (const y of [2, 7]) f.put(flat, box(1.2, 0.5, 10.2), PAL.iron, s * (GH - 2), y, -5, { ry: s * 0.6, ao: 0 })
    }
    banner(f, 0, gh - 1.4, 5.6, 4)
    // Torches either side of the gateway, and the light they throw on the road.
    for (const s of [-1, 1]) {
      f.put(flat, cyl(0.13, 0.1, 1.7, 5), WOOD_D, s * (GH + 0.6), gh - 8.4, 6.2, { ao: 0 })
      f.put(kit.glow, cyl(0.24, 0.17, 0.42, 6), FIRE, s * (GH + 0.6), gh - 7.4, 6.2)
      const [tx, tz] = f.at(s * (GH + 0.6), 6.2)
      flames.push([tx, gh - 6.9, tz, 3.8])
    }
    const [lx, lz] = f.at(0, 12)
    lights.push({ x: lx, y: 5, z: lz, r: 34, i: 0.5 })
    if (!isMain) continue
    const by = Math.min(G(...pt(g, DITCH + ditchW)), 0.6)
    f.put(stone, box(GH * 2 - 4, 0.9, ditchW + 6), WOOD, 0, (by + 0.6) / 2 + 0.6, DITCH, { rx: Math.atan2(0.6 - by, ditchW + 6), ao: 0.1 })
    for (let u = -GH + 4; u <= GH - 4; u += 3) f.put(flat, box(0.3, 0.3, ditchW + 6), WOOD_D, u, (by + 0.6) / 2 + 1.1, DITCH, { ao: 0 })
    for (const s of [-1, 1]) {
      const len = Math.hypot(gh - 6 - 1, ditchW + 4)
      f.put(flat, cyl(0.16, 0.16, len, 4), IRON, s * (GH - 3), (gh - 6 + 1.2) / 2, (5 + DITCH + ditchW / 2) / 2, { rx: Math.atan2(DITCH + ditchW / 2 - 5, gh - 6 - 1.2), ao: 0 })
    }
    if (tier >= 3) {
      const out = DITCH + ditchW + 15
      for (const s of [-1, 1]) {
        f.put(stone, box(4, wallH * 0.6, out - 8), S0.stone, s * (GH + 2), wallH * 0.3, (out + 8) / 2)
        battlements(f.sub(s * (GH + 2), (out + 8) / 2, Math.PI / 2), out - 10, wallH * 0.6, 0)
        bastion(...f.at(s * (GH + 5), out), 5, wallH * 0.85, 2)
      }
      f.put(stone, box(GH * 2 + 6, 4, 6), S0.stone, 0, wallH * 0.85 - 1, out)
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The great keep in the middle of the bailey, standing alone.
  // ---------------------------------------------------------------------------------------------
  const keep = greatKeep(m, main)
  const keepTop = keep.keepTop

  // ---------------------------------------------------------------------------------------------
  // The wards: from the keep to the casemates, between the streets, packed with the
  // works of a garrison. Each building stands where its footprint fits.
  // ---------------------------------------------------------------------------------------------
  const taken: Taken[] = []
  const inner = keep.radius + 4
  const fit = (q: number, w: number, d: number, make: (f: Frame) => void, outward = false) => {
    const a0 = gates[q] + Math.PI / 4
    const hw = w / 2
    const hd = d / 2
    const radii: number[] = []
    for (let r = inner + hd; r < rAt(a0) - 12 - hd; r += 1.5) radii.push(r)
    if (outward) radii.reverse()
    for (const r of radii)
      for (let j = 0; j < 19; j++) {
        const a = a0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.08
        const px = Math.cos(a) * r
        const pz = Math.sin(a) * r
        const ry = Math.atan2(-px, -pz)
        const fr = new Frame(px, pz, ry)
        let ok = true
        for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, -hd], [0, hd], [-hw, 0], [hw, 0]]) {
          const [cx, cz] = fr.at(lx, lz)
          const d0 = Math.hypot(cx, cz)
          if (d0 < inner || d0 > rAt(Math.atan2(cz, cx)) - 12 || onStreet(cx, cz, 8)) {
            ok = false
            break
          }
        }
        if (!ok) continue
        const me: Taken = { x: px, z: pz, r: Math.hypot(hw, hd), hw: hw + 0.5, hd: hd + 0.5, ry }
        if (taken.some((t) => Math.hypot(t.x - px, t.z - pz) < t.r + me.r && rectsOverlap(t, me))) continue
        taken.push(me)
        make(fr)
        return true
      }
    return false
  }
  /**
   * A military range: dressed stone on a plinth, buttresses down its long sides, string courses,
   * windows on every floor, an arched door, chimneys, an outside stair, a banner in the lord's colour.
   */
  const range = (f: Frame, w: number, d: number, floors: number, o: { chimneys?: number; buttress?: boolean; stair?: boolean; roofCol?: number } = {}) => {
    const H = 4.2
    const h = crumble(floors * H)
    f.put(stone, box(w + 0.6, 1.4, d + 0.6), S0.stoneD, 0, 0.3, 0, { ao: 0.1 })
    stone.push(mottle(bpart(new THREE.BoxGeometry(w, h, d, 2, floors, 1), S0.stoneL, { x: f.x, y: h / 2 + 0.9, z: f.z, ry: f.ry }), 0.05))
    if (ruined) return
    for (let fl = 1; fl < floors; fl++) f.put(flat, box(w + 0.3, 0.35, d + 0.3), S0.stoneD, 0, 0.9 + fl * H, 0, { ao: 0 })
    for (let fl = 0; fl < floors; fl++)
      for (const s of [-1, 1])
        for (let u = -w / 2 + 2; u < w / 2 - 1.2; u += 3.2) {
          f.put(flat, box(0.8, 1.4, 0.2), S0.dark, u, 0.9 + fl * H + 2.2, s * (d / 2 + 0.05), { ao: 0 })
          if (rnd() < 0.4) f.put(lamps, box(0.62, 1.15, 0.05), 0xffb35a, u, 0.9 + fl * H + 2.2, s * (d / 2 + 0.16), { ao: 0, jitter: 0.12 })
        }
    if (o.buttress) for (const s of [-1, 1]) for (let u = -w / 2 + 0.6; u <= w / 2 - 0.6; u += 4.8) f.put(stone, box(1.1, h * 0.85, 1.3), S0.stone, u, (h * 0.85) / 2 + 0.9, s * (d / 2 + 0.55), { rx: s * 0.06 })
    f.put(flat, box(2, 2.8, 0.3), PAL.door, 0, 2.3, d / 2 + 0.1, { ao: 0 })
    f.put(flat, new THREE.TorusGeometry(1.2, 0.3, 3, 8, Math.PI), S0.stone, 0, 3.7, d / 2 + 0.2, { ao: 0 })
    f.put(stone, gable(d + 1.4, w + 1, d * 0.5), o.roofCol ?? WORK_ROOF, 0, h + 0.9, 0, { ao: 0.15 })
    const n = o.chimneys ?? 1
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? w / 2 - 2 : -w / 2 + 2 + (i * (w - 4)) / (n - 1)
      f.put(stone, box(1.5, d * 0.5 + 2.6, 1.4), S0.stoneD, u, h + 0.9 + d * 0.25, -d * 0.18)
      const [sx, sz] = f.at(u, -d * 0.18)
      smoke.push([sx, h + d * 0.5 + 3.6, sz])
    }
    if (o.stair && floors > 1) for (let s = 0; s < 8; s++) f.put(stone, box(2, 0.45, 1.6), S0.stoneD, -w / 2 - 1.2, 0.6 + s * (H / 8), d / 2 - 1 - s * 0.95, { ao: 0.05 })
    banner(f, w / 4, h - 0.3, d / 2 + 0.2, 4)
  }
  // Odds and ends to fill the gaps: tents, stacks of crates and barrels, weapon racks, braziers.
  const rack = (f: Frame) => {
    f.put(flat, box(5, 0.25, 0.25), WOOD_D, 0, 2.2, 0)
    for (const s of [-1, 1]) f.put(flat, box(0.25, 2.4, 0.25), WOOD_D, s * 2.4, 1.2, 0)
    for (let i = 0; i < 8; i++) {
      f.put(flat, box(0.12, 4.2, 0.12), 0x6a5034, -2.1 + i * 0.6, 2.1, 0.35, { rx: -0.12 })
      f.put(flat, cone(0.16, 0.6, 4), 0xb8bec4, -2.1 + i * 0.6, 4.4, 0.6, { ao: 0 })
    }
  }
  const stores = (f: Frame) => {
    for (let i = 0; i < 4; i++) barrel(kit, f, -3 + i * 1.5, -1.2)
    for (let i = 0; i < 3; i++) crate(kit, f, -2 + i * 1.7, 0, 1)
    crate(kit, f, -1.2, 1.5, 1)
  }
  const fillers: ((f: Frame) => void)[] = [
    (f) => {
      tent(kit, f, -3, 0, 3.2, rnd() < 0.3 ? 'accent' : 'canvas')
      tent(kit, f, 3.5, 0.5, 3.2)
    },
    stores,
    (f) => {
      rack(f.sub(0, -1))
      const [bx, bz] = f.at(0, 2.2)
      fire(bx, 0, bz, 0.8)
    },
    (f) => cart(kit, f, rnd() < 0.5 ? 'barrels' : 'sacks', rnd),
  ]
  const fillWard = (q: number, list: ((f: Frame) => void)[]) => {
    for (let i = 0, misses = 0; misses < 6 && i < 40; i++) {
      const pick = list[i % list.length]
      if (fit(q, 9, 8, pick, i % 2 === 1)) misses = 0
      else misses++
    }
  }
  if (live) {
    // Ward 1: the great barracks round their drill yard, tents, racks of spears and halberds.
    fit(0, 28, 10, (f) => range(f, 26, 9, 2, { chimneys: 3, buttress: true, stair: true }), true)
    fit(0, 20, 10, (f) => range(f, 18, 9, 2, { chimneys: 2, stair: true }))
    fit(0, 22, 16, (f) => {
      f.put(flat, box(22, 0.25, 16), 0xc8b48a, 0, 1, 0, { ao: 0, jitter: 0.08 })
      for (let i = 0; i < 3; i++) {
        const b = f.sub(-7 + i * 7, -6.5, Math.PI)
        b.put(flat, cyl(1.2, 1.2, 0.5, 8), 0xd8c070, 0, 2.2, 0, { rx: Math.PI / 2 - 0.25 })
        b.put(flat, cyl(0.7, 0.7, 0.52, 8), 0xb8302a, 0, 2.2, 0.02, { rx: Math.PI / 2 - 0.25, ao: 0 })
        for (const s of [-1, 1]) b.put(flat, box(0.25, 2.6, 0.25), WOOD_D, s * 0.9, 1.3, -0.5, { rx: 0.3 })
      }
      for (let i = 0; i < 5; i++) {
        f.put(flat, cyl(0.35, 0.4, 3, 6), 0x6b4b2e, -8 + i * 4, 2.4, 2)
        f.put(flat, box(1.8, 0.3, 0.3), 0x6b4b2e, -8 + i * 4, 3.2, 2, { ao: 0 })
        f.put(flat, sphere(0.55, 0), 0xcdbf98, -8 + i * 4, 4.2, 2)
      }
      rack(f.sub(-5, 6.5, Math.PI))
      rack(f.sub(5, 6.5, Math.PI))
    })
    fillWard(0, [fillers[0], fillers[2], fillers[0], fillers[1]])
    // Ward 2: the foundry, its chimneys smoking and its furnaces glowing; the siege works in their yard.
    fit(1, 22, 13, (f) => {
      range(f, 20, 12, 2, { chimneys: 3, buttress: true })
      for (const u of [-6, 0, 6]) f.put(kit.glow, box(2.6, 1.8, 0.3), FIRE, u, 2, 6.2)
      for (const u of [-6, 6]) {
        f.put(flat, box(1.8, 1, 1), IRON, u, 1.4, 8, { ao: 0 })
        f.put(flat, box(1, 0.8, 1), 0x4a3a2a, u, 0.4, 8)
      }
    }, true)
    fit(1, 24, 16, (f) => {
      f.put(flat, box(24, 0.25, 16), 0x9a8c70, 0, 1, 0, { ao: 0 })
      // A mangonel half built: its frame and arm on trestles.
      const m = f.sub(-6, 0)
      for (const s of [-1, 1]) {
        m.put(flat, box(0.6, 0.6, 9), WOOD_D, s * 2.4, 1.3, 0)
        m.put(flat, box(0.5, 5, 0.5), WOOD, s * 2.4, 3.5, 1)
      }
      m.put(flat, box(5.2, 0.5, 0.5), WOOD_D, 0, 5.8, 1)
      m.put(flat, box(0.5, 0.5, 9), WOOD, 0, 3.4, -1.5, { rx: 0.6 })
      // A battering ram under its roof on wheels.
      const r = f.sub(6, -1, Math.PI / 2)
      r.put(flat, box(3.4, 0.5, 10), WOOD_D, 0, 1.6, 0)
      for (const s of [-1, 1]) for (const v of [-3.6, 3.6]) r.put(flat, cyl(1, 1, 0.4, 10), 0x3b2a18, s * 1.9, 1.1, v, { rz: Math.PI / 2, ao: 0 })
      r.put(flat, cyl(0.6, 0.6, 11, 8), LOG, 0, 2.8, 0, { rx: Math.PI / 2 })
      r.put(flat, cone(0.75, 1.4, 8), IRON, 0, 2.8, 6.1, { rx: Math.PI / 2, ao: 0 })
      r.put(stone, gable(4.6, 10.6, 2.6), WOOD, 0, 4, 0, { ry: Math.PI / 2 })
      // Shot piled in pyramids, anvils.
      for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) for (let j = 0; j < 3 - l; j++) f.put(flat, sphere(0.55, 0), 0x8a8478, 2 + i * 1.1 + l * 0.55, 1.6 + l * 0.9, 5 + j * 1.1 + l * 0.55)
      for (const u of [-9, -7]) f.put(flat, box(1.6, 1, 0.9), IRON, u, 1.6, 6, { ao: 0 })
    })
    fillWard(1, [fillers[1], (f) => woodpile(kit, f), fillers[3], fillers[1]])
    // Ward 3: the warhorse stables round their yard, a hayloft with a hoist, the farrier, the wagon shed.
    const coats = [0x5a3a22, 0x7a5232, 0x3a2a1e, 0x8a6a48, 0x4a3426, 0x2a2420]
    fit(2, 26, 18, (f) => {
      range(f.sub(0, -5.5), 26, 7, 2, { chimneys: 1, roofCol: WORK_ROOF })
      // The hoist beam over the loft door.
      f.put(flat, box(0.4, 0.4, 3), WOOD_D, 6, 8.8, -0.8)
      f.put(flat, box(0.1, 3, 0.1), 0x8a7a5a, 6, 7.4, 0.5, { ao: 0 })
      for (const s of [-1, 1]) {
        const wf = f.sub(s * 10.5, 3, s * Math.PI / 2)
        wf.put(stone, box(11, 5, 5), S0.stoneL, 0, 3.4, -2)
        for (let u = -5; u <= 5; u += 2.5) wf.put(flat, box(0.4, 4.4, 0.4), WOOD_D, u, 2.2, 0.8)
        wf.put(stone, gable(7, 11.6, 2.2), WORK_ROOF, 0, 5.9, -1)
      }
      for (let i = 0; i < 6; i++) horse(kit, f.sub(-7.5 + i * 3, 2 + (i % 2) * 2.5, Math.PI * (i % 2)), coats[i])
    }, true)
    fit(2, 10, 9, (f) => {
      range(f, 8, 7, 1, { chimneys: 1 })
      f.put(kit.glow, box(2, 1.2, 0.3), FIRE, 2, 1.6, 3.7)
      f.put(flat, box(1.4, 0.9, 0.8), IRON, -2, 1.3, 5, { ao: 0 })
    })
    fit(2, 18, 9, (f) => {
      for (let u = -8; u <= 8; u += 4) for (const v of [-3.5, 3.5]) f.put(flat, box(0.5, 5, 0.5), WOOD_D, u, 2.5, v)
      f.put(stone, gable(9, 18, 2.4), WORK_ROOF, 0, 5, 0)
      cart(kit, f.sub(-4.5, 0, 0.1), 'empty', rnd)
      cart(kit, f.sub(0, 0, -0.1), 'hay', rnd)
      cart(kit, f.sub(4.5, 0, 0.05), 'barrels', rnd)
    })
    fillWard(2, [
      (f) => {
        for (const s of [-1, 1]) {
          f.put(flat, box(9, 0.25, 0.25), WOOD_D, 0, 1.2, s * 3.5, { ao: 0 })
          f.put(flat, box(0.25, 0.25, 7), WOOD_D, s * 4.5, 1.2, 0, { ao: 0 })
        }
        horse(kit, f.sub(-2, 0, 0.4), coats[Math.floor(rnd() * coats.length)])
        horse(kit, f.sub(2, 1, 2.2), coats[Math.floor(rnd() * coats.length)])
      },
      fillers[3],
      fillers[1],
    ])
    // Ward 4: the granaries, the vaulted cistern, a jib crane over the stores.
    fit(3, 18, 11, (f) => range(f, 16, 10, 3, { buttress: true, chimneys: 0 }), true)
    fit(3, 16, 11, (f) => range(f, 14, 10, 2, { buttress: true, chimneys: 0 }), true)
    fit(3, 15, 15, (f) => {
      // The cistern under its vault: a ring of piers and arches round a ribbed stone dome.
      f.put(stone, cyl(6.4, 6.8, 1.4, 16), S0.stoneD, 0, 0.7, 0)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        f.put(stone, box(1.1, 5, 1.1), S0.stone, Math.cos(a) * 6, 3.2, Math.sin(a) * 6)
      }
      f.put(stone, cyl(6.8, 6.8, 1, 16), S0.stone, 0, 6.2, 0)
      stone.push(mottle(bpart(new THREE.SphereGeometry(6.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), style === 'sun' ? S0.stoneL : S0.stoneD, { x: f.x, y: 6.6, z: f.z, sy: 0.6, ao: 0.25 }), 0.05))
      f.put(flat, cyl(5, 5, 0.3, 16), 0x2a3a40, 0, 1.45, 0, { ao: 0 })
      if (style === 'sun') gold.push(bpart(cone(0.4, 2.4, 6), 0xffffff, { x: f.x, y: 11.4, z: f.z, ao: 0 }))
    })
    fit(3, 12, 10, (f) => {
      // A jib crane: mast, jib and hoist, over a heap of stores.
      f.put(stone, box(2.4, 1, 2.4), S0.stoneD, -3, 0.5, 0)
      f.put(flat, box(0.6, 9, 0.6), WOOD, -3, 5.5, 0)
      f.put(flat, box(7, 0.5, 0.5), WOOD, 0.2, 9.4, 0)
      f.put(flat, box(0.4, 0.4, 4.4), WOOD_D, -1.4, 7.6, 0, { rz: 0.8, ry: Math.PI / 2 })
      f.put(flat, box(0.08, 4, 0.08), 0x8a7a5a, 3.4, 7.2, 0, { ao: 0 })
      crate(kit, f, 3.4, 4, 0, 1.4)
      stores(f.sub(1, 3))
    })
    fillWard(3, [fillers[1], fillers[3], fillers[1], fillers[0]])
  }

  roof.push(...kit.accents)
  stone.push(...kit.roofs)
  return { stone, roof, gold, glow: kit.glow, ring, wallH, keepTop, keepAt: [0, 0], mills: [], smoke, flat, lamps, flames, lights }
}
