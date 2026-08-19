/** Our `tuneMetrics` for one file — `F=<path>` */
import { readFileSync } from "node:fs";
import { tuneMetrics } from "../src/compat/index.js";
console.log(
  JSON.stringify(tuneMetrics(readFileSync(process.env.F ?? "", "utf8"), {})[0]?.sections),
);
