/**
 * Headless balance check. The player's realm is played by the AI ("autopilot"),
 * so results show whether a competent-but-simple player can hold on.
 *
 *   curl -s localhost:8000/api/content/ > /tmp/content.json
 *   npx tsx scripts/simulate.ts /tmp/content.json <campaign|survival|alliance|grand> [difficulty] [seconds] [seed]
 */
import { readFileSync } from 'node:fs'
import { GameEngine, PLAYER, TICK } from '../src/game/engine'
import { generateGrandMap } from '../src/game/grandmap'
import { generateMap } from '../src/game/mapgen'
import { totalInt } from '../src/game/troops'
import type { Difficulty, GameContent } from '../src/game/types'

const content = JSON.parse(readFileSync(process.argv[2], 'utf8')) as GameContent
const mode = (process.argv[3] ?? 'campaign') as 'campaign' | 'survival' | 'alliance' | 'grand'
const difficulty = (process.argv[4] ?? 'normal') as Difficulty
const seconds = Number(process.argv[5] ?? 1200)
const seed = Number(process.argv[6] ?? 42)
const quiet = process.env.QUIET === '1'

const t0 = performance.now()
let e: GameEngine
if (mode === 'campaign') e = GameEngine.newCampaign(content, content.scenarios[0].key, difficulty)
else {
  const m = mode === 'grand' ? generateGrandMap(seed) : generateMap(mode, seed)
  e = GameEngine.create(content, m.scenario, m.rules, difficulty)
}
console.log(`setup ${(performance.now() - t0).toFixed(0)}ms, castles ${e.state.castles.length}, factions ${Object.keys(e.state.factions).length}`)
e.setAutopilot(true)

const t1 = performance.now()
let taken = 0
let lastReport = 0
for (let i = 0; i < seconds / TICK; i++) {
  e.step(TICK)
  for (const ev of e.events) {
    if (ev.type === 'grange_taken') taken++
    if (!quiet && ev.type === 'chronicle' && ev.entry.kind !== 'ally') console.log(`[${e.state.time.toFixed(0).padStart(5)}] ${ev.entry.kind.padEnd(8)} ${ev.entry.title} — ${ev.entry.detail}`)
  }
  e.events = []
  if (e.state.time - lastReport >= 300) {
    lastReport = e.state.time
    const A = e.teamPower('A')
    const B = e.teamPower('B')
    const p = e.totals(PLAYER)
    const C = mode === 'grand' ? ` | teamC castles ${e.teamPower('C').castles} power ${e.teamPower('C').power.toFixed(0)}` : ''
    const heart = mode === 'grand' ? e.castle('heart') : undefined
    const cor = e.state.coronation
    const throne = heart ? ` | Crossroads: ${e.team(heart.faction)}${cor && cor.progress > 0 ? ` crowning ${cor.team} ${cor.progress.toFixed(0)}s${cor.active ? '' : ' (halted)'}` : ''}` : ''
    console.log(`  t=${e.state.time.toFixed(0)} teamA castles ${A.castles} power ${A.power.toFixed(0)} | teamB castles ${B.castles} power ${B.power.toFixed(0)}${C} | player castles ${p.castles} soldiers ${totalInt(p.all)} gold ${e.state.factions[PLAYER].gold.toFixed(0)} armies ${e.state.armies.length}${throne}`)
  }
  if (e.state.status !== 'active') break
}
const ms = performance.now() - t1
if (mode === 'grand') console.log('crowns fallen', JSON.stringify(e.state.crownsFallen ?? {}), 'crowned', e.state.crowned ?? '-')
console.log('status', e.state.status, 'time', e.state.time.toFixed(0), `sim ${(ms / (e.state.time / TICK)).toFixed(3)}ms/tick`)
// Food: how full each realm's castles are, who is starving, and the granges.
{
  const byF = new Map<string, number[]>()
  for (const c of e.state.castles) {
    const info = e.storesInfo(c)
    if (!info) continue
    const l = byF.get(c.faction) ?? []
    l.push(info.stores / info.max)
    byF.set(c.faction, l)
  }
  const line = [...byF].map(([f, l]) => `${f}:${(l.reduce((a, b) => a + b, 0) / l.length).toFixed(2)}${l.some((x) => x <= 0) ? '!' : ''}`).join(' ')
  const g = e.state.granges ?? []
  console.log('food', line, `granges ${g.length}, taken ${taken} times; held now: ${[...new Set(g.map((x) => x.faction))].map((f) => `${f}:${g.filter((x) => x.faction === f).length}`).join(' ')}`)
}
console.log('stats', JSON.stringify(e.state.stats, (_k, v) => (typeof v === 'number' ? Math.round(v) : v)))
