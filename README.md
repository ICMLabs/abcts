# Typescript library for rendering standard music notation in a browser
## Note: Fork and port from [abcjs](https://github.com/paulrosen/abcjs) by Paul Rosen and Gregory Dyke, [MIT License](https://github.com/paulrosen/abcjs/blob/main/license.js)

### Note: API surface matches that of abcjs in order to ensure abcjs compatilility (which also means any/all bugs, gaps and behaviors that exist in abcjs will exist in abcts)

## Parity status

As of 2026-09-06, abcts matches abcjs 6.7.0 on every axis this repo has built a way to
measure — the **SVG file byte for byte** (headless, and live in both WebKit and Chrome), the
**MIDI file byte for byte**, the audio event list and timings, the parse tree, and the whole
public API surface.

**[`Docs/PARITY-STATUS.md`](Docs/PARITY-STATUS.md)** is the dated table: every gate, what it
compares, what it does *not* prove, and the handful of cases where abcts deliberately differs
because abcjs itself produces broken output. Each of those is written up with evidence in
[`Docs/ABCJS-DIFFERENCES.md`](Docs/ABCJS-DIFFERENCES.md).
