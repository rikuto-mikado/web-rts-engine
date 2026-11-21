import type { GameEngine } from './engine'
import { PLAYER } from './engine'
import { emptyTroops, total } from './troops'
import type { Army } from './types'
import type { World } from './world'
import { holdingRadius } from './world'

/**
 * The High King's Blessing (Alliance War, if chosen on the menu).
 *
 * The Sanctuary of the High King, a temple of white marble, stands on open ground in our own
 * country, between our court and the front. Only the King may pray there (no other army can): his
 * guard within `reach`, out of any fight, for `prayer` seconds (the count pauses whenever he leaves
 * or is drawn into battle, and goes on where it stopped). Once, for the whole war, the High King
 * answers:
 *
 *   the blessing   the Royal Guard is made whole and grows to `guard`; his presence reaches `aura`
 *                  and steadies the armies in it more (`auraAttack`, `auraTaken`, `auraMorale`);
 *   the paladins   whatever the state of the war, bands of the High King's paladins (`band` each,
 *                  led in turn by his five Justices) come down at the Sanctuary, `wave` together
 *                  every `every` seconds, no more than `bands` in the field at once, and each rides for the
 *                  nearest enemy castle (never an enemy royal seat: those are ours to take). The
 *                  castles they take are ours. They need no supply, pay no upkeep, never break and
 *                  always fight blessed. When they have taken `castles` castles, or after `limit`
 *                  seconds, they go home.
 */
export const TEMPLE = {
  reach: 65,
  prayer: 30,
  guard: 800,
  aura: 550,
  /** The blessed King's presence: instead of ROYAL's (the paladins always fight in it). */
  auraAttack: 1.2,
  auraTaken: 0.85,
  auraMorale: 0.5,
  band: 400,
  /** Bands come down `wave` at a time, every `every` seconds. */
  wave: 2,
  every: 40,
  bands: 6,
  castles: 4,
  limit: 600,
  /** About this far along the way from our court to the Usurper's seat. */
  along: 0.3,
  /** Far enough from every enemy castle (it is placed as far as it can be, up to this). */
  safe: 2200,
  /** And a ride from our court: never on its doorstep, if there is any other ground. */
  minRide: 1400,
}

/** The five Justices the High King has chosen: each band rides under one of them, in turn. */
export const JUSTICES = ['Justice Aurelian', 'Justice Seraphine', 'Justice Corvain', 'Justice Ysolde', 'Justice Theodric']

export const SACRED_FACTION = { id: 'sacred', name: 'Order of the High King', color: '#efe3bd', team: 'A' as const, sacred: true }

/**
 * Where the Sanctuary stands: in our own country (`ours` marks our alliance's castles), on open,
 * dry, even ground clear of every castle and its country.
 */
export function placeSanctuary(
  world: World,
  from: { x: number; z: number },
  to: { x: number; z: number },
  castles: { x: number; z: number; tier: number; village?: boolean; ours: boolean }[],
): { x: number; z: number } | null {
  const ok = (x: number, z: number) => {
    if (Math.abs(x) > world.half - 300 || Math.abs(z) > world.half - 300) return false
    for (let k = 0; k < 12; k++) {
      const px = x + Math.cos((k / 12) * Math.PI * 2) * 70
      const pz = z + Math.sin((k / 12) * Math.PI * 2) * 70
      if (!world.isPassable(px, pz) || world.heightAt(px, pz) < 4 || world.slopeAt(px, pz) > 0.3) return false
    }
    if (world.bridgeAt(x, z, 200) || world.towns.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 300)) return false
    return castles.every((c) => Math.hypot(c.x - x, c.z - z) > holdingRadius(c) * 2.2 + 220)
  }
  // Every open place on our side of the middle is weighed: as far from the enemy's castles as may
  // be (up to `safe`), and about `along` of the way from our court to their seat (at least
  // `minRide` from home). Its nearest castle must be ours.
  const forts = castles.filter((c) => !c.village)
  const D = Math.hypot(to.x - from.x, to.z - from.z)
  let best: { x: number; z: number } | null = null
  let bestScore = -Infinity
  const step = 80
  for (let x = -world.half + 300; x <= world.half - 300; x += step)
    for (let z = -world.half + 300; z <= world.half - 300; z += step) {
      const dc = Math.hypot(x - from.x, z - from.z)
      if (dc >= Math.hypot(x - to.x, z - to.z)) continue
      let nA = Infinity
      let nB = Infinity
      for (const c of forts) {
        const d = Math.hypot(c.x - x, c.z - z)
        if (c.ours) nA = Math.min(nA, d)
        else nB = Math.min(nB, d)
      }
      if (nA >= nB) continue
      const score = Math.min(nB, TEMPLE.safe) - 0.5 * Math.abs(dc - D * TEMPLE.along) - (dc < TEMPLE.minRide ? 3000 : 0)
      if (score <= bestScore || !ok(x, z)) continue
      best = { x, z }
      bestScore = score
    }
  return best
}

// ---------------------------------------------------------------------------
// The war at the Sanctuary
// ---------------------------------------------------------------------------

