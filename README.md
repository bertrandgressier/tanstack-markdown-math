# tanstack-markdown-math

KaTeX-powered math support for [`@tanstack/markdown`](https://tanstack.com/markdown). Renders inline `$...$` and display `$$...$$` math using the extension API.

## Why this exists

`@tanstack/markdown` ships with a fast, streaming-friendly parser, but it has no built-in math support. This package provides a set of extensions that can be dropped into `parseMarkdown()` or the React `<Markdown>` component to add TeX/LaTeX rendering with KaTeX (or any custom renderer).

These extensions were originally extracted from a dense-math, 900+ page corpus and validated with the `@tanstack/markdown` streaming pipeline.

## Install

```bash
pnpm add tanstack-markdown-math @tanstack/markdown katex
# npm install tanstack-markdown-math @tanstack/markdown katex
# yarn add tanstack-markdown-math @tanstack/markdown katex
```

`@tanstack/markdown` (`>=1.0.0`) and `katex` are peer dependencies. A custom `render` option lets you avoid KaTeX at runtime, but it remains a peer dependency for now. `react` (>=18) is an optional peer, only needed for the `tanstack-markdown-math/react` subpath.

## Quick start

### With React

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mathExtension } from 'tanstack-markdown-math'

export function Page() {
  return (
    <Markdown extensions={[mathExtension()]} allowHtml>
      {`The energy is $E = mc^2$.

$$
\\frac{1}{2}
$$`}
    </Markdown>
  )
}
```

> **Important:** in the default `html` output mode, rendered math is emitted as `html`/`inlineHtml` nodes, so you **must** set `allowHtml: true` for anything to show up in the React component. See [Math without `allowHtml`](#math-without-allowhtml-component-output) for the `component` output mode (block and inline).

### With `parseMarkdown()`

```ts
import { parseMarkdown } from '@tanstack/markdown'
import { mathExtension } from 'tanstack-markdown-math'

const doc = parseMarkdown('Energy $E = mc^2$.', {
  extensions: mathExtension(),
})
```

## API

```ts
import {
  mathExtension,
  mathBlockExtension,
  mathInlineExtension,
} from 'tanstack-markdown-math'
```

- `mathExtension(opts?)` → `[mathBlockExtension(opts), mathInlineExtension(opts)]`
- `mathBlockExtension(opts?)` → parses `$$...$$` blocks into `html` nodes (`component` nodes with `output: 'component'`).
- `mathInlineExtension(opts?)` → registers a `$` inline parser (`@tanstack/markdown` 1.0 `inlineParser`) that converts `$...$` / `$$...$$` into `inlineHtml` nodes (`inlineComponent` nodes with `output: 'component'`).

The extensions also export helpers used when pre-processing content through other tools:

- `protectMath(content)` → **deprecated** (not needed with `@tanstack/markdown` >= 1.0; math is parsed before emphasis/escape handling). Replaces replaces `\`, `_` and `*` inside math spans with private-use characters (`MATH_BACKSLASH_SUB`, `MATH_UNDERSCORE_SUB`, `MATH_ASTERISK_SUB`) so other markdown passes cannot unescape TeX commands or turn subscripts into emphasis. Kept for pre-protected content.
- `restoreMathChars(tex)` → **deprecated**, inverse mapping, applied automatically before rendering (no-op when content was not protected).

### `MathOptions`

| Option         | Type                                            | Default     | Description                                                                                                                                                              |
| -------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `render`       | `(tex: string, displayMode: boolean) => string` | KaTeX       | Custom renderer. Receives raw TeX and whether it should be rendered in display mode. Great for MathJax, server-side rendering, or mocking in tests.                      |
| `allowSpaces`  | `boolean`                                       | `false`     | Inline-math only. When `true`, allows spaces inside delimiters (`$ x $`). When `false`, matches only non-whitespace math (`$x$`), preventing false positives like `$5`. |
| `output`       | `'html' \| 'component'`                         | `'html'`    | Block and inline math. `'component'` emits `component`/`inlineComponent` nodes carrying raw TeX, removing the `allowHtml` requirement (see below).                        |
| `tagName`      | `string`                                        | `'MathBlock'` | Block-math only. Tag name of the `component` node, to be mapped through the renderers' `components` option.                                                            |
| `inlineTagName`| `string`                                        | `'MathInline'` | Inline-math only. Tag name of the `inlineComponent` node, to be mapped through the renderers' `components` option.                                                      |
| `unclosedBlock`| `boolean`                                       | `true`      | Block-math only. `true` renders an unclosed `$$` block as partial math (streaming-friendly). `false` leaves it as plain text until the closing `$$` arrives.            |
| `cache`        | `boolean \| number`                             | `true`      | Render cache (LRU, 1000 entries). `false` disables it — use this with an impure custom `render` (side effects, non-deterministic output). A number sets a custom entry limit. |

`mathBlockExtension` accepts `render`, `output`, `tagName`, `unclosedBlock` and `cache`; `mathInlineExtension` accepts `render`, `allowSpaces`, `output`, `inlineTagName` and `cache`.

## Math without `allowHtml` (component output)

With `output: 'component'`, math is emitted as `component` (block) / `inlineComponent` (inline) nodes carrying the raw TeX in `properties.tex`, instead of pre-rendered `html`/`inlineHtml` nodes. The AST stays serialization-clean and no `allowHtml` is needed.

> Requires `@tanstack/markdown` >= 1.0.0.

**HTML renderer** — zero configuration: the extension ships a `renderHtml` hook that renders both block and inline component nodes.

```ts
import { renderHtml } from '@tanstack/markdown'
import { mathExtension } from 'tanstack-markdown-math'

