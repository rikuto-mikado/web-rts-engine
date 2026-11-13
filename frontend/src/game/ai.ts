import { ROYAL, SAPPERS, SPY, NEUTRAL, WARDENS, type GameEngine } from './engine'
import { PLAYER, foeDifficulty } from './engine'
import { OUTPOST_KINDS, type OutpostKind } from './outposts'
import { mulberry32 } from './noise'
import { floorTroops, power, scaleTroops, total, totalInt } from './troops'
import type { Army, Castle, Faction, FactionState, SabotageKind, Troops } from './types'
import { holdingRadius, wallRadius } from './world'

const MIXES: Record<string, Record<string, number>> = {
  aggressive: { infantry: 0.42, cavalry: 0.28, archers: 0.22, engineers: 0.08 },
  balanced: { infantry: 0.48, cavalry: 0.2, archers: 0.25, engineers: 0.07 },
  defensive: { infantry: 0.52, cavalry: 0.1, archers: 0.34, engineers: 0.04 },
}

const CAPTAINS = [
  'Captain Morrow', 'Captain Vane', 'Sergeant Kell', 'Captain Ashby', 'Reeve Dunstan', 'Captain Harl', 'Captain Sorn',
  'Sir Aldric', 'Sir Bertram', 'Dame Edda', 'Captain Ivo', 'Sir Osric', 'Captain Wulf', 'Lady Maud', 'Sir Hugh',
]

/**
 * An AI lord. Recruits, raids hostile castles, relieves besieged allies,
 * intercepts invaders, retakes lost castles, answers the player's call to
 * arms and (for alliance leaders) periodically musters a Great Host.
 */
export class FactionAI {
  private engine: GameEngine
  readonly id: Faction
  private rnd: () => number

  constructor(engine: GameEngine, id: Faction) {
    this.engine = engine
    this.id = id
    let h = 7
    for (const ch of id) h = h * 31 + ch.charCodeAt(0)
    this.rnd = mulberry32((h >>> 0) + Math.floor(engine.state.time * 10))
  }

  private get s() {
    return this.engine.state
  }
  private get f(): FactionState {
    return this.s.factions[this.id]
  }
  private get team() {
    return this.f.team
  }
  private get hostileToPlayer() {
    return this.engine.isHostile(this.id, PLAYER)
  }
  private myCastles(): Castle[] {
    return this.s.castles.filter((c) => c.faction === this.id)
  }
  /** Hidden enemy troops are invisible to us until we come close (the same rule as for the player). */
  private sees(a: Army): boolean {
    return this.engine.canSee(this.team, a)
  }
  /** Enemy strength as we believe it: exact within 450m, otherwise a rumour (about ±30%). */
  private foeArmy(a: Army): number {
    return this.engine.perceivedArmyPower(this.team, a)
  }
  private foeCastle(c: Castle): number {
    return this.engine.perceivedGarrisonPower(this.team, c)
  }

  /** A distance from the original maps, stretched to this map's castle spacing. */
  private d(v: number): number {
    return v * this.engine.spread
  }

  private myArmies(): Army[] {
    // (On autopilot the player's Royal Guard stays where the player left it.)
    // (Escorts in a battle group follow their lead by themselves: see fieldorders.ts.)
    return this.s.armies.filter((a) => a.faction === this.id && !a.vassalOf && !a.aidFor && !a.royal && !this.engine.isSpyBand(a) && !a.wardens && !a.stance)
  }
  private personality() {
    return this.f.personality ?? 'balanced'
  }

  onCastleLost(c: Castle) {
    if (!this.f.alive) return
    this.f.ai.retakeQueue.push({ castleId: c.id, at: this.s.time + 50 + this.rnd() * 40 })
  }

  update() {
    const ai = this.f.ai
    if (this.s.time < ai.nextDecisionAt) return
    ai.nextDecisionAt = this.s.time + 4 + this.rnd()
    if (this.myCastles().length === 0) {
      // A landless lord's remaining armies try to find a home with an ally.
      this.tidyIdleArmies()
      return
    }
    this.recruit()
    this.answerMusters()
    this.answerAidCalls()
    this.requestAid()
    this.organizeMuster()
    this.chooseFocus()
    this.buildOutposts()
    this.courtVillages()
    this.workSites()
    this.sendScouts()
    this.fieldWorks()
    this.siegeWorks()
    this.holdGround()
    this.tidyIdleArmies()
    this.relieveSieges()
    this.raidConvoys()
    this.strikeFromBehind()
    this.interceptInvaders()
    this.greatHost()
    this.queenRides()
    this.spyRaids()
    this.cutterRaids()
    this.huntPatrol()
    this.raid()
    this.retake()
  }

  // ---------------------------------------------------------------------------

  private recruit() {
    const castles = this.myCastles().filter((c) => !c.battleId)
    if (castles.length === 0) return
    const budget = Math.max(0, this.f.gold - (this.f.ai.outpostReserve ?? 0)) * 0.5
    const per = budget / castles.length
    const mix = MIXES[this.personality()] ?? MIXES.balanced
    for (const c of castles) {
      if (this.engine.capacity(c) - total(c.garrison) < 20) continue
      this.engine.recruitMix(c.id, mix, per, this.id)
    }
  }

  private captain(): { commanderKey: string | null; captainName: string } {
    // (Malakor never takes the field; the Grey Abbess leads only her own spies.)
    const free = this.engine.freeCommanders(this.id).filter((c) => c.key !== 'malakor' && !SPY.keys.includes(c.key))
    if (free.length > 0 && this.rnd() < 0.7) return { commanderKey: free[Math.floor(this.rnd() * free.length)].key, captainName: '' }
    return { commanderKey: null, captainName: CAPTAINS[Math.floor(this.rnd() * CAPTAINS.length)] }
  }

  private send(from: Castle, fraction: number, name: string, order: Army['order'], opts: { keep?: number; leader?: string } = {}): Army | null {
    const keep = opts.keep ?? 120
    const avail = total(from.garrison) - keep
    if (avail < 60) return null
    const frac = Math.min(fraction, avail / total(from.garrison))
    const troops: Troops = floorTroops(scaleTroops(from.garrison, frac))
    let commander = this.captain()
    if (opts.leader && this.engine.freeCommanders(this.id).some((c) => c.key === opts.leader)) commander = { commanderKey: opts.leader, captainName: '' }
    const res = this.engine.formArmy(from.id, this.id, troops, {
      commanderKey: commander.commanderKey,
      captainName: commander.captainName,
      retreatAt: 0.55,
      order,
      name,
    })
    if (typeof res === 'string') return null
    // More than one army may hold: the rest march out as escorts in its battle group (up to four).
    let left = total(troops) - total(res.troops)
    for (let k = 0; k < 4 && left >= 60; k++) {
      const share = floorTroops(scaleTroops(troops, Math.min(1, left / Math.max(1, total(troops)))))
      const cap = this.captain()
      const esc = this.engine.formArmy(from.id, this.id, share, { captainName: cap.captainName, retreatAt: 0.55, name: `${name} ${['II', 'III', 'IV', 'V'][k]}` })
      if (typeof esc === 'string') break
      esc.stance = { kind: 'escortArmy', targetId: res.id }
      left -= total(esc.troops)
    }
    return res
  }

  private nearestOwn(x: number, z: number, filter: (c: Castle) => boolean = () => true): Castle | undefined {
    let best: Castle | undefined
    let bd = Infinity
    for (const c of this.myCastles()) {
      if (!filter(c)) continue
      const d = Math.hypot(c.x - x, c.z - z)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }

  private tidyIdleArmies() {
    const host = this.f.host
    for (const a of this.myArmies()) {
      if (a.status !== 'idle' || a.battleId) continue
      if (host && (a.id === host.hostId || host.detachmentIds.includes(a.id))) continue
      if (this.engine.musterOf(a.id)) continue
      // Raiders standing at an enemy outpost stay until it burns.
      if (this.s.outposts.some((o) => this.engine.isHostile(o.faction, this.id) && this.engine.outpostKnown(this.team, o) && Math.hypot(o.x - a.x, o.z - a.z) < 80)) continue
      // Armies holding one of our outposts are its garrison.
      if (this.s.outposts.some((o) => o.faction === this.id && Math.hypot(o.x - a.x, o.z - a.z) < 90)) continue
      if (this.f.ai.buildPlan?.armyId === a.id) continue
      // Working a mine, scouting, or hunting scouts: leave them to it.
      if (a.order.type === 'gather' || a.order.type === 'scout' || a.order.type === 'work' || a.pursuit) continue
      const here = this.engine.castleAt(a.x, a.z, 60)
      if (here && here.faction === this.id) {
        this.engine.garrisonArmy(a.id)
        continue
      }
      const home = this.nearestOwn(a.x, a.z)
      if (home) {
        this.engine.orderArmy(a.id, { type: 'reinforce', castleId: home.id })
        continue
      }
      // No castle of our own: join the nearest allied castle's defence.
      const ally = this.s.castles
        .filter((c) => c.faction !== 'neutral' && this.engine.team(c.faction) === this.team)
        .sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0]
      if (ally) this.engine.orderArmy(a.id, { type: 'station', castleId: ally.id })
    }
  }

