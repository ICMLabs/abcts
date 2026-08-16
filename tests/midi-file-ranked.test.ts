/**
 * THE MIDI-FILE RANKED TABLE — the fourth of its kind, and the only one with no tolerance.
 *
 * The other three all declare what they ignore: `pixel-parity` excludes glyph outlines,
 * `corpus-abcjs-ranked` takes 0.05px, `tempo-parts` compares glyph KINDS. This one compares
 * a BYTE STRING against abcjs's own, so "differs" means differs and the first differing
 * byte names the field.
 *
 * It writes `/tmp/abcts-midi-ranked.txt` beside the other three, in the same shape: the
 * first divergence per case, both sides printed, sorted by how far in it is. `PASSING` is
 * the ratchet and it grows.
 *
 * ── WHY THE DIFF IS SHOWN IN BYTES AND NOT IN CHARACTERS ─────────────────────
 * The file is percent-encoded, three characters to a byte, so a character offset is not a
 * position anyone can act on. Reported as a byte index with the surrounding bytes on both
 * sides — which is what turns "the strings differ" into "the fourth byte of the second
 * track's delta time".
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { midiFile } from "../src/audio/midi-file.js";
import { parse } from "../src/parser/parser.js";

const dir = join(import.meta.dirname, "corpus-midi");

interface Case {
  readonly slug: string;
  readonly name: string;
  readonly abc: string;
  readonly options: Record<string, unknown> | null;
  readonly expected: string;
}

const CASES: Case[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    slug: f.replace(/\.json$/, ""),
    ...JSON.parse(readFileSync(join(dir, f), "utf-8")),
  }));

/**
 * Cases that are EXACT and must stay so. Add a slug the moment it goes green; never remove
 * one to make a change pass — the same rule as never raising a ceiling.
 */
const PASSING: readonly string[] = [
  "midi-drums",
  "midi-piano",
  "midi-staccato",
];

const PREFIX = "data:audio/midi,";

/**
 * The file as a list of BYTES, with `MThd` and `MTrk` — which abcjs writes as literal ASCII
 * rather than as `%4d%54…` — expanded so every element is one byte either way. That is
 * abcjs's own `midiOutputType: "binary"` decoder doing the same thing.
 */
function bytes(data: string): string[] {
  const body = data
    .replace(PREFIX, "")
    .replace(/MThd/g, "%4d%54%68%64")
    .replace(/MTrk/g, "%4d%54%72%6b");
  const out: string[] = [];
  for (let i = 0; i + 2 < body.length + 1; i += 3)
    out.push(body.substring(i + 1, i + 3).toLowerCase());
  return out;
}

interface Diff {
  /** How many bytes matched before the first divergence — bigger is closer. */
  readonly matched: number;
  readonly where: string;
}

function firstDifference(got: string, want: string): Diff | null {
  if (got === want) return null;
  if (!got.startsWith(PREFIX))
    return { matched: 0, where: `no \`${PREFIX}\` prefix` };
  const a = bytes(got);
  const b = bytes(want);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 6);
      return {
        matched: i,
        where:
          `byte ${i}\n      got  …${a.slice(from, i).join(" ")} [${a[i]}] ${a.slice(i + 1, i + 7).join(" ")}…` +
          `\n      want …${b.slice(from, i).join(" ")} [${b[i]}] ${b.slice(i + 1, i + 7).join(" ")}…`,
      };
    }
  }
  return {
    matched: n,
    where:
      a.length > b.length
        ? `${a.length} bytes, want ${b.length}: extra ${a.slice(n, n + 8).join(" ")}…`
        : `${a.length} bytes, want ${b.length}: missing ${b.slice(n, n + 8).join(" ")}…`,
  };
}

function run(c: Case): Diff | null {
  const parsed = parse(c.abc);
  if (!parsed.ok)
    return {
      matched: 0,
      where: `parse failed: ${parsed.errors[0]?.message ?? "?"}`,
    };
  const score = parsed.scores[0];
  if (score === undefined) return { matched: 0, where: "no tune parsed" };
  // `midiOutputType` is a wrapper concern — it picks between a link, a data URI and a
  // Uint8Array, all of the same bytes — so only `pan` is passed through here.
  const pan = (c.options as { pan?: number[] } | null)?.pan;
  return firstDifference(
    midiFile(score, pan === undefined ? {} : { pan }),
    c.expected,
  );
}

describe("MIDI file vs abcjs", () => {
  it("writes the ranked table", () => {
    const rows = CASES.map((c) => {
      let diff: Diff | null;
      try {
        diff = run(c);
      } catch (error) {
        diff = { matched: 0, where: `threw: ${(error as Error).message}` };
      }
      return { slug: c.slug, diff, size: bytes(c.expected).length };
    });
    const off = rows.filter((r) => r.diff !== null);
    const text = [
      `${off.length} of ${rows.length} cases differ from abcjs`,
      "",
      ...off
        .sort((a, b) => (a.diff?.matched ?? 0) - (b.diff?.matched ?? 0))
        .map(
          (r) =>
            `  ${r.slug.padEnd(18)} ${String(r.diff?.matched).padStart(4)}/${r.size} ok  ${r.diff?.where}`,
        ),
    ].join("\n");
    writeFileSync("/tmp/abcts-midi-ranked.txt", `${text}\n`);
    expect(rows.length).toBe(CASES.length);
  });

  it("the gate can tell two different files apart", () => {
    // A gate that cannot fail reports coverage it does not have. `midi-piano`'s own bytes
    // against `midi-drums`'s expectation is the real comparison on real goldens — it simply
    // has no reason to agree, and unlike a ceiling it cannot be closed by any fix.
    const piano = CASES.find((c) => c.slug === "midi-piano");
    const drums = CASES.find((c) => c.slug === "midi-drums");
    if (piano === undefined || drums === undefined)
      throw new Error("missing case");
    expect(firstDifference(piano.expected, drums.expected)).not.toBeNull();
    expect(firstDifference(piano.expected, piano.expected)).toBeNull();
  });

  for (const slug of PASSING) {
    it(`is exact — ${slug}`, () => {
      const c = CASES.find((x) => x.slug === slug);
      if (c === undefined) throw new Error(`no such case ${slug}`);
      expect(run(c)?.where ?? null).toBeNull();
    });
  }
});
