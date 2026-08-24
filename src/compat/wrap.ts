import type { Measure, Score } from "../core/model.js";

import type { AbcLine } from "./lines.js";
import type { MeasureSection } from "./tune-metrics.js";

/**
 * **`renderAbc(…, {wrap})` — RE-LINE THE MUSIC TO FIT THE PAGE.**
 *
 * A port of `parse/wrap_lines.js`, whose shape is three stages and only the middle one is
 * new here:
 *
 *   1. **MEASURE.** `getMeasureWidths` lays the tune out at width **0** — the width in hand
 *      is not used (`engraver-controller.js:139`) — and reads voice 0's bar positions, so
 *      every measure reports its MINIMUM. `measureWidthsOf` already does this and is gated
 *      by `tuneMetrics`, which calls the very same function in abcjs
 *      (`api/tune-metrics.js:10`). Verified against this surface's own oracle: bit for bit,
 *      long tails included.
 *   2. **SEARCH.** `calcLineWraps` turns those widths into a break after measure *n*, per
 *      section. This file.
 *   3. **APPLY.** `findLineBreaks` maps each measure break onto an ELEMENT index in the
 *      delined tune, and `addLineBreaks` rebuilds `tune.lines` from the slices.
 *
 * ⚠️ **AND A HEADLESS RENDER NEVER WRAPS.** `if (div === "*") removeDiv = true` and then
 * `if (!removeDiv && params.wrap && params.staffwidth)`
 * (`api/abc_tunebook_svg.js:112-120`), so `renderAbc('*', abc, {wrap})` comes back with no
 * `explanation` and no `lineBreaks` at all. Not an error — an empty answer, which is what
 * this surface's harvester read as a result before it rendered into a target.
 */

/** `params.wrap` — abcjs's own five knobs, all optional. */
export interface WrapParams {
  readonly minSpacing?: number | string;
  readonly minSpacingLimit?: number | string;
  readonly maxSpacing?: number | string;
  readonly lastLineLimit?: number | string;
  readonly preferredMeasuresPerLine?: number | string;
}

/** One row of `tune.explanation` — the search's reasoning for one SECTION. */
export interface WrapExplanation {
  widths: MeasureSection;
  lineBreakPoint: number;
  minLineSize: number;
  attempts: unknown[];
  staffWidth: number;
  minWidth: number;
}

/** One row of `tune.lineBreaks` — where one DRAWN line came from. */
export interface WrapLineBreak {
  ogLine: number;
  line: number;
  staff?: number;
  voice?: number;
  start?: number;
  end?: number;
}

/** `Math.max(parseFloat(v), 1)`, with abcjs's own fallback when the knob is absent. */
const atLeastOne = (v: number | string | undefined): number | undefined =>
  v === undefined || v === null || v === ""
    ? undefined
    : Math.max(Number.parseFloat(String(v)), 1);

/**
 * `freeFormLineBreaks` (`wrap_lines.js:159-188`) — accumulate until the ideal is passed,
 * then keep whichever of the two neighbours is closer to it.
 */
const freeFormLineBreaks = (
  widths: readonly number[],
  lineBreakPoint: number,
): { lineBreaks: number[]; totals: number[] } => {
  const lineBreaks: number[] = [];
  const totals: number[] = [];
  let totalThisLine = 0;
  for (let i = 0; i < widths.length; i += 1) {
    const width = widths[i] ?? 0;
    const attemptedWidth = totalThisLine + width;
    if (attemptedWidth < lineBreakPoint) totalThisLine = attemptedWidth;
    else {
      const oldDistance = lineBreakPoint - totalThisLine;
      const newDistance = attemptedWidth - lineBreakPoint;
      if (oldDistance < newDistance && totalThisLine > 0) {
        lineBreaks.push(i - 1);
        totals.push(Math.round(totalThisLine - width));
        totalThisLine = width;
      } else if (i < widths.length - 1) {
        lineBreaks.push(i);
        totals.push(Math.round(totalThisLine));
        totalThisLine = 0;
      }
    }
  }
  totals.push(Math.round(totalThisLine));
  return { lineBreaks, totals };
};

