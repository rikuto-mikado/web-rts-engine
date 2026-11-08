import { Castle as CastleIcon, Crown, Dices, Handshake, LoaderCircle, RotateCcw, ScrollText, Swords } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { GameEngine } from '../game/engine'
import { BIOMES, MAP_TYPES, type MapType } from '../game/biomes'
import { generateMap, type GeneratedMap } from '../game/mapgen'
import { generateSiege } from '../game/siegegen'
import { World } from '../game/world'
import type { CastleDef, Difficulty, FactionDef, GameContent, GameMode, MapSize, SiegeSide } from '../game/types'
import type { Match } from './GameScreen'

interface Props {
  content: GameContent | null
  error: string | null
  onRetry: () => void
  onStart: (m: Match) => void
}

const DIFFS: { key: Difficulty; name: string; text: string }[] = [
  { key: 'easy', name: 'Squire', text: 'A poorer, slower enemy. Learn the ropes.' },
  { key: 'normal', name: 'Knight', text: 'The intended challenge.' },
  { key: 'hard', name: 'Warlord', text: 'Rich and relentless foes.' },
]

type MenuMode = 'conquest' | 'alliance' | 'siege'

const SIZE_HINT: Record<'survival' | 'alliance' | 'siege', Record<MapSize, string>> = {
  survival: { small: '10 castles, a quick war (about 20 min).', medium: '15 castles, the standard war.', large: '24 castles, a long campaign. You start with 3.' },
  alliance: { small: '16 realms on a compact map.', medium: '24 realms.', large: '32 realms on a vast map.' },
  siege: { small: '4 gates, 3 enemy camps, 15 minutes.', medium: '6 gates, 5 camps, 20 minutes.', large: '8 gates, 7 camps, 25 minutes.' },
}

const MODES: { key: MenuMode; name: string; icon: ReactNode; tagline: string; text: string }[] = [
  {
    key: 'conquest',
    name: 'Conquest',
    icon: <ScrollText size={22} />,
    tagline: 'You against a coalition',
    text: 'Break an enemy coalition and take its capitals. Play the hand-crafted Ashen Marches or a freshly generated map.',
  },
  {
    key: 'alliance',
    name: 'Alliance War',
    icon: <Handshake size={22} />,
    tagline: '16 to 32 realms, two alliances',
    text: 'Fight beside a coalition of AI lords on a huge random map. Call your allies to arms and take the enemy High Seat.',
  },
  {
    key: 'siege',
    name: 'Great Siege',
    icon: <CastleIcon size={22} />,
    tagline: 'One town, attacked from every side',
    text: 'A close, intense battle for a walled town. You are one lord among many: defend the streets or storm them.',
  },
]