  // --- Outposts -----------------------------------------------------------------

  /**
   * Lords raise outposts toward the castle they mean to fight over: a bridge
   * fort on a crossing, a forest lodge for ambushes, a watchtower on high
   * ground, a supply depot when the march is long, otherwise a field camp.
   * Engineers march out, build, and stay as the garrison (in a depot, they
   * quarter inside).
   */
  private buildOutposts() {
    const ai = this.f.ai
    const plan = ai.buildPlan
    if (plan) {
      const a = this.engine.army(plan.armyId)
      if (!a || a.status === 'retreating') {
        ai.buildPlan = null
        return
      }
      if (a.order.type === 'build') return
      const site = this.s.outposts.find((o) => o.faction === this.id && Math.hypot(o.x - a.x, o.z - a.z) < 40)
      if (site) {
        if (site.progress >= 1) {
          if (site.kind === 'depot') this.engine.orderArmy(a.id, { type: 'garrison', outpostId: site.id })
          ai.buildPlan = null
        }
        return
      }
      if (Math.hypot(a.x - plan.x, a.z - plan.z) < 45 && a.status === 'idle') {
        const err = this.engine.buildOutpost(a.id, plan.kind)
        if (err) {
          const alt = this.engine.outpostOptions(a.id).find((o) => o.ok)
          if (!alt || this.engine.buildOutpost(a.id, alt.kind)) ai.buildPlan = null
        }
      }
      return
    }
    if (this.s.time < (ai.nextOutpostAt ?? 120 + this.rnd() * 120)) return
    ai.nextOutpostAt = this.s.time + 150 + this.rnd() * 150
    const mine = this.s.outposts.filter((o) => o.faction === this.id)
    if (mine.length >= 3) return
    if (this.threatened()) return
    // Where is the war for us? The alliance focus, else the nearest hostile castle.
    const castles = this.myCastles().filter((c) => !c.battleId)
    if (castles.length === 0) return
    const focusId = this.s.teamFocus[this.team as 'A' | 'B' | 'C']?.castleId
    let target = focusId ? this.engine.castle(focusId) : undefined
    if (!target || !this.engine.isHostile(target.faction, this.id)) {
      let bd = 2600
      target = undefined
      for (const c of this.s.castles) {
        if (!this.engine.isHostile(c.faction, this.id) || c.faction === 'neutral') continue
        for (const m of castles) {
          const d = Math.hypot(c.x - m.x, c.z - m.z)
          if (d < bd) {
            bd = d
            target = c
          }
        }
      }
    }
    if (!target) return
    const t = target
    const from = castles.sort((x, y) => Math.hypot(x.x - t.x, x.z - t.z) - Math.hypot(y.x - t.x, y.z - t.z))[0]
    const span = Math.hypot(t.x - from.x, t.z - from.z)
    if (span < this.d(700)) return
    if (total(from.garrison) < 380) return
    const w = this.engine.world
    const long = span > this.engine.supplyRange(from) * 1.15
    // Candidate spots along the road toward the target, plus nearby bridges.
    const spots: { x: number; z: number; kinds: OutpostKind[] }[] = []
    for (const b of w.crossings()) {
      const along = ((b.x - from.x) * (t.x - from.x) + (b.z - from.z) * (t.z - from.z)) / (span * span)
      if (along < 0.2 || along > 0.75) continue
      const px = from.x + (t.x - from.x) * along
      const pz = from.z + (t.z - from.z) * along
      if (Math.hypot(b.x - px, b.z - pz) > 300) continue
      // Our side of the crossing.
      const back = 90 / Math.max(1, Math.hypot(b.x - from.x, b.z - from.z))
      spots.push({ x: b.x + (from.x - b.x) * back, z: b.z + (from.z - b.z) * back, kinds: ['castrum'] })
    }
    for (const f of [0.38, 0.48, 0.3, 0.56]) {
      for (const off of [0, 120, -120]) {
        const px = from.x + (t.x - from.x) * f + (-(t.z - from.z) / span) * off
        const pz = from.z + (t.z - from.z) * f + ((t.x - from.x) / span) * off
        const kinds: OutpostKind[] = long && !mine.some((o) => o.kind === 'depot') ? ['depot', 'castrum'] : []
        // Lords mix their forts: a redoubt on high ground, a hidden pavilion for raiders, a quick laager otherwise.
        if (w.heightAt(px, pz) > 32 && this.f.gold > 600) kinds.push('redoubt')
        if (this.personality() === 'aggressive' && !mine.some((o) => o.kind === 'pavilion')) kinds.push('pavilion')
        kinds.push(this.rnd() < 0.5 ? 'castrum' : 'laager')
        spots.push({ x: px, z: pz, kinds })
      }
    }
    for (const sp of spots) {
      const kind = sp.kinds.find((k) => !this.engine.siteProblemAt(this.id, sp.x, sp.z, k))
      if (!kind) continue
      // Save up for the outpost and the engineers to build it.
      const g = from.garrison
      const needEng = Math.max(0, 24 - Math.floor(g.engineers ?? 0))
      const cost = OUTPOST_KINDS[kind].cost + needEng * 25 + 40
      if (this.f.gold < cost) {
        ai.outpostReserve = cost
        ai.nextOutpostAt = this.s.time + 15
        return
      }
      if (needEng > 0) this.engine.recruitMix(from.id, { engineers: 1 }, needEng * 25 + 1, this.id)
      ai.outpostReserve = 0
      const eng = Math.floor(g.engineers ?? 0)
      if (eng < 18) return
      const troops: Troops = {
        engineers: Math.min(eng, 30),
        infantry: Math.min(Math.floor(g.infantry ?? 0), 110),
        archers: Math.min(Math.floor(g.archers ?? 0), 40),
      }
      const lead = this.captain()
      const res = this.engine.formArmy(from.id, this.id, troops, {
        commanderKey: lead.commanderKey,
        captainName: lead.captainName,
        retreatAt: 0.5,
        order: { type: 'move', x: sp.x, z: sp.z },
        name: 'Pioneers',
      })
      if (typeof res === 'string') return
      ai.buildPlan = { armyId: res.id, kind, x: sp.x, z: sp.z }
      return
    }
  }

  /**
   * Siege engines: an army marching on a walled castle with engineers stops
   * short to build a ram (or a belfry, when rich and bold), mantlets against
   * strong archers, and now and then a trebuchet; then takes up the march again.
   */
  private siegeWorks() {
    if (this.f.gold < 220) return
    for (const a of this.myArmies()) {
      if (a.order.type !== 'attack' || a.battleId || a.status === 'retreating') continue
      const c = this.engine.castle(a.order.castleId)
      if (!c || c.village || c.walls <= 0) continue
      const eng = a.troops.engineers ?? 0
      if (eng < 10) continue
      const d = Math.hypot(c.x - a.x, c.z - a.z)
      if (d > this.d(1000) || d < 420) continue
      const then = a.order
      const archers = (c.garrison.archers ?? 0) / Math.max(1, total(c.garrison))
      let job: 'ram' | 'tower' | 'mantlet' | 'trebuchet' | null = null
      if (eng >= 15 && !a.engines?.ram && !a.engines?.tower) job = this.f.gold > 600 && this.personality() === 'aggressive' && this.rnd() < 0.5 ? 'tower' : 'ram'
      else if (archers > 0.3 && !a.engines?.mantlet) job = 'mantlet'
      else if (eng >= 20 && this.f.gold > 800 && this.rnd() < 0.15 && !(this.s.obstacles ?? []).some((o) => o.kind === 'trebuchet' && o.faction === this.id)) job = 'trebuchet'
      if (!job) continue
      const err = this.engine.startWork(a.id, job, job === 'trebuchet' ? undefined : then)
      if (!err) return
    }
  }