/**
 * `fixedMeasureLineBreaks` (`wrap_lines.js:317-335`) — a break every N measures, and
 * `failed` the moment any line runs past the break point.
 *
 * ⚠️ **AND `thisWidth` IS NOT RESET WHEN THE LINE OVERRUNS**, only at the N-th measure — so
 * one wide measure fails every line after it too. abcjs's, reproduced.
 */
const fixedMeasureLineBreaks = (
  widths: readonly number[],
  lineBreakPoint: number,
  preferredMeasuresPerLine: number,
): { failed: boolean; totals: number[]; lineBreaks: number[] } => {
  const lineBreaks: number[] = [];
  const totals: number[] = [];
  let thisWidth = 0;
  let failed = false;
  for (let i = 0; i < widths.length; i += 1) {
    thisWidth += widths[i] ?? 0;
    if (thisWidth > lineBreakPoint) failed = true;
    if (i % preferredMeasuresPerLine === preferredMeasuresPerLine - 1) {
      // "Don't bother putting a line break for the last line - it's already a break."
      if (i !== widths.length - 1) lineBreaks.push(i);
      totals.push(Math.round(thisWidth));
      thisWidth = 0;
    }
  }
  return { failed, totals, lineBreaks };
};

interface Try {
  accumulator: number;
  lineAccumulator: number;
  lineWidths: number[];
  lastVariance: number;
  highestVariance: number;
  currLine: number;
  lineBreaks: number[];
  startIndex: number;
  variances?: number[];
  aveVariance?: number;
}

/**
 * `oneTry` (`wrap_lines.js:198-249`) — one walk of the measures, FORKING wherever the
 * decision is close.
 *
 * ⚠️ **AND IT PUSHES ONTO THE VERY LIST BEING ITERATED.** `otherTries` is the queue and
 * every fork appends to it while `calcLineWraps`'s `while (index < otherTries.length)` walks
 * forward, so a fork's own forks are explored too — a breadth-first search written as a
 * growing array. abcjs's own comment says it "seems to never generate more than about 16
 * tries and it is usually 4 or less".
 */
const oneTry = (
  measureWidths: readonly number[],
  idealWidths: readonly number[],
  state: Try,
  otherTries: Try[],
): void => {
  let { accumulator, lineAccumulator, lastVariance, highestVariance, currLine } = state;
  const { lineWidths, lineBreaks } = state;
  for (let i = state.startIndex; i < measureWidths.length; i += 1) {
    const measureWidth = measureWidths[i] ?? 0;
    accumulator += measureWidth;
    lineAccumulator += measureWidth;
    const thisVariance = Math.abs(accumulator - (idealWidths[currLine] ?? 0));
    // "see if the difference is less than 10%, if so, run the test both ways."
    const varianceIsClose =
      Math.abs(thisVariance - lastVariance) < (idealWidths[0] ?? 0) / 10;
    if (varianceIsClose) {
      if (thisVariance < lastVariance) {
        // "Also attempt one less measure on the current line - sometimes that works out better."
        otherTries.push({
          accumulator,
          lineAccumulator: measureWidth,
          lineWidths: [...lineWidths, lineAccumulator - measureWidth],
          lastVariance: Math.abs(accumulator - (idealWidths[currLine + 1] ?? 0)),
          highestVariance: Math.max(highestVariance, lastVariance),
          currLine: currLine + 1,
          lineBreaks: [...lineBreaks, i - 1],
          startIndex: i + 1,
        });
      } else if (thisVariance > lastVariance && i < measureWidths.length - 1) {
        // "Also attempt one extra measure on this line." ⚠️ **AND IT FORKS WITH THE LISTS
        // UNCHANGED** — abcjs's two lines that would have edited them are commented out in
        // its own source, so this branch differs from its parent only in where it resumes.
        otherTries.push({
          accumulator,
          lineAccumulator,
          lineWidths: [...lineWidths],
          lastVariance: thisVariance,
          highestVariance: Math.max(highestVariance, thisVariance),
          currLine,
          lineBreaks: [...lineBreaks],
          startIndex: i + 1,
        });
      }
    }
    if (thisVariance > lastVariance) {
      lineBreaks.push(i - 1);
      currLine += 1;
      highestVariance = Math.max(highestVariance, lastVariance);
      lastVariance = Math.abs(accumulator - (idealWidths[currLine] ?? 0));
      lineWidths.push(lineAccumulator - measureWidth);
      lineAccumulator = measureWidth;
    } else lastVariance = thisVariance;
  }
  lineWidths.push(lineAccumulator);
  state.highestVariance = highestVariance;
};

