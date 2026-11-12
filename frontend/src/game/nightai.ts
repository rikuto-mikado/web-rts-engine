import type { GameEngine } from './engine'
import { addTroops, total } from './troops'
import type { Army, Castle, Faction, Troops } from './types'

/**
 * The Endless Night. It has no castles, no gold and no end of men. The dead pour out of the
 * Great Rift without pause and gather into battalions at its mouth; every so often the Rift
 * erupts and whole hosts come out at once, with demons, wraith riders and, later in the night,
 * giants to batter the gates. A war council directs them: battalions mass out of bowshot before
 * the weakest gate while a second force makes for another to pin its defenders, and when enough
 * have gathered they all go in at once. A gate taken, every band turns to pour through it.
 *
 * The night has four watches, each fiercer than the last: Dusk, Midnight, the Witching Hour and
 * the last dark Before Dawn.
 */
export const WATCHES = [
  { name: 'Dusk', from: 0, intensity: 0.6 },
  { name: 'Midnight', from: 0.22, intensity: 1 },
  { name: 'The Witching Hour', from: 0.5, intensity: 1.4 },
  { name: 'Before Dawn', from: 0.8, intensity: 1.75 },
]
export function watchAt(t: number, limit: number) {
  const f = t / Math.max(1, limit)
  let w = WATCHES[0]
  for (const x of WATCHES) if (f >= x.from) w = x
  return w
}

const NIGHT = {
  /** Seconds between bands crawling out of the Rift. */
  trickle: 3,
  /** Men in each band (before the watch's intensity and the difficulty). */
  band: 46,
  /** A battalion marches off when it is this strong (or has waited this long). */
  battalion: 520,
  battalionWait: 20,
  /** Eruptions: every so often (a sixth of the night, later an eighth), whole hosts at once. */
  surgeShare: 1 / 6,
  surgeFloorShare: 1 / 8,
  /** How long battalions wait at their staging point for the rest before going in anyway. */
  stageWait: 14,
  stageDist: 430,
}
const ADJ = ['Hollow', 'Ashen', 'Grave', 'Wailing', 'Barrow', 'Drowned', 'Gaunt', 'Silent', 'Pale', 'Weeping', 'Rotting']
const NOUN = ['Host', 'Legion', 'Horde', 'Throng', 'Multitude', 'Swarm', 'Tide']

type Role = { kind: 'main' | 'feint' | 'flank' | 'breach'; target: string; stage: [number, number] | null }

export class NightAI {
  private e: GameEngine
  private id: Faction
  private nextAt = 0
  private nextTrickle = 2
  private formingId: string | null = null
  private formingSince = 0
  private rnd: () => number
  /** Each battalion's part in the plan. */
  private roles = new Map<string, Role>()
  /** The plan: the gate to break and the one to pin, and when the massing began. */
  private plan: { main: string; feint: string | null; since: number; launched: boolean } | null = null

  constructor(engine: GameEngine, id: Faction) {
    this.e = engine
    this.id = id
    let s = engine.state.scenario.seed + 99
    this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  }
  onCastleLost(_c: Castle) {}

  /** How hard the night presses, by difficulty (tuned in headless nights: about 6, 4 and 2 in 10 won). */
  /** How hard the night presses, by difficulty (tuned in headless nights: about 6, 4 and 2 in 10 won). */
  /** How hard the night presses, by difficulty (tuned in headless nights: about 6, 3.5 and 2.5 in 10 won). */
  private get mult() {
    return ({ easy: 0.62, normal: 0.535, hard: 0.52, brutal: 0.58 } as Record<string, number>)[this.e.state.difficulty] ?? 0.55
  }





  private get rift() {
    return this.e.state.rules.night!.rifts[0]
  }
  private get town() {
    return this.e.state.scenario.definition.town!
  }

  update() {
    const e = this.e
    const s = e.state
    if (!s.night || s.status !== 'active' || !s.rules.night?.rifts.length) return
    const w = watchAt(s.time, s.rules.timeLimit ?? 1)
    // The Rift never stops.
    if (s.time >= this.nextTrickle) {
      this.nextTrickle = s.time + NIGHT.trickle
      this.trickle(w.intensity)
    }
    if (s.time >= s.night.nextWaveAt) this.surge(w.intensity)
    if (s.time < this.nextAt) return
    this.nextAt = s.time + 2
    this.council()
  }

