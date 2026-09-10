import type { Selectable } from "./selectables.js";

/**
 * **`setupSelection` — WHAT HAPPENS AFTER A USER TOUCHES THE SCORE.**
 *
 * A port of `write/interactive/selection.js` (424 lines) with `create-analysis.js`,
 * `highlight.js`, `unhighlight.js` and `helpers/set-class.js`, which are the four files it
 * reaches. Until this landed abcts attached **no DOM event listeners at all**: a host's
 * `clickListener` was never called, and `ABCJS.Editor` — which installs one of its own
 * (`editor.ts:281`) to move the caret — had a dead score-to-caret direction.
 *
 * **THE JOIN IS `data-index`, WHICH IS THE JOIN abcjs USES TOO.** Its `svgEl` is the live
 * DOM node because it draws through a DOM; ours is a synthetic attribute bag, because we
 * emit a string. So each selectable is bound to its node once, after the markup is
 * injected, by the very attribute `Selectables.add` writes — and `findElementInHistory`
 * matches on `dataset.index` rather than on identity, so abcjs is doing the same lookup
 * one step later.
 *
 * ⚠️ **`selectable="false"` IS A TRUTHY STRING.** `getTarget` walks up until
 * `getAttribute("selectable")` is truthy, and with no `selectTypes` every selectable
 * carries the literal `"false"` — so the walk STOPS there and a default render is fully
 * clickable. Reading that attribute as a boolean would make the common case unclickable.
 *
 * ⚠️ **AND `elemset` IS READ AFTER THE HIGHLIGHT, NOT BEFORE.** `mouseUp` paints
 * `selectionColor` and only then calls `notifySelect`, so the `classes` string a host
 * receives already contains `abcjs-note_selected`. Measured against abcjs on a plain tune
 * with no `add_classes`: the callback's third argument is exactly
 * `"abcjs-note_selected"`, which is the class abcjs added one line earlier.
 */

/** The DOM surface this needs — `tsconfig` has no `dom` lib, deliberately. */
export interface LiveNode {
  readonly tagName?: string;
  readonly parentElement?: LiveNode | null;
  readonly parentNode?: LiveNode | null;
  readonly dataset?: Record<string, string | undefined>;
  readonly classList?: unknown;
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  addEventListener?(type: string, fn: (ev: LiveEvent) => void, opts?: unknown): void;
  getBBox?(): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  getBoundingClientRect?(): { readonly left: number; readonly top: number };
  focus?(): void;
  closest?(sel: string): LiveNode | null;
  querySelectorAll?(sel: string): ArrayLike<LiveNode>;
  readonly viewBox?: { readonly baseVal?: { x: number; y: number; width: number; height: number } };
  readonly clientWidth?: number;
  readonly clientHeight?: number;
  readonly firstChild?: unknown;
  readonly svg?: LiveNode;
}
export interface LiveEvent {
  readonly type?: string;
  readonly target?: LiveNode | null;
  readonly button?: number;
  readonly keyCode?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly layerX?: number;
  readonly layerY?: number;
  readonly touches?: ArrayLike<Record<string, number>> & { length: number };
  preventDefault?(): void;
}

/** abcjs's own selection colours (`interactive/highlight.js`, `unhighlight.js`). */
const SELECTED_CLASS = "abcjs-note_selected";
const DRAGGING_CLASS = "abcjs-dragging-in-progress";
/**
 * `spacing.STEP` — half a staff space, the unit a drag is reported in
 * (`write/helpers/spacing.js`). It is abcjs's own literal and not derived from ours,
 * because what a host receives must be abcjs's step whatever we engrave with.
 */
const STEP = 3.875;

