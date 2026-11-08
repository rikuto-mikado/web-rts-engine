import { memo } from 'react'
import type { PortraitSpec } from '../game/types'

/**
 * Procedural 24×24 pixel-art bust, drawn from a small spec stored with each
 * commander in the database (skin, hair style, beard, headgear, colours...).
 */
const N = 24

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

function draw(p: PortraitSpec): (string | null)[][] {
  const px: (string | null)[][] = Array.from({ length: N }, () => Array(N).fill(null))
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < N && y < N) px[y][x] = c
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c)
  }
  const skin = p.skin ?? '#d6a07a'
  const skinD = shade(skin, -0.18)
  const hair = p.hair ?? '#3a2a1a'
  const hairD = shade(hair, -0.3)
  const armor = p.armor ?? '#6a6f78'
  const trim = p.trim ?? '#c9a227'
  const metal = '#9aa3ad'
  const metalD = '#6a727c'
  const bg = p.bg ?? '#222'

  // Background with a soft vignette.
  rect(0, 0, N - 1, N - 1, bg)
  for (let i = 0; i < N; i++) {
    set(i, 0, shade(bg, -0.35))
    set(i, N - 1, shade(bg, -0.35))
    set(0, i, shade(bg, -0.35))
    set(N - 1, i, shade(bg, -0.35))
  }
  rect(4, 2, 19, 6, shade(bg, 0.06))

  // Long hair falls behind the shoulders.
  if (p.hair_style === 'long' || p.hair_style === 'wild') {
    rect(5, 7, 6, 18, hairD)
    rect(17, 7, 18, 18, hairD)
  }

  // Shoulders and armour.
  rect(3, 19, 20, 23, armor)
  rect(4, 18, 19, 18, armor)
  rect(3, 19, 4, 23, shade(armor, -0.25))
  rect(19, 19, 20, 23, shade(armor, -0.25))
  rect(9, 18, 14, 18, trim)
  rect(11, 19, 12, 23, trim)
  set(6, 20, shade(armor, 0.25))
  set(17, 20, shade(armor, 0.25))

  // Neck and head.
  rect(10, 15, 13, 17, skinD)
  rect(8, 6, 15, 15, skin)
  rect(7, 7, 16, 14, skin)
  rect(15, 7, 16, 14, skinD)
  set(8, 15, bg)
  set(15, 15, bg)
  set(7, 10, skinD)
  set(16, 10, skinD)

  // Face.
  const eye = p.eyes ?? '#2a1a10'
  rect(9, 10, 10, 10, '#f4ead8')
  rect(13, 10, 14, 10, '#f4ead8')
  set(10, 10, eye)
  set(13, 10, eye)
  rect(9, 9, 10, 9, hairD)
  rect(13, 9, 14, 9, hairD)
  set(11, 11, skinD)
  set(12, 12, skinD)
  set(11, 12, skinD)
  rect(10, 13, 13, 13, p.female ? '#b8545a' : shade(skin, -0.32))
  if (p.female) {
    set(9, 9, '#1a1010')
    set(14, 9, '#1a1010')
  }
  if (p.scar) {
    set(14, 8, '#e08a7a')
    set(14, 9, '#e08a7a')
    set(15, 11, '#e08a7a')
    set(15, 12, '#c86a5a')
  }

  // Hair.
  switch (p.hair_style) {
    case 'bald':
      rect(7, 9, 7, 11, hair)
      rect(16, 9, 16, 11, hair)
      set(10, 6, shade(skin, 0.15))
      break
    case 'wild':
      rect(7, 4, 16, 7, hair)
      for (const x of [6, 8, 10, 12, 14, 16, 17]) set(x, 3 + (x % 3 === 0 ? 0 : 1), hair)
      rect(6, 7, 7, 11, hair)
      rect(16, 7, 17, 11, hair)
      break
    case 'topknot':
      rect(8, 5, 15, 6, hair)
      rect(7, 7, 7, 9, hair)
      rect(16, 7, 16, 9, hair)
      rect(11, 2, 12, 4, hair)
      set(10, 3, hairD)
      break
    case 'braid':
      rect(8, 4, 15, 6, hair)
      rect(7, 6, 7, 11, hair)
      rect(16, 6, 17, 11, hair)
      for (let y = 12; y <= 19; y++) set(17 + (y % 2), y, y % 2 ? hair : hairD)
      break
    case 'long':
      rect(8, 4, 15, 6, hair)
      rect(7, 5, 7, 14, hair)
      rect(16, 5, 16, 14, hair)
      rect(9, 7, 10, 7, hair)
      break
    default:
      rect(8, 4, 15, 6, hair)
      rect(7, 6, 7, 9, hair)
      rect(16, 6, 16, 9, hair)
      set(9, 7, hair)
  }

  // Facial hair.
  switch (p.beard) {
    case 'full':
      rect(7, 11, 7, 14, hair)
      rect(16, 11, 16, 14, hair)
      rect(8, 13, 15, 16, hair)
      rect(9, 17, 14, 17, hairD)
      rect(10, 13, 13, 13, shade(skin, -0.32))
      rect(9, 12, 14, 12, hair)
      break
    case 'goatee':
      rect(10, 12, 13, 12, hair)
      rect(10, 14, 13, 16, hair)
      break
    case 'mustache':
      rect(9, 12, 14, 12, hair)
      set(8, 13, hair)
      set(15, 13, hair)
      break
    case 'stubble':
      for (let y = 12; y <= 15; y++) for (let x = 8; x <= 15; x++) if ((x + y) % 2 === 0 && px[y][x] === skin) set(x, y, shade(skin, -0.12))
      break
  }

  // Headgear.
  switch (p.headgear) {
    case 'helm':
    case 'horned':
      rect(7, 3, 16, 7, metal)
      rect(6, 6, 7, 10, metal)
      rect(16, 6, 17, 10, metal)
      rect(7, 3, 16, 3, metalD)
      rect(11, 8, 12, 11, metalD)
      set(15, 4, '#d8dde3')
      if (p.headgear === 'horned') {
        rect(3, 2, 5, 3, '#e8dcc0')
        rect(4, 4, 6, 5, '#e8dcc0')
        rect(18, 2, 20, 3, '#e8dcc0')
        rect(17, 4, 19, 5, '#e8dcc0')
        set(2, 1, '#e8dcc0')
        set(21, 1, '#e8dcc0')
      }
      break
    case 'greathelm':
      rect(6, 3, 17, 16, metal)
      rect(6, 3, 17, 3, metalD)
      rect(15, 4, 17, 16, metalD)
      rect(8, 10, 15, 10, '#111')
      rect(11, 11, 12, 15, metalD)
      for (const [x, y] of [[9, 13], [14, 13], [9, 14], [14, 14]]) set(x, y, '#222')
      set(8, 5, '#d8dde3')
      break
    case 'crown':
      rect(7, 4, 16, 5, '#e8c55a')
      for (const x of [7, 10, 13, 16]) rect(x, 2, x, 3, '#e8c55a')
      set(11, 4, '#c0392b')
      set(14, 4, '#2e86de')
      rect(7, 5, 16, 5, '#b8932a')
      break
    case 'circlet':
      rect(7, 6, 16, 6, '#e8d27a')
      set(11, 6, '#3ad08a')
      set(12, 6, '#3ad08a')
      break
    case 'hood': {
      const h = shade(armor, 0.05)
      rect(6, 3, 17, 6, h)
      rect(5, 6, 7, 17, h)
      rect(16, 6, 18, 17, h)
      rect(7, 3, 16, 3, shade(armor, -0.25))
      rect(8, 7, 15, 7, shade(h, -0.25))
      break
    }
    case 'feather_cap':
      rect(7, 4, 16, 6, trim)
      rect(6, 6, 17, 6, shade(trim, -0.2))
      for (let i = 0; i < 6; i++) set(17 + Math.floor(i / 2), 4 - i, i % 2 ? '#f2f2f2' : '#d8d8d8')
      break
  }
  return px
}

export const PixelPortrait = memo(function PixelPortrait({ spec, size = 40, className = '' }: { spec: PortraitSpec | undefined; size?: number; className?: string }) {
  const px = draw(spec ?? {})
  const rects: { x: number; y: number; w: number; c: string }[] = []
  for (let y = 0; y < N; y++) {
    let x = 0
    while (x < N) {
      const c = px[y][x]
      let w = 1
      while (x + w < N && px[y][x + w] === c) w++
      if (c) rects.push({ x, y, w, c })
      x += w
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" className={`shrink-0 rounded-md ${className}`} aria-hidden>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  )
})