  /**
   * Hold good ground: an idle army near our lands, with enemies about, takes
   * up a ring of standing stones, windfall or old-growth forest nearby.
   */
  private holdGround() {
    const feats = this.engine.world.def.features ?? []
    if (!feats.length) return
    const foes = this.s.armies.filter((h) => this.engine.isHostile(h.faction, this.id) && h.status !== 'retreating' && this.sees(h))
    if (!foes.length) return
    for (const a of this.myArmies()) {
      if (a.battleId || a.status !== 'idle' || a.order.type !== 'hold' || this.engine.insideWalls(a)) continue
      if (this.engine.world.featureKindAt(a.x, a.z)) continue
      if (!foes.some((f) => Math.hypot(f.x - a.x, f.z - a.z) < this.d(1400))) continue
      const horse = (a.troops.cavalry ?? 0) / Math.max(1, total(a.troops))
      let best: { x: number; z: number; d: number } | null = null
      for (const f of feats) {
        // Horse keeps out of windfall and the old woods; everyone likes standing stones.
        if ((f.kind === 'thicket' || f.kind === 'oldwood') && horse > 0.1) continue
        if (f.kind !== 'stones' && f.kind !== 'thicket' && f.kind !== 'oldwood') continue
        const d = Math.hypot(f.x - a.x, f.z - a.z)
        if (d < 520 && (!best || d < best.d)) best = { x: f.x, z: f.z, d }
      }
      if (best) {
        this.engine.orderArmy(a.id, { type: 'move', x: best.x, z: best.z })
        return
      }
    }
  }

  /**
   * Engineers in the field: garrisons of our outposts lay stakes (against
   * horse), a hidden mud pit or pitch barrels when an enemy approaches, and an
   * enemy-built bridge leading to one of our castles is pulled down in front of
   * a strong enemy force.
   */
  private fieldWorks() {
    const hostiles = this.s.armies.filter((h) => this.engine.isHostile(h.faction, this.id) && !this.engine.atPeace(this.id, h.faction) && h.status !== 'retreating' && this.sees(h))
    if (hostiles.length === 0) return
    const obstacles = this.s.obstacles ?? []
    for (const a of this.myArmies()) {
      if (a.battleId || a.status === 'retreating' || a.order.type === 'work' || a.order.type === 'build') continue
      if ((a.troops.engineers ?? 0) < 10) continue
      // 1. Pull down an engineers' bridge in front of a threatening enemy.
      for (const [i, b] of this.engine.world.bridges.entries()) {
        if (this.engine.world.broken.has(i)) continue
        if (Math.hypot(a.x - b.x, a.z - b.z) > 450) continue
        const home = this.nearestOwn(b.x, b.z)
        if (!home || Math.hypot(home.x - b.x, home.z - b.z) > this.d(1000)) continue
        const threat = hostiles.find((h) => {
          const dB = Math.hypot(h.x - b.x, h.z - b.z)
          const dH = Math.hypot(h.x - home.x, h.z - home.z)
          return dB < this.d(600) && dH > Math.hypot(b.x - home.x, b.z - home.z) + 100 && this.foeArmy(h) > this.engine.garrisonPower(home) * 0.8
        })
        if (!threat || Math.hypot(a.x - home.x, a.z - home.z) > Math.hypot(threat.x - home.x, threat.z - home.z)) continue
        if (Math.hypot(a.x - b.x, a.z - b.z) - b.length / 2 < 90) this.engine.startWork(a.id, 'demolish')
        else this.engine.orderArmy(a.id, { type: 'move', x: b.x, z: b.z })
        return
      }
      // 2. Fortify an outpost we hold.
      const post = this.s.outposts.find((o) => o.faction === this.id && o.progress >= 1 && Math.hypot(o.x - a.x, o.z - a.z) < 90)
      if (!post || a.status !== 'idle') continue
      const near = hostiles.filter((h) => Math.hypot(h.x - a.x, h.z - a.z) < 900)
      if (near.length === 0) continue
      if (obstacles.some((o) => o.faction === this.id && Math.hypot(o.x - a.x, o.z - a.z) < 140)) continue
      const horse = near.reduce((s, h) => s + (h.troops.cavalry ?? 0), 0) / Math.max(1, near.reduce((s, h) => s + total(h.troops), 0))
      const rich = this.f.gold > 700 && (a.troops.engineers ?? 0) >= 15
      this.engine.startWork(a.id, horse > 0.3 ? 'stakes' : rich && this.rnd() < 0.4 ? 'pitch' : 'pit')
    }
  }

  /**
   * Free villages near our lands: win them over with coin, or (for an
   * aggressive lord, or one short of gold) plunder them for loot and captives.
   */
  private courtVillages() {
    const ai = this.f.ai as typeof this.f.ai & { nextVillageAt?: number }
    if (this.s.time < (ai.nextVillageAt ?? 90 + this.rnd() * 120)) return
    ai.nextVillageAt = this.s.time + 80 + this.rnd() * 90
    if (this.threatened()) return
    const mine = this.myCastles().filter((c) => !c.village && !c.battleId)
    if (mine.length === 0) return
    const free = this.s.castles
      .filter((c) => c.village && c.faction === 'neutral' && !c.ruined && !c.battleId)
      .map((c) => ({ c, d: Math.min(...mine.map((m) => Math.hypot(m.x - c.x, m.z - c.z))) }))
      .filter((v) => v.d < this.engine.envoyReach())
      // Caravanserais, abbeys, keeps and guildhalls are worth riding a little farther for.
      .sort((a, b) => a.d * (a.c.holding ? 0.6 : 1) - b.d * (b.c.holding ? 0.6 : 1))
    if (free.length === 0) return
    const { c } = free[0]
    const p = this.personality()
    const plunderBias = p === 'aggressive' ? 0.55 : p === 'balanced' ? 0.22 : 0.05
    const terms = this.engine.villageTerms(c.id, this.id)
    const canPay = !terms.reason && this.f.gold > terms.price + 60
    if (canPay && this.rnd() > plunderBias) {
      this.engine.negotiateVillage(c.id, this.id)
      return
    }
    if (this.rnd() < plunderBias + (canPay ? 0 : 0.25)) {
      const from = mine.sort((x, y) => Math.hypot(x.x - c.x, x.z - c.z) - Math.hypot(y.x - c.x, y.z - c.z))[0]
      const need = total(c.garrison) * 2 + 60
      const frac = Math.min(0.4, need / Math.max(1, total(from.garrison)))
      if (total(from.garrison) * frac >= need * 0.9) this.send(from, frac, 'Raiders', { type: 'attack', castleId: c.id }, { keep: 250 })
    }
  }

  /** Now and then, a few riders ride out to spy on a hostile castle before the lord strikes. */
  private sendScouts() {
    const ai = this.f.ai
    if (this.s.time < (ai.nextScoutAt ?? 150 + this.rnd() * 200)) return
    ai.nextScoutAt = this.s.time + 220 + this.rnd() * 200
    if (this.myArmies().some((a) => a.order.type === 'scout')) return
    const from = this.myCastles()
      .filter((c) => !c.battleId && (c.garrison.cavalry ?? 0) >= 45)
      .sort((x, y) => (y.garrison.cavalry ?? 0) - (x.garrison.cavalry ?? 0))[0]
    if (!from) return
    const target = this.s.castles
      .filter((c) => !c.ruined && c.faction !== 'neutral' && this.engine.isHostile(c.faction, this.id) && !this.engine.atPeace(this.id, c.faction) && Math.hypot(c.x - from.x, c.z - from.z) < this.d(2000))
      .sort((x, y) => Math.hypot(x.x - from.x, x.z - from.z) - (x.faction === PLAYER ? 500 : 0) - (Math.hypot(y.x - from.x, y.z - from.z) - (y.faction === PLAYER ? 500 : 0)))[0]
    if (!target) return
    const n = Math.min(Math.floor(from.garrison.cavalry ?? 0) - 15, 25 + Math.floor(this.rnd() * 20))
    if (n < 20) return
    const res = this.engine.formArmy(from.id, this.id, { cavalry: n }, { captainName: 'Scout Captain', retreatAt: 0.4, name: 'Scouts' })
    if (typeof res !== 'string') this.engine.startScout(res.id, target.id)
  }

