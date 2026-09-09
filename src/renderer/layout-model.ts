/**
 * **THE LAYOUT DATA MODEL — what a laid-out score IS, with no code that makes one.**
 *
 * Carved out of `layout.ts` on 2026-09-08, which was 21,660 lines. ⚠️ **And it is the
 * available quarter of that file rather than the split anyone wanted**: measured with
 * comments stripped, **75% of the file is transitively coupled to the sixteen render-scoped
 * switches** (see `RenderState` there), so the seams the plan named — glyph metrics, the
 * horizontal solve, the vertical lanes, curves, text — cannot be separated without
 * threading those switches through 217 references, which was measured and declined.
 *
 * What CAN move is the part with no behaviour at all. These are TYPES: erased at build, so
 * the extraction cannot change a byte, which is why it is the piece worth doing first.
 * `layout.ts` re-exports every one of them, so no caller changes.
 *
 * Read this file to learn what the renderer produces; read `layout.ts` to learn how.
 */
import type {
  AbcFontType,
  Clef,
  CompatibilityMode,
  FreeTextBlock,
  KeySignature,
  Meter,
  MusicEvent,
  RichPhrase,
  Score,
  SourceRange,
  Tempo,
} from '../core/model.js'
import type { GlyphName } from './glyphs.js'

export type ElementType =
  | 'title'
  | 'voiceName'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'tempo'
  | 'part'
  | 'note'
  | 'rest'
  | 'bar'

/**
 * What a drawn part IS, independent of which element owns it.
 *
 * A note element draws a notehead, a stem and maybe a ledger line, and a host wants to
 * tell them apart — for styling, for hit-testing, and for the compat layer, which must
 * emit abcjs's per-part class names (`abcjs-notehead`, `abcjs-stem`, `abcjs-ledger`)
 * rather than one class for the whole note.
 */
export type PartRole =
  | 'notehead'
  /** The miniature notehead of a `Q:` mark — see `AboveLadder.tempoPitch`. */
  | 'tempoNote'
  | 'stem'
  | 'ledger'
  | 'accidental'
  | 'flag'
  | 'dot'
  | 'grace'
  | 'staff'
  | 'beam'
  | 'bar'
  | 'clef'
  | 'keySignature'
  | 'timeSignature'
  | 'rest'
  | 'decoration'
  | 'text'
  | 'lyric'
  | 'chord'
  /** A chord symbol or annotation on the BELOW side — its own lane, off `staff.bottom`. */
  | 'chordBelow'
  | 'dynamic'
  | 'title'
  /** A `%%sep` rule — `drawSeparator` is its own emitter, unlike every other line. */
  | 'separator'

export interface PlacedGlyph {
  readonly name: GlyphName
  /**
   * abcjs's `data-name` for this glyph, when it is NOT the glyph's own key. Only a
   * notehead has one: `create-note-head.js:34` passes `name: pitchelem.name`, the WRITTEN
   * note — its source letter with any explicit accidental prefixed and its octave marks
   * appended, rewritten by transposition (`abc_parse_music.js:1113-1147`).
   */
  readonly dataName?: string
  /** Which grace of the group this head belongs to — its ledgers follow it. */
  readonly graceIndex?: number
  /**
   * How many of the element's LINES precede this glyph. Set on a barline's repeat dots,
   * whose column sits before the rules on a repeat END and after them on a repeat START.
   */
  readonly afterLine?: number
  /**
   * **A MULTI-CHARACTER SYMBOL IS ONE GROUP.** `printSymbol` branches on
   * `symbol.length > 1 && symbol.indexOf(".") < 0` and opens
   * `<g data-name="{name}">` round one path PER CHARACTER, none of which is named
   * (`draw/print-symbol.js:14-30`). A `12` numerator, a `2+3` additive one and an `mf`
   * are all that shape; a single digit is a bare `data-name="3"` path.
   *
   * Consecutive glyphs sharing this string are wrapped together by the emitter — see
   * `groupStart`, which is what keeps two ADJACENT groups of the same name apart.
   */
  readonly group?: string
  /**
   * Opens a NEW group even though the previous glyph shared this one's `group` string.
   *
   * Two dynamics in a row are two `<g data-name="dynamics">` elements, not one holding
   * every letter of both — the name is the KIND and the group is the OCCURRENCE.
   */
  readonly groupStart?: boolean
  /**
   * **THE DECORATION'S OWN NAME, ON A VOLUME MARK ONLY** — `drawDynamics` wraps its glyph
   * with `{el_type: "dynamicDecoration", startChar: -1, endChar: -1, decoration: params.dec}`
   * (`draw/dynamics.js:16`) where `drawCrescendo` writes the same three fields and NO
   * `decoration` at all (`draw/crescendo.js:21`). The golden shows both side by side, so
   * the absence is the contract rather than an omission. Carried on the glyph that OPENS
   * the mark: a kerned `mp` is two glyphs and one selectable.
   */
  readonly decoration?: string
  /**
   * Position within a CHORD, 1 = lowest pitch, counting upward. Absent on a single note.
   *
   * abcjs puts `abcjs-chord-pos-N` on each notehead of a chord and nothing on a lone one,
   * which is what its 722/715 split of pos-1 to pos-2 across the corpus shows — a single
   * note would make pos-1 dwarf the rest. Compat reproduces it because a stylesheet can
   * legitimately target it, and it was the ONLY class abcjs emits that we did not.
   */
  readonly chordPos?: number
  /**
   * **AN ORNAMENT ABOVE A BEAMED NOTE IS MOVED CLEAR OF THE BEAM AFTER THE FACT** — this
   * is the pitch it was STACKED at, which `moveDecorations` needs to re-place it from.
   * Only the ABOVE stack carries it: abcjs's test is
   * `el.klass === 'ornament' && el.position !== 'below'` (`layout/voice.js:39`), so a
   * close decoration (no `klass`) and a forced-below one are both out.
   */
  readonly ornamentPitch?: number
  /**
   * **THE PITCH THIS GLYPH IS DRAWN AT, WHERE ITS PRODUCER HOLDS ONE** — abcjs's `offset`
   * in `printSymbol(renderer, x, offset, symbol, …)`, before `getYCorr`.
   *
   * ⚠️ **AND THE BRACKETS ARE THE WHOLE REASON IT EXISTS.** abcjs draws at
   * `renderer.calcY(offset + ycorr)` — the pitch and the correction added as ONE number,
   * then a single multiply (`draw/print-symbol.js:21`, `:34`). The emitter otherwise has
   * only the y and spends the correction on it as a LENGTH, which is
   * `offset * STEP + ycorr * STEP` against abcjs's `(offset + ycorr) * STEP`.
   *
   * They agree on every tune in both corpora and part by one ULP the moment the pitch has
   * a long tail: a lyric singing above the staff puts abcjs's `p` at
   * `69.91999999999999` and the two-multiply form at `69.92`. Set on the DYNAMIC alone,
   * whose lane is a walked sum and therefore the first place a tail appears; every other
   * glyph keeps the path that is already byte-exact 363 fixtures over.
   */
  readonly drawPitch?: number
  /**
   * **THE PITCH A CSS SCALE PIVOTS ABOUT — abcjs's RAW `params.pitch`, BEFORE `getYCorr`.**
   *
   * `scaleExistingElem` takes `transform-origin: params.x, renderer.calcY(params.pitch)`
   * (`draw/relative.js:68-76`), and `printSymbol` applies the correction on its OWN, so the
   * pivot sits where the element was declared rather than where its outline was drawn.
   *
   * A REST is the case that needs it stated: abcjs declares one at `restpitch` and draws it
   * a pitch lower (`rests.quarter` has `getYCorr` -1), where this engine bakes the
   * correction into the glyph's step and reaches the same DRAWN y by a different route. The
   * two agree everywhere until something scales — `V:… scale=1.5` put the pivot 3.875px
   * low, one whole pitch, on a byte-exact drawing.
   */
  readonly originPitch?: number
  readonly x: number
  readonly y: number
  /** What this glyph is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * Uniform scale about the glyph origin. 1 unless stated — grace notes and the octave
   * marker on a `-8` clef are the only things that shrink, and a scale shrinks everything:
   * notehead, stem and flag together.
   */
  readonly scale?: number
  /**
   * Vertical extent this glyph DECLARES, replacing its ink box — `[top, bottom]` in the
   * same y-down staff spaces as `y`.
   *
   * abcjs's `RelativeElement` takes `top`/`bottom` overrides that need not bracket the ink
   * at all (`elements/relative-element.js:38-41`), and the octave marker on a `clef=treble-8`
   * is the clearest case: drawn at pitch -2, it declares -4/-6 — a reserve four pitch
   * deeper than anything it draws. Reserving its ink box instead leaves the staff below it
   * 4 pitch too close, which is the whole of `zocharti-loch`'s tenor-to-bass gap.
   *
   * The same "reserve a fixed lane, let the ink overhang it" shape as the tuplet lane and
   * the above-staff stack.
   */
  readonly reserve?: readonly [top: number, bottom: number]
  /**
   * The SAME two edges in abcjs's own PITCH, where the producer knows them.
   *
   * `calcHeight` sums `staff.top` and `-staff.bottom` in pitch and multiplies by `STEP`
   * once, so recovering the pitch by dividing the y back is a different double — see
   * `verticalExtent`. Absent means "divide", which is what every reserve did before.
   */
  readonly reservePitch?: readonly [top: number, bottom: number]
  /**
   * The PITCH this glyph is drawn at, where something has to MOVE it in pitch.
   *
   * Only a rest carries one: `fixVoiceCollisions` does `children[0].pitch -= distance` and
   * `calcY` multiplies once (`layout/layout.js:164-175`), so the shift has to be applied to
   * the pitch and converted afterwards — not added to the drawn y.
   */
  readonly anchorPitch?: number
  /**
   * This glyph's offset from its element's own x, CONSTRUCTED rather than derived.
   *
   * abcjs stores `dx` on the `RelativeElement` and places it as `this.x = x + this.dx`
   * (`relative-element.js:124-125`), so the offset is the number the engraver built —
   * `headx + notehead.w - 0.6` for a flag (`create-note-head.js:47`) — and the placement
   * is ONE addition onto the solved x. Deriving it back out of two absolute x's is
   * `(x + a) - x`, which is not `a`. Absent means "derive", which is what everything did
   * before this field existed.
   *
   * **AND THE INK WIDTH READS IT TOO.** `addRight` is `this.w = max(this.w, dx + w)`
   * (`absolute-element.js:110`), so an element's own `w` is built from the SAME dx the
   * placement used — deriving it back out cost `synth-timing-03`'s eighth its last bit,
   * 15.902000000000008 against abcjs's 15.902000000000001, which only the cursor gate
   * could see because every other comparison of that number carries a tolerance.
   */
  readonly dx?: number
}

