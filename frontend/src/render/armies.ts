import * as THREE from 'three'
import type { GameEngine } from '../game/engine'
import { mulberry32 } from '../game/noise'
import type { Army, FormationKey } from '../game/types'
import { figureGeometries, figuresFor, type FigureKind } from './figures'
import { box, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const KINDS: FigureKind[] = ['spearmen', 'men_at_arms', 'archers', 'light_cavalry', 'knights', 'siege', 'engineer']
const CAPACITY = 16000
const MAX_FIGURES = 300

interface Slot {
  kind: FigureKind
  lx: number // lateral offset (right +)
  lz: number // forward offset
  phase: number
}

/** Per-army render state: smoothed position and cached formation. */
export interface ArmyVisual {
  id: string
  x: number
  z: number
  heading: number
  slots: Slot[]
  layoutKey: string
  radius: number
  banner: THREE.Group
  flag: THREE.Mesh
  seen: boolean
  alive: boolean
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

export class ArmyRenderer {
  readonly group = new THREE.Group()
  private tinted = new Map<FigureKind, THREE.InstancedMesh>()
  private plain = new Map<FigureKind, THREE.InstancedMesh>()
  private scales = new Map<FigureKind, number>()
  private counts = new Map<FigureKind, number>()
  readonly visuals = new Map<string, ArmyVisual>()
  /** Level of detail: 1 = full ranks, lower values thin them out when the camera is far away. */
  density = 1
  private engine: GameEngine
  private bannerPole: THREE.BufferGeometry
  private bannerMat: THREE.Material
  private flagGeo: THREE.PlaneGeometry
  private tints = new Map<string, THREE.Color>()
  private tint(faction: string): THREE.Color {
    let c = this.tints.get(faction)
    if (!c) {
      c = new THREE.Color(this.engine.factionColor(faction)).multiplyScalar(1.15)
      this.tints.set(faction, c)
    }
    return c
  }

  constructor(engine: GameEngine) {
    this.engine = engine
    const mat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05 }))
    for (const kind of KINDS) {
      const g = figureGeometries(kind)
      const t = new THREE.InstancedMesh(g.tinted, mat, CAPACITY)
      const p = new THREE.InstancedMesh(g.plain, mat, CAPACITY)
      t.setColorAt(0, new THREE.Color(1, 1, 1))
      for (const m of [t, p]) {
        m.count = 0
        m.castShadow = true
        m.frustumCulled = false
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.group.add(m)
      }
      this.tinted.set(kind, t)
      this.plain.set(kind, p)
      this.scales.set(kind, g.scale)
    }
    this.bannerPole = merge([part(cyl(0.3, 0.3, 18, 5), 0x3b2f25, { y: 9 }), part(box(0.6, 0.6, 0.6), 0xd4af37, { y: 18.3 })])
    this.bannerMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }))
    this.flagGeo = new THREE.PlaneGeometry(7, 4.5, 6, 1)
    this.flagGeo.translate(3.5, 0, 0)
  }

  private layoutKey(army: Army): { key: string; counts: Map<FigureKind, number> } {
    const counts = new Map<FigureKind, number>()
    let figures = 0
    for (const u of this.engine.unitList) {
      const n = army.troops[u.key] ?? 0
      if (n < 1) continue
      const f = Math.max(1, Math.round((n / 5) * this.density))
      for (const [kind, c] of figuresFor(u.key, u.category, f)) {
        counts.set(kind, (counts.get(kind) ?? 0) + c)
        figures += c
      }
    }
    const cap = Math.round(MAX_FIGURES * this.density)
    if (figures > cap) {
      const s = cap / figures
      for (const [k, v] of counts) counts.set(k, Math.max(1, Math.round(v * s)))
    }
    const shape = this.shapeOf(army)
    return { key: `${shape}|${KINDS.map((k) => counts.get(k) ?? 0).join(',')}`, counts }
  }

  /** Visual arrangement: marching columns, or the army's chosen battle formation. */
  private shapeOf(army: Army): 'column' | FormationKey {
    const moving = army.status === 'marching' || army.status === 'retreating'
    if (moving && army.column) return 'column'
    return army.formation
  }

  private layout(army: Army, counts: Map<FigureKind, number>): { slots: Slot[]; radius: number } {
    const shape = this.shapeOf(army)
    const rnd = mulberry32(army.id.length * 977 + army.id.charCodeAt(army.id.length - 1))
    const slots: Slot[] = []
    const take = (k: FigureKind) => Array(counts.get(k) ?? 0).fill(k) as FigureKind[]
    const foot = [...take('spearmen'), ...take('men_at_arms'), ...take('archers'), ...take('engineer')]
    const cav = [...take('knights'), ...take('light_cavalry')]
    const siege = counts.get('siege') ?? 0
    const jitter = shape === 'loose' ? 1.8 : 0.8
    const push = (kind: FigureKind, lx: number, lz: number) => slots.push({ kind, lx: lx + (rnd() - 0.5) * jitter, lz: lz + (rnd() - 0.5) * jitter, phase: rnd() * 6.28 })

    if (shape === 'column') {
      // Narrow column: cavalry vanguard, infantry, then the baggage of siege engines.
      const all = [...cav, ...foot]
      const ccols = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(all.length / 6))))
      let z = 0
      all.forEach((kind, i) => {
        const cav = kind === 'knights' || kind === 'light_cavalry'
        if (i > 0 && i % ccols === 0) z -= cav ? 5.6 : 3.2
        push(kind, ((i % ccols) - (ccols - 1) / 2) * 2.8, z)
      })
      const tail = z - 9
      for (let i = 0; i < siege; i++) push('siege', 0, tail - i * 11)
    } else if (shape === 'wedge') {
      // Spearhead: heavy units at the tip, rows widening behind.
      const all = [...cav, ...take('men_at_arms'), ...take('spearmen'), ...take('archers'), ...take('engineer')]
      let row = 0
      let i = 0
      while (i < all.length) {
        const width = row * 2 + 1
        const cav = all[i] === 'knights' || all[i] === 'light_cavalry'
        for (let c = 0; c < width && i < all.length; c++, i++) push(all[i], (c - (width - 1) / 2) * (cav ? 3.4 : 2.8), -row * (cav ? 4.6 : 3.2))
        row++
      }
      for (let k = 0; k < siege; k++) push('siege', (k - (siege - 1) / 2) * 9, -row * 3.6 - 9)
    } else if (shape === 'square') {
      // Schiltron: spears on the perimeter, everyone else inside.
      const outer = [...take('spearmen'), ...take('men_at_arms')]
      const inner = [...take('archers'), ...take('engineer'), ...cav]
      const ring = Math.max(8, outer.length)
      const side = Math.ceil(ring / 4) + 1
      const sp = 2.8
      const half = ((side - 1) * sp) / 2
      outer.forEach((kind, i) => {
        const t = i / ring
        const edge = Math.floor(t * 4)
        const u = (t * 4 - edge) * (side - 1) * sp - half
        const [lx, lz] = edge === 0 ? [u, half] : edge === 1 ? [half, -u] : edge === 2 ? [-u, -half] : [-half, u]
        push(kind, lx, lz)
      })
      const icols = Math.max(1, Math.ceil(Math.sqrt(inner.length)))
      inner.forEach((kind, i) => push(kind, ((i % icols) - (icols - 1) / 2) * 2.8, (Math.floor(i / icols) - (Math.ceil(inner.length / icols) - 1) / 2) * 2.8))
      for (let k = 0; k < siege; k++) push('siege', (k - (siege - 1) / 2) * 9, -half - 10)
    } else {
      // Line (and loose skirmish order, which is the same shape spread out).
      const spread = shape === 'loose' ? 1.8 : 1
      const cols = Math.max(4, Math.min(30, Math.ceil(Math.sqrt(foot.length * 3.2))))
      const sx = 2.7 * spread
      const sz = 3.0 * spread
      foot.forEach((kind, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        const inRow = Math.min(cols, foot.length - row * cols)
        push(kind, (col - (inRow - 1) / 2) * sx, -row * sz)
      })
      const rows = Math.ceil(foot.length / cols)
      const halfW = (Math.min(cols, foot.length) * sx) / 2
      // Cavalry on both wings, in compact squadrons.
      const wcols = Math.max(2, Math.ceil(Math.sqrt(cav.length / 2 / 1.5)))
      cav.forEach((kind, i) => {
        const side = i % 2 === 0 ? 1 : -1
        const k = Math.floor(i / 2)
        push(kind, side * (halfW + 3.5 * spread + (k % wcols) * 3.3 * spread), -Math.floor(k / wcols) * 5.4 * spread + 2)
      })
      for (let k = 0; k < siege; k++) push('siege', (k - (siege - 1) / 2) * 9, -rows * sz - 9)
    }
    let minZ = Infinity
    let maxZ = -Infinity
    for (const s of slots) {
      minZ = Math.min(minZ, s.lz)
      maxZ = Math.max(maxZ, s.lz)
    }
    const mid = (minZ + maxZ) / 2
    let maxR = 8
    for (const s of slots) {
      s.lz -= mid
      maxR = Math.max(maxR, Math.hypot(s.lx, s.lz))
    }
    return { slots, radius: maxR + 6 }
  }

  private ensureVisual(army: Army): ArmyVisual {
    let v = this.visuals.get(army.id)
    if (!v) {
      const banner = new THREE.Group()
      banner.add(new THREE.Mesh(this.bannerPole, this.bannerMat))
      const cmd = this.engine.commanderOf(army)
      const color = cmd?.banner_color ?? this.engine.factionColor(army.faction)
      const flag = new THREE.Mesh(
        this.flagGeo.clone(),
        applyVision(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 })),
      )
      flag.position.y = 15.5
      flag.castShadow = true
      banner.add(flag)
      this.group.add(banner)
      v = { id: army.id, x: army.x, z: army.z, heading: army.heading, slots: [], layoutKey: '', radius: 10, banner, flag, seen: false, alive: true }
      this.visuals.set(army.id, v)
    }
    return v
  }

  update(dt: number, time: number) {
    const engine = this.engine
    const world = engine.world
    for (const k of KINDS) this.counts.set(k, 0)
    for (const v of this.visuals.values()) v.alive = false
    const smooth = 1 - Math.exp(-dt * 10)

    for (const army of engine.state.armies) {
      const v = this.ensureVisual(army)
      v.alive = true
      let visible = army.faction === 'player' || engine.isVisible(army.x, army.z)
      if (visible && engine.relation(army.faction) === 'enemy' && engine.isHidden(army)) {
        // Lying in ambush: only seen by troops right on top of it.
        visible = engine.state.armies.some((p) => p.faction === 'player' && Math.abs(p.x - army.x) < 90 && Math.abs(p.z - army.z) < 90)
      }
      v.seen = visible
      v.banner.visible = visible
      // Snap if the gap is large (e.g. first frame, after load).
      if (Math.hypot(army.x - v.x, army.z - v.z) > 120) {
        v.x = army.x
        v.z = army.z
      }
      v.x += (army.x - v.x) * smooth
      v.z += (army.z - v.z) * smooth
      let dh = army.heading - v.heading
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      v.heading += dh * (1 - Math.exp(-dt * 5))
      if (!visible) continue

      const lk = this.layoutKey(army)
      if (lk.key !== v.layoutKey) {
        const lay = this.layout(army, lk.counts)
        v.slots = lay.slots
        v.layoutKey = lk.key
        v.radius = lay.radius
      }
      const fx = Math.cos(v.heading)
      const fz = Math.sin(v.heading)
      const rx = -fz
      const rz = fx
      const moving = army.status === 'marching' || army.status === 'retreating'
      const fighting = army.status === 'battle' || army.status === 'sieging'
      const routing = army.status === 'retreating'
      const tint = this.tint(army.faction)
      // Model faces +Z; rotate so +Z aligns with heading.
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - v.heading)

      for (const s of v.slots) {
        let lx = s.lx
        let lz = s.lz
        if (routing && army.formation !== 'loose') {
          lx *= 1.5 + Math.sin(s.phase) * 0.3
          lz *= 1.6
        }
        let bob = 0
        if (moving) bob = Math.abs(Math.sin(time * (s.kind === 'light_cavalry' || s.kind === 'knights' ? 9 : 7) + s.phase)) * 0.5
        if (fighting && s.kind !== 'siege') {
          lz += Math.sin(time * 5 + s.phase * 3) * 1.1
          lx += Math.sin(time * 3.3 + s.phase * 5) * 0.5
        }
        const wx = v.x + fx * lz + rx * lx
        const wz = v.z + fz * lz + rz * lx
        tmpP.set(wx, world.surfaceAt(wx, wz) + bob, wz)
        const sc = this.scales.get(s.kind)!
        tmpS.set(sc, sc, sc)
        tmpM.compose(tmpP, tmpQ, tmpS)
        const idx = this.counts.get(s.kind)!
        if (idx >= CAPACITY) continue
        this.counts.set(s.kind, idx + 1)
        this.tinted.get(s.kind)!.setMatrixAt(idx, tmpM)
        this.tinted.get(s.kind)!.setColorAt(idx, tint)
        this.plain.get(s.kind)!.setMatrixAt(idx, tmpM)
      }

      // Standard bearer at the rear centre.
      const bx = v.x - fx * (v.radius * 0.35)
      const bz = v.z - fz * (v.radius * 0.35)
      v.banner.position.set(bx, world.surfaceAt(bx, bz), bz)
      v.banner.rotation.y = Math.PI - v.heading + Math.sin(time * 1.3 + v.radius) * 0.25
      const pos = v.flag.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        pos.setZ(i, Math.sin(x * 0.8 - time * 5) * x * 0.1)
      }
      pos.needsUpdate = true
    }

    for (const kind of KINDS) {
      const n = this.counts.get(kind)!
      const t = this.tinted.get(kind)!
      const p = this.plain.get(kind)!
      t.count = n
      p.count = n
      t.instanceMatrix.needsUpdate = true
      p.instanceMatrix.needsUpdate = true
      if (t.instanceColor) t.instanceColor.needsUpdate = true
    }

    for (const [id, v] of this.visuals) {
      if (v.alive) continue
      this.group.remove(v.banner)
      v.flag.geometry.dispose()
      this.visuals.delete(id)
    }
  }
}
