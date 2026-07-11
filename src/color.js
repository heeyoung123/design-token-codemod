// Color normalization + perceptual distance.
// Everything collapses to a canonical `#rrggbb` (or `#rrggbbaa` when alpha < ff)
// so #000, #000000, rgb(0,0,0), hsl(0 0% 0%), and "black" all cluster to one token.

// Common CSS named colors -> hex. Subset of the 148 keywords: the ones that
// actually show up in product code. Extend if a scan needs more.
// ponytail: curated subset, not all 148 — add names when a real codebase wants them.
export const NAMED_COLORS = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
  blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", gold: "#ffd700",
  pink: "#ffc0cb", brown: "#a52a2a", cyan: "#00ffff", magenta: "#ff00ff",
  lime: "#00ff00", navy: "#000080", teal: "#008080", olive: "#808000",
  maroon: "#800000", aqua: "#00ffff", fuchsia: "#ff00ff", coral: "#ff7f50",
  salmon: "#fa8072", tomato: "#ff6347", crimson: "#dc143c", indigo: "#4b0082",
  violet: "#ee82ee", khaki: "#f0e68c", beige: "#f5f5dc", ivory: "#fffff0",
  transparent: null, // recognized but never tokenized
};

function toHex(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

function canonicalFromHex8(h) {
  return h.slice(6) === "ff" ? "#" + h.slice(0, 6) : "#" + h;
}

// h in deg, s/l in %  -> [r,g,b] 0-255
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

export function canonicalColor(raw, { named = false } = {}) {
  const s = String(raw).trim().toLowerCase();

  if (named && Object.prototype.hasOwnProperty.call(NAMED_COLORS, s)) {
    return NAMED_COLORS[s]; // may be null (transparent) -> skipped upstream
  }

  if (s[0] === "#") {
    let h = s.slice(1);
    if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/.test(h)) return null;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 6) h += "ff";
    return canonicalFromHex8(h);
  }

  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const p = rgb[1].split(/[,/\s]+/).filter(Boolean);
    if (p.length < 3) return null;
    const [r, g, b] = p.slice(0, 3).map(Number); // percentages -> NaN -> skip
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    const a = p[3] !== undefined ? Number(p[3]) : 1;
    if (Number.isNaN(a)) return null;
    return canonicalFromHex8(toHex(r) + toHex(g) + toHex(b) + toHex(a * 255));
  }

  const hsl = s.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const p = hsl[1].split(/[,/\s]+/).filter(Boolean).map((x) => parseFloat(x));
    if (p.length < 3 || p.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    const [r, g, b] = hslToRgb(p[0], p[1], p[2]);
    const a = p[3] !== undefined ? p[3] : 1;
    return canonicalFromHex8(toHex(r) + toHex(g) + toHex(b) + toHex(a * 255));
  }

  return null;
}

// canonical (#rrggbb[aa]) -> [r,g,b]  (alpha ignored for distance)
function rgbOf(canon) {
  const h = canon.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const srgbToLin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(srgbToLin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// ΔE76 (Euclidean in CIE Lab). Good enough to cluster near-identical grays;
// ponytail: ΔE76 not ΔE2000 — swap the formula if you need better hue accuracy.
export function deltaE(canonA, canonB) {
  const a = rgbToLab(rgbOf(canonA));
  const b = rgbToLab(rgbOf(canonB));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
