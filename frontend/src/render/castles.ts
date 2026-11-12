import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { Castle } from '../game/types'
import { GATE_HALF, ROYAL_SEAT_TIER, holdingRadius, villageRadius, wallRadius, type World } from '../game/world'
import { Frame, PAL, barrel, crate, house, newKit, tent, tree, well, type RoofKind } from './buildings'
import { bmerge, bpart, box, cone, cyl, groundShade, merge, part, sphere } from './geo'
import { applyVision } from './vision'
import { buildVillage, chapel } from './villages'
import { buildRoyalCitadel, buildWard } from './citadel'

const STONE = 0xb1aa9c
const STONE_DARK = 0x8d877b
const KEEP = 0xc2bbab
const DARK = 0x2a211a
const WOOD = 0x6b4b2e

const stoneMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }), '', false, false, true)
const goldMat = applyVision(new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.75, roughness: 0.32, flatShading: true, vertexColors: true }))


export class CastleView {
  readonly group = new THREE.Group()
  readonly id: string
  private roofMat: THREE.MeshStandardMaterial
  private flag: THREE.Mesh
  private flagBase: Float32Array
  color: string
  readonly tier: number
  /** Splendour level from the garrison size (0-5). */
  readonly grand: number
  readonly radius: number
  readonly wallRing: [number, number][] = [] // world-space points along the walls, for fire effects
  /** Village state when built (a change rebuilds the view). */
  readonly owned: boolean
  readonly ruined: boolean
  readonly height: number