export interface PlacedLine {
  /** Which bracket group this segment belongs to — see `PlacedText.group`. */
  group?: number
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly thickness: number
  /** What this line is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * The PAGE's own y, where this line has one — a `%%sep` in the head of a tune. The same
   * quantity and the same reason as `PlacedText.pageY`: the top block is built on the
   * page's cursor and only rebased into a staff's frame for the layout's sake.
   */
  readonly pageY?: number
  /** Which nonMusic ROW this line belongs to — see `PlacedText.nonMusicIndex`. */
  readonly nonMusicIndex?: number
  /** A beam's own duration, for its class — see `layoutBeam`. */
  readonly durationClass?: number
  /**
   * A beam's stem direction, which is the SIGN of abcjs's `dy` and therefore which edge
   * its path starts on: `calcDy` returns `+STEP` for stems up and `-STEP` for stems down
   * (`layout/beam.js:68-72`), and `drawBeam` writes `startY` then `startY + dy`. So an
   * up-stem beam's `d` opens on its TOP edge and a down-stem beam's on its BOTTOM.
   */
  readonly stemsUp?: boolean
  /**
   * The two ends this line was BUILT from, in abcjs PITCH — see `verticalExtent`. A stem's
   * `p1`/`p2` are pitches abcjs never converts, and the extent sums them as pitches.
   */
  readonly pitchRange?: readonly [number, number]
  /**
   * **A BEAM BROKEN BY `!beambr1!` IS A LIST OF x PAIRS, NOT ONE SEGMENT.** `drawBeam`
   * walks `beam.split` two at a time and interpolates each pair's y along the beam's own
   * slope (`draw/beam.js:11-20`). Built in `layoutBeam`.
   */
  readonly split?: readonly number[]
  /**
   * **AN ABSOLUTE y THAT THE TRANSLATION MUST NOT TOUCH.** A joined staff's barline reaches
   * the staff ABOVE, and abcjs takes that end as `renderer.calcY(2)` off THAT staff's
   * `absoluteY` — one product (`draw/staff-group.js:132`). Reaching it through this staff's
   * frame is `(prevOrigin + local - thisOrigin) + thisAbsolute`, four terms, and it lands a
   * ULP either side of a `roundNumber` boundary: `visual-slurs-02` wrote 80.68 where abcjs
   * writes 80.69.
   */
  readonly absY1?: number
  readonly absY2?: number
  /** Which voice ON THIS STAFF this belongs to — abcjs finishes one before the next. */
  readonly voice?: number
  /** A GRACE's stem — written after every grace head, not with the main note's rules. */
  readonly graceStem?: boolean
  /**
   * **THIS LINE'S y IS THE BEAM'S EDGE, NOT ITS CENTRE — SO THE EMITTER MUST NOT SHIFT IT.**
   *
   * A `PlacedLine` normally carries a centre and `beamPath` takes half a thickness back off
   * to reach abcjs's `startY`. That round trip is not free: `(274.465 + 0.775) - 0.775` is
   * `274.46500000000003`, which lands on the far side of `toFixed(2)` and prints 274.47
   * where abcjs prints 274.46 — abcjs's own `calcY` returns 274.465 and `(274.465).toFixed(2)`
   * is "274.46", because the double is really 274.46499999999997. It was the whole of
   * `S3-note-syntax-tune8`'s last difference. A grace beam's line is read by NOTHING but
   * the emitter, so it holds abcjs's number unshifted and skips the trip.
   */
  readonly edgeY?: boolean
  /** Which grace of the group this belongs to, so a ledger follows its OWN head. */
  readonly graceIndex?: number
  /**
   * Set on a stem a BEAM retargets — see the stem case in `verticalExtent`, and the
   * EMISSION ORDER: an unbeamed stem is `addRight` right after the pitch loop and lands
   * BEFORE the ledgers, a beamed one comes from the beam pass and lands AFTER them.
   */
  readonly beamed?: boolean
  /**
   * This line's END x is abcjs's own UNROUNDED number and must be emitted as such.
   *
   * Only a repeat ending running off a system sets it — `drawEnding` rounds an endpoint
   * that came from an ANCHOR and leaves the line-width fallback raw
   * (`draw/ending.js:13-26`). One `d` therefore mixes two-decimal coordinates with a full
   * double, which no general rule about rounding could produce.
   */
  readonly rawEnd?: boolean
  /**
   * …**AND THE SAME IS TRUE OF THE START**, for the same reason one line up: `linestartx`
   * is `roundNumber`ed only inside `if (params.anchor1)`, so a bracket CARRIED onto a new
   * system writes its left edge — the voice's own `startx + 10` — raw. Invisible on
   * screen, where that is `15 + 10 + …` and rounds to itself; in print it is
   * `90.66666666666667 + 10`. See `rawEnd`.
   */
  readonly rawStart?: boolean
  /**
   * A GLISSANDO's squiggle count and the slope its zig-zag is sheared by — `numSquigglies`
   * and `drawSquiggly`'s `slope` (`draw/glissando.js:42-71`). Present only on a glissando,
   * and the emitter writes abcjs's path from them rather than a straight rule.
   */
  readonly squiggles?: number
  readonly slope?: number
  /**
   * **WHERE THIS BEAM WAS ADDED TO THE VOICE**, as an element index — because
   * `voice.beams` is drawn in ADD order and a grace beam and an ordinary one are added at
   * different moments. `createBeam` calls `createNote` for every member first (and each of
   * those pushes its own grace beam, `abstract-engraver.js:537`) and only then
   * `voice.addBeam(beamelem)` (`:426`). So an ordinary beam is added at its group's LAST
   * element and a grace beam at its own.
   */
  readonly beamAt?: number
  /**
   * The element this was `addOther`'d at — a HAIRPIN and a GLISSANDO take their class
   * counters from there, like everything else in `otherchildren`. See `markerAt`.
   */
  readonly atElement?: number
  /**
   * Drawn but NOT counted in the staff's vertical extent.
   *
   * A PHASE distinction, not a drawing one. abcjs accumulates `staff.top` from the children
   * an element has when the engraver builds it; anything added later, in the LAYOUT phase,
   * pushes `abselem.top` and arrives too late to move the staff. A BEAMED grace group's
   * stems are built in `createStems` and are exactly that — measured on `{efg}CD`, whose
   * element top reaches pitch 16 while its staff top stays at the G clef's 13.72 and its
   * top line does not move by a single pixel from the same tune with no graces at all.
   */
  readonly noReserve?: boolean
}

/**
 * **ONE ROW OF abcjs's `TopText` / `BottomText`, IN ITS ORDER.** Those two build a
 * `rows` array interleaving `{move: n}` with a text row and, in the bottom block, a group's
 * open and close (`creation/elements/top-text.js`, `bottom-text.js`); `nonMusic` walks it
 * spending each `move` on the page's own cursor (`draw/non-music.js`).
 *
 * It is abcjs's INTERMEDIATE shape rather than its answer — the drawing takes the same
 * information off `texts` and `advances` — and it exists here because `tune.topText` and
 * `tune.bottomText` are PUBLIC (`engraver-controller.js:222`, `:236`) and a host reads them.
 * Recording the ORDER is the whole point: `texts` and `advances` are two parallel arrays and
 * nothing else in the engine needs to know how they interleave.
 */