/** `helpers/set-class.js`, whole — see `range-highlight.ts`, which ports the same four lines. */
const setClass = (
  el: LiveNode,
  addClass: string,
  removeClass: string,
  color: string,
): void => {
  const attr = el.getAttribute?.("highlight") ?? "fill";
  el.setAttribute?.(attr, color);
  let kls = el.getAttribute?.("class") ?? "";
  kls = kls.replace(removeClass, "");
  kls = kls.replace(addClass, "");
  if (addClass.length > 0) {
    if (kls.length > 0 && kls[kls.length - 1] !== " ") kls += " ";
    kls += addClass;
  }
  el.setAttribute?.("class", kls);
};

/**
 * `getClassSet`/`setClassSet`/`addGlobalClass` (`selection.js:388-414`).
 *
 * ⚠️ **THE LEADING SPACE IS abcjs's.** `getClassSet` splits a missing `class` attribute —
 * `""` — into `[""]`, so the set it builds has an empty-string key and the join writes
 * `" abcjs-dragging-in-progress"`. Measured, not intuited.
 */
const addGlobalClass = (svg: LiveNode | null, klass: string): void => {
  if (svg === null) return;
  const old = svg.getAttribute?.("class") ?? "";
  const keys = old.split(" ");
  if (!keys.includes(klass)) keys.push(klass);
  svg.setAttribute?.("class", keys.join(" "));
};

/**
 * ⚠️ **AND `removeGlobalClass` NEVER FIRES, WHICH IS abcjs's BUG AND IS REPRODUCED.**
 * `mouseDown` adds the class to `this.renderer.paper` and `mouseUp` removes it from
 * `this.renderer.svg` — two different fields, and the renderer has no `svg`, so the guard
 * `if (svg)` is false and the class STAYS on the element for the life of the page
 * (`selection.js:285`, `:337`, `:408-422`). Measured in WebKit: after a full
 * mousedown/mouseup the root still reads `class=" abcjs-dragging-in-progress"`.
 *
 * It is kept as a function so the divergence has a name and a place to be fixed.
 */
const removeGlobalClass = (svg: LiveNode | null, klass: string): void => {
  if (svg === null) return;
  const old = svg.getAttribute?.("class") ?? "";
  const keys = old.split(" ").filter((k) => k !== klass);
  svg.setAttribute?.("class", keys.join(" "));
};

/** `findNumber` (`create-analysis.js:1-8`) — `abcjs-v3` gives `voice: 3`, `abcjs-vx` nothing. */
const findNumber = (
  klass: string,
  match: string,
  target: Record<string, unknown>,
  name: string,
): void => {
  if (klass.indexOf(match) === 0) {
    const value = klass.replace(match, "");
    const num = Number.parseInt(value, 10);
    if (`${num}` === value) target[name] = num;
  }
};

interface Bound {
  readonly sel: Selectable;
  readonly node: LiveNode;
  /**
   * ⚠️ **A TEMPO IS REGISTERED AS A SELECTABLE AND IS NEVER PAINTED.** `drawAbsolute`'s
   * `isTempo` arm calls `selectables.add(params, g, false, staffPos)` and — alone among
   * every arm — does NOT run `params.elemset.push(g)` (`draw/absolute.js:52-56`), so
   * `highlight` walks an empty list and `createAnalysis` finds no classes at all. Clicking
   * a tempo mark in abcjs notifies the host with a `classes` of `""` and leaves the mark
   * its own colour.
   *
   * **THE RULE WAS ALREADY IN THIS REPO** — `range-highlight.ts` ports it and says so in
   * its own doc block. Porting it a second time here is the point: a rule ported at the
   * site that named it is not a rule ported. Measured before it was believed: abcjs
   * reports `painted: 0` and `fill="currentColor"` where we reported 1 and `#0000ff`.
   */
  readonly elemset: readonly LiveNode[];
  /** `getDim`'s cache — "the getBBox call is expensive", abcjs's own reason. */
  dim?: { left: number; top: number; right: number; bottom: number };
}

