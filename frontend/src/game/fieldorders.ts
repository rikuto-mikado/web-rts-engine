import type { GameEngine } from './engine'
import { PLAYER } from './engine'
import { total } from './troops'
import type { Army, ArmyOrder, Castle, Stance } from './types'
import { holdingRadius, wallRadius } from './world'

/**
 * Standing orders on the open field (every mode but Convoy Raid, which has its own): the player
 * gives one to a band and it carries it out by itself until an order by hand replaces it.
 *   escort: ride beside another army of ours, in a place of its own (left, right, back-left,
 *           back-right, front-left, front-right...) so that escorts never pile up on it; join its
 *           fights; the escorted army keeps to the pace of its slowest escort.
 *   follow: walk behind another army of ours, a little way back (several in a file).
 *   guard:  hold a post and fall on any enemy who comes within the radius; never chase far, and
 *           against a host much stronger stand fast at the post instead.
 * Escorts and followers never merge into the army they go with.
 */
export type FieldStanceKind = 'escortArmy' | 'follow' | 'guard'

export const FIELD_STANCES: Record<FieldStanceKind, { name: string; text: string; target?: boolean }> = {
  escortArmy: { name: 'Escort', target: true, text: 'Join another army of ours as one of its escorts (a battle group: a lead and up to four escorts). Ride in a place of your own about it, join its fights, and when it assaults a castle, fan out and go in from another side. It keeps to the pace of its slowest escort.' },
  follow: { name: 'Follow', target: true, text: 'Walk a little way behind another army of ours, wherever it goes.' },
  guard: { name: 'Guard', text: 'Hold this post and fall on any enemy who comes within the radius; back to the post when they are beaten or flee. Against a much stronger host, stand fast at the post.' },
}

/** Guard radii (small, medium, large). */
export const GUARD_RADII = [250, 400, 600] as const

/**
 * A battle group's formations: where its four escorts stand about the lead army, as (sideways,
 * forward) in spacings.
 *   box:   left, right, ahead, behind (a square round the lead: ready on every side)
 *   line:  abreast, left and right, two deep on each side (the widest front)
 *   wedge: back-left, back-right, then wider and further back (the lead is the point)
 */
export const GROUP_FORMS = {
  box: { name: 'Box', text: 'The escorts stand left, right, ahead and behind the lead army: ready on every side.', slots: [[-1, 0], [1, 0], [0, 1.05], [0, -1.05]] as [number, number][] },
  line: { name: 'Line', text: 'The escorts stand abreast of the lead, two on either side: the widest front.', slots: [[-1, 0], [1, 0], [-2, 0], [2, 0]] as [number, number][] },
  wedge: { name: 'Wedge', text: 'The lead army is the point; the escorts follow in a widening V behind it.', slots: [[-0.85, -0.95], [0.85, -0.95], [-1.7, -1.9], [1.7, -1.9]] as [number, number][] },
}
export type GroupForm = keyof typeof GROUP_FORMS

/** The places of escorts beyond the four of a formation: a ring further out. */
const SLOTS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [-0.8, -1],
  [0.8, -1],
  [-0.8, 1],
  [0.8, 1],
  [0, -1.6],
  [-1.7, -0.6],
  [1.7, -0.6],
]

/** About how far an army's ranks reach from its centre (for spacing escorts). */
export function bandRadius(a: Army): number {
  return 14 + Math.sqrt(Math.max(1, total(a.troops))) * 0.9
}

export const isFieldStance = (s: Stance | undefined): boolean => !!s && (s.kind === 'escortArmy' || s.kind === 'follow' || s.kind === 'guard')