export type MetaTextRow =
  | { readonly move: number }
  /**
   * **A `%%sep`'s OWN ROW** — `{separator: lineLength, absElemType: "separator"}`
   * (`elements/separator.js:5`). Only a nonMusic LINE can carry one; neither text block
   * ever pushes it.
   */
  | { readonly separator: number }
  | { readonly startGroup: string; readonly klass: string; readonly name: string }
  | { readonly endGroup: string; readonly absElemType: string; readonly name: string }
  | {
      readonly text: PlacedText
      readonly font: AbcFontType
      /**
       * **`params.marginLeft`, BEFORE ANY BOX MOVED IT.** `addTextIf` writes
       * `left: params.marginLeft` into the row (`add-text-if.js:12`) and `renderText`
       * adjusts `hash.attr.x` by the padding only when it DRAWS (`draw/text.js:57`), so a
       * boxed row's `left` is still 15 while its text is at 16.2. `PlacedText.x` carries the
       * shifted one, and recovering the margin by subtracting the padding back is not the
       * same double — so it travels.
       */
      readonly left: number
    }

export interface PlacedText {
  readonly text: string
  /** What this text is. Absent means it inherits its element's kind. */
  readonly role?: PartRole
  /**
   * abcjs's `data-name` for this row — `title`, `subtitle`, `composer`, `author`,
   * `rhythm`, `part-order`, `free-text`, `header`. Its `addTextIf`/`richText` take a
   * `name` per row (`top-text.js`, `free-text.js:11`) and every top-text row carries one,
   * where `role` here is a single `title` for the whole block.
   */
  readonly dataName?: string
  /**
   * **A RUN OF ROWS INSIDE ITS OWN `<g data-name="…">`.** `addMultiLine`'s ARRAY branch
   * opens one — `rows.push({ startGroup: groupName, klass, name })` — where its string
   * branch does not (`bottom-text.js:37-62`). `W:` is the only field that reaches it: it
   * is the one `simplifyMetaText` does NOT join into a single string, so `notes` and
   * `history` take the string branch and wear no group at all.
   *
   * Consecutive rows carrying the same name are ONE group; the emitter closes it when the
   * name changes.
   */
  readonly groupName?: string
  /**
   * Which `startGroup` this row belongs to, where the NAME alone cannot say.
   *
   * `openGroup` is passed `row.name`, so `notes` and `history` both open a
   * `<g data-name="description">` and the two are ADJACENT — a run detector keyed on the
   * drawn name would merge them into one. abcjs's own key is the `startGroup` string.
   */
  readonly groupId?: string
  /**
   * Which nonMusic LINE of the tune's own top block this row belongs to, if any.
   *
   * abcjs closes `abcjs-meta-top` after the title rows and opens ONE
   * `<g class="abcjs-non-music">` per nonMusic line (`draw/draw.js:12-58`), so two
   * consecutive `%%text` directives are two sibling groups rather than one — measured on a
   * control through abcjs with `--add-classes`. It also runs `classes.incrLine()` for each,
   * which is why the staff after two of them is `abcjs-l2` and not `abcjs-l0`.
   */
  readonly nonMusicIndex?: number
  /** Which voice ON THIS STAFF this belongs to — see `PlacedLine.voice`. */
  readonly voice?: number
  /**
   * **abcjs's `row.absElemType`, WITH THE `abcelem` IT IS WRAPPED WITH.** `nonMusic` calls
   * `selectables.wrapSvgEl({el_type, name, startChar, endChar, text}, el)` for exactly the
   * rows that carry one (`draw/non-music.js:24-30`, `:38-45`); every other row draws and
   * is not clickable.
   *
   * **ABSENT IS THE COMMON CASE, AND IT IS ABCJS'S OWN SWITCH** — `addTextIf` and
   * `richText`'s STRING branch pass `absElemType` through, while `richText`'s ARRAY branch
   * pushes its phrases with none at all (`rich-text.js:18-28`), so a title that changed
   * font mid-line is drawn and cannot be selected.
   *
   * `startChar`/`endChar` come from `metaTextInfo.<field>` — see `ScoreMetadata.fieldRanges`
   * — and the two constants are abcjs's own: `-1` where the row is given no `info`
   * (`bottom-text.js:61`) and `-2` where `addTextIf` fills one in (`add-text-if.js:8`).
   */
  readonly selectable?: {
    readonly elType: string
    /**
     * **ABSENT IS NOT `-2`.** `addTextIf` defaults a missing `info` to `{-2, -2}`
     * (`add-text-if.js:8`), so every TOP-block row has a number; `Subtitle` and `FreeText`
     * read `info.startChar` off the line object directly (`subtitle.js:7`,
     * `free-text.js:11`) and a `%%center` has none at all — `addCentered` pushes
     * `{text: [...]}` with no span (`tune-builder.js:318-320`). abcjs then writes
     * `startChar: undefined` into the `abcelem`, which is a key that is not there.
     */
    readonly startChar?: number
    readonly endChar?: number
    /** `""` on a group-CLOSING row, whatever the group drew; the row's own text otherwise. */
    readonly text?: string
    /**
     * The record belongs to the CLOSE of this row's `groupName` group rather than to the
     * row itself — `addMultiLine`'s `{endGroup, absElemType}` (`bottom-text.js:61`), which
     * `nonMusic` wraps around the closed `<g>` and not around any text.
     */
    readonly onGroupClose?: boolean
  }
  /**
   * The RECT a `%%…box` font draws round this row — see the part-order branch of
   * `topTextBlock`. Present only when the font asked for one; the emitter turns it into
   * abcjs's four filled rules and wraps the pair in a group.
   */
  /**
   * The FACE a `%%…font` named, when it is not the type's default. abcjs writes the
   * directive's own string into `font-family` (`parse/abc_parse_directive.js:22-44`).
   */
  readonly face?: string
  /**
   * `getBBox()`'s width and height for this row, present only when its font asked for a
   * BOX. The emitter lays abcjs's four rules out from them AFTER the lanes have moved the
   * row's y, which is why the size travels rather than the rect.
   */
  readonly boxSize?: { readonly width: number; readonly height: number }
  /**
   * `renderText`'s `centerVertically` (`draw/text.js:29-30`, `:77-79`), and it decides TWO
   * things rather than one.
   *
   * The half every site here already models is the BASELINE: a centred row does NOT take
   * `hash.attr.y += hash.font.size`, so its y goes in as handed. The half nobody carried is
   * the BOX's own top — `deltaY = size.height - padding`, `y: Math.round(y - deltaY)` —
   * which is measured off `getBBox()` where the ordinary branch is `Math.round(y)` and
   * needs no measurement at all. The two disagree by the whole ink height, so `%%voicefont
   * Verdana 17 box` put our rect at 34 against abcjs's 31 with its WIDTH and HEIGHT already
   * exact on both sides.
   *
   * Set it only where a row is BOTH centred and boxable: `fontTypeCanHaveBox`
   * (`abc_parse_directive.js:60`) admits `voicefont` and `annotationfont` and refuses
   * `tripletfont`, so a `%%tripletfont … box` draws no rect and the tuplet number — centred
   * — never reaches this at all.
   */
  readonly centered?: boolean
  /**
   * `renderText`'s `alreadyInGroup` (`draw/text.js:3`, `:50`, `:80`). A BOXED text opens
   * its own `<g fill data-name>` round the text and the rect — but only when the caller is
   * not already inside one. `drawRelativeElement` passes `true` for a `part` label and a
   * `barNumber` and `false` for everything else, so a boxed `P:` gets the rect as a
   * SIBLING of its text inside the element's own group rather than a second group.
   */
  readonly inGroup?: boolean
  /**
   * The rect a `%%…box` row draws — its LEFT EDGE and its two sizes, already rounded as
   * `renderText` rounds them. **Its TOP is not carried**: `rect.y` is `Math.round(y)`
   * where `y` is the same `params.y` the baseline is built from (`draw/text.js:29-30`,
   * `:78`), so the emitter recovers it as `baseline - size - padding` and it travels with
   * the text through every shift. Carrying it cost a mid-tune block 150px, the staff
   * origin the text got and the rect did not.
   */
  readonly boxRect?: {
    readonly x: number
    readonly width: number
    readonly height: number
  }
  /**
   * **A ROW THAT CHANGED FONT MID-LINE IS `richTextLine`'s ELEMENT, NOT `renderText`'s.**
   *
   * `renderText` RETURNS EARLY on `params.phrases` (`draw/text.js:7-10`), before the size
   * is added to the baseline, before any rounding and before the box branch — so the row
   * is drawn AT the cursor with `dominant-baseline="middle"`, carries no `data-name`, and
   * is one `<tspan>` per phrase with its own five font attributes (`svg.js:242-269`).
   *
   * **AND A PHRASE'S OWN SIZE GOES IN RAW.** `getTextSize.calc` applies the `pt -> px` 4/3
   * only when handed a font by NAME; handed a font OBJECT — which is what a `%%setfont`
   * is — it copies `type.size` straight through (`get-text-size.js:24-43`). So
   * `%%setfont-1 cursive 16 bold` draws at 16 beside a `titlefont` at 27. `advanceRich`
   * already measures it that way; this is the drawing half.
   */
  readonly phrases?: readonly {
    readonly text: string
    readonly face: string
    readonly size: number
    readonly bold: boolean
    readonly italic: boolean
  }[]
  /**
   * A rich row's own `largestY` — what `nonMusic` spends for it, and therefore the ink it
   * may claim: `[y, y + rowSpan]`.
   *
   * A RELATIVE span rather than a `reserve`, because the top block is built at its own
   * zero and moved into the staff's frame by shifting `texts.y` alone — an absolute
   * reserve would stay behind. A plain row needs none: its baseline sits one font size
   * below the cursor, so the 0.8 ascent estimate falls inside the block by construction.
   * A rich row is drawn AT the cursor and the same estimate reaches a font size ABOVE the
   * block's top, which dragged `visual-misc-06`'s music down by 14.04px.
   */
  readonly rowSpan?: number
  /**
   * Extra lines of the SAME `<text>`, each a `<tspan dy="1.2em">`. abcjs's `addTextIf`
   * takes a string with `\n` in it and emits ONE element (`add-text-if.js:20-33`), which
   * is how `N:` and `H:` print — its own golden reads
   * `<tspan x="15">Notes:</tspan><tspan x="15" dy="1.2em">…`.
   */
  readonly extraLines?: readonly string[]
  /**
   * **A LYRIC THAT SINGS ABOVE THE STAFF** — `%%vocal above`, or any other positioning
   * directive at all, because `RelativeElement`'s `case "lyric"` tests `opt.position ===
   * 'below'` and abcjs's `position` is `elem.positioning ? elem.positioning.vocalPosition
   * : 'below'` (`relative-element.js:57-63`, `abstract-engraver.js:776`). See `noteText`.
   *
   * It changes BOTH sides of the arithmetic: the height goes to `lyricHeightAbove` rather
   * than `lyricHeightBelow`, which is the FIRST rung of the above ladder
   * (`set-upper-and-lower-elements.js:31`), and its placement takes neither
   * `spacing.vocal` nor the per-voice drop — `element.top = element.bottom =
   * positionY.lyricHeightAbove`, with none of the below branch's three extra terms
   * (`:238-247`).
   */
  readonly lyricAbove?: true
  /** `dominant-baseline="middle"`, which abcjs sets on the bottom block's multi-line rows. */
  readonly middleBaseline?: boolean
  /**
   * Vertical extent this text DECLARES, replacing the box its font size implies — the
   * same escape a glyph has. `[top, bottom]` in staff spaces.
   *
   * A text DECORATION is the case: abcjs gives `D.C.` and its like a flat
   * `thickness: 3` (`decoration.js:151`), so it reserves `pitch ± 1.5` and not the font
   * size its letters occupy. Reserving the letters put `frere-jacques`'s last staff 2.08
   * pitch high.
   */
  readonly reserve?: readonly [number, number]
  /**
   * The TOP edge of that reserve in abcjs's own PITCH, where the producer knows it.
   *
   * `calcHeight` sums `staff.top` in pitch and multiplies by `STEP` once, so recovering
   * the pitch by dividing the y back is a different double — see `verticalExtent` and
   * `PlacedGlyph.reservePitch`. A CHORD SYMBOL is the case: `incTop` sets `staff.top` and
   * `positionY.chordHeightAbove` to the SAME pitch and the mark is drawn AT it
   * (`set-upper-and-lower-elements.js:104-110`), so abcjs never re-derives the staff's top
   * from the chord's baseline. Ours did, and `visual-transpose-05`'s root `height` printed
   * `143.15373506324653` against abcjs's `…56` on that one round trip.
   */
  readonly reserveTopPitch?: number
  /**
   * The BOTTOM edge of that reserve in abcjs's own PITCH — the mirror of
   * `reserveTopPitch`, and for the same reason: `staff.bottom -= chordHeightBelow` is a
   * PITCH subtraction (`set-upper-and-lower-elements.js:88-96`), so a reserve stated in
   * pixels and divided back is a different double. One ULP of the root `height`, which is
   * all `abcts-ledger-gaps-3` tune 1 has ever differed by.
   */
  readonly reserveBottomPitch?: number
  readonly x: number
  /** Baseline y, staff spaces. */
  readonly y: number
  /** Font size in staff spaces. */
  readonly size: number
  readonly bold: boolean
  readonly italic: boolean
  /**
   * **AN ENDING AND A TRIPLET ARE EACH A `<g>` HOLDING ONE PATH AND THIS TEXT.**
   * `drawEnding` and `drawTriplet` both `openGroup`, emit every bracket segment as ONE
   * `printPath`, add the number, and close (`draw/ending.js:27-50`,
   * `draw/triplet.js:7-13`). We drew a line per segment at the voice's own level, so a
   * two-ending system read as eight rows of the contract where abcjs has six.
   *
   * `group` is which bracket this belongs to; the LINES carrying the same `group` are its
   * segments. `groupClass` is the stem handed to `classes.generate`, and `measure` the
   * counter to generate it at — see `Classes.generateAt`.
   */
  readonly group?: number
  readonly groupClass?: string
  readonly measure?: number
  /** …or the ELEMENT whose counters it takes, when only the emitter knows them. */
  readonly measureElement?: number
  /** Its class is generated TWICE, so the counters appear twice — see the decoration text. */
  readonly doubleClass?: boolean
  /**
   * Which `%%…font` this text is drawn in.
   *
   * abcjs writes a `<text>` with the font's FACE, weight and style spelled out — a lyric
   * is `Times New Roman` bold, a chord symbol `Helvetica` normal, a tuplet number plain
   * `Times` italic (`parse/abc_parse_directive.js:22-44`) — so the emitter needs the TYPE
   * and not just the already-resolved size and bold/italic. `noClass` is `renderText`'s
   * trailing argument, which omits the `class` attribute rather than writing it empty.
   */
  readonly font?: AbcFontType
  readonly noClass?: boolean
  /**
   * **abcjs's MISSING-GLYPH MARKER**, and the one text in the music that is neither a
   * field nor a directive: `printSymbol` answers `null` for a name its table does not
   * hold and draws `"no symbol:" + symbol` in its place, `type: "debugfont"` — Arial 16,
   * `stroke="#ff0000"`, underlined (`draw/print-symbol.js:27`, `:45`, `draw/text.js:32`).
   *
   * It is reachable from valid ABC because abcjs's own tempo table names a glyph that
   * does not exist — see `tempoNoteGlyph`'s `missingFlag` — so reproducing it is part of
   * strict parity rather than a debugging aid of ours.
   *
   * ⚠️ **ITS y IS THE STAFF'S ORIGIN, NOT ITS ELEMENT'S.** `renderText` is handed
   * `renderer.y`, which `drawStaffGroup` set to `staff.absoluteY` and which no part of the
   * tempo mark's own placement touches — so the marker stays put while the mark it belongs
   * to floats above the staff. In our frame that origin is y 0, which is the same fact
   * `anchorAboveStaff`'s tempo branch already uses for the notehead.
   */
  readonly debug?: boolean
  /**
   * **THE PAGE'S OWN y, FOR A TOP-TEXT ROW** — what abcjs writes, accumulated FORWARD from
   * `padding.top` (`draw/draw.js:14-15`). Our layout frame is the first staff's, and the
   * block is back-fitted above it, so the same point arrives as three terms in a different
   * order; the emitter prefers this one where it exists. The local `y` stays, because the
   * staff's EXTENT is measured in the staff's frame.
   */
  readonly pageY?: number
  /**
   * How many of the block's `advances` had been spent when this row was built, and what it
   * then adds to reach its BASELINE.
   *
   * `nonMusic` moves the page's own cursor one row at a time and `renderText` writes
   * `hash.attr.y = y; hash.attr.y += hash.font.size` (`draw/non-music.js:10`,
   * `draw/text.js:28-30`). The TOP block is built at the page cursor already; a MID-TUNE
   * block is built from zero and offset into a staff's LOCAL frame, so its baseline came
   * out `staffOrigin + (offset + local) + size` where abcjs has `(cursor + row) + size` —
   * `S5-directives` X:502's `%%text` printed `179.01` for abcjs's `179.02`, both engines
   * agreeing on the cursor at `158.01500000000001`. The page walk spends that same list, so
   * these two let it stamp `pageY` as abcjs's own two adds.
   *
   * ponytail: `rowExtra` is one number where the build is `((y + size) + index * step) +
   * pad`. They are the same double for every row in either corpus — `index` is 0 and there
   * is no box — and differ in the last bits for a boxed multi-row block. Split it if one
   * turns up.
   */
  readonly advanceAt?: number
  readonly rowExtra?: number
  /**
   * Horizontal alignment. Absent means `start`, which is every text the music draws —
   * only the top-text block centres a title or right-aligns a composer.
   */
  readonly anchor?: 'start' | 'middle' | 'end'
  /**
   * `%%jazzchords`' split of this chord symbol — root, modifier, `/bass`.
   *
   * Present only on a `chord` role under the directive, so an ANNOTATION never carries one:
   * abcjs runs `translateChord` on chord symbols and skips annotations outright
   * (`add-chord.js:45-46`). The modifier and the bass draw as `font-size:0.7em` tspans
   * nested in the chord's own, and each one the generator sees adds a whole LINE to the
   * measured height. See `Score.jazzChords`.
   */
  readonly jazz?: readonly [string, string, string]
  /**
   * `%%<type>font … box` — the text's own font is boxed, so `getTextSize` returns
   * `height + padding * 4` for it (`helpers/get-text-size.js:46-48`). Carried on a chord
   * symbol because its LANE is measured from that height — and on a LYRIC for the same
   * reason, since `%%vocalfont … box` widens the staff below it.
   */
  readonly box?: boolean
}

