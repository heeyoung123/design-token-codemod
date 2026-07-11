import assert from "node:assert";
import { canonicalColor, deltaE } from "../src/color.js";
import { buildMatchers } from "../src/matchers.js";

// clustering: different spellings of the same color -> one canonical
assert.equal(canonicalColor("#000"), "#000000");
assert.equal(canonicalColor("rgb(0,0,0)"), "#000000");
assert.equal(canonicalColor("rgb(0 0 0)"), "#000000");
assert.equal(canonicalColor("hsl(0, 0%, 0%)"), "#000000");
assert.equal(canonicalColor("hsl(0 0% 100%)"), "#ffffff");
assert.equal(canonicalColor("rgba(0,0,0,0.5)"), "#00000080");

// named colors: opt-in only
assert.equal(canonicalColor("black"), null);
assert.equal(canonicalColor("black", { named: true }), "#000000");
assert.equal(canonicalColor("transparent", { named: true }), null); // recognized, not tokenized

// rejects non-colors
assert.equal(canonicalColor("#00000"), null);
assert.equal(canonicalColor("rgb(50%,0,0)"), null);

// ΔE: identical=0, near-grays small, black vs white large
assert.equal(deltaE("#000000", "#000000"), 0);
assert.ok(deltaE("#a6a6a6", "#a8a8a8") < 2, "near grays are close");
assert.ok(deltaE("#000000", "#ffffff") > 90, "black vs white far apart");

// color matcher finds hex/rgb/hsl in code, not bare words (named off)
const [colorM] = buildMatchers({ categories: ["color"], namedColors: false });
const code = `background: #000; color: rgba(255,0,0,.5); fill: hsl(0 0% 0%); text: black;`;
assert.deepEqual(
  [...code.matchAll(colorM.re)].map((m) => m[0]).filter((x) => colorM.canonical(x)),
  ["#000", "rgba(255,0,0,.5)", "hsl(0 0% 0%)"],
);

// dimension matcher: px/rem/em, excludes 0
const [, dimM] = buildMatchers({ categories: ["color", "dimension"] });
const css = `margin: 16px; padding: 1.5rem 0; gap: .5em; z-index: 10; border: 0px;`;
assert.deepEqual(
  [...css.matchAll(dimM.re)].map((m) => m[0]).filter((x) => dimM.canonical(x)),
  ["16px", "1.5rem", ".5em"],
);
assert.equal(dimM.autoName("1.5rem"), "size-1-5rem");

console.log("ok - all tests passed");

// media-query breakpoints are masked out (var() is invalid there)
import { mediaRanges, inRanges } from "../src/matchers.js";
const mq = `.a{gap:16px}\n@media (max-width:768px){.a{gap:8px}}`;
const [, dim] = buildMatchers({ categories: ["color", "dimension"] });
const r = mediaRanges(mq);
const kept = [...mq.matchAll(dim.re)]
  .filter((m) => !inRanges(m.index, r))
  .map((m) => m[0]);
assert.deepEqual(kept, ["16px", "8px"], "768px in @media prelude is skipped; 8px in body kept");
console.log("ok - media-query masking");
