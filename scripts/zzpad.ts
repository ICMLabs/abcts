import { readFileSync } from "node:fs";
import { parse } from "../src/parser/parser.js";

const abc = readFileSync(process.env["F"] as string, "utf-8");
const r = parse(abc) as { scores?: unknown[]; score?: unknown };
const score = ((r.scores?.[0] ?? r.score) as {
  voices: { measures: { startsSystem: boolean; events: unknown[]; overlays: unknown[][] }[] }[];
});
const show = (e: unknown): string => {
  const ev = e as {
    type: string;
    kind?: string;
    overlayPad?: boolean;
    duration: { numerator: number; denominator: number };
    sourceRange: { start: number; end: number } | null;
  };
  const dur = ev.duration.numerator / ev.duration.denominator;
  return `${ev.type === "rest" ? `rest/${ev.kind}${ev.overlayPad ? "(pad)" : ""}` : "note"} ${dur}@${ev.sourceRange ? `${ev.sourceRange.start}..${ev.sourceRange.end}` : "null"}`;
};
score.voices.forEach((v, vi) => {
  console.log(`voice ${vi}`);
  let line = -1;
  const lines: (typeof v.measures)[] = [];
  v.measures.forEach((m, i) => {
    if (i === 0 || m.startsSystem) { lines.push([]); line += 1; }
    lines[line]?.push(m);
  });
  lines.forEach((ms, li) => {
    const depth = Math.max(0, ...ms.map((m) => m.overlays.length));
    console.log(`line ${li}: ${1 + depth} voices`);
    console.log(`   v0: ${ms.map((m) => `${m.events.map(show).join(" ")} | bar`).join(" ")}`);
    for (let j = 0; j < depth; j += 1)
      console.log(
        `   v${j + 1}: ${ms.map((m) => `${(m.overlays[j] ?? []).map(show).join(" ")} | bar`).join(" ")}`,
      );
  });
});
