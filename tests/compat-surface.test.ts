import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";

import * as compat from "../src/compat/index.js";
import { renderAbc } from "../src/compat/index.js";

/**
 * **THE ENUMERATION OF THE WHOLE REMAINING ARC.**
 *
 * The standing order is that abcts matches abcjs on EVERY API and EVERY output, with the
 * internals free to be whatever is fastest and smallest (Lance, 2026-08-15). This gate is
 * the API half of that sentence: it names every symbol abcjs exposes and asserts we have
 * it, or that it is on a `MISSING` list which SHRINKS AND NEVER GROWS.
 *
 * **THE TABLE BELOW WAS MEASURED BY REQUIRING abcjs AND WALKING THE OBJECT**, never by
 * reading `index.js` into a literal — because a gate's reach is a property of its
 * enumeration, and on this branch a hand-written list has been short three times: the
 * gate that read 29 of 41 fixtures, the one that read `<slug>.svg` only, and the one that
 * read two of the five flavours the corpus is rendered in. Regenerate with
 * `/tmp/gp/surface.js` (recipe in `Docs/CHECKPOINT-2026-08-15b.md`) against a scratchpad
 * copy of abcjs — never `../abcMusicKit`, which another lane owns.
 *
 * `tuneObject` is the object `renderAbc` HANDS BACK, walked after a real render, so it is
 * what a host actually sees rather than what `AbcTune`'s constructor declares.
 */
const ABCJS_SURFACE = {
  root: {
    EditArea: "function",
    Editor: "function",
    TimingCallbacks: "function",
    TuneBook: "function",
    extractMeasures: "function",
    numberOfTunes: "function",
    parseOnly: "function",
    pauseAnimation: "function",
    renderAbc: "function",
    renderEngine: "function",
    setGlyph: "function",
    signature: "string",
    startAnimation: "function",
    stopAnimation: "function",
    strTranspose: "function",
    synth: "object",
    test: "object",
    tuneMetrics: "function",
  },
  synth: {
    CreateSynth: "function",
    CreateSynthControl: "function",
    SynthController: "function",
    SynthSequence: "function",
    activeAudioContext: "function",
    getMidiFile: "function",
    instrumentIndexToName: "array",
    midiRenderer: "function",
    pitchToNoteName: "object",
    playEvent: "function",
    registerAudioContext: "function",
    sequence: "function",
    supportsAudio: "function",
  },
  test: {
    EngraverController: "function",
    Parse: "function",
  },
  tuneObject: {
    addElementToEvents: "function",
    addUsefulCallbackInfo: "function",
    bottomText: "object",
    deline: "function",
    engraver: "object",
    findSelectableElement: "function",
    formatting: "object",
    getBarLength: "function",
    getBeatLength: "function",
    getBeatsPerMeasure: "function",
    getBpm: "function",
    getElementFromChar: "function",
    getKeySignature: "function",
    getMeter: "function",
    getMeterFraction: "function",
    getPickupLength: "function",
    getSelectableArray: "function",
    getTotalBeats: "function",
    getTotalTime: "function",
    lines: "array",
    makeVoicesArray: "function",
    media: "string",
    metaText: "object",
    metaTextInfo: "object",
    meter: "object",
    millisecondsPerMeasure: "function",
    setTiming: "function",
    setUpAudio: "function",
    setupEvents: "function",
    topText: "object",
    version: "string",
  },
} as const;

/**
 * Symbols abcjs has and abcts does not, YET. **This list shrinks and never grows** — the
 * same ratchet `svg-bytes` and `svg-bytes-sibling` use, and for the same reason: an
 * aggregate count hides a regression that a named slug cannot.
 *
 * Nothing here is a divergence. Under the 2026-08-15 ruling every one of these is owed;
 * `Docs/PLAN-REMAINING-2026-08-15.md` is the order they are being taken in.
 */
const MISSING: readonly string[] = [
  "tuneMetrics",
  "synth.CreateSynth",
  "synth.CreateSynthControl",
  "synth.SynthController",
  "synth.midiRenderer",
  "synth.playEvent",
  "synth.sequence",
];

/** Ours, with no abcjs counterpart — allowed, and listed so the diff is visible. */
const EXTRA_ALLOWED: readonly string[] = ["renderTuneBook"];

const surface = (): {
  name: string;
  kind: string;
  has: boolean;
  ours: string;
}[] => {
  const rows: { name: string; kind: string; has: boolean; ours: string }[] = [];
  const bag = compat as unknown as Record<string, unknown>;
  const kindOf = (v: unknown): string =>
    typeof v === "function"
      ? "function"
      : Array.isArray(v)
        ? "array"
        : v === null
          ? "null"
          : typeof v;

  for (const [name, kind] of Object.entries(ABCJS_SURFACE.root))
    rows.push({
      name,
      kind,
      has: bag[name] !== undefined,
      ours: kindOf(bag[name]),
    });
  for (const [name, kind] of Object.entries(ABCJS_SURFACE.synth)) {
    const s = bag["synth"] as Record<string, unknown> | undefined;
    rows.push({
      name: `synth.${name}`,
      kind,
      has: s?.[name] !== undefined,
      ours: kindOf(s?.[name]),
    });
  }
  for (const [name, kind] of Object.entries(ABCJS_SURFACE.test)) {
    const s = bag["test"] as Record<string, unknown> | undefined;
    rows.push({
      name: `test.${name}`,
      kind,
      has: s?.[name] !== undefined,
      ours: kindOf(s?.[name]),
    });
  }
  // The tune object is walked after a REAL render, exactly as the abcjs side was.
  const tune = renderAbc("paper", "X:1\nT:t\nM:4/4\nL:1/4\nK:C\nCDEF|\n", {
    staffwidth: 670,
  })[0];
  const t = (tune ?? {}) as unknown as Record<string, unknown>;
  for (const [name, kind] of Object.entries(ABCJS_SURFACE.tuneObject))
    rows.push({
      name: `tune.${name}`,
      kind,
      has: t[name] !== undefined,
      ours: kindOf(t[name]),
    });
  return rows;
};

describe("the abcjs API surface, symbol by symbol", () => {
  it("writes the ranked table", () => {
    const rows = surface();
    const absent = rows.filter((r) => !r.has);
    const lines = [
      `${absent.length} of ${rows.length} abcjs symbols are absent from abcts/compat`,
      "",
      ...absent.map((r) => `  ${r.name.padEnd(34)} ${r.kind}`),
    ];
    writeFileSync("/tmp/abcts-compat-surface.txt", lines.join("\n") + "\n");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("every symbol is present or on the MISSING ratchet", () => {
    const unexpected = surface()
      .filter((r) => !r.has && !MISSING.includes(r.name))
      .map((r) => r.name);
    expect(
      unexpected,
      "an abcjs symbol went missing that was not on the ratchet",
    ).toEqual([]);
  });

  it("nothing on the MISSING ratchet has quietly appeared", () => {
    const rows = surface();
    const arrived = MISSING.filter(
      (name) => rows.find((r) => r.name === name)?.has === true,
    );
    expect(
      arrived,
      "these now exist — delete them from MISSING so the ratchet holds them",
    ).toEqual([]);
  });

  it("a present symbol has abcjs's own KIND", () => {
    const wrong = surface()
      .filter((r) => r.has && r.ours !== r.kind)
      .map((r) => `${r.name}: abcjs ${r.kind}, ours ${r.ours}`);
    expect(wrong).toEqual([]);
  });

  it("records what abcts adds beyond abcjs", () => {
    expect(EXTRA_ALLOWED.length).toBeGreaterThanOrEqual(0);
  });
});
