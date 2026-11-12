import { Dices, Handshake, LoaderCircle, Moon, RotateCcw, ScrollText, Swords } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { GameEngine } from '../game/engine'
import { MAPS, MAP_TYPES, type MapType } from '../game/biomes'
import { generateCountryside } from '../game/countryside'
import { generateMap, type GeneratedMap } from '../game/mapgen'
import { CONVOY, generateConvoyMap } from '../game/convoymap'
import { NIGHT, generateNightMap } from '../game/nightmap'
import { Glyph } from './Glyph'
import { PixelPortrait } from './PixelPortrait'
import { drawStructures } from './mapPaint'
import { World } from '../game/world'
import type { CastleDef, Difficulty, FactionDef, GameContent, GameMode, MapSize, ScenarioDefinition } from '../game/types'
import type { Match } from './GameScreen'
import { drawShield, shieldMarkup } from '../render/heraldry'
import { ROYAL_SEAT_TIER } from '../game/world'

interface Props {
  content: GameContent | null
  error: string | null
  onRetry: () => void
  onStart: (m: Match) => void
}

const DIFFS: {
  key: Difficulty
  name: string
  text: string
  alliance: string
  convoy: string
  night: string
}[] = [
  {
    key: 'easy',
    name: 'Squire',
    text: 'A poorer, slower enemy. Learn the ropes.',
    alliance: 'A strong foe, the land split 5 : 5.',
    convoy: 'The other side fields fewer men (about 0.8x).',
    night: 'Fewer of the dead. Dawn in 5 minutes.',
  },
  {
    key: 'normal',
    name: 'Knight',
    text: 'The intended challenge.',
    alliance: 'A strong foe holding 6 parts of the land in 10.',
    convoy: 'Even forces (computer raiders 1.1x).',
    night: 'The intended night. Dawn in 6 minutes.',
  },
  {
    key: 'hard',
    name: 'Warlord',
    text: 'Rich and relentless foes.',
    alliance: 'Foe holds 7 of 10 parts; forts guard your fords.',
    convoy: 'The other side is stronger (1.2x; raiders 1.35x).',
    night: 'More of the dead. Dawn in 7 minutes.',
  },
  {
    key: 'brutal',
    name: 'Last Stand',
    text: 'The richest, most relentless foes of all.',
    alliance: 'Foe holds 8 of 10. Hold until the relief fleet lands.',
    convoy: 'Badly outnumbered (1.4x; raiders 1.6x).',
    night: 'The darkest night.',
  },
]

type MenuMode = 'conquest' | 'alliance' | 'convoy' | 'nightfall'
type Side = 'escort' | 'raid'
/** Who may lead the escort (the spymaster leads the raiders; the King stays at court). */
const ESCORT_COMMANDERS = ['godfrey', 'elowen', 'varian', 'isolde', 'bran']

const SIZE_HINT: Record<'survival' | 'alliance', Record<MapSize, string>> = {
  survival: {
    small: '10 castles, a quick war (about 20 min).',
    medium: '15 castles, the standard war.',
    large: '24 castles, a long campaign. You start with 3.',
  },
  alliance: {
    small: '8 v 8 on a compact map.',
    medium: '16 v 16, the standard war.',
    large: '24 v 24 on a vast map.',
  },
}

const MODES: {
  key: MenuMode
  name: string
  icon: ReactNode
  tagline: string
  text: string
}[] = [
  {
    key: 'conquest',
    name: 'Conquest',
    icon: <ScrollText size={22} />,
    tagline: 'You against a coalition',
    text: 'Break an enemy coalition and take its capitals. Every war is fought on a freshly generated map.',
  },
  {
    key: 'alliance',
    name: 'Alliance War',
    icon: <Handshake size={22} />,
    tagline: '16 to 48 realms, two alliances',
    text: 'Fight beside a coalition of AI lords on a huge random map. Call your allies to arms and take the enemy High Seat.',
  },
  {
    key: 'convoy',
    name: 'Convoy Raid',
    icon: <Glyph name="wagon" size={22} />,
    tagline: 'Guard or rob the gold train',
    text: 'Five gold wagons run one forest road, 8 to 10 minutes. Bring three in, or seize three from the trees.',
  },
  {
    key: 'nightfall',
    name: 'The Long Night',
    icon: <Moon size={22} />,
    tagline: "Hold the King's city till dawn",
    text: 'The Endless Night pours from its rifts, wave on wave, against the royal city and its two rings of walls. Keep the Citadel and the King until the sun rises.',
  },
]