/** `EngraverController.getDim` (`engraver-controller.js:381-388`) — rounded, and cached. */
const getDim = (b: Bound): Bound["dim"] => {
  if (b.dim === undefined) {
    const box = b.node.getBBox?.();
    if (box === undefined) return undefined;
    b.dim = {
      left: Math.round(box.x),
      top: Math.round(box.y),
      right: Math.round(box.x + box.width),
      bottom: Math.round(box.y + box.height),
    };
  }
  return b.dim;
};

/**
 * `createAnalysis` (`create-analysis.js:10-47`).
 *
 * **THE CLASSES COME OFF THE LIVE NODES**, because abcjs's `elemset` holds live nodes and
 * ours is an empty placeholder — and reading a synthetic bag would miss the very class
 * `mouseUp` added one line earlier, which is the only class a default render has at all.
 */
const createAnalysis = (
  b: Bound,
  ev: LiveEvent,
): { classes: string[]; analysis: Record<string, unknown> } => {
  const classObj: Record<string, boolean> = {};
  for (const el of b.elemset)
    for (const k of (el.getAttribute?.("class") ?? "").split(" ")) classObj[k] = true;
  const classes = Object.keys(classObj);
  const analysis: Record<string, unknown> = {};
  for (const klass of classes) {
    findNumber(klass, "abcjs-v", analysis, "voice");
    findNumber(klass, "abcjs-l", analysis, "line");
    findNumber(klass, "abcjs-m", analysis, "measure");
  }
  if (b.sel.staffPos !== undefined) analysis["staffPos"] = b.sel.staffPos;
  // The two DOM walks, and they stop on DIFFERENT attributes: the nearest ancestor with a
  // `data-name` and the nearest with a `data-index`.
  let closest: LiveNode | null | undefined = ev.target;
  while (
    closest &&
    closest.dataset &&
    closest.dataset["name"] === undefined &&
    (closest.tagName ?? "").toLowerCase() !== "svg"
  )
    closest = closest.parentNode;
  let parent: LiveNode | null | undefined = ev.target;
  while (
    parent &&
    parent.dataset &&
    parent.dataset["index"] === undefined &&
    (parent.tagName ?? "").toLowerCase() !== "svg"
  )
    parent = parent.parentNode;
  if (parent && parent.dataset) {
    analysis["name"] = parent.dataset["name"];
    analysis["clickedName"] = closest?.dataset?.["name"];
    analysis["parentClasses"] = parent.classList;
  }
  if (closest && closest.classList) analysis["clickedClasses"] = closest.classList;
  analysis["selectableElement"] = b.node;
  return { classes, analysis };
};

/** `getCoord` (`selection.js:28-61`) — the `responsive: "resize"` conversion. */
const getCoord = (ev: LiveEvent): [number, number] => {
  let scaleX = 1;
  let scaleY = 1;
  const svg = ev.target?.closest?.("svg") ?? null;
  let yOffset = 0;
  const vb = svg?.viewBox?.baseVal;
  if (vb) {
    if (vb.width !== 0 && svg?.clientWidth) scaleX = vb.width / svg.clientWidth;
    if (vb.height !== 0 && svg?.clientHeight) scaleY = vb.height / svg.clientHeight;
    yOffset = vb.y;
  }
  const svgClicked = ev.target !== null && ev.target?.tagName === "svg";
  const x = (svgClicked ? (ev.offsetX ?? 0) : (ev.layerX ?? 0)) * scaleX;
  const y = (svgClicked ? (ev.offsetY ?? 0) : (ev.layerY ?? 0)) * scaleY;
  return [x, y + yOffset];
};

/**
 * `getBestMatchCoordinates` (`selection.js:185-203`) — abcjs's own note: *"This seems like
 * less of a hack than browser sniffing."* Firefox's `offset` is wrong and its `layer` is
 * right; Safari and Chrome have `layer` multiplied by the render scale.
 */