export interface LayoutElement {
  readonly type: ElementType
  /**
   * **THE MODEL EVENT THIS WAS BUILT FROM, AND THE CLEF IT WAS DRAWN UNDER** — a
   * reference, carried for the compat layer's `abcelem` and read by NOTHING in layout or
   * in the emitter.
   *
   * abcjs's selectable array holds `absEl.abcelem`, the very parse element `tune.lines`
   * holds, so the two agree by identity. Ours are separate objects and something has to
   * join them: pairing them POSITIONALLY — the k-th drawn note against the k-th event of
   * the k-th voice — breaks the moment `%%score` reorders the staves or an `&` overlay
   * becomes a voice of its own, both of which this engine already does. A reference
   * cannot break that way.
   *
   * The CLEF comes with it because abcjs's `verticalPos` is `pitch - mid`
   * (`tune-builder.js:918`) and `mid` is the staff's own middle line, which the event
   * does not know.
   */
  readonly sourceEvent?: MusicEvent
  readonly sourceClef?: Clef
  /**
   * The same join for everything that is not an event: a BARLINE by its own span, and the
   * clef, key, meter and tempo by the model object each was built from.
   *
   * A barline carries a RANGE rather than an object because the projection already builds
   * one element per barline and keys them by where they were written; the staff furniture
   * carries the object, because abcjs hangs its clef, key and meter on the STAFF rather
   * than putting them in the voice's stream.
   */
  readonly sourceRange?: SourceRange
  readonly sourceKey?: KeySignature
  readonly sourceMeter?: Meter
  readonly sourceTempo?: Tempo
  readonly sourcePartLabel?: string
  /**
   * `durationClass` and abcjs's own PITCH NUMBERS, carried for the `add_classes` markup and
   * for nothing else — `klass += ' d' + Math.round(durationClass*1000)/1000` then one
   * `' p' + pitch` per pitch (`write/draw/absolute.js:31-40`).
   *
   * They are on the ELEMENT rather than derived in the writer because neither can be
   * recovered from the drawing: `durationClass` is the SOUNDING duration (a triplet eighth
   * is 1/12, not 1/8, and nothing drawn says so), and abcjs's pitch is ABSOLUTE — 0 is
   * middle C whatever the clef — where a glyph's y is a staff POSITION and would need the
   * clef read back out of it.
   */
  readonly durationClass?: number
  /**
   * What a BEAM starting here classes on, when that is not `durationClass`.
   *
   * `BeamElem` takes `firstElement.duration` and multiplies by `tripletMultiplier` only
   * when that element STARTS the triplet (`elements/beam-element.js:31-36`), and abcjs's
   * `abcelem.duration` is the NOTATED value: `ABCJS_BDUR` prints `firstDuration 0.125 …
   * mult 0.667 -> 0.083` for a triplet eighth that opens one. So a member that opens the
   * tuplet classes SOUNDING and one that does not classes NOTATED — which is why
   * `S8-layout-classes-tune9`'s beam is `abcjs-d0-125` and not `d0-083`.
   *
   * Only a tuplet member carries it. Making `durationClass` itself notated was tried and
   * took the gate from 18 to 23: a NOTE's own `d` class is not the same quantity.
   */
  readonly tupletStartDuration?: number
  readonly abcjsPitches?: readonly number[]
  /**
   * **`!mark!` PAINTS THE WHOLE ELEMENT GREEN AND NAMES IT.** `stackedDecoration` sets
   * `abselem.klass = "mark"` (`creation/decoration.js:267-268`) and `drawAbsolute` closes
   * with `if (params.klass) setClass(params.elemset, "mark", "", "#00ff00")`
   * (`draw/absolute.js:68-69`), which writes the group's `fill` — or whatever attribute
   * its `highlight` names — and APPENDS the class.
   *
   * The class lands LAST in the attribute order because `setAttribute` runs after the
   * group was built, which is the same rule a notehead's late class already follows.
   */
  readonly marked?: boolean
  /**
   * `!class=name!` — appended to the element group's generated class by
   * `endGroup(klass, name, extraClass)` (`draw/group-elements.js:45-59`). See
   * `Note.extraClass`.
   */
  readonly extraClass?: string
  /**
   * Total height, for an element that is a BLOCK rather than a mark — only the top text.
   * abcjs advances its cursor by a rounded line height per row, which is more than the
   * last row's descender, so the block cannot be measured from its texts after the fact.
   */
  readonly blockHeight?: number
  /** A MID-TUNE block: it sits straight on the music, spending no `musicSpace`. */
  readonly blockAbutsMusic?: boolean
  /**
   * Absolute y of a block's TOP — its cursor origin, above the first line's ink.
   *
   * abcjs's block starts at the cursor and its first baseline is a font size below that,
   * so the space above the title's ascender is part of the block and must be reserved.
   * Without this the page began at the title's INK and every drawing sat 13.3px high.
   */
  readonly blockTop?: number
  /** Left edge, staff spaces from the system origin. */
  readonly x: number
  readonly width: number
  /**
   * The two halves `width` is the maximum of, for an element that stretches.
   *
   * abcjs advances by `max(rod, spacing * sqrt(duration * 8))` — a ROD, the element's own
   * ink plus its `minspacing`, and a SPRING, the duration advance
   * (`layout/voice-elements.js`: `x = Math.max(voice.minx, voice.nextx)`). Justification
   * scales the spring and leaves the rod alone, which is why a line cannot be stretched by
   * multiplying it: the winner can change as the factor moves, so the total width is
   * piecewise-linear in the factor and abcjs re-solves it up to 8 times.
   *
   * Absent on anything that does not stretch — a barline, a clef, a key signature. Those
   * are all rod, and `width` is it.
   */
  readonly spring?: number
  readonly rod?: number
  /** The `getMinWidth` half of `rod`, where the two are a sum — see `Advance.width`. */
  readonly rodWidth?: number
  /**
   * abcjs's `getMinWidth(child)` when it is NOT the drawn ink — which is a BARLINE and
   * only a barline. `createBarLine` gives a thin bar a `RelativeElement` of width 1 and
   * paints a 0.6px rect (`ENGRAVE.barLayoutWidth`), so a host reading `elem.w` off
   * `makeVoicesArray` is told 1. Set where `barWidthOf` is spent, so the two cannot drift.
   */
  readonly minWidth?: number
  /**
   * abcjs's `roomtaken` AS IT STOOD WHEN `createDecoration` WAS CALLED — the accidental
   * columns plus the graces, with the double-count `roomAfterGraces` reproduces. Only
   * `!slide!` reads it: its two blanks hang at `-roomtaken - 15` and `-roomtaken - 5` off
   * the element (`decoration.js:51-59`), so a slide on a note that carries an accidental
   * starts that much further left than one on a bare note.
   */
  readonly slideRoom?: number
  /**
   * abcjs's `restpitch` for this rest — 7, or 11 when the stems are up and 3 when they are
   * down (`abstract-engraver.js:549-560`).
   *
   * The BEAM reads it: `BeamElem.add` takes every element the group covers and a rest's
   * `minpitch`/`maxpitch` ARE `restpitch`, so an invisible rest inside a beamed run lifts
   * or drops the whole beam. See `Rest.beamGroup`.
   */
  readonly restPitch?: number
  /**
   * How far the element's ink reaches LEFT of its own x — abcjs's `-child.extraw`.
   *
   * An accidental, a grace group or a barline's clearance sits before the thing that
   * names the element, and none of it advances the cursor: the gap the spring already
   * opened absorbs it. It pushes only when there is not enough room, which is abcjs's
   * `if (er < extraWidth) x += extraWidth - er`.
   */
  readonly left?: number
  /**
   * Staff steps of every notehead, ascending — 0 is the middle line, positive upward.
   * Empty for anything unpitched.
   *
   * ALL of them, not just the lowest, because this is what makes the structural gate
   * meaningful and a chord has more than one. Reporting a single step would leave every
   * upper notehead of every chord unverified while the suite reported MATCH — the exact
   * shape of the blind spot the parser audit found.
   */
  /**
   * abcjs's `rest.type === 'rest'` — an ORDINARY rest, which is narrower than "a rest".
   * `fixVoiceCollisions` weeds on exactly this, so it excludes the invisible ones AND a
   * measure-filling rest, which `createNote` has already retyped `whole`
   * (`abstract-engraver.js:811-813`), AND a multi-measure one. Absent on anything else.
   */
  readonly plainRest?: boolean
  /** `isNonSpacerRest` — advances the `n` class counter. See the rest's own note. */
  readonly nonSpacerRest?: boolean
  /**
   * A `whole` or `multimeasure` rest — the two `centerWholeRests` moves to the midpoint
   * between its neighbours (`layout/layout.js:123-138`).
   */
  readonly wholeRest?: boolean
  /**
   * Which way this note's stem points — **even when no stem is DRAWN.**
   * `createNoteHead` assigns `notehead.stemDir = dir` before it returns
   * (`create-note-head.js:36`), so a whole note carries a direction like any other and
   * every rule that reads one — a tie's side, a slur's — gets a real answer. Ours derived
   * it from the drawn lines, so a whole note read as STEM DOWN and its tie went to the
   * wrong side of the staff on every fixture that has one.
   */
  readonly stemUp?: boolean
  readonly staffSteps: readonly number[]
  readonly glyphs: readonly PlacedGlyph[]
  readonly lines: readonly PlacedLine[]
  readonly texts: readonly PlacedText[]
  /**
   * Where a REPEAT ENDING's bracket attaches to this barline, as offsets from `x`.
   *
   * abcjs hangs an `EndingElem` on a `RelativeElement` that the barline cursor happens to
   * be holding — not on the bar element and not on the music. `EndingElem(text, anchor,
   * null)` takes whatever `anchor` is when `startEnding` is seen, which is after the whole
   * cursor walk, so it is the LAST rule; `partstartelem.anchor2 = anchor` fires on
   * `endEnding`, which sits between the thick and the second thin, so it is the thick if
   * there is one and the first thin otherwise (`abstract-engraver.js:1017`, `:1040`).
   *
   * `drawEnding` then opens at `anchor1.x + anchor1.w` and closes at `anchor2.x` — the
   * right edge one way and the left edge the other, which is why the two offsets are not
   * the same quantity (`draw/ending.js:13-22`).
   *
   * AND THE `w` IS THE ANCHOR'S, NOT THE RULE'S DRAWN THICKNESS. abcjs builds a thin rule
   * as `new RelativeElement(null, dx, 1, 2, {linewidth: 0.6})` — declared width 1, painted
   * 0.6 — and a thick one as `(null, dx, 4, 2, {linewidth: 4})`. Only the thick pair agree.
   */
  readonly endingStart?: number
  readonly endingEnd?: number
}