/** `optimizeLineWidths` (`wrap_lines.js:252-315`) — the breadth-first search, whole. */
const optimizeLineWidths = (
  widths: MeasureSection,
  lineBreakPoint: number,
  explanation: WrapExplanation,
): { failed: boolean; lineBreaks: number[]; variance: number } => {
  // "+ 1 TODO-PER: this used to be plus one - not sure why"
  const numLines = Math.ceil(widths.total / lineBreakPoint);
  const idealWidth = Math.floor(widths.total / numLines);
  const idealWidths: number[] = [];
  for (let i = 0; i < numLines; i += 1) idealWidths.push(idealWidth * (i + 1));

  const otherTries: Try[] = [
    {
      accumulator: 0,
      lineAccumulator: 0,
      lineWidths: [],
      lastVariance: 999999,
      highestVariance: 0,
      currLine: 0,
      // "These are the zero-based last measure on each line"
      lineBreaks: [],
      startIndex: 0,
    },
  ];
  let index = 0;
  while (index < otherTries.length) {
    const t = otherTries[index];
    if (t !== undefined) oneTry(widths.measureWidths, idealWidths, t, otherTries);
    index += 1;
  }
  for (const otherTry of otherTries) {
    otherTry.variances = [];
    otherTry.aveVariance = 0;
    for (const lineWidth of otherTry.lineWidths) {
      otherTry.variances.push(lineWidth - (idealWidths[0] ?? 0));
      otherTry.aveVariance += Math.abs(lineWidth - (idealWidths[0] ?? 0));
    }
    otherTry.aveVariance /= otherTry.lineWidths.length;
    explanation.attempts.push({
      type: "optimizeLineWidths",
      lineBreaks: otherTry.lineBreaks,
      variances: otherTry.variances,
      aveVariance: otherTry.aveVariance,
      widths: widths.measureWidths,
    });
  }
  let smallest = 9999999;
  let smallestIndex = -1;
  for (let i = 0; i < otherTries.length; i += 1) {
    const t = otherTries[i];
    if (t !== undefined && (t.aveVariance ?? 0) < smallest) {
      smallest = t.aveVariance ?? 0;
      smallestIndex = i;
    }
  }
  const best = otherTries[smallestIndex];
  return {
    failed: false,
    lineBreaks: best?.lineBreaks ?? [],
    variance: best?.highestVariance ?? 0,
  };
};

/**
 * `calcLineWraps` (`wrap_lines.js:352-437`) — one `explanation` and one break list per
 * SECTION.
 *
 * ⚠️ **AND A PAGE NARROWER THAN ITS OWN MARGIN IS NOT AN ERROR** — abcjs returns
 * `explanation: "Staff width is narrower than the margin"`, a STRING where every other path
 * returns an array, and `reParse: false` (`:359-365`). A host reading `.length` gets 41.
 */
