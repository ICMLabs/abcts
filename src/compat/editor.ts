import { renderAbc, type AbcjsParams, type TuneObject } from "./index.js";
import { supportsAudio } from "./synth.js";

/**
 * **`Editor` AND `EditArea` — A TEXTAREA BOUND TO A RENDER.**
 *
 * A line-by-line port of `edit/abc_editor.js` and `edit/abc_editarea.js`. Between them
 * they are the oldest public surface abcjs has and the one every "type ABC, see notation"
 * page is built on: the textarea owns the text, `EditArea` turns its four DOM events into
 * two callbacks, and `Editor` re-renders on a 300ms debounce and drives the selection both
 * ways — caret into the score through `engraver.rangeHighlight`, click in the score back
 * into the caret through `highlight`.
 *
 * **THE DOM IS THE HOST'S, NEVER THE PACKAGE'S.** Everything here is typed against the
 * narrowest shape that will do, the way `animation.ts` is, so this file compiles with no
 * DOM lib and runs in whatever the host provides — a browser, or a jsdom the gate builds.
 *
 * Four details that are abcjs's and easy to lose:
 *
 * - **THE DEBOUNCE IS 300ms AND IT IS RESTARTED, NOT EXTENDED**: `fireChanged` clears the
 *   pending `timerId` and sets a new one, so a burst of keystrokes renders ONCE, 300ms
 *   after the last (`abc_editor.js:392-400`).
 * - **`parseABC` RETURNS WHETHER THE TEXT CHANGED**, and when it did NOT it still calls
 *   `updateSelection` — so moving the caret repaints the highlight without re-rendering.
 * - **THE CLICK LISTENER IS HIJACKED.** The constructor moves the host's `clickListener`
 *   aside and installs its own `highlight`, which sets the textarea's selection from the
 *   clicked element and only then calls the host's (`:139-140`, `:411-421`).
 * - **`isDirty` IS FALSE UNLESS `indicate_changed` WAS PASSED** — the flag gates the whole
 *   comparison, not just the CSS class (`:405-409`).
 *
 * ⚠️ **THE SYNTH BRANCH IS DECLARED AND NOT WIRED.** `redrawMidi` builds a
 * `SynthController` when `params.synth` was passed and audio is supported
 * (`:222-231`); that class is one of the seven `synth.*` still absent, so this stores the
 * host's configuration and stops there. Nothing else in the file depends on it, and in
 * Node `supportsAudio()` is false, so the branch is not reached at all today.
 */

/** The textarea, as little of it as this needs. */
export interface EditorTextArea {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  className: string;
  onkeyup?: ((ev?: unknown) => void) | null;
  onmousedown?: ((ev?: unknown) => void) | null;
  onmouseup?: ((ev?: unknown) => void) | null;
  onmousemove?: ((ev?: unknown) => void) | null;
  onchange?: ((ev?: unknown) => void) | null;
  setSelectionRange?: (start: number, end: number) => void;
  focus?: () => void;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  parentNode?: {
    insertBefore: (node: unknown, before: unknown) => void;
  } | null;
}

/** Where the music goes. */
export interface EditorPaper {
  innerHTML: string;
  parentNode?: { insertBefore: (node: unknown, before: unknown) => void } | null;
}

interface EditorDocument {
  getElementById(id: string): unknown;
  querySelector(selector: string): unknown;
  createElement(tag: string): unknown;
}

const doc = (): EditorDocument | undefined =>
  (globalThis as { document?: EditorDocument }).document;

/** The callback pair `EditArea` fires — `Editor` is one of these. */
export interface EditorListener {
  fireChanged(): void;
  fireSelectionChanged(): void;
}

/**
 * `EditArea(textareaid)` — a textarea behind the four-method interface `Editor` talks to,
 * and the file's own comment is the contract: "As long as the same interface is used,
 * Editor can use a different type of object."
 *
 * **A STRING IS TRIED AS AN ID FIRST AND AS A SELECTOR SECOND** (`abc_editarea.js:47-51`),
 * which is why `new Editor("#abc", …)` works at all.
 */