/**
 * Everything a beam needs to know about one of its members, recorded during layout so
 * the beam pass does not have to reverse-engineer it out of the drawn lines.
 */
export interface StemInfo {
  /** Index into the system's `elements`. */
  readonly element: number
  readonly x: number
  /**
   * Left edge of the FURTHEST head — `heads[0]` going up, `heads[len-1]` going down, which
   * is abcjs's `furthestHead` (`layout/beam.js:113`). A beamed stem is not the unbeamed one
   * with a new endpoint: `createStems` builds a fresh one off this head, so the beam pass
   * needs the head, not the stem we drew before we knew.
   */
  readonly headX: number
  /** That head's ink width — abcjs's `furthestHead.w`. */
  readonly headWidth: number
  /**
   * `!beambr1!` / `!beambr2!` — how many beam levels this note BREAKS, from the decoration
   * of the same name. It splits the auxiliary beam at that level and below
   * (`layout/beam.js:193-203`).
   */
  readonly beambr?: number
  /**
   * That head's own `dx` WITHIN its element — a seconds displacement plus the voice-overlap
   * shift — carried separately because `createStems` counts it TWICE.
   *
   * `dx = (asc ? furthestHead.w : 0); if (!isGrace) dx += furthestHead.dx; var x =
   * furthestHead.x + dx` (`layout/beam.js:117-121`) — and `furthestHead.x` is already
   * `parent.x + furthestHead.dx`, so the `x` handed to `getBarYAt` is one displacement
   * further right than the stem it then draws. Zero on a plain note, and a whole notehead
   * on a displaced one.
   */
  readonly headDx: number
  /** Staff step of the notehead furthest along the stem — where the tip is measured from. */
  readonly farStep: number
  /**
   * Mean staff step of this event's noteheads — abcjs's `abcelem.averagepitch`.
   *
   * A CHORD contributes its own mean rather than each notehead, which is what the beam's
   * slant is measured from (`calcSlant` takes the first and last elements' averages).
   */
  readonly averageStep: number
  readonly up: boolean
  /** Beams needed at this note: 1 for an eighth, 2 for a sixteenth. */
  readonly beams: number
  /**
   * A REST inside the run — in the group for `min`/`max`, skipped by `createStems`
   * (`layout/beam.js:112`). See `Rest.beamGroup`.
   */
  readonly rest?: boolean
}

