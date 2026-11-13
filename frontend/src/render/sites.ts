import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import { Frame, PAL, barrel, cart, crate, gable, house, newKit, wheel, woodpile, type Kit } from './buildings'
import { bmerge, box, cone, cyl, groundShade } from './geo'
import { applyVision } from './vision'
import { makeBanner, recolorBanner, waveFlag, type StandardFlag } from './standards'

const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), '', false, false, true)
const O = new Frame(0, 0, 0)
const done = (k: Kit) => groundShade(bmerge([...k.walls, ...k.roofs, ...k.accents, ...k.glow]), 3, 0.22)

/** A mine: a timbered adit in a rock face, a headframe with its wheel, rails with sleepers, an ore cart, a smelting hut glowing at the mouth, spoil heaps. */
function mineGeometry() {
  const k = newKit()
  O.put(k.walls, cyl(26, 30, 6, 20), 0x7a6e5e, 0, -2.6, 0, { ao: 0 })
  // The rock face: a jumble of boulders.
  const rocks: [number, number, number, number][] = [[-6, -6, 9, 0x8b8478], [4, -9, 7, 0x7a7368], [-14, -2, 6, 0x857e72], [11, -4, 5, 0x908a7e], [-2, -13, 8, 0x80796d]]
  for (const [x, z, r, c] of rocks) O.put(k.walls, new THREE.DodecahedronGeometry(r, 0), c, x, r * 0.55, z, { sy: 0.9, ry: x, jitter: 0.12 })
  // The adit: dark mouth in a timber frame with braces and a lintel.
  const a = new Frame(-3, 1.5, 0)
  a.put(k.walls, box(6.4, 6.6, 3), 0x1d1a17, 0, 3.3, 0, { ao: 0 })
  for (const s of [-1, 1]) {
    a.put(k.walls, box(1, 7.6, 1), PAL.timberL, s * 3.6, 3.8, 1.4)
    a.put(k.walls, box(0.5, 3, 0.5), PAL.timber, s * 2.6, 6.2, 1.5, { rz: s * 0.8 })
  }
  a.put(k.walls, box(9.4, 1.1, 1.3), PAL.timberL, 0, 7.6, 1.4)
  a.put(k.walls, box(10, 0.4, 3), PAL.timber, 0, 8.4, 0.4)
  // Rails on sleepers out to the spoil heap; an ore cart with wheels.
  for (let z = 3; z < 22; z += 1.4) a.put(k.walls, box(3.6, 0.3, 0.6), 0x4a3520, 0, 0.2, z, { ao: 0 })
  for (const s of [-1, 1]) a.put(k.walls, box(0.25, 0.3, 19), PAL.iron, s * 1.2, 0.45, 12.5, { ao: 0 })
  a.put(k.walls, box(3, 2, 4), 0x5e4126, 0, 1.9, 13)
  a.put(k.walls, new THREE.DodecahedronGeometry(1.3, 0), 0x5b5f66, 0, 3.1, 13)
  a.put(k.walls, new THREE.DodecahedronGeometry(0.8, 0), 0x9a7b3c, 0.7, 3.2, 12.2)
  for (const s of [-1, 1]) for (const z of [11.6, 14.4]) wheel(k, a.sub(s * 1.6, z, Math.PI / 2), 0, 0.8, 0, 0.7)
  // Headframe: an A-frame of timbers carrying a winding wheel over a shaft.
  const h = new Frame(9, 6, 0.4)
  h.put(k.walls, box(5, 0.8, 5), PAL.timber, 0, 0.4, 0)
  h.put(k.walls, box(3.2, 0.5, 3.2), 0x1d1a17, 0, 0.85, 0, { ao: 0 })
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) h.put(k.walls, box(0.6, 12, 0.6), PAL.timberL, dx * 1.6, 6, dz * 1.6, { rx: -dz * 0.12, rz: dx * 0.12 })
  h.put(k.walls, box(0.6, 0.6, 3), PAL.timber, 0, 11.8, 0)
  h.put(k.walls, new THREE.TorusGeometry(1.8, 0.2, 4, 14), 0x3b2a18, 0, 12.6, 0, { ao: 0 })
  for (let i = 0; i < 3; i++) h.put(k.walls, box(0.15, 3.6, 0.15), 0x4a3420, 0, 12.6, 0, { rz: (i / 3) * Math.PI, ry: Math.PI / 2, ao: 0 })
  h.put(k.walls, box(0.06, 11, 0.06), 0xb8ab8a, 0, 7, 1.8, { ao: 0 })
  // Smelting hut: stone walls, a furnace chimney, a glow in its mouth, a stack of charcoal.
  const sm = new Frame(-12, 12, 0.6)
  sm.put(k.walls, box(7, 4, 6), PAL.stone, 0, 2, 0)
  sm.put(k.roofs, gable(7.4, 7.8, 2.6), PAL.shingle[0], 0, 4, 0)
  sm.put(k.walls, box(1.6, 8, 1.6), PAL.stoneD, 2.2, 5, -1.6)
  sm.put(k.walls, box(2.2, 1.6, 0.3), 0x1d1a17, -1, 1, 3.05, { ao: 0 })
  sm.put(k.glow, box(1.6, 1, 0.3), 0xff8a3a, -1, 0.9, 3.15)
  sm.put(k.walls, cone(2.2, 1.8, 7), 0x2a2622, -5, 0.9, 2, { jitter: 0.15 })
  // Spoil heaps and a pile of ore.
  O.put(k.walls, cone(5, 3, 7), 0x6f6a62, 10, 1.5, 16, { jitter: 0.12 })
  O.put(k.walls, cone(3.5, 2.4, 6), 0x9a7b3c, 15, 1.2, 9, { jitter: 0.15 })
  crate(k, O, 4, 0, 18, 1.4)
  barrel(k, O, 6, 19)
  return done(k)
}

