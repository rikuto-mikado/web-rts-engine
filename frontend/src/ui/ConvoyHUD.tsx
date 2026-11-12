import { PLAYER, TRAIN, type GameEngine } from '../game/engine'
import { roman } from '../game/troops'
import type { Selection } from '../render/GameRenderer'
import { useEngine } from './common'
import { Glyph } from './Glyph'

/**
 * Convoy Raid: the gold train at a glance. One pip per wagon (waiting, on the road with how
 * far it has come, safely in, or seized), the score to play for, whether the bridge still
 * stands, and for the escort the order to halt the whole train or send it on.
 */
export function ConvoyHUD({ engine, onFocus, onSelect }: { engine: GameEngine; onFocus: (x: number, z: number) => void; onSelect: (s: Selection) => void }) {
  useEngine(engine)
  const cv = engine.state.rules.convoy
  const tr = engine.state.train
  if (!cv || !tr) return null
  const escort = engine.trainEscort() === PLAYER
  const next = Math.max(0, Math.ceil(tr.nextAt - engine.state.time))
  const raidNeed = cv.wagons - cv.needed + 1
  const bridgeDown = engine.trainBridgeDown()
  // Delivered wagons are good news for the escort, seized ones for the raiders.
  const good = 'bg-emerald-600/35 text-emerald-200 ring-emerald-400/50'
  const bad = 'bg-ember-700/45 text-ember-200 ring-ember-400/50'
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
      <div className="panel pointer-events-auto flex items-center gap-3 rounded-md px-3 py-2">
        <div className="text-[11.5px] leading-tight">
          <div className="font-display font-bold tracking-[0.16em] text-gold-300">THE GOLD TRAIN</div>
          <div className="text-ink-300 tabular-nums">
            {escort ? (
              <>
                Bring in <b className="text-ink-100">{cv.needed}</b> · {tr.delivered} in
              </>
            ) : (
              <>
                Seize <b className="text-ink-100">{raidNeed}</b> · {tr.seized} taken
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          {tr.wagons.map((st, i) => {
            const n = roman(i + 1)
            if (st === 'waiting')
              return (
                <div key={i} title={`Wagon ${n}: waiting at the caravanserai`} className="grid size-10 place-items-center rounded-sm bg-black/30 text-ink-500 ring-1 ring-white/5">
                  <Glyph name="wagon" size={18} />
                  {i === tr.sent && <span className="-mt-1 text-[10px] text-ink-300 tabular-nums">{next}s</span>}
                </div>
              )
            if (st === 'delivered' || st === 'seized') {
              const win = (st === 'delivered') === escort
              return (
                <div key={i} title={`Wagon ${n}: ${st === 'delivered' ? 'safely in' : 'seized'}`} className={`grid size-10 place-items-center rounded-sm ring-1 ${win ? good : bad}`}>
                  <Glyph name={st === 'delivered' ? 'check' : 'swords'} size={18} />
                  <span className="-mt-1 text-[9.5px] font-bold">{n}</span>
                </div>
              )
            }
            const w = engine.convoy(st)
            const pct = w ? engine.wagonProgress(w) : 0
            // Being unhitched by raiders: the pip burns red and fills as the seconds run out.
            const seizing = w?.seize ? Math.min(1, w.seize / TRAIN.seizeSeconds) : 0
            return (
              <button
                key={i}
                title={seizing ? `Wagon ${n} is being seized!` : `Wagon ${n}: ${Math.round(pct * 100)}% of the way${w?.detour ? ' (by the ford)' : ''}. Click to look.`}
                className={`relative grid size-10 place-items-center rounded-sm hover:brightness-125 ${seizing ? 'animate-pulse bg-ember-700/50 text-ember-100 ring-2 ring-ember-400' : 'bg-gold-500/20 text-gold-200 ring-1 ring-gold-400/60'}`}
                onClick={() => {
                  if (!w) return
                  onFocus(w.x, w.z)
                  onSelect({ kind: 'convoy', id: w.id })
                }}
              >
                <Glyph name="wagon" size={18} className={tr.halted ? 'opacity-60' : ''} />
                <span className="-mt-1 text-[9.5px] font-bold">{n}</span>
                <i className="absolute right-0.5 bottom-0.5 left-0.5 h-[3px] overflow-hidden rounded-full bg-black/50">
                  <i className={`block h-full ${seizing ? 'bg-ember-400' : 'bg-gold-300'}`} style={{ width: `${(seizing || pct) * 100}%` }} />
                </i>
              </button>
            )
          })}
        </div>
        {bridgeDown && (
          <span className="flex items-center gap-1 text-[11.5px] leading-tight text-ember-300" title="The bridge is down: the wagons take the long way, through a ford.">
            <Glyph name="warning" size={15} />
            <span className="max-[760px]:hidden">
              Bridge
              <br />
              down
            </span>
          </span>
        )}
        {escort && (
          <button className={`btn text-[12.5px] ${tr.halted ? 'btn-gold' : ''}`} onClick={() => engine.setTrainHalted(PLAYER, !tr.halted)} title={tr.halted ? 'Send every wagon on again' : 'Stop every wagon where it stands'}>
            {tr.halted ? 'Move on' : 'Halt'}
          </button>
        )}
      </div>
    </div>
  )
}
