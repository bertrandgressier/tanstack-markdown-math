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

> **Important:** rendered math is emitted as `html`/`inlineHtml` nodes, so you **must** set `allowHtml: true` for anything to show up in the React component. See [Block math without `allowHtml`](#block-math-without-allowhtml-component-output) for the `component` output mode.

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
| `output`       | `'html' \| 'component'`                         | `'html'`    | Block-math only. `'component'` emits a `component` node carrying raw TeX, removing the `allowHtml` requirement (see below).                                              |
| `tagName`      | `string`                                        | `'MathBlock'` | Block-math only. Tag name of the `component` node, to be mapped through the renderers' `components` option.                                                            |

`mathBlockExtension` accepts `render`, `output` and `tagName`; `mathInlineExtension` accepts `render` and `allowSpaces`.

## Block math without `allowHtml` (component output)

With `output: 'component'`, block math is emitted as a `component` node carrying the raw TeX in `properties.tex`, instead of a pre-rendered `html` node. The AST stays serialization-clean and no `allowHtml` is needed.

**HTML renderer** — zero configuration: the extension ships a `renderHtml` hook that renders the component node.

```ts
import { renderHtml } from '@tanstack/markdown'
import { mathBlockExtension } from 'tanstack-markdown-math'

const html = renderHtml('$$\n\\frac{1}{2}\n$$', {
  extensions: [mathBlockExtension({ output: 'component' })],
}) // → KaTeX HTML, no allowHtml
```

**React renderer** — map the tag name to the provided component:

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mathExtension } from 'tanstack-markdown-math'
import { MathBlock } from 'tanstack-markdown-math/react'

export function Page() {
  return (
    <Markdown
      extensions={mathExtension({ output: 'component' })}
      components={{ MathBlock }}
    >
      {'$$\n\\frac{1}{2}\n$$'}
    </Markdown>
  )
}
```

`MathBlock` renders `properties.tex` via KaTeX in display mode; provide your own component (`{ tex }` props) for full control. Without a `components` mapping, the node falls back to a plain `<MathBlock tex="...">` element.

> **Inline math note:** the `component` mode currently applies to block math only. Inline math still requires `allowHtml: true` because `@tanstack/markdown` has no extension hook for custom inline output yet — tracked in [TanStack/markdown#9](https://github.com/TanStack/markdown/issues/9).

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
   The default mode emits `html`/`inlineHtml` nodes. The `component` output mode (block math) demonstrates the richer design enabled by the existing `ComponentNode`: raw TeX in the AST, rendering deferred to the renderer (`renderHtml` hook / React `components` map), no `allowHtml`. Inline math cannot use this yet — a custom inline output hook is tracked upstream in #9.

2. **`transformDocument` vs `transformInline`**
   `transformInline` is called once per inline container (paragraph, heading, list item, table cell) with the container's top-level nodes, during parsing. This implementation instead uses `transformDocument`, which traverses the fully parsed AST. Both work in 0.0.13; `transformInline` would avoid the full-document walk and could simplify future versions.

3. **Inline parsing order**
   Inline math must be processed after bold, italic, links, and code have already been parsed into typed nodes, so the walker skips typed nodes that should not contain math. A true inline transformer in the parser would achieve the same result more cleanly.

## License

MIT © 2026 Bertrand Gressier