/**
 * A slur or tie: a lens-shaped curve, thin at the ends and thicker in the middle.
 *
 * Stored as endpoints plus a signed bulge rather than explicit control points, because
 * everything downstream wants the shape rather than the spline — the SVG backend derives
 * the two cubics, and a future canvas backend would derive its own.
 */
export interface PlacedCurve {
  /** Which voice ON THIS STAFF this belongs to — see `PlacedLine.voice`. */
  readonly voice?: number
  /**
   * `.-` / `.(` — a DOTTED tie or slur. abcjs draws it as the outward half ALONE, stroked
   * with `stroke-dasharray="5 5"` and `fill: none`, and adds `dotted` to its class
   * (`draw/tie.js:89-95`). Everything else about the arc is identical, which is why this is
   * a flag on the curve rather than a second shape.
   */
  readonly dotted?: boolean
  /**
   * **THE ORDER THE `(` WAS READ IN**, for two curves that OPEN on the same element.
   *
   * A slur is `addOther`'d at its open, so `otherchildren` orders it by its opening x —
   * but `((` puts two slurs on one element, and abcjs's `for (i = 0; i < elem.startSlur
   * .length; i++)` then adds the OUTER one first (`abstract-engraver.js:942-950`). Ours
   * emits at CLOSE time, which is inner-first, and no x can tell them apart:
   * `(([GCD]G)[GCD]G)` writes the two arcs the wrong way round.
   */
  readonly openSeq?: number
  /**
   * **THIS HALF WAS `addOther`'d AT THE TOP OF ITS LINE**, and leads everything on it.
   *
   * A curve crossing a system break is REBUILT for the new line — `for (var slur in
   * this.slurs) … this.slurs[slur] = new TieElem(…); voice.addOther(this.slurs[slur])`,
   * before the line's own elements are walked (`abstract-engraver.js:236-242`). So its
   * place in `otherchildren` is first, whatever x it ends up at.
   *
   * An UNPAIRED half is the opposite: it is built where the mark was read, mid-line, and
   * takes its place from its own anchor. Both have no `startElement`, which is what the
   * emitter used to key on — so `[(CE)G]`'s two halves came out the wrong way round.
   */
  readonly carried?: true
  /**
   * How far this curve's start was moved onto its OWN notehead, to be taken back off for
   * the DRAW ORDER.
   *
   * `otherchildren` goes out in creation order, which the emitter reproduces by sorting on
   * the anchor's x. A chord's ties are all created at ONE element, in pitch order, and on a
   * SECOND one of their heads is displaced by a notehead width — so keying on the moved x
   * puts that tie last where abcjs writes it first. `ragtime-nightingale`'s
   * `[…]` at 442.2 has three, and abcjs's order is 452.01, 442.2, 442.2.
   */
  readonly orderShift?: number
  /**
   * **WHICH HEAD OF THE CHORD THIS CURVE WAS CREATED ON**, which is the order they go out
   * in when several share one element.
   *
   * `addSlursAndTies` runs INSIDE the pitch loop and `addOther`s this head's tie and then
   * this head's slur before the next head is reached (`abstract-engraver.js:728`,
   * `:873-925`). So `([CEG]2-[CEG]2)` writes tie, SLUR, tie, tie — the slur second,
   * because a chord's slur hangs on the head the stem does not (`:690-717`) and that is
   * head 0 with the stem up. Sorting on x alone put every tie first, which is
   * indistinguishable until a slur and a tie open on the same chord.
   */
  readonly headOrder?: number
  /**
   * **A GRACE GROUP'S CURVES GO OUT IN THE GROUP'S OWN ORDER, KEYED AT THE MAIN NOTE.**
   *
   * `addGraceNotes` walks the group once, and the AUTOMATIC grace slur is `addOther`'d at
   * the END of grace 0's iteration — after that grace's own tie and slur, before grace 1's
   * (`abstract-engraver.js:497-540`). So `{a-a-a}` writes tie, SLUR, tie: an order no key
   * built from each curve's own x can produce, because the slur reaches the main head and
   * the ties do not.
   *
   * `groupX` is the x every curve of the group sorts at — the auto slur's own far end,
   * which is where the emitter already had that one — and `graceSeq` orders them within.
   */
  readonly graceSeq?: number
  /** See `graceSeq`. */
  readonly groupX?: number
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  /** Height of the arc at its midpoint. NEGATIVE arcs upward, matching y-down. */
  readonly bulge: number
  readonly midThickness: number
  /** A tie joins one pitch to itself; a slur spans a phrase. They differ in shape rules. */
  readonly kind: 'tie' | 'slur'
  /**
   * **A CURVE'S CLASS NAMES THE NOTES IT JOINS** —
   * `abcjs-start-m0-n0 abcjs-end-m0-n3`, built from
   * `anchor.parent.counters.measure`/`.note` (`draw/tie.js:6-20`), the counters each
   * anchor's own GROUP was named with. These are the anchors' element indices on the
   * staff; the emitter is where the counters live. Absent when a system break split the
   * curve and one end has no anchor on this line — abcjs writes `abcjs-start-edge` /
   * `abcjs-end-edge` for exactly that.
   */
  readonly startElement?: number
  readonly endElement?: number
}

