/**
 * Advance widths for voice-name labels — `V:… name=` / `subname=`.
 *
 * WHY A SEPARATE TABLE. Voice names are set in `voicefont`, which abcjs defaults to Times
 * New Roman BOLD at 17px — a different face and weight from the `serif` prose the rest of
 * the renderer measures with `text-metrics.ts`. abcjs reserves horizontal space for the
 * label at the left of every system (`getLeftEdgeOfStaff`), and that reservation shifts
 * the whole staff — and every notehead on it — to the right. Measuring it with the wrong
 * font put `score-reorder`'s notes ~100px left of abcjs's.
 *
 * THESE ARE abcjs's OWN NUMBERS. The values are the WebKit-calibrated getBBox widths the
 * abcjs golden generator uses for its `vocalfont` table
 * (`abcMusicKit/Tools/abcjs-debug/dump-elements-char-widths.js`), in PIXELS at 17px. So
 * the reservation computed here equals the one baked into the goldens, which is the whole
 * point in strict mode. They are measurements — a table of numbers, not font outlines —
 * so, like `text-metrics.ts`, this file reproduces no part of a typeface and carries no
 * font licence.
 */

/** Per-character advance in PIXELS for Times New Roman Bold 17px (abcjs `vocalfont`). */
const VOCALFONT: Readonly<Record<string, number>> = {
  '!': 5.6719,
  '"': 9.4531,
  '#': 8.5,
  $: 8.5,
  '%': 17,
  '&': 14.1719,
  "'": 4.7344,
  '(': 5.6719,
  ')': 5.6719,
  '*': 8.5,
  '+': 9.6875,
  ',': 4.25,
  '-': 5.6719,
  '.': 4.25,
  '/': 4.7344,
  '0': 8.5,
  '1': 8.5,
  '2': 8.5,
  '3': 8.5,
  '4': 8.5,
  '5': 8.5,
  '6': 8.5,
  '7': 8.5,
  '8': 8.5,
  '9': 8.5,
  ':': 5.6719,
  ';': 5.6719,
  '<': 9.6875,
  '=': 9.6875,
  '>': 9.6875,
  '?': 8.5,
  '@': 15.8281,
  A: 12.2813,
  B: 11.3438,
  C: 12.2813,
  D: 12.2813,
  E: 11.3438,
  F: 10.3906,
  G: 13.2344,
  H: 13.2344,
  I: 6.625,
  J: 8.5,
  K: 13.2344,
  L: 11.3438,
  M: 16.0469,
  N: 12.2813,
  O: 13.2344,
  P: 10.3906,
  Q: 13.2344,
  R: 12.2813,
  S: 9.4688,
  T: 11.3438,
  U: 12.2813,
  V: 12.2813,
  W: 17,
  X: 12.2813,
  Y: 12.2813,
  Z: 11.3438,
  '[': 5.6719,
  '\\': 4.7344,
  ']': 5.6719,
  '^': 9.8906,
  _: 8.5,
  '`': 5.6719,
  a: 8.5,
  b: 9.4688,
  c: 7.5469,
  d: 9.4688,
  e: 7.5469,
  f: 5.6719,
  g: 8.5,
  h: 9.4688,
  i: 4.7344,
  j: 5.6719,
  k: 9.4688,
  l: 4.7344,
  m: 14.1719,
  n: 9.4688,
  o: 8.5,
  p: 9.4688,
  q: 9.4688,
  r: 7.5469,
  s: 6.625,
  t: 5.6719,
  u: 9.4688,
  v: 8.5,
  w: 12.2813,
  x: 8.5,
  y: 8.5,
  z: 7.5469,
  '{': 6.7031,
  '|': 3.75,
  '}': 6.7031,
  '~': 8.8438,
  ' ': 4.25,
}

/** Advance for a character the table does not carry — a capital's width, a safe over-estimate. */
const FALLBACK = 12.2813

/** Width of a voice-name string in PIXELS, in abcjs's default bold voicefont. */
export function voiceNameWidthPx(text: string): number {
  let w = 0
  for (const ch of text) w += VOCALFONT[ch] ?? FALLBACK
  return w
}

/**
 * Right-hand spacing abcjs adds after a voice header — "the width of an A"
 * (`getLeftEdgeOfStaff`). Only added when there is a header at all.
 */
export const VOICE_NAME_GAP_PX = VOCALFONT.A ?? FALLBACK
