/**
 * **THE `<script>`-TAG BUILD.** abcjs ships `dist/abcjs-basic-min.js`, which a page loads
 * with a plain `<script>` and reaches as `window.ABCJS`. Nothing here could be dropped in
 * beside it until this existed: `tsup.config.ts` emitted ESM and CJS only, and its own
 * note deferred the iife ("entries added as modules land").
 *
 * It exists for the PARITY HARNESS first — `scripts/zzengines.mjs` puts both engines in
 * one page and diffs them live, which is the only coherent browser oracle now that abcjs
 * is measured to render differently in WebKit and Blink (commit `d4b7022`). A host can
 * use it too; the global name matches abcjs's on purpose.
 *
 * ⚠️ The global is `ABCTS`, NOT `ABCJS`. Claiming abcjs's own global would make the two
 * unloadable in the same page, and comparing them in one page is the whole point. A host
 * swapping us in writes `window.ABCJS = window.ABCTS` itself, deliberately.
 */
export * from "./compat/index.js";
