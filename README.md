# design-token-codemod

Find hardcoded colors in a codebase, turn them into design tokens, and replace
them with CSS variables. Works in **React, Vue, and Next** — because the output
is `var(--token)`, which is valid everywhere a color literal is (plain CSS,
styled-components/emotion, inline `style={{}}`, Tailwind `[...]`, Vue `<style>`).
No framework-specific codemod needed.

## Usage

```bash
# 1. Find colors -> writes dtoken.tokens.json (frequency-sorted)
npx dtoken scan

# 2. Edit dtoken.tokens.json: rename "color-000000" -> "color-black", etc.
#    The "match" field is what gets found; the key becomes --<name>.

# 3. Preview
npx dtoken apply --dry-run

# 4. Apply (requires a clean git tree) -> also writes dtoken.tokens.css
npx dtoken apply
```

Then import the generated CSS once globally:

```ts
import "./dtoken.tokens.css"; // Next: app/layout.tsx · Vite/Vue: main.ts
```

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
dtoken export               # (re)write CSS + Style Dictionary from tokens.json
```

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
