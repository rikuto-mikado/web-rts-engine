import type { GameEngine } from './engine'
import { DIFFICULTY, PLAYER, capacityForTier } from './engine'
import { mulberry32 } from './noise'
import { floorTroops, power, scaleTroops, total, totalInt } from './troops'
import type { Army, Castle, Faction, FactionState, Troops } from './types'
import { castleRadius } from './world'

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
  private myArmies(): Army[] {
    return this.s.armies.filter((a) => a.faction === this.id)
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
    this.organizeMuster()
    this.chooseFocus()
    this.tidyIdleArmies()
    this.relieveSieges()
    this.interceptInvaders()
    this.greatHost()
    this.raid()
    this.retake()
  }

  // ---------------------------------------------------------------------------

  private recruit() {
    const castles = this.myCastles().filter((c) => !c.battleId)
    if (castles.length === 0) return
    const budget = this.f.gold * 0.5
    const per = budget / castles.length
    const mix = MIXES[this.personality()] ?? MIXES.balanced
    for (const c of castles) {
      if (capacityForTier(c.tier) - total(c.garrison) < 20) continue
      this.engine.recruitMix(c.id, mix, per, this.id)
    }
  }

  private captain(): { commanderKey: string | null; captainName: string } {
    const free = this.engine.freeCommanders(this.id).filter((c) => c.key !== 'malakor')
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
    return typeof res === 'string' ? null : res
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
      if (this.s.outposts.some((o) => this.engine.isHostile(o.faction, this.id) && Math.hypot(o.x - a.x, o.z - a.z) < 80)) continue
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
      const threat = besiegers.reduce((s, a) => s + this.engine.armyPower(a), 0)
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

  private interceptInvaders() {
    for (const p of this.s.armies) {
      if (!this.engine.isHostile(p.faction, this.id) || p.battleId || p.status === 'retreating') continue
      if (this.engine.isHidden(p) || this.engine.atPeace(this.id, p.faction)) continue
      const already = this.s.armies.some((a) => a.order.type === 'intercept' && a.order.armyId === p.id && this.engine.team(a.faction) === this.team)
      if (already) continue
      const near = this.myCastles().find((c) => !c.battleId && Math.hypot(c.x - p.x, c.z - p.z) < 420 + castleRadius(c.tier))
      if (!near) continue
      const threat = this.engine.armyPower(p)
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
        if (!this.engine.isHostile(a.faction, this.id) || a.status === 'retreating') continue
        if (Math.abs(a.x - c.x) < 700 && Math.abs(a.z - c.z) < 700 && Math.hypot(a.x - c.x, a.z - c.z) < 700) return true
      }
    }
    return false
  }

  /** Soldiers a castle can send away and still hold. */
  private spare(c: Castle): number {
    return total(c.garrison) - Math.max(250, capacityForTier(c.tier) * 0.35)
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
      if (!src || Math.hypot(src.x - m.rallyX, src.z - m.rallyZ) > 1500) continue // too far: quietly stay home
      const spare = this.spare(src)
      if (spare < 150) {
        decline('They have no soldiers to spare.')
        continue
      }
      const willing = this.personality() === 'defensive' ? 0.6 : this.personality() === 'aggressive' ? 0.95 : 0.85
      if (this.rnd() > willing) {
        decline('They will hold their own walls this time.')
        continue
      }
      const frac = Math.min(0.55, spare / Math.max(1, total(src.garrison)))
      const army = this.send(src, frac, `${this.f.name.split(' of ').pop()} Contingent`, { type: 'rally', x: m.rallyX, z: m.rallyZ, hostId: m.id }, { keep: 220 })
      if (!army) continue
      this.engine.addMusterContingent(m.id, army)
      if (loud) this.engine.log('ally', `${this.f.name} answers the summons`, `${totalInt(army.troops)} soldiers march from ${src.name} to the rally point.`, src.x, src.z)
    }
  }

  /**
   * Alliance War: a strong, safe lord may call a muster against a nearby
   * castle, but only when the alliance around it can clearly take it.
   */
  private organizeMuster() {
    if (this.s.rules.mode !== 'alliance' || this.team === 'N' || this.id === PLAYER) return
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
      let d = Infinity
      for (const o of mine) d = Math.min(d, Math.hypot(o.x - c.x, o.z - c.z))
      if (d < 1300 && (!best || d < best.d)) best = { c, d }
    }
    if (!best) return
    const target = best.c
    // Can the alliance nearby actually take it? Sum what allied lords could spare.
    let spare = 0
    for (const c of this.s.castles) {
      if (this.engine.team(c.faction) !== this.team || c.faction === 'neutral' || c.battleId) continue
      if (Math.hypot(c.x - target.x, c.z - target.z) > 1600) continue
      spare += Math.max(0, this.spare(c)) * 1.3
    }
    if (spare < this.engine.garrisonPower(target) * 1.8) return
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
    const team = this.team as 'A' | 'B'
    const cur = this.s.teamFocus[team]
    const curCastle = this.engine.castle(cur?.castleId)
    if (cur && cur.until > this.s.time && curCastle && this.engine.isHostile(curCastle.faction, this.id)) return
    const ours = this.s.castles.filter((c) => this.engine.team(c.faction) === team)
    if (ours.length === 0) return
    let best: { c: Castle; score: number } | null = null
    for (const c of this.s.castles) {
      if (!this.engine.isHostile(c.faction, this.id)) continue
      let near = Infinity
      for (const o of ours) near = Math.min(near, Math.hypot(o.x - c.x, o.z - c.z))
      const score = near + this.engine.garrisonPower(c) * 0.35 + (c.faction === 'neutral' ? -100 : 0)
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
    const siege = this.s.rules.mode === 'siege'
    const base = siege ? 40 : this.hostileToPlayer ? DIFFICULTY[this.s.difficulty].raidEvery : 110
    ai.nextRaidAt = this.s.time + base * pmult * (0.75 + this.rnd() * 0.5)
    const sources = this.myCastles()
      .filter((c) => !c.battleId && total(c.garrison) > 350)
      .sort((a, b) => total(b.garrison) - total(a.garrison))
    const src = sources[0]
    if (!src) return
    // Burn hostile outposts that threaten our lands.
    const camp = this.s.outposts
      .filter((o) => this.engine.isHostile(o.faction, this.id) && Math.hypot(o.x - src.x, o.z - src.z) < 1100)
      .sort((a, b) => Math.hypot(a.x - src.x, a.z - src.z) - Math.hypot(b.x - src.x, b.z - src.z))[0]
    if (camp && this.rnd() < 0.45) {
      const army = this.send(src, 0.35, 'Torchbearers', { type: 'move', x: camp.x, z: camp.z }, { keep: 200 })
      if (army && camp.faction === PLAYER) this.engine.log('warning', `Raiders march on ${camp.name}`, `${army.name} of ${this.f.name} means to burn it. Keep it garrisoned!`, camp.x, camp.z)
      return
    }
    const team = this.team as 'A' | 'B'
    const playerCall = team === 'A' && this.s.callToArms && this.s.callToArms.until > this.s.time ? this.s.callToArms : null
    const focus = playerCall ?? (this.s.teamFocus[team] && this.s.teamFocus[team]!.until > this.s.time ? this.s.teamFocus[team] : null)
    let call = this.engine.castle(focus?.castleId)
    if (call && !this.engine.isHostile(call.faction, this.id)) call = undefined
    const reach = 1400
    const targets = this.s.castles
      .filter((c) => this.engine.isHostile(c.faction, this.id) && !this.engine.atPeace(this.id, c.faction) && !(c.battleId && this.engine.battle(c.battleId)?.sideA.team !== this.team))
      .map((c) => {
        const d = Math.hypot(c.x - src.x, c.z - src.z)
        let score = d * 0.9 + this.engine.garrisonPower(c) * 0.8 + (c.faction === 'neutral' ? 150 : 0)
        if (call && c.id === call.id) score -= 900
        if (c.faction === PLAYER) score -= 120 // keep pressure on the human
        return { c, d, score }
      })
      .filter((t) => t.d < (call && t.c.id === call.id ? 2400 : reach))
      .sort((a, b) => a.score - b.score)
    const pick = targets[0]
    if (!pick) return
    const need = this.engine.garrisonPower(pick.c) * 1.5
    const have = power(src.garrison, this.engine.units)
    const answering = !!call && pick.c.id === call.id
    // Besiegers keep the pressure on in waves, whatever the odds.
    const besieger = siege && this.myCastles().some((c) => c.staging)
    // Converging on a shared target: commit even if this lord alone could not take it.
    if (!besieger && (answering ? have * 0.6 < need * 0.35 : have * 0.6 < need)) return
    const frac = besieger ? 0.55 : answering ? 0.6 : Math.min(0.6, (need * 1.3) / have)
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
      if (!src || Math.hypot(src.x - c.x, src.z - c.z) > 1800) continue
      const need = this.engine.garrisonPower(c) * 1.6
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
      .filter((c) => this.engine.isHostile(c.faction, this.id) && c.faction !== 'neutral')
      .map((c) => {
        let score = Math.hypot(c.x - fromX, c.z - fromZ) + this.engine.garrisonPower(c) * 0.3
        if (c.faction === PLAYER) score -= 400
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
    const diff = DIFFICULTY[this.s.difficulty]
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
          e.mergeArmies(host, a)
        }
        h.detachmentIds = h.detachmentIds.filter((x) => x !== a.id)
      }
      if (host && (h.detachmentIds.length === 0 || t - h.startedAt > 150) && h.phase === 'mustering') {
        h.phase = 'gathered'
        h.startedAt = t
        for (const id of h.detachmentIds) e.orderArmy(id, { type: 'join', armyId: host.id })
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
}
