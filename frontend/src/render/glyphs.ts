/**
 * WARBOX's own glyphs: small engraved line drawings used everywhere a symbol
 * is needed (no emoji). Each is drawn on a 24 x 24 grid with round strokes in
 * the current colour; a few parts are filled for weight. Use `glyphSvg` in
 * HTML strings (map labels) and the <Glyph> component in React.
 */
export type GlyphName =
  | 'crown'
  | 'swords'
  | 'castle'
  | 'tower'
  | 'shield'
  | 'tree'
  | 'eye'
  | 'eyeHalf'
  | 'eyeClosed'
  | 'spyglass'
  | 'pick'
  | 'axe'
  | 'purse'
  | 'crate'
  | 'sprout'
  | 'sun'
  | 'leaf'
  | 'snowflake'
  | 'clear'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'horse'
  | 'fire'
  | 'chapel'
  | 'house'
  | 'caravan'
  | 'anvil'
  | 'warning'
  | 'dove'
  | 'envelope'
  | 'anchor'
  | 'check'
  | 'gear'
  | 'stakes'
  | 'slow'
  | 'boulder'
  | 'bow'
  | 'wheel'
  | 'heart'
  | 'tent'
  | 'flag'
  | 'palisade'
  | 'retreat'
  | 'menu'
  | 'muster'
  | 'handshake'
  | 'siege'
  | 'mask'
  | 'wagon'
  | 'dagger'

