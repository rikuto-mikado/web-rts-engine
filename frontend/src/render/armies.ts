import * as THREE from 'three'
import { PLAYER, ROYAL, WARDENS, type GameEngine } from '../game/engine'
import { mulberry32 } from '../game/noise'
import type { Army, FormationKey } from '../game/types'
import { SOLDIERS_PER_FIGURE, figureGeometries, figuresFor, leaderGeometry, type FigureKind } from './figures'
import { total } from '../game/troops'
import { bmerge, bpart, box, cone, cyl } from './geo'
import { applyVision } from './vision'
import { finialFor, makeFlag, patternFor, poleGeometry, waveFlag, type StandardFlag } from './standards'

const KINDS: FigureKind[] = ['spearmen', 'spearmen_lv', 'men_at_arms', 'archers', 'light_cavalry', 'knights', 'siege', 'engineer', 'royal_guard', 'thorn_guard', 'solar_guard', 'assassin', 'saboteur', 'outrider', 'pilgrim', 'mule', 'cart', 'thrall', 'bone', 'wraith', 'fiend', 'giant']
/** What a band in disguise looks like: soldiers as pilgrims, riders as pedlars' mules, siege gear as covered carts. */
const DISGUISE: Partial<Record<FigureKind, FigureKind>> = { spearmen: 'pilgrim', men_at_arms: 'pilgrim', archers: 'pilgrim', engineer: 'pilgrim', light_cavalry: 'mule', knights: 'mule', siege: 'cart', assassin: 'pilgrim', saboteur: 'pilgrim', outrider: 'mule' }
/** In the thick of a fight the spear wall levels its spears. */
const LEVELLED: Partial<Record<FigureKind, FigureKind>> = { spearmen: 'spearmen_lv' }
/** Figures that loose arrows (their bands' volleys arc over the battle). */
const SHOOTERS = new Set<FigureKind>(['archers', 'bone', 'outrider'])
const ARROWS = 1600
const MOUNTED = new Set<FigureKind>(['light_cavalry', 'knights', 'royal_guard', 'thorn_guard', 'solar_guard', 'outrider', 'mule', 'wraith', 'giant'])
/** Within this (Manhattan) distance of the camera, figures use the detailed models. */
const NEAR = 850
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
  flag: StandardFlag
  /** Figures that shoot (for the arrows in the air over a battle). */
  shooters: number
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
const SIDE = new THREE.Vector3(1, 0, 0)
const FWD = new THREE.Vector3(0, 0, 1)
const tmpLean = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpD = new THREE.Vector3()

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
  private bannerMat: THREE.Material
  private flagMat: THREE.Material
  private leaderMat: THREE.Material
  /** Each commander's own figure, built once. */
  private leaderGeos = new Map<string, THREE.BufferGeometry>()
  /** Arrows in flight over the battles. */
  private arrows: THREE.InstancedMesh
  /** The crowned heads' presence ring (the King's and the Queen's alike, in gold). */
  private auraMat: THREE.ShaderMaterial
  /** Our Wardens' watch: where they find hidden bands, a faint green aura. */
  private wardenMat: THREE.ShaderMaterial
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
    this.bannerMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.1 }))
    this.flagMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.85 }))
    this.leaderMat = applyVision(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.05 }))
    this.auraMat = auraMaterial(0xe0a92e, 0xffdc73)
    this.wardenMat = auraMaterial(0x6fa848, 0xb8e08a, WARDENS.reveal, 0.55, false)
    // An arrow: a shaft, a steel head and pale fletching, laid along +Z.
    const arrow = bmerge([
      bpart(cyl(0.07, 0.07, 3.2, 4), 0x8a6a40, { rx: Math.PI / 2, ao: 0 }),
      bpart(cone(0.16, 0.5, 4), 0xc8d0d8, { z: 1.8, rx: Math.PI / 2, ao: 0 }),
      bpart(box(0.04, 0.32, 0.6), 0xe8e0d0, { z: -1.4, ao: 0 }),
      bpart(box(0.32, 0.04, 0.6), 0xe8e0d0, { z: -1.4, ao: 0 }),
    ])
    this.arrows = new THREE.InstancedMesh(arrow, this.bannerMat, ARROWS)
    this.arrows.count = 0
    this.arrows.frustumCulled = false
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.group.add(this.arrows)
  }

  /** The commander's own figure (cached per commander and colour). */
  private leaderGeo(army: Army, color: number): THREE.BufferGeometry {
    const key = `${army.commanderKey}|${color}`
    let g = this.leaderGeos.get(key)
    if (!g) {
      const cmd = this.engine.commanderOf(army)
      const crown = this.engine.crownOf(army)
      const who = crown === 'queen' ? 'queen' : crown === 'king' ? 'king' : 'commander'
      g = leaderGeometry({ key: army.commanderKey ?? '', portrait: cmd?.portrait, color, who })
      this.leaderGeos.set(key, g)
    }
    return g
  }

  /** The war standard: a pole with the commander's finial and a banner in their colours and pattern. */
  private makeStandard(army: Army): { banner: THREE.Group; flag: StandardFlag } {
    const engine = this.engine
    const cmd = engine.commanderOf(army)
    const royal = !!army.royal
    const realm = new THREE.Color(engine.factionColor(army.faction))
    const crown = engine.crownOf(army)
    const field = royal ? (crown === 'queen' ? 0x5a0f1a : crown === 'emperor' ? 0xb8801a : 0x7a1f2b) : cmd ? new THREE.Color(cmd.banner_color).getHex() : realm.getHex()
    // The charge: gold for the crowned heads and named commanders, the realm's colour (lightened) for captains' bands.
    const charge = royal || cmd ? (crown === 'queen' ? 0xb08a3a : crown === 'emperor' ? 0xf4ecd8 : 0xe6c45a) : realm.clone().lerp(new THREE.Color(0xffffff), 0.55).getHex()
    const trim = royal ? 0xe6c45a : cmd ? realm.getHex() : new THREE.Color(0x2a2018).getHex()
    const seed = army.commanderKey ?? army.name
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
    const flag = makeFlag({ field, charge, trim, pattern: patternFor(seed, royal), royal, seed: h % 97 }, this.flagMat)
    const banner = new THREE.Group()
    const pole = new THREE.Mesh(poleGeometry(finialFor(cmd?.sigil, royal)), this.bannerMat)
    pole.castShadow = true
    banner.add(pole, flag.mesh)
    return { banner, flag }
  }

  /**
   * Our hidden bands go cloaked: a swirling shroud of shadow over the ground under them, wisps
   * drifting through it and a broken ring turning at its edge, violet when concealed, dust-amber
   * when in disguise. It reads as "unseen", not as a lit-up army.
   */
  private updateMist(v: ArmyVisual, army: Army, visible: boolean, time: number) {
    const on = visible && !!army.veil && army.faction === PLAYER
    if (!on) {
      if (v.mist) v.mist.visible = false
      return
    }
    if (!v.mist) {
      v.mist = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), veilMaterial())
      v.mist.rotation.x = -Math.PI / 2
      v.mist.renderOrder = 4
      this.group.add(v.mist)
    }
    const u = (v.mist.material as THREE.ShaderMaterial).uniforms
    u.uTime.value = time + v.x * 0.01
    const concealed = army.veil === 'concealed'
    ;(u.uEdge.value as THREE.Color).set(concealed ? 0xb59cff : 0xe8b866)
    ;(u.uShade.value as THREE.Color).set(concealed ? 0x0c0a1a : 0x231a0e)
    u.uDash.value = concealed ? 0 : 1
    const r = (v.radius + 14) * 2
    v.mist.scale.set(r, r, 1)
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
      const crown = this.engine.crownOf(army)
      const guard: FigureKind = crown === 'queen' ? 'thorn_guard' : crown === 'emperor' ? 'solar_guard' : 'royal_guard'
      for (const [kind, c] of army.royal ? ([[guard, f]] as [FigureKind, number][]) : figuresFor(u.key, u.category, f)) {
        counts.set(kind, (counts.get(kind) ?? 0) + c)
        figures += c
      }
    }
    // A band in disguise passes as pilgrims to the enemy's eyes; our own we see as they really are
    // (the amber ring and the label say they are in disguise).
    if (army.veil === 'disguised' && army.faction !== PLAYER) {
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
    const foot = [...take('assassin'), ...take('saboteur'), ...take('spearmen'), ...take('men_at_arms'), ...take('archers'), ...take('engineer'), ...take('pilgrim'), ...take('thrall'), ...take('fiend'), ...take('bone')]
    const cav = [...take('royal_guard'), ...take('thorn_guard'), ...take('solar_guard'), ...take('outrider'), ...take('knights'), ...take('light_cavalry'), ...take('mule'), ...take('wraith'), ...take('giant')]
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

  /**
   * Arrows in the air over a battle: each of a band's shooters keeps one or so in flight, rising from
   * its ranks and dropping on the far side of the fight. Returns the new count of arrows used.
   */
  private volley(army: Army, v: ArmyVisual, time: number, n: number): number {
    const b = this.engine.battle(army.battleId)
    if (!b) return n
    const world = this.engine.world
    // The enemy stands across the centre of the fight (or straight ahead, if we are at its centre).
    let tx = b.x * 2 - v.x
    let tz = b.z * 2 - v.z
    if (Math.hypot(b.x - v.x, b.z - v.z) < 25) {
      tx = v.x + Math.cos(v.heading) * 70
      tz = v.z + Math.sin(v.heading) * 70
    }
    const count = Math.min(40, Math.ceil(v.shooters / 2))
    let seed = 0
    for (let i = 0; i < army.id.length; i++) seed = (seed * 31 + army.id.charCodeAt(i)) % 997
    for (let k = 0; k < count && n < ARROWS; k++) {
      const r1 = Math.sin((k + 1) * 12.9898 + seed) * 43758.5453
      const r2 = Math.sin((k + 1) * 78.233 + seed) * 12345.6789
      const j1 = r1 - Math.floor(r1)
      const j2 = r2 - Math.floor(r2)
      const t = (time * 0.5 + j1 + k * 0.618) % 1
      const sx = v.x + (j1 - 0.5) * v.radius * 1.4
      const sz = v.z + (j2 - 0.5) * v.radius * 1.4
      const ex = tx + (j2 - 0.5) * 40
      const ez = tz + (j1 - 0.5) * 40
      const dist = Math.hypot(ex - sx, ez - sz)
      const h = 12 + dist * 0.28
      const y0 = world.surfaceAt(sx, sz) + 6
      const y1 = world.surfaceAt(ex, ez)
      const at = (u: number, out: THREE.Vector3) => out.set(sx + (ex - sx) * u, y0 + (y1 - y0) * u + Math.sin(Math.PI * u) * h, sz + (ez - sz) * u)
      at(t, tmpA)
      at(Math.min(1, t + 0.02), tmpB)
      tmpD.subVectors(tmpB, tmpA)
      if (tmpD.lengthSq() < 1e-6) continue
      tmpD.normalize()
      tmpQ2.setFromUnitVectors(FWD, tmpD)
      tmpS.set(1.6, 1.6, 1.6)
      tmpM.compose(tmpA, tmpQ2, tmpS)
      this.arrows.setMatrixAt(n++, tmpM)
    }
    return n
  }

  private ensureVisual(army: Army): ArmyVisual {
    let v = this.visuals.get(army.id)
    if (!v) {
      const { banner, flag } = this.makeStandard(army)
      this.group.add(banner)
      const cmd = this.engine.commanderOf(army)
      const color = cmd?.banner_color ?? this.engine.factionColor(army.faction)
      let leader: THREE.Group | null = null
      if (army.commanderKey) {
        leader = new THREE.Group()
        const body = new THREE.Mesh(this.leaderGeo(army, new THREE.Color(color).getHex()), this.leaderMat)
        body.castShadow = true
        body.scale.setScalar(1.35)
        leader.add(body)
        this.group.add(leader)
      }
      let aura: THREE.Mesh | null = null
      if (army.royal) {
        // The crowned head's presence, 350m out, drawn over the ground: a soft edge and a slow
        // pulse going out from the centre.
        const R = ROYAL.aura + AURA_PAD
        aura = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), this.auraMat)
        aura.rotation.x = -Math.PI / 2
        aura.renderOrder = 5
        this.group.add(aura)
      } else if (army.wardens && army.faction === PLAYER) {
        // Our Wardens' watch: a quieter green aura where hidden enemy bands are found.
        const R = WARDENS.reveal + AURA_PAD
        aura = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), this.wardenMat)
        aura.rotation.x = -Math.PI / 2
        aura.renderOrder = 5
        this.group.add(aura)
      }
      v = { id: army.id, x: army.x, z: army.z, heading: army.heading, slots: [], layoutKey: '', radius: 10, banner, flag, leader, aura, mist: null, seen: false, alive: true, shooters: 0 }
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
    this.auraMat.uniforms.uTime.value = time
    this.wardenMat.uniforms.uTime.value = time
    const smooth = 1 - Math.exp(-dt * 10)
    let arrowN = 0

    for (const army of engine.state.armies) {
      const v = this.ensureVisual(army)
      v.alive = true
      // No fog: every army is in view, except enemies lying hidden that none of ours is close to.
      // Inside the walls of a castle of its own side, an army is out of sight (it marched in through a gate).
      const visible = engine.canSee(engine.team(PLAYER), army) && !engine.insideWalls(army)
      v.seen = visible
      // In disguise the standard is furled (our own spymaster still rides at their head; the enemy's walks among the pilgrims).
      const disguised = army.veil === 'disguised'
      v.banner.visible = visible && !disguised
      if (v.leader) v.leader.visible = visible && !(disguised && army.faction !== PLAYER)
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
        v.shooters = lay.slots.reduce((n, s) => n + (SHOOTERS.has(s.kind) ? 1 : 0), 0)
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

      // Mounted figures rock with the gallop; in a fight everyone leans in.
      const mountedPitch = moving ? 0.07 : fighting ? 0.05 : 0
      for (const s of v.slots) {
        let lx = s.lx
        let lz = s.lz
        const kind = fighting ? (LEVELLED[s.kind] ?? s.kind) : s.kind
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
        const sc = this.scales.get(kind)!
        tmpS.set(sc, sc, sc)
        const mounted = MOUNTED.has(kind)
        const lean = mounted
          ? Math.sin(time * 9 + s.phase) * mountedPitch + (fighting ? 0.06 : 0)
          : fighting && kind !== 'siege' && kind !== 'cart'
            ? 0.1 + Math.sin(time * 5 + s.phase * 3) * 0.06
            : moving
              ? 0.04
              : 0
        if (lean !== 0) {
          tmpLean.setFromAxisAngle(SIDE, lean)
          tmpQ2.copy(tmpQ).multiply(tmpLean)
          tmpM.compose(tmpP, tmpQ2, tmpS)
        } else tmpM.compose(tmpP, tmpQ, tmpS)
        const lod = Math.abs(wx - this.eye.x) + Math.abs(wz - this.eye.z) + Math.abs(tmpP.y - this.eye.y) < NEAR ? 0 : 1
        const counts = lod ? this.countsFar : this.counts
        const idx = counts.get(kind)!
        if (idx >= CAPACITY) continue
        counts.set(kind, idx + 1)
        this.tinted.get(kind)![lod].setMatrixAt(idx, tmpM)
        this.tinted.get(kind)![lod].setColorAt(idx, tint)
        this.plain.get(kind)![lod].setMatrixAt(idx, tmpM)
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
      // The banner faces the way the army marches, and turns a little with the wind.
      v.banner.rotation.y = Math.PI / 2 - v.heading + Math.sin(time * 0.7 + v.radius) * 0.12
      // Only banners near enough to see the ripple are moved (it costs a pass over their vertices).
      if (Math.abs(bx - this.eye.x) + Math.abs(bz - this.eye.z) < NEAR * 2) waveFlag(v.flag, time, moving ? 1.35 : fighting ? 1.15 : 0.85)
      // Volleys: arrows arcing from this band's bowmen over to the enemy.
      if (fighting && v.shooters > 0 && arrowN < ARROWS) arrowN = this.volley(army, v, time, arrowN)
    }
    this.arrows.count = arrowN
    if (arrowN > 0) this.arrows.instanceMatrix.needsUpdate = true

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
      v.flag.mesh.geometry.dispose()
      this.visuals.delete(id)
    }
  }
}

