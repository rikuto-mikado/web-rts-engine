import { useEffect, useRef, useState } from 'react'
import { CORONATION, PLAYER, type GameEngine } from '../game/engine'
import type { GameMode } from '../game/types'
import { drawGranges, paintTerrain } from './mapPaint'
import { MenuBackdrop } from './MainMenu'

/** How far the map is raised (0 to 1) and the name of the stage under way. */
export interface LoadStage {
  done: number
  label: string
}

const MAP = 320 // internal canvas resolution

const MODE_LABEL: Record<GameMode, string> = {
  campaign: 'Campaign',
  survival: 'Conquest',
  alliance: 'Alliance War',
  grand: 'War of the Three Crowns',
  nightfall: 'The Long Night',
  convoy: 'Convoy Raid',
}

const FIELD_TIPS = [
  'Walls must be battered down before a garrison can be stormed. Engineers do it fastest.',
  'A pulsing red ring is an enemy Great Host gathering. Strike before it unites.',
  'Station an army at a castle: it mans the walls when the castle is besieged.',
  'An army that holds still in a forest for a few seconds vanishes from enemy sight, and strikes first when an enemy blunders into it.',
  'Armies must stay within reach of a friendly castle, outpost or camp. Supply Depots extend your reach.',
  'Join a fight from the far side of the enemy: for 8 seconds your army deals 25% more damage and its cavalry charge into their backs.',
  'Infantry stop cavalry, cavalry ride down archers and engineers, archers thin out infantry.',
  'Rain blunts the archers; in a storm they are nearly useless.',
  'Free villages are won with envoys and gold. A vassal village raises its own militia and pays tribute.',
  'An army with 10 or more engineers can work a mine or a forest camp for gold.',
  "The King's Royal Guard can never be replaced. If it is destroyed, the war is lost.",
]

function tipsFor(engine: GameEngine): string[] {
  const mode = engine.state.rules.mode
  if (mode === 'convoy')
    return [
      'Seizing a wagon takes 5 seconds standing at it, and cannot be done while a guard who is not fighting stands beside it.',
      'Escorting: right-click a wagon to have an army walk beside it.',
      'Raiding: pin the guards in a fight and take the wagon with another band.',
      'Sappers can pull down the bridge and send the wagons the long way, through a ford.',
      "The Whisper Blades can strike down the leader of a wagon's guards, so they break and leave it bare.",
      'Give the bands you cannot watch a standing order from their panel.',
    ]
  if (mode === 'nightfall')
    return [
      'The dead mass before the weakest gate: the bar at the bottom warns where.',
      'A gate taken lets the dead into the ring behind it. Station armies at the gates.',
      'Lay traps before the gates and sally out to break the trebuchets.',
      'Keep the wards: they pay and raise men.',
      'Lose the Citadel or the King and the city is lost.',
      FIELD_TIPS[2],
    ]
  const tips = [...FIELD_TIPS]
  if (mode === 'alliance') tips.push('Summon your allies to muster with you, or call for aid when a castle is threatened.')
  if (mode === 'grand') {
    const heart = engine.castleName(CORONATION.heartId)
    const throne = `From the ${CORONATION.opensAt / 60}th minute, hold ${heart} with your monarch there for ${CORONATION.seconds / 60} minutes to be crowned High Emperor and win outright.`
    // On the Three Crowns the Old Throne is the tip worth knowing first: shown twice as often.
    tips.push(throne, throne)
  }
  return tips
}

/** The opening words of the war (the first entry in the chronicle). */
function goalOf(engine: GameEngine): string | null {
  const first = engine.state.chronicle.filter((e) => e.t === 0)
  return first.length ? first[first.length - 1].detail : null
}

/**
 * Shown while the map is raised: the name of the war, a sketch of the land with our seat marked,
 * what has to be done, a word of advice, and how far the building has come. It fades away once the
 * map is ready.
 */