/** The King's prayer, the blessing, and the paladins: once a second. */
export function runSanctuary(e: GameEngine, dt: number) {
  const sa = e.state.sanctuary
  if (!sa || sa.over) return
  const t = e.state.time
  if (!sa.blessed) {
    const king = e.royalArmy(PLAYER)
    const near = !!king && Math.hypot(king.x - sa.x, king.z - sa.z) < TEMPLE.reach + 40
    const was = sa.praying
    sa.praying = !!king && near && !king.battleId && king.status !== 'retreating'
    if (sa.praying && !was && sa.progress === 0) e.log('info', 'The King kneels at the Sanctuary', `He prays to the High King. ${TEMPLE.prayer} seconds, out of the fighting.`, sa.x, sa.z)
    if (sa.praying) {
      sa.progress = Math.min(TEMPLE.prayer, sa.progress + dt)
      if (sa.progress >= TEMPLE.prayer) bless(e, king!)
    } else if (was && king && !near) e.log('warning', 'The prayer is broken off', 'The King has left the Sanctuary. He may come back and pray on.', sa.x, sa.z)
    return
  }
  const paladins = e.state.armies.filter((a) => a.sacred)
  const targets = e.state.castles.filter((c) => e.relation(c.faction) === 'enemy' && !c.village && !e.state.rules.victoryCastles.includes(c.id))
  // Their work is done (or the time is up, or there is nothing left for them to take): home.
  if (sa.captures >= TEMPLE.castles || t >= (sa.blessedAt ?? t) + TEMPLE.limit || !targets.length) {
    for (const a of paladins) e.removeArmy(a)
    sa.over = true
    e.log('ally', 'The paladins go home', `The High King's paladins return to the Sanctuary${sa.captures ? `, ${sa.captures === 1 ? 'one castle' : `${sa.captures} castles`} won for us` : ''}.`, sa.x, sa.z)
    return
  }
  if (t >= sa.nextBandAt && paladins.length < TEMPLE.bands) {
    for (let k = 0; k < Math.min(TEMPLE.wave, TEMPLE.bands - paladins.length); k++) descend(e)
    sa.nextBandAt = t + TEMPLE.every
  }
  // Each band rides for the enemy castle nearest it.
  for (const a of paladins) {
    if (a.battleId || a.status === 'retreating') continue
    const cur = a.order.type === 'attack' ? e.castle(a.order.castleId) : undefined
    if (cur && targets.includes(cur)) continue
    const c = [...targets].sort((x, y) => Math.hypot(x.x - a.x, x.z - a.z) - Math.hypot(y.x - a.x, y.z - a.z))[0]
    e.orderArmy(a.id, { type: 'attack', castleId: c.id }, true)
  }
}

/** The King's prayer is heard. */
function bless(e: GameEngine, king: Army) {
  const sa = e.state.sanctuary!
  sa.blessed = true
  sa.praying = false
  sa.blessedAt = e.state.time
  sa.nextBandAt = e.state.time + 3
  king.blessed = true
  const unit = e.troopsOf(king)
  king.troops[unit] = Math.max(king.troops[unit] ?? 0, TEMPLE.guard - (total(king.troops) - (king.troops[unit] ?? 0)))
  king.fullStrength = TEMPLE.guard
  king.initialTotal = Math.max(king.initialTotal, TEMPLE.guard)
  king.morale = e.moraleCap(king)
  e.log('victory', 'The High King has heard the King', `The Royal Guard is ${TEMPLE.guard} strong and his presence reaches ${TEMPLE.aura}m. The High King's paladins come down at the Sanctuary: they ride until ${TEMPLE.castles} castles are ours.`, sa.x, sa.z)
}

/** A band of paladins comes down at the Sanctuary, under the next of the Justices. */
function descend(e: GameEngine) {
  const sa = e.state.sanctuary!
  const justice = JUSTICES[sa.bands % JUSTICES.length]
  const ang = sa.bands * 2.4
  sa.bands++
  const [x, z] = e.world.nearestPassable(sa.x + Math.cos(ang) * 90, sa.z + Math.sin(ang) * 90)
  const unit = e.bandUnit('paladin', 'guard')
  const a: Army = {
    id: e.newId('a'),
    name: `Paladins of ${justice.replace('Justice ', '')}`,
    faction: SACRED_FACTION.id,
    commanderKey: null,
    captainName: justice,
    x,
    z,
    heading: ang,
    path: [],
    pathTarget: null,
    repathAt: 0,
    order: { type: 'hold' },
    status: 'idle',
    troops: { ...emptyTroops(e.unitList), [unit]: TEMPLE.band },
    initialTotal: TEMPLE.band,
    morale: 0,
    retreatAt: 0.1,
    formation: 'wedge',
    column: false,
    homeCastleId: '',
    battleId: null,
    battleJoinedAt: 0,
    createdAt: e.state.time,
    kills: 0,
    routedAt: -999,
    hiddenSince: null,
    supplied: true,
    sacred: true,
    fullStrength: TEMPLE.band,
  }
  a.morale = e.moraleCap(a)
  e.state.armies.push(a)
}
