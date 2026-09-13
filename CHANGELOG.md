# Changelog

## 0.3.0

### Summary

Inline math joins the `component` output mode, using the new `inlineComponent` node type added upstream in [`@tanstack/markdown` 0.0.15](https://github.com/TanStack/markdown/pull/17). Full math rendering (block + inline) now works **without `allowHtml`**, with a serialization-clean AST.

### Changes

- **Inline component output** — `mathInlineExtension({ output: 'component' })` emits `inlineComponent` nodes (`{ name: 'math', tagName: 'MathInline', properties: { tex } }`) instead of pre-rendered `inlineHtml`. The extension's `renderHtml` hook renders them in the HTML renderer (KaTeX inline mode, no `allowHtml`), and React consumers map them via `components: { MathInline }`.
- **New `MathInline` React component** — exported from `tanstack-markdown-math/react`; renders `tex` via KaTeX in inline mode (`displayMode: false` by default).
- **New `inlineTagName` option** — customizes the inline component tag name (default `'MathInline'`). `tagName` remains block-only.
- **`output: 'component'` on `mathExtension()` now applies to both block and inline math** — previously inline math always stayed `inlineHtml`.
- **Trimmed TeX payloads** — inline component `properties.tex` is trimmed, keeping the AST clean when `allowSpaces` captures edge whitespace.
- **LRU render cache** — every extension instance wraps its renderer in a transparent cache keyed by `(tex, displayMode)` (max 1000 entries by default). Repeated formulas and streaming re-parses skip redundant KaTeX calls: on a dense 262 KB medical corpus (~1156 formulas, 37% repeats), parse+render drops from ~44 ms to ~11 ms (html mode) and ~49 ms to ~8 ms (component mode). Custom `render` functions are cached too (assumed pure); thrown errors are never cached.
- **New `cache` option** — `cache: false` disables the render cache (for impure custom renderers); `cache: <number>` sets a custom entry limit.
- **Memoized React components** — `MathBlock` and `MathInline` are wrapped in `React.memo` keyed on `(tex, displayMode)`, so React re-renders no longer re-run KaTeX for unchanged formulas.
- **33 new integration tests** (TDD, written before implementation) covering parsing in all inline containers, real-world formula extraction from a dense medical corpus (chemistry brackets, Greek letters, French decimal commas, multi-math sentences, prose/money dollar false positives, code protection, `protectMath` round-trip), HTML rendering without `allowHtml`, custom renderers, JSON round-trips, React `components` mapping, SSR, streaming behavior, and render-cache semantics.

### Impact on consumers

**No action required for existing code.** The default output mode (`'html'`) is unchanged and fully backward compatible.

- If you use `mathExtension({ output: 'component' })` (introduced in 0.2.0): inline math now also emits `inlineComponent` nodes instead of `inlineHtml`. Map `MathInline` in your `components` option (or your own component reading `props.tex`) to render it; the HTML renderer needs nothing.
- Inline `output: 'component'` requires `@tanstack/markdown` >= 0.0.15. The default `'html'` mode still works with >= 0.0.13.
- If you pass a **custom `render` function, its results are now cached** (it is assumed pure). If your renderer relies on side effects or produces non-deterministic output, set `cache: false` on the extension options.

## 0.2.1

### Changes

- **Protect TeX backslashes and LaTeX braces** — `protectMath` now protects backslashes (`\`) inside math formulas (`MATH_BACKSLASH_SUB`), preventing CommonMark parsers from stripping backslashes before markdown characters like `\{`, `\}`, or collapsing double backslashes `\\` in matrices and aligned equations.
- **Fix multiline block closing delimiter** — `mathBlockExtension` now recognizes `$$` at the end of a line even when attached directly to code without preceding whitespace (e.g. `\end{aligned}$$` or `\end{matrix}$$`), preventing block fences from swallowing subsequent lines.

## 0.2.0

### Summary

New opt-in `component` output mode for block math that works **without `allowHtml`**, a React subpath with a ready-made `MathBlock` component, math protection helpers, styled KaTeX error reporting, several parsing improvements, wider `@tanstack/markdown` peer range, and a streaming bug fix.

### Changes

**New output mode & React**

- **`output: 'component'` for block math** — `mathBlockExtension({ output: 'component' })` emits a `ComponentNode` (`name: 'math'`, raw TeX in `properties.tex`) instead of a pre-rendered `html` node. The extension also registers a `renderHtml` hook, so the HTML renderer renders KaTeX with **zero config and no `allowHtml`**.
- **`tagName` option** (default `'MathBlock'`) — custom element/component name for the emitted node.
- **React subpath** — `import { MathBlock } from 'tanstack-markdown-math/react'` renders `tex` via KaTeX (`displayMode` defaults to `true`). Map it with `<Markdown components={{ MathBlock }}>` to render block math without `allowHtml`.

**Math protection helpers (new exports)**

- **`protectMath(content)`** — replaces `_` and `*` inside `$...$` / `$$...$$` spans with private-use Unicode placeholders (`MATH_UNDERSCORE_SUB`, `MATH_ASTERISK_SUB`) before markdown parsing, preventing the parser from turning TeX subscripts (`$H_2O$`) into emphasis.
- **`restoreMathChars(tex)`** — restores the original characters. Called automatically by the extensions before rendering; exported for custom renderers and tests.

**Error reporting**

- **Styled KaTeX errors** — invalid TeX now renders a styled inline badge / display box (Tailwind classes, `katex-error` marker preserved) showing the error title and the offending TeX, instead of KaTeX's raw red fallback. Detection covers both `class="katex-error"` and the `#cc0000` legacy output. A `try/catch` around `renderToString` guards against throwing renderers.

**Parsing improvements**

- **Inline `$$...$$`** — display-style delimiters used inline (e.g. `text $$\rightarrow$$ text`) are now rendered as inline math via the inline extension.
- **`$$x$$ trailing text` no longer swallows the page** — a line like `$$\rightarrow$$ Identification des mécanismes` is treated as a paragraph with inline math, not an unclosed block fence.
- **Math inside `inlineHtml`** — math inside inline HTML elements (e.g. `<u>$V_1$</u>`) is now rendered when `allowHtml` is on.
- **Bug fix (streaming)** — an unclosed single-line `$$\frac{1}{` no longer drops the TeX after the opening `$$`; the partial content is rendered as before.

**Packaging**

- **Peer range widened** — `@tanstack/markdown` is now `>=0.0.13 <0.1.0` (was `^0.0.13`, which excluded `0.0.14`).

### Impact on existing users

**No action required for basic usage.** The public API is additive only (`output`, `tagName`, `protectMath`, `restoreMathChars` are optional/new). However, three behaviors are new by default — review if your content matches:

1. **Invalid TeX output changed** — previously KaTeX's raw red error HTML; now a styled badge/box (still contains `katex-error` for detection). Custom `render` options are unaffected.
2. **Inline `$$...$$` is now math** — documents using literal doubled dollars inline will now render math there. Escape as `\$` if you need literal text.
3. **Math inside inline HTML is now transformed** — with `allowHtml: true`, `$...$` inside inline HTML elements renders as math (previously left verbatim).

`allowHtml: true` is still required for the default `html`/`inlineHtml` output — in particular for inline math (see known limitation below).

### Optional: block math without `allowHtml`

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mathExtension, MathBlock } from 'tanstack-markdown-math/react'
// or: import { mathExtension } from 'tanstack-markdown-math'

<Markdown
  extensions={mathExtension({ output: 'component' })}
  components={{ MathBlock }}
>
  {source}
</Markdown>
```

### Optional: underscore-heavy documents

```ts
import { parseMarkdown } from '@tanstack/markdown'
import { mathExtension, protectMath } from 'tanstack-markdown-math'

const doc = parseMarkdown(protectMath(source), {
  extensions: mathExtension(),
})
```

### Known limitation

Inline math (`$...$`) still requires `allowHtml: true`. First-class inline component nodes are tracked upstream in [TanStack/markdown#9](https://github.com/TanStack/markdown/issues/9); this package will adopt them when available.

## 0.1.1

- Docs: correct the claim that `transformInline` is never called in `@tanstack/markdown` 0.0.13 — it is called once per inline container. No code changes.

## 0.1.0

- Initial release: `mathExtension`, `mathBlockExtension`, `mathInlineExtension` with KaTeX rendering, strict-by-default inline matching, streaming-safe parsing.
