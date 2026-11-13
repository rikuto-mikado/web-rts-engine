import * as THREE from 'three'
import { mulberry32 } from '../game/noise'
import type { Castle } from '../game/types'
import { GATE_HALF, ROYAL_SEAT_TIER, holdingRadius, villageRadius, wallRadius, type World } from '../game/world'
import { bmerge, cyl, groundShade, merge, part } from './geo'
import { applyVision } from './vision'
import { buildVillage } from './villages'
import { buildRoyalCitadel, buildWard } from './citadel'
import { buildFortress, sailsGeometry, type FortStyle } from './fortress'


const stoneMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }), '', false, false, true)
const glowMat = applyVision(new THREE.MeshBasicMaterial({ vertexColors: true }))
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

  /** The realm's way of building (a change of owner across the lines rebuilds the castle). */
  style: FortStyle = 'crown'
  private sails: THREE.Mesh[] = []
  /** Chimneys and forges that smoke (world positions). */
  readonly smoke: [number, number, number][] = []

  constructor(c: Castle, world: World, color: string, grand = 0, style: FortStyle = 'crown') {
    this.grand = grand
    this.style = style
    this.id = c.id
    this.color = color
    this.tier = c.tier
    this.radius = holdingRadius(c)
    const rnd = mulberry32(c.id.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7))
    this.owned = c.faction !== 'neutral'
    this.ruined = !!c.ruined
    // The Sovereign's Citadel crowning a royal city (The Long Night): built to its own design.
    if (c.capital && c.tier >= ROYAL_SEAT_TIER && world.townAt(c.x, c.z)?.poly) {
      const v = buildRoyalCitadel(c, rnd, color, wallRadius(c.tier), GATE_HALF, world)
      for (const [x, y, z] of v.smoke) this.smoke.push([c.x + x, world.heightAt(c.x, c.z) + y, c.z + z])
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
      const town = world.townAt(c.x, c.z) ?? world.towns[0]
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
      if (!c.ruined)
        for (const [x, y, z] of v.smoke) {
          p.set(x, y, z).applyMatrix4(inner.matrixWorld)
          this.smoke.push([p.x, p.y, p.z])
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
    // A lord's castle: built to its site, its size and the realm that holds it (see fortress.ts).
    const shape = world.walls.get(c.id)!
    const f = buildFortress(c, world, shape, style, grand, rnd)
    const stoneMesh = new THREE.Mesh(groundShade(bmerge(f.stone), 4, 0.22), stoneMat)
    stoneMesh.castShadow = true
    stoneMesh.receiveShadow = true
    // Paving, fields, fences, props and fine work: lit and shaded, but no shadow of their own.
    const flatMesh = f.flat.length ? new THREE.Mesh(groundShade(bmerge(f.flat), 2, 0.15), stoneMat) : null
    if (flatMesh) {
      flatMesh.castShadow = false
      flatMesh.receiveShadow = true
    }
    this.roofMat = applyVision(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, vertexColors: true }))
    const inner = new THREE.Group()
    inner.add(stoneMesh)
    if (flatMesh) inner.add(flatMesh)
    if (f.roof.length) {
      const roofMesh = new THREE.Mesh(bmerge(f.roof), this.roofMat)
      roofMesh.castShadow = true
      inner.add(roofMesh)
    }
    if (f.gold.length) {
      const goldMesh = new THREE.Mesh(bmerge(f.gold), goldMat)
      goldMesh.castShadow = true
      inner.add(goldMesh)
    }
    if (f.glow.length) inner.add(new THREE.Mesh(bmerge(f.glow), glowMat))
    // The great banner above the keep.
    const [kx, kz] = f.keepAt
    const poleTop = f.keepTop + 14
    const pole = new THREE.Mesh(merge([part(cyl(0.4, 0.4, 16, 6), 0x3b3027, { x: kx, y: poleTop - 8, z: kz })]), stoneMat)
    const flagGeo = new THREE.PlaneGeometry(13, 8, 8, 2)
    flagGeo.translate(6.5, 0, 0)
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
    this.flag = new THREE.Mesh(flagGeo, applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })))
    this.flag.position.set(kx, poleTop - 4, kz)
    this.flag.castShadow = true
    inner.add(pole, this.flag)
    // A ruin flies no banner.
    pole.visible = this.flag.visible = !c.ruined
    // Windmill sails: four lattice sails on a hub, turned in animate().
    for (const m of f.mills) {
      const hub = new THREE.Group()
      hub.position.set(m.x, m.y, m.z)
      hub.rotation.y = m.ry
      const sails = [sailsGeometry(m.r)]
      const sail = new THREE.Mesh(merge(sails), stoneMat)
      sail.castShadow = true
      hub.add(sail)
      inner.add(hub)
      this.sails.push(sail)
    }
    this.group.add(inner)
    this.height = world.heightAt(c.x, c.z)
    this.group.position.set(c.x, this.height, c.z)
    for (const [x, z] of f.ring) this.wallRing.push([c.x + x, c.z + z])
    if (!c.ruined) for (const [x, y, z] of f.smoke) this.smoke.push([c.x + x, this.height + y, c.z + z])
    this.wallHeight = f.wallH
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
    for (const s of this.sails) s.rotation.z = -t * 0.6
  }
}