/** Give an order on the army's own account (it keeps its standing order). */
function act(e: GameEngine, a: Army, order: ArmyOrder) {
  const st = a.stance
  e.orderArmy(a.id, order, true)
  a.stance = st
}
function goTo(e: GameEngine, a: Army, x: number, z: number, slack = 22) {
  const [px, pz] = e.world.nearestPassable(x, z)
  const o = a.order
  if (o.type === 'move' && Math.hypot(o.x - px, o.z - pz) < slack) return
  if (o.type !== 'move' && Math.hypot(a.x - px, a.z - pz) < slack) return
  act(e, a, { type: 'move', x: px, z: pz })
}
function hold(e: GameEngine, a: Army) {
  if (a.order.type !== 'hold') act(e, a, { type: 'hold' })
}

/** Where escort number `i` (or follower) of `t` stands now. */
export function slotFor(t: Army, a: Army, i: number, follow: boolean): [number, number] {
  const fx = Math.cos(t.heading)
  const fz = Math.sin(t.heading)
  const rx = -fz
  const rz = fx
  const sp = bandRadius(t) + bandRadius(a) + 12
  if (follow) {
    const back = sp * (1.2 + i * 0.9)
    return [t.x - fx * back, t.z - fz * back]
  }
  const form = GROUP_FORMS[t.groupForm ?? 'box'].slots
  const [side, fwd] = i < form.length ? form[i] : SLOTS[(i - form.length) % SLOTS.length]
  const ring = i < form.length ? 1 : 1.6 + Math.floor((i - form.length) / SLOTS.length) * 0.8
  return [t.x + (rx * side + fx * fwd) * sp * ring, t.z + (rz * side + fz * fwd) * sp * ring]
}

