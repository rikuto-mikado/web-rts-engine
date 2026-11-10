import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { Castle } from '../game/types'
import { GATE_HALF, holdingRadius, villageRadius, wallRadius, type World } from '../game/world'
import { box, cone, cyl, merge, part, sphere } from './geo'
import { applyVision } from './vision'

const STONE = 0xb1aa9c
const STONE_DARK = 0x8d877b
const KEEP = 0xc2bbab
const DARK = 0x2a211a
const WOOD = 0x6b4b2e
const ROOF_HOUSE = 0x8e4f35

const stoneMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }))
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
    const stone: THREE.BufferGeometry[] = []
    const roof: THREE.BufferGeometry[] = []
    const gold: THREE.BufferGeometry[] = []
    const GOLD = 0xffffff
    const GH = GATE_HALF + 2
    const gateAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
    const nearGate = (ang: number, slack: number) => gateAngles.some((g) => Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) * Rw < GH + slack)

    // Bailey ground, paved streets from each gate to the keep, and the market square.
    stone.push(part(cyl(Rw + 4, Rw + 7, 1.2, 40), 0x8f7c5c, { y: 0.1 }))
    for (const g of gateAngles) {
      const len = Rw + 30
      stone.push(part(box(len, 0.5, 16), 0xa8987a, { x: (Math.cos(g) * len) / 2, y: 0.85, z: (Math.sin(g) * len) / 2, ry: -g }))
    }
    stone.push(part(cyl(26 + tier * 4, 26 + tier * 4, 0.6, 20), 0xb3a588, { y: 0.9 }))

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
        stone.push(part(box(sl, wallH, 6), STONE, { x: cx, y: wallH / 2, z: cz, ry: ang }))
        stone.push(part(box(sl, 1.2, 7.2), STONE_DARK, { x: cx, y: wallH + 0.6, z: cz, ry: ang }))
        for (let t = s0 + 2; t < s1 - 1.5; t += 4) {
          stone.push(part(box(2.2, 2.4, 1.6), STONE_DARK, { x: ax + dx * t - dz * 2.8, y: wallH + 2.2, z: az + dz * t + dx * 2.8, ry: ang }))
        }
      }
      for (let t = 0.1; t < 1; t += 0.2) this.wallRing.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    // Towers at the angles of the wall (none in a gateway).
    const tr = 5 + tier
    const th = wallH + 8 + tier
    for (const [x, z] of corners) {
      if (nearGate(Math.atan2(z, x), tr)) continue
      stone.push(part(cyl(tr, tr + 0.8, th, 10), STONE, { x, y: th / 2, z }))
      stone.push(part(cyl(tr + 1, tr + 1, 1.6, 10), STONE_DARK, { x, y: th + 0.8, z }))
      roof.push(part(cone(tr + 1.6, 8 + tier, 10), 0xffffff, { x, y: th + 1.6 + (8 + tier) / 2, z }))
      if (grand >= 1) {
        gold.push(part(cone(0.6, 2.6, 6), GOLD, { x, y: th + 10 + tier, z }))
        roof.push(part(box(0.2, 2.6, 4.4), 0xffffff, { x, y: th + 10.5 + tier, z: z + 2.3 }))
      }
      if (grand >= 2) gold.push(part(cyl(tr + 1.15, tr + 1.15, 0.8, 10), GOLD, { x, y: th + 2, z }))
    }
    // Four gatehouses: twin towers and an arch over the passage, gates thrown open.
    const gh = wallH + 7
    for (const g of gateAngles) {
      const cx = Math.cos(g)
      const cz = Math.sin(g)
      const ox = cx * Rw
      const oz = cz * Rw
      const lat = (u: number): [number, number] => [ox - cz * u, oz + cx * u]
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 6))
        stone.push(part(cyl(7, 7.6, gh + 6, 10), STONE, { x, y: (gh + 6) / 2, z }))
        stone.push(part(cyl(8, 8, 1.6, 10), STONE_DARK, { x, y: gh + 6.8, z }))
        roof.push(part(cone(8.6, 9, 10), 0xffffff, { x, y: gh + 12, z }))
      }
      // The arch spans the gap high enough to march under.
      stone.push(part(box(10, 6, GH * 2 + 4), STONE, { x: ox, y: gh - 2, z: oz, ry: -g }))
      stone.push(part(box(11, 1.4, GH * 2 + 6), STONE_DARK, { x: ox, y: gh + 1.6, z: oz, ry: -g }))
      // Raised portcullis and open timber leaves.
      stone.push(part(box(1.2, 3, GH * 2 - 2), DARK, { x: ox, y: gh - 6.5, z: oz, ry: -g }))
      for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH - 2))
        stone.push(part(box(10, 9, 1), WOOD, { x: x - cx * 5, y: 4.5, z: z - cz * 5, ry: -g }))
      }
      if (grand >= 4) for (const s of [-1, 1]) {
        const [x, z] = lat(s * (GH + 2))
        roof.push(part(box(0.3, 8, 4.4), 0xffffff, { x: x + cx * 4.2, y: gh - 4, z: z + cz * 4.2, ry: -g }))
      }
    }

    // The keep in the market square.
    const k = 16 + tier * 4
    const kh = (20 + tier * 7) * (grand >= 2 ? 1.18 : 1) * (grand >= 5 ? 1.12 : 1)
    stone.push(part(box(k, kh, k), KEEP, { y: kh / 2, ry: Math.PI / 4 }))
    stone.push(part(box(k + 2, 1.8, k + 2), STONE_DARK, { y: kh + 0.9, ry: Math.PI / 4 }))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const x = Math.cos(a) * k * 0.72
      const z = Math.sin(a) * k * 0.72
      stone.push(part(cyl(3, 3, kh + 7, 10), KEEP, { x, y: (kh + 7) / 2, z }))
      roof.push(part(cone(4, 7, 10), 0xffffff, { x, y: kh + 10.5, z }))
    }
    roof.push(part(cone(k * 0.72, 13 + tier, 4), 0xffffff, { y: kh + 1.8 + (13 + tier) / 2 }))
    for (let i = 0; i < 3; i++) {
      for (let q = 0; q < 4; q++) {
        const a = Math.PI / 4 + (q * Math.PI) / 2
        stone.push(part(box(1.6, 3, 0.6), DARK, { x: Math.cos(a) * (k * 0.71 + 0.1), y: kh * (0.35 + i * 0.22), z: Math.sin(a) * (k * 0.71 + 0.1), ry: -a + Math.PI / 2 }))
      }
    }
    if (grand >= 3) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const x = Math.cos(a) * (k * 0.95)
        const z = Math.sin(a) * (k * 0.95)
        stone.push(part(cyl(2.2, 2.4, kh * 0.6, 8), KEEP, { x, y: kh * 0.3, z }))
        roof.push(part(cone(3, 6, 8), 0xffffff, { x, y: kh * 0.6 + 3, z }))
      }
      gold.push(part(box(k + 2.5, 0.9, k + 2.5), GOLD, { y: kh + 2, ry: Math.PI / 4 }))
    }
    if (grand >= 5) {
      gold.push(part(cone(2.6, 18, 8), GOLD, { y: kh + 1.8 + (13 + tier) + 9 }))
      gold.push(part(sphere(1.6), GOLD, { y: kh + 1.8 + (13 + tier) + 19 }))
    }

    // The town in the four quarters between the streets.
    const sq = 26 + tier * 4
    const lots: { x: number; z: number; ry: number }[] = []
    for (let q = 0; q < 4; q++) {
      const qa = Math.PI / 4 + (q * Math.PI) / 2
      const rows = 2 + Math.min(2, tier - 1)
      for (let r = 0; r < rows; r++) {
        const rad = sq + 12 + r * ((Rw - sq - 22) / rows)
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
    lots.forEach((l, i) => {
      // A few special buildings among the houses: a church, barracks, a granary.
      if (i === 3 && tier >= 2) {
        stone.push(part(box(18, 10, 9), 0xd8cdb2, { x: l.x, y: 5, z: l.z, ry: l.ry }))
        roof.push(part(cyl(6.6, 6.6, 18.6, 3), ROOF_HOUSE, { x: l.x, y: 12.5, z: l.z, rx: Math.PI / 2, ry: l.ry, rz: Math.PI / 2 }))
        stone.push(part(box(5, 22, 5), 0xd8cdb2, { x: l.x + Math.cos(-l.ry) * 9, y: 11, z: l.z + Math.sin(-l.ry) * 9 }))
        roof.push(part(cone(4, 9, 4), ROOF_HOUSE, { x: l.x + Math.cos(-l.ry) * 9, y: 26.5, z: l.z + Math.sin(-l.ry) * 9, ry: Math.PI / 4 }))
        return
      }
      if (i === 9) {
        stone.push(part(box(22, 6, 8), 0xb9a98a, { x: l.x, y: 3, z: l.z, ry: l.ry }))
        stone.push(part(cyl(5.6, 5.6, 22.6, 3), 0x9a7650, { x: l.x, y: 7.6, z: l.z, rx: Math.PI / 2, ry: l.ry, rz: Math.PI / 2 }))
        return
      }
      // Gardens and orchards break up the rows of houses.
      if (rnd() < 0.24) {
        stone.push(part(box(9, 0.4, 9), 0x6f8f3a, { x: l.x, y: 1.1, z: l.z, ry: l.ry }))
        for (let t = 0; t < 2; t++) {
          const ox = (rnd() - 0.5) * 6
          const oz = (rnd() - 0.5) * 6
          stone.push(part(cyl(0.4, 0.5, 3, 5), 0x5b4027, { x: l.x + ox, y: 2.3, z: l.z + oz }))
          stone.push(part(sphere(2.6), 0x4f7a32, { x: l.x + ox, y: 5, z: l.z + oz }))
        }
        return
      }
      const w = 5 + rnd() * 3.5
      const d = 6.5 + rnd() * 4.5
      const h = 3.6 + rnd() * 3.6
      const ry = l.ry + (rnd() - 0.5) * 0.35
      const wall = rnd() < 0.5 ? 0xcdbfa0 : rnd() < 0.5 ? 0xd9ccb0 : 0xbfae8e
      const tint = rnd()
      stone.push(part(box(w, h, d), wall, { x: l.x, y: h / 2, z: l.z, ry }))
      stone.push(part(cyl(w * 0.64, w * 0.64, d + 0.8, 3), tint < 0.55 ? ROOF_HOUSE : tint < 0.8 ? 0x9a5a3a : 0x7a6a58, { x: l.x, y: h + w * 0.29, z: l.z, rx: Math.PI / 2, ry, rz: Math.PI / 2 }))
    })
    // Market stalls and a well around the square.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3
      const x = Math.cos(a) * (sq - 6)
      const z = Math.sin(a) * (sq - 6)
      if (Math.abs(x) < 9 || Math.abs(z) < 9) continue
      stone.push(part(box(5, 3, 4), WOOD, { x, y: 1.5, z, ry: -a }))
      roof.push(part(box(6, 0.4, 5), 0xffffff, { x, y: 3.4, z, ry: -a, rz: 0.2 }))
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
        stone.push(part(box(len + 0.5, 7, 3.5), STONE_DARK, { x: Math.cos(mid) * R2, y: 3.5, z: Math.sin(mid) * R2, ry: -mid + Math.PI / 2 }))
        if (i % 3 === 0) {
          stone.push(part(cyl(3, 3.4, 10, 8), STONE, { x: Math.cos(a0) * R2, y: 5, z: Math.sin(a0) * R2 }))
          roof.push(part(cone(4, 5, 8), 0xffffff, { x: Math.cos(a0) * R2, y: 12.5, z: Math.sin(a0) * R2 }))
        }
      }
    }
    // Staging grounds: a tent city outside the walls.
    if (c.staging) {
      for (let i = 0; i < 20; i++) {
        const a = Math.PI * 0.6 + rnd() * Math.PI * 0.8
        const r = Rw + 40 + rnd() * 40
        stone.push(part(cone(4 + rnd() * 2, 6 + rnd() * 2, 6), rnd() < 0.5 ? 0xd8ccb0 : 0xb9a888, { x: Math.cos(a) * r, y: 3.5, z: Math.sin(a) * r }))
      }
    }

    const stoneMesh = new THREE.Mesh(merge(stone), stoneMat)
    stoneMesh.castShadow = true
    stoneMesh.receiveShadow = true
    this.roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, vertexColors: true }))
    const roofMesh = new THREE.Mesh(merge(roof), this.roofMat)
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
      const goldMesh = new THREE.Mesh(merge(gold), goldMat)
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

