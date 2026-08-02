# design-token-codemod

Find hardcoded colors in a codebase, turn them into design tokens, and replace
them with CSS variables. Works in **React, Vue, and Next** — because the output
is `var(--token)`, which is valid everywhere a color literal is (plain CSS,
styled-components/emotion, inline `style={{}}`, Tailwind `[...]`, Vue `<style>`).
No framework-specific codemod needed.

## Install

```bash
# one-off, no install
npx design-token-codemod scan

# or add to a project
npm install -D design-token-codemod
```

The CLI is exposed as `dtoken`.

## Usage

A typical run goes **scan → name → preview → apply**. Run it from your
project root.

```bash
# 1. Scan the codebase. Writes dtoken.tokens.json, sorted by frequency.
dtoken scan

# 2. Give the tokens real names. Two ways:
#    a) Edit dtoken.tokens.json by hand: rename the key "color-000000" -> "color-black".
#       Only the key changes; the "match" field keeps the value it finds.
#    b) Or name them interactively (Enter = accept suggestion, s = skip):
dtoken scan --interactive

# 3. Preview every replacement as a diff — nothing is written.
dtoken apply --dry-run

# 4. Apply. Requires a clean git tree so you can review with `git diff`.
#    Also writes dtoken.tokens.css and dtoken.tokens.sd.json.
dtoken apply
```

Then import the generated CSS once, globally:

```ts
import "./dtoken.tokens.css"; // Next.js: app/layout.tsx · Vite/Vue: main.ts
```

That's it — every replaced value now reads from a CSS variable, so React, Vue,
and Next all pick up the same tokens with no per-framework setup.

### Tip: go incrementally

Don't tokenize everything at once. Start with colors only (the safe category),
review the diff, commit, then turn on dimensions. Use `scan --interactive` to
keep just the values worth a token and skip the rest.

## tokens.json

```json
{
  "color-black": { "value": "#000000", "match": "#000000", "count": 42 }
}
```

- **key** — token name, becomes `--color-black`
- **value** — emitted into `:root { }`
- **match** — canonical color the scanner matches (rename the key freely; matching is unaffected)

Colors are normalized before clustering, so `#000`, `#000000`, and `rgb(0,0,0)`
all map to one token.

## Config (optional) — `dtoken.config.json`

```json
{
  "patterns": ["src/**/*.{css,scss,ts,tsx,vue}"],
  "ignore": ["**/node_modules/**"],
  "tokensFile": "dtoken.tokens.json",
  "cssOutput": "src/tokens.css",
  "cssSelector": ":root"
}
```

## Commands

```bash
dtoken scan                 # find values -> dtoken.tokens.json
dtoken scan --interactive   # prompt for each token name (Enter=accept, s=skip)
dtoken apply --dry-run      # preview (marks exact vs "approx ΔE 0.7")
dtoken apply                # replace + write CSS + Style Dictionary JSON
dtoken apply --tailwind     # rewrite classNames to named utilities (see below)
dtoken export               # (re)write CSS + Style Dictionary from tokens.json
```

## Tailwind: named utilities instead of `var()`

If your palette lives in `@theme`, Tailwind already generates named utilities
(`text-primary-400`, `bg-primary-400`, …). There you don't want
`text-[var(--primary-400)]` — you want the utility. `--tailwind` rewrites the
whole class:

```bash
dtoken apply --tailwind --dry-run   # preview
dtoken apply --tailwind             # text-[#3b82f6]  ->  text-primary-400
```

```diff
- <div className="text-[#3b82f6] bg-[#3B82F6]/50 border-[color:#3b82f6]" />
+ <div className="text-primary-400 bg-primary-400/50 border-primary-400" />
```

- The **token name is the utility suffix.** Name the token to match your
  `@theme` palette: `@theme` has `--color-primary-400` → name the token
  `color-primary-400` (the `color-` prefix is dropped in the utility); if it's
  `--primary-400`, name it `primary-400`.
- Opacity (`/50`) and the `[color:#hex]` form are preserved; colors with no
  token are left untouched (safe to run incrementally).
- Colors come from `@theme`, so `--tailwind` writes **no** CSS or Style
  Dictionary output — nothing to import.

## What it detects

- **color** (always): hex, `rgb()/rgba()`, `hsl()/hsla()`. `#000`, `#000000`, `rgb(0,0,0)`, `hsl(0 0% 0%)` all cluster to one token.
- **dimension** (enable `"categories": ["color","dimension"]`): `px`/`rem`/`em`. Covers spacing + font-size + radius — they share syntax and can't be split without AST, so they share one `size-*` scale you name.
- **named colors** (`"namedColors": true`, off by default): matches `black`/`white` words. Risky — hits classNames and prose — so opt-in.

## Approximate matching (ΔE)

Set `"approxDeltaE": 3`. On apply, a color with no exact token maps to the
nearest token within that CIE ΔE distance, labeled `(approx ΔE 0.7)`. Great for
collapsing near-identical grays (`#a6a6a6` → `--color-gray-40`). `0` = exact only.

## Style Dictionary export

`apply`/`export` also write `dtoken.tokens.sd.json` in Style Dictionary format
(`{ color: { black: { value } }, size: {...} }`). Feed it to `style-dictionary`
to generate SCSS/JS/iOS/Android from the same source. Skip it if you only ship web.

## Scope / limits

- Regex-based (safe: color/dimension syntax is self-delimiting; `--dry-run` + clean-git guard back it up). Move to AST only if a real false positive appears.
- ΔE76, not ΔE2000. Percentage `rgb(50% ..)` and unitless font-weight not handled (needs property context = AST).
