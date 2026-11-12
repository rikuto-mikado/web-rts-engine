import * as THREE from 'three'
import { PLAYER, ROYAL, type GameEngine } from '../game/engine'
import { mulberry32 } from '../game/noise'
import type { Army, FormationKey } from '../game/types'
import { SOLDIERS_PER_FIGURE, figureGeometries, figuresFor, leaderGeometry, type FigureKind } from './figures'
import { total } from '../game/troops'
import { box, cyl, merge, part } from './geo'
import { applyVision } from './vision'

const KINDS: FigureKind[] = ['spearmen', 'men_at_arms', 'archers', 'light_cavalry', 'knights', 'siege', 'engineer', 'royal_guard', 'thorn_guard', 'pilgrim', 'mule', 'cart', 'thrall', 'bone', 'wraith', 'fiend', 'giant']
/** What a band in disguise looks like: soldiers as pilgrims, riders as pedlars' mules, siege gear as covered carts. */
const DISGUISE: Partial<Record<FigureKind, FigureKind>> = { spearmen: 'pilgrim', men_at_arms: 'pilgrim', archers: 'pilgrim', engineer: 'pilgrim', light_cavalry: 'mule', knights: 'mule', siege: 'cart' }
const MOUNTED = new Set<FigureKind>(['light_cavalry', 'knights', 'royal_guard', 'thorn_guard', 'mule', 'wraith', 'giant'])
/** Within this (Manhattan) distance of the camera, figures use the detailed models. */
const NEAR = 1100
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
  /** The mounted commander riding at the head (and the King's ring of presence). */
  leader: THREE.Group | null
  aura: THREE.Mesh | null
  /** A drifting mist under one of our spymaster's hidden bands. */
  mist: THREE.Mesh | null
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
  /** Instanced figures per kind, in two levels of detail: index 0 near the camera, 1 farther off. */
  private tinted = new Map<FigureKind, THREE.InstancedMesh[]>()
  private plain = new Map<FigureKind, THREE.InstancedMesh[]>()
  private countsFar = new Map<FigureKind, number>()
  /** Camera position: figures within NEAR of it get the detailed models. */
  readonly eye = new THREE.Vector3()
  private scales = new Map<FigureKind, number>()
  private counts = new Map<FigureKind, number>()
  readonly visuals = new Map<string, ArmyVisual>()
  /** Level of detail: 1 = full ranks, lower values thin them out when the camera is far away. */
  density = 1
  private engine: GameEngine
  private bannerPole: THREE.BufferGeometry
  private bannerMat: THREE.Material
  private flagGeo: THREE.PlaneGeometry
  private leaderMat: THREE.Material
  private auraMat: THREE.Material
  private mistTex: THREE.Texture | null = null
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
      const ts: THREE.InstancedMesh[] = []
      const ps: THREE.InstancedMesh[] = []
      for (const detail of ['near', 'far'] as const) {
        const g = figureGeometries(kind, detail)
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
        ts.push(t)
        ps.push(p)
        this.scales.set(kind, g.scale)
      }
      this.tinted.set(kind, ts)
      this.plain.set(kind, ps)
    }
    this.bannerPole = merge([part(cyl(0.3, 0.3, 18, 5), 0x3b2f25, { y: 9 }), part(box(0.6, 0.6, 0.6), 0xd4af37, { y: 18.3 })])
    this.bannerMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }))
    this.leaderMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }))
    this.auraMat = new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    this.flagGeo = new THREE.PlaneGeometry(7, 4.5, 6, 1)
    this.flagGeo.translate(3.5, 0, 0)
  }

  /** A soft round wisp (made once): bright in the middle, fading to nothing at the rim, with a few thinner patches. */
  private mistTexture(): THREE.Texture {
    if (this.mistTex) return this.mistTex
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const r = i === 0 ? 0 : 22 + (i % 3) * 7
      const x = 64 + Math.cos(a) * r
      const y = 64 + Math.sin(a) * r
      const grd = g.createRadialGradient(x, y, 0, x, y, i === 0 ? 62 : 34)
      grd.addColorStop(0, `rgba(255,255,255,${i === 0 ? 0.85 : 0.5})`)
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, 128, 128)
    }
    this.mistTex = new THREE.CanvasTexture(c)
    this.mistTex.colorSpace = THREE.SRGBColorSpace
    return this.mistTex
  }
  /** Our hidden bands walk in a drifting mist (grey-green under cover, dusty when in disguise), so we can tell them at a glance. */
  private updateMist(v: ArmyVisual, army: Army, visible: boolean, time: number) {
    const on = visible && !!army.veil && army.faction === PLAYER
    if (!on) {
      if (v.mist) v.mist.visible = false
      return
    }
    if (!v.mist) {
      const mat = new THREE.MeshBasicMaterial({ map: this.mistTexture(), transparent: true, depthWrite: false, depthTest: false, opacity: 0.6 })
      v.mist = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      v.mist.rotation.x = -Math.PI / 2
      v.mist.renderOrder = 4
      this.group.add(v.mist)
    }
    const mat = v.mist.material as THREE.MeshBasicMaterial
    mat.color.set(army.veil === 'concealed' ? 0xd2e6dc : 0xf2e2b8)
    mat.opacity = 0.4 + Math.sin(time * 0.9 + v.x * 0.01) * 0.08
    const r = (v.radius + 14) * 1.8
    v.mist.scale.set(r, r, 1)
    v.mist.rotation.z = time * 0.05
    v.mist.position.set(v.x, this.engine.world.surfaceAt(v.x, v.z) + 3, v.z)
    v.mist.visible = true
  }

  private layoutKey(army: Army): { key: string; counts: Map<FigureKind, number> } {
    const counts = new Map<FigureKind, number>()
    let figures = 0
    // The Endless Night: its own creatures, packed close (a figure for every few of them).
    if (this.engine.state.factions[army.faction]?.undying) {
      const n = (k: string) => army.troops[k] ?? 0
      if (army.horde === 'giant') counts.set('giant', Math.max(1, Math.min(4, Math.round(total(army.troops) / 60))))
      else {
        const foot: FigureKind = army.horde === 'demons' ? 'fiend' : 'thrall'
        const put = (k: FigureKind, men: number) => {
          if (men < 1) return
          const f = Math.max(1, Math.round((men / SOLDIERS_PER_FIGURE[k]) * this.density))
          counts.set(k, (counts.get(k) ?? 0) + f)
        }
        put(foot, n('infantry') + n('engineers'))
        put('bone', n('archers'))
        put('wraith', n('cavalry'))
      }
      let all = 0
      for (const c of counts.values()) all += c
      const cap = Math.round(MAX_FIGURES * 1.5 * this.density)
      if (all > cap) for (const [k, v] of counts) counts.set(k, Math.max(1, Math.round((v * cap) / all)))
      return { key: `${this.shapeOf(army)}|${KINDS.map((k) => counts.get(k) ?? 0).join(',')}`, counts }
    }
    for (const u of this.engine.unitList) {
      const n = army.troops[u.key] ?? 0
      if (n < 1) continue
      const f = Math.max(1, Math.round((n / 5) * this.density))
      // The King's Royal Guard and the Usurper's Thorn Guard ride in their own harness, whatever the unit list says.
      const guard: FigureKind = army.id === this.engine.state.foeRoyalId ? 'thorn_guard' : 'royal_guard'
      for (const [kind, c] of army.royal ? ([[guard, f]] as [FigureKind, number][]) : figuresFor(u.key, u.category, f)) {
        counts.set(kind, (counts.get(kind) ?? 0) + c)
        figures += c
      }
    }
    if (army.veil === 'disguised') {
      const plain = new Map<FigureKind, number>()
      for (const [k, c] of counts) {
        const d = DISGUISE[k] ?? k
        plain.set(d, (plain.get(d) ?? 0) + c)
      }
      counts.clear()
      for (const [k, c] of plain) counts.set(k, c)
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
    const foot = [...take('spearmen'), ...take('men_at_arms'), ...take('archers'), ...take('engineer'), ...take('pilgrim'), ...take('thrall'), ...take('fiend'), ...take('bone')]
    const cav = [...take('royal_guard'), ...take('thorn_guard'), ...take('knights'), ...take('light_cavalry'), ...take('mule'), ...take('wraith'), ...take('giant')]
    // Siege engines (or, in disguise, the carts that stand in for them) bring up the rear.
    const siegeKind: FigureKind = (counts.get('cart') ?? 0) > 0 ? 'cart' : 'siege'
    const siege = (counts.get('siege') ?? 0) + (counts.get('cart') ?? 0)
    const jitter = shape === 'loose' ? 1.8 : 0.8
    const push = (kind: FigureKind, lx: number, lz: number) => slots.push({ kind, lx: lx + (rnd() - 0.5) * jitter, lz: lz + (rnd() - 0.5) * jitter, phase: rnd() * 6.28 })

    // The Endless Night keeps no ranks: a swarming mass, densest at its heart, spilling forward,
    // its giants striding at the head.
    if (this.engine.state.factions[army.faction]?.undying) {
      const mass = [...take('thrall'), ...take('fiend'), ...take('bone'), ...take('wraith')]
      const big = take('giant')
      const R = Math.sqrt(mass.length) * 2.1 + 3
      mass.forEach((kind) => {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * R
        push(kind, Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.85 + (MOUNTED.has(kind) ? R * 0.5 : 0))
      })
      big.forEach((kind, k) => push(kind, (k - (big.length - 1) / 2) * 14, R * 0.6 + 6))
    } else if (shape === 'column') {
      // Narrow column: cavalry vanguard, infantry, then the baggage of siege engines.
      const all = [...cav, ...foot]
      const ccols = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(all.length / 6))))
      let z = 0
      all.forEach((kind, i) => {
        const cav = MOUNTED.has(kind)
        if (i > 0 && i % ccols === 0) z -= cav ? 5.6 : 3.2
        push(kind, ((i % ccols) - (ccols - 1) / 2) * 2.8, z)
      })
      const tail = z - 9
      for (let i = 0; i < siege; i++) push(siegeKind, 0, tail - i * 11)
    } else if (shape === 'wedge') {
      // Spearhead: heavy units at the tip, rows widening behind.
      const all = [...cav, ...take('men_at_arms'), ...take('spearmen'), ...take('archers'), ...take('engineer')]
      let row = 0
      let i = 0
      while (i < all.length) {
        const width = row * 2 + 1
        const cav = MOUNTED.has(all[i])
        for (let c = 0; c < width && i < all.length; c++, i++) push(all[i], (c - (width - 1) / 2) * (cav ? 3.4 : 2.8), -row * (cav ? 4.6 : 3.2))
        row++
      }
      for (let k = 0; k < siege; k++) push(siegeKind, (k - (siege - 1) / 2) * 9, -row * 3.6 - 9)
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
      for (let k = 0; k < siege; k++) push(siegeKind, (k - (siege - 1) / 2) * 9, -half - 10)
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
      for (let k = 0; k < siege; k++) push(siegeKind, (k - (siege - 1) / 2) * 9, -rows * sz - 9)
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
      let leader: THREE.Group | null = null
      if (army.commanderKey) {
        leader = new THREE.Group()
        const king = !!army.royal
        const body = new THREE.Mesh(leaderGeometry(new THREE.Color(color).getHex(), army.id === this.engine.state.foeRoyalId ? 'queen' : king ? 'king' : 'commander'), this.leaderMat)
        body.castShadow = true
        body.scale.setScalar(1.35)
        leader.add(body)
        this.group.add(leader)
      }
      let aura: THREE.Mesh | null = null
      if (army.royal) {
        // The King's presence: a faint gold ring round the Guard, 350m out, drawn over the ground.
        aura = new THREE.Mesh(new THREE.RingGeometry(ROYAL.aura - 14, ROYAL.aura, 128), this.auraMat)
        aura.rotation.x = -Math.PI / 2
        aura.renderOrder = 5
        this.group.add(aura)
      }
      v = { id: army.id, x: army.x, z: army.z, heading: army.heading, slots: [], layoutKey: '', radius: 10, banner, flag, leader, aura, mist: null, seen: false, alive: true }
      this.visuals.set(army.id, v)
    }
    return v
  }

  update(dt: number, time: number) {
    const engine = this.engine
    const world = engine.world
    for (const k of KINDS) {
      this.counts.set(k, 0)
      this.countsFar.set(k, 0)
    }
    for (const v of this.visuals.values()) v.alive = false
    const smooth = 1 - Math.exp(-dt * 10)

    for (const army of engine.state.armies) {
      const v = this.ensureVisual(army)
      v.alive = true
      // No fog: every army is in view, except enemies lying hidden that none of ours is close to.
      // Inside the walls of a castle of its own side, an army is out of sight (it marched in through a gate).
      const visible = engine.canSee(engine.team(PLAYER), army) && !engine.insideWalls(army)
      v.seen = visible
      // In disguise there is no banner to follow, and the commander walks among the pilgrims.
      const disguised = army.veil === 'disguised'
      v.banner.visible = visible && !disguised
      if (v.leader) v.leader.visible = visible && !disguised
      if (v.aura && !visible) v.aura.visible = false
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
        if (moving) bob = Math.abs(Math.sin(time * (MOUNTED.has(s.kind) ? 9 : 7) + s.phase)) * 0.5
        if (fighting && s.kind !== 'siege' && s.kind !== 'cart') {
          lz += Math.sin(time * 5 + s.phase * 3) * 1.1
          lx += Math.sin(time * 3.3 + s.phase * 5) * 0.5
        }
        const wx = v.x + fx * lz + rx * lx
        const wz = v.z + fz * lz + rz * lx
        tmpP.set(wx, world.surfaceAt(wx, wz) + bob, wz)
        const sc = this.scales.get(s.kind)!
        tmpS.set(sc, sc, sc)
        tmpM.compose(tmpP, tmpQ, tmpS)
        const lod = Math.abs(wx - this.eye.x) + Math.abs(wz - this.eye.z) + Math.abs(tmpP.y - this.eye.y) < NEAR ? 0 : 1
        const counts = lod ? this.countsFar : this.counts
        const idx = counts.get(s.kind)!
        if (idx >= CAPACITY) continue
        counts.set(s.kind, idx + 1)
        this.tinted.get(s.kind)![lod].setMatrixAt(idx, tmpM)
        this.tinted.get(s.kind)![lod].setColorAt(idx, tint)
        this.plain.get(s.kind)![lod].setMatrixAt(idx, tmpM)
      }

      // The commander rides at the head of the army.
      if (v.leader) {
        const lx = v.x + fx * (v.radius * 0.55 + 6)
        const lz = v.z + fz * (v.radius * 0.55 + 6)
        const bob = moving ? Math.abs(Math.sin(time * 8)) * 0.5 : 0
        v.leader.position.set(lx, world.surfaceAt(lx, lz) + bob, lz)
        v.leader.rotation.y = Math.PI / 2 - v.heading
      }
      this.updateMist(v, army, visible, time)
      if (v.aura) {
        // Centred on the Guard, and only while the King is in the field.
        v.aura.position.set(v.x, world.surfaceAt(v.x, v.z) + 4, v.z)
        v.aura.visible = visible && !engine.insideWalls(army)
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
      for (const lod of [0, 1]) {
        const n = (lod ? this.countsFar : this.counts).get(kind)!
        const t = this.tinted.get(kind)![lod]
        const p = this.plain.get(kind)![lod]
        t.count = n
        p.count = n
        if (n === 0) continue
        t.instanceMatrix.needsUpdate = true
        p.instanceMatrix.needsUpdate = true
        if (t.instanceColor) t.instanceColor.needsUpdate = true
      }
    }

    for (const [id, v] of this.visuals) {
      if (v.alive) continue
      this.group.remove(v.banner)
      if (v.leader) this.group.remove(v.leader)
      if (v.aura) this.group.remove(v.aura)
      if (v.mist) {
        this.group.remove(v.mist)
        ;(v.mist.material as THREE.Material).dispose()
      }
      v.flag.geometry.dispose()
      this.visuals.delete(id)
    }
  }
}