/**
 * A village: cottages around a green with a chapel and a well, fields outside.
 * Once it has a lord, a palisade (tier 1) or a stone wall with towers (tier 2)
 * rings it. A plundered village is a burned shell.
 */
function buildVillage(c: Castle, rnd: () => number, color: string) {
  const ruined = !!c.ruined
  const owned = c.faction !== 'neutral' && !ruined
  const walls: THREE.BufferGeometry[] = []
  const roofs: THREE.BufferGeometry[] = []
  const WALL = ruined ? 0x2e2925 : 0xd2bf94
  const TIMBER = ruined ? 0x1e1a17 : 0x5e4229
  const THATCH = 0xb48a4a
  // Village green and lanes.
  walls.push(part(cyl(30, 33, 0.6, 14), ruined ? 0x3a352e : 0x8a7650, { y: 0.1 }))
  // Fields outside the houses.
  if (!ruined) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4
      walls.push(part(box(18, 0.4, 11), k % 2 ? 0xc9b25a : 0x7f9a3c, { x: Math.cos(a) * 46, y: 0.2, z: Math.sin(a) * 46, ry: -a }))
    }
  }
  // Cottages.
  const houses = 7
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + rnd() * 0.3
    const r = 19 + rnd() * 6
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const w = 6 + rnd() * 2.5
    const d = 4.5 + rnd() * 1.5
    const h = ruined ? 2 + rnd() * 2 : 4.2
    walls.push(part(box(w, h, d), WALL, { x, y: h / 2, z, ry: -a }))
    walls.push(part(box(w + 0.2, 0.5, 0.4), TIMBER, { x, y: h * 0.55, z, ry: -a }))
    if (!ruined) roofs.push(part(cyl(0.01, d * 0.78, w + 0.8, 3), THATCH, { x, y: h + 1.7, z, rz: Math.PI / 2, ry: -a, sy: 1, sx: 0.85 }))
    else walls.push(part(box(1.2, 3 + rnd() * 2, 1.2), 0x1a1715, { x: x + 1.5, y: 2, z }))
  }
  // Chapel with a small tower, and the well.
  walls.push(part(box(9, ruined ? 4 : 7, 6), ruined ? 0x3a3530 : 0xb7ad99, { x: 0, y: ruined ? 2 : 3.5, z: -2 }))
  if (!ruined) {
    roofs.push(part(cyl(0.01, 5, 9.6, 3), 0x6a4a34, { x: 0, y: 8.8, z: -2, rz: Math.PI / 2, sx: 0.9 }))
    walls.push(part(box(3, 12, 3), 0xb7ad99, { x: 4.5, y: 6, z: -2 }))
    roofs.push(part(cone(2.6, 4, 4), 0x6a4a34, { x: 4.5, y: 14, z: -2, ry: Math.PI / 4 }))
  }
  walls.push(part(cyl(1.6, 1.8, 1.4, 8), 0x8f8a80, { x: -6, y: 0.7, z: 6 }))
  if (!ruined) {
    for (const [hx, hz] of [[-12, 9], [12, -10], [9, 12]]) walls.push(part(cone(1.8, 2.6, 6), 0xd4b25a, { x: hx, y: 1.3, z: hz }))
  }
  // Defences once it has a lord.
  if (owned && c.tier >= 2) {
    const n = 16
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2
      const a1 = ((k + 1) / n) * Math.PI * 2
      if (k === 0) continue // gate gap
      const mx = (Math.cos(a0) + Math.cos(a1)) * 18.5
      const mz = (Math.sin(a0) + Math.sin(a1)) * 18.5
      walls.push(part(box(2 * 37 * Math.sin(Math.PI / n) + 0.6, 6, 2), 0xa39d90, { x: mx, y: 3, z: mz, ry: -(a0 + a1) / 2 + Math.PI / 2 }))
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      walls.push(part(cyl(3, 3.4, 9, 8), 0x9a9486, { x: Math.cos(a) * 37, y: 4.5, z: Math.sin(a) * 37 }))
      roofs.push(part(cone(3.8, 4, 8), 0xffffff, { x: Math.cos(a) * 37, y: 11, z: Math.sin(a) * 37 }))
    }
  } else if (owned) {
    for (let k = 0; k < 46; k++) {
      const a = (k / 46) * Math.PI * 2
      if (Math.abs(Math.sin(a)) < 0.1 && Math.cos(a) > 0) continue
      const h = 5 + (k % 3) * 0.4
      walls.push(part(cyl(0.8, 1, h, 5), k % 2 ? 0x6b4a2a : 0x5a3d22, { x: Math.cos(a) * 37, y: h / 2, z: Math.sin(a) * 37 }))
      walls.push(part(cone(0.8, 1.3, 5), 0x4a321c, { x: Math.cos(a) * 37, y: h + 0.6, z: Math.sin(a) * 37 }))
    }
  }
  const group = new THREE.Group()
  const wallMesh = new THREE.Mesh(merge(walls), stoneMat)
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  group.add(wallMesh)
  // Roofs carry the lord's colour (thatch tinted toward it); free villages keep plain thatch.
  const roofMat = applyVision(new THREE.MeshStandardMaterial({ color: owned ? color : '#ffffff', flatShading: true, roughness: 0.85, vertexColors: true }))
  if (roofs.length) {
    const roofMesh = new THREE.Mesh(merge(roofs), roofMat)
    roofMesh.castShadow = true
    group.add(roofMesh)
  }
  const flagGeo = new THREE.PlaneGeometry(6, 3.6, 6, 2)
  flagGeo.translate(3, 0, 0)
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  const flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
  flag.position.set(4.5, 20, -2)
  flag.visible = owned
  if (owned) group.add(new THREE.Mesh(merge([part(cyl(0.25, 0.25, 6, 5), 0x3b3027, { x: 4.5, y: 19 })]), stoneMat))
  group.add(flag)
  return { group, roofMat, flag, flagBase }
}
