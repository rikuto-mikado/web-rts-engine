import { PLAYER, type GameEngine } from '../game/engine'
import { TRAIT_MAP } from '../game/traits'
import { useEngine } from './common'
import { PixelPortrait } from './PixelPortrait'

/** When a commander ranks up, the player picks one of three new traits. */
export function TraitChoice({ engine }: { engine: GameEngine }) {
  useEngine(engine)
  const pending = Object.values(engine.state.commanders).find((c) => c.owner === PLAYER && c.traitChoices && c.traitChoices.length > 0)
  if (!pending) return null
  const def = engine.commanders.get(pending.key)
  if (!def) return null
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="panel animate-fade-up w-[640px] max-w-full rounded-md p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <PixelPortrait spec={def.portrait} size={56} />
          <div>
            <h2 className="panel-title">{def.name} gains renown</h2>
            <p className="text-[14px] text-ink-300">Rank {pending.level}. Choose a trait to shape this commander.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {pending.traitChoices!.map((k) => {
            const t = TRAIT_MAP.get(k)
            if (!t) return null
            return (
              <button key={k} onClick={() => engine.chooseTrait(pending.key, k)} className="well rounded-sm p-3 text-left transition hover:brightness-125 hover:outline hover:outline-1 hover:outline-gold-400">
                <div className="font-display text-[15px] font-bold text-gold-200">★ {t.name}</div>
                <div className="mt-1 text-[13px] leading-snug text-ink-300">{t.description}</div>
              </button>
            )
          })}
        </div>
        {pending.traits.length > 0 && (
          <p className="mt-3 text-[12px] text-ink-400">Already: {pending.traits.map((k) => TRAIT_MAP.get(k)?.name).join(', ')}</p>
        )}
      </div>
    </div>
  )
}
