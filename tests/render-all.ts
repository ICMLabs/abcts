import {
  numberOfTunes,
  renderAbc,
  type AbcjsParams,
  type TuneObject,
} from "../src/compat/index.js";

/**
 * **EVERY TUNE OF A BOOK, THE WAY abcjs'S OWN GENERATOR ASKS FOR THEM.**
 *
 * `renderAbc` renders ONE TUNE PER OUTPUT SLOT — a single div gets the first tune and
 * nothing else (`api/abc_tunebook.js:56-104`) — so a gate that wants tune 3 has to supply
 * four slots, exactly as `dump-svg.js` builds four divs. `"*"` is abcjs's headless slot:
 * the work is done and no markup is shown, which is what a Node test wants.
 *
 * Until 2026-08-15 our `renderAbc` returned one object per TUNE whatever the target was,
 * and every gate here read `[i]` off that. The divergence was invisible precisely because
 * the gates leaned on it.
 */
export function renderAll(abc: string, params: AbcjsParams = {}): TuneObject[] {
  return renderAbc(
    new Array<string>(numberOfTunes(abc)).fill("*"),
    abc,
    params,
  );
}