export class EditArea {
  readonly isEditArea = true;
  readonly textarea: EditorTextArea;
  initialText: string;
  isDragging = false;
  private changelistener: EditorListener | undefined;

  constructor(textareaid: string | EditorTextArea) {
    if (typeof textareaid === "string") {
      const d = doc();
      const found =
        (d?.getElementById(textareaid) as EditorTextArea | null | undefined) ??
        (d?.querySelector(textareaid) as EditorTextArea | null | undefined);
      this.textarea = found as EditorTextArea;
    } else this.textarea = textareaid;
    this.initialText = this.textarea.value;
  }

  /**
   * **A DRAG IS A `mousemove` WITH THE FLAG SET**, and the flag is set by the CHANGE
   * listener's `mousedown` — the two listeners are one state machine
   * (`abc_editarea.js:57-79`).
   *
   * ⚠️ **AND abcjs's OWN `this` IS THE TEXTAREA IN THREE OF THESE FOUR HANDLERS**, because
   * they are plain `function`s assigned to `on*`: `this.isDragging` inside `onmousemove`
   * and `onmousedown` is a property of the ELEMENT, not of the `EditArea`. So the flag
   * abcjs sets on mousedown is the one it reads on mousemove, and `EditArea.isDragging`
   * stays false forever. Reproduced by writing the flag to both.
   */
  addSelectionListener(listener: EditorListener): void {
    this.textarea.onmousemove = (): void => {
      if (this.isDragging) listener.fireSelectionChanged();
    };
  }

  addChangeListener(listener: EditorListener): void {
    this.changelistener = listener;
    this.textarea.onkeyup = (): void => {
      listener.fireChanged();
    };
    this.textarea.onmousedown = (): void => {
      this.isDragging = true;
      listener.fireSelectionChanged();
    };
    this.textarea.onmouseup = (): void => {
      this.isDragging = false;
      listener.fireChanged();
    };
    this.textarea.onchange = (): void => {
      listener.fireChanged();
    };
  }

  getSelection(): { start: number; end: number } {
    return {
      start: this.textarea.selectionStart,
      end: this.textarea.selectionEnd,
    };
  }

  setSelection(start: number, end: number): void {
    this.textarea.setSelectionRange?.(start, end);
    this.textarea.focus?.();
  }

  getString(): string {
    return this.textarea.value;
  }

  /** **SETTING THE STRING FIRES THE CHANGE LISTENER** (`abc_editarea.js:105-111`). */
  setString(str: string): void {
    this.textarea.value = str;
    this.initialText = this.getString();
    this.changelistener?.fireChanged();
  }

  getElem(): EditorTextArea {
    return this.textarea;
  }
}

export interface EditorParams {
  readonly canvas_id?: string | EditorPaper;
  readonly paper_id?: string | EditorPaper;
  readonly abcjsParams?: AbcjsParams;
  readonly parser_options?: AbcjsParams;
  readonly render_options?: AbcjsParams;
  readonly midi_options?: AbcjsParams;
  readonly generate_midi?: boolean;
  readonly midi_id?: string | unknown;
  readonly midi_download_id?: string | unknown;
  readonly generate_warnings?: boolean;
  readonly warnings_id?: string | { innerHTML: string };
  readonly onchange?: (editor: Editor) => void;
  readonly redrawCallback?: (starting: boolean) => void;
  readonly selectionChangeCallback?: (start: number, end: number) => void;
  readonly indicate_changed?: boolean;
  readonly synth?: {
    el?: unknown;
    cursorControl?: unknown;
    options?: Record<string, unknown>;
  };
}

/**
 * `gatherAbcParams` — four option bags flattened into one, in abcjs's own order:
 * `abcjsParams`, then `midi_options`, then `parser_options`, then `render_options`
 * (`abc_editor.js:52-92`). Later wins, which is why a render option beats a parser one.
 */
const gatherAbcParams = (params: EditorParams): Record<string, unknown> => ({
  ...(params.abcjsParams ?? {}),
  ...(params.midi_options ?? {}),
  ...(params.parser_options ?? {}),
  ...(params.render_options ?? {}),
});