const getBestMatchCoordinates = (
  dim: { x: number; y: number; width: number; height: number },
  ev: LiveEvent,
  scale: number,
): [number, number] => {
  const ox = ev.offsetX ?? 0;
  const oy = ev.offsetY ?? 0;
  if (
    dim.x <= ox &&
    dim.x + dim.width >= ox &&
    dim.y <= oy &&
    dim.y + dim.height >= oy
  )
    return [ox, oy];
  const epsilon = Math.abs((ev.layerY ?? 0) / scale - oy);
  return epsilon < 3 ? [ox, oy] : [ev.layerX ?? 0, ev.layerY ?? 0];
};

/**
 * `getTarget` (`selection.js:205-227`) — up the DOM to the first node with a `selectable`
 * attribute, or the `<svg>`. ⚠️ See the file header: `"false"` is truthy and stops it.
 */
const getTarget = (target: LiveNode | null | undefined): LiveNode | null => {
  if (!target) return null;
  if (target.tagName === "svg") return target;
  if (!target.getAttribute) return null;
  let node: LiveNode = target;
  let found: string | boolean | null = node.getAttribute?.("selectable") ?? null;
  while (!found) {
    if (!node.parentElement) found = true;
    else {
      node = node.parentElement;
      if (node.tagName === "svg") found = true;
      else found = node.getAttribute ? node.getAttribute("selectable") : null;
    }
  }
  return node;
};

export interface InteractiveParams {
  readonly dragging?: boolean;
  readonly selectionColor?: string;
  readonly dragColor?: string;
  readonly clickListener?: (...args: unknown[]) => void;
  readonly scale?: number;
  readonly foregroundColor?: string;
}

/**
 * Wire one rendered tune. Returns the `svgs` array abcjs hangs on its engraver, so a host
 * that asked for `oneSvgPerLine` can reach the per-line elements.
 *
 * A no-op without a document, without a paper element, or without listeners AND without
 * `dragging` — which is abcjs's own shape: it installs the six mouse/touch handlers
 * unconditionally, but they do nothing observable when `listeners` is empty and nothing is
 * draggable.
 */