export function calcLineWraps(
  sections: readonly MeasureSection[],
  staffwidth: number,
  wrap: WrapParams,
  scaleParam?: number,
): { reParse: boolean; explanation: WrapExplanation[] | string; lineBreaks: number[][] } {
  if (sections.length === 0 || staffwidth < (sections[0]?.left ?? 0))
    return {
      reParse: false,
      explanation: "Staff width is narrower than the margin",
      lineBreaks: [],
    };

  const scale = scaleParam ? Math.max(scaleParam, 0.1) : 1;
  const minSpacing = atLeastOne(wrap.minSpacing) ?? 1;
  // ⚠️ **AND THE LIMIT'S FALLBACK IS `minSpacing - 0.1`, NOT `minSpacing`** — so `minWidth`
  // is a touch wider than `lineBreakPoint` whenever the knob is absent (`:369`).
  const minSpacingLimit = atLeastOne(wrap.minSpacingLimit) ?? minSpacing - 0.1;
  const maxSpacing = atLeastOne(wrap.maxSpacing) ?? atLeastOne(wrap.lastLineLimit);
  const preferredMeasuresPerLine =
    wrap.preferredMeasuresPerLine === undefined ||
    wrap.preferredMeasuresPerLine === null ||
    wrap.preferredMeasuresPerLine === ""
      ? undefined
      : Math.max(Number.parseInt(String(wrap.preferredMeasuresPerLine), 10), 0);

  const accumulatedLineBreaks: number[][] = [];
  const explanations: WrapExplanation[] = [];
  for (const section of sections) {
    const usableWidth = staffwidth - section.left;
    const lineBreakPoint = usableWidth / minSpacing / scale;
    // ⚠️ `maxSpacing` UNDEFINED gives `usableWidth / undefined`, which is `NaN` — abcjs's
    // own arithmetic, and `minLineSize` is published as such. Not guarded here either.
    const minLineSize = usableWidth / (maxSpacing as number) / scale;
    const allowableVariance = usableWidth / minSpacingLimit / scale;
    const explanation: WrapExplanation = {
      widths: section,
      lineBreakPoint,
      minLineSize,
      attempts: [],
      staffWidth: staffwidth,
      minWidth: Math.round(allowableVariance),
    };

    let lineBreaks: number[] | null = null;
    if (preferredMeasuresPerLine) {
      const f = fixedMeasureLineBreaks(
        section.measureWidths,
        lineBreakPoint,
        preferredMeasuresPerLine,
      );
      explanation.attempts.push({
        type: "Fixed Measures Per Line",
        preferredMeasuresPerLine,
        lineBreaks: f.lineBreaks,
        failed: f.failed,
        totals: f.totals,
      });
      if (!f.failed) lineBreaks = f.lineBreaks;
    }

    if (!lineBreaks) {
      const ff = freeFormLineBreaks(section.measureWidths, lineBreakPoint);
      explanation.attempts.push({
        type: "Free Form",
        lineBreaks: ff.lineBreaks,
        totals: ff.totals,
      });
      lineBreaks = ff.lineBreaks;

      // "Only do this if everything doesn't fit on one line. This is an intensive
      // operation and it is optional so just do it for shorter music."
      if (lineBreaks.length > 0 && section.measureWidths.length < 25) {
        const opt = optimizeLineWidths(section, lineBreakPoint, explanation);
        explanation.attempts.push({
          type: "Optimize",
          failed: opt.failed,
          reason: undefined,
          lineBreaks: opt.lineBreaks,
          totals: undefined,
        });
        if (!opt.failed) lineBreaks = opt.lineBreaks;
      }
    }
    accumulatedLineBreaks.push(lineBreaks);
    explanations.push(explanation);
  }
  return { reParse: true, explanation: explanations, lineBreaks: accumulatedLineBreaks };
}

