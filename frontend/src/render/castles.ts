import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { Castle } from '../game/types'
import { castleRadius, type World } from '../game/world'
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
    this.radius = castleRadius(c.tier)
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
    const R = this.radius * 0.72
    const n = [4, 5, 6, 8][Math.min(3, tier - 1)]
    const wallH = 9 + tier * 2.5
    const stone: THREE.BufferGeometry[] = []
    const roof: THREE.BufferGeometry[] = []

    stone.push(part(cyl(R + 3, R + 6, 2.5, n), 0x8a7a5f, { y: 0.4, ry: Math.PI / n }))

    const corners: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2
      corners.push([Math.cos(a) * R, Math.sin(a) * R])
    }
    for (let k = 0; k < n; k++) {
      const [ax, az] = corners[k]
      const [bx, bz] = corners[(k + 1) % n]
      const len = Math.hypot(bx - ax, bz - az)
      const ang = -Math.atan2(bz - az, bx - ax)
      const mx = (ax + bx) / 2
      const mz = (az + bz) / 2
      const isGate = k === n - 1 // side whose midpoint faces +X
      const segs: [number, number][] = isGate ? [[-len / 2, -7], [7, len / 2]] : [[-len / 2, len / 2]]
      const dx = (bx - ax) / len
      const dz = (bz - az) / len
      for (const [s0, s1] of segs) {
        const sl = s1 - s0
        const sc = (s0 + s1) / 2
        const cx = mx + dx * sc
        const cz = mz + dz * sc
        stone.push(part(box(sl, wallH, 4.2), STONE, { x: cx, y: wallH / 2, z: cz, ry: ang }))
        for (let t = s0 + 1.6; t < s1 - 1; t += 3.4) {
          stone.push(part(box(1.7, 2, 4.8), STONE_DARK, { x: mx + dx * t, y: wallH + 1, z: mz + dz * t, ry: ang }))
        }
      }
      for (let t = 0.15; t < 1; t += 0.2) this.wallRing.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
    const tr = 3.6 + tier * 0.8
    const th = wallH + 6 + tier
    for (const [x, z] of corners) {
      stone.push(part(cyl(tr, tr + 0.6, th, 8), STONE, { x, y: th / 2, z }))
      stone.push(part(cyl(tr + 0.9, tr + 0.9, 1.6, 8), STONE_DARK, { x, y: th + 0.8, z }))
      roof.push(part(cone(tr + 1.3, 7 + tier, 8), 0xffffff, { x, y: th + 1.6 + (7 + tier) / 2, z }))
    }
    // Gatehouse on +X.
    const gx = R * Math.cos(Math.PI / n)
    const gh = wallH + 5
    stone.push(part(box(9, gh, 18), STONE, { x: gx, y: gh / 2 }))
    stone.push(part(box(9.6, 2, 19), STONE_DARK, { x: gx, y: gh + 1 }))
    stone.push(part(box(9.4, 8, 7.5), DARK, { x: gx + 0.2, y: 4 }))
    for (const s of [-1, 1]) {
      stone.push(part(cyl(3.6, 4, gh + 4, 8), STONE, { x: gx + 1, y: (gh + 4) / 2, z: s * 10 }))
      roof.push(part(cone(4.6, 6, 8), 0xffffff, { x: gx + 1, y: gh + 7, z: s * 10 }))
    }

    // Keep.
    const k = 13 + tier * 3.5
    const kh = (16 + tier * 6.5) * (grand >= 2 ? 1.18 : 1) * (grand >= 5 ? 1.12 : 1)
    const kx = -R * 0.12
    stone.push(part(box(k, kh, k), KEEP, { x: kx, y: kh / 2 }))
    stone.push(part(box(k + 1.6, 1.6, k + 1.6), STONE_DARK, { x: kx, y: kh + 0.8 }))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const cx = kx + Math.cos(a) * k * 0.62
      const cz = Math.sin(a) * k * 0.62
      stone.push(part(cyl(2.4, 2.4, kh + 6, 8), KEEP, { x: cx, y: (kh + 6) / 2, z: cz }))
      roof.push(part(cone(3.2, 6, 8), 0xffffff, { x: cx, y: kh + 9, z: cz }))
    }
    roof.push(part(cone(k * 0.62, 11 + tier, 4), 0xffffff, { x: kx, y: kh + 1.6 + (11 + tier) / 2, ry: Math.PI / 4 }))
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        stone.push(part(box(0.6, 2.6, 1.4), DARK, { x: kx + s * (k / 2 + 0.05), y: kh * (0.35 + i * 0.22), z: (i - 1) * 3.5 }))
        stone.push(part(box(1.4, 2.6, 0.6), DARK, { x: kx + (i - 1) * 3.5, y: kh * (0.35 + i * 0.22), z: s * (k / 2 + 0.05) }))
      }
    }
    if (tier >= 3) {
      const ix = -R * 0.45
      const iz = R * 0.35
      const ih = kh * 0.8
      stone.push(part(cyl(4.5, 5, ih, 8), KEEP, { x: ix, y: ih / 2, z: iz }))
      roof.push(part(cone(5.6, 9, 8), 0xffffff, { x: ix, y: ih + 4.5, z: iz }))
    }

    // Houses in the bailey.
    const houses = 3 + tier * 2
    for (let i = 0; i < houses; i++) {
      const a = rnd() * Math.PI * 2
      const r = k * 0.75 + rnd() * (R - k * 0.75 - 8)
      const hx = Math.cos(a) * r + kx * 0.5
      const hz = Math.sin(a) * r
      if (hx > R * 0.55 && Math.abs(hz) < 12) continue // keep the gate road clear
      const w = 4 + rnd() * 3
      const d = 6 + rnd() * 3
      const h = 3.5 + rnd() * 2
      const ry = rnd() * Math.PI
      stone.push(part(box(w, h, d), 0xcdbfa0, { x: hx, y: h / 2, z: hz, ry }))
      stone.push(part(cyl(w * 0.62, w * 0.62, d + 0.6, 3), ROOF_HOUSE, { x: hx, y: h + w * 0.28, z: hz, rx: Math.PI / 2, ry, rz: Math.PI / 2 }))
    }

    // Staging grounds have a tent city outside the walls.
    if (c.staging) {
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 0.5 + rnd() * Math.PI
        const r = R + 18 + rnd() * 30
        stone.push(part(cone(4 + rnd() * 2, 6 + rnd() * 2, 6), rnd() < 0.5 ? 0xd8ccb0 : 0xb9a888, { x: Math.cos(a) * r, y: 3.5, z: Math.sin(a) * r }))
      }
      for (let i = 0; i < 24; i++) {
        const a = Math.PI * 0.45 + (i / 24) * Math.PI * 1.1
        const r = R + 55
        stone.push(part(cyl(0.7, 0.7, 6, 5), WOOD, { x: Math.cos(a) * r, y: 3, z: Math.sin(a) * r, rz: 0.15 }))
      }
    }

    // --- Splendour: a well-manned castle grows grander (faction colours stay). ---
    const gold: THREE.BufferGeometry[] = []
    const GOLD = 0xffffff
    if (grand >= 1) {
      // Pennants on every corner tower and gilded finials.
      for (const [x, z] of corners) {
        const top = th + 1.6 + (7 + tier) + 0.5
        gold.push(part(cone(0.5, 2.2, 6), GOLD, { x, y: top + 1, z }))
        roof.push(part(box(0.18, 2.4, 4), 0xffffff, { x, y: top + 1.2, z: z + 2.1 }))
      }
    }
    if (grand >= 2) {
      // Gilded bands under the tower roofs.
      for (const [x, z] of corners) gold.push(part(cyl(tr + 1.05, tr + 1.05, 0.7, 8), GOLD, { x, y: th + 1.9, z }))
    }
    if (grand >= 3) {
      // Extra turrets around the keep and a gilded crown on it.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const cx = kx + Math.cos(a) * (k * 0.75)
        const cz = Math.sin(a) * (k * 0.75)
        stone.push(part(cyl(1.8, 2, kh * 0.6, 8), KEEP, { x: cx, y: kh * 0.3, z: cz }))
        roof.push(part(cone(2.4, 5, 8), 0xffffff, { x: cx, y: kh * 0.6 + 2.5, z: cz }))
      }
      gold.push(part(box(k + 2, 0.8, k + 2), GOLD, { x: kx, y: kh + 1.9 }))
    }
    if (grand >= 4) {
      // An outer curtain of low walls and squat towers.
      const R2 = R + 15
      const n2 = n * 2
      for (let i = 0; i < n2; i++) {
        const a0 = (i / n2) * Math.PI * 2
        const a1 = ((i + 1) / n2) * Math.PI * 2
        const mx = (Math.cos(a0) + Math.cos(a1)) / 2
        const mz = (Math.sin(a0) + Math.sin(a1)) / 2
        if (mx > 0.85 && Math.abs(mz) < 0.3) continue // gate side
        const len = 2 * R2 * Math.sin(Math.PI / n2)
        stone.push(part(box(len + 0.5, 6, 3), STONE_DARK, { x: mx * R2, y: 3, z: mz * R2, ry: -Math.atan2(mz, mx) + Math.PI / 2 }))
        if (i % 2 === 0) {
          stone.push(part(cyl(2.6, 3, 9, 8), STONE, { x: Math.cos(a0) * R2, y: 4.5, z: Math.sin(a0) * R2 }))
          roof.push(part(cone(3.4, 4, 8), 0xffffff, { x: Math.cos(a0) * R2, y: 11, z: Math.sin(a0) * R2 }))
        }
      }
      // Great banners flanking the gate.
      for (const s of [-1, 1]) roof.push(part(box(0.3, 7, 4), 0xffffff, { x: gx + 5.4, y: gh - 2, z: s * 6 }))
    }
    if (grand >= 5) {
      // A golden spire crowns the keep.
      gold.push(part(cone(2.2, 16, 8), GOLD, { x: kx, y: kh + 1.6 + (11 + tier) + 8 }))
      gold.push(part(sphere(1.4), GOLD, { x: kx, y: kh + 1.6 + (11 + tier) + 17 }))
    }

    const stoneMesh = new THREE.Mesh(merge(stone), stoneMat)
    stoneMesh.castShadow = true
    stoneMesh.receiveShadow = true
    this.roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, vertexColors: true }))
    const roofMesh = new THREE.Mesh(merge(roof), this.roofMat)
    roofMesh.castShadow = true

    // Banner above the keep.
    const poleTop = kh + 12 + tier * 2 + 12
    const pole = new THREE.Mesh(merge([part(cyl(0.35, 0.35, 14, 6), 0x3b3027, { x: kx, y: poleTop - 7 })]), stoneMat)
    const flagGeo = new THREE.PlaneGeometry(10, 6, 8, 2)
    flagGeo.translate(5, 0, 0)
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
    this.flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
    this.flag.position.set(kx, poleTop - 3, 0)
    this.flag.castShadow = true

    const inner = new THREE.Group()
    inner.add(stoneMesh, roofMesh, pole, this.flag)
    if (gold.length) {
      const goldMesh = new THREE.Mesh(merge(gold), goldMat)
      goldMesh.castShadow = true
      inner.add(goldMesh)
    }
    inner.rotation.y = -Math.atan2(-c.z, -c.x) // gate faces the map centre
    this.group.add(inner)
    this.height = world.heightAt(c.x, c.z)
    this.group.position.set(c.x, this.height, c.z)
    this.group.updateMatrixWorld(true)
    // Convert wall points to world space.
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