export function setupSelection(
  paper: LiveNode | null,
  selectables: readonly Selectable[],
  params: InteractiveParams,
): LiveNode[] {
  const svgs: LiveNode[] = [];
  if (paper === null || paper.querySelectorAll === undefined) return svgs;
  const all = (sel: string): LiveNode[] => {
    const found = paper.querySelectorAll?.(sel);
    const out: LiveNode[] = [];
    for (let i = 0; i < (found?.length ?? 0); i += 1) {
      const n = found?.[i];
      if (n !== undefined) out.push(n);
    }
    return out;
  };
  for (const s of all("svg")) svgs.push(s);
  const listeners: ((...args: unknown[]) => void)[] = [];
  if (params.clickListener) listeners.push(params.clickListener);

  // **BIND BY `data-index`** — see the file header.
  const byIndex = new Map<string, LiveNode>();
  for (const node of all("[data-index]")) {
    const at = node.getAttribute?.("data-index");
    if (at !== null && at !== undefined && !byIndex.has(at)) byIndex.set(at, node);
  }
  const bound: Bound[] = [];
  for (const [i, sel] of selectables.entries()) {
    const node = byIndex.get(String(i));
    if (node === undefined) continue;
    // See `Bound.elemset` — every arm but the tempo's pushes the group it just closed.
    const isTempo =
      (sel.absEl.abcelem as { el_type?: string } | undefined)?.el_type === "tempo";
    bound.push({ sel, node, elemset: isTempo ? [] : [node] });
  }
  if (bound.length === 0 && listeners.length === 0) return svgs;

  const selectionColor = params.selectionColor ?? "#ff0000";
  const dragColor = params.dragColor ?? params.selectionColor ?? "#ff0000";
  const foregroundColor = params.foregroundColor ?? "currentColor";
  const scale = params.scale && params.scale > 0.1 ? params.scale : 1;

  let selected: LiveNode[] = [];
  let dragTarget: Bound | null = null;
  let dragIndex = -1;
  let dragMechanism = "";
  let dragMouseStart: { x: number; y: number } | null = null;
  let dragYStep = 0;
  let lastTouchMove: LiveEvent | null = null;

  const clearSelection = (): void => {
    for (const el of selected) setClass(el, "", SELECTED_CLASS, foregroundColor);
    selected = [];
  };
  /** `AbsoluteElement.highlight` — `setClass(this.elemset, …)`, so an EMPTY elemset paints
   * nothing at all (`interactive/highlight.js`). See `Bound.elemset`. */
  const paint = (b: Bound, color: string): void => {
    for (const el of b.elemset) setClass(el, SELECTED_CLASS, "", color);
  };

  /** `findElementInHistory` (`selection.js:130-144`) — matched on `dataset.index`. */
  const findElementInHistory = (el: LiveNode | null): number => {
    if (!el) return -1;
    const index = el.dataset?.["index"];
    if (index === undefined) return -1;
    for (let i = 0; i < bound.length; i += 1)
      if (bound[i]?.node.dataset?.["index"] === index) return i;
    return -1;
  };

  /**
   * `findElementByCoord` (`selection.js:146-183`) — the NEAR-MISS arm, and its 12px radius
   * is what makes a click beside a notehead still select it. Four branches: a direct hit
   * wins outright (`minDistance = 0` also ends the loop, which is what the `&&` in the
   * `for` is for), then same-row, then same-column, then the corner hypotenuse.
   */
  const findElementByCoord = (x: number, y: number): number => {
    let minDistance = 9999999;
    let closestIndex = -1;
    for (let i = 0; i < bound.length && minDistance > 0; i += 1) {
      const b = bound[i];
      if (b === undefined) continue;
      const dim = getDim(b);
      if (dim === undefined) continue;
      if (dim.left < x && dim.right > x && dim.top < y && dim.bottom > y) {
        closestIndex = i;
        minDistance = 0;
      } else if (dim.top < y && dim.bottom > y) {
        const horiz = Math.min(Math.abs(dim.left - x), Math.abs(dim.right - x));
        if (horiz < minDistance) {
          minDistance = horiz;
          closestIndex = i;
        }
      } else if (dim.left < x && dim.right > x) {
        const vert = Math.min(Math.abs(dim.top - y), Math.abs(dim.bottom - y));
        if (vert < minDistance) {
          minDistance = vert;
          closestIndex = i;
        }
      } else {
        const dx =
          Math.abs(x - dim.left) > Math.abs(x - dim.right)
            ? Math.abs(x - dim.right)
            : Math.abs(x - dim.left);
        const dy =
          Math.abs(y - dim.top) > Math.abs(y - dim.bottom)
            ? Math.abs(y - dim.bottom)
            : Math.abs(y - dim.top);
        const hypotenuse = Math.sqrt(dx * dx + dy * dy);
        if (hypotenuse < minDistance) {
          minDistance = hypotenuse;
          closestIndex = i;
        }
      }
    }
    return closestIndex >= 0 && minDistance <= 12 ? closestIndex : -1;
  };

  /** `getMousePosition` (`selection.js:229-251`) — a direct hit, else the nearest. */
  const getMousePosition = (
    ev: LiveEvent,
  ): { x: number; y: number; clickedOn: number } => {
    let clickedOn = findElementInHistory(getTarget(ev.target));
    let x: number;
    let y: number;
    if (clickedOn >= 0) {
      const node = bound[clickedOn]?.node;
      const box = node?.getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 };
      [x, y] = getBestMatchCoordinates(box, ev, scale);
    } else {
      [x, y] = getCoord(ev);
      clickedOn = findElementByCoord(x, y);
    }
    return { x, y, clickedOn };
  };

  /** `notifySelect` (`selection.js:350-358`). */
  const notifySelect = (
    target: Bound,
    dragStep: number,
    dragMax: number,
    index: number,
    ev: LiveEvent,
  ): void => {
    const { classes, analysis } = createAnalysis(target, ev);
    for (const listener of listeners)
      listener(
        target.sel.absEl.abcelem,
        target.sel.absEl.tuneNumber,
        classes.join(" "),
        analysis,
        {
          step: dragStep,
          max: dragMax,
          index,
          setSelection: (at: number) => setSelection(at),
        },
        ev,
      );
  };

  /**
   * `attachMissingTouchEventAttributes` (`selection.js:253-265`) — a touch has no
   * `offsetX`, so abcjs computes one against the target's client rect and then sets
   * `layer` to the RAW PAGE coordinate, which is not the same frame at all. Reproduced.
   */
  const attachMissingTouchEventAttributes = (touchEv: LiveEvent | null): void => {
    if (!touchEv || !touchEv.target || !touchEv.touches || touchEv.touches.length < 1)
      return;
    const rect = touchEv.target.getBoundingClientRect?.();
    const t = touchEv.touches[0] as Record<string, number> | undefined;
    if (rect === undefined || t === undefined) return;
    t["offsetX"] = (t["pageX"] ?? 0) - rect.left;
    t["offsetY"] = (t["pageY"] ?? 0) - rect.top;
    t["layerX"] = t["pageX"] ?? 0;
    t["layerY"] = t["pageY"] ?? 0;
  };

  const mouseDown = (ev: LiveEvent): void => {
    let _ev = ev;
    if (ev.type === "touchstart") {
      attachMissingTouchEventAttributes(ev);
      if (ev.touches && ev.touches.length > 0)
        _ev = ev.touches[0] as unknown as LiveEvent;
    }
    const positioning = getMousePosition(_ev);
    const hit = bound[positioning.clickedOn];
    // **THE MAIN BUTTON ONLY**, and a touch has no button at all.
    if (
      positioning.clickedOn >= 0 &&
      (ev.type === "touchstart" || ev.button === 0) &&
      hit !== undefined
    ) {
      dragTarget = hit;
      dragIndex = positioning.clickedOn;
      dragMechanism = "mouse";
      dragMouseStart = { x: positioning.x, y: positioning.y };
      if (params.dragging === true && hit.sel.isDraggable) {
        addGlobalClass(svgs[0] ?? null, DRAGGING_CLASS);
        paint(hit, dragColor);
      }
    }
  };

  const mouseMove = (ev: LiveEvent): void => {
    let _ev = ev;
    if (ev.type === "touchmove") {
      attachMissingTouchEventAttributes(ev);
      if (ev.touches && ev.touches.length > 0)
        _ev = ev.touches[0] as unknown as LiveEvent;
    }
    lastTouchMove = ev;
    if (
      dragTarget === null ||
      params.dragging !== true ||
      !dragTarget.sel.isDraggable ||
      dragMechanism !== "mouse" ||
      dragMouseStart === null
    )
      return;
    const positioning = getMousePosition(_ev);
    const yDist = Math.round((positioning.y - dragMouseStart.y) / STEP);
    if (yDist !== dragYStep) {
      dragYStep = yDist;
      dragTarget.node.setAttribute?.("transform", `translate(0,${yDist * STEP})`);
    }
  };

  const mouseUp = (ev: LiveEvent): void => {
    let _ev = ev;
    if (ev.type === "touchend" && lastTouchMove) {
      attachMissingTouchEventAttributes(lastTouchMove);
      if (lastTouchMove.touches && lastTouchMove.touches.length > 0)
        _ev = lastTouchMove.touches[0] as unknown as LiveEvent;
    }
    if (dragTarget === null) return;
    const target = dragTarget;
    clearSelection();
    // ⚠️ **THE HIGHLIGHT COMES BEFORE THE NOTIFY**, which is why the reported `classes`
    // already contain `abcjs-note_selected` — see the file header.
    selected = [...target.elemset];
    paint(target, selectionColor);
    notifySelect(target, dragYStep, bound.length, dragIndex, _ev);
    if (target.node.focus) {
      target.node.focus();
      dragTarget = null;
      dragIndex = -1;
    }
    // ⚠️ abcjs's own no-op — see `removeGlobalClass`.
    removeGlobalClass(null, DRAGGING_CLASS);
  };

  /** `setSelection` (`selection.js:340-347`) — what a host calls off the drag object. */
  function setSelection(at: number): void {
    const hit = bound[at];
    if (at >= 0 && at < bound.length && hit !== undefined) {
      dragTarget = hit;
      dragIndex = at;
      dragMechanism = "keyboard";
      mouseUp({ target: hit.node });
    }
  }

  const elementFocused = (ev: LiveEvent): void => {
    if (dragMechanism === "keyboard" && dragYStep !== 0 && dragTarget)
      notifySelect(dragTarget, dragYStep, bound.length, dragIndex, ev);
    dragYStep = 0;
  };

  /** The arrows are swallowed so the page does not scroll while a note is being dragged. */
  const keyboardDown = (ev: LiveEvent): void => {
    if (ev.keyCode === 38 || ev.keyCode === 40) ev.preventDefault?.();
  };

  const keyboardSelection = (ev: LiveEvent): void => {
    let handled = false;
    const at = Number(ev.target?.dataset?.["index"]);
    const hit = bound[at];
    const step = (delta: number): void => {
      dragTarget = hit ?? null;
      dragIndex = at;
      if (dragTarget && dragTarget.sel.isDraggable) {
        if (params.dragging === true) paint(dragTarget, dragColor);
        dragYStep += delta;
        dragTarget.node.setAttribute?.(
          "transform",
          `translate(0,${dragYStep * STEP})`,
        );
      }
    };
    switch (ev.keyCode) {
      case 13:
      case 32:
        handled = true;
        dragTarget = hit ?? null;
        dragIndex = at;
        dragMechanism = "keyboard";
        mouseUp(ev);
        break;
      case 38:
        handled = true;
        // ⚠️ **THE UP ARROW DOES NOT SET `dragMechanism` AND THE DOWN ARROW DOES**
        // (`selection.js:93-115`). It looks like an oversight and it is abcjs's, so a
        // drag begun with the up arrow reports nothing on blur until a down arrow or a
        // click has set the mechanism.
        step(-1);
        break;
      case 40:
        handled = true;
        dragMechanism = "keyboard";
        step(1);
        break;
      case 9:
        // Losing focus: report the drag if there was one.
        if (dragYStep !== 0) mouseUp(ev);
        break;
      default:
        break;
    }
    if (handled) ev.preventDefault?.();
  };

  // `setupSelection`'s own body (`selection.js:4-26`) — the keyboard half only under
  // `dragging`, and only on elements the render marked `selectable="true"`, which is to
  // say only when the host passed a `selectTypes`.
  if (params.dragging === true) {
    for (const b of bound) {
      if (b.node.getAttribute?.("selectable") === "true") {
        b.node.setAttribute?.("tabindex", "0");
        b.node.addEventListener?.("keydown", keyboardDown);
        b.node.addEventListener?.("keyup", keyboardSelection);
        b.node.addEventListener?.("focus", elementFocused);
      }
    }
  }
  for (const svg of svgs) {
    svg.addEventListener?.("touchstart", mouseDown, { passive: true });
    svg.addEventListener?.("touchmove", mouseMove, { passive: true });
    svg.addEventListener?.("touchend", mouseUp, { passive: true });
    svg.addEventListener?.("mousedown", mouseDown);
    svg.addEventListener?.("mousemove", mouseMove);
    svg.addEventListener?.("mouseup", mouseUp);
  }
  return svgs;
}