/** Stroked paths (s) and filled paths (f) for each glyph. */
const G: Record<GlyphName, { s?: string; f?: string }> = {
  crown: { s: 'M3 18 L4.5 7 L9 11.5 L12 5 L15 11.5 L19.5 7 L21 18 Z M3 20.5 H21', f: 'M4.5 6.6 a1.3 1.3 0 1 0 0.01 0 M12 4.4 a1.3 1.3 0 1 0 0.01 0 M19.5 6.6 a1.3 1.3 0 1 0 0.01 0' },
  swords: { s: 'M4 4 L14 14 M20 4 L10 14 M4 4 H7.5 M4 4 V7.5 M20 4 H16.5 M20 4 V7.5 M12.5 17.5 L17.5 12.5 M11.5 12.5 L6.5 17.5 M16 16 L20 20 M8 16 L4 20' },
  castle: { s: 'M3 21 V9 H6 V6 H8 V9 H10 V5 H14 V9 H16 V6 H18 V9 H21 V21 Z M10 21 V16 Q12 13.5 14 16 V21 M6 13 V14.5 M18 13 V14.5' },
  tower: { s: 'M7 21 V8 H6 V4 H8 V6 H10 V4 H14 V6 H16 V4 H18 V8 H17 V21 Z M10 21 V17 Q12 14.5 14 17 V21 M11.4 10 H12.6 V12.4 H11.4 Z' },
  shield: { s: 'M4 4.5 Q8 3 12 4 Q16 3 20 4.5 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 Z M12 7 V18 M7.5 11 H16.5' },
  tree: { s: 'M12 2.5 L6.5 10 H9.5 L5 16 H19 L14.5 10 H17.5 Z M12 16 V21.5' },
  eye: { s: 'M2 12 Q12 3 22 12 Q12 21 2 12 Z', f: 'M12 8.6 a3.4 3.4 0 1 0 0.01 0' },
  eyeHalf: { s: 'M2 12 Q12 3 22 12 Q12 21 2 12 Z M2.5 11 Q12 10 21.5 11', f: 'M8.8 12 a3.2 3.2 0 0 0 6.4 0 Z' },
  eyeClosed: { s: 'M2 11 Q12 19 22 11 M5 14 L3.5 16.5 M9 16.2 L8.2 19 M15 16.2 L15.8 19 M19 14 L20.5 16.5' },
  spyglass: { s: 'M3 15.5 L16 6.5 M5 18.5 L18 9.5 M3 15.5 L5 18.5 M16 6.5 L18 9.5 M18.5 4.5 L21 8.2 M9.5 13 L11 15.5 M12 21 L9.5 16.6 M12 21 L15 17' },
  pick: { s: 'M3 9 Q12 1.5 21 9 Q12 5.5 3 9 Z M12 5.5 L12 21.5' },
  axe: { s: 'M5 21.5 L15.5 6.5 M12.6 4.2 Q19.5 1.8 21.3 9.4 Q16.4 10.4 12.6 7.6 Z' },
  purse: { s: 'M8 6 Q12 9 16 6 L14.5 3.5 H9.5 Z M8.4 7.8 Q3.5 12 4 16.5 Q5 21.5 12 21.5 Q19 21.5 20 16.5 Q20.5 12 15.6 7.8 M10 14.5 Q12 12.8 14 14.5 Q12 16.2 10 18' },
  crate: { s: 'M3.5 7 L12 3 L20.5 7 V17 L12 21 L3.5 17 Z M3.5 7 L12 11 L20.5 7 M12 11 V21 M7.6 5 L16.2 9' },
  sprout: { s: 'M12 21.5 V11 M12 13 Q5 13.5 4 6.5 Q11 6 12 13 M12 11 Q13 4.5 20 4 Q19.5 10.5 12 11 M8 21.5 H16' },
  sun: { s: 'M12 7.5 a4.5 4.5 0 1 0 0.01 0 M12 1.8 V4.2 M12 19.8 V22.2 M1.8 12 H4.2 M19.8 12 H22.2 M4.8 4.8 L6.5 6.5 M17.5 17.5 L19.2 19.2 M4.8 19.2 L6.5 17.5 M17.5 6.5 L19.2 4.8' },
  leaf: { s: 'M4 20 Q3 6 19.5 4 Q21 19 6 19.5 Z M4 20 L14 10 M9 15 H12.5 M11.5 12.5 V9' },
  snowflake: { s: 'M12 2 V22 M3.3 7 L20.7 17 M3.3 17 L20.7 7 M9.5 3.5 L12 6 L14.5 3.5 M9.5 20.5 L12 18 L14.5 20.5 M3.3 10.3 L6.6 9.2 L5.5 5.8 M20.7 13.7 L17.4 14.8 L18.5 18.2 M5.5 18.2 L6.6 14.8 L3.3 13.7 M18.5 5.8 L17.4 9.2 L20.7 10.3' },
  clear: { s: 'M9 6 a3.6 3.6 0 1 0 0.01 0 M9 1.8 V3.4 M3.8 3.8 L5 5 M2.2 9.6 H3.8 M14 3.8 L12.8 5 M7.5 20 H18 Q21.5 20 21.5 16.6 Q21.5 13.3 18 13.4 Q17 10 13 10.6 Q10 11.6 10.4 14 Q7 14 7 17 Q7.2 20 7.5 20' },
  rain: { s: 'M6 14 H17.5 Q21 14 21 10.6 Q21 7.3 17.5 7.4 Q16.5 4 12.5 4.6 Q9.5 5.6 9.9 8 Q6.5 8 6.5 11 Q6.6 14 6 14 M8 17 L7 20 M12 17 L11 20 M16 17 L15 20' },
  storm: { s: 'M6 13 H17.5 Q21 13 21 9.6 Q21 6.3 17.5 6.4 Q16.5 3 12.5 3.6 Q9.5 4.6 9.9 7 Q6.5 7 6.5 10 Q6.6 13 6 13', f: 'M13.5 13.5 L9.5 18.5 H12.5 L10.5 22.5 L16 16.5 H13 L15 13.5 Z' },
  snow: { s: 'M6 13 H17.5 Q21 13 21 9.6 Q21 6.3 17.5 6.4 Q16.5 3 12.5 3.6 Q9.5 4.6 9.9 7 Q6.5 7 6.5 10 Q6.6 13 6 13 M8 16.5 V20 M6.5 17.4 L9.5 19.1 M9.5 17.4 L6.5 19.1 M15 16.5 V20 M13.5 17.4 L16.5 19.1 M16.5 17.4 L13.5 19.1' },
  horse: { s: 'M5 21 L7 14 Q5 10.5 8 7 L10 3.5 L11 6 Q15 5.5 17.5 8.5 L20.5 11 L19.5 13 L16.5 12 Q15 14 15.5 17 L14 21 M9 9 a0.5 0.5 0 1 0 0.01 0' },
  fire: { s: 'M12 21.5 Q5 20.5 5.5 14 Q6 9.5 9.5 6.5 Q9.5 10 11.5 11 Q11 5.5 15 2.5 Q14.5 7 17.5 10.5 Q20 14 18.5 17.5 Q16.5 21.5 12 21.5 Z M12 21.5 Q9 20 9.6 16.5 Q10.5 14.5 12 13.5 Q12.5 16 14 17 Q15 19.5 12 21.5' },
  chapel: { s: 'M12 1.8 V6 M10.4 3.6 H13.6 M8 10 L12 6 L16 10 V21 H8 Z M3.5 21 V14 L8 11.5 M20.5 21 V14 L16 11.5 M3 21 H21 M10.6 21 V17.5 Q12 15.6 13.4 17.5 V21' },
  house: { s: 'M3 11.5 L12 4 L21 11.5 M5.5 9.5 V20.5 H18.5 V9.5 M10 20.5 V15 H14 V20.5 M15.5 7 V3.5 H17.5 V8.6' },
  caravan: { s: 'M3 21 V11 Q3 4.5 12 4.5 Q21 4.5 21 11 V21 M8 21 V13.5 Q8 9.5 12 9.5 Q16 9.5 16 13.5 V21 M2 21 H22 M12 2.2 V4.5' },
  anvil: { s: 'M3 7 H18 Q21 7 21.5 9.5 H16.5 Q15 12.5 11 13 V15.5 H14.5 L16 19 H6.5 L8 15.5 H10 V13 Q6 12.5 4.5 10 Q3 9.5 3 7 Z M6 21.5 H17' },
  warning: { s: 'M12 3 L22 20.5 H2 Z M12 9 V14.5', f: 'M12 16.4 a1.2 1.2 0 1 0 0.01 0' },
  dove: { s: 'M3 14 Q7 9 12 10.5 Q14 5 20.5 4 Q18 8 17.5 10.5 Q21 12 21 14 Q16 18.5 9.5 17 L6 20 L6.5 16 Q4 15.5 3 14 Z M8 13 Q11 14 13.5 12' },
  envelope: { s: 'M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6', f: 'M12 13.8 a1.8 1.8 0 1 0 0.01 0' },
  anchor: { s: 'M12 7.5 V21 M12 3.5 a2 2 0 1 0 0.01 0 M8 10 H16 M4 13.5 Q4.5 20.5 12 21 Q19.5 20.5 20 13.5 M2.5 15 L4 13.2 L5.6 15 M18.4 15 L20 13.2 L21.5 15' },
  check: { s: 'M4 12.5 L9.5 18 L20 6' },
  gear: { s: 'M12 8.5 a3.5 3.5 0 1 0 0.01 0 M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3 M12 5 a7 7 0 1 0 0.01 0' },
  stakes: { s: 'M3 20 L7.5 6 M9 20 L13 5 M15 20 L18.5 6.5 M3 15 H20 M2 20 H22' },
  slow: { s: 'M3 12 Q3 6 9 6 Q15 6 15 12 Q15 15.5 11.5 15.5 Q8.5 15.5 8.5 12.5 Q8.5 10 11 10 M3 18 H19 Q21.5 18 21 15 L19 12 M15 12 H19' },
  boulder: { s: 'M3 18 L5 10 L10 5.5 L16.5 6.5 L21 12 L19.5 18.5 Z M3 18 H21 M10 5.5 L12 11 L16.5 6.5 M12 11 L19.5 18.5 M12 11 L7 18.5' },
  bow: { s: 'M6 3 Q20 12 6 21 M6 3 V21 M3 12 H21 M18 9.5 L21 12 L18 14.5 M4.5 10.5 L3 12 L4.5 13.5' },
  wheel: { s: 'M12 3 a9 9 0 1 0 0.01 0 M12 9.6 a2.4 2.4 0 1 0 0.01 0 M12 3 V9.6 M12 14.4 V21 M3 12 H9.6 M14.4 12 H21 M5.6 5.6 L10.3 10.3 M13.7 13.7 L18.4 18.4 M5.6 18.4 L10.3 13.7 M13.7 10.3 L18.4 5.6' },
  heart: { s: 'M12 20.5 Q3 14.5 3 8.5 Q3 4 7.5 4 Q10.5 4 12 7 Q13.5 4 16.5 4 Q21 4 21 8.5 Q21 14.5 12 20.5 Z' },
  tent: { s: 'M2 20.5 L12 4 L22 20.5 Z M12 4 L12 2 M12 9 L8.5 20.5 M12 9 L15.5 20.5 M12 2 L16 3.3 L12 4.5' },
  flag: { s: 'M5 21.5 V3 M5 4 Q9 2 12 4 Q15 6 19 4 V13 Q15 15 12 13 Q9 11 5 13' },
  palisade: { s: 'M3 21 V8 L4.5 5.5 L6 8 V21 M9 21 V7 L10.5 4.5 L12 7 V21 M15 21 V8 L16.5 5.5 L18 8 V21 M2 12 H19 M2 17 H19 M20 21 V9 L21.5 6.5' },
  retreat: { s: 'M9 6 L4 11 L9 16 M4 11 H14 Q20 11 20 16.5 Q20 20 16 20.5' },
  menu: { s: 'M4 6.5 H20 M4 12 H20 M4 17.5 H20' },
  muster: { s: 'M12 6 a7 7 0 1 0 0.01 0 M12 2.5 a10.5 10.5 0 1 0 0.01 0', f: 'M12 9.6 a2.4 2.4 0 1 0 0.01 0' },
  handshake: { s: 'M2 9.5 L6 7 L10 9 L13.5 6.5 Q15.5 5.5 17.5 7 L22 9.5 M2 9.5 V15 L5.5 17 M22 9.5 V15 L18 17.5 L13 20.5 Q11.5 21.2 10.5 20 L6 16.5 M10 9 L8 12 Q9.5 13.5 11.5 12 L13.5 10.2 L18 14.5 M11 15 L13.5 17.5 M8.8 16.8 L11 19' },
  siege: { s: 'M3 17.5 V12 L10.5 6 L18 12 V17.5 Z M1.5 14 H22.5 M20 12.2 L22.5 14 L20 15.8', f: 'M6 19.5 a2 2 0 1 0 0.01 0 M15 19.5 a2 2 0 1 0 0.01 0' },
  wagon: { s: 'M2.5 14 H16 V8 Q16 4.5 9.25 4.5 Q2.5 4.5 2.5 8 Z M16 11 H19 L21.5 14 M5.5 4.8 V14 M9.25 4.5 V14 M13 4.8 V14', f: 'M6.5 17.5 a2.5 2.5 0 1 0 0.01 0 M14 17.5 a2.5 2.5 0 1 0 0.01 0' },
  dagger: { s: 'M18.5 3.5 L19.8 4.8 L10.5 14.5 L9.5 13.5 Z M7 12 L12 17 M8 14 L4.5 17.5 L6.5 19.5 L10 16' },
  mask: { s: 'M3 9 Q12 4 21 9 Q21 16 16 17.5 Q13.5 18.3 12 15.5 Q10.5 18.3 8 17.5 Q3 16 3 9 Z M6.5 10.5 Q8.2 9.4 10 10.5 M14 10.5 Q15.8 9.4 17.5 10.5' },
}

/** An inline SVG string for HTML labels. */
export function glyphSvg(name: GlyphName, size = 14, cls = 'glyph'): string {
  const g = G[name]
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${g.s ? `<path d="${g.s}"/>` : ''}${g.f ? `<path d="${g.f}" fill="currentColor" stroke="none"/>` : ''}</svg>`
}
export function glyphPaths(name: GlyphName): { s?: string; f?: string } {
  return G[name]
}
