import { SEASON_SECONDS, seasonAt, type Season } from './weather'

/**
 * Day and night. The light comes round every DAY_CYCLE seconds of the war (two days and nights to a
 * season), the nights longer in winter and shorter in summer. Dusk and dawn take a little while; the
 * darkness (0 by day, 1 at the dead of night) eases between them.
 *
 * At night (in proportion to the darkness):
 *   - everyone sees less far: hidden bands are found closer, scouts and watchmen see less;
 *   - small bands camped without fire in the open slip out of sight, and woods hide sooner;
 *   - ambushes, assassins and saboteurs do better; archers shoot worse;
 *   - armies on the march carry torches (they are seen, and march a little slower);
 *   - some commanders like the dark (Elowen, Vesk) and some do not (Bran, Gorm, Hrolf).
 *
 * The Long Night is night from end to end, with rules of its own: none of this applies there.
 */
export const DAY_CYCLE = SEASON_SECONDS / 2
/** Share of the cycle that is night (dusk and dawn included), by the season the day begins in. */
const NIGHT_SHARE: Record<Season, number> = { Spring: 0.3, Summer: 0.22, Autumn: 0.32, Winter: 0.4 }
/** How long dusk and dawn take. */
export const TWILIGHT = 30

export const NIGHT = {
  /** Sight, watch and spotting ranges at the dead of night (Wardens keep more of theirs). */
  sight: 0.65,
  wardenSight: 0.85,
  /** The rumour range of the AI lords (enemy strength known exactly within it). */
  exact: 0.6,
  archers: 0.7,
  march: 0.9,
  /** Ambushes strike this much harder (on top of the ambush itself), and shake the victim more. */
  ambush: 1.25,
  ambushMorale: 8,
  /** Assassins' chance, added. */
  strike: 0.06,
  /** Saboteurs: their work goes faster and raises the alarm less often. */
  sabotageWork: 0.65,
  sabotageAlarm: 0.6,
  /** A band camped in the open slips out of sight after this long (if no larger than `campMen`). */
  campHide: 14,
  campMen: 1000,
  /** Woods hide sooner by night (seconds taken off). */
  woodsHide: 3,
  /** The Night Raider's opening blow at the dead of night (+30% by day). */
  nightRaider: 1.5,
  /** From this darkness on, it counts as night for camps (and torches are lit from `torches`). */
  dark: 0.6,
  torches: 0.15,
}

/** How each commander takes to fighting in the dark: a damage multiplier at the dead of night. */
export const NIGHT_AFFINITY: Record<string, { mult: number; note: string }> = {
  elowen: { mult: 1.12, note: 'Rides well by night: +12% damage in the dark' },
  vesk: { mult: 1.12, note: 'Raids by night: +12% damage in the dark' },
  godfrey: { mult: 1.05, note: 'Old siege hand, used to night work: +5% damage in the dark' },
  bran: { mult: 0.88, note: 'His charges need the light: -12% damage in the dark' },
  gorm: { mult: 0.9, note: 'Heavy horse in the dark: -10% damage at night' },
  hrolf: { mult: 0.92, note: 'Slow to fight by night: -8% damage in the dark' },
}

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn'

export interface Daylight {
  /** 0 by day, 1 at the dead of night. */
  dark: number
  phase: DayPhase
  /** Seconds until the next phase begins. */
  next: number
  /** How far into dusk or dawn (0..1); 0 otherwise. Used for the warm light of the low sun. */
  twilight: number
}

function shareAt(cycleStart: number): number {
  return NIGHT_SHARE[seasonAt(cycleStart)]
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** The light at a moment of the war. */
export function daylightAt(time: number): Daylight {
  const start = Math.floor(time / DAY_CYCLE) * DAY_CYCLE
  const p = time - start
  const dusk = DAY_CYCLE * (1 - shareAt(start))
  const night = dusk + TWILIGHT
  const dawn = DAY_CYCLE - TWILIGHT
  if (p < dusk) return { dark: 0, phase: 'day', next: dusk - p, twilight: 0 }
  if (p < night) {
    const k = (p - dusk) / TWILIGHT
    return { dark: smooth(k), phase: 'dusk', next: night - p, twilight: k }
  }
  if (p < dawn) return { dark: 1, phase: 'night', next: dawn - p, twilight: 0 }
  const k = (p - dawn) / TWILIGHT
  return { dark: smooth(1 - k), phase: 'dawn', next: DAY_CYCLE - p, twilight: 1 - k }
}

/** Scale a range or a factor from its daytime value to its value at the dead of night. */
export function byNight(day: number, night: number, dark: number): number {
  return day + (night - day) * dark
}

/** What the night does, for the panels and the chronicle. */
export function describeNight(): string[] {
  return [
    `Archers shoot ${Math.round((1 - NIGHT.archers) * 100)}% worse; marches are ${Math.round((1 - NIGHT.march) * 100)}% slower`,
    `Everyone sees ${Math.round((1 - NIGHT.sight) * 100)}% less far (the Wardens ${Math.round((1 - NIGHT.wardenSight) * 100)}%)`,
    `Bands of up to ${NIGHT.campMen} camped in the open slip out of sight after ${NIGHT.campHide}s; woods hide sooner`,
    `Ambushes strike ${Math.round((NIGHT.ambush - 1) * 100)}% harder; assassins +${Math.round(NIGHT.strike * 100)}%; saboteurs work faster and quieter`,
    'Armies on the march carry torches',
  ]
}
