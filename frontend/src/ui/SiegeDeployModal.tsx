import { Castle as CastleIcon, Swords } from 'lucide-react'
import { PLAYER, type GameEngine } from '../game/engine'
import { fmt, total } from '../game/troops'
import { SectionTitle } from './common'

/**
 * Great Siege briefing. The siege is run by NPC leaders on both sides; the
 * player is one lord among many, contributing with their own household.
 */
export function SiegeDeployModal({ engine }: { engine: GameEngine }) {
  const s = engine.state
  const side = s.rules.siegeSide
  const mine = s.castles.filter((c) => c.faction === PLAYER)
  const leader = Object.values(s.factions).find((f) => f.team === 'A' && f.leader)
  const foe = Object.values(s.factions).find((f) => f.team === 'B' && f.leader)
  const allies = Object.values(s.factions).filter((f) => f.team === 'A' && f.id !== PLAYER && !f.leader)
  const soldiers = mine.reduce((n, c) => n + total(c.garrison), 0)
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="panel animate-fade-up scroll-thin safe-top safe-bottom flex h-full max-h-full w-[760px] max-w-full flex-col overflow-y-auto rounded-none p-4 sm:h-auto sm:rounded-md sm:p-6">
        <h2 className="panel-title">{engine.scenario.name}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-200">{engine.scenario.description}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <section>
            <SectionTitle>Your household</SectionTitle>
            <div className="space-y-1.5">
              {mine.map((c) => (
                <div key={c.id} className="well flex items-center gap-2 rounded-sm px-3 py-2 text-[14px]">
                  <CastleIcon size={14} className="text-royal-300" />
                  <span className="flex-1 font-bold">{c.name}</span>
                  <span className="text-ink-300 tabular-nums">{fmt(total(c.garrison))}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-ink-400">{fmt(soldiers)} soldiers under your banner. Muster armies from here with F.</p>
          </section>
          <section>
            <SectionTitle>The war around you</SectionTitle>
            <ul className="space-y-1.5 text-[14px] leading-snug text-ink-300">
              <li>
                <b className="text-teal-300">{leader?.name}</b> leads your side and directs the {side === 'defend' ? 'defence' : 'assault'}.
              </li>
              <li>
                {allies.length} other allied lords fight on their own: {allies.map((a) => a.name).join(', ')}.
              </li>
              <li>
                <b className="text-ember-300">{foe?.name}</b> leads the enemy.
              </li>
            </ul>
          </section>
        </div>

        <section className="mt-5">
          <SectionTitle>How you can help</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-ink-300">
            {side === 'defend' ? (
              <>
                <li>Hold your quarter, and send troops where another lord's line is breaking.</li>
                <li>Retake fallen districts before the enemy can use them as footholds.</li>
                <li>Sally out at the right moment to burn a siege camp, or hide in a forest to ambush the next wave.</li>
              </>
            ) : (
              <>
                <li>Strike a gate the other lords are not attacking, or join the main assault where it is close to breaking.</li>
                <li>Take districts inside the walls as footholds, then go for a citadel gate.</li>
                <li>Use Summon allies on a target to gather the other lords and storm it together.</li>
              </>
            )}
            <li>The siege goes on without you. Every kill and every castle taken earns honours; check your rank in the War tab.</li>
          </ul>
        </section>

        <button className="btn btn-gold mt-6 w-full py-3.5 text-base" onClick={() => engine.confirmBriefing()}>
          <Swords size={18} /> To arms
        </button>
      </div>
    </div>
  )
}