/** `hasClassName` / `addClassName` / `removeClassName` — `abc_editor.js:180-196`. */
const hasClassName = (el: { className: string }, className: string): boolean =>
  el.className.length > 0 &&
  (el.className === className ||
    new RegExp(`(^|\\s)${className}(\\s|$)`).test(el.className));

const addClassName = (el: { className: string }, className: string): void => {
  if (!hasClassName(el, className))
    el.className += (el.className ? " " : "") + className;
};

const removeClassName = (el: { className: string }, className: string): void => {
  el.className = el.className
    .replace(new RegExp(`(^|\\s+)${className}(\\s+|$)`), " ")
    .trim();
};

export class Editor implements EditorListener {
  readonly abcjsParams: Record<string, unknown>;
  readonly editarea: EditArea;
  tunes: TuneObject[] = [];
  warnings: string[] | undefined;
  currentAbc = "";

  private readonly div: EditorPaper | null;
  private readonly warningsdiv: { innerHTML: string } | null = null;
  private readonly indicate_changed: boolean | undefined;
  private readonly onchangeCallback: EditorParams["onchange"];
  private readonly redrawCallback: EditorParams["redrawCallback"];
  private readonly selectionChangeCallback: EditorParams["selectionChangeCallback"];
  private readonly clientClickListener: unknown;
  private readonly generate_midi: boolean | undefined;
  private readonly downloadMidi: unknown;
  private readonly inlineMidi: unknown;
  /** Stored for the day `SynthController` lands — see the file's note. */
  private readonly synth: EditorParams["synth"] | undefined;
  private bReentry = false;
  private bIsPaused = false;
  private midiPause = false;
  private wasDirty: boolean | undefined;
  private timerId: number | undefined;

  constructor(editarea: string | EditArea | EditorTextArea, params: EditorParams) {
    this.abcjsParams = gatherAbcParams(params);
    if (params.indicate_changed) this.indicate_changed = true;

    // A string is an id or a selector; an object is an EditArea or a textarea.
    this.editarea =
      typeof editarea === "string"
        ? new EditArea(editarea)
        : editarea instanceof EditArea
          ? editarea
          : (editarea as { isEditArea?: boolean }).isEditArea === true
            ? (editarea as unknown as EditArea)
            : new EditArea(editarea as EditorTextArea);
    this.editarea.addSelectionListener(this);
    this.editarea.addChangeListener(this);

    /**
     * **WITH NO `paper_id` THE DIV IS CREATED AND INSERTED ABOVE THE TEXTAREA**
     * (`abc_editor.js:120-127`) — the music appears without the page asking for a place
     * to put it, which is why the four-line demo in abcjs's own docs works.
     */
    let div = params.canvas_id ?? params.paper_id;
    if (div === undefined) {
      const made = doc()?.createElement("DIV") as EditorPaper | undefined;
      if (made !== undefined) {
        const elem = this.editarea.getElem();
        elem.parentNode?.insertBefore(made, elem);
      }
      div = made;
    }
    this.div =
      typeof div === "string"
        ? ((doc()?.getElementById(div) as EditorPaper | null) ?? null)
        : (div ?? null);

    this.selectionChangeCallback = params.selectionChangeCallback;
    this.clientClickListener = this.abcjsParams["clickListener"];
    this.abcjsParams["clickListener"] = (
      abcelem: { startChar: number; endChar: number },
      tuneNumber?: number,
      classes?: string,
      analysis?: unknown,
      drag?: unknown,
      mouseEvent?: unknown,
    ): void => {
      this.highlight(abcelem, tuneNumber, classes, analysis, drag, mouseEvent);
    };

    if (params.synth && supportsAudio() === true) this.synth = params.synth;

    if (params.generate_midi) {
      this.generate_midi = params.generate_midi;
      if (this.abcjsParams["generateDownload"]) {
        this.downloadMidi =
          typeof params.midi_download_id === "string"
            ? doc()?.getElementById(params.midi_download_id)
            : params.midi_download_id;
      }
      if (this.abcjsParams["generateInline"] !== false) {
        this.inlineMidi =
          typeof params.midi_id === "string"
            ? doc()?.getElementById(params.midi_id)
            : params.midi_id;
      }
    }

    if (params.warnings_id !== undefined) {
      this.warningsdiv =
        typeof params.warnings_id === "string"
          ? ((doc()?.getElementById(params.warnings_id) as {
              innerHTML: string;
            } | null) ?? null)
          : params.warnings_id;
    } else if (params.generate_warnings) {
      const made = doc()?.createElement("div") as { innerHTML: string } | undefined;
      if (made !== undefined && this.div !== null)
        this.div.parentNode?.insertBefore(made, this.div);
      this.warningsdiv = made ?? null;
    }

    this.onchangeCallback = params.onchange;
    this.redrawCallback = params.redrawCallback;

    this.parseABC();
    this.modelChanged();
  }