export function LoadingScreen({ engine, title, stage, leaving }: { engine: GameEngine; title: string; stage: LoadStage; leaving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const s = engine.state
  const world = engine.world
  const [tip] = useState(() => {
    const t = tipsFor(engine)
    return t[Math.floor(Math.random() * t.length)]
  })
  const [goal] = useState(() => goalOf(engine))
  const mode = s.rules.mode
  const subtitle = s.scenario.description && s.scenario.description !== title && s.scenario.description !== MODE_LABEL[mode] ? s.scenario.description : null
  const home = engine.castle(s.factions[PLAYER]?.capitalId) ?? s.castles.find((c) => c.faction === PLAYER)
  const pct = (v: number) => `${((v + world.half) / world.size) * 100}%`

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    cv.width = cv.height = MAP
    const ctx = cv.getContext('2d')!
    ctx.drawImage(paintTerrain(world, MAP), 0, 0)
    const px = (v: number) => ((v + world.half) / world.size) * MAP
    drawGranges(
      ctx,
      world,
      MAP,
      (s.granges ?? []).map((g) => ({ x: g.x, z: g.z, castleId: g.castleId, faction: g.faction })),
      (id) => engine.castle(id),
      (g) => {
        const o = g.faction ?? 'neutral'
        return o === 'neutral' ? '#8a7a56' : engine.factionColor(o)
      },
    )
    // Every holding in the colour of the realm that holds it: villages small, castles larger, seats largest.
    const order = [...s.castles].sort((a, b) => Number(!a.village) - Number(!b.village) || a.tier - b.tier)
    for (const c of order) {
      const r = c.village ? 1.6 : c.capital ? 4.6 : 2.4 + c.tier * 0.5
      ctx.beginPath()
      ctx.arc(px(c.x), px(c.z), r, 0, Math.PI * 2)
      ctx.fillStyle = c.faction === 'neutral' ? '#cbbf9f' : engine.factionColor(c.faction)
      ctx.fill()
      ctx.lineWidth = c.capital ? 1.6 : 1
      ctx.strokeStyle = c.capital ? '#f7e2a4' : '#0e0b08'
      ctx.stroke()
    }
  }, [engine, world, s.castles, s.granges])

  const frac = Math.max(0, Math.min(1, stage.done))
  const ready = frac >= 1

  return (
    <div
      className={`absolute inset-0 z-[70] overflow-hidden bg-ink-950 text-ink-100 transition-opacity duration-700 ease-out ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-live="polite"
      aria-busy={!ready}
    >
      <MenuBackdrop />
      {/* Side by side whenever the screen is wider than tall (phones are played sideways); stacked
          otherwise. The inner block centres itself with auto margins so nothing is cut off at the top
          when a small screen has to scroll. */}
      <div className="relative z-10 flex h-full overflow-y-auto px-4 py-3">
        <div className="m-auto flex w-full max-w-[1100px] flex-col items-center gap-[clamp(10px,3vh,32px)] landscape:flex-row landscape:justify-center landscape:gap-[clamp(16px,4vw,40px)]">
        <div className="relative aspect-square w-[min(78vw,46vh)] shrink-0 landscape:w-[min(40vw,62vh)] tiny:landscape:w-[min(36vw,80vh)]">
          <canvas ref={ref} className="h-full w-full rounded-sm border border-gold-600/50 shadow-[0_10px_40px_rgba(0,0,0,0.6)]" />
          {home && (
            <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(home.x), top: pct(home.z) }}>
              <span className="absolute top-1/2 left-1/2 block size-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-gold-300/80" />
              <span className="absolute top-1/2 left-1/2 block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold-200" />
            </div>
          )}
        </div>

        <div className="flex w-full max-w-[460px] min-w-0 flex-col gap-[clamp(8px,2vh,18px)]">
          <div>
            {!title.startsWith(MODE_LABEL[mode]) && <div className="font-display text-[12px] font-bold tracking-[0.18em] text-gold-300/80 uppercase">{MODE_LABEL[mode]}</div>}
            <h1 className="mt-1 font-display text-[clamp(22px,3.6vw,34px)] leading-tight font-bold text-ink-100 tiny:text-[19px]">{title}</h1>
            {subtitle && <p className="mt-1 font-serif text-[15px] text-ink-300 italic tiny:hidden">{subtitle}</p>}
          </div>
          {goal && <p className="border-l-2 border-gold-500/60 pl-3 font-serif text-[15px] leading-snug text-ink-200 short:text-[14px] tiny:text-[13px]">{goal}</p>}
          <p className="text-[13.5px] leading-snug text-ink-400 short:hidden">
            <span className="font-display text-[11px] font-bold tracking-[0.14em] text-gold-400/80 uppercase">Counsel</span>
            <span className="mx-2 text-ink-600">|</span>
            {tip}
          </p>
          <div className="mt-1">
            {/* The bar grows and its sheen runs by transform only, so the compositor keeps them moving
                even while the main thread is busy raising the map. */}
            <div className="relative h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-gold-600/40">
              <div
                className="absolute inset-0 origin-left bg-gradient-to-r from-gold-600 via-gold-400 to-gold-200 transition-transform duration-300 ease-out will-change-transform"
                style={{ transform: `scaleX(${Math.max(0.03, frac)})` }}
              />
              {!ready && <div className="loading-sheen absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />}
            </div>
            <div className="mt-2 flex items-center justify-between font-display text-[12px] tracking-[0.1em] text-ink-300">
              <span>{ready ? 'To arms' : `${stage.label}…`}</span>
              <span className="text-ink-500 tabular-nums">{Math.round(frac * 100)}%</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
