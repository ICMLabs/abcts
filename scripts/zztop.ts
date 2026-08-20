import { readFileSync } from "node:fs";
import { layout } from "../src/renderer/layout.js";
import { parse } from "../src/parser/parser.js";
const r = parse(readFileSync(process.env["F"] as string, "utf-8")) as { scores?: unknown[] };
const doc = layout((r.scores?.[0] ?? {}) as never, { systemWidth: Number(process.env["W"] ?? 770) } as never);
const STEP = 3.875;
for (const [i, s] of doc.systems.entries()) {
  const first = s.staves[0];
  const last = s.staves[s.staves.length - 1];
  if (!first || !last) continue;
  const top = first.absoluteY - s.firstTopPitch * STEP;
  const bottom = last.absoluteY - s.lastBottomPitch * STEP;
  console.log(
    `system ${i} firstAbsY=${first.absoluteY.toPrecision(20)} topPitch=${s.firstTopPitch.toPrecision(20)} top=${top.toPrecision(20)}`,
  );
}