  /** Send engineers to work a free mine or lumber camp near our lands (at most two parties). */
  private workSites() {
    const ai = this.f.ai as typeof this.f.ai & { nextSiteAt?: number }
    if (this.s.time < (ai.nextSiteAt ?? 60 + this.rnd() * 120)) return
    ai.nextSiteAt = this.s.time + 140 + this.rnd() * 120
    if (this.threatened()) return
    const working = this.myArmies().filter((a) => a.order.type === 'gather').length
    if (working >= 2) return
    const mine = this.myCastles().filter((c) => !c.battleId && !c.village)
    if (mine.length === 0) return
    const busy = new Set(this.s.armies.filter((a) => a.order.type === 'gather').map((a) => (a.order as { siteId: string }).siteId))
    const options = (this.s.sites ?? [])
      .filter((x) => !busy.has(x.id) && x.stock > 400)
      .map((x) => {
        const from = mine.sort((p, q) => Math.hypot(p.x - x.x, p.z - x.z) - Math.hypot(q.x - x.x, q.z - x.z))[0]
        return { x, from, d: Math.hypot(from.x - x.x, from.z - x.z) }
      })
      .filter((o) => o.d < this.d(1100))
      .sort((p, q) => p.d - q.d - (p.x.kind === 'mine' ? 150 : 0) + (q.x.kind === 'mine' ? 150 : 0))
    const pick = options[0]
    if (!pick) return
    const g = pick.from.garrison
    if ((g.engineers ?? 0) < 22) {
      if (this.f.gold < 700) return
      this.engine.recruitMix(pick.from.id, { engineers: 1 }, (24 - Math.floor(g.engineers ?? 0)) * 25 + 1, this.id)
    }
    const eng = Math.floor(g.engineers ?? 0)
    if (eng < 12) return
    const lead = this.captain()
    this.engine.formArmy(pick.from.id, this.id, { engineers: Math.min(eng, 30), infantry: Math.min(Math.floor(g.infantry ?? 0), 70), archers: Math.min(Math.floor(g.archers ?? 0), 20) }, {
      commanderKey: null,
      captainName: lead.captainName,
      retreatAt: 0.5,
      order: { type: 'gather', siteId: pick.x.id },
      name: pick.x.kind === 'mine' ? 'Miners' : 'Woodcutters',
    })
  }

  /** Free armies, or a small sally from a nearby castle, ride down enemy supply wagons. */
  private raidConvoys() {
    for (const w of this.s.convoys ?? []) {
      if (!this.engine.isHostile(w.faction, this.id) || this.engine.atPeace(this.id, w.faction)) continue
      const already = this.s.armies.some((a) => this.engine.team(a.faction) === this.team && a.order.type === 'raidConvoy' && a.order.convoyId === w.id)
      if (already) continue
      const free = this.myArmies().find(
        (a) => !a.battleId && a.status !== 'retreating' && (a.order.type === 'hold' || a.order.type === 'station') && !this.engine.musterOf(a.id) && Math.hypot(a.x - w.x, a.z - w.z) < this.d(700),
      )
      if (free) {
        this.engine.orderArmy(free.id, { type: 'raidConvoy', convoyId: w.id })
        continue
      }
      const near = this.myCastles().find((c) => !c.battleId && Math.hypot(c.x - w.x, c.z - w.z) < this.d(650) && total(c.garrison) > 420)
      if (near && this.rnd() < 0.6) {
        const frac = Math.min(0.25, 130 / total(near.garrison))
        this.send(near, frac, 'Wagon Raiders', { type: 'raidConvoy', convoyId: w.id }, { keep: 300 })
      }
    }
  }

  private relieveSieges() {
    for (const c of this.s.castles) {
      if (!c.battleId || this.engine.team(c.faction) !== this.team || c.faction === 'neutral') continue
      const b = this.engine.battle(c.battleId)
      if (!b) continue
      const helping = this.s.armies.some(
        (a) => this.engine.team(a.faction) === this.team && (a.order.type === 'station' || a.order.type === 'attack') && 'castleId' in a.order && a.order.castleId === c.id,
      )
      if (helping) continue
      const besiegers = b.sideA.armyIds.map((id) => this.engine.army(id)).filter((a): a is Army => !!a)
      const threat = besiegers.reduce((s, a) => s + this.foeArmy(a), 0)
      const reach = c.faction === this.id ? 1200 : 900
      const donor = this.myCastles()
        .filter((d) => d.id !== c.id && !d.battleId && Math.hypot(d.x - c.x, d.z - c.z) < reach)
        .sort((x, y) => Math.hypot(x.x - c.x, x.z - c.z) - Math.hypot(y.x - c.x, y.z - c.z))[0]
      if (!donor) continue
      if (power(donor.garrison, this.engine.units) * 0.6 + this.engine.garrisonPower(c) * 0.5 < threat * 0.7) continue
      // Allies are a little more cautious about committing for someone else.
      if (c.faction !== this.id && this.rnd() < 0.35) continue
      this.send(donor, 0.6, 'Relief Column', { type: 'station', castleId: c.id }, { keep: 150 })
    }
  }

  /**
   * When an ally's line is locked in a field battle, a free army nearby swings
   * round and hits the enemy from behind (the engine routes the approach).
   */
  private strikeFromBehind() {
    for (const b of this.s.battles) {
      if (b.kind !== 'field' || this.s.time - b.startedAt < 3) continue
      const ours = b.sideA.team === this.team ? b.sideA : b.sideB.team === this.team ? b.sideB : null
      if (!ours) continue
      const theirs = ours === b.sideA ? b.sideB : b.sideA
      const foes = theirs.armyIds.map((id) => this.engine.army(id)).filter((a): a is Army => !!a)
      if (foes.length === 0) continue
      const foePower = foes.reduce((s, a) => s + this.foeArmy(a), 0)
      const ourPower = ours.armyIds.reduce((s, id) => {
        const a = this.engine.army(id)
        return s + (a ? this.engine.armyPower(a) : 0)
      }, 0)
      // Already winning comfortably: no need to commit more.
      if (ourPower > foePower * 2.2) continue
      const coming = this.s.armies.some((a) => this.engine.team(a.faction) === this.team && a.order.type === 'intercept' && foes.some((f) => f.id === (a.order as { armyId: string }).armyId))
      if (coming) continue
      const free = this.myArmies().filter(
        (a) =>
          !a.battleId &&
          a.status !== 'retreating' &&
          // Never strip a castle or gate of its guard to do it.
          (a.order.type === 'hold' || a.order.type === 'move') &&
          !this.engine.musterOf(a.id) &&
          Math.hypot(a.x - b.x, a.z - b.z) < this.d(900) &&
          this.engine.armyPower(a) >= foePower * 0.2,
      )
      if (free.length === 0) continue
      const army = free.sort((x, y) => Math.hypot(x.x - b.x, x.z - b.z) - Math.hypot(y.x - b.x, y.z - b.z))[0]
      const target = foes.sort((x, y) => this.foeArmy(y) - this.foeArmy(x))[0]
      this.engine.orderArmy(army.id, { type: 'intercept', armyId: target.id })
    }
  }

  private interceptInvaders() {
    for (const p of this.s.armies) {
      if (!this.engine.isHostile(p.faction, this.id) || p.battleId || p.status === 'retreating') continue
      if (!this.sees(p) || this.engine.atPeace(this.id, p.faction)) continue
      const already = this.s.armies.some((a) => a.order.type === 'intercept' && a.order.armyId === p.id && this.engine.team(a.faction) === this.team)
      if (already) continue
      const near = this.myCastles().find((c) => !c.battleId && Math.hypot(c.x - p.x, c.z - p.z) < this.d(420) + holdingRadius(c))
      if (!near) continue
      const threat = this.foeArmy(p)
      const avail = power(near.garrison, this.engine.units)
      if (avail * 0.65 > threat * 1.25) {
        const frac = Math.min(0.65, (threat * 1.5) / avail)
        this.send(near, frac, 'Sally Force', { type: 'intercept', armyId: p.id }, { keep: 200 })
      }
    }
  }

  /** Is this lord's own land under threat right now? */
  private threatened(): boolean {
    for (const c of this.myCastles()) {
      if (c.battleId) return true
      for (const a of this.s.armies) {
        if (!this.engine.isHostile(a.faction, this.id) || a.status === 'retreating' || !this.sees(a)) continue
        if (Math.hypot(a.x - c.x, a.z - c.z) < this.d(700)) return true
      }
    }
    return false
  }

  /** Soldiers a castle can send away and still hold. */
  private spare(c: Castle): number {
    if (c.village) return 0 // vassal villages keep their militia
    return total(c.garrison) - Math.max(250, this.engine.capacity(c) * 0.35)
  }