  /**
   * `setReadOnly` — the attribute AND the class, because a `readonly` textarea looks the
   * same as a live one (`abc_editor.js:198-209`).
   */
  setReadOnly(readOnly: boolean): void {
    const el = this.editarea.getElem();
    if (readOnly) {
      el.setAttribute("readonly", "yes");
      addClassName(el, "abc_textarea_readonly");
    } else {
      el.removeAttribute("readonly");
      removeClassName(el, "abc_textarea_readonly");
    }
  }

  /**
   * `redrawMidi` — a `generateMidi` CustomEvent on the WINDOW, which is how abcjs's own
   * midi plugin hears about a redraw without the editor depending on it
   * (`abc_editor.js:212-233`). The synth half is declared and not wired; see the note at
   * the top of the file.
   */
  redrawMidi(): void {
    if (this.generate_midi && !this.midiPause) {
      const w = (globalThis as {
        window?: {
          CustomEvent?: new (name: string, init: unknown) => unknown;
          dispatchEvent?: (event: unknown) => void;
        };
      }).window;
      if (w?.CustomEvent !== undefined && w.dispatchEvent !== undefined) {
        w.dispatchEvent(
          new w.CustomEvent("generateMidi", {
            detail: {
              tunes: this.tunes,
              abcjsParams: this.abcjsParams,
              downloadMidiEl: this.downloadMidi,
              inlineMidiEl: this.inlineMidi,
              engravingEl: this.div,
            },
          }),
        );
      }
    }
  }

  /**
   * `modelChanged` — the render itself, and every throw inside it becomes a WARNING rather
   * than an exception, so a page keeps working while the user types nonsense
   * (`abc_editor.js:235-266`).
   */
  modelChanged(): void {
    if (this.bReentry) return;
    this.bReentry = true;
    try {
      this.timerId = undefined;
      this.redrawCallback?.(true);
      this.tunes = renderAbc(
        this.div as never,
        this.currentAbc,
        this.abcjsParams as AbcjsParams,
      );
      /**
       * ⚠️ **`tune.warnings` IS abcjs's FIELD AND WE DO NOT WRITE ONE YET.**
       * `renderEngine` hangs the PARSER's warning strings on the tune, and only when there
       * are any (`abc_tunebook.js:87-89`); ours carries diagnostics in its own shape and
       * wording, and inventing abcjs's text here would be a guess. So the warnings div
       * reads "No errors" for a tune abcjs warns about — one named open row, not a silent
       * difference.
       */
      if (this.tunes.length > 0)
        this.warnings = (this.tunes[0] as unknown as {
          warnings?: string[];
        })?.warnings;
      this.redrawMidi();
      this.redrawCallback?.(false);
    } catch (error) {
      console.error("ABCJS error: ", error);
      if (!this.warnings) this.warnings = [];
      this.warnings.push((error as Error).message);
    }
    if (this.warningsdiv !== null)
      this.warningsdiv.innerHTML = this.warnings
        ? this.warnings.join("<br />")
        : "No errors";
    this.updateSelection();
    this.bReentry = false;
  }