export function MainMenu({ content, error, onRetry, onStart }: Props) {
  const [menuMode, setMenuMode] = useState<MenuMode>('conquest')
  const [mapChoice, setMapChoice] = useState<MapType | 'ashen'>('ashen')
  // Conquest on the hand-made map is the "campaign" ruleset; on a random map it is "survival".
  const mode: GameMode = menuMode === 'conquest' ? (mapChoice === 'ashen' ? 'campaign' : 'survival') : menuMode
  const mapType: MapType = mapChoice === 'ashen' ? 'vales' : mapChoice
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999))
  const [mapSize, setMapSize] = useState<MapSize>('medium')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [siegeSide, setSiegeSide] = useState<SiegeSide>('defend')
  const [preview, setPreview] = useState<{ key: string; map: GeneratedMap | null; world: World } | null>(null)
  const scenario = content?.scenarios[0]
  const previewKey = mode === 'campaign' ? 'campaign' : mode === 'siege' ? `siege|${siegeSide}|${mapType}|${seed}|${difficulty}|${mapSize}` : `${mode}|${mapType}|${seed}|${mapSize}`

  // Generate the map in the background so the player can see it before starting.
  useEffect(() => {
    if (!scenario) return
    const t = window.setTimeout(() => {
      try {
        if (mode === 'campaign') setPreview({ key: previewKey, map: null, world: new World(scenario) })
        else if (mode === 'siege') {
          const map = generateSiege(siegeSide, seed, mapType, difficulty, mapSize)
          setPreview({ key: previewKey, map, world: map.world })
        } else {
          const map = generateMap(mode, seed, { mapType, size: mapSize })
          setPreview({ key: previewKey, map, world: map.world })
        }
      } catch (e) {
        setErr((e as Error).message)
      }
    }, 180)
    return () => window.clearTimeout(t)
  }, [previewKey, mode, mapType, seed, mapSize, scenario, siegeSide, difficulty])

  const start = async () => {
    if (!content || !scenario) return
    setBusy('new')
    setErr(null)
    await new Promise((r) => setTimeout(r, 30))
    try {
      let engine: GameEngine
      if (mode === 'campaign') engine = GameEngine.newCampaign(content, scenario.key, difficulty)
      else {
        const cached = preview?.key === previewKey && preview.map ? preview.map : null
        const map = cached ?? (mode === 'siege' ? generateSiege(siegeSide, seed, mapType, difficulty, mapSize) : generateMap(mode, seed, { mapType, size: mapSize }))
        engine = GameEngine.create(content, map.scenario, map.rules, difficulty, map.world)
      }
      const defaultName = mode === 'campaign' ? 'The Ashen Marches' : mode === 'siege' ? engine.scenario.name : mode === 'alliance' ? `Alliance War · ${BIOMES[mapType].name}` : `Conquest · ${BIOMES[mapType].name}`
      const matchName = defaultName
      const record = await api
        .createCampaign({ name: matchName, mode, seed: mode === 'campaign' ? null : seed, scenario: mode === 'campaign' ? scenario.key : null, difficulty, state: null })
        .catch(() => null)
      onStart({ id: record?.id ?? null, name: matchName, engine })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(null)
    }
  }

  const biome = BIOMES[mapType]
  const def = preview?.key === previewKey ? (preview.map?.scenario.definition ?? scenario?.definition) : undefined

  return (
    <div className="relative h-full overflow-hidden bg-ink-950">
      <MenuBackdrop />
      <div className="scroll-thin relative z-10 h-full overflow-y-auto">
        <div className="mx-auto w-[1160px] max-w-full px-4 py-6 sm:px-6 sm:py-10">
          <header className="mb-6 sm:mb-8">
            <div className="mb-2 flex items-center gap-3 text-gold-300">
              <Crown size={28} />
              <div className="h-px w-40 bg-gradient-to-r from-gold-400/60 to-transparent" />
            </div>
            <h1 className="font-gothic text-5xl leading-none text-gold-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-7xl">Warbox</h1>
            <p className="mt-1 font-display text-[13px] font-bold tracking-[0.35em] text-gold-400/80">MEDIEVAL WAR SANDBOX</p>
            <p className="mt-3 max-w-xl text-[15px] text-ink-300 [@media(max-height:500px)]:hidden">Raise armies, choose commanders, formations and the balance of pike, bow and horse, then break your enemies on a living medieval map.</p>
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
            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <div className="panel flex flex-col rounded-md p-4 sm:p-6 lg:h-[680px]">
                <h2 className="panel-title mb-4">Prepare for War</h2>
                <Label>Game mode</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {MODES.map((m) => {
                    const active = menuMode === m.key
                    return (
                      <div
                        key={m.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setMenuMode(m.key)
                          if (m.key !== 'conquest' && mapChoice === 'ashen') setMapChoice('vales')
                        }}
                        className={`well flex cursor-pointer flex-col rounded-sm p-3 text-left transition sm:h-[150px] ${active ? 'outline outline-1 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={active ? 'text-gold-300' : 'text-ink-300'}>{m.icon}</span>
                          <span className="font-display text-[15px] font-bold text-gold-100">{m.name}</span>
                        </div>
                        <div className="mt-1 text-[13px] font-bold text-gold-300/85">{m.tagline}</div>
                        {m.key === 'siege' && active ? (
                          <div className="mt-auto grid grid-cols-2 gap-1 pt-2">
                            {(['defend', 'attack'] as const).map((k) => (
                              <button
                                key={k}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSiegeSide(k)
                                }}
                                className={`btn h-8 min-h-0 px-1 text-[12px] ${siegeSide === k ? 'btn-gold' : ''}`}
                              >
                                {k === 'defend' ? 'Defend' : 'Attack'}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink-400">{m.text}</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="scroll-thin mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                  <Label>Map</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {menuMode === 'conquest' && (
                      <button
                        onClick={() => setMapChoice('ashen')}
                        className={`well overflow-hidden rounded-sm text-left transition ${mapChoice === 'ashen' ? 'outline outline-1 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
                      >
                        <div className="flex h-6">
                          {['#4f7a2e', '#3b7ea1', '#8f1d1d'].map((c, i) => (
                            <span key={i} className="flex-1" style={{ background: c }} />
                          ))}
                        </div>
                        <div className="px-2 py-1.5">
                          <div className="text-[13px] leading-tight font-bold text-ink-100">The Ashen Marches</div>
                          <div className="text-[12px] text-gold-300/80">Hand-crafted</div>
                        </div>
                      </button>
                    )}
                    {MAP_TYPES.map((k) => {
                      const b = BIOMES[k]
                      return (
                        <button
                          key={k}
                          onClick={() => setMapChoice(k)}
                          className={`well overflow-hidden rounded-sm text-left transition ${mapChoice === k ? 'outline outline-1 outline-gold-400 brightness-125' : 'hover:brightness-125'}`}
                        >
                          <div className="flex h-6">
                            {b.swatch.map((c, i) => (
                              <span key={i} className="flex-1" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="px-2 py-1.5">
                            <div className="text-[13px] leading-tight font-bold text-ink-100">{b.name}</div>
                            <div className="text-[12px] text-gold-300/80">{b.tagline}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Map size</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['small', 'medium', 'large'] as const).map((z) => (
                          <button key={z} disabled={mode === 'campaign'} onClick={() => setMapSize(z)} className={`btn capitalize ${mapSize === z && mode !== 'campaign' ? 'btn-gold' : ''}`}>
                            {z}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 min-h-[2.6em] text-[13px] leading-snug text-ink-500">
                        {mode === 'campaign' ? 'The hand-crafted map has a fixed size.' : SIZE_HINT[mode as 'survival' | 'alliance' | 'siege'][mapSize]}
                      </p>
                    </div>
                    <div>
                      <Label>Difficulty</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DIFFS.map((d) => (
                          <button key={d.key} onClick={() => setDifficulty(d.key)} title={d.text} className={`btn font-display ${difficulty === d.key ? 'btn-gold' : ''}`}>
                            {d.name}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 min-h-[2.6em] text-[13px] leading-snug text-ink-500">{DIFFS.find((d) => d.key === difficulty)!.text}</p>
                    </div>
                  </div>
                </div>

                <button className="btn btn-gold mt-4 w-full shrink-0 py-3.5 text-base" onClick={start} disabled={!!busy}>
                  {busy === 'new' ? <LoaderCircle size={18} className="animate-spin" /> : <Swords size={18} />}
                  {busy === 'new' ? 'Raising the banners…' : mode === 'siege' ? (siegeSide === 'defend' ? 'Defend the Town' : 'Join the Assault') : 'Begin the War'}
                </button>
                {err && <p className="well mt-3 rounded-sm p-2 text-[13px] text-ember-300">{err}</p>}
              </div>

              <div className="panel flex flex-col rounded-md p-4 sm:p-6 lg:h-[680px]">
                <h2 className="panel-title mb-3 truncate">{mode === 'campaign' ? 'The Ashen Marches' : mode === 'siege' && preview?.map ? preview.map.scenario.name : biome.name}</h2>
                <div className="relative mx-auto aspect-square w-full max-w-[380px]">
                  {preview?.key === previewKey ? (
                    <MapPreview world={preview.world} castles={def?.castles ?? []} factions={def?.factions} />
                  ) : (
                    <div className="well grid h-full place-items-center rounded-sm text-ink-400">
                      <LoaderCircle size={20} className="animate-spin" />
                    </div>
                  )}
                </div>
                {mode !== 'campaign' && (
                  <button className="btn mx-auto mt-3" onClick={() => setSeed(Math.floor(Math.random() * 99999))}>
                    <Dices size={15} /> A different map
                  </button>
                )}
                <p className="mt-3 text-[14px] leading-snug text-ink-300">{mode === 'campaign' ? scenario.description : mode === 'siege' && preview?.map ? preview.map.scenario.description : biome.description}</p>
                {def && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <MiniStat label="Castles" value={def.castles.length} />
                    <MiniStat label="Realms" value={(def.factions ?? []).filter((f) => f.team !== 'N').length || 2} />
                    {mode === 'siege' ? <MiniStat label="Gates" value={def.castles.filter((c) => c.gate).length} /> : <MiniStat label="Bridges" value={def.bridges.length} />}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-400">
                  <span>
                    <i className="mr-1 inline-block size-2.5 bg-[#5f93ec] align-middle" />
                    You
                  </span>
                  <span>
                    <i className="mr-1 inline-block size-2.5 bg-[#4fd1c5] align-middle" />
                    Allies
                  </span>
                  <span>
                    <i className="mr-1 inline-block size-2.5 bg-[#de5f45] align-middle" />
                    Enemies
                  </span>
                  <span>
                    <i className="mr-1 inline-block size-2.5 bg-[#d1a73f] align-middle" />
                    Free towns
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="well rounded-sm py-1.5">
      <div className="text-[11px] tracking-wider text-ink-400 uppercase">{label}</div>
      <div className="font-display text-lg font-bold text-gold-200">{value}</div>
    </div>
  )
}

/** Top-down render of a map: terrain colours, rivers, castles by allegiance. */
function MapPreview({ world, castles, factions }: { world: World; castles: CastleDef[]; factions?: FactionDef[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
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
          c[0] = ((w >> 16) & 255) / 255
          c[1] = ((w >> 8) & 255) / 255
          c[2] = (w & 255) / 255
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
    const team = (fid: string) => factions?.find((f) => f.id === fid)?.team ?? (fid === 'player' ? 'A' : fid === 'neutral' ? 'N' : 'B')
    for (const k of castles) {
      const x = ((k.x + world.half) / world.size) * S
      const y = ((k.z + world.half) / world.size) * S
      const t = team(k.faction)
      ctx.fillStyle = k.faction === 'player' ? '#5f93ec' : t === 'A' ? '#4fd1c5' : t === 'B' ? '#de5f45' : '#d1a73f'
      const r = k.capital ? 4 : 2.6
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
      ctx.strokeStyle = k.faction === 'player' ? '#f2d27a' : '#0e0b08'
      ctx.lineWidth = k.faction === 'player' ? 1.5 : 1
      ctx.strokeRect(x - r, y - r, r * 2, r * 2)
    }
  }, [world, castles, factions])
  return <canvas ref={ref} className="well h-full w-full rounded-sm [image-rendering:auto]" />
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
