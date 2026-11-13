import type { GameEngine } from './engine'
import type { Army, ArmyOrder, Castle, Convoy, ConvoyStanceKind, Faction, Stance, Team } from './types'

/**
 * Convoy Raid: standing orders, and the computer opponent that hands them out.
 *
 * Any army on the forest road can carry a standing order (`Army.stance`) that it carries out
 * by itself: the player sets them for the bands they cannot watch, the computer for all of its
 * own. Orders given by hand clear the stance (see GameEngine.orderArmy).
 */

/** What each standing order is called and does (for the panel and the map labels). */
export const STANCES: Record<ConvoyStanceKind, { name: string; side: 'escort' | 'raid'; text: string; here?: boolean; engineers?: boolean; blades?: boolean }> = {
  escort: { name: 'Escort', side: 'escort', text: 'Walk beside the next wagon nobody guards, a little ahead of it.' },
  hunt: { name: 'Hunt', side: 'escort', text: 'Ride down raiders seen near the wagons, then ride ahead of the leading wagon.' },
  picket: { name: 'Picket', side: 'escort', here: true, text: 'Hold this stretch of road and drive off raiders who come near. Engineers posted by the river rebuild the bridge if it comes down.' },
  ambush: { name: 'Ambush', side: 'raid', here: true, text: 'Lie in the trees here and fall on the first wagon that comes by with its guards elsewhere (or too weak to stop you).' },
  harass: { name: 'Harass', side: 'raid', here: true, text: 'Strike the guards of a wagon passing near here and keep them busy: a guard locked in a fight cannot protect its wagon, so another band can take it.' },
  bridge: { name: 'Bridge', side: 'raid', engineers: true, text: 'Wait by the bridge, pull it down as the first wagon nears it, then lie in wait where the ford road meets the road again.' },
  strike: { name: 'Strike', side: 'raid', here: true, blades: true, text: 'The Whisper Blades: lie hidden here, and when ready, go for the leader of the guards walking with a wagon nearby. Struck down, the guards break; a wagon left without guards they take themselves.' },
}

/** How far a standing order lets the army look for trouble. */
const REACH = { hunt: 520, picket: 380, ambush: 480, harass: 650, strike: 700 }

const wagonsOf = (e: GameEngine): Convoy[] => (e.state.convoys ?? []).filter((w) => w.race).sort((a, b) => a.path.length - b.path.length)
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
const free = (a: Army) => !a.battleId && a.status !== 'retreating'

