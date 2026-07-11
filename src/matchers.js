import { canonicalColor } from "./color.js";

// A matcher knows how to find one category of hardcoded value, normalize it to
// a canonical string, and suggest a token name. Canonicals across categories
// never collide (colors start with '#', dimensions end with a unit), so a
// single canonical->token map works for all of them.

const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const colorMatcher = (opts) => ({
  category: "color",
  // hex | rgb()/rgba() | hsl()/hsla() | (optionally) named color words
  re: opts.named
    ? /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-zA-Z]{3,20}\b/g
    : /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g,
  canonical: (raw) => canonicalColor(raw, { named: opts.named }),
  autoName: (canon) => "color-" + canon.replace("#", ""),
});

// px / rem / em dimensions. Excludes 0 (no unit or zero value = not a token).
// Covers spacing AND font-size/radius — they share px/rem syntax and can't be
// told apart without property context (that needs AST). One "size-" scale keeps
// it honest; the user names them.
// ponytail: value-based, not context-based. AST if you truly need spacing≠fontSize split.
// Ranges where a dimension must NOT be tokenized because var() is invalid there:
//   - @media/@container/@supports preludes (CSS)
//   - (min|max)-(width|height: ...) feature expressions anywhere, which also
//     covers JS media-query strings like matchMedia('(min-width: 768px)').
// Tokenizing a breakpoint in these spots produces broken CSS / a query that
// never matches. Dimensions inside these ranges are left alone.
export function mediaRanges(text) {
  const re = /@(?:media|container|supports)[^{]*|\((?:min|max)-(?:width|height)[^)]*\)/g;
  const ranges = [];
  for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

export const inRanges = (i, ranges) => ranges.some(([s, e]) => i >= s && i < e);

const dimensionMatcher = () => ({
  category: "dimension",
  re: /(?<![\w.#-])\d*\.?\d+(px|rem|em)\b/g,
  blocked: mediaRanges, // skip breakpoints in @media/@container/@supports
  canonical: (raw) => {
    const s = raw.trim().toLowerCase();
    return parseFloat(s) === 0 ? null : s;
  },
  autoName: (canon) => "size-" + sanitize(canon),
});

export function buildMatchers(config) {
  const cats = config.categories ?? ["color"];
  const list = [];
  if (cats.includes("color")) list.push(colorMatcher({ named: config.namedColors }));
  if (cats.includes("dimension")) list.push(dimensionMatcher());
  return list;
}
