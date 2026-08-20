/**
 * **THE SHAPE `parseOnly`'s TUNE IS REDUCED TO, WRITTEN ONCE.**
 *
 * `scripts/harvest-abcjs-parse-only.ts` runs it over abcjs 6.7.0 and
 * `tests/parse-only.test.ts` over ours — one file, so the two reductions cannot drift.
 *
 * ⚠️ **`undefined` IS NOT A FIELD.** `exactOptionalPropertyTypes` means our side omits a
 * key where abcjs sometimes assigns `undefined` to it, and counting those would report a
 * difference no host can observe.
 */
import type { AbcLine } from "../src/compat/lines.js";

/** Every own property name of an element, plus the two objects the engraver reaches into. */
export const fieldsOf = (el: Record<string, unknown>, prefix: string, into: Set<string>): void => {
  for (const key of Object.keys(el)) {
    const value = el[key];
    if (value === undefined) continue;
    into.add(prefix + key);
    if (key === "pitches" && Array.isArray(value))
      for (const p of value) fieldsOf(p as Record<string, unknown>, "pitches.", into);
    if (key === "rest" && value !== null && typeof value === "object")
      fieldsOf(value as Record<string, unknown>, "rest.", into);
    if (key === "gracenotes" && Array.isArray(value))
      for (const g of value) fieldsOf(g as Record<string, unknown>, "gracenotes.", into);
  }
};

/** One tune as rows: the staff furniture's `el_type`, then the fields per element kind. */
export const rowsOfTune = (tune: { lines?: readonly AbcLine[] }): string[] => {
  const byType = new Map<string, Set<string>>();
  const staffFields = new Map<string, Set<string>>();
  const staffTypes = new Map<string, Set<string>>();
  for (const line of tune.lines ?? []) {
    if (line.staff === undefined) continue;
    for (const staff of line.staff) {
      for (const which of ["clef", "key", "meter"]) {
        const field = (staff as unknown as Record<string, unknown>)[which] as
          | Record<string, unknown>
          | undefined;
        if (field === undefined) continue;
        if (!staffFields.has(which)) staffFields.set(which, new Set());
        if (!staffTypes.has(which)) staffTypes.set(which, new Set());
        fieldsOf(field, "", staffFields.get(which) as Set<string>);
        (staffTypes.get(which) as Set<string>).add(String(field["el_type"]));
      }
      for (const voice of staff.voices ?? []) {
        for (const el of voice) {
          const type = String(el.el_type);
          if (!byType.has(type)) byType.set(type, new Set());
          fieldsOf(el as unknown as Record<string, unknown>, "", byType.get(type) as Set<string>);
        }
      }
    }
  }
  const rows: string[] = [];
  for (const which of ["clef", "key", "meter"]) {
    const fields = staffFields.get(which);
    if (fields === undefined) continue;
    rows.push(
      `staff.${which} el_type=${[...(staffTypes.get(which) as Set<string>)].sort().join("|")} ${[...fields].sort().join(",")}`,
    );
  }
  for (const type of [...byType.keys()].sort())
    rows.push(`${type} ${[...(byType.get(type) as Set<string>)].sort().join(",")}`);
  return rows;
};