  private name() {
    return `${ADJ[Math.floor(this.rnd() * ADJ.length)]} ${NOUN[Math.floor(this.rnd() * NOUN.length)]}`
  }
  private mouth(): [number, number] {
    const r = this.rift
    const dx = this.town.x - r.x
    const dz = this.town.z - r.z
    const d = Math.hypot(dx, dz) || 1
    return this.e.world.nearestPassable(r.x + (dx / d) * 300, r.z + (dz / d) * 300)
  }
  private spawn(troops: Troops, name: string, horde?: Army['horde']): Army {
    const r = this.rift
    const a = this.e.spawnBand(this.id, troops, this.e.world.nearestPassable(r.x + (this.rnd() - 0.5) * 90, r.z + (this.rnd() - 0.5) * 90), { name, captainName: 'A dead captain' })
    a.retreatAt = 0.95
    if (horde) a.horde = horde
    return a
  }

  /** A band crawls out and joins the battalion forming at the Rift's mouth. */
  private trickle(intensity: number) {
    const e = this.e
    const n = NIGHT.band * intensity * this.mult
    const roll = this.rnd()
    const troops: Troops = roll < 0.15 ? { archers: Math.round(n) } : roll < 0.24 ? { cavalry: Math.round(n * 0.8) } : { infantry: Math.round(n * 0.85), archers: Math.round(n * 0.15) }
    const forming = this.formingId ? e.army(this.formingId) : undefined
    const r = this.rift
    if (!forming || forming.battleId || Math.hypot(forming.x - r.x, forming.z - r.z) > 560) {
      const a = this.spawn(troops, this.name())
      const [mx, mz] = this.mouth()
      e.orderArmy(a.id, { type: 'move', x: mx, z: mz }, true)
      this.formingId = a.id
      this.formingSince = e.state.time
      return
    }
    // The newly risen swell the battalion gathering at the Rift's mouth.
    forming.troops = addTroops(forming.troops, troops)
    forming.initialTotal += total(troops)
    // Strong enough (or waited long enough): it marches off, and a new one starts to gather.
    if (total(forming.troops) >= NIGHT.battalion * this.mult * Math.max(0.8, intensity) || e.state.time - this.formingSince > NIGHT.battalionWait) this.formingId = null
  }

  /** The Rift erupts: whole hosts at once, with demons, wraiths and, later on, giants. */
  private surge(intensity: number) {
    const e = this.e
    const s = e.state
    const night = s.night!
    night.wave++
    const n = night.wave
    const L = s.rules.timeLimit ?? 360
    night.nextWaveAt = s.time + Math.max(L * NIGHT.surgeFloorShare, L * NIGHT.surgeShare - n * 4)
    const m = this.mult * intensity
    const hosts = 2 + Math.floor(intensity)
    for (let i = 0; i < hosts; i++) this.spawn({ infantry: Math.round(420 * m), archers: Math.round(90 * m) }, this.name())
    this.spawn({ infantry: Math.round(260 * m) }, `${['Brimstone', 'Horned', 'Burning', 'Cinder'][n % 4]} Fiends`, 'demons')
    this.spawn({ cavalry: Math.round(170 * m) }, `${['Pale', 'Grave', 'Shadow'][n % 3]} Riders`, 'wraiths')
    const giants = intensity >= 1 ? (intensity >= 1.4 ? 2 : 1) : 0
    for (let i = 0; i < giants; i++) {
      const g = this.spawn({ infantry: Math.round(150 * this.mult) }, `${['Grummoch', 'Ulgorth', 'Bramagh', 'Skarn', 'Vuldor'][(n + i) % 5]} the Giant`, 'giant')
      g.engines = { ram: true, tower: true }
    }
    if (intensity >= 1.4) this.trebuchet()
    e.log('warning', 'The Great Rift erupts', `${hosts} hosts of the dead, fiends and wraith riders${giants ? ` and ${giants === 1 ? 'a giant' : 'two giants'}` : ''} pour out into the vale.`, this.rift.x, this.rift.z)
  }