/** Each second: the player's armies with a field standing order carry it out. */
export function runFieldStances(e: GameEngine) {
  const s = e.state
  // Pace caps for escorted armies are worked out afresh each time.
  for (const a of s.armies) a.paceCap = undefined
  const groups = new Map<string, Army[]>()
  for (const a of s.armies) {
    if (!isFieldStance(a.stance) || a.stance!.kind === 'guard') continue
    const key = `${a.stance!.kind}:${a.stance!.targetId}`
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  for (const list of groups.values()) list.sort((x, y) => (x.id < y.id ? -1 : 1))
  for (const a of s.armies) {
    const st = a.stance
    // (The player's armies, and the battle groups of the computer's Great Hosts.)
    if (!st || !isFieldStance(st)) continue
    if (a.status === 'retreating' || a.battleId || a.order.type === 'work') continue
    if (st.kind === 'guard') runGuard(e, a, st)
    else {
      const t = e.army(st.targetId)
      if (!t || t.faction !== a.faction || t.id === a.id) {
        a.stance = undefined
        hold(e, a)
        if (a.faction === PLAYER) e.log('info', `${a.name} stands down`, t ? `${t.name} is no longer ours to guard.` : 'The army it went with is gone.', a.x, a.z)
        continue
      }
      const list = groups.get(`${st.kind}:${st.targetId}`) ?? [a]
      const i = Math.max(0, list.indexOf(a))
      runEscort(e, a, t, i, st.kind === 'follow')
    }
  }
  // The escorted keep to the pace of their slowest escort (so the escort is never left behind).
  for (const [key, list] of groups) {
    if (!key.startsWith('escortArmy:')) continue
    const t = e.army(key.slice('escortArmy:'.length))
    if (!t) continue
    let cap = Infinity
    for (const a of list) if (!a.battleId && a.status !== 'retreating') cap = Math.min(cap, e.baseSpeed(a))
    if (cap < Infinity) t.paceCap = cap * 0.95
  }
}

function runEscort(e: GameEngine, a: Army, t: Army, i: number, follow: boolean) {
  // The lead marches on a castle: the escorts fan out round it, each to a side of its own, and
  // when the lead goes in, they join the assault from where they stand (every side at once).
  if (!follow) {
    const c = siegeTarget(e, t)
    if (c) {
      const R = c.village || !e.world.walls.has(c.id) ? holdingRadius(c) : wallRadius(c.tier)
      const dLead = Math.hypot(t.x - c.x, t.z - c.z)
      if (dLead < R + 750) {
        const base = Math.atan2(t.z - c.z, t.x - c.x)
        const ang = base + [-1, 1, -2, 2, -3, 3][i % 6] * 1.1
        const r = (c.village || !e.world.walls.has(c.id) ? R : e.wallAt(c, c.x + Math.cos(ang), c.z + Math.sin(ang))) + 70
        const [px, pz] = e.world.nearestPassable(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r)
        const sieging = t.status === 'sieging' || (!!t.battleId && e.battle(t.battleId)?.castleId === c.id)
        if (sieging && Math.hypot(a.x - px, a.z - pz) < 70 && e.joinSiegeAt(a, c.id)) return
        goTo(e, a, px, pz, 20)
        return
      }
    }
  }
  // The army we guard is fighting in the field: into the same fight, against the nearest of its foes.
  if (!follow && t.battleId) {
    const b = e.battle(t.battleId)
    if (b) {
      const ours = b.sideA.armyIds.includes(t.id) ? b.sideB : b.sideA
      let best: Army | undefined
      let bd = Infinity
      for (const id of ours.armyIds) {
        const f = e.army(id)
        if (!f) continue
        const d = Math.hypot(f.x - a.x, f.z - a.z)
        if (d < bd) {
          bd = d
          best = f
        }
      }
      if (best && !(a.order.type === 'intercept' && a.order.armyId === best.id)) act(e, a, { type: 'intercept', armyId: best.id })
      if (best) return
    }
  }
  const [x, z] = slotFor(t, a, i, follow)
  // Close enough and the column at rest: stand in place, facing the way it faces.
  const moving = t.status === 'marching'
  if (!moving && Math.hypot(a.x - x, a.z - z) < 10) {
    hold(e, a)
    a.heading = t.heading
    return
  }
  // Lead the place a little when the column marches, so the escort keeps abreast rather than trailing.
  const lead = moving ? 18 : 0
  goTo(e, a, x + Math.cos(t.heading) * lead, z + Math.sin(t.heading) * lead, moving ? 30 : 16)
}

function runGuard(e: GameEngine, a: Army, st: Stance) {
  const px = st.x ?? a.x
  const pz = st.z ?? a.z
  const r = st.r ?? GUARD_RADII[1]
  const team = e.team(a.faction)
  const mine = e.armyPower(a)
  // Already after someone: keep at it while they are inside the reach (a little beyond the radius).
  if (a.order.type === 'intercept') {
    const f = e.army(a.order.armyId)
    if (f && f.status !== 'retreating' && Math.hypot(f.x - px, f.z - pz) < r * 1.35 && e.canSee(team, f)) return
  }
  let best: Army | undefined
  let bd = Infinity
  for (const f of e.state.armies) {
    if (!e.isHostile(f.faction, a.faction) || f.status === 'retreating' || f.vassalOf || !e.canSee(team, f)) continue
    const d = Math.hypot(f.x - px, f.z - pz)
    if (d > r || d >= bd) continue
    bd = d
    best = f
  }
  if (best && e.perceivedArmyPower(team, best) < mine * 1.6) {
    act(e, a, { type: 'intercept', armyId: best.id })
    return
  }
  // Nobody to fight (or too strong a host): back to the post and stand fast.
  if (Math.hypot(a.x - px, a.z - pz) > 20) goTo(e, a, px, pz, 16)
  else hold(e, a)
}

/** The hostile castle a battle group's lead is marching on (or besieging), if any. */
function siegeTarget(e: GameEngine, t: Army): Castle | undefined {
  if (t.order.type === 'attack') {
    const c = e.castle(t.order.castleId)
    if (c && e.isHostile(c.faction, t.faction)) return c
  }
  if (t.battleId) {
    const b = e.battle(t.battleId)
    if (b?.kind === 'siege') return e.castle(b.castleId)
  }
  return undefined
}
