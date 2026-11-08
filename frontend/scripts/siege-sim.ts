/**
 * Headless check of the Great Siege mode with the AI playing the human's side.
 *   npx tsx scripts/siege-sim.ts content.json <attack|defend> [difficulty] [seed]
 */
import { readFileSync } from 'node:fs'
import { GameEngine, PLAYER, TICK } from '../src/game/engine'
import { generateSiege } from '../src/game/siegegen'
import { total } from '../src/game/troops'
import type { Difficulty, GameContent, MapSize, SiegeSide } from '../src/game/types'

const content = JSON.parse(readFileSync(process.argv[2], 'utf8')) as GameContent
const side = (process.argv[3] ?? 'defend') as SiegeSide
const difficulty = (process.argv[4] ?? 'normal') as Difficulty
const seed = Number(process.argv[5] ?? 7)
const size = (process.argv[6] ?? 'medium') as MapSize
const m = generateSiege(side, seed, 'vales', difficulty, size)
const e = GameEngine.create(content, m.scenario, m.rules, difficulty, m.world)
const gates = e.state.castles.filter((c) => c.gate || c.capital)
const conn = e.state.castles.filter((c) => c.id.startsWith('camp')).every((c) => m.world.connected(c.x, c.z, gates[0].x, gates[0].z))
console.log('castles', e.state.castles.length, 'factions', Object.keys(e.state.factions).length, 'camps connected to first gate:', conn)
e.confirmBriefing()
e.setAutopilot(true)
let last = 0
for (let i = 0; i < ((m.rules.timeLimit ?? 1200) + 100) / TICK; i++) {
  e.step(TICK)
  for (const ev of e.events) if (ev.type === 'chronicle' && /falls|fallen|ours|breach|captured|taken|Victory|Defeat/i.test(ev.entry.title)) console.log(`[${e.state.time.toFixed(0)}] ${ev.entry.title}`)
  e.events = []
  if (e.state.time - last >= 300) {
    last = e.state.time
    const held = (team: string) => e.state.castles.filter((c) => e.team(c.faction) === team).map((c) => c.id).join(',')
    console.log(`  t=${e.state.time.toFixed(0)} A holds [${held('A')}] armies ${e.state.armies.length} A-power ${e.teamPower('A').power.toFixed(0)} B-power ${e.teamPower('B').power.toFixed(0)}`)
  }
  if (e.state.status !== 'active') break
}
const rank = e.honours('A').findIndex((h) => h.id === PLAYER) + 1
console.log('RESULT', side, difficulty, e.state.status, 'player rank', rank, '/', e.honours('A').length, 't', e.state.time.toFixed(0), 'keep owner', e.castle('keep')?.faction, 'player armies', e.state.armies.filter((a) => a.faction === PLAYER).length, 'player soldiers', Math.round(e.state.armies.filter((a) => a.faction === PLAYER).reduce((s, a) => s + total(a.troops), 0)))