  /**
   * Answer allied musters with judgement: only if this lord is close enough,
   * not under threat, not already committed elsewhere, and has men to spare.
   */
  private answerMusters() {
    for (const m of this.s.musters) {
      if (m.phase !== 'gathering' || m.team !== this.team || m.answered.includes(this.id)) continue
      m.answered.push(this.id)
      const loud = m.organizer === PLAYER
      const decline = (why: string) => {
        if (loud) this.engine.log('ally', `${this.f.name} cannot answer`, why)
      }
      if (this.engine.committedToMuster(this.id)) {
        decline('Their troops are already marching for another muster.')
        continue
      }
      if (this.threatened()) {
        decline('Their own lands are under threat.')
        continue
      }
      const src = this.nearestOwn(m.rallyX, m.rallyZ, (c) => !c.battleId)
      if (!src || Math.hypot(src.x - m.rallyX, src.z - m.rallyZ) > this.d(1500)) continue // too far: quietly stay home
      const spare = this.spare(src)
      if (spare < 150) {
        decline('They have no soldiers to spare.')
        continue
      }
      // The Sovereign himself at the rally point: lords answer more readily and send more.
      const king = !!(m.rallyArmyId && this.engine.army(m.rallyArmyId)?.royal)
      const willing = Math.min(1, (this.personality() === 'defensive' ? 0.6 : this.personality() === 'aggressive' ? 0.95 : 0.85) * (king ? ROYAL.charisma : 1))
      if (this.rnd() > willing) {
        decline('They will hold their own walls this time.')
        continue
      }
      const frac = Math.min(king ? 0.7 : 0.55, (spare / Math.max(1, total(src.garrison))) * (king ? ROYAL.charisma : 1))
      const army = this.send(src, frac, `${this.f.name.split(' of ').pop()} Contingent`, { type: 'rally', x: m.rallyX, z: m.rallyZ, hostId: m.id }, { keep: 220 })
      if (!army) continue
      this.engine.addMusterContingent(m.id, army)
      if (loud) this.engine.log('ally', `${this.f.name} answers the summons`, `${totalInt(army.troops)} soldiers march from ${src.name} to the rally point.`, src.x, src.z)
    }
  }

  /**
   * When one of our castles faces more enemies than its garrison can hold,
   * ask the allies for help (the same call the player can make).
   */
  private requestAid() {
    if (this.id === PLAYER || this.engine.aidAllies(this.id).length === 0) return
    for (const c of this.myCastles()) {
      if (c.village || this.engine.aidProblem(c.id, this.id)) continue
      const threat = this.engine.threatTo(c)
      if (threat < 150 || threat < total(c.garrison) * 0.9) continue
      this.engine.callForAid(c.id, this.id)
    }
  }

  /**
   * Calls for aid from allied castles: the same judgement as a muster. A lord
   * who is close, safe, uncommitted and has men to spare sends them to stand
   * in the castle; they go home when the call ends.
   */
  private answerAidCalls() {
    if (this.id === PLAYER) return
    for (const call of this.s.aidCalls ?? []) {
      if (call.team !== this.team || call.faction === this.id || call.answered.includes(this.id)) continue
      call.answered.push(this.id)
      const target = this.engine.castle(call.castleId)
      if (!target) continue
      const loud = call.faction === PLAYER
      const decline = (why: string) => {
        if (loud) this.engine.log('ally', `${this.f.name} cannot send aid`, why)
      }
      if (this.engine.committedToMuster(this.id)) {
        decline('Their troops are already marching for a muster.')
        continue
      }
      if (this.threatened()) {
        decline('Their own lands are under threat.')
        continue
      }
      const src = this.nearestOwn(target.x, target.z, (c) => !c.battleId && !c.village)
      if (!src || Math.hypot(src.x - target.x, src.z - target.z) > this.engine.aidReach()) continue // too far: quietly stay home
      // Defensive help: a lord keeps less at home than for an attack (a fifth of capacity, at least 200).
      const keep = Math.max(200, this.engine.capacity(src) * 0.2)
      const spare = total(src.garrison) - keep
      if (spare < 120) {
        decline('They have no soldiers to spare.')
        continue
      }
      const willing = this.personality() === 'defensive' ? 0.65 : this.personality() === 'aggressive' ? 0.8 : 0.85
      if (this.rnd() > willing) {
        decline('They will hold their own walls this time.')
        continue
      }
      const frac = Math.min(0.5, spare / Math.max(1, total(src.garrison)))
      const army = this.send(src, frac, `${this.f.name.split(' of ').pop()} Aid`, { type: 'station', castleId: target.id }, { keep })
      if (!army) continue
      this.engine.addAidContingent(call.id, army)
      if (loud) this.engine.log('ally', `${this.f.name} sends aid`, `${totalInt(army.troops)} soldiers march from ${src.name} to stand in ${target.name}.`, src.x, src.z)
    }
  }

  /**
   * Alliance War: a strong, safe lord may call a muster against a nearby
   * castle, but only when the alliance around it can clearly take it.
   */
  private organizeMuster() {
    if ((this.s.rules.mode !== 'alliance' && this.s.rules.mode !== 'grand') || this.team === 'N' || this.id === PLAYER) return
    const ai = this.f.ai
    if ((ai.nextMusterAt ?? 0) > this.s.time) return
    ai.nextMusterAt = this.s.time + 90 + this.rnd() * 90
    const live = this.s.musters.filter((m) => m.team === this.team)
    if (live.length >= 3 || live.some((m) => m.organizer === this.id)) return
    if (this.myCastles().length < (this.f.leader ? 1 : 2) || this.threatened() || this.engine.committedToMuster(this.id)) return
    const mine = this.myCastles()
    // Target: the closest hostile castle to our lands that is not already targeted.
    let best: { c: Castle; d: number } | null = null
    for (const c of this.s.castles) {
      if (!this.engine.isHostile(c.faction, this.id) || live.some((m) => m.targetCastleId === c.id) || c.battleId) continue
      if (c.ruined || c.faction === 'neutral') continue
      let d = Infinity
      for (const o of mine) d = Math.min(d, Math.hypot(o.x - c.x, o.z - c.z))
      d *= this.engine.targetBias(this.id, c.faction)
      if (d < this.d(1300) && (!best || d < best.d)) best = { c, d }
    }
    if (!best) return
    const target = best.c
    // Can the alliance nearby actually take it? Sum what allied lords could spare.
    let spare = 0
    for (const c of this.s.castles) {
      if (this.engine.team(c.faction) !== this.team || c.faction === 'neutral' || c.battleId) continue
      if (Math.hypot(c.x - target.x, c.z - target.z) > this.d(1600)) continue
      spare += Math.max(0, this.spare(c)) * 1.3
    }
    if (spare < this.foeCastle(target) * 1.8) return
    const rally = this.nearestOwn(target.x, target.z, (c) => !c.battleId)
    if (!rally) return
    if (this.engine.summonAlliance(target.id, { castleId: rally.id }, this.id)) return
    // The organiser sends its own contingent first.
    const m = this.s.musters.find((x) => x.organizer === this.id && x.targetCastleId === target.id)
    if (!m) return
    const frac = Math.min(0.55, Math.max(0, this.spare(rally)) / Math.max(1, total(rally.garrison)))
    if (frac > 0.1) {
      const army = this.send(rally, frac, `${this.f.name.split(' of ').pop()} Host`, { type: 'rally', x: m.rallyX, z: m.rallyZ, hostId: m.id }, { keep: 220 })
      if (army) this.engine.addMusterContingent(m.id, army)
    }
  }

  /** Alliance leaders pick a front-line castle for the whole alliance to converge on. */
  private chooseFocus() {
    if (!this.f.leader || this.team === 'N') return
    const team = this.team as 'A' | 'B' | 'C'
    const cur = this.s.teamFocus[team]
    const curCastle = this.engine.castle(cur?.castleId)
    if (cur && cur.until > this.s.time && curCastle && this.engine.isHostile(curCastle.faction, this.id)) return
    const ours = this.s.castles.filter((c) => this.engine.team(c.faction) === team)
    if (ours.length === 0) return
    let best: { c: Castle; score: number } | null = null
    for (const c of this.s.castles) {
      if (!this.engine.isHostile(c.faction, this.id) || c.ruined || (c.village && c.faction === 'neutral')) continue
      let near = Infinity
      for (const o of ours) near = Math.min(near, Math.hypot(o.x - c.x, o.z - c.z))
      const score = near * this.engine.targetBias(this.id, c.faction) + this.foeCastle(c) * 0.35 + (c.faction === 'neutral' ? -100 : 0)
      if (!best || score < best.score) best = { c, score }
    }
    if (!best) return
    this.s.teamFocus[team] = { castleId: best.c.id, until: this.s.time + 200 }
    if (team === 'A' && this.s.rules.mode === 'alliance') {
      this.engine.log('ally', `The alliance marches on ${best.c.name}`, `${this.f.name} calls every lord within reach to the assault.`, best.c.x, best.c.z)
    } else if (team === 'B' && this.s.rules.mode === 'alliance' && this.engine.isVisible(best.c.x, best.c.z)) {
      this.engine.log('warning', `The enemy alliance targets ${best.c.name}`, 'Expect several hosts to converge there.', best.c.x, best.c.z)
    }
  }