  /** A trebuchet and its crew, out of bowshot before the gate the host means to break. */
  private trebuchet() {
    const e = this.e
    const s = e.state
    const gate = (this.plan && e.castle(this.plan.main)) || s.castles.find((c) => c.id.startsWith('og') && e.isHostile(c.faction, this.id))
    if (!gate || !e.isHostile(gate.faction, this.id) || (s.obstacles ?? []).filter((o) => o.kind === 'trebuchet' && o.faction === this.id && o.until > s.time).length >= 3) return
    const [x, z] = this.outside(gate, 380)
    ;(s.obstacles ??= []).push({ id: `treb-${s.time.toFixed(0)}`, kind: 'trebuchet', faction: this.id, x, z, until: 1e9 })
    const crew = this.spawn({ infantry: Math.round(160 * this.mult), archers: Math.round(60 * this.mult) }, 'Trebuchet Crew')
    crew.x = x
    crew.z = z
    e.log('warning', 'A trebuchet before the walls', `The dead raise a trebuchet before ${gate.name}. Sally out and break it, or it will batter the gate down.`, x, z)
  }

  /** A point out from a gate, away from the city's heart. */
  private outside(c: Castle, d: number): [number, number] {
    const dx = c.x - this.town.x
    const dz = c.z - this.town.z
    const L = Math.hypot(dx, dz) || 1
    return this.e.world.nearestPassable(c.x + (dx / L) * d, c.z + (dz / L) * d)
  }

  /** How hard a gate would be to take: its garrison, its walls, and our armies close by. */
  private strength(c: Castle): number {
    const e = this.e
    let p = total(c.garrison) * (1 + c.walls / Math.max(1, c.maxWalls))
    for (const a of e.state.armies) if (!e.isHostile(a.faction, c.faction) && Math.hypot(a.x - c.x, a.z - c.z) < 320) p += total(a.troops) * 1.2
    return p
  }

  /** The war council: who goes where, and when. */
  private council() {
    const e = this.e
    const s = e.state
    const theirs = (c: Castle) => e.isHostile(c.faction, this.id) && c.faction !== 'neutral' && !c.ruined
    const outerGates = s.castles.filter((c) => c.id.startsWith('og'))
    const openOuter = outerGates.filter((c) => c.faction === this.id)
    const [innerW] = s.scenario.definition.walls ?? []
    const inUpper = (c: { x: number; z: number }) => !!innerW && e.world.insideWall(innerW, c.x, c.z)
    const bands = s.armies.filter((a) => a.faction === this.id && a.id !== this.formingId && a.name !== 'Trebuchet Crew' && a.status !== 'retreating')
    for (const id of [...this.roles.keys()]) if (!e.army(id)) this.roles.delete(id)

    // A gate is open: everyone pours through it, for the wards and the inner gates, then the Citadel.
    if (openOuter.length) {
      const lower = s.castles.filter((c) => theirs(c) && !c.village && !inUpper(c) && (c.district || c.id.startsWith('ig')))
      const upper = s.castles.filter((c) => theirs(c) && !c.village && (inUpper(c) || c.id === 'keep'))
      for (const a of bands) {
        if (a.battleId) continue
        const pool = lower.length ? lower : upper
        const tgt = pool.sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0]
        if (!tgt) continue
        if (!(a.order.type === 'attack' && a.order.castleId === tgt.id)) e.orderArmy(a.id, { type: 'attack', castleId: tgt.id }, true)
        this.roles.set(a.id, { kind: 'breach', target: tgt.id, stage: null })
      }
      if (this.plan && !this.plan.launched) this.plan = null
      if (s.night && (!s.night.intent || s.night.intent.until < s.time)) {
        const g = openOuter[0]
        s.night.intent = { text: `The dead pour through ${g.name}`, x: g.x, z: g.z, until: s.time + 30 }
      }
      return
    }