/**
 * `findLineBreaks` (`wrap_lines.js:107-155`) — each measure break onto an ELEMENT index.
 *
 * ⚠️ **AND `lineCounter` IS A RUNNING MAX ACROSS STAVES AND VOICES, NOT A COUNT.** Every
 * voice restarts at the line the ORIGINAL line opened on (`outputLine = lineStart`) and
 * pushes `lineCounter` up as it goes, so two voices of one staff land on the same output
 * lines and the next original line starts past the furthest of them.
 *
 * ⚠️ **AND A NON-MUSIC LINE IS A ROW WITH NO SLICE AT ALL** — `{ogLine, line}` and nothing
 * else, which is how `%%text` splits a tune into sections on this surface as well as on the
 * width one.
 */
export function findLineBreaks(
  lines: readonly AbcLine[],
  lineBreakArray: readonly (readonly number[])[],
): WrapLineBreak[] {
  const out: WrapLineBreak[] = [];
  let lbai = 0;
  let lineCounter = 0;
  let outputLine = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const staves = line?.staff;
    if (staves !== undefined) {
      const lineStart = lineCounter;
      const lineBreaks = lineBreakArray[lbai] ?? [];
      lbai += 1;
      for (let j = 0; j < staves.length; j += 1) {
        const voices = staves[j]?.voices ?? [];
        for (let k = 0; k < voices.length; k += 1) {
          outputLine = lineStart;
          let measureNumber = 0;
          let lbi = 0;
          const voice = voices[k] ?? [];
          let start = 0;
          for (let e = 0; e < voice.length; e += 1) {
            if (voice[e]?.el_type === "bar") {
              if (lineBreaks[lbi] === measureNumber) {
                out.push({ ogLine: i, line: outputLine, staff: j, voice: k, start, end: e });
                start = e + 1;
                outputLine += 1;
                lineCounter = Math.max(lineCounter, outputLine);
                lbi += 1;
              }
              measureNumber += 1;
            }
          }
          // ⚠️ **AND THE TAIL'S `end` IS THE LENGTH, NOT THE LAST INDEX** — every other row
          // ends at the barline's own index, so the slice `start…end` is inclusive there
          // and exclusive here. abcjs's `slice(start, end+1)` reads both.
          out.push({
            ogLine: i,
            line: outputLine,
            staff: j,
            voice: k,
            start,
            end: voice.length,
          });
          outputLine += 1;
          lineCounter = Math.max(lineCounter, outputLine);
        }
      }
    } else {
      out.push({ ogLine: i, line: outputLine });
      outputLine += 1;
      lineCounter = Math.max(lineCounter, outputLine);
    }
  }
  return out;
}

/**
 * **APPLY THE BREAKS TO THE SCORE** — the third stage, and where this engine and abcjs part
 * company on MECHANISM while agreeing on answer.
 *
 * abcjs re-PARSES the tune with `lineBreaks` in its params and lets `wrapLines` rebuild
 * `tune.lines` from `deline`'s output (`abc_tunebook_svg.js:137-144`, `wrap_lines.js:3-15`).
 * This model already says "a new system starts here" with `Measure.startsSystem`, so the
 * breaks are a REWRITE of that flag — exactly the shape `%%barsperstaff` takes, which is
 * abcjs's own other line-forcing feature and is likewise a parse-time rewrite here.
 *
 * ⚠️ **AND IT REPLACES THE SOURCE'S OWN BREAKS, IT DOES NOT ADD TO THEM.** `wrapLines`
 * builds `tune.lines` from the DELINED tune, so within a section every line break the ABC
 * wrote is gone and only the computed ones remain — where `%%barsperstaff` only ever
 * SPLITS. A tune whose source lines are four bars each and whose wrap wants six gets six.
 *
 * ⚠️ **AND A SECTION IS A RUN OF STAFF LINES.** The measure indices are counted from the
 * start of the SECTION, across every line in it, and a non-music line — a `%%text`, a
 * mid-tune subtitle — closes one and opens the next. That is the same rule
 * `measureWidthsOf` uses to build the widths these indices point into, so the two walks
 * have to agree measure for measure.
 */
