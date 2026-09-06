/**
 * **`synth.notesAvailable` — WHICH SOUNDS THE USER ALREADY HAS.**
 *
 * abcts's own, not one of abcjs's symbols, so there is no oracle to harvest: these are
 * CONTROLS. Each rung fixes one variable — where the sound is, whether a `caches` store
 * exists at all, whether the note has a name — and the assertion is on the partition, which
 * is the whole of what a host reads.
 *
 * ⚠️ **THE PARTITION MUST BE TOTAL AND DISJOINT.** A note appearing in two buckets, or in
 * none, would read to a caller as a wrong count rather than as a bug — a progress bar that
 * never reaches its end looks like a slow network. The first test asserts that directly
 * rather than trusting the three lists to add up by construction.
 */
import { afterEach, describe, expect, it } from "vitest";
import { notesAvailable, parseOnly, soundsCache } from "../src/compat/index.js";

const TUNE = "X:1\nL:1/4\nK:C\nCDEF|\n";
/** `C4 D4 E4 F4` under the default piano — the four this fixture needs. */
const FOUR = [
  "acoustic_grand_piano:C4",
  "acoustic_grand_piano:D4",
  "acoustic_grand_piano:E4",
  "acoustic_grand_piano:F4",
];

const tuneOf = (abc = TUNE) => parseOnly(abc)[0] as unknown as Parameters<typeof notesAvailable>[0];

/** A `caches` stand-in holding exactly the urls given, matching the global's `match`. */
const installCaches = (urls: string[]): void => {
  (globalThis as Record<string, unknown>)["caches"] = {
    match: (url: string) => Promise.resolve(urls.includes(url) ? {} : undefined),
  };
};

afterEach(() => {
  for (const k of Object.keys(soundsCache)) delete soundsCache[k];
  delete (globalThis as Record<string, unknown>)["caches"];
});

describe("synth.notesAvailable", () => {
  it("partitions every needed sound into exactly one bucket", async () => {
    const r = await notesAvailable(tuneOf());
    const all = [...r.inMemory, ...r.inCache, ...r.missing];
    expect(all.slice().sort()).toEqual(FOUR);
    expect(new Set(all).size, "a sound must not appear twice").toBe(all.length);
  });

  it("reports nothing cached, and no store, as missing", async () => {
    const r = await notesAvailable(tuneOf());
    expect(r.missing.slice().sort()).toEqual(FOUR);
    expect(r.inMemory).toEqual([]);
    expect(r.inCache).toEqual([]);
    expect(r.error).toEqual([]);
  });

  it("reports what is already decoded on this page as inMemory", async () => {
    soundsCache["acoustic_grand_piano"] = { C4: Promise.resolve({}) as never };
    const r = await notesAvailable(tuneOf());
    expect(r.inMemory).toEqual(["acoustic_grand_piano:C4"]);
    expect(r.missing.slice().sort()).toEqual(FOUR.filter((n) => !n.endsWith("C4")));
  });

  it("reports what the Cache API holds as inCache, at the url loadNote fetches", async () => {
    installCaches([
      "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/D4.mp3",
    ]);
    const r = await notesAvailable(tuneOf());
    expect(r.inCache).toEqual(["acoustic_grand_piano:D4"]);
    expect(r.missing.slice().sort()).toEqual(FOUR.filter((n) => !n.endsWith("D4")));
  });

  /** MEMORY BEATS THE STORE, because a decoded buffer costs nothing and a cached one does. */
  it("prefers inMemory over inCache for the same sound", async () => {
    soundsCache["acoustic_grand_piano"] = { C4: Promise.resolve({}) as never };
    installCaches([
      "https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/C4.mp3",
    ]);
    const r = await notesAvailable(tuneOf());
    expect(r.inMemory).toEqual(["acoustic_grand_piano:C4"]);
    expect(r.inCache).toEqual([]);
  });

  /** A HOST'S OWN SOUNDFONT IS THE ONE LOOKED UP, and the trailing slash is abcjs's rule. */
  it("honours soundFontUrl and adds the missing trailing slash", async () => {
    installCaches(["https://example.test/sf/acoustic_grand_piano-mp3/E4.mp3"]);
    const r = await notesAvailable(tuneOf(), { soundFontUrl: "https://example.test/sf" });
    expect(r.soundFontUrl).toBe("https://example.test/sf/");
    expect(r.inCache).toEqual(["acoustic_grand_piano:E4"]);
  });

  /** A STORE THAT THROWS IS "NO", not a failed question — a blocked or absent one is common. */
  it("survives a caches store that throws", async () => {
    (globalThis as Record<string, unknown>)["caches"] = {
      match: () => Promise.reject(new Error("blocked")),
    };
    const r = await notesAvailable(tuneOf());
    expect(r.missing.slice().sort()).toEqual(FOUR);
  });

  /**
   * ⚠️ **AND IT MUST AGREE WITH WHAT `init` WOULD LOAD**, which is why the walk was lifted
   * out of `CreateSynth.init` rather than written twice. `%%MIDI program 40` is a violin, so
   * a fixture that changes instrument proves the running-instrument rule travels with it.
   */
  it("follows the program change, as init's own walk does", async () => {
    const r = await notesAvailable(tuneOf("X:1\nL:1/4\nK:C\n%%MIDI program 40\nCD|\n"));
    expect(r.missing.slice().sort()).toEqual(["violin:C4", "violin:D4"]);
  });
});
