# The fuzz corpus — malformed input, which no other corpus here holds

Every fixture in `tests/corpus-abcjs/` and `../abcMusicKit/Tools/abcjs-debug/fixtures/` is
VALID ABC: the first 180 come from abcjs's own test suite and the 57 controls were written to
pin a rule. So the whole question *"what does a drop-in do with input a user is halfway
through typing?"* had no gate at all, and `scripts/zzfuzz.mjs` is that gate.

It found six real defects on its first run (2026-09-23), two of them fixed the same day:

* **a line of nothing but barlines was DELETED** — `|`, `||`, `|]`, `[|]`, `||||::|]` and
  `-|-` all gave abcjs a staff and gave this engine no lines at all, because the voice's
  emptiness was tested BEFORE the pending barline was flushed. FIXED.
* **consecutive barlines collapsed into one** — the lexer's `|` arm was a greedy run where
  `getBarLine` is a bounded decision tree, so `|||` drew one barline where abcjs draws two
  and `||||::|]` drew one where abcjs draws three. FIXED.
* the rest are DECLARED in the script, each with its measurement.

⚠️ **THE CASES ARE THE POINT, AND THEY ARE CHEAP.** A shape that no fixture writes is a shape
no gate can defend, and this file is where to add one. `cases.json` is a flat list of
`{label, abc}` — add a row, run the script, and it will tell you what abcjs does.