export function MainMenu({ content, error, onRetry, onStart }: Props) {
  const [menuMode, setMenuMode] = useState<MenuMode>('conquest')
  // Both modes offer the same six generated maps; Conquest uses the "survival" ruleset.
  const [mapType, setMapChoice] = useState<MapType>('crown')
  const mode: GameMode = menuMode === 'conquest' ? 'survival' : menuMode
  const convoy = mode === 'convoy'
  const nightfall = mode === 'nightfall'
  const [side, setSide] = useState<Side>('escort')
  const [escortCmd, setEscortCmd] = useState('godfrey')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  // Last Stand belongs to Alliance War (the relief fleet); the other modes offer three levels.
  const diffs = mode === 'alliance' ? DIFFS : DIFFS.filter((d) => d.key !== 'brutal')
  const curDiff = DIFFS.find((d) => d.key === difficulty)!
  const diffText = nightfall ? curDiff.night : convoy ? curDiff.convoy : mode === 'alliance' ? curDiff.alliance : curDiff.text
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999))
  const [mapSize, setMapSize] = useState<MapSize>('medium')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    key: string
    map: GeneratedMap | null
    world: World
  } | null>(null)
  const scenario = content?.scenarios[0]
  // In Alliance War the difficulty shapes the map (how much of it your alliance holds).
  const mapDiff = mode === 'alliance' ? difficulty : undefined
  const previewKey = nightfall ? `nightfall|${seed}|${difficulty}` : convoy ? `convoy|${side}|${seed}` : `${mode}|${mapType}|${seed}|${mapSize}|${mapDiff ?? ''}`
  const makeMap = () =>
    nightfall
      ? generateNightMap(seed, difficulty)
      : convoy
      ? generateConvoyMap(seed, {
          side,
          commander: side === 'raid' ? 'ashe' : escortCmd,
          difficulty,
        })
      : generateMap(mode as 'survival' | 'alliance', seed, {
          mapType,
          size: mapSize,
          difficulty: mapDiff,
        })

  // Generate the map in the background so the player can see it before starting.
  useEffect(() => {
    if (!scenario) return
    const t = window.setTimeout(() => {
      try {
        const map = makeMap()
        setPreview({ key: previewKey, map, world: map.world })
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 180)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, scenario])

  const start = async () => {
    if (!content || !scenario) return
    setBusy('new')
    setErr(null)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const cached = preview?.key === previewKey && preview.map ? preview.map : null
      // (Convoy Raid's commander is chosen after the map: always rebuild it with the current choice.)
      const map = cached && !convoy ? cached : makeMap()
      const engine = GameEngine.create(content, map.scenario, map.rules, difficulty, map.world)
      const defaultName = nightfall ? map.scenario.name : convoy ? `Convoy Raid · ${side === 'escort' ? 'Escort' : 'Raid'}` : `${mode === 'alliance' ? 'Alliance War' : 'Conquest'} · ${MAPS[mapType].name}`
      const matchName = defaultName
      const record = await api
        .createCampaign({
          name: matchName,
          mode,
          seed,
          scenario: null,
          difficulty,
          state: null,
        })
        .catch(() => null)
      onStart({ id: record?.id ?? null, name: matchName, engine })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(null)
    }
  }

  const biome = MAPS[nightfall ? 'kingsvale' : convoy ? 'greenwood' : mapType]
  const def = preview?.key === previewKey ? (preview.map?.scenario.definition ?? scenario?.definition) : undefined

  return (
    <div className="relative h-dvh overflow-hidden bg-ink-950 text-ink-100">
      <MenuBackdrop />
      <div className="menu-root relative z-10 mx-auto flex h-full max-w-[1320px] flex-col px-[clamp(10px,2.2vw,30px)] py-[clamp(6px,1.8vh,22px)] max-[640px]:overflow-y-auto short:overflow-y-auto">
        <header className="flex shrink-0 items-end justify-between gap-4 pb-[clamp(4px,1.4vh,16px)] tiny:hidden">
          <Wordmark />
        </header>

        {!content && !error && (
          <div className="panel flex items-center gap-2 rounded-md p-5 text-ink-300">
            <LoaderCircle size={16} className="animate-spin" /> Contacting the royal archives…
          </div>
        )}
        {error && (
          <div className="panel space-y-3 rounded-md p-5">
            <p className="well rounded-sm p-3 text-ember-300">{error}</p>
            <p className="text-[13px] text-ink-400">
              Start the backend with <code className="text-ink-200">cd backend &amp;&amp; .venv/bin/python manage.py runserver</code>
            </p>
            <button className="btn" onClick={onRetry}>
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        )}

        {content && scenario && (
          <div className="grid min-h-0 flex-1 grid-cols-[1.3fr_1fr] gap-[clamp(8px,1.6vw,22px)] max-[640px]:grid-cols-1">
            {/* Left: how the war is to be fought. */}
            <section className="panel iron-frame flex min-h-0 flex-col rounded-md p-[clamp(10px,1.7vw,22px)]">
              <h2 className="panel-title mb-[clamp(4px,1.2vh,14px)] short:hidden">Prepare for War</h2>
              <Label>Game mode</Label>
              <div className="grid grid-cols-4 gap-[clamp(6px,0.9vw,12px)]">
                {MODES.map((m) => {
                  const active = menuMode === m.key
                  return (
                    <button key={m.key} onClick={() => {
                        setMenuMode(m.key)
                        if (m.key !== 'alliance' && difficulty === 'brutal') setDifficulty('hard')
                      }} className={`menu-card text-left ${active ? 'is-active' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="menu-card-icon short:hidden">{m.icon}</span>
                        <span className="font-display text-[clamp(13px,1.9vh,17px)] leading-tight font-bold short:text-[11.5px]">{m.name}</span>
                      </div>
                      <div className="menu-card-tag mt-0.5 text-[clamp(11.5px,1.6vh,13.5px)] font-bold short:hidden">{m.tagline}</div>
                      <div className="menu-card-text mt-1 line-clamp-2 text-[13px] leading-snug tall:line-clamp-3 short:hidden">{m.text}</div>
                    </button>
                  )
                })}
              </div>

              {nightfall ? (
                <NightSetup def={preview?.key === previewKey ? preview.map?.scenario.definition : undefined} name={preview?.key === previewKey ? preview.map?.scenario.name : undefined} />
              ) : convoy ? (
                <ConvoySetup side={side} setSide={setSide} commander={escortCmd} setCommander={setEscortCmd} content={content} />
              ) : (
                <div className="mt-[clamp(6px,1.8vh,20px)] flex min-h-0 flex-1 flex-col">
                  <Label>Map</Label>
                  <div className="grid min-h-[44px] flex-1 auto-rows-fr grid-cols-3 gap-[clamp(5px,0.8vw,10px)]">
                    {MAP_TYPES.map((k) => {
                      const b = MAPS[k]
                      return (
                        <button key={k} onClick={() => setMapChoice(k)} className={`map-card flex flex-col text-left ${mapType === k ? 'is-active' : ''}`}>
                          <div className="flex min-h-[clamp(6px,1.5vh,18px)] flex-1">
                            {b.swatch.map((c, i) => (
                              <span key={i} className="flex-1" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="px-2 py-[clamp(2px,0.7vh,7px)]">
                            <div className="truncate text-[clamp(11.5px,1.65vh,14px)] leading-tight font-bold">{b.name}</div>
                            <div className="map-card-tag truncate text-[12px] short:hidden">{b.tagline}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="mt-[clamp(6px,1.8vh,20px)] grid grid-cols-[3fr_4fr] gap-[clamp(8px,1.4vw,18px)]">
                {nightfall ? (
                  <div className="min-w-0 short:hidden">
                    <Label>Until dawn</Label>
                    <p className="text-[12.5px] leading-snug text-ink-300">{NIGHT.minutes[difficulty]} minutes. Waves grow with every one.</p>
                  </div>
                ) : convoy ? (
                  <div className="min-w-0 short:hidden">
                    <Label>The train</Label>
                    <p className="text-[12.5px] leading-snug text-ink-300">
                      {CONVOY.wagons} wagons, one every {CONVOY.every}s. {side === 'escort' ? `Bring ${CONVOY.needed} in.` : `Seize ${CONVOY.wagons - CONVOY.needed + 1}.`}
                    </p>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <Label>Map size</Label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['small', 'medium', 'large'] as const).map((z) => (
                        <button key={z} onClick={() => setMapSize(z)} className={`btn menu-btn capitalize ${mapSize === z ? 'btn-gold' : ''}`}>
                          {z}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink-400 short:hidden">{SIZE_HINT[mode as 'survival' | 'alliance'][mapSize]}</p>
                  </div>
                )}
                <div className={`min-w-0 ${convoy || nightfall ? 'short:col-span-2' : ''}`}>
                  <Label>Difficulty</Label>
                  <div className={`grid gap-1 ${diffs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {diffs.map((d) => (
                      <button
                        key={d.key}
                        onClick={() => setDifficulty(d.key)}
                        title={convoy ? d.convoy : mode === 'alliance' ? d.alliance : d.text}
                        className={`btn menu-btn diff-btn px-0.5 font-display whitespace-nowrap ${difficulty === d.key ? 'btn-gold' : ''}`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  {/* One line only (the full text is on hover), so the panel never shifts. */}
                  <p className={`mt-1 truncate text-[12.5px] leading-snug text-ink-400 ${convoy || nightfall ? 'short:hidden' : ''}`} title={diffText}>
                    {diffText}
                  </p>
                </div>
              </div>

              <div className="h-[clamp(8px,2.2vh,26px)] shrink-0" />
              <BeginBanner busy={busy === 'new'} onClick={start} />
              {err && <p className="well mt-2 rounded-sm p-2 text-[13px] text-ember-300">{err}</p>}
            </section>

            {/* Right: the land itself. */}
            <section className="panel iron-frame flex min-h-0 flex-col items-center rounded-md p-[clamp(10px,1.7vw,22px)] max-[640px]:min-h-[520px]">
              <h2 className="panel-title mb-[clamp(4px,1vh,12px)] w-full truncate short:hidden">{biome.name}</h2>
              {/* The map is always square: as large as fits both the width and the height of the panel. */}
              <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
                <div className="map-frame relative size-[min(100cqw,100cqh)]">
                  {preview?.key === previewKey ? (
                    <MapPreview world={preview.world} castles={def?.castles ?? []} factions={def?.factions} seed={preview.map?.scenario.seed ?? seed} plain={convoy} bridge={preview.map?.rules.convoy?.bridge} rifts={preview.map?.rules.night?.rifts} />
                  ) : (
                    <div className="well grid h-full place-items-center rounded-sm text-ink-400">
                      <LoaderCircle size={20} className="animate-spin" />
                    </div>
                  )}
                  {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
                    <IronCorner key={k} at={k} />
                  ))}
                  <button className="scroll-btn absolute -bottom-3 left-1/2 -translate-x-1/2" onClick={() => setSeed(Math.floor(Math.random() * 99999))}>
                    <Dices size={14} /> A different map
                  </button>
                </div>
              </div>
              <div className="parchment-card mt-[clamp(10px,2vh,22px)] w-full rounded-sm px-3 py-[clamp(4px,1vh,10px)]">
                <p className="line-clamp-2 text-[13px] leading-snug short:hidden">
                  <b className="font-display">{biome.name}.</b> {biome.description}
                </p>
                <div className="mt-[clamp(3px,0.8vh,8px)] flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] short:mt-0">
                  {biome.regions.map((r, i) => (
                    <span key={r} className="flex items-center gap-1.5">
                      <i className="size-2.5 shrink-0 rounded-sm ring-1 ring-black/30" style={{ background: biome.swatch[i] }} />
                      {r}
                    </span>
                  ))}
                </div>
                {!convoy && !nightfall && <HoldingsLegend />}
                {def && nightfall && (
                  <div className="mt-[clamp(4px,1vh,10px)] grid grid-cols-3 gap-1.5 text-center">
                    <Plaque label="Gates" value={def.castles.filter((c) => c.gate).length} />
                    <Plaque label="Wards" value={def.castles.filter((c) => c.district).length} />
                    <Plaque label="Rifts" value={preview?.map?.rules.night?.rifts.length ?? 0} />
                  </div>
                )}
                {def && convoy && (
                  <div className="mt-[clamp(4px,1vh,10px)] grid grid-cols-3 gap-1.5 text-center">
                    <Plaque label="Wagons" value={CONVOY.wagons} />
                    <Plaque label={side === 'escort' ? 'To bring in' : 'To seize'} value={side === 'escort' ? CONVOY.needed : CONVOY.wagons - CONVOY.needed + 1} />
                    <Plaque label="Crossings" value={def.bridges.length + 1} />
                  </div>
                )}
                {def && !convoy && !nightfall && (
                  <div className="mt-[clamp(4px,1vh,10px)] grid grid-cols-3 gap-1.5 text-center">
                    <Plaque label="Castles" value={def.castles.length} />
                    <Plaque label="Realms" value={(def.factions ?? []).filter((f) => f.team !== 'N').length || 2} />
                    <Plaque label="Crossings" value={def.bridges.length} />
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The WARBOX wordmark: carved gold capitals with the O struck as the realm's
 * crowned shield (the emblem every royal seat flies), and a single line of the
 * story beneath instead of a slogan.
 */
function Wordmark() {
  return (
    <div className="select-none">
      <h1 className="wordmark flex items-center font-display leading-none font-extrabold" aria-label="WARBOX">
        <span>WARB</span>
        <svg
          className="wordmark-o"
          viewBox="-1 -1 26 39"
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: shieldMarkup('royal', '#2f4f9a', 'fleur'),
          }}
        />
        <span>X</span>
      </h1>
      <div className="mt-[clamp(2px,0.6vh,6px)] flex items-center gap-2 text-gold-400/85 short:hidden">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold-400/70" />
        <span className="font-display text-[clamp(10.5px,1.45vh,13px)] font-bold tracking-[0.28em]">THE WAR FOR THE THORN THRONE · MCCXLVII</span>
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold-400/70" />
      </div>
    </div>
  )
}

/** Wrought-iron corner brackets for the map frame. */
function IronCorner({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }) {
  const flip = {
    tl: '',
    tr: 'scale(-1,1)',
    bl: 'scale(1,-1)',
    br: 'scale(-1,-1)',
  }[at]
  const pos = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'right-0 bottom-0',
  }[at]
  return (
    <svg className={`pointer-events-none absolute ${pos} size-[clamp(22px,4.2vh,42px)] -translate-x-0`} viewBox="0 0 40 40" style={{ transform: flip }} aria-hidden>
      <path d="M0 0 H34 L28 6 H6 V28 L0 34 Z" fill="#3a3a3e" stroke="#0d0d0f" strokeWidth="1.2" />
      <path d="M2 2 H30 M2 2 V30" stroke="#8a8a92" strokeWidth="1" opacity="0.7" />
      <circle cx="6" cy="6" r="2.2" fill="#9a9aa2" stroke="#1a1a1c" />
      <circle cx="20" cy="3.2" r="1.3" fill="#7a7a82" />
      <circle cx="3.2" cy="20" r="1.3" fill="#7a7a82" />
    </svg>
  )
}

/** The call to arms: a gold button on a ribbon, with crossed swords. */
function BeginBanner({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <div className="relative shrink-0 px-[clamp(18px,4vw,56px)]">
      <svg className="pointer-events-none absolute inset-y-[18%] left-0 h-[64%] w-[clamp(26px,5vw,64px)]" viewBox="0 0 60 40" preserveAspectRatio="none" aria-hidden>
        <path d="M60 4 H6 L18 20 L6 36 H60 Z" fill="#8a6418" stroke="#3a2608" strokeWidth="1.5" />
        <path d="M60 8 H16 M60 32 H16" stroke="#e8c066" strokeWidth="1" opacity="0.6" />
      </svg>
      <svg className="pointer-events-none absolute inset-y-[18%] right-0 h-[64%] w-[clamp(26px,5vw,64px)]" viewBox="0 0 60 40" preserveAspectRatio="none" style={{ transform: 'scaleX(-1)' }} aria-hidden>
        <path d="M60 4 H6 L18 20 L6 36 H60 Z" fill="#8a6418" stroke="#3a2608" strokeWidth="1.5" />
        <path d="M60 8 H16 M60 32 H16" stroke="#e8c066" strokeWidth="1" opacity="0.6" />
      </svg>
      <button className="btn btn-gold begin-btn relative w-full py-[clamp(8px,1.8vh,16px)] font-display text-[clamp(14px,2.2vh,19px)] tracking-wider" onClick={onClick} disabled={busy}>
        {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Swords size={18} />}
        {busy ? 'Raising the banners…' : 'Begin the War'}
      </button>
    </div>
  )
}

function Plaque({ label, value }: { label: string; value: number }) {
  return (
    <div className="plaque rounded-sm py-[clamp(2px,0.6vh,6px)]">
      <div className="text-[10.5px] tracking-[0.14em] text-ink-300 uppercase">{label}</div>
      <div className="font-display text-[clamp(14px,2.3vh,20px)] leading-tight font-bold text-gold-200">{value}</div>
    </div>
  )
}

/** The Long Night: what the King's city has to hold with. */
function NightSetup({ def, name }: { def?: ScenarioDefinition; name?: string }) {
  const castles = def?.castles ?? []
  const wards = castles.filter((c) => c.district)
  const points = [
    { glyph: 'castle' as const, text: 'Two rings of walls: five gates in the outer, three in the inner. A gate taken lets the dead into the ring behind it.' },
    { glyph: 'flag' as const, text: `Five wards inside (${wards.map((w) => w.name).join(', ') || 'market, smiths, granary, cathedral, barracks'}): they pay and raise men while they hold.` },
    { glyph: 'stakes' as const, text: 'Outside: villages, mines and the river crossings. Lay stakes, pits and pitch before the gates, or sally out to break a trebuchet.' },
    { glyph: 'crown' as const, text: 'Keep the Citadel and the King alive until dawn. The waves never stop; they only grow.' },
  ]
  return (
    <div className="mt-[clamp(6px,1.8vh,20px)] flex flex-1 flex-col short:mt-1">
      <Label>{name ?? 'The royal city'}</Label>
      <ul className="space-y-[clamp(3px,0.8vh,8px)]">
        {points.map((p) => (
          <li key={p.text} className="flex gap-2 text-[clamp(11.5px,1.6vh,13.5px)] leading-snug text-ink-300">
            <Glyph name={p.glyph} size={15} className="mt-0.5 text-gold-300" />
            <span className="line-clamp-2 short:line-clamp-1">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Convoy Raid: which side to take, and (escorting) who leads the guard. */
function ConvoySetup({ side, setSide, commander, setCommander, content }: { side: Side; setSide: (s: Side) => void; commander: string; setCommander: (k: string) => void; content: GameContent }) {
  const cmds = ESCORT_COMMANDERS.map((k) => content.commanders.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c)
  const ashe = content.commanders.find((c) => c.key === 'ashe')
  const sides: { key: Side; name: string; text: string }[] = [
    {
      key: 'escort',
      name: 'Escort',
      text: "Guard the gold: a commander's host, outriders, bowmen and pioneers. Halt the train, scout the woods, keep the bridge.",
    },
    {
      key: 'raid',
      name: 'Raid',
      text: "Rob the train: Corvin Ashe's hidden band, light horse and sappers lie in three camps in the forest.",
    },
  ]
  return (
    <div className="mt-[clamp(6px,1.8vh,20px)] flex flex-1 flex-col short:mt-1">
      <Label>Your side</Label>
      <div className="grid grid-cols-2 gap-[clamp(5px,0.8vw,10px)]">
        {sides.map((s) => (
          <button key={s.key} onClick={() => setSide(s.key)} className={`menu-card text-left short:py-1 ${side === s.key ? 'is-active' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="menu-card-icon">
                <Glyph name={s.key === 'escort' ? 'shield' : 'mask'} size={20} />
              </span>
              <span className="font-display text-[clamp(13px,1.9vh,16px)] font-bold">{s.name}</span>
            </div>
            <div className="menu-card-text mt-1 line-clamp-2 text-[12.5px] leading-snug short:hidden">{s.text}</div>
          </button>
        ))}
      </div>
      <div className="mt-[clamp(6px,1.6vh,16px)] short:mt-1">
        <Label>{side === 'escort' ? 'Commander of the guard' : 'Your commander'}</Label>
      </div>
      {side === 'escort' ? (
        <div className="grid grid-cols-5 gap-[clamp(4px,0.6vw,8px)]">
          {cmds.map((c) => (
            <button
              key={c.key}
              onClick={() => setCommander(c.key)}
              title={`${c.name}: ${c.specialty}`}
              className={`map-card flex min-w-0 flex-col items-center p-1 text-center short:flex-row short:gap-1 short:px-1 short:py-0.5 ${commander === c.key ? 'is-active' : ''}`}
            >
              <PixelPortrait spec={c.portrait} size={44} className="short:size-6" />
              <div className="mt-0.5 w-full min-w-0 truncate text-[11.5px] leading-tight font-bold short:mt-0 short:text-left short:text-[10.5px]">{c.name.replace(/^(Marshal|Lady|Sir|Dame|Lord) /, '').split(' ')[0]}</div>
            </button>
          ))}
        </div>
      ) : (
        ashe && (
          <div className="map-card is-active flex items-center gap-3 p-2 short:gap-2 short:p-1">
            <PixelPortrait spec={ashe.portrait} size={44} className="short:size-6" />
            <div className="min-w-0 text-left">
              <div className="truncate text-[13px] font-bold">
                {ashe.name} <span className="font-normal text-[#6a5030]">· {ashe.title}</span>
              </div>
              <div className="line-clamp-2 text-[12px] leading-snug text-[#4a3420] short:hidden">The spymaster: his band hides on its own, concealed under the trees and disguised on the open road.</div>
            </div>
          </div>
        )
      )}
      {side === 'escort' && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-400 short:hidden">{cmds.find((c) => c.key === commander)?.specialty}</p>}
    </div>
  )
}

/** Colours of the countryside holdings on the preview (matching their part in the war, not a lord's colours). */
const HOLDING_DOT: Record<string, string> = {
  village: '#e6d6a8',
  caravanserai: '#f0b84a',
  abbey: '#f4f0e4',
  keep: '#b8bfd0',
  guildhall: '#d98a52',
}

function MapPreview({ world, castles, factions, seed, plain, bridge, rifts }: { world: World; castles: CastleDef[]; factions?: FactionDef[]; seed: number; plain?: boolean; bridge?: [number, number]; rifts?: { x: number; z: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // The countryside is laid out when the war begins; work it out here too (it is deterministic) so the preview shows it.
  const country = useMemo(() => {
    if (plain) return { villages: [], sites: [] }
    try {
      return generateCountryside(world, castles, seed)
    } catch {
      return { villages: [], sites: [] }
    }
  }, [world, castles, seed, plain])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const S = 190
    cv.width = cv.height = S
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(S, S)
    const c: [number, number, number] = [0, 0, 0]
    const w = world.biome.water
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = -world.half + ((i + 0.5) / S) * world.size
        const z = -world.half + ((j + 0.5) / S) * world.size
        const h = world.heightAt(x, z)
        world.colorAt(x, z, c)
        if (h < 0.5 && !world.bridgeAt(x, z)) {
          // Fords show as pale shallows across the river.
          const ford = world.fordAt(x, z) ? 0.45 : 0
          c[0] = (((w >> 16) & 255) / 255) * (1 - ford) + 0.78 * ford
          c[1] = (((w >> 8) & 255) / 255) * (1 - ford) + 0.72 * ford
          c[2] = ((w & 255) / 255) * (1 - ford) + 0.55 * ford
        }
        const shade = 0.82 + Math.min(0.35, h / 380)
        const k = (j * S + i) * 4
        img.data[k] = Math.min(255, c[0] * 255 * shade)
        img.data[k + 1] = Math.min(255, c[1] * 255 * shade)
        img.data[k + 2] = Math.min(255, c[2] * 255 * shade)
        img.data[k + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    drawStructures(ctx, world, S)
    const team = (fid: string) => factions?.find((f) => f.id === fid)?.team ?? (fid === 'player' ? 'A' : fid === 'neutral' ? 'N' : 'B')
    const px = (v: number) => ((v + world.half) / world.size) * S
    // Mines and lumber camps: small marks under everything else.
    for (const r of country.sites) {
      ctx.fillStyle = r.kind === 'mine' ? '#c8c2b6' : '#7fb35a'
      ctx.beginPath()
      ctx.moveTo(px(r.x), px(r.z) - 2.4)
      ctx.lineTo(px(r.x) + 2.2, px(r.z) + 1.6)
      ctx.lineTo(px(r.x) - 2.2, px(r.z) + 1.6)
      ctx.closePath()
      ctx.fill()
    }
    // Free villages (dots) and the special holdings (diamonds), each in its own colour.
    for (const v of country.villages) {
      const x = px(v.x)
      const y = px(v.z)
      ctx.fillStyle = HOLDING_DOT[v.holding ?? 'village']
      ctx.strokeStyle = '#0e0b08'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (v.holding) {
        ctx.moveTo(x, y - 3.4)
        ctx.lineTo(x + 3.4, y)
        ctx.lineTo(x, y + 3.4)
        ctx.lineTo(x - 3.4, y)
        ctx.closePath()
      } else ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // Convoy Raid: the road's timber bridge (it is raised when the war begins).
    if (bridge) {
      ctx.fillStyle = '#8a6a44'
      ctx.strokeStyle = '#1a120a'
      ctx.lineWidth = 1
      ctx.fillRect(px(bridge[0]) - 3, px(bridge[1]) - 4, 6, 8)
      ctx.strokeRect(px(bridge[0]) - 3, px(bridge[1]) - 4, 6, 8)
    }
    // The Long Night: the rifts, violet.
    for (const r of rifts ?? []) {
      ctx.fillStyle = 'rgba(154,92,255,0.85)'
      ctx.strokeStyle = '#120a1c'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px(r.x), px(r.z), 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    for (const k of castles) {
      // (A city's gatehouses and wards are part of the city: its walls show them.)
      if (k.gate || k.district) continue
      const x = ((k.x + world.half) / world.size) * S
      const y = ((k.z + world.half) / world.size) * S
      if (k.village) {
        ctx.fillStyle = HOLDING_DOT[k.holding ?? 'village']
        ctx.strokeStyle = '#0e0b08'
        ctx.beginPath()
        ctx.moveTo(x, y - 4.5)
        ctx.lineTo(x + 4.5, y)
        ctx.lineTo(x, y + 4.5)
        ctx.lineTo(x - 4.5, y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        continue
      }
      const t = team(k.faction)
      ctx.fillStyle = k.faction === 'player' ? '#5f93ec' : t === 'A' ? '#4fd1c5' : t === 'B' ? '#de5f45' : '#d1a73f'
      const rank = k.tier >= ROYAL_SEAT_TIER ? 'royal' : k.capital ? 'lord' : 'castle'
      drawShield(ctx, x, y, rank === 'royal' ? 13 : rank === 'lord' ? 10 : 8, ctx.fillStyle as string, rank)
    }
  }, [world, castles, factions, country, bridge, rifts])
  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="well h-full w-full rounded-sm [image-rendering:auto]" />
    </div>
  )
}

/** What the marks on the preview mean (villages and holdings; castles show in their sides' colours). */
function HoldingsLegend() {
  return (
    <div className="mt-[clamp(2px,0.6vh,6px)] flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#4a3420] short:hidden">
      <span>
        <i className="mr-1 inline-block size-2 rounded-full ring-1 ring-black/40" style={{ background: HOLDING_DOT.village }} />
        Village
      </span>
      {(['caravanserai', 'abbey', 'keep', 'guildhall'] as const).map((k) => (
        <span key={k}>
          <i className="mr-1 inline-block size-2 rotate-45 ring-1 ring-black/40" style={{ background: HOLDING_DOT[k] }} />
          {k === 'keep' ? "Wardens' keep" : k === 'guildhall' ? 'Guildhall' : k[0].toUpperCase() + k.slice(1)}
        </span>
      ))}
      <span>
        <i
          className="mr-1 inline-block size-2.5"
          style={{
            background: '#8a8070',
            clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
          }}
        />
        Mine / lumber camp
      </span>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-display text-[12px] font-bold tracking-[0.12em] text-gold-300/80">{children}</div>
}

/** Layered silhouette landscape for the title screen. */
function MenuBackdrop() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,#5b3a1e_0%,#2a1a12_35%,#0b0c0e_75%)]" />
      <div className="absolute top-[14%] right-[16%] size-44 rounded-full bg-[radial-gradient(circle,#f5c77a_0%,#d9873a_40%,transparent_70%)] opacity-60 blur-sm" />
      <svg className="absolute bottom-0 w-full" viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice">
        <path d="M0 420 L180 300 L320 380 L480 250 L640 360 L820 230 L1000 340 L1180 260 L1360 350 L1600 280 L1600 600 L0 600Z" fill="#1d1712" />
        <g fill="#140f0c">
          <path d="M0 480 C200 440 400 470 600 450 C800 430 1000 470 1200 445 C1400 425 1500 450 1600 440 L1600 600 L0 600Z" />
          <path d="M1040 452 V360 h14 v-14 h10 v14 h12 v-14 h10 v14 h14 V452Z M1100 452 V300 h10 v-12 h8 v12 h10 v-12 h8 v12 h10 V452Z M1160 452 V370 h12 v-12 h8 v12 h12 V452Z" />
          <path d="M1112 288 L1123 262 L1134 288Z" />
          <path d="M1123 262 V236 L1146 244 L1123 252" fill="#7d1f17" />
          <path d="M260 470 V420 h10 v-8 h6 v8 h8 v-8 h6 v8 h10 V470Z" />
          <path d="M281 404 V384 L298 390 L281 396" fill="#1d3f80" />
        </g>
        <path d="M0 540 C300 510 500 540 800 520 C1100 500 1300 530 1600 515 L1600 600 L0 600Z" fill="#0b0c0e" />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,12,14,0.85)_0%,rgba(11,12,14,0.35)_55%,rgba(11,12,14,0.65)_100%)]" />
    </div>
  )
}