  private raid() {
    const ai = this.f.ai
    if (this.s.time < ai.nextRaidAt) return
    const pmult = this.personality() === 'aggressive' ? 0.75 : this.personality() === 'defensive' ? 1.5 : 1
    const base = this.hostileToPlayer ? foeDifficulty(this.s.rules.mode, this.s.difficulty).raidEvery : 110
    ai.nextRaidAt = this.s.time + base * pmult * (0.75 + this.rnd() * 0.5)
    const sources = this.myCastles()
      .filter((c) => !c.battleId && total(c.garrison) > 350)
      .sort((a, b) => total(b.garrison) - total(a.garrison))
    const src = sources[0]
    if (!src) return
    // Burn hostile outposts that threaten our lands.
    const camp = this.s.outposts
      .filter((o) => this.engine.isHostile(o.faction, this.id) && this.engine.outpostKnown(this.team, o) && Math.hypot(o.x - src.x, o.z - src.z) < this.d(1100))
      .sort((a, b) => Math.hypot(a.x - src.x, a.z - src.z) - Math.hypot(b.x - src.x, b.z - src.z))[0]
    if (camp && this.rnd() < 0.45) {
      const army = this.send(src, 0.35, 'Torchbearers', { type: 'move', x: camp.x, z: camp.z }, { keep: 200 })
      if (army && camp.faction === PLAYER) this.engine.log('warning', `Raiders march on ${camp.name}`, `${army.name} of ${this.f.name} means to burn it. Keep it garrisoned!`, camp.x, camp.z)
      return
    }
    const team = this.team as 'A' | 'B' | 'C'
    const playerCall = team === 'A' && this.s.callToArms && this.s.callToArms.until > this.s.time ? this.s.callToArms : null
    const focus = playerCall ?? (this.s.teamFocus[team] && this.s.teamFocus[team]!.until > this.s.time ? this.s.teamFocus[team] : null)
    let call = this.engine.castle(focus?.castleId)
    if (call && !this.engine.isHostile(call.faction, this.id)) call = undefined
    const reach = 1400
    const targets = this.s.castles
      .filter((c) => !c.ruined && !(c.village && c.faction === 'neutral') && this.engine.isHostile(c.faction, this.id) && !this.engine.atPeace(this.id, c.faction) && !(c.battleId && this.engine.battle(c.battleId)?.sideA.team !== this.team))
      .map((c) => {
        const d = Math.hypot(c.x - src.x, c.z - src.z)
        let score = d * 0.9 * this.engine.targetBias(this.id, c.faction) + this.foeCastle(c) * 0.8 + (c.faction === 'neutral' ? 150 : 0)
        if (call && c.id === call.id) score -= 900
        // Scouted (or betrayed by captured scouts): we know what we face there.
        if (c.id === this.f.ai.knownTarget) score -= 500
        if (c.faction === PLAYER && this.s.rules.mode !== 'grand') score -= 120 // keep pressure on the human
        return { c, d, score }
      })
      .filter((t) => t.d < (call && t.c.id === call.id ? 2400 : reach))
      .sort((a, b) => a.score - b.score)
    const pick = targets[0]
    if (!pick) return
    const need = this.foeCastle(pick.c) * 1.5
    const have = power(src.garrison, this.engine.units)
    const answering = !!call && pick.c.id === call.id
    // Converging on a shared target: commit even if this lord alone could not take it.
    if (answering ? have * 0.6 < need * 0.35 : have * 0.6 < need) return
    const frac = answering ? 0.6 : Math.min(0.6, (need * 1.3) / have)
    const army = this.send(src, frac, answering ? 'Allied Host' : this.team === 'B' ? 'Raiders' : 'Warband', { type: 'attack', castleId: pick.c.id }, { keep: 200 })
    if (!army) return
    if (pick.c.faction === PLAYER && this.engine.isVisible(src.x, src.z)) {
      this.engine.log('warning', 'Raiders sighted', `${army.name} of ${this.f.name} marches from ${src.name} towards ${pick.c.name}.`, src.x, src.z)
    } else if (answering && playerCall) {
      this.engine.log('ally', `${this.f.name} answers the call`, `${totalInt(army.troops)} soldiers march on ${pick.c.name}.`, src.x, src.z)
    }
  }

  private retake() {
    const ai = this.f.ai
    const due = ai.retakeQueue.filter((r) => r.at <= this.s.time)
    if (due.length === 0) return
    ai.retakeQueue = ai.retakeQueue.filter((r) => r.at > this.s.time)
    for (const r of due) {
      const c = this.engine.castle(r.castleId)
      if (!c || !this.engine.isHostile(c.faction, this.id)) continue
      const src = this.myCastles()
        .filter((d) => !d.battleId)
        .sort((x, y) => Math.hypot(x.x - c.x, x.z - c.z) - Math.hypot(y.x - c.x, y.z - c.z))[0]
      if (!src || Math.hypot(src.x - c.x, src.z - c.z) > this.d(1800)) continue
      const need = this.foeCastle(c) * 1.6
      const have = power(src.garrison, this.engine.units)
      if (have * 0.6 < need) {
        if (ai.retakeQueue.length < 4) ai.retakeQueue.push({ castleId: c.id, at: this.s.time + 60 })
        continue
      }
      this.send(src, Math.min(0.65, (need * 1.3) / have), 'Reconquest Host', { type: 'attack', castleId: c.id }, { keep: 200 })
    }
  }

  // ---------------------------------------------------------------------------
  // The Great Host: detachments from several castles converge on a rally point,
  // merge into one huge army, and then march on the enemy.
  // ---------------------------------------------------------------------------

  private pickHostTarget(fromX: number, fromZ: number): Castle | undefined {
    return this.s.castles
      .filter((c) => this.engine.isHostile(c.faction, this.id) && c.faction !== 'neutral' && !c.ruined)
      .map((c) => {
        let score = Math.hypot(c.x - fromX, c.z - fromZ) * this.engine.targetBias(this.id, c.faction) + this.foeCastle(c) * 0.3
        if (c.faction === PLAYER && this.s.rules.mode !== 'grand') score -= 400
        if (c.capital) score -= 150
        return { c, score }
      })
      .sort((a, b) => a.score - b.score)[0]?.c
  }

