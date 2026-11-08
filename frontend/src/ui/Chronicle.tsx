import { CircleAlert, Flag, Handshake, Info, ScrollText, Skull, Swords, Trophy, Undo2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameEngine } from '../game/engine'
import { calendar } from '../game/troops'
import type { ChronicleEntry, ChronicleKind } from '../game/types'
import { useEngine } from './common'

const STYLE: Record<ChronicleKind, { icon: typeof Info; cls: string }> = {
  deploy: { icon: Flag, cls: 'text-royal-300 border-royal-400/40' },
  battle: { icon: Swords, cls: 'text-gold-300 border-gold-400/40' },
  victory: { icon: Trophy, cls: 'text-emerald-300 border-emerald-400/40' },
  capture: { icon: Trophy, cls: 'text-emerald-300 border-emerald-400/50' },
  defeat: { icon: Skull, cls: 'text-ember-300 border-ember-400/50' },
  lost: { icon: Skull, cls: 'text-ember-300 border-ember-400/60' },
  retreat: { icon: Undo2, cls: 'text-ink-300 border-white/15' },
  warning: { icon: CircleAlert, cls: 'text-ember-300 border-ember-400/60' },
  info: { icon: Info, cls: 'text-ink-200 border-white/15' },
  ally: { icon: Handshake, cls: 'text-teal-300 border-teal-400/40' },
}

/** Ink colours that read on parchment. */
const PAPER_TONE: Record<ChronicleKind, string> = {
  deploy: 'text-[#24467e]',
  battle: 'text-[#7a5410]',
  victory: 'text-[#2f6a2a]',
  capture: 'text-[#2f6a2a]',
  defeat: 'text-[#8a1f12]',
  lost: 'text-[#8a1f12]',
  retreat: 'text-[#5a4a35]',
  warning: 'text-[#8a1f12]',
  info: 'text-[#5a4a35]',
  ally: 'text-[#1f5e5a]',
}

interface Toast {
  entry: ChronicleEntry
  born: number
}

export function Toasts({ entries, onFocus }: { entries: ChronicleEntry[]; onFocus: (e: ChronicleEntry) => void }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    // Allied news goes to the chronicle only; toasts are for things that need your attention.
    const important = entries.filter((e) => e.kind !== 'ally' && e.kind !== 'info')
    if (important.length === 0) return
    setToasts((t) => [...important.map((entry) => ({ entry, born: Date.now() })), ...t].slice(0, window.innerWidth < 560 ? 2 : 4))
  }, [entries])
  useEffect(() => {
    const id = setInterval(() => setToasts((t) => t.filter((x) => Date.now() - x.born < (x.entry.kind === 'warning' ? 9000 : 6000))), 500)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="pointer-events-none absolute top-[64px] right-2 left-2 z-30 mx-auto flex max-w-[440px] flex-col items-center gap-1.5 sm:top-[72px]">
      {toasts.map(({ entry }) => {
        const Icon = STYLE[entry.kind].icon
        return (
          <button
            key={entry.id}
            onClick={() => onFocus(entry)}
            className="parchment animate-fade-up pointer-events-auto flex w-full items-start gap-2.5 rounded-sm px-3.5 py-2 text-left"
          >
            <Icon size={17} className={`mt-0.5 shrink-0 ${PAPER_TONE[entry.kind]}`} />
            <div className="min-w-0">
              <div className="font-display text-[13px] font-bold">{entry.title}</div>
              <div className="text-[13px] leading-snug italic opacity-85">{entry.detail}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function ChronicleLog({ engine, onClose, onFocus }: { engine: GameEngine; onClose: () => void; onFocus: (e: ChronicleEntry) => void }) {
  useEngine(engine)
  const [filter, setFilter] = useState<'all' | 'mine' | 'ally'>('all')
  const entries = engine.state.chronicle.filter((e) => filter === 'all' || (filter === 'ally' ? e.kind === 'ally' : e.kind !== 'ally'))
  return (
    <div className="parchment animate-slide-in pointer-events-auto absolute top-[64px] right-2 bottom-2 left-2 z-40 flex flex-col rounded-sm sm:top-[68px] sm:right-3 sm:bottom-auto sm:left-auto sm:max-h-[calc(100%-300px)] sm:w-[380px]">
      <div className="flex items-center justify-between border-b border-[#6d5430]/40 px-4 py-3">
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <ScrollText size={16} /> War Chronicle
        </h3>
        <button className="opacity-60 hover:opacity-100" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-1 border-b border-[#6d5430]/40 px-3 py-1.5">
        {(['all', 'mine', 'ally'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1 font-display text-[13px] font-bold ${filter === f ? 'border-b-2 border-[#7a5410] text-[#2e2316]' : 'opacity-55 hover:opacity-90'}`}>
            {f === 'all' ? 'All' : f === 'mine' ? 'Our realm' : 'Alliance'}
          </button>
        ))}
      </div>
      <div className="scroll-thin flex-1 space-y-1 overflow-y-auto p-2">
        {entries.map((e) => {
          const Icon = STYLE[e.kind].icon
          return (
            <button key={e.id} onClick={() => onFocus(e)} className="flex w-full gap-2 border-b border-[#6d5430]/15 px-2 py-1.5 text-left hover:bg-[#6d5430]/10">
              <Icon size={14} className={`mt-1 shrink-0 ${PAPER_TONE[e.kind]}`} />
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{e.title}</span>
                  <span className="shrink-0 text-[13px] italic opacity-60">{calendar(e.t).split(' · ')[0]}</span>
                </div>
                <div className="text-[13.5px] leading-snug italic opacity-80">{e.detail}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