    // Choose the gate to break (the weakest) and one to pin (well round the wall from it).
    const held = outerGates.filter(theirs)
    if (!held.length) return
    if (!this.plan || !e.castle(this.plan.main) || !theirs(e.castle(this.plan.main)!)) {
      const main = held.reduce((b, c) => (this.strength(c) < this.strength(b) ? c : b), held[0])
      const others = held.filter((c) => c.id !== main.id).sort((x, y) => Math.hypot(y.x - main.x, y.z - main.z) - Math.hypot(x.x - main.x, x.z - main.z))
      this.plan = { main: main.id, feint: others[0]?.id ?? null, since: s.time, launched: false }
      for (const id of [...this.roles.keys()]) if (this.roles.get(id)!.kind !== 'flank') this.roles.delete(id)
    }
    const plan = this.plan
    const main = e.castle(plan.main)!
    const feint = plan.feint ? e.castle(plan.feint) : undefined
    // New battalions take a part: riders ride round to the villages and the far gate; the rest
    // mass before the main gate, a third of them before the gate to be pinned.
    for (const a of bands) {
      if (this.roles.has(a.id)) continue
      const riders = (a.troops.cavalry ?? 0) > total(a.troops) * 0.5
      if (riders) {
        const village = s.castles.filter((c) => c.village && theirs(c)).sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0]
        const tgt = village ?? feint ?? main
        this.roles.set(a.id, { kind: 'flank', target: tgt.id, stage: null })
        e.orderArmy(a.id, { type: 'attack', castleId: tgt.id }, true)
        continue
      }
      const toFeint = feint && a.horde !== 'giant' && this.rnd() < 0.33
      const gate = toFeint ? feint! : main
      this.roles.set(a.id, { kind: toFeint ? 'feint' : 'main', target: gate.id, stage: plan.launched ? null : this.outside(gate, NIGHT.stageDist + this.rnd() * 80) })
    }
    // Massing: move to the staging points and wait for the rest.
    let ready = 0
    let mustered = 0
    for (const a of bands) {
      const r = this.roles.get(a.id)
      if (!r || a.battleId || r.kind === 'flank' || r.kind === 'breach') continue
      if (r.stage && !plan.launched) {
        const [x, z] = r.stage
        mustered += total(a.troops)
        if (Math.hypot(a.x - x, a.z - z) < 110) ready += total(a.troops)
        else if (!(a.order.type === 'move' && Math.hypot(a.order.x - x, a.order.z - z) < 40)) e.orderArmy(a.id, { type: 'move', x, z }, true)
      } else if (!(a.order.type === 'attack' && a.order.castleId === r.target)) e.orderArmy(a.id, { type: 'attack', castleId: r.target }, true)
    }
    if (!plan.launched) {
      if (s.night && (!s.night.intent || s.night.intent.until < s.time + 5)) s.night.intent = { text: `A host masses before ${main.name}`, x: main.x, z: main.z, until: s.time + 25 }
      if (mustered > 0 && plan.since === s.time) e.log('warning', `The dead mass before ${main.name}`, `Battalions gather out of bowshot${feint ? `, and more before ${feint.name}` : ''}. When they are ready they will all go in at once.`, main.x, main.z)
      // Go in together when most have come up (and they are strong enough to frighten), or the waiting is over.
      const strong = ready > this.strength(main) * 1.2 && ready > mustered * 0.7
      if ((strong && s.time - plan.since > 6) || s.time - plan.since > NIGHT.stageWait + 12) {
        plan.launched = true
        for (const r of this.roles.values()) if (r.kind === 'main' || r.kind === 'feint') r.stage = null
        if (s.night) s.night.intent = { text: `The dead storm ${main.name}${feint ? ` and ${feint.name}` : ''}!`, x: main.x, z: main.z, until: s.time + 25 }
        e.log('warning', `The dead storm ${main.name}!`, `${Math.round(Math.max(ready, mustered))} of them go in at once${feint ? `, while others fall on ${feint.name}` : ''}.`, main.x, main.z)
      }
    } else if (bands.every((a) => !this.roles.has(a.id) || this.roles.get(a.id)!.kind === 'flank' || a.battleId) && s.time - plan.since > 50) {
      // The assault has spent itself: plan the next.
      this.plan = null
    }
  }
}
