import { Crown, Dices, Handshake, LoaderCircle, Moon, RotateCcw, ScrollText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { GameEngine } from '../game/engine'
import { MAPS, MAP_TYPES, type MapType } from '../game/biomes'
import { generateCountryside } from '../game/countryside'
import { generateMap, type GeneratedMap } from '../game/mapgen'
import { CONVOY, generateConvoyMap } from '../game/convoymap'
import { NIGHT, generateNightMap } from '../game/nightmap'
import { generateGrandMap } from '../game/grandmap'
import { Glyph } from './Glyph'
import { PixelPortrait } from './PixelPortrait'
import { drawGranges, drawStructures, drawTemple } from './mapPaint'
import { World } from '../game/world'
import type { CastleDef, Difficulty, FactionDef, GameContent, GameMode, ScenarioDefinition } from '../game/types'
import type { Match } from './GameScreen'
import { chargeForTeam, drawShield, shieldMarkup, shieldSvg, type ShieldCharge } from '../render/heraldry'
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

type MenuMode = 'conquest' | 'alliance' | 'convoy' | 'nightfall' | 'grand'
type Side = 'escort' | 'raid'
/** Who may lead the escort (the spymaster leads the raiders; the King stays at court). */
const ESCORT_COMMANDERS = ['godfrey', 'elowen', 'varian', 'isolde', 'bran']

/** What each map-kind war is like (each has one size of map). */
const WAR_HINT: Record<'survival' | 'alliance', string> = {
  survival: "Two realms of a size: your seat and two strongholds against the Ashen Dominion's. A close, quick war.",
  alliance: "Your kingdom and the allied king's against the Usurper's and the Iron King's. Slay both enemy kings, or take both their seats.",
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
    tagline: 'Two realms of a size',
    text: 'Your royal seat and two strongholds against the Ashen Dominion\'s. Take the enemy seat. Every war is fought on a freshly generated map.',
  },
  {
    key: 'alliance',
    name: 'Alliance War',
    icon: <Handshake size={22} />,
    tagline: 'Two kingdoms against two',
    text: 'An allied king has called you to his aid. Fight beside him; a king slain hands his kingdom to the king beside him.',
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
  {
    key: 'grand',
    name: 'Three Crowns',
    icon: <Crown size={22} />,
    tagline: 'Three realms, one continent',
    text: 'The King, the Usurper Queen and the Sun Emperor, each in a walled royal city ringed by vassal lords, at war for a whole continent. No time limit: shatter both rival crowns.',
  },
]

export function MainMenu({ content, error, onRetry, onStart }: Props) {
  const [menuMode, setMenuMode] = useState<MenuMode>('conquest')
  // Both modes offer the same six generated maps; Conquest uses the "survival" ruleset.
  const [mapType, setMapChoice] = useState<MapType>('crown')
  const mode: GameMode = menuMode === 'conquest' ? 'survival' : menuMode
  const convoy = mode === 'convoy'
  const nightfall = mode === 'nightfall'
  const grand = mode === 'grand'
  const [side, setSide] = useState<Side>('escort')
  const [escortCmd, setEscortCmd] = useState('godfrey')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  /** Alliance War: the High King's Blessing (the Sanctuary of the High King). Off unless chosen. */
  const [blessing, setBlessing] = useState(false)
  // Last Stand belongs to Alliance War (the relief fleet); the other modes offer three levels.
  const diffs = mode === 'alliance' ? DIFFS : DIFFS.filter((d) => d.key !== 'brutal')
  const curDiff = DIFFS.find((d) => d.key === difficulty)!
  const diffText = nightfall ? curDiff.night : convoy ? curDiff.convoy : mode === 'alliance' ? curDiff.alliance : curDiff.text
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999))
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
  const previewKey = grand ? `grand|${seed}` : nightfall ? `nightfall|${seed}|${difficulty}` : convoy ? `convoy|${side}|${seed}` : `${mode}|${mapType}|${seed}|${mapDiff ?? ''}`
  const makeMap = () =>
    grand
      ? generateGrandMap(seed)
      : nightfall
      ? generateNightMap(seed, difficulty)
      : convoy
      ? generateConvoyMap(seed, {
          side,
          commander: side === 'raid' ? 'ashe' : escortCmd,
          difficulty,
        })
      : generateMap(mode as 'survival' | 'alliance', seed, {
          mapType,
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
      // (Alliance War: the High King's Blessing, if chosen.)
      const rules = menuMode === 'alliance' ? { ...map.rules, blessing } : map.rules
      const engine = GameEngine.create(content, map.scenario, rules, difficulty, map.world)
      const defaultName = nightfall || grand ? map.scenario.name : convoy ? `Convoy Raid · ${side === 'escort' ? 'Escort' : 'Raid'}` : `${mode === 'alliance' ? 'Alliance War' : 'Conquest'} · ${MAPS[mapType].name}`
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

  const biome = MAPS[grand ? 'continent' : nightfall ? 'kingsvale' : convoy ? 'greenwood' : mapType]
  const def = preview?.key === previewKey ? (preview.map?.scenario.definition ?? scenario?.definition) : undefined

  return (
    <div className="wc-root relative h-dvh overflow-hidden text-ink-100">
      <div className="menu-root relative z-10 mx-auto flex h-full max-w-[1560px] flex-col px-[clamp(10px,2vw,32px)] py-[clamp(6px,1.6vh,20px)] max-[640px]:overflow-y-auto short:overflow-y-auto">
        <header className="flex shrink-0 justify-center pb-[clamp(4px,1.4vh,16px)] tiny:hidden">
          <Wordmark />
        </header>

        {!content && !error && (
          <div className="wc-panel flex items-center gap-2 p-6 text-[#d8b866]">
            <LoaderCircle size={16} className="animate-spin" /> Contacting the royal archives…
          </div>
        )}
        {error && (
          <div className="wc-panel space-y-3 p-7">
            <p className="font-bold text-ember-300">{error}</p>
            <p className="text-[13px] text-ink-300">
              Start the backend with <code className="text-ink-100">cd backend &amp;&amp; .venv/bin/python manage.py runserver</code>
            </p>
            <button className="wc-btn" onClick={onRetry}>
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        )}

        {content && scenario && (
          <div className="grid min-h-0 flex-1 grid-cols-[1.3fr_1fr] gap-[clamp(10px,1.6vw,26px)] max-[640px]:flex-none max-[640px]:grid-cols-1 max-[640px]:grid-rows-none short:flex-none">
            {/* Left: how the war is to be fought. */}
            <section className="wc-panel flex min-h-0 min-w-0 flex-col px-[clamp(16px,2vw,32px)] py-[clamp(12px,2.2vh,28px)] max-[640px]:min-h-max short:min-h-max">
              <Corners />
              <h2 className="wc-title wc-brass-text mb-[clamp(4px,1.1vh,14px)] text-[clamp(15px,2.3vh,22px)] short:hidden">Prepare for War</h2>
              <Label>Game mode</Label>
              <div className="grid grid-cols-5 gap-[clamp(6px,0.8vw,12px)] max-[900px]:grid-cols-3">
                {MODES.map((m) => {
                  const active = menuMode === m.key
                  return (
                    <button
                      key={m.key}
                      onClick={() => {
                        setMenuMode(m.key)
                        if (m.key !== 'alliance' && difficulty === 'brutal') setDifficulty('hard')
                      }}
                      className={`wc-mode flex min-w-0 flex-col text-left ${active ? 'is-active' : ''}`}
                    >
                      <svg className="wc-crown" viewBox="0 0 24 14" aria-hidden>
                        <path d="M2 13 L1 4 L6.5 8 L12 1 L17.5 8 L23 4 L22 13 Z" fill="#f0c460" stroke="#3a2406" strokeWidth="1.2" strokeLinejoin="round" />
                        <circle cx="12" cy="10" r="1.6" fill="#a8222c" />
                      </svg>
                      <div className="wc-mode-band grid h-[clamp(30px,6.4vh,64px)] shrink-0 place-items-center short:hidden" style={{ ['--band' as string]: MODE_BAND[m.key] }}>
                        <span className="wc-medallion size-[clamp(24px,4.2vh,40px)] [&>svg]:size-[55%]">{m.icon}</span>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col px-[clamp(6px,0.7vw,11px)] pt-[clamp(4px,0.9vh,9px)] pb-[clamp(6px,1vh,10px)]">
                        <span className="min-h-[2.3em] text-center font-display text-[clamp(11px,1.55vh,14px)] leading-[1.15] font-bold text-balance break-words text-[#f0dfb6] short:min-h-0 short:text-left short:text-[11.5px]">{m.name}</span>
                        <div className="wc-tag mt-1 line-clamp-2 text-center text-[clamp(11px,1.45vh,12.5px)] leading-snug font-bold short:hidden">{m.tagline}</div>
                        <div className="wc-text mt-1 line-clamp-2 text-[12px] leading-snug tall:line-clamp-3 short:hidden">{m.text}</div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {grand ? (
                <GrandSetup def={preview?.key === previewKey ? preview.map?.scenario.definition : undefined} />
              ) : nightfall ? (
                <NightSetup def={preview?.key === previewKey ? preview.map?.scenario.definition : undefined} name={preview?.key === previewKey ? preview.map?.scenario.name : undefined} />
              ) : convoy ? (
                <ConvoySetup side={side} setSide={setSide} commander={escortCmd} setCommander={setEscortCmd} content={content} />
              ) : (
                <div className="mt-[clamp(6px,1.6vh,18px)] flex min-h-0 flex-1 flex-col">
                  <Label>Map</Label>
                  <div className="grid min-h-[44px] flex-1 auto-rows-fr grid-cols-3 gap-[clamp(6px,0.8vw,12px)] max-[640px]:grid-cols-2">
                    {MAP_TYPES.map((k) => {
                      const b = MAPS[k]
                      const crest = MAP_CREST[k] ?? { color: '#2f4f9a', charge: 'fleur' as const }
                      return (
                        <button key={k} onClick={() => setMapChoice(k)} className={`wc-map flex min-h-0 flex-col text-left ${mapType === k ? 'is-active' : ''}`}>
                          <div className="wc-scape relative min-h-[clamp(10px,2.4vh,26px)] flex-1">
                            <MapScape colors={b.swatch} seed={k.length * 7 + k.charCodeAt(0)} />
                            <span
                              className="absolute top-1/2 left-[clamp(5px,0.6vw,9px)] h-[78%] max-h-[44px] -translate-y-1/2 drop-shadow-[0_2px_3px_rgb(0_0_0/0.7)] short:hidden [&>svg]:h-full [&>svg]:w-auto"
                              dangerouslySetInnerHTML={{ __html: shieldSvg('lord', crest.color, 20, crest.charge, '') }}
                            />
                          </div>
                          <div className="px-2 pt-[clamp(3px,0.6vh,6px)] pb-[clamp(3px,0.7vh,7px)]">
                            <div className="truncate font-display text-[clamp(11.5px,1.55vh,14px)] leading-tight font-bold text-[#f0dfb6]">{b.name}</div>
                            <div className="truncate text-[12px] text-[#b8a07a] short:hidden">{b.tagline}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="mt-[clamp(6px,1.6vh,18px)] grid grid-cols-[3fr_4fr] gap-[clamp(8px,1.4vw,20px)] max-[640px]:grid-cols-1">
                <div className={`min-w-0 ${menuMode === 'alliance' ? '' : 'short:hidden'}`}>
                  <Label>{grand ? 'The war' : nightfall ? 'Until dawn' : convoy ? 'The train' : 'The war'}</Label>
                  <p className="text-[12.5px] leading-snug text-[#c9b892] short:hidden">
                    {grand
                      ? 'No time limit. A long campaign across a vast continent.'
                      : nightfall
                        ? `${NIGHT.minutes[difficulty]} minutes. Waves grow with every one.`
                        : convoy
                          ? `${CONVOY.wagons} wagons, one every ${CONVOY.every}s. ${side === 'escort' ? `Bring ${CONVOY.needed} in.` : `Seize ${CONVOY.wagons - CONVOY.needed + 1}.`}`
                          : WAR_HINT[mode as 'survival' | 'alliance']}
                  </p>
                  {menuMode === 'alliance' && (
                    <button
                      className={`wc-tab wc-bless mt-[clamp(4px,0.9vh,8px)] flex w-full items-center justify-center gap-1.5 px-2 py-[clamp(4px,0.8vh,7px)] ${blessing ? 'is-active' : ''}`}
                      onClick={() => setBlessing((b) => !b)}
                      aria-pressed={blessing}
                      title="The Sanctuary of the High King stands on the map. Once in the war the King may pray there for 30 seconds: his guard grows to 800, his presence widens, and the High King's paladins ride out until four enemy castles are ours."
                    >
                      <Glyph name="sun" size={14} />
                      <span className="truncate">High King&apos;s Blessing · {blessing ? 'On' : 'Off'}</span>
                    </button>
                  )}
                </div>
                <div className="min-w-0 short:col-span-2">
                  <Label>Difficulty</Label>
                  <div className={`grid gap-[clamp(5px,0.5vw,8px)] ${diffs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {diffs.map((d) => (
                      <button
                        key={d.key}
                        onClick={() => setDifficulty(d.key)}
                        title={convoy ? d.convoy : mode === 'alliance' ? d.alliance : d.text}
                        className={`wc-tab diff-btn px-1 py-[clamp(5px,1vh,9px)] whitespace-nowrap ${diffs.length === 4 ? 'wc-tab-4' : 'text-[clamp(11px,1.5vh,13px)]'} short:text-[10.5px] short:tracking-[0.04em] max-[640px]:text-[11px] max-[640px]:tracking-[0.04em] ${difficulty === d.key ? 'is-active' : ''}`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  {/* One line only (the full text is on hover), so the panel never shifts. */}
                  <p className={`mt-1 truncate text-[12.5px] leading-snug text-[#b8a07a] italic ${convoy || nightfall ? 'short:hidden' : ''}`} title={diffText}>
                    {diffText}
                  </p>
                </div>
              </div>

              <div className="h-[clamp(8px,2vh,24px)] shrink-0" />
              <BeginPlate busy={busy === 'new'} onClick={start} />
              {err && <p className="mt-2 rounded-sm bg-ember-900/40 p-2 text-[13px] text-ember-300">{err}</p>}
            </section>

            {/* Right: the land itself. */}
            <section className="wc-panel flex min-h-0 min-w-0 flex-col items-center px-[clamp(16px,1.8vw,28px)] pt-[clamp(12px,2vh,24px)] pb-[clamp(10px,1.8vh,22px)] max-[640px]:min-h-[540px]">
              <Corners />
              <h2 className="wc-plaque mb-[clamp(8px,1.4vh,16px)] max-w-full truncate px-4 py-1 text-[clamp(13px,1.9vh,17px)] short:hidden">{biome.name}</h2>
              {/* The map is always square: as large as fits both the width and the height of the panel. */}
              <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
                <div className="wc-frame wc-tight relative size-[min(100cqw,100cqh)]">
                  <div className="wc-frame-in h-full w-full">
                    {preview?.key === previewKey ? (
                      <MapPreview world={preview.world} castles={def?.castles ?? []} factions={def?.factions} seed={preview.map?.scenario.seed ?? seed} plain={convoy} bridge={preview.map?.rules.convoy?.bridge} rifts={preview.map?.rules.night?.rifts} temple={menuMode === 'alliance' && blessing ? def?.sanctuary : undefined} />
                    ) : (
                      <div className="grid h-full place-items-center bg-[#0f0b08] text-[#d8b866]">
                        <LoaderCircle size={20} className="animate-spin" />
                      </div>
                    )}
                  </div>
                  <Corners />
                  <button className="wc-btn absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" onClick={() => setSeed(Math.floor(Math.random() * 99999))}>
                    <Dices size={14} /> A different map
                  </button>
                </div>
              </div>
              <div className="wc-parch mt-[clamp(22px,3.4vh,34px)] w-full px-3 py-[clamp(4px,1vh,10px)]">
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
              </div>
              {def && (
                <div className="mt-[clamp(6px,1.2vh,12px)] grid w-full grid-cols-3 gap-[clamp(6px,0.8vw,12px)] text-center">
                  {nightfall ? (
                    <>
                      <Plaque label="Gates" value={def.castles.filter((c) => c.gate).length} />
                      <Plaque label="Wards" value={def.castles.filter((c) => c.district).length} />
                      <Plaque label="Rifts" value={preview?.map?.rules.night?.rifts.length ?? 0} />
                    </>
                  ) : convoy ? (
                    <>
                      <Plaque label="Wagons" value={CONVOY.wagons} />
                      <Plaque label={side === 'escort' ? 'To bring in' : 'To seize'} value={side === 'escort' ? CONVOY.needed : CONVOY.wagons - CONVOY.needed + 1} />
                      <Plaque label="Crossings" value={def.bridges.length + 1} />
                    </>
                  ) : (
                    <>
                      <Plaque label="Castles" value={def.castles.length} />
                      <Plaque label="Realms" value={(def.factions ?? []).filter((f) => f.team !== 'N').length || 2} />
                      <Plaque label="Crossings" value={def.bridges.length} />
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/** Brass L-fittings at the four corners of whatever holds them. */
function Corners() {
  return (
    <>
      {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
        <span key={k} className={`wc-corner ${k}`} aria-hidden />
      ))}
    </>
  )
}

/** The band at the head of each mode's card: a deep ground under the pattern. */
const MODE_BAND: Record<MenuMode, string> = {
  conquest: 'linear-gradient(180deg, #4a2a14, #24140a)',
  alliance: 'linear-gradient(180deg, #5a1418, #2a080a)',
  convoy: 'linear-gradient(180deg, #1e3a26, #0c1a10)',
  nightfall: 'linear-gradient(180deg, #1c2448, #0a0e20)',
  grand: 'linear-gradient(180deg, #3e2448, #1a0e20)',
}

/** Each map's arms on its card. */
const MAP_CREST: Partial<Record<MapType, { color: string; charge: ShieldCharge }>> = {
  crown: { color: '#a8282a', charge: 'fleur' },
  delta: { color: '#2f63c4', charge: 'sun' },
  frostfire: { color: '#2a2a32', charge: 'iron' },
  coast: { color: '#8f1d1d', charge: 'thorn' },
  basin: { color: '#1f5a8a', charge: 'fleur' },
  divide: { color: '#3f5a2a', charge: 'iron' },
}

/** A map's three colours as layers of country (far, middle, near) under a dusk sky. */
function MapScape({ colors, seed }: { colors: [string, string, string]; seed: number }) {
  const id = `wc-sky-${seed}`
  const w = (k: number, a: number, b: number) => Array.from({ length: 9 }, (_, i) => `${i * 12.5},${(a + Math.sin(i * 1.7 + seed * 0.37 + k) * b).toFixed(1)}`).join(' L')
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a1622" />
          <stop offset="1" stopColor="#4a3a32" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="100" height="40" fill={`url(#${id})`} />
      <path d={`M0,40 L${w(0, 16, 6)} L100,40 Z`} fill={colors[0]} />
      <path d={`M0,40 L${w(2, 25, 3.5)} L100,40 Z`} fill={colors[1]} />
      <path d={`M0,40 L${w(4, 32, 2)} L100,40 Z`} fill={colors[2]} />
      <rect width="100" height="40" fill={`url(#${id}-s)`} />
    </svg>
  )
}

/**
 * The WARBOX wordmark: carved gold capitals with the O struck as the realm's crowned shield, and
 * the story's line beneath between brass rules ending in diamond rivets.
 */
function Wordmark() {
  return (
    <div className="flex select-none flex-col items-center">
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
      <div className="wc-subtitle mt-[clamp(3px,0.8vh,8px)] w-[min(100%,46em)] text-[clamp(9.5px,1.35vh,12.5px)] short:hidden max-[640px]:text-[8.5px] max-[640px]:tracking-[0.12em]">
        <span className="wc-rule" />
        <span className="wc-rivet" />
        <span>THE WAR FOR THE THORN THRONE · MCCXLVII</span>
        <span className="wc-rivet" />
        <span className="wc-rule r" />
      </div>
    </div>
  )
}

/** A fine filigree for the corners of the plate (drawn for the top left; turned for the others). */
function Filigree({ at }: { at: 'tl' | 'tr' | 'bl' | 'br' }) {
  const pos = { tl: 'top-[5px] left-[5px]', tr: 'top-[5px] right-[5px] -scale-x-100', bl: 'bottom-[5px] left-[5px] -scale-y-100', br: 'right-[5px] bottom-[5px] -scale-100' }[at]
  return (
    <svg className={`wc-filigree ${pos}`} viewBox="0 0 26 26" aria-hidden>
      <path d="M2 24 V6 Q2 2 6 2 H24" fill="none" stroke="#f0c460" strokeWidth="1.4" />
      <path d="M6 20 V9 Q6 6 9 6 H20" fill="none" stroke="#b88a2e" strokeWidth="0.9" />
      <path d="M9 9 Q14 9.5 14 14 Q9.5 14 9 9 Z" fill="#f0c460" opacity="0.85" />
      <path d="M2 2 L5 5" stroke="#fff3c4" strokeWidth="1" />
      <circle cx="16.5" cy="6" r="1.1" fill="#f0c460" />
      <circle cx="6" cy="16.5" r="1.1" fill="#f0c460" />
    </svg>
  )
}

/** A sword pointing up, for either side of the plate's lettering. */
function PlateSword() {
  return (
    <svg className="h-[clamp(24px,4.2vh,40px)] w-auto shrink-0 drop-shadow-[0_2px_2px_rgb(0_0_0/0.6)]" viewBox="0 0 20 40" aria-hidden>
      <defs>
        <linearGradient id="wc-blade" x1="0" x2="1">
          <stop offset="0" stopColor="#f6f8fa" />
          <stop offset="0.5" stopColor="#d2d7dd" />
          <stop offset="0.51" stopColor="#8f969f" />
          <stop offset="1" stopColor="#b8bec6" />
        </linearGradient>
        <linearGradient id="wc-hilt" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#d8a642" />
          <stop offset="1" stopColor="#6e490c" />
        </linearGradient>
      </defs>
      <path d="M10 1 L12.6 6 V26 H7.4 V6 Z" fill="url(#wc-blade)" stroke="#2a0a0c" strokeWidth="0.7" strokeLinejoin="round" />
      <path d="M10 6 V24.5" stroke="#6b737c" strokeWidth="0.7" />
      <path d="M1.5 26 Q10 28.4 18.5 26 L18.8 28 Q10 30.2 1.2 28 Z" fill="url(#wc-hilt)" stroke="#3a2406" strokeWidth="0.6" />
      <rect x="8.6" y="29" width="2.8" height="6.4" rx="0.6" fill="#4a2a18" stroke="#1a0e06" strokeWidth="0.4" />
      <path d="M8.6 30.5 H11.4 M8.6 32.2 H11.4 M8.6 33.9 H11.4" stroke="#c9a04a" strokeWidth="0.45" />
      <circle cx="10" cy="37" r="2.2" fill="url(#wc-hilt)" stroke="#3a2406" strokeWidth="0.6" />
    </svg>
  )
}

/** The call to arms: a royal crimson plate in black iron and double brass, filigree at its corners. */
function BeginPlate({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button className="wc-begin shrink-0" onClick={onClick} disabled={busy}>
      <span className="wc-begin-face">
        {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
          <Filigree key={k} at={k} />
        ))}
        <PlateSword />
        <span className="wc-sep" />
        <span className="wc-begin-text wc-brass-text flex items-center gap-2 text-[clamp(15px,2.4vh,22px)] whitespace-nowrap">
          {busy && <LoaderCircle size={18} className="animate-spin text-[#f0c460]" />}
          {busy ? 'RAISING THE BANNERS' : 'BEGIN THE WAR'}
        </span>
        <span className="wc-sep r" />
        <PlateSword />
      </span>
    </button>
  )
}

function Plaque({ label, value }: { label: string; value: number }) {
  return (
    <div className="wc-stat py-[clamp(4px,0.8vh,8px)]">
      <div className="font-display text-[10px] font-bold tracking-[0.18em] text-[#c9a24a] uppercase">{label}</div>
      <div className="wc-brass-text font-display text-[clamp(15px,2.4vh,21px)] leading-tight font-bold">{value}</div>
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

/** The War of the Three Crowns: the three realms and what it takes to win. */
function GrandSetup({ def }: { def?: ScenarioDefinition }) {
  const crowns = (def?.factions ?? []).filter((f) => f.id === 'player' || f.leader)
  const keep = (id: string) => def?.castles.find((c) => c.faction === id && c.capital && c.tier >= ROYAL_SEAT_TIER)?.name
  const who: Record<string, string> = { A: 'King Aldric', B: 'Queen Morwenna, the Usurper', C: 'Vaelor, the Sun Emperor' }
  return (
    <div className="mt-[clamp(6px,1.8vh,20px)] flex flex-1 flex-col short:mt-1">
      <Label>Three crowns</Label>
      <ul className="space-y-[clamp(3px,0.8vh,8px)]">
        {crowns.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-[clamp(11.5px,1.6vh,13.5px)] leading-snug text-ink-300">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: f.color }} />
            <span className="truncate">
              <b className="text-ink-100">{f.name}</b> · {who[f.team]}
              {keep(f.id) ? <span className="text-ink-500"> · {keep(f.id)}</span> : null}
            </span>
          </li>
        ))}
        <li className="flex gap-2 text-[clamp(11.5px,1.6vh,13.5px)] leading-snug text-ink-300">
          <Glyph name="crown" size={15} className="mt-0.5 text-gold-300" />
          <span className="line-clamp-2 short:line-clamp-1">Shatter both rival crowns (slay the monarch or take the Citadel). Lose your Citadel and the King, and the war is lost.</span>
        </li>
        <li className="flex gap-2 text-[clamp(11.5px,1.6vh,13.5px)] leading-snug text-ink-300">
          <Glyph name="swords" size={15} className="mt-0.5 text-gold-300" />
          <span className="line-clamp-2 short:line-clamp-1">The rival crowns fight each other too, and both lean on whoever grows strongest.</span>
        </li>
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
      text: "Rob the train: Corvin Ashe's Whisper Blades strike down the guards' leaders; bowmen, light horse and sappers lie in three camps in the forest.",
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

function MapPreview({
  world,
  castles,
  factions,
  seed,
  plain,
  bridge,
  rifts,
  temple,
}: {
  world: World
  castles: CastleDef[]
  factions?: FactionDef[]
  seed: number
  plain?: boolean
  bridge?: [number, number]
  rifts?: { x: number; z: number }[]
  /** The Sanctuary of the High King (Alliance War, with the High King's Blessing). */
  temple?: { x: number; z: number }
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  // The countryside is laid out when the war begins; work it out here too (it is deterministic) so the preview shows it.
  const country = useMemo(() => {
    if (plain) return { villages: [], sites: [], granges: [] }
    try {
      // (No granges on the Long Night.)
      const c = generateCountryside(world, castles, seed, { granges: !rifts })
      // (Nothing is built near the Sanctuary.)
      if (!temple) return c
      const clear = (p: { x: number; z: number }) => Math.hypot(temple.x - p.x, temple.z - p.z) > 260
      return { villages: c.villages.filter(clear), sites: c.sites.filter(clear), granges: c.granges.filter(clear) }
    } catch {
      return { villages: [], sites: [], granges: [] }
    }
  }, [world, castles, seed, plain, rifts, temple])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const S = 360
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
    // The marks are drawn in a 190-unit frame, scaled up: the same size on the page, but sharp.
    const D = 190
    ctx.setTransform(S / D, 0, 0, S / D, 0, 0)
    drawStructures(ctx, world, D)
    const team = (fid: string) => factions?.find((f) => f.id === fid)?.team ?? (fid === 'player' ? 'A' : fid === 'neutral' ? 'N' : 'B')
    const px = (v: number) => ((v + world.half) / world.size) * D
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
    // The granges, each tied to its castle.
    drawGranges(
      ctx,
      world,
      D,
      country.granges,
      (id) => castles.find((c) => c.id === id),
      (g) => {
        const f = castles.find((c) => c.id === g.castleId)?.faction ?? 'neutral'
        return f === 'neutral' ? '#8a7a56' : (factions?.find((x) => x.id === f)?.color ?? '#5f93ec')
      },
    )
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
    if (temple) drawTemple(ctx, px(temple.x), px(temple.z), 6.5, 1)
    for (const k of castles) {
      // (A city's gatehouses and wards are part of the city: its walls show them.)
      if (k.gate || k.district) continue
      const x = ((k.x + world.half) / world.size) * D
      const y = ((k.z + world.half) / world.size) * D
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
      ctx.fillStyle = k.faction === 'player' ? '#5f93ec' : t === 'A' ? '#4fd1c5' : t === 'B' ? '#de5f45' : t === 'C' ? '#e8a030' : '#d1a73f'
      const rank = k.tier >= ROYAL_SEAT_TIER ? 'royal' : k.capital ? 'lord' : 'castle'
      drawShield(ctx, x, y, rank === 'royal' ? 13 : rank === 'lord' ? 10 : 8, ctx.fillStyle as string, rank, chargeForTeam(t))
    }
    // An old campaign map: the corners in shadow, a fine gilt line inside the frame.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.74)
    vg.addColorStop(0, 'rgba(20,12,4,0)')
    vg.addColorStop(1, 'rgba(20,12,4,0.42)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(232,192,102,0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(4.5, 4.5, S - 9, S - 9)
  }, [world, castles, factions, country, bridge, rifts, temple])
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
  return <div className="wc-label mb-1.5 text-[11.5px] uppercase">{children}</div>
}

/** Layered silhouette landscape for the title screen. */
export function MenuBackdrop() {
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
