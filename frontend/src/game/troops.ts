import type { CommanderDef, Troops, UnitType } from './types'

export const BASE_SPEED = 30 // world units per second for speed 1.0 troops

export function emptyTroops(units: UnitType[]): Troops {
  const t: Troops = {}
  for (const u of units) t[u.key] = 0
  return t
}

export function total(t: Troops): number {
  let s = 0
  for (const k in t) s += t[k]
  return s
}

export function totalInt(t: Troops): number {
  return Math.round(total(t))
}

export function addTroops(a: Troops, b: Troops): Troops {
  const out: Troops = { ...a }
  for (const k in b) out[k] = (out[k] ?? 0) + b[k]
  return out
}

/** a minus b, never below zero. */
export function subTroops(a: Troops, b: Troops): Troops {
  const out: Troops = { ...a }
  for (const k in b) out[k] = Math.max(0, (out[k] ?? 0) - (b[k] ?? 0))
  return out
}

export function scaleTroops(t: Troops, f: number): Troops {
  const out: Troops = {}
  for (const k in t) out[k] = t[k] * f
  return out
}

export function floorTroops(t: Troops): Troops {
  const out: Troops = {}
  for (const k in t) out[k] = Math.floor(t[k])
  return out
}

export function commanderMod(cmd: CommanderDef | null | undefined, unitKey: string, level = 1): number {
  const base = cmd?.unit_bonuses[unitKey] ?? 1
  return base * (1 + (level - 1) * 0.05)
}

/** Headline strength figure: attack + defense weighted, with commander bonuses. */
export function power(t: Troops, units: Map<string, UnitType>, cmd?: CommanderDef | null, level = 1): number {
  let p = 0
  for (const k in t) {
    const u = units.get(k)
    if (!u || t[k] <= 0) continue
    p += t[k] * (u.attack * 0.6 + u.defense * 0.4) * commanderMod(cmd, k, level)
  }
  return p * combinedArmsBonus(t, units, cmd)
}

export function combinedArmsBonus(t: Troops, units: Map<string, UnitType>, _cmd?: CommanderDef | null): number {
  const n = total(t)
  if (n < 50) return 1
  const cats = new Map<string, number>()
  for (const k in t) {
    const u = units.get(k)
    if (!u) continue
    cats.set(u.category, (cats.get(u.category) ?? 0) + t[k])
  }
  let present = 0
  for (const [cat, c] of cats) if (cat !== 'siege' && c / n >= 0.12) present++
  if (present < 3) return 1
  return 1.1
}

/** March speed: armies move at the pace of their slowest unit type. */
export function armySpeed(t: Troops, units: Map<string, UnitType>, cmd?: CommanderDef | null): number {
  let slowest = Infinity
  for (const k in t) {
    if (t[k] < 0.5) continue
    const u = units.get(k)
    if (u) slowest = Math.min(slowest, u.speed)
  }
  if (!Number.isFinite(slowest)) slowest = 1
  return BASE_SPEED * slowest * (cmd?.speed_mod ?? 1)
}

export function siegePower(t: Troops, units: Map<string, UnitType>, cmd?: CommanderDef | null): number {
  let s = 0
  for (const k in t) s += t[k] * (units.get(k)?.siege_power ?? 0)
  return s * (cmd?.siege_mod ?? 1)
}

export function visionRadius(t: Troops, units: Map<string, UnitType>, cmd?: CommanderDef | null): number {
  let v = 0.8
  for (const k in t) if (t[k] >= 1) v = Math.max(v, units.get(k)?.vision ?? 1)
  return 230 * v * (cmd?.vision_mod ?? 1)
}

/** Split `count` soldiers according to percentage `ratios`, capped by what is available. */
export function troopsFromRatios(
  count: number,
  ratios: Record<string, number>,
  available: Troops,
): Troops {
  const out: Troops = {}
  const sum = Object.values(ratios).reduce((a, b) => a + b, 0) || 1
  for (const k in available) {
    const want = Math.round((count * (ratios[k] ?? 0)) / sum)
    out[k] = Math.max(0, Math.min(Math.floor(available[k]), want))
  }
  return out
}

const ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
]
export function roman(n: number): string {
  if (n >= 40) return String(n)
  let s = ''
  for (const [v, r] of ROMAN) {
    while (n >= v) {
      s += r
      n -= v
    }
  }
  return s
}

export function fmt(n: number): string {
  const r = Math.round(n)
  if (Math.abs(r) >= 10000) return `${(r / 1000).toFixed(1)}k`
  return r.toLocaleString('en-US')
}

export const DAY_SECONDS = 30
export function calendar(time: number): string {
  const day = Math.floor(time / DAY_SECONDS)
  const seasons = ['Spring', 'Summer', 'Autumn', 'Winter']
  const season = seasons[Math.floor(day / 30) % 4]
  const year = 1247 + Math.floor(day / 120)
  return `Day ${(day % 30) + 1} · ${season} ${year}`
}