  constructor(c: Castle, world: World, color: string, grand = 0) {
    this.grand = grand
    this.id = c.id
    this.color = color
    this.tier = c.tier
    this.radius = holdingRadius(c)
    const rnd = mulberry32(c.id.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7))
    this.owned = c.faction !== 'neutral'
    this.ruined = !!c.ruined
    // The Sovereign's Citadel crowning a royal city (The Long Night): built to its own design.
    if (c.id === 'keep' && world.def.town?.poly) {
      const v = buildRoyalCitadel(c, rnd, color, wallRadius(c.tier), GATE_HALF)
      this.roofMat = v.roofMat
      this.flag = v.flag
      this.flagBase = v.flagBase
      this.group.add(v.group)
      this.height = world.heightAt(c.x, c.z)
      this.group.position.set(c.x, this.height, c.z)
      for (let k = 0; k < 16; k++) this.wallRing.push([c.x + Math.cos((k / 16) * Math.PI * 2) * wallRadius(c.tier), c.z + Math.sin((k / 16) * Math.PI * 2) * wallRadius(c.tier)])
      this.wallHeight = 30
      return
    }
    // The royal city's gatehouses and wards: their own buildings, standing in the city's walls.
    if (c.gate || c.district) {
      const v = buildWard(c, rnd, color)
      this.roofMat = v.roofMat
      this.flag = v.flag
      this.flagBase = v.flagBase
      const inner = v.group
      // Local +x points away from the city's heart (a gatehouse: straight out through its wall).
      const town = world.def.town
      let ox = c.x - (town?.x ?? 0)
      let oz = c.z - (town?.z ?? 0)
      const wall = c.gate ? (world.def.walls ?? []).find((w) => w.points && world.polyDist(world.wallLoop(w), c.x, c.z) < 30) : undefined
      if (wall) {
        const [tx, tz] = world.polyDir(world.wallLoop(wall), c.x, c.z)
        const s = -tz * ox + tx * oz >= 0 ? 1 : -1
        ox = -tz * s
        oz = tx * s
      }
      inner.rotation.y = -Math.atan2(oz, ox)
      this.group.add(inner)
      this.height = world.heightAt(c.x, c.z)
      this.group.position.set(c.x, this.height, c.z)
      this.group.updateMatrixWorld(true)
      const p = new THREE.Vector3()
      for (let k = 0; k < 12; k++) {
        p.set(Math.cos((k / 12) * Math.PI * 2) * 30, 10, Math.sin((k / 12) * Math.PI * 2) * 30).applyMatrix4(inner.matrixWorld)
        this.wallRing.push([p.x, p.z])
      }
      this.wallHeight = 24
      return
    }
    if (c.village) {
      const v = buildVillage(c, rnd, color)
      this.roofMat = v.roofMat
      this.flag = v.flag
      this.flagBase = v.flagBase
      const inner = v.group
      inner.rotation.y = -Math.atan2(-c.z, -c.x)
      // Villages are compounds about 40-50% of a castle's area.
      inner.scale.setScalar(villageRadius(c.tier) / 40)
      this.group.add(inner)
      this.height = world.heightAt(c.x, c.z)
      this.group.position.set(c.x, this.height, c.z)
      this.group.updateMatrixWorld(true)
      const p = new THREE.Vector3()
      for (let k = 0; k < 12; k++) {
        p.set(Math.cos((k / 12) * Math.PI * 2) * 38, 6, Math.sin((k / 12) * Math.PI * 2) * 38).applyMatrix4(inner.matrixWorld)
        this.wallRing.push([p.x, p.z])
      }
      this.wallHeight = 6
      return
    }
    const tier = c.tier
    const Rw = wallRadius(tier) // the curtain wall; armies pass it only at the four gates
    const sides = [12, 14, 16, 18][Math.min(3, tier - 1)]
    const wallH = 11 + tier * 2.5
    const kit = newKit()
    const stone = kit.walls
    const roof: THREE.BufferGeometry[] = []
    const gold: THREE.BufferGeometry[] = []
    const GOLD = 0xffffff
    const GH = GATE_HALF + 2
    const gateAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
    const nearGate = (ang: number, slack: number) => gateAngles.some((g) => Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) * Rw < GH + slack)
    const S = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => stone.push(bpart(geo, col, o))
    const Rf = (geo: THREE.BufferGeometry, col: number, o: Parameters<typeof bpart>[2] = {}) => roof.push(bpart(geo, col, { ao: 0.12, ...o }))

    // Bailey ground (with a skirt of earth beneath its rim), paved streets from each gate to the keep, the market square.
    S(cyl(Rw + 4, Rw + 9, 7, 48), 0x8f7c5c, { y: -2.9, ao: 0 })
    for (const g of gateAngles) {
      const len = Rw + 30
      S(box(len, 0.5, 16), 0xa8987a, { x: (Math.cos(g) * len) / 2, y: 0.85, z: (Math.sin(g) * len) / 2, ry: -g, ao: 0 })
      S(box(len, 0.3, 2), 0x968669, { x: (Math.cos(g) * len) / 2, y: 1.1, z: (Math.sin(g) * len) / 2, ry: -g, ao: 0 })
    }
    S(cyl(26 + tier * 4, 26 + tier * 4, 0.6, 32), 0xb3a588, { y: 0.9, ao: 0 })
    S(cyl(27 + tier * 4, 27 + tier * 4, 0.35, 32), 0x8f7f62, { y: 0.7, ao: 0 })

    // Curtain wall: straight runs between towers, broken by the four gate passages.
    const corners: [number, number][] = []
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + Math.PI / sides
      corners.push([Math.cos(a) * Rw, Math.sin(a) * Rw])
    }
    for (let k = 0; k < sides; k++) {
      const [ax, az] = corners[k]
      const [bx, bz] = corners[(k + 1) % sides]
      const len = Math.hypot(bx - ax, bz - az)
      const ang = -Math.atan2(bz - az, bx - ax)
      const dx = (bx - ax) / len
      const dz = (bz - az) / len
      // Outward normal of this run.
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      const ml = Math.hypot(mx, mz) || 1
      const nx = mx / ml
      const nz = mz / ml
      // Cut the run where it crosses a gate passage.
      const pieces: [number, number][] = []
      let start = -1
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const px = ax + (bx - ax) * t
        const pz = az + (bz - az) * t
        const open = Math.abs(px) < GH || Math.abs(pz) < GH
        if (!open && start < 0) start = t
        if ((open || i === steps) && start >= 0) {
          pieces.push([start * len, (open ? (i - 1) / steps : t) * len])
          start = -1
        }
      }
      for (const [s0, s1] of pieces) {
        const sl = s1 - s0
        if (sl < 2) continue
        const cx = ax + dx * (s0 + sl / 2)
        const cz = az + dz * (s0 + sl / 2)
        const at = (t: number, off: number): [number, number] => [ax + dx * t + nx * off, az + dz * t + nz * off]
        // A battered plinth, the wall, a string course, the wall-walk on the inside.
        S(box(sl, 4, 9), STONE_DARK, { x: cx, y: 0.6, z: cz, ry: ang, ao: 0.1 })
        S(box(sl, wallH, 6), STONE, { x: cx, y: wallH / 2, z: cz, ry: ang })
        S(box(sl, 0.6, 6.5), STONE_DARK, { x: cx, y: wallH * 0.52, z: cz, ry: ang, ao: 0 })
        S(box(sl, 1.2, 7.2), STONE_DARK, { x: cx - nx * 0.6, y: wallH + 0.6, z: cz - nz * 0.6, ry: ang })
        // Corbels under an overhanging parapet, merlons along it (outer face), slits between.
        S(box(sl, 1.4, 1.4), STONE_DARK, { x: cx + nx * 3.4, y: wallH - 0.6, z: cz + nz * 3.4, ry: ang, ao: 0.3 })
        S(box(sl, 2.2, 1.4), STONE, { x: cx + nx * 3.4, y: wallH + 1.1, z: cz + nz * 3.4, ry: ang })
        for (let t = s0 + 1.8; t < s1 - 1.2; t += 3.6) {
          const [ox, oz] = at(t, 3.4)
          S(box(2, 2.2, 1.4), STONE, { x: ox, y: wallH + 3.2, z: oz, ry: ang })
        }
        for (let t = s0 + 3; t < s1 - 2; t += 7) {
          const [ox, oz] = at(t, 3.05)
          S(box(0.5, 2.4, 0.2), DARK, { x: ox, y: wallH * 0.32, z: oz, ry: ang, ao: 0 })
        }
      }
      for (let t = 0.1; t < 1; t += 0.2) this.wallRing.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    // Towers at the angles of the wall (none in a gateway): batter, slits, corbel table, crenellated parapet, a roof on a drum.
    const tr = 5 + tier
    const th = wallH + 8 + tier
    const tower = (x: number, z: number, r: number, h: number, roofH: number, crown = 0) => {
      const n = 12
      S(cyl(r + 1.4, r + 2.4, 5, n), STONE_DARK, { x, y: 1.5, z, ao: 0.1 })
      S(cyl(r, r + 0.4, h, n), STONE, { x, y: h / 2, z })
      S(cyl(r + 0.3, r + 0.3, 0.5, n), STONE_DARK, { x, y: h * 0.55, z, ao: 0 })
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        S(box(0.5, 2.2, 0.3), DARK, { x: x + Math.cos(a) * (r + 0.15), y: h * 0.75, z: z + Math.sin(a) * (r + 0.15), ry: -a + Math.PI / 2, ao: 0 })
      }
      S(cyl(r + 1.1, r + 0.2, 1.6, n), STONE_DARK, { x, y: h + 0.4, z, ao: 0.15 })
      S(cyl(r + 1.1, r + 1.1, 1.4, n), STONE, { x, y: h + 1.9, z })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        S(box(1.6, 1.6, 0.9), STONE, { x: x + Math.cos(a) * (r + 0.7), y: h + 3.3, z: z + Math.sin(a) * (r + 0.7), ry: -a + Math.PI / 2 })
      }
      S(cyl(r * 0.8, r * 0.8, 2.6, n), STONE, { x, y: h + 3.4, z })
      Rf(cone(r + 0.6, roofH, n), 0xffffff, { x, y: h + 4.6 + roofH / 2, z })
      if (crown >= 1) {
        gold.push(bpart(cone(0.6, 2.6, 6), GOLD, { x, y: h + 4.6 + roofH + 1.2, z, ao: 0 }))
        Rf(box(0.2, 2.6, 4.4), 0xffffff, { x, y: h + 4.6 + roofH + 1.4, z: z + 2.3, ao: 0 })
      }
      if (crown >= 2) gold.push(bpart(cyl(r + 0.85, r + 0.85, 0.6, n), GOLD, { x, y: h + 4.8, z, ao: 0 }))
    }
    for (const [x, z] of corners) {
      if (nearGate(Math.atan2(z, x), tr)) continue
      tower(x, z, tr, th, 8 + tier, grand)
    }
    // Four gatehouses: twin towers, an arch with a portcullis, the gates thrown open, banners.
    const gh = wallH + 7
    for (const g of gateAngles) {
      const cx = Math.cos(g)
      const cz = Math.sin(g)
      const ox = cx * Rw
      const oz = cz * Rw
      const lat = (u: number): [number, number] => [ox - cz * u, oz + cx * u]
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 6))
        tower(x, z, 7, gh + 6, 9)
        // A banner in the lord's colours down the outer face.
        Rf(box(0.3, 9, 4), 0xffffff, { x: x + cx * 7.3, y: gh - 2, z: z + cz * 7.3, ry: -g, ao: 0 })
      }
      // The arch spans the gap high enough to march under.
      S(box(10, 6, GH * 2 + 4), STONE, { x: ox, y: gh - 2, z: oz, ry: -g })
      S(box(11, 1.4, GH * 2 + 6), STONE_DARK, { x: ox, y: gh + 1.6, z: oz, ry: -g })
      for (let u = -GH - 2; u <= GH + 2; u += 3.4) {
        const [x, z] = lat(u)
        S(box(1.4, 1.8, 1.8), STONE, { x: x + cx * 4.6, y: gh + 3.2, z: z + cz * 4.6, ry: -g })
      }
      S(new THREE.TorusGeometry(GH - 0.5, 0.9, 4, 16, Math.PI), STONE_DARK, { x: ox + cx * 5.1, y: gh - 5.2, z: oz + cz * 5.1, ry: -g + Math.PI / 2, sy: 3.6 / (GH - 0.5), ao: 0 })
      // Raised portcullis: a grid of iron bars just under the arch.
      for (let u = -GH + 1.5; u <= GH - 1.5; u += 1.6) {
        const [x, z] = lat(u)
        S(box(0.35, 3.2, 0.35), PAL.iron, { x, y: gh - 6.4, z, ao: 0 })
      }
      for (const y of [gh - 7.6, gh - 5.4]) S(box(0.35, 0.35, GH * 2 - 2), PAL.iron, { x: ox, y, z: oz, ry: -g, ao: 0 })
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH - 2))
        S(box(10, 9, 1), WOOD, { x: x - cx * 5, y: 4.5, z: z - cz * 5, ry: -g })
        for (const y of [2, 7]) S(box(10.2, 0.5, 1.2), PAL.iron, { x: x - cx * 5, y, z: z - cz * 5, ry: -g, ao: 0 })
      }
      if (grand >= 4)
        for (const s of [-1, 1]) {
          const [x, z] = lat(s * (GH + 2))
          Rf(box(0.3, 8, 4.4), 0xffffff, { x: x + cx * 4.2, y: gh - 4, z: z + cz * 4.2, ry: -g, ao: 0 })
        }
    }

    // The keep in the market square: a battered base, pilaster buttresses, corbel table and crenellations, corner turrets.
    const k = 16 + tier * 4
    const kh = (20 + tier * 7) * (grand >= 2 ? 1.18 : 1) * (grand >= 5 ? 1.12 : 1)
    const kf = new Frame(0, 0, Math.PI / 4)
    kf.put(stone, box(k + 5, 5, k + 5), STONE_DARK, 0, 1.5, 0, { ao: 0.1 })
    kf.put(stone, box(k, kh, k), KEEP, 0, kh / 2, 0)
    for (let side = 0; side < 4; side++) {
      const f = kf.sub(0, 0, (side * Math.PI) / 2)
      for (const u of [-k * 0.25, k * 0.25]) f.put(stone, box(1.6, kh - 2, 1.2), KEEP, u, kh / 2, k / 2 + 0.5)
      for (const y of [kh * 0.33, kh * 0.66]) f.put(stone, box(k + 0.4, 0.5, 0.5), STONE_DARK, 0, y, k / 2 + 0.2, { ao: 0 })
      for (let i = 0; i < 2; i++) for (const u of [-k * 0.38, 0, k * 0.38]) f.put(stone, box(1.4, 2.8, 0.3), DARK, u, kh * (0.5 + i * 0.22), k / 2 + 0.05, { ao: 0 })
      f.put(stone, box(k, 1.4, 1.6), STONE_DARK, 0, kh - 0.4, k / 2 + 0.6, { ao: 0.3 })
      f.put(stone, box(k + 2.4, 1.6, 1.2), KEEP, 0, kh + 0.8, k / 2 + 0.7)
      for (let u = -k / 2 + 0.6; u <= k / 2; u += 2.4) f.put(stone, box(1.3, 1.6, 1.0), KEEP, u, kh + 2.4, k / 2 + 0.8)
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const x = Math.cos(a) * k * 0.72
      const z = Math.sin(a) * k * 0.72
      S(cyl(3, 3.2, kh + 7, 12), KEEP, { x, y: (kh + 7) / 2, z })
      S(cyl(3.6, 3, 1.2, 12), STONE_DARK, { x, y: kh + 7.4, z, ao: 0.1 })
      for (let j = 0; j < 6; j++) {
        const b = (j / 6) * Math.PI * 2
        S(box(1, 1.2, 0.8), KEEP, { x: x + Math.cos(b) * 3.3, y: kh + 8.6, z: z + Math.sin(b) * 3.3, ry: -b + Math.PI / 2 })
      }
      Rf(cone(3.6, 7, 12), 0xffffff, { x, y: kh + 12.2, z })
    }
    // A forebuilding: the stair up to the keep's door.
    const fb = kf.sub(0, k / 2 + 3, 0)
    fb.put(stone, box(7, kh * 0.38, 6), KEEP, 0, kh * 0.19, 0)
    fb.put(stone, box(2.4, 3.6, 0.3), DARK, 0, kh * 0.38 - 2.4, 3.05, { ao: 0 })
    for (let i = 0; i < 7; i++) fb.put(stone, box(3.4, 0.6, 1.6), STONE_DARK, 4.8, 0.4 + i * (kh * 0.33) / 7, 2.6 - i * 0.8, { ao: 0.05 })
    Rf(cone(k * 0.72, 13 + tier, 4), 0xffffff, { y: kh + 1.8 + (13 + tier) / 2, ry: Math.PI / 4 })
    if (grand >= 3) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const x = Math.cos(a) * (k * 0.95)
        const z = Math.sin(a) * (k * 0.95)
        S(cyl(2.2, 2.4, kh * 0.6, 10), KEEP, { x, y: kh * 0.3, z })
        Rf(cone(3, 6, 10), 0xffffff, { x, y: kh * 0.6 + 3, z })
      }
      gold.push(bpart(box(k + 2.5, 0.9, k + 2.5), GOLD, { y: kh + 2, ry: Math.PI / 4, ao: 0 }))
    }
    if (grand >= 5) {
      gold.push(bpart(cone(2.6, 18, 8), GOLD, { y: kh + 1.8 + (13 + tier) + 9, ao: 0 }))
      gold.push(bpart(sphere(1.6, 1), GOLD, { y: kh + 1.8 + (13 + tier) + 19, ao: 0 }))
    }

    // The town in the four quarters between the streets: timber-framed houses, a church, a granary, gardens.
    const sq = 26 + tier * 4
    const lots: { x: number; z: number; ry: number }[] = []
    for (let q = 0; q < 4; q++) {
      const qa = Math.PI / 4 + (q * Math.PI) / 2
      const rows = 2 + Math.min(2, tier - 1)
      for (let r = 0; r < rows; r++) {
        const inner = tier >= ROYAL_SEAT_TIER ? 12 : 0 // room for a royal seat's inner ward
        const rad = sq + 12 + inner + r * ((Rw - sq - 22 - inner) / rows)
        const span = 0.95 - r * 0.05
        const n = 3 + r + tier
        for (let i = 0; i < n; i++) {
          const a = qa + (i / (n - 1) - 0.5) * span
          const x = Math.cos(a) * rad
          const z = Math.sin(a) * rad
          if (Math.abs(x) < 12 || Math.abs(z) < 12) continue // keep the streets clear
          lots.push({ x, z, ry: -a })
        }
      }
    }
    const roofs: RoofKind[] = ['tile', 'tile', 'slate', 'shingle', 'thatch']
    lots.forEach((l, i) => {
      // Houses face the keep: local +z points to the centre.
      const face = Math.atan2(-l.x, -l.z)
      if (i === 3 && tier >= 2) {
        chapel(kit, new Frame(l.x, l.z, face + Math.PI / 2), rnd, false)
        return
      }
      if (i === 9) {
        house(kit, new Frame(l.x, l.z, face + Math.PI / 2), { w: 18, d: 8, storeys: 1, roof: 'tile', style: 'stone', detail: 'mid' }, rnd)
        return
      }
      // Gardens and orchards break up the rows of houses.
      if (rnd() < 0.2) {
        S(box(9, 0.4, 9), 0x6f8f3a, { x: l.x, y: 1.1, z: l.z, ry: l.ry, ao: 0, jitter: 0.12 })
        const gf = new Frame(l.x, l.z, l.ry)
        for (let t = 0; t < 2; t++) tree(kit, gf, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, rnd, 0.85)
        return
      }
      const w = 5 + rnd() * 3.5
      const d = 6 + rnd() * 3
      house(kit, new Frame(l.x, l.z, face + (rnd() - 0.5) * 0.3, 0.4), { w, d, storeys: rnd() < 0.45 ? 2 : 1, roof: roofs[Math.floor(rnd() * roofs.length)], style: rnd() < 0.25 ? 'stone' : 'timber', detail: 'mid' }, rnd)
    })
    // Market stalls with awnings, crates and barrels round the square; a well in it.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      const x = Math.cos(a) * (sq - 6)
      const z = Math.sin(a) * (sq - 6)
      if (Math.abs(x) < 9 || Math.abs(z) < 9) continue
      const f = new Frame(x, z, Math.atan2(-x, -z), 1.1)
      f.put(stone, box(5, 1.2, 3), WOOD, 0, 0.9, 0)
      for (const [px, pz] of [[-2.4, -1.4], [2.4, -1.4], [-2.4, 1.6], [2.4, 1.6]]) f.put(stone, box(0.25, 3.4, 0.25), PAL.timber, px, 1.7, pz, { ao: 0 })
      f.put(roof, box(6, 0.2, 4.4), 0xffffff, 0, 3.5, 0.3, { rx: 0.2 })
      crate(kit, f, -1.2, 1.5, 0, 1)
      barrel(kit, f, 1.5, 0.3, 0.7)
    }
    well(kit, new Frame(sq * 0.5, sq * 0.5, 0.4, 1))

    // A royal seat: an inner ward round the keep and its square, with its own towers and gatehouses,
    // and banners of the crown along it. No lord's castle has one.
    if (tier >= ROYAL_SEAT_TIER) {
      const Ri = sq + 7
      const n = 24
      const ih = wallH * 0.62
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2
        const a1 = ((i + 1) / n) * Math.PI * 2
        const mid = (a0 + a1) / 2
        const mx = Math.cos(mid) * Ri
        const mz = Math.sin(mid) * Ri
        if (Math.abs(mx) < 13 || Math.abs(mz) < 13) continue // the four streets pass through gates
        const len = 2 * Ri * Math.sin(Math.PI / n) + 0.6
        S(box(len, ih, 4), STONE, { x: mx, y: ih / 2, z: mz, ry: -mid + Math.PI / 2 })
        S(box(len, 1, 5), STONE_DARK, { x: mx, y: ih + 0.5, z: mz, ry: -mid + Math.PI / 2, ao: 0 })
        S(box(1.6, 1.6, 1.2), STONE, { x: Math.cos(mid) * (Ri + 1.8), y: ih + 1.6, z: Math.sin(mid) * (Ri + 1.8), ry: -mid + Math.PI / 2 })
        if (i % 3 === 0) Rf(box(0.3, ih * 0.7, 3.4), 0xffffff, { x: Math.cos(mid) * (Ri + 2.2), y: ih * 0.55, z: Math.sin(mid) * (Ri + 2.2), ry: -mid, ao: 0 })
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        tower(Math.cos(a) * Ri, Math.sin(a) * Ri, 4.6, ih + 6, 7, grand)
      }
      for (const g of gateAngles) {
        for (const s of [-1, 1]) {
          const x = Math.cos(g) * Ri - Math.sin(g) * s * 12
          const z = Math.sin(g) * Ri + Math.cos(g) * s * 12
          tower(x, z, 3.6, ih + 4, 5.5)
        }
      }
    }

    // Splendour 4: an outer ring of low walls beyond the moat line, open at the gates.
    if (grand >= 4) {
      const R2 = Rw + 22
      const n2 = sides * 2
      for (let i = 0; i < n2; i++) {
        const a0 = (i / n2) * Math.PI * 2
        const a1 = ((i + 1) / n2) * Math.PI * 2
        const mid = (a0 + a1) / 2
        if (nearGate(mid, 26)) continue
        const len = 2 * R2 * Math.sin(Math.PI / n2)
        S(box(len + 0.5, 7, 3.5), STONE_DARK, { x: Math.cos(mid) * R2, y: 3.5, z: Math.sin(mid) * R2, ry: -mid + Math.PI / 2 })
        for (let t = -len / 2 + 1; t < len / 2; t += 2.6) {
          const px = Math.cos(mid) * R2 + Math.cos(mid + Math.PI / 2) * t
          const pz = Math.sin(mid) * R2 + Math.sin(mid + Math.PI / 2) * t
          S(box(1.4, 1.3, 3.5), STONE, { x: px, y: 7.6, z: pz, ry: -mid + Math.PI / 2 })
        }
        if (i % 3 === 0) {
          S(cyl(3, 3.4, 10, 12), STONE, { x: Math.cos(a0) * R2, y: 5, z: Math.sin(a0) * R2 })
          Rf(cone(4, 5, 12), 0xffffff, { x: Math.cos(a0) * R2, y: 12.5, z: Math.sin(a0) * R2 })
        }
      }
    }
    // Staging grounds: a tent city outside the walls.
    if (c.staging) {
      for (let i = 0; i < 20; i++) {
        const a = Math.PI * 0.6 + rnd() * Math.PI * 0.8
        const r = Rw + 40 + rnd() * 40
        tent(kit, new Frame(Math.cos(a) * r, Math.sin(a) * r, rnd() * 6), 0, 0, 3.6 + rnd() * 1.5, rnd() < 0.3 ? 'accent' : 'canvas')
      }
      roof.push(...kit.accents)
    }
    stone.push(...kit.roofs)
    if (kit.glow.length) stone.push(...kit.glow)

    const stoneMesh = new THREE.Mesh(groundShade(bmerge(stone), 4, 0.22), stoneMat)
    stoneMesh.castShadow = true
    stoneMesh.receiveShadow = true
    this.roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, vertexColors: true }))
    const roofMesh = new THREE.Mesh(bmerge(roof), this.roofMat)
    roofMesh.castShadow = true

    // Banner above the keep.
    const poleTop = kh + 14 + tier * 2 + 14
    const pole = new THREE.Mesh(merge([part(cyl(0.4, 0.4, 16, 6), 0x3b3027, { y: poleTop - 8 })]), stoneMat)
    const flagGeo = new THREE.PlaneGeometry(13, 8, 8, 2)
    flagGeo.translate(6.5, 0, 0)
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
    this.flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
    this.flag.position.set(0, poleTop - 4, 0)
    this.flag.castShadow = true

    const inner = new THREE.Group()
    inner.add(stoneMesh, roofMesh, pole, this.flag)
    if (gold.length) {
      const goldMesh = new THREE.Mesh(bmerge(gold), goldMat)
      goldMesh.castShadow = true
      inner.add(goldMesh)
    }
    // Gates face the four points of the compass (they match the walls armies march through).
    this.group.add(inner)
    this.height = world.heightAt(c.x, c.z)
    this.group.position.set(c.x, this.height, c.z)
    this.group.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    for (const p of this.wallRing) {
      v.set(p[0], wallH, p[1]).applyMatrix4(inner.matrixWorld)
      p[0] = v.x
      p[1] = v.z
    }
    this.wallHeight = wallH
  }

  wallHeight: number

  setColor(color: string) {
    if (color === this.color) return
    this.color = color
    this.roofMat.color.set(color)
    ;(this.flag.material as THREE.MeshStandardMaterial).color.set(color)
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    // Per-castle materials (the stone and gold materials are shared and stay).
    this.roofMat.dispose()
    ;(this.flag.material as THREE.Material).dispose()
  }

  animate(t: number) {
    const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute
    const base = this.flagBase
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]
      pos.setZ(i, Math.sin(x * 0.55 - t * 4) * x * 0.12)
    }
    pos.needsUpdate = true
  }
}