export interface LayoutStaff {
  /**
   * Everything drawn on this staff, in drawing order — the concatenation of `voices`.
   *
   * Most consumers want this: a renderer does not care which voice a stem belongs to.
   */
  readonly elements: readonly LayoutElement[]
  /**
   * The same elements, still split BY VOICE.
   *
   * A staff is not a voice — `%%score {1 (2 3)}` prints voices 2 and 3 on one staff — so
   * the flat list above cannot answer "what did voice 0 draw". abcjs keeps the same split
   * (`staffGroups[].voices[]`) and so does abcMusicKit v1 (`StaffDef.numVoices`), because
   * the answer is needed for stem-direction convention within a shared staff, and by any
   * gate comparing one voice against a reference.
   *
   * These hold the SAME element objects as `elements`, not copies.
   */
  readonly voices: readonly (readonly LayoutElement[])[]
  /**
   * `%%voicecolor`, one entry per `voices` entry — `null` for the host's own foreground.
   *
   * Held HERE rather than stamped on each element because it is `drawVoice`'s swap:
   * `if (params.color) renderer.foregroundColor = params.color` … `renderer.foregroundColor
   * = saveColor` (`draw/voice.js:14-16`, `:93`). Everything drawn between those two lines
   * takes it, which is exactly what the emitter's `flushVoice` spans. See `Voice.color`.
   */
  readonly voiceColors?: readonly (string | null)[]
  readonly staffLines: readonly PlacedLine[]
  /**
   * How many lines `staffLines` was built from — `V:… stafflines=`, 5 unless stated.
   *
   * Kept alongside the drawn rules because `staffLines` cannot be counted back: a
   * `stafflines=1` staff and a `stafflines=0` one both have a length a consumer would
   * misread, and the count is what a host asking "is this a rhythm staff" wants.
   */
  readonly staffLineCount: number
  /**
   * Beams, which belong to no single element — a beam spans several noteheads and is
   * drawn once for the group, after every member's position is known. Per staff, since
   * a beam never joins two voices.
   */
  readonly beams: readonly PlacedLine[]
  /**
   * Slurs and ties, which like beams belong to no single element — each spans from one
   * notehead to another and is resolved once every member's position is known.
   */
  readonly curves: readonly PlacedCurve[]
  /**
   * Whether a tuplet on this staff reserves abcjs's ending lane ABOVE it — declared by
   * `layoutTuplets` from abcjs's own rule, never from where the bracket was drawn.
   */
  /** A hairpin on this staff — see `StaffFurniture.hasHairpin`. */
  readonly hasHairpin: boolean
  /** Which side the dynamics lane is on. */
  readonly dynamicsAbove: boolean
  readonly tupletReservesAbove: boolean
  /** abcjs's declared box per tuplet on this staff — see `layoutTuplets`. */
  readonly tupletReserves: readonly {
    top: number
    bottom: number
    /** …and the same box in PITCH where the producer knows it — see `layoutTuplets`. */
    topPitch?: number
    bottomPitch?: number
  }[]
  /** abcjs's declared box per tie and slur — see `curveReserves`. */
  readonly curveReserves: readonly CurveReserve[]
  /** Tuplet brackets, and the numbers that go with them. Also span elements. */
  readonly tupletLines: readonly PlacedLine[]
  readonly tupletTexts: readonly PlacedText[]
  /**
   * Melisma extenders — one syllable held across several notes. Non-strict only; strict
   * prints a literal `_` on the syllable instead, as abcjs does.
   */
  readonly melismaLines: readonly PlacedLine[]
  /**
   * Hairpins and glissandi — decorations that SPAN, opened by one note and closed by a
   * later one, so they belong to no single element for the same reason beams do not.
   */
  readonly spannerLines: readonly PlacedLine[]
  /**
   * How far `anchorBelowStaff` moved this staff's BELOW dynamics onto the music's ink.
   * The hairpins share that lane and arrive after the anchoring, so they spend it at the
   * merge — see `anchorBelowStaff`.
   */
  readonly dynamicShift?: number
  /**
   * The same for the ABOVE lane — `createDecoration` puts a staff's dynamics above when the
   * tune SINGS (`creation/decoration.js:379`), and a hairpin takes the same lane as the
   * volume marks beside it. Two numbers because the two passes run at different points and
   * `spannerLines` is empty for both of them.
   */
  readonly dynamicShiftAbove?: number
  /** Repeat-ending (volta) brackets and their labels. Span whole measures. */
  readonly voltaLines: readonly PlacedLine[]
  readonly voltaTexts: readonly PlacedText[]
  /**
   * **`voice.barto`** — `abcstaff.connectBarLines === "continue" || === "end"`
   * (`abstract-engraver.js:148`). TRUE when this staff's barlines run through to the staff
   * ABOVE on every bar rather than only on the voice's last child; see the emitter.
   */
  readonly connectBars: boolean
  /** Vertical offset of this staff's middle line within its system. */
  readonly originY: number
  /**
   * The same origin split into the two terms abcjs spends it in — the system-internal
   * cursor, and the PITCH that one `moveY(spacing.STEP, staff.top)` multiplies. The pitch
   * is 0 where the origin is not one product off a pitch (a heading block, or a clamped
   * staff). See the placement loop.
   */
  readonly originAdvances: readonly number[]
  readonly originPitch: number
  /**
   * This staff's origin on the PAGE — `staff1.absoluteY` (`draw/staff-group.js:26`),
   * built by one running cursor seeded with `padding.top`. The emitter draws from this
   * rather than summing a system origin and a margin, which is the same terms in a
   * different grouping and a different double.
   */
  readonly absoluteY: number
}

/** One brace or bracket, as abcjs states it: a left edge and the two staff lines it joins. */
export interface ConnectorSpan {
  readonly kind: 'brace' | 'bracket'
  /** Which staff of the system it STARTS on — abcjs draws it with that staff's lines. */
  readonly staffIndex: number
  /** …and the last staff it spans, which is also how far its barlines join. */
  readonly through: number
  readonly x: number
  /**
   * **THE VOICE NAME, WHEN THE BRACE OWNS IT RATHER THAN THE STAFF.**
   *
   *     // If only the start brace has a name then the name belongs to the brace
   *     // instead of the staff.
   *     if (this.startVoice.header && !this.endVoice.header) {
   *       this.header = this.startVoice.header;
   *       delete this.startVoice.header;
   *     }
   *
   * (`creation/elements/brace-element.js:9-14`.) `drawBrace` then opens a
   * `<g class="staff-extra voice-name" data-name="brace">`, draws the name at the BRACE's
   * own vertical midpoint, draws the path, and closes (`draw/brace.js:78-98`). The
   * `delete` is what stops the voice drawing it a second time.
   */
  readonly header?: {
    readonly text: string
    readonly size: number
    /**
     * `getTextSize.baselineToCenter(header, "voicefont", 'staff-extra voice-name', 0, 1)`
     * — `height * 0.5 + (total - index - 2) * fontSize` with a total of ONE, so the label
     * is centred on the brace as a block of one (`helpers/get-text-size.js:53-59`).
     * Computed here because the text metrics live in the layout.
     */
    readonly baselineToCentre: number
  }
  /** The first staff's top LINE and the last staff's bottom line, in system coordinates. */
  readonly top: number
  readonly bottom: number
}