const html = renderHtml('Energy $E = mc^2$.\n\n$$\\frac{1}{2}$$', {
  extensions: mathExtension({ output: 'component' }),
}) // → KaTeX HTML, no allowHtml
```

**React renderer** — map the tag names to the provided components:

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mathExtension } from 'tanstack-markdown-math'
import { MathBlock, MathInline } from 'tanstack-markdown-math/react'

export function Page() {
  return (
    <Markdown
      extensions={mathExtension({ output: 'component' })}
      components={{ MathBlock, MathInline }}
    >
      {'The energy is $E = mc^2$.\n\n$$\\frac{1}{2}$$'}
    </Markdown>
  )
}
```

`MathBlock` renders `properties.tex` via KaTeX in display mode, `MathInline` in inline mode; provide your own components (`{ tex }` props) for full control. Without a `components` mapping, the nodes fall back to plain `<MathBlock tex="...">` / `<MathInline tex="...">` elements.

## Inline math modes

### Strict mode (default)

```ts
mathInlineExtension()
```

- `$x$` → rendered math
- `$5` or `$ 5 $` → left as literal text
- `$5 and $10`, `$5-$10` → left as literal text (no false monetary positives: whitespace before the closing `$`, or a digit right after it, rejects the span)
- `\$5` → escaped dollar, literal text; `$a \$ b$` → valid math containing an escaped dollar
- `_`, `*` and `\` inside math need no pre-protection (`protectMath` is no longer required)

### Permissive mode

```ts
mathInlineExtension({ allowSpaces: true })
```

- Matches any pair of `$...$` on the same line, including `$ 5 $`.
- Use this only when your content is audited, because it will happily turn `$5 and $10` into two math expressions.

## Supported inline containers

Inline math is detected in:

- paragraphs
- headings
- strong / emphasis / strikethrough
- links
- blockquotes
- callouts
- list items (recursive)
- table cells (recursive)

Inline math is explicitly skipped inside:

- code blocks
- inline code
- structural block HTML (e.g. `<div>...</div>`)

Math inside inline HTML **is** rendered: `$` spans inside `inlineHtml` nodes (e.g. `<u>$V_1$</u>`) and inside inline-style HTML blocks (`<u>`, `<span>`, `<em>`, `<strong>`, `<b>`, `<i>`, `<font>`, `<small>`, `<sub>`, `<sup>`, `<mark>`) are converted in place.

## Block math

Fenced display math recognizes both multi-line and single-line forms:

```md
$$
\\frac{1}{2}
$$
```

```md
$$ \\frac{1}{2} $$
```

Unclosed `$$` blocks are consumed to the end of the document and rendered as partial math without crashing. This is important for streaming UIs. Set `unclosedBlock: false` to leave unclosed blocks as plain text instead.

The opening fence may be indented by at most 3 spaces; 4-space-indented `$$` stays an indented code block.

## Streaming

Because `@tanstack/markdown` extensions run during document parsing, both block and inline extensions handle incomplete input with the same parser-created AST. An unclosed `$$` block produces an `html` node (`component` node in component mode) rendered as partial math; an unclosed `$...$` pair is left as literal text until the closing delimiter arrives.

## Edge cases

- Several inline math expressions on the same line are each rendered separately.
- Math inside inline HTML (`<u>$x$</u>`) is rendered; structural block HTML containing `$` is left untouched.
- Code fences / inline code containing `$` are preserved verbatim.
- Invalid TeX renders as a neutral error element instead of raw KaTeX output (default renderer only): `<span class="katex-error-badge">` inline and `<div class="katex-error-box">` in display mode, with English text ("KaTeX error"). Style these classes yourself; the React components use the same output.
- Heading anchors: math is now parsed as part of the heading's inline content, so generated heading slugs are derived from the heading's plain text and no longer include math fragments.
- Math is trimmed in both output modes (`$$ x $$` → `x`).
- `mathBlockExtension` runs before built-in block parsers because it is registered earlier in the extension array.

## Design notes

These notes follow the upstream discussion in [TanStack/markdown#13](https://github.com/TanStack/markdown/issues/13) (consolidated into [#9](https://github.com/TanStack/markdown/issues/9)):

1. **First-class math nodes vs. html injection**
   The default mode emits `html`/`inlineHtml` nodes. The `component` output mode uses `ComponentNode` and `InlineComponentNode`: raw TeX in the AST, rendering deferred to the renderer (`renderHtml` hook / React `components` map), no `allowHtml`.

2. **`inlineParser` instead of an AST walker**
   Since `@tanstack/markdown` 1.0, extensions can register an `inlineParser` with `markers: '$'`. The parser sees the raw source before emphasis, escapes and links are resolved, so math bodies containing `_`, `*` or `\` are never corrupted and `protectMath` is unnecessary. Spans are recognised in every inline context (headings, links, lists, tables, ...) and never inside code.

3. **Pandoc-style delimiter rules**
   Single `$` spans reject whitespace after the opener and before the closer, reject a closer followed by a digit (`$5-$10`), honour `\$` escapes, and stop at blank lines. Scanning is linear. A small `transformDocument` remains only for block-level raw HTML nodes (`allowHtml`), and it builds new nodes instead of mutating the input so cached ASTs can be re-parsed safely.

## Upgrading to v1

1. **Peer dependency raised to `@tanstack/markdown` >= 1.0.0.** Migrate with `pnpm add @tanstack/markdown@^1 tanstack-markdown-math@^1` (or the npm/yarn equivalent).
2. **`protectMath` / `restoreMathChars` are deprecated.** Remove your `protectMath(content)` calls before parsing: math containing `_`, `*` and `\` now works as-is. Both functions remain exported for already-protected content.
3. **Heading slugs change when headings contain inline math.** Math is now parsed inside the heading's inline content, so regenerate any stored heading anchors / table-of-contents links / deep links for headings that contain `$...$`.
4. **Default error output changed.** Invalid TeX now renders `<span class="katex-error-badge">` (inline) / `<div class="katex-error-box">` (display) with English text ("KaTeX error") instead of Tailwind utility classes and French strings. Add your own CSS for `katex-error-badge` / `katex-error-box`, or pass a custom `render` to keep your previous markup.

## License

MIT © 2026 Bertrand Gressier
