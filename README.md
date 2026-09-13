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

`@tanstack/markdown` and `katex` are peer dependencies. A custom `render` option lets you avoid KaTeX at runtime, but it remains a peer dependency for now. `react` (>=18) is an optional peer, only needed for the `tanstack-markdown-math/react` subpath.

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
- `mathBlockExtension(opts?)` → parses `$$...$$` blocks into `html` nodes.
- `mathInlineExtension(opts?)` → walks the AST and converts `$...$` into `inlineHtml` nodes.

### `MathOptions`

| Option         | Type                                            | Default     | Description                                                                                                                                                              |
| -------------- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `render`       | `(tex: string, displayMode: boolean) => string` | KaTeX       | Custom renderer. Receives raw TeX and whether it should be rendered in display mode. Great for MathJax, server-side rendering, or mocking in tests.                      |
| `allowSpaces`  | `boolean`                                       | `false`     | Inline-math only. When `true`, allows spaces inside delimiters (`$ x $`). When `false`, matches only non-whitespace math (`$x$`), preventing false positives like `$5`. |
| `output`       | `'html' \| 'component'`                         | `'html'`    | Block and inline math. `'component'` emits `component`/`inlineComponent` nodes carrying raw TeX, removing the `allowHtml` requirement (see below).                        |
| `tagName`      | `string`                                        | `'MathBlock'` | Block-math only. Tag name of the `component` node, to be mapped through the renderers' `components` option.                                                            |
| `inlineTagName`| `string`                                        | `'MathInline'` | Inline-math only. Tag name of the `inlineComponent` node, to be mapped through the renderers' `components` option.                                                      |
| `cache`        | `boolean \| number`                             | `true`      | Render cache (LRU, 1000 entries). `false` disables it — use this with an impure custom `render` (side effects, non-deterministic output). A number sets a custom entry limit. |

`mathBlockExtension` accepts `render`, `output`, `tagName` and `cache`; `mathInlineExtension` accepts `render`, `allowSpaces`, `output`, `inlineTagName` and `cache`.

## Math without `allowHtml` (component output)

With `output: 'component'`, math is emitted as `component` (block) / `inlineComponent` (inline) nodes carrying the raw TeX in `properties.tex`, instead of pre-rendered `html`/`inlineHtml` nodes. The AST stays serialization-clean and no `allowHtml` is needed.

> Inline component output requires `@tanstack/markdown` >= 0.0.15 (`inlineComponent` node type, landed via [PR #17](https://github.com/TanStack/markdown/pull/17)).

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
- `$5 and $10` → left as literal text (no false monetary positives)

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
- raw html blocks / inline html

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

Unclosed `$$` blocks are consumed to the end of the document and rendered as partial math without crashing. This is important for streaming UIs.

## Streaming

Because `@tanstack/markdown` extensions run during document parsing, both block and inline extensions handle incomplete input with the same parser-created AST. An unclosed `$$` block produces an `html` node; an unclosed `$...$` pair is left as literal text until the closing delimiter arrives.

## Edge cases

- Several inline math expressions on the same line are each rendered separately.
- Raw HTML containing `$` is not parsed as math.
- Code fences / inline code containing `$` are preserved verbatim.
- `mathBlockExtension` runs before built-in block parsers because it is registered earlier in the extension array.

## Design notes

These notes follow the upstream discussion in [TanStack/markdown#13](https://github.com/TanStack/markdown/issues/13) (consolidated into [#9](https://github.com/TanStack/markdown/issues/9)):

1. **First-class math nodes vs. html injection**
   The default mode emits `html`/`inlineHtml` nodes. The `component` output mode demonstrates the richer design enabled by `ComponentNode` and `InlineComponentNode` (added in `@tanstack/markdown` 0.0.15, [PR #17](https://github.com/TanStack/markdown/pull/17)): raw TeX in the AST, rendering deferred to the renderer (`renderHtml` hook / React `components` map), no `allowHtml`.

2. **`transformDocument` vs `transformInline`**
   `transformInline` is called once per inline container (paragraph, heading, list item, table cell) with the container's top-level nodes, during parsing. This implementation instead uses `transformDocument`, which traverses the fully parsed AST. Both work in 0.0.13; `transformInline` would avoid the full-document walk and could simplify future versions.

3. **Inline parsing order**
   Inline math must be processed after bold, italic, links, and code have already been parsed into typed nodes, so the walker skips typed nodes that should not contain math. A true inline transformer in the parser would achieve the same result more cleanly.

## License

MIT © 2026 Bertrand Gressier
