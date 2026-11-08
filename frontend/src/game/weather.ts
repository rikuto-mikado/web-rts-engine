/** Seasons follow the calendar; weather changes every minute or two. */

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter'
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow'

export interface WeatherState {
  kind: WeatherKind
  until: number
}

export const SEASON_SECONDS = 30 * 30 // 30 days of 30 seconds

export function seasonAt(time: number): Season {
  return (['Spring', 'Summer', 'Autumn', 'Winter'] as const)[Math.floor(time / SEASON_SECONDS) % 4]
}

export interface ClimateEffects {
  speed: number
  ranged: number
  upkeep: number
  income: number
  manpower: number
  supply: number
  siege: number
}

export function climate(season: Season, weather: WeatherKind): ClimateEffects {
  const e: ClimateEffects = { speed: 1, ranged: 1, upkeep: 1, income: 1, manpower: 1, supply: 1, siege: 1 }
  if (season === 'Spring') e.manpower *= 1.25
  if (season === 'Autumn') e.income *= 1.15
  if (season === 'Winter') {
    e.speed *= 0.82
    e.upkeep *= 1.5
    e.manpower *= 0.7
    e.supply *= 0.75
  }
  if (weather === 'rain') {
    e.ranged *= 0.65
    e.speed *= 0.9
    e.siege *= 0.85
  }
  if (weather === 'storm') {
    e.ranged *= 0.45
    e.speed *= 0.8
    e.siege *= 0.7
  }
  if (weather === 'snow') {
    e.ranged *= 0.8
    e.speed *= 0.85
  }
  return e
}

/** Roll the next weather for a season. */
export function nextWeather(season: Season, r: number): WeatherKind {
  const table: Record<Season, [WeatherKind, number][]> = {
    Spring: [['clear', 0.55], ['rain', 0.38], ['storm', 0.07]],
    Summer: [['clear', 0.75], ['rain', 0.15], ['storm', 0.1]],
    Autumn: [['clear', 0.45], ['rain', 0.42], ['storm', 0.13]],
    Winter: [['clear', 0.4], ['snow', 0.55], ['storm', 0.05]],
  }
  let acc = 0
  for (const [k, p] of table[season]) {
    acc += p
    if (r < acc) return k
  }
  return 'clear'
}

export const WEATHER_LABEL: Record<WeatherKind, string> = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow' }

export function describeClimate(season: Season, weather: WeatherKind): string[] {
  const out: string[] = []
  if (season === 'Spring') out.push('Spring: manpower regrows 25% faster')
  if (season === 'Autumn') out.push('Autumn harvest: +15% income')
  if (season === 'Winter') out.push('Winter: -18% march speed, upkeep ×1.5, shorter supply lines')
  if (weather === 'rain') out.push('Rain: archers -35%, slower marching and sieges')
  if (weather === 'storm') out.push('Storm: archers -55%, much slower marching and sieges')
  if (weather === 'snow') out.push('Snow: archers -20%, slower marching')
  if (out.length === 0) out.push('Fair weather: no penalties')
  return out
}