  private greatHost() {
    const e = this.engine
    const h = this.f.host
    if (!h) return
    const t = this.s.time
    const diff = foeDifficulty(this.s.rules.mode, this.s.difficulty)
    const every = this.hostileToPlayer ? diff.hostEvery : 300
    const fraction = this.hostileToPlayer ? diff.hostFraction : 0.5
    const capital = e.castle(this.f.capitalId) ?? this.myCastles()[0]
    if (!capital) return

    if (h.phase === 'idle') {
      if (t < h.nextAt) return
      const castles = this.myCastles().filter((c) => !c.battleId && total(c.garrison) > 350)
      const target = this.pickHostTarget(capital.x, capital.z)
      if (castles.length < 1 || !target) {
        h.nextAt = t + 60
        return
      }
      const staging = castles.find((c) => c.staging)
      const origin = staging ?? capital
      const d = Math.hypot(target.x - origin.x, target.z - origin.z) || 1
      const step = staging ? 170 : d * 0.4
      let rx = origin.x + ((target.x - origin.x) / d) * step
      let rz = origin.z + ((target.z - origin.z) / d) * step
      ;[rx, rz] = e.world.nearestPassable(rx, rz)
      const donors = castles.sort((a, b) => total(b.garrison) - total(a.garrison)).slice(0, 3 + Math.min(1, h.wave))
      h.detachmentIds = []
      for (const dnr of donors) {
        const a = this.send(dnr, dnr.capital ? fraction * 0.8 : fraction, 'Host Detachment', { type: 'rally', x: rx, z: rz, hostId: this.id }, { keep: 180 })
        if (a) h.detachmentIds.push(a.id)
      }
      if (h.detachmentIds.length === 0) {
        h.nextAt = t + 60
        return
      }
      h.phase = 'mustering'
      h.rallyX = rx
      h.rallyZ = rz
      h.startedAt = t
      h.hostId = null
      if (this.hostileToPlayer) {
        const near = e.nearestCastle(rx, rz, this.id)
        e.log('warning', 'A Great Host is mustering!', `Spies report ${this.f.name} gathering detachments near ${near?.name ?? 'the border'}. Strike them before they unite.`, rx, rz)
      } else if (this.team === 'A') {
        e.log('ally', `${this.f.name} musters a host`, 'Allied detachments are gathering for a great offensive.', rx, rz)
      }
      return
    }

    if (h.phase === 'mustering' || h.phase === 'gathered') {
      h.detachmentIds = h.detachmentIds.filter((id) => !!e.army(id))
      let host = e.army(h.hostId)
      if (h.hostId && !host) h.hostId = null
      for (const id of [...h.detachmentIds]) {
        const a = e.army(id)!
        const atRally = Math.hypot(a.x - h.rallyX, a.z - h.rallyZ) < 70 && a.status === 'idle'
        if (!atRally) continue
        if (!host) {
          host = a
          h.hostId = a.id
          a.name = 'The Great Host'
        } else if (host.id !== a.id && !host.battleId) {
          // The host marches as a battle group: up to four detachments ride as its escorts (in a box
          // round it, fanning out round the castle it assaults); any more fold into it.
          if (e.capsArmies && e.escortsOf(host).length < 4) a.stance = { kind: 'escortArmy', targetId: host.id }
          else e.mergeArmies(host, a)
        }
        h.detachmentIds = h.detachmentIds.filter((x) => x !== a.id)
      }
      if (host && (h.detachmentIds.length === 0 || t - h.startedAt > 150) && h.phase === 'mustering') {
        h.phase = 'gathered'
        h.startedAt = t
        for (const id of h.detachmentIds) {
          const d = e.army(id)
          if (d && e.capsArmies && e.escortsOf(host).length < 4) d.stance = { kind: 'escortArmy', targetId: host.id }
          else e.orderArmy(id, { type: 'join', armyId: host.id })
        }
      }
      if (!host && h.detachmentIds.length === 0) {
        h.phase = 'idle'
        h.nextAt = t + every
        if (this.hostileToPlayer) e.log('victory', 'The Great Host is scattered', `The muster of ${this.f.name} was broken before the host could form.`)
        return
      }
      if (host && h.phase === 'gathered' && t - h.startedAt > 12 && !host.battleId) {
        const target = this.pickHostTarget(host.x, host.z)
        if (!target) return
        host.retreatAt = 0.6
        e.orderArmy(host.id, { type: 'attack', castleId: target.id })
        h.phase = 'marching'
        if (this.hostileToPlayer) {
          e.log('warning', `The Great Host marches on ${target.name}!`, `${totalInt(host.troops)} soldiers of ${this.f.name} under ${e.armyLeader(host)}.`, host.x, host.z)
        } else if (this.team === 'A') {
          e.log('ally', `Allied host marches on ${target.name}`, `${totalInt(host.troops)} soldiers of ${this.f.name}.`, host.x, host.z)
        }
      }
      return
    }

    if (h.phase === 'marching') {
      const host = e.army(h.hostId)
      if (!host || (host.status === 'idle' && !host.battleId) || host.status === 'retreating') {
        h.phase = 'idle'
        h.hostId = null
        h.wave++
        h.nextAt = t + every
      }
    }
  }

  /**
   * The Usurper Queen holds court in her High Seat, but rides out at the rear of
   * some of the Great Hosts (her presence steels them), and falls back to the
   * nearest castle when enemies close in on her guard.
   */
  private queenRides() {
    const e = this.engine
    // (The Usurper Queen's Thorn Guard, or in the Three Crowns the Sun Emperor's Solar Guard.)
    const q = this.s.armies.find((a) => a.royal && a.faction === this.id)
    if (!q || q.faction !== this.id || q.battleId || q.status === 'retreating') return
    const seat = e.castle(this.f.capitalId) ?? this.myCastles().find((c) => !c.village)
    const inField = !e.inKeep(q)
    // Danger: enemy strength she can see closing on her guard.
    let threat = 0
    for (const a of this.s.armies) {
      if (!e.isHostile(a.faction, this.id) || !this.sees(a)) continue
      if (Math.hypot(a.x - q.x, a.z - q.z) < this.d(650)) threat += this.foeArmy(a)
    }
    if (inField && threat > e.armyPower(q) * 1.5) {
      const refuge = this.nearestOwn(q.x, q.z, (c) => !c.village && !c.battleId)
      if (refuge && !(q.order.type === 'station' && q.order.castleId === refuge.id)) e.orderArmy(q.id, { type: 'station', castleId: refuge.id })
      return
    }
    const h = this.f.host
    const host = h && h.phase === 'marching' ? e.army(h.hostId) : undefined
    // She rides with every other host, from the second one on.
    if (host && h && h.wave % 2 === 1) {
      // Keep to the rear of the host, inside her ring of presence.
      const tx = host.x + Math.cos(host.heading + Math.PI) * this.d(180)
      const tz = host.z + Math.sin(host.heading + Math.PI) * this.d(180)
      const [x, z] = e.world.nearestPassable(tx, tz)
      if (q.order.type !== 'move' || Math.hypot(q.order.x - x, q.order.z - z) > 80) e.orderArmy(q.id, { type: 'move', x, z })
      return
    }
    // Otherwise back to court.
    if (inField && seat && seat.faction === this.id && !(q.order.type === 'station' && q.order.castleId === seat.id)) e.orderArmy(q.id, { type: 'station', castleId: seat.id })
  }

  /**
   * The Grey Abbess and her Grey Sisters (a fixed band, like our Whisper Blades; it hides by the same
   * rules, see GameEngine.updateVeils). In order: home to mend when badly hurt; a knife for the best
   * leader in reach (our King too, if the chance is there at all); cover the Rootcutters at their
   * work; a wagon train to rob; otherwise wait at home.
   */
  private spyNextAt = 0
  private spyRaids() {
    const e = this.engine
    const s = this.s
    const band = s.armies.find((a) => a.faction === this.id && a.blades && a.commanderKey === SPY.foeKey)
    if (!band || band.battleId || band.status === 'retreating' || band.sabotage) return
    if (s.time < this.spyNextAt) return
    this.spyNextAt = s.time + 3
    const foe = (f: Faction) => e.isHostile(f, this.id) && !e.atPeace(this.id, f) && f !== NEUTRAL
    const dist = (a: { x: number; z: number }) => Math.hypot(a.x - band.x, a.z - band.z)
    const home = this.nearestOwn(band.x, band.z, (c) => !c.village && !c.battleId)
    const goHome = () => {
      if (home && !(band.order.type === 'station' && band.order.castleId === home.id)) e.orderArmy(band.id, { type: 'station', castleId: home.id })
    }
    // Badly hurt: home, where the convent fills the ranks again.
    if (total(band.troops) < e.fullStrength(band) * 0.45) return goHome()
    // Still on a hunt: keep at it while the prey is in sight.
    const o = band.order
    if (o.type === 'intercept') {
      const prey = e.army(o.armyId)
      if (prey && this.sees(prey) && prey.status !== 'retreating' && e.bladesReady(band)) return
    }
    if (o.type === 'raidConvoy' && e.convoy(o.convoyId)) return
    // 1. A knife for a leader: worth most a named commander at the head of a large host, or the King himself.
    if (e.bladesReady(band) && s.time > 240) {
      let best: Army | null = null
      let bv = 0
      for (const a of s.armies) {
        if (!foe(a.faction) || a.vassalOf || a.status === 'retreating' || !this.sees(a)) continue
        const d = dist(a)
        if (d > this.d(2600)) continue
        const king = !!a.royal
        const p = e.strikeChance(band, a)
        if (king ? p < 0.08 : p < 0.35) continue
        if (!king && !a.commanderKey && total(a.troops) < 400) continue
        const v = (king ? 5 : a.commanderKey ? 1.6 : 1) * p * Math.sqrt(e.armyPower(a)) / (1 + d / this.d(1200))
        if (v > bv) {
          bv = v
          best = a
        }
      }
      if (best) {
        e.orderArmy(band.id, { type: 'intercept', armyId: best.id })
        return
      }
    }
    // 2. Cover the Rootcutters: keep close while they are out at their work (it goes faster and quieter).
    const cutters = s.armies.find((a) => a.faction === this.id && a.sappers)
    if (cutters && !cutters.battleId && cutters.status !== 'retreating' && !(cutters.order.type === 'station' && e.insideWalls(cutters))) {
      const d = dist(cutters)
      if (d > SAPPERS.cover * 0.5) {
        const k = (d - SAPPERS.cover * 0.35) / (d || 1)
        const [x, z] = e.world.nearestPassable(band.x + (cutters.x - band.x) * k, band.z + (cutters.z - band.z) * k)
        if (!(o.type === 'move' && Math.hypot(o.x - x, o.z - z) < 40)) e.orderArmy(band.id, { type: 'move', x, z })
      } else if (o.type === 'station') e.orderArmy(band.id, { type: 'hold' })
      return
    }
    // 3. A wagon train to rob.
    for (const w of s.convoys ?? []) {
      if (!foe(w.faction) || dist(w) > this.d(2600)) continue
      e.orderArmy(band.id, { type: 'raidConvoy', convoyId: w.id })
      return
    }
    // 4. Nothing to do: home.
    if (o.type !== 'move' || band.status === 'idle') goHome()
  }