/** Give an order on the army's own account (it keeps its stance). */
function act(e: GameEngine, a: Army, order: ArmyOrder) {
  const st = a.stance
  e.orderArmy(a.id, order, true)
  a.stance = st
}
function goTo(e: GameEngine, a: Army, x: number, z: number, slack = 40) {
  const o = a.order
  if (o.type === 'move' && Math.hypot(o.x - x, o.z - z) < slack) return
  if (o.type !== 'move' && Math.hypot(a.x - x, a.z - z) < slack) return
  act(e, a, { type: 'move', x, z })
}
/** A point beside the road at index i, `off` units to one side. */
export function besideRoad(e: GameEngine, i: number, off: number): [number, number] {
  const road = e.state.rules.convoy!.road
  const k = Math.max(0, Math.min(road.length - 2, i))
  const [x, z] = road[k]
  const [nx, nz] = road[k + 1]
  const l = Math.hypot(nx - x, nz - z) || 1
  return e.world.nearestPassable(x + (-(nz - z) / l) * off, z + ((nx - x) / l) * off)
}
/** The road point nearest a place. */
export function roadIndexNear(e: GameEngine, x: number, z: number): number {
  const road = e.state.rules.convoy!.road
  let best = 0
  let bd = Infinity
  for (let i = 0; i < road.length; i++) {
    const d = Math.hypot(road[i][0] - x, road[i][1] - z)
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

/** Each second and a half: every army with a standing order carries it out. */
export function runStances(e: GameEngine) {
  for (const a of e.state.armies) if (a.stance && free(a) && a.order.type !== 'work') runStance(e, a, a.stance)
}

function runStance(e: GameEngine, a: Army, st: Stance) {
  const cv = e.state.rules.convoy
  if (!cv) return
  const team = e.team(a.faction)
  const wagons = wagonsOf(e)
  const foes = e.state.armies.filter((b) => e.team(b.faction) !== team && b.status !== 'retreating' && e.canSee(team, b))
  const post = { x: st.x ?? a.x, z: st.z ?? a.z }
  switch (st.kind) {
    case 'escort': {
      // Our wagon: the one we already walk with, else the furthest along that nobody guards.
      let cur = a.order.type === 'escort' ? e.convoy(a.order.convoyId) : undefined
      const guarded = (w: Convoy) => e.state.armies.some((b) => b.id !== a.id && b.faction === a.faction && b.order.type === 'escort' && b.order.convoyId === w.id && b.stance?.kind !== 'hunt')
      // Our wagon is safe and another stands alone with raiders in sight: go to that one.
      const threatened = (w: Convoy) => foes.some((f) => dist(f, w) < 450)
      if (cur && !threatened(cur)) {
        const need = wagons.find((x) => x !== cur && threatened(x) && !e.state.armies.some((b) => b.faction === a.faction && free(b) && dist(b, x) < 160))
        if (need) cur = need
      }
      const w = cur ?? wagons.find((x) => !guarded(x)) ?? wagons[wagons.length - 1]
      if (w) {
        if (!(a.order.type === 'escort' && a.order.convoyId === w.id)) act(e, a, { type: 'escort', convoyId: w.id, ahead: 35 })
      } else {
        // Nothing on the road yet: wait where the next wagon will set out.
        const [x, z] = besideRoad(e, 8, a.id.charCodeAt(a.id.length - 1) % 2 ? 50 : -50)
        goTo(e, a, x, z, 70)
      }
      return
    }
    case 'hunt':
    case 'picket': {
      const reach = REACH[st.kind]
      // Hunters look round the wagons; a picket round its post.
      const centres = st.kind === 'hunt' ? wagons : [post]
      let prey: Army | undefined
      let pd = Infinity
      for (const f of foes) {
        if (!centres.length) break
        const d = Math.min(...centres.map((c) => dist(c, f)))
        if (d < reach && dist(a, f) < pd && e.armyPower(a) > e.armyPower(f) * 0.5) {
          prey = f
          pd = dist(a, f)
        }
      }
      if (prey) {
        if (!(a.order.type === 'intercept' && a.order.armyId === prey.id)) act(e, a, { type: 'intercept', armyId: prey.id })
        return
      }
      // Engineers on picket by the river put the bridge back up.
      if (st.kind === 'picket' && (a.troops.engineers ?? 0) >= 15 && e.trainBridgeDown() && dist(post, { x: cv.bridge[0], z: cv.bridge[1] }) < 300) {
        const [bx, bz] = cv.road[Math.max(0, cv.rejoin - 9)]
        if (Math.hypot(a.x - bx, a.z - bz) < 50) {
          const before = a.stance
          e.startWork(a.id, 'bridge')
          a.stance = before
        } else goTo(e, a, bx, bz, 25)
        return
      }
      if (st.kind === 'hunt') {
        // Nothing to chase: ride ahead of the leading wagon, screening the road.
        const lead = wagons[0]
        if (lead) {
          if (!(a.order.type === 'escort' && a.order.convoyId === lead.id)) act(e, a, { type: 'escort', convoyId: lead.id, ahead: 140 })
        } else goTo(e, a, ...besideRoad(e, 12, 60), 70)
      } else goTo(e, a, post.x, post.z, 30)
      return
    }
    case 'ambush':
    case 'harass': {
      const power = e.armyPower(a)
      const guardsAt = (w: Convoy) => e.state.armies.filter((b) => e.team(b.faction) === e.team(w.faction) && b.status !== 'retreating' && !b.battleId && dist(b, w) < 220)
      if (st.kind === 'ambush') {
        // A wagon in reach whose free guards we can beat (or none): take it.
        const prey = wagons.find((w) => e.isHostile(w.faction, a.faction) && dist(w, post) < REACH.ambush && guardsAt(w).reduce((p, b) => p + e.armyPower(b), 0) <= power * 1.1)
        if (prey) {
          if (!(a.order.type === 'raidConvoy' && a.order.convoyId === prey.id)) act(e, a, { type: 'raidConvoy', convoyId: prey.id })
          return
        }
      } else {
        // Harass: go for the guards of a wagon passing near; the fight pins them.
        for (const w of wagons) {
          if (!e.isHostile(w.faction, a.faction) || dist(w, post) > REACH.harass) continue
          const g = guardsAt(w).sort((x, y) => dist(x, a) - dist(y, a))[0]
          if (g) {
            if (!(a.order.type === 'intercept' && a.order.armyId === g.id)) act(e, a, { type: 'intercept', armyId: g.id })
            return
          }
          // Its guards are gone: the wagon itself.
          if (!(a.order.type === 'raidConvoy' && a.order.convoyId === w.id)) act(e, a, { type: 'raidConvoy', convoyId: w.id })
          return
        }
      }
      goTo(e, a, post.x, post.z, 30)
      return
    }
    case 'strike': {
      // The Whisper Blades: when ready, the leader of the strongest guard near a wagon in reach.
      if (e.bladesReady(a)) {
        let prey: Army | undefined
        let best = 0
        for (const f of foes) {
          if (f.battleId && !f.commanderKey) continue
          const w = wagons.find((x) => e.isHostile(x.faction, a.faction) && dist(x, f) < 260 && dist(x, post) < REACH.strike)
          if (!w) continue
          // Worth most: a named commander, a strong guard, a good chance.
          const v = e.armyPower(f) * (f.commanderKey ? 1.5 : 1) * e.strikeChance(a, f)
          if (v > best) {
            best = v
            prey = f
          }
        }
        if (prey) {
          if (!(a.order.type === 'intercept' && a.order.armyId === prey.id)) act(e, a, { type: 'intercept', armyId: prey.id })
          return
        }
      }
      // A wagon in reach left without a guard on its feet (its guards struck down and fled): take it.
      const bare = wagons.find((w) => e.isHostile(w.faction, a.faction) && dist(w, post) < REACH.strike && !e.state.armies.some((b) => e.team(b.faction) === e.team(w.faction) && free(b) && dist(b, w) < 220))
      if (bare) {
        if (!(a.order.type === 'raidConvoy' && a.order.convoyId === bare.id)) act(e, a, { type: 'raidConvoy', convoyId: bare.id })
        return
      }
      // Regrouping, or nothing in reach: back into the trees at the post.
      goTo(e, a, post.x, post.z, 30)
      return
    }
    case 'bridge': {
      if ((a.troops.engineers ?? 0) < 10) {
        a.stance = { kind: 'ambush', x: a.x, z: a.z }
        return
      }
      const [bx, bz] = cv.bridge
      if (!e.trainBridgeDown()) {
        const coming = wagons.some((w) => e.isHostile(w.faction, a.faction) && !w.detour && w.path.length > cv.road.length - cv.rejoin && Math.hypot(w.x - bx, w.z - bz) < 800)
        if (!coming) {
          goTo(e, a, ...besideRoad(e, Math.max(0, cv.rejoin - 4), 110), 40)
          return
        }
        if (Math.hypot(a.x - bx, a.z - bz) < 70) {
          const before = a.stance
          const err = e.startWork(a.id, 'demolish')
          a.stance = before
          if (!err) return
        }
        goTo(e, a, bx, bz, 20)
        return
      }
      // The bridge is down: wait where the ford road comes back to the road, and take what comes by.
      const [rx, rz] = besideRoad(e, cv.rejoin + 2, 90)
      runStance(e, a, { kind: 'ambush', x: rx, z: rz })
      return
    }
  }
}

/**
 * The computer's side. It hands its armies standing orders and moves its ambushes up the road as
 * the wagons pass them; the escort halts the train while a wagon is caught alone with raiders in sight.
 */
export class ConvoyAI {
  private engine: GameEngine
  private id: Faction
  private team: Team
  private nextAt = 0
  /** Escort: when the train was halted, and until when it will not halt again. */
  private haltedAt = -1
  private noHaltUntil = 0

  constructor(engine: GameEngine, id: Faction) {
    this.engine = engine
    this.id = id
    this.team = engine.team(id)
  }
  onCastleLost(_c: Castle) {}

  update() {
    const e = this.engine
    const s = e.state
    if (s.time < this.nextAt || s.status !== 'active' || !s.rules.convoy) return
    this.nextAt = s.time + 1.5
    const cv = s.rules.convoy
    const armies = s.armies.filter((a) => a.faction === this.id)
    const wagons = wagonsOf(e)
    if (e.trainEscort() === this.id) {
      for (const a of armies) {
        if (a.stance) continue
        if (a.name === 'Outriders') a.stance = { kind: 'hunt' }
        else if ((a.troops.engineers ?? 0) >= 15) {
          const [x, z] = besideRoad(e, Math.max(0, cv.rejoin - 10), 40)
          a.stance = { kind: 'picket', x, z }
        } else a.stance = { kind: 'escort' }
      }
      // Halt while a wagon is caught alone with raiders in sight.
      const foes = s.armies.filter((b) => e.team(b.faction) !== this.team && e.canSee(this.team, b) && b.status !== 'retreating')
      const exposed = wagons.some((w) => foes.some((f) => dist(f, w) < 450) && !armies.some((a) => free(a) && dist(a, w) < 160))
      // Never for long, though: a train that waits forever is a train that never arrives.
      let halt = exposed && s.time >= this.noHaltUntil
      if (halt && this.haltedAt < 0) this.haltedAt = s.time
      if (halt && s.time - this.haltedAt > 25) {
        halt = false
        this.noHaltUntil = s.time + 30
      }
      if (!halt) this.haltedAt = -1
      e.setTrainHalted(this.id, halt)
      return
    }
    // Raiders: ambushes along the road (one band harrying the guards), moved on ahead of the wagons once they have all gone by.
    const road = cv.road
    const leadIdx = wagons.length ? road.length - wagons[0].path.length : 0
    for (const a of armies) {
      if (!a.stance) {
        if ((a.troops.engineers ?? 0) >= 10) a.stance = { kind: 'bridge' }
        else if (a.blades) {
          // The Blades wait where the guards will be busiest: a little before the harrying horse.
          const [x, z] = besideRoad(e, Math.floor(road.length * 0.5), -120)
          a.stance = { kind: 'strike', x, z }
        }
        else {
          const spy = e.isSpyBand(a)
          // Working together: the horse strike the guards a little before the spot where the band waits.
          const [x, z] = besideRoad(e, Math.floor(road.length * (spy ? 0.58 : 0.53)), spy ? -95 : 95)
          // The light horse harry the guards; the spymaster's band takes the wagon.
          a.stance = { kind: spy ? 'ambush' : 'harass', x, z }
        }
      }
      const st = a.stance
      if ((st.kind !== 'ambush' && st.kind !== 'harass' && st.kind !== 'strike') || st.x === undefined || st.z === undefined || !free(a) || a.order.type === 'raidConvoy') continue
      const at = roadIndexNear(e, st.x, st.z)
      const ahead = wagons.some((w) => road.length - w.path.length < at)
      const due = !!s.train && s.train.sent < cv.wagons
      if (wagons.length && !ahead && !due) {
        // Everything on the road has passed this spot and no more are coming: get ahead of the leader.
        const next = Math.min(road.length - 14, leadIdx + 28)
        if (next > at + 6) {
          const [x, z] = besideRoad(e, next, at % 2 ? 95 : -95)
          a.stance = { kind: st.kind, x, z }
        }
      }
    }
  }
}