  /** `paramChanged` — the params change, and the text is FORGOTTEN so the render repeats. */
  paramChanged(engraverParams?: Record<string, unknown>): void {
    if (engraverParams)
      for (const key of Object.keys(engraverParams))
        this.abcjsParams[key] = engraverParams[key];
    this.currentAbc = "";
    this.fireChanged();
  }

  getTunes(): TuneObject[] {
    return this.tunes;
  }

  synthParamChanged(options?: Record<string, unknown>): void {
    if (!this.synth) return;
    this.synth.options = { ...(options ?? {}) };
    this.currentAbc = "";
    this.fireChanged();
  }

  /** Returns whether the MODEL changed — and repaints the selection when it did not. */
  parseABC(): boolean {
    const t = this.editarea.getString();
    if (t === this.currentAbc) {
      this.updateSelection();
      return false;
    }
    this.currentAbc = t;
    return true;
  }

  /**
   * **THE HIGHLIGHT IS TRIED AND SWALLOWED** — abcjs wraps it in a bare `try {} catch (e)
   * {}` with the comment "maybe printer isn't defined yet?" (`abc_editor.js:317-323`), so
   * a selection change before the first render is silent.
   */
  updateSelection(): void {
    const selection = this.editarea.getSelection();
    try {
      const tune = this.tunes[0];
      if (tune?.engraver !== undefined)
        tune.engraver.rangeHighlight(selection.start, selection.end);
    } catch {
      /* maybe printer isn't defined yet? */
    }
    this.selectionChangeCallback?.(selection.start, selection.end);
  }

  fireSelectionChanged(): void {
    this.updateSelection();
  }

  setDirtyStyle(isDirty: boolean): void {
    if (this.indicate_changed === undefined) return;
    const el = this.editarea.getElem();
    if (isDirty) addClassName(el, "abc_textarea_dirty");
    else removeClassName(el, "abc_textarea_dirty");
  }

  /** The 300ms debounce — "a good compromise between responsiveness and not redrawing too much". */
  fireChanged(): void {
    if (this.bIsPaused) return;
    if (this.parseABC()) {
      const timers = globalThis as {
        setTimeout: (fn: () => void, ms: number) => unknown;
        clearTimeout: (id: unknown) => void;
      };
      if (this.timerId !== undefined) timers.clearTimeout(this.timerId);
      this.timerId = timers.setTimeout(() => {
        this.modelChanged();
      }, 300) as unknown as number;
      const isDirty = this.isDirty();
      if (this.wasDirty !== isDirty) {
        this.wasDirty = isDirty;
        this.setDirtyStyle(isDirty);
      }
      this.onchangeCallback?.(this);
    }
  }

  setNotDirty(): void {
    this.editarea.initialText = this.editarea.getString();
    this.wasDirty = false;
    this.setDirtyStyle(false);
  }

  isDirty(): boolean {
    if (this.indicate_changed === undefined) return false;
    return this.editarea.initialText !== this.editarea.getString();
  }

  /** The engraver's click, turned into a textarea selection and then passed on. */
  highlight(
    abcelem: { startChar: number; endChar: number },
    tuneNumber?: number,
    classes?: string,
    analysis?: unknown,
    drag?: unknown,
    mouseEvent?: unknown,
  ): void {
    this.editarea.setSelection(abcelem.startChar, abcelem.endChar);
    this.selectionChangeCallback?.(abcelem.startChar, abcelem.endChar);
    if (typeof this.clientClickListener === "function")
      (this.clientClickListener as (...args: unknown[]) => void)(
        abcelem,
        tuneNumber,
        classes,
        analysis,
        drag,
        mouseEvent,
      );
  }

  /** `pause(true)` stops the automatic rendering; `pause(false)` renders what was typed. */
  pause(shouldPause: boolean): void {
    this.bIsPaused = shouldPause;
    if (!shouldPause) this.fireChanged();
  }

  millisecondsPerMeasure(): number {
    return 0;
  }

  pauseMidi(shouldPause: boolean): void {
    this.midiPause = shouldPause;
    if (!shouldPause) this.redrawMidi();
  }
}