export function applyLineBreaks(
  score: Score,
  lineBreaks: readonly (readonly number[])[],
): Score {
  if (lineBreaks.length === 0) return score;
  /**
   * Where each SECTION begins, as a measure index. A section ends where a measure opens a
   * system AND carries something non-musical before it — `textBefore` is what
   * `measureWidthsOf` reads as "this line has no staff".
   */
  const sectionStarts: number[] = [0];
  const first = score.voices[0];
  (first?.measures ?? []).forEach((m, i) => {
    if (i > 0 && (m.textBefore?.length ?? 0) > 0) sectionStarts.push(i);
  });

  const voices = score.voices.map((voice, vi) => {
    const measures = voice.measures.map((m, i) => {
      let section = 0;
      for (let k = 0; k < sectionStarts.length; k += 1)
        if (i >= (sectionStarts[k] ?? 0)) section = k;
      const from = sectionStarts[section] ?? 0;
      const breaks = lineBreaks[section];
      if (breaks === undefined) return m;
      // A section's FIRST measure keeps whatever it had — it opens the section, and that
      // is not the wrap's to decide.
      if (i === from) return { ...m, wrapSourceLine: section };
      // "These are the zero-based last measure on each line", so the measure AFTER one
      // opens a system and every other measure in the section does not.
      const opens = breaks.includes(i - from - 1);
      if (opens === (m.startsSystem === true)) return { ...m, wrapSourceLine: section };
      // ⚠️ **AND A WRAPPED LINE DOES NOT REPRINT THE METER, WHERE `%%barsperstaff`'s DOES.**
      // `addLineBreaks` copies every key of the input staff onto the output one EXCEPT
      // `voices`, and `if (keys[k] === "meter" && action.line !== 0) skip = true`
      // (`wrap_lines.js:41-46`) — where `%%barsperstaff`'s `wrapMusicLines` copies the line
      // WHOLE and carries `staff.meter` with it. Two line-forcing features, two answers,
      // and setting `wrappedLine` here drew a meter on every wrapped system.
      return opens
        ? { ...m, startsSystem: true as const, wrapSourceLine: section }
        : { ...m, startsSystem: false as const, wrapSourceLine: section };
    });
    /**
     * ⚠️ **AND THE BARLINE THAT ENDS A WRAPPED LINE LOSES ITS NUMBER, WHICH THE NEXT LINE
     * TAKES AT ITS HEAD.**
     *
     *     if (kk === currVoice.length-1) delete currVoice[kk].barNumber
     *     else currVoice[kk].barNumber = currentBarNumber
     *
     * (`wrap_lines.js:80-90`), with `staff.barNumber = currentBarNumber` set on every
     * output line past the first (`:37-39`). The two are DIFFERENT MECHANISMS and only one
     * of them costs height: a number on a barline is a POINT in the staff's ink and pushes
     * its top, where one on the CLEF carries `okToPushTop = false`. Leaving it on the
     * barline put abcjs's `piano-300` 10.5px lower on EVERY system — a uniform shift from
     * the first staff line, which is the shape of a lane and not of a placement.
     *
     * ⚠️ **AND IT IS VOICE 0 OF STAFF 0 ONLY** — `action.staff === 0 && action.voice === 0`
     * — because the counter is the tune's, not the voice's.
     */
    if (vi !== 0) return { ...voice, measures };
    const renumbered = measures.map((m, i) => {
      const endsSystem = measures[i + 1]?.startsSystem === true;
      const opensSystem = m.startsSystem === true && i > 0;
      const next: Measure = { ...m };
      if (endsSystem && next.closingBarNumber !== undefined)
        delete (next as { closingBarNumber?: number }).closingBarNumber;
      if (opensSystem) {
        // The number this line opens on — the one the barline before it would have shown.
        const carried = measures[i - 1]?.closingBarNumber ?? m.systemBarNumber;
        if (carried !== undefined)
          (next as { systemBarNumber?: number }).systemBarNumber = carried;
      }
      return next;
    });
    return { ...voice, measures: renumbered };
  });
  return { ...score, voices };
}