/** A lumber camp: stumps, a felled trunk, stacked logs with pale cut ends, a sawpit with a log on trestles, a woodcutter's hut, a cart. */
function lumberGeometry() {
  const k = newKit()
  O.put(k.walls, cyl(20, 24, 6, 18), 0x6e5f44, 0, -2.6, 0, { ao: 0 })
  for (let i = 0; i < 8; i++) {
    const a = i * 0.9
    const x = Math.cos(a) * (11 + i)
    const z = Math.sin(a) * (11 + i)
    O.put(k.walls, cyl(1.2, 1.5, 1.2, 8), 0x6a4a2c, x, 0.6, z)
    O.put(k.walls, cyl(1.15, 1.15, 0.1, 8), 0xc8a874, x, 1.22, z, { ao: 0 })
  }
  // An axe left in a stump.
  O.put(k.walls, box(0.15, 1.6, 0.15), PAL.timberL, 11.8, 2, 0.6, { rz: 0.5, ao: 0 })
  O.put(k.walls, box(0.6, 0.5, 0.1), 0x9a9a98, 12.3, 2.7, 0.6, { rz: 0.5, ao: 0 })
  // A felled trunk with its branches.
  O.put(k.walls, cyl(0.9, 1.3, 16, 8), 0x7a5532, -2, 1.1, 14, { rz: Math.PI / 2, ry: 0.3 })
  for (let i = 0; i < 4; i++) O.put(k.walls, cyl(0.2, 0.35, 4, 5), 0x6a4a2c, -6 + i * 3, 2.4, 14 + (i % 2 ? 1.6 : -1.6), { rz: 0.9 * (i % 2 ? 1 : -1), ry: 0.3, ao: 0 })
  // Log stacks with pale ends, held by stakes.
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 5 - row; i++) {
      const x = 3 + i * 2.2 + row * 1.1
      O.put(k.walls, cyl(1.1, 1.1, 12, 8), 0x8a6238, x, 1.1 + row * 1.9, -4, { rx: Math.PI / 2, jitter: 0.1 })
      O.put(k.walls, cyl(1.0, 1.0, 12.1, 8), 0xc8a874, x, 1.1 + row * 1.9, -4, { rx: Math.PI / 2, sy: 1, ao: 0, sx: 0.98, sz: 0.98 })
    }
  for (const x of [1.4, 14.4]) O.put(k.walls, box(0.4, 8.6, 0.4), PAL.timber, x, 4, -4)
  // Sawpit: two trestles, a squared log, the long saw.
  const sp = new Frame(4, 8, 0)
  for (const x of [-3, 3]) {
    sp.put(k.walls, box(0.4, 3, 2.6), PAL.timber, x, 1.5, 0)
    sp.put(k.walls, box(0.4, 0.4, 3), PAL.timber, x, 3, 0)
  }
  sp.put(k.walls, box(10, 1.2, 1.2), 0xa07a48, 0, 3.8, 0)
  sp.put(k.walls, box(0.1, 4.6, 0.6), 0x9a9a98, 1, 3.6, 0, { ao: 0 })
  for (let i = 0; i < 6; i++) sp.put(k.walls, box(0.2, 0.2, 0.2), 0xd8bc8a, -2 + i * 0.7, 0.1, 0.8 + (i % 2) * 0.6, { ao: 0 })
  // Woodcutter's hut with a turf-green roof, a chopping block, a cart.
  house(k, new Frame(-10, -6, 0.3), { w: 7, d: 5.5, storeys: 1, roof: 'shingle', style: 'timber' }, () => 0.37)
  woodpile(k, new Frame(-16, -2, 1.9))
  cart(k, new Frame(14, 6, 1.2), 'empty', () => 0.5)
  O.put(k.walls, cone(3, 3.6, 5), 0x2f5d34, -14, 1.8, 10, { jitter: 0.12 })
  return done(k)
}

/** Mines and lumber camps, with a little flag in the colours of whoever works them. */
export class SiteRenderer {
  readonly group = new THREE.Group()
  private views = new Map<string, { group: THREE.Group; flag: StandardFlag; color: string }>()
  private geos = { mine: mineGeometry(), lumber: lumberGeometry() }
  private engine: GameEngine
  constructor(engine: GameEngine) {
    this.engine = engine
  }
  update(time: number) {
    const world = this.engine.world
    for (const s of this.engine.state.sites ?? []) {
      let v = this.views.get(s.id)
      if (!v) {
        const group = new THREE.Group()
        const m = new THREE.Mesh(this.geos[s.kind], mat)
        m.castShadow = true
        m.receiveShadow = true
        // A small swallowtail on a crossbar pole, in the colours of whoever works the site.
        const banner = makeBanner({ color: '#8a7a5a', finial: s.kind === 'mine' ? 'shield' : 'spear', scale: 0.5, seed: s.id.length })
        banner.group.position.set(6, 0, 4)
        group.add(m, banner.group)
        const flag = banner.flag
        group.position.set(s.x, world.heightAt(s.x, s.z) - 0.3, s.z)
        group.rotation.y = (s.x * 3 + s.z * 7) % 6.28
        this.group.add(group)
        v = { group, flag, color: '' }
        this.views.set(s.id, v)
      }
      const w = this.engine.army(s.workerId)
      v.flag.mesh.visible = !!w
      if (w) {
        const color = this.engine.factionColor(w.faction)
        if (color !== v.color) {
          v.color = color
          recolorBanner(v.flag, color)
        }
        waveFlag(v.flag, time, 0.8)
      }
    }
  }
}