export interface LayoutSystem {
  /** One per STAFF, top to bottom. `%%score`'s `( … )` puts several voices on one. */
  readonly staves: readonly LayoutStaff[]
  /**
   * Braces and brackets at the system's left edge, joining the staves of a group.
   *
   * On the SYSTEM rather than a staff, because that is what they span: a brace over a
   * grand staff belongs to neither of its two staves. abcjs draws both — a curvy path for
   * the brace, verified against its rendered SVG — and so does abcMusicKit v1, whose
   * `drawBraces` ports the same element.
   */
  readonly connectorGlyphs: readonly PlacedGlyph[]
  readonly connectorLines: readonly PlacedLine[]
  /** The same connectors as abcjs's own arithmetic — see `ConnectorSpan`. */
  readonly connectorSpans: readonly ConnectorSpan[]
  /**
   * **THE SYSTEM'S OWN ADVANCE, IN PITCH** — abcjs's `staffGroup.height`, which is
   * `Σ (staff.top − staff.bottom)` over the group's voices and is spent as ONE product,
   * `staffGroup.height * spacing.STEP` (`creation/calc-height.js`, `draw/draw.js:79-83`).
   * The staff PLACEMENT is a different accumulation — `moveY(STEP, top)` then
   * `moveY(STEP, -bottom)` per staff — and abcjs's own comment says the two are parallel
   * on purpose. Summing the already-multiplied lengths instead is `Σ(span·STEP)` where
   * abcjs writes `(Σ span)·STEP`, and that is the root's `height` one ULP out.
   *
   * Our inter-staff clamp is in it too, as a pitch, because abcjs's is inside `staff.top`.
   */
  readonly heightPitch: number
  /**
   * `staffs[0].top` and `staffs[last].bottom`, the two PITCHES `addStaffPadding` reads
   * (`draw/draw.js:86-87`). abcjs measures the gap between two systems from their own
   * declared extents and multiplies ONCE — `(nextTopLine + lastBottomLine) * STEP` — so
   * the placement cannot be written off the y's it has already produced without the round
   * trip §3 names.
   */
  readonly firstTopPitch: number
  readonly lastBottomPitch: number
  /** Where the system's ink starts — everything before the first staff's own extent. */
  readonly leading: number
  /**
   * **THE SAME LEAD AS TERMS**, in the order abcjs's `moveY`s spend them: the top block's
   * rows for the first system, a mid-tune nonMusic line's rows for a later one, `[]` for a
   * plain one. `leading` is their SUM and a sum cannot see an order — the page's cursor
   * walks THIS, and `addStaffPadding` is spent after it, which is `draw/draw.js:44-58`
   * exactly. Staff 0's `originAdvances` opens with the same list, so the page and the staff
   * cannot drift apart.
   */
  readonly leadAdvances: readonly number[]
  /** The music's own width, without any prose that overhangs it — see `systemBounds`. */
  readonly musicWidth: number
  /** The separation spent BEFORE this system — see the placement loop. */
  readonly gap?: number
  /**
   * `%%vskip n` — blank space above this system, spent BEFORE the staff padding
   * (`draw/draw.js:44-46`). See `Measure.vskip`.
   */
  readonly vskip?: number
  /** Width of this system, staff spaces. Systems wrap, so they differ. */
  readonly width: number
  /**
   * Vertical offset of this system within the whole drawing.
   *
   * Each system is laid out in its OWN coordinate space and stacked by translation. That
   * keeps every position within a system independent of how many systems precede it, so
   * a break inserted earlier cannot shift the geometry of a later one — which would
   * otherwise churn every baseline below the break.
   */
  readonly originY: number
  /** The same offset on the PAGE — the running cursor, seeded with `padding.top`. */
  readonly absoluteY?: number
}

export interface Layout {
  readonly systems: readonly LayoutSystem[]
  /**
   * **EVERY SYSTEM THAT WAS ENGRAVED, INCLUDING THE ONES `%%maxStaves` STOPS DRAWING.**
   * abcjs lays the whole tune out and stops at the limit in `draw()` (`draw/draw.js:33-38`),
   * so its engraver still stamps `highestVert`, `averagepitch` and `printer_shift` onto
   * every element — including an incipit's hidden lines, which a host reads off
   * `tune.lines` all the same. Identical to `systems` when there is no limit.
   */
  readonly engraved: readonly LayoutSystem[]
  /** Bounding box in staff spaces; the SVG backend applies the scale. */
  readonly width: number
  /**
   * The PAGE, which is the requested staff width plus both margins, raised by any line
   * too stiff to compress to it — abcjs's `maxwidth + padding` (`set-paper-size.js:2`).
   * Never smaller than the requested width, so it is not the same as `width`.
   */
  readonly pageWidth: number
  readonly height: number
  /** y of the topmost content — the SVG backend translates by this. */
  readonly top: number
  /**
   * The title block for a tune with NO MUSIC AT ALL, which has no staff to hang it on.
   * Absent whenever there is a system — the block rides the first staff then, so that its
   * height is part of the extent rather than sitting above y = 0 and being clipped.
   */
  readonly topText?: readonly PlacedText[]
  /**
   * `W:`, `B:`, `S:`, `D:`, `N:`, `Z:`, `H:` — abcjs's `BottomText`, drawn under the last
   * staff in its own `abcjs-meta-bottom` group. y is already in the document's frame.
   */
  readonly bottomText?: readonly PlacedText[]
  /**
   * **abcjs's `TopText.rows` / `BottomText.rows`, IN THEIR ORDER** — see `MetaTextRow`.
   * `tune.topText` and `tune.bottomText` are PUBLIC (`engraver-controller.js:222`, `:236`)
   * and a host reads them, so the projection needs the INTERLEAVE of `texts` and
   * `advances`, which no other consumer does. Nothing in the drawing reads either list.
   *
   * Present whether or not there is a staff, unlike `topText` above — that one exists only
   * for the no-music case, where the block has nothing to ride.
   */
  readonly topTextRows?: readonly MetaTextRow[]
  readonly bottomTextRows?: readonly MetaTextRow[]
  /**
   * **`abcLine.nonMusic.rows` FOR EVERY NONMUSIC LINE, keyed by the block it was written
   * as.** The engraver hangs a `Subtitle`, a `FreeText` or a `Separator` on each of those
   * lines (`engraver-controller.js:229-247`) and a host reads `line.nonMusic`; the rows
   * are the same shape `topTextRows` carries and are recorded by the walk that spends
   * them. The projection joins them back by block IDENTITY — `compat/lines.ts` builds
   * every one of those lines from a `FreeTextBlock` — so nothing is re-derived and no
   * `Layout` is retained.
   */
  readonly nonMusicRows?: ReadonlyMap<FreeTextBlock, readonly MetaTextRow[]>
  /** `%%sep` rules in a trailing block — see `bottomText`. */
  readonly bottomLines?: readonly PlacedLine[]
  /**
   * The page cursor where this tune ENDS, before `padding.bottom` — what a stacked book
   * hands the next tune as its `pageTop`. See `LayoutOptions.pageTop`.
   */
  readonly endY?: number
  /**
   * **A SUBTITLE IS A LINE OF ITS OWN THAT DRAWS NOTHING.** Every `T:` after the first
   * becomes a bare `{subtitle}` entry in `abcTune.lines` — no `staff`, no `nonMusic`, so
   * `draw()`'s loop matches neither branch and emits no markup — and the loop still runs
   * `classes.incrLine()` over it (`draw/draw.js:28-31`). That is why a tune with one
   * extra `T:` opens at `abcjs-staff-wrapper abcjs-l1` and `little swallow`, which has
   * two, opens at `abcjs-l2`. The TEXT itself is drawn from `topText` before the loop.
   */
  readonly blankLeadingLines?: number
  /**
   * The CSS scale a PRINT render is drawn at — 1 on screen, so the emitter writes no
   * `style` and no height floor. See `LayoutOptions.print`.
   */
  readonly printScale?: number
  /**
   * **PRINT ITSELF, WHICH IS NOT THE SAME QUESTION AS THE SCALE.** The eleven-inch floor
   * on the page is `if (renderer.isPrint)` and nothing else (`draw/set-paper-size.js:5`),
   * while the CSS scale and its division apply to any scale under 1 — so a screen
   * `%%scale 0.8` takes the transform and NOT the floor. They were one flag here, and a
   * `%%scale` page came out 1320px tall.
   */
  readonly print?: boolean
  /**
   * `renderer.padding.left` for this render — 15 on screen, `68 / scale` in print. The
   * emitter needs it for the one thing it places absolutely: a brace's own voice name.
   */
  readonly paddingLeft?: number
  /**
   * `renderer.padding.bottom` for this render — what a STACKED tunebook has to subtract
   * from each tune's height to find where the next one starts. See `toSVG`.
   */
  readonly paddingBottom?: number
}

/**
 * A curve's declared box, with the PITCH the producer built it from where it has one.
 *
 * `verticalExtent`'s `include` falls back to `-y / STEP` when it is handed no pitch, and
 * that division is not the sum that made the y — abcjs never divides, its
 * `Math.max(anchor1.pitch, anchor2.pitch) + 4` IS the pitch (`tie-element.js:28-36`).
 */
export interface CurveReserve {
  readonly top: number
  readonly bottom: number
  readonly topPitch?: number
  readonly bottomPitch?: number
}