  /**
   * Brother Gall's Rootcutters (a fixed band of hidden saboteurs, the mirror of our Night Sappers).
   * In order: home to mend when badly hurt; away from our Wardens once found out; at work on a castle
   * of ours in reach; otherwise on the way to lie up outside the walls of one, the castle a host of
   * theirs is marching on first (so the walls are weakest when it arrives), else the nearest.
   */
  private cutterNextAt = 0
  private cutterRaids() {
    const e = this.engine
    const s = this.s
    const band = s.armies.find((a) => a.faction === this.id && a.sappers)
    if (!band || band.battleId || band.status === 'retreating' || band.sabotage) return
    if (s.time < this.cutterNextAt) return
    this.cutterNextAt = s.time + 3
    const foe = (f: Faction) => e.isHostile(f, this.id) && !e.atPeace(this.id, f) && f !== NEUTRAL
    const dist = (a: { x: number; z: number }) => Math.hypot(a.x - band.x, a.z - band.z)
    const home = this.nearestOwn(band.x, band.z, (c) => !c.village && !c.battleId)
    const goHome = () => {
      if (home && !(band.order.type === 'station' && band.order.castleId === home.id)) e.orderArmy(band.id, { type: 'station', castleId: home.id })
    }
    if (total(band.troops) < e.fullStrength(band) * 0.45) return goHome()
    // Found out with enemy riders or a host close by: back home before they are ridden down.
    if (!band.veil) {
      for (const a of s.armies) {
        if (!foe(a.faction) || a.veil || !this.sees(a) || dist(a) > 520) continue
        if (a.wardens || e.armyPower(a) > e.armyPower(band) * 1.5) return goHome()
      }
    }
    if (s.time < 240 || (band.sabotageReadyAt ?? 0) > s.time) {
      if (band.order.type !== 'move' || band.status === 'idle') goHome()
      return
    }
    if (!e.sabotageProblem(band)) {
      const tg = e.sabotageTargets(band)[0]
      // The Grey Sisters on their way to cover the work: wait for them (they are a few seconds off).
      const sisters = s.armies.find((a) => a.faction === this.id && a.blades && !a.battleId && a.status !== 'retreating')
      if (tg && sisters && !e.sapperCover(band) && dist(sisters) < 900 && !(sisters.order.type === 'intercept')) return
      if (tg) {
        // A host of theirs on the way: open the walls; else whatever hurts most at random.
        const assault = s.armies.some((a) => a.faction === this.id && a.order.type === 'attack' && a.order.castleId === tg.id)
        const pick: SabotageKind = assault && tg.kinds.includes('postern') ? 'postern' : tg.kinds[Math.floor(this.rnd() * tg.kinds.length)]
        e.startSabotage(band.id, tg.id, pick)
        return
      }
    }
    let mark: Castle | null = null
    for (const a of s.armies) {
      if (a.faction !== this.id || a.order.type !== 'attack') continue
      const c = e.castle(a.order.castleId)
      if (c && !c.village && !c.ruined && foe(c.faction) && (!mark || dist(c) < dist(mark))) mark = c
    }
    if (!mark)
      for (const c of s.castles) {
        if (c.village || c.ruined || !foe(c.faction)) continue
        if (!mark || dist(c) < dist(mark)) mark = c
      }
    if (!mark) return goHome()
    // Lie up just outside the watch on the walls, on the near side.
    const d = dist(mark) || 1
    const r = wallRadius(mark.tier) + 290
    const [x, z] = e.world.nearestPassable(mark.x + ((band.x - mark.x) / d) * r, mark.z + ((band.z - mark.z) / d) * r)
    const o = band.order
    if (!(o.type === 'move' && Math.hypot(o.x - x, o.z - z) < 40) && Math.hypot(band.x - x, band.z - z) > 30) e.orderArmy(band.id, { type: 'move', x, z })
  }

  /**
   * The Thorn Hunt (or, on autopilot, our own Wardens): mounted bowmen who find hidden bands. In
   * order: home to mend when badly hurt; away from a host that would ride them down; on the heels of
   * a spy band of ours they have found (so it cannot slip away again); riding with the largest host
   * of ours in the field; otherwise a slow round of the castle nearest the enemy.
   */
  private huntNextAt = 0
  private huntAngle = 0
  private huntPatrol() {
    const e = this.engine
    const s = this.s
    const band = s.armies.find((a) => a.faction === this.id && a.wardens)
    if (!band || band.battleId || band.status === 'retreating') return
    if (s.time < this.huntNextAt) return
    this.huntNextAt = s.time + 4
    const foe = (f: Faction) => e.isHostile(f, this.id) && !e.atPeace(this.id, f) && f !== NEUTRAL
    const dist = (a: { x: number; z: number }) => Math.hypot(a.x - band.x, a.z - band.z)
    const go = (x: number, z: number) => {
      const [px, pz] = e.world.nearestPassable(x, z)
      const o = band.order
      if (o.type === 'move' && Math.hypot(o.x - px, o.z - pz) < 90) return
      if (Math.hypot(band.x - px, band.z - pz) < 40) return
      e.orderArmy(band.id, { type: 'move', x: px, z: pz })
    }
    const home = this.nearestOwn(band.x, band.z, (c) => !c.village && !c.battleId)
    const goHome = () => {
      if (home && !(band.order.type === 'station' && band.order.castleId === home.id)) e.orderArmy(band.id, { type: 'station', castleId: home.id })
    }
    // Badly hurt: home, where the ranks are filled again.
    if (total(band.troops) < e.fullStrength(band) * 0.5) return goHome()
    // A host that could ride them down is close: fall back the way they came.
    const mine = e.armyPower(band)
    for (const a of s.armies) {
      if (!foe(a.faction) || a.veil || !this.sees(a) || a.status === 'retreating') continue
      const d = dist(a)
      if (d < 420 && e.armyPower(a) > mine * 1.4) {
        const k = 600 / (d || 1)
        return go(band.x + (band.x - a.x) * k, band.z + (band.z - a.z) * k)
      }
    }
    // A spy band of theirs found out nearby: keep within reach so it cannot hide again.
    for (const a of s.armies) {
      if (!foe(a.faction) || !e.isSpyBand(a) || a.veil || !this.sees(a) || dist(a) > this.d(2400)) continue
      const d = dist(a) || 1
      const keep = WARDENS.reveal * 0.6
      return go(a.x + ((band.x - a.x) / d) * keep, a.z + ((band.z - a.z) / d) * keep)
    }
    // Ride with the largest host in the field, a little behind it.
    let host: Army | null = null
    for (const a of s.armies) {
      if (a.faction !== this.id || a.id === band.id || a.wardens || e.isSpyBand(a) || a.vassalOf) continue
      if (a.order.type === 'station' && e.insideWalls(a)) continue
      if (total(a.troops) < 700) continue
      if (!host || total(a.troops) > total(host.troops)) host = a
    }
    if (host) {
      const back = home ? Math.hypot(home.x - host.x, home.z - host.z) || 1 : 1
      const bx = home ? host.x + ((home.x - host.x) / back) * 220 : host.x
      const bz = home ? host.z + ((home.z - host.z) / back) * 220 : host.z
      return go(bx, bz)
    }
    // A round of the castle nearest the enemy: where their hidden bands would come.
    let front: Castle | null = null
    let fd = Infinity
    for (const c of this.myCastles()) {
      if (c.village || c.ruined) continue
      for (const o of s.castles) {
        if (o.village || !foe(o.faction)) continue
        const d = Math.hypot(o.x - c.x, o.z - c.z)
        if (d < fd) {
          fd = d
          front = c
        }
      }
    }
    if (!front) return goHome()
    if (band.status === 'idle' || band.order.type === 'station') {
      this.huntAngle += 1.1 + this.rnd() * 0.8
      const r = wallRadius(front.tier) + 420
      go(front.x + Math.cos(this.huntAngle) * r, front.z + Math.sin(this.huntAngle) * r)
    }
  }
}