/** How far past the ring the aura's quad reaches, for the soft glow outside the rim. */
const AURA_PAD = 24

/**
 * An aura on the ground (the crowned heads' presence, our Wardens' watch): a soft, faint edge with a
 * warm glow falling away inside it, a faint wash, and for the crowned heads a pulse every few seconds.
 */
/** `radius` of the ring, `strength` how strongly it shows (1: the crowned heads'). */
function auraMaterial(color: number, rim: number, radius: number = ROYAL.aura, strength = 1, pulse = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uR: { value: radius }, uK: { value: strength }, uPulse: { value: pulse ? 1 : 0 }, uPad: { value: AURA_PAD }, uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      uniform float uR;
      uniform float uPad;
      void main() {
        vP = (uv - 0.5) * 2.0 * (uR + uPad);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP;
      uniform float uTime;
      uniform float uR;
      uniform float uK;
      uniform float uPulse;
      uniform vec3 uColor;
      uniform vec3 uRim;
      const float TAU = 6.2831853;
      // A band of width w (metres) centred on c, with soft edges.
      float band(float r, float c, float w) { return 1.0 - smoothstep(w * 0.5 - 0.8, w * 0.5 + 0.8, abs(r - c)); }
      void main() {
        float r = length(vP);
        if (r > uR + 24.0) discard;
        vec3 col = uColor;
        float alpha = 0.0;
        // An aura, not a fence: a soft, faint edge that fades into a warm glow inward, a faint wash
        // and (for the crowned heads) a pulse going out from the centre every 4 seconds.
        float rimLine = band(r, uR - 2.0, 2.4) * 0.38;
        float glowIn = r < uR ? exp(-(uR - r) / 18.0) * 0.3 : 0.0;
        float glowOut = r >= uR ? exp(-(r - uR) / 6.0) * 0.12 : 0.0;
        float wash = pow(clamp(r / uR, 0.0, 1.0), 5.0) * 0.06;
        float p = fract(uTime / 4.0);
        float pulse = r < uR ? exp(-abs(r - p * uR) / 8.0) * 0.26 * (1.0 - p) * smoothstep(0.0, 0.08, p) * uPulse : 0.0;
        alpha = max(rimLine, glowIn + glowOut + wash + pulse);
        col = mix(uColor, uRim, clamp(rimLine + pulse + glowIn * 0.5, 0.0, 1.0));
        // The crowned heads' aura breathes a little; the Wardens' holds still.
        alpha *= mix(1.0, 0.85 + 0.15 * sin(uTime * 1.6), uPulse) * uK;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
}

/** The cloak under a hidden band of ours (see updateMist). One per band: each has its own colours. */
function veilMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEdge: { value: new THREE.Color(0xb59cff) }, uShade: { value: new THREE.Color(0x0c0a1a) }, uDash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uEdge;
      uniform vec3 uShade;
      uniform float uDash;
      const float TAU = 6.2831853;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 7.1) * 0.15; }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x) / TAU + 0.5;
        // The shroud swirls: turn the sample point more towards the middle.
        float tw = uTime * 0.18 + (1.0 - r) * 1.6;
        vec2 q = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p;
        float n = fbm(q * 2.4 + vec2(uTime * 0.07, -uTime * 0.05));
        float shroud = smoothstep(1.0, 0.2, r) * (0.35 + 0.65 * n);
        // Brighter wisps drifting through it.
        float wisp = smoothstep(0.55, 0.8, n) * smoothstep(0.95, 0.35, r) * 0.6;
        // A broken ring turning at the edge: long arcs under cover, short dashes in disguise.
        float ring = 1.0 - smoothstep(0.018, 0.04, abs(r - 0.86));
        float arcs = mix(step(0.32, fract(ang * 5.0 + uTime * 0.05)), step(0.5, fract(ang * 22.0 - uTime * 0.08)), uDash);
        float flicker = 0.75 + 0.25 * sin(uTime * 2.3 + ang * TAU * 3.0);
        float edge = ring * arcs * flicker;
        // A faint halo just inside the ring.
        float halo = exp(-abs(r - 0.86) * 18.0) * 0.25;
        vec3 col = mix(uShade, uEdge, clamp(edge + wisp * 0.8 + halo, 0.0, 1.0));
        float alpha = max(max(shroud * 0.62, edge * 0.9), wisp + halo);
        alpha *= smoothstep(1.0, 0.92, r);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
}
