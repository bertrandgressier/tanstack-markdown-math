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

`@tanstack/markdown` and `katex` are peer dependencies. A custom `render` option lets you avoid KaTeX at runtime, but it remains a peer dependency for now.

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

> **Important:** rendered math is emitted as `html`/`inlineHtml` nodes, so you **must** set `allowHtml: true` for anything to show up in the React component.

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

`mathBlockExtension` accepts only `render`; `mathInlineExtension` accepts `render` and `allowSpaces`.

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

These notes are intended as discussion points if/when this functionality is proposed upstream to TanStack Markdown:

1. **First-class math nodes vs. html injection**
   The current implementation emits `html`/`inlineHtml` nodes. A richer design would introduce a dedicated `math`/`inlineMath` node type, moving HTML generation to the renderer. That would keep the AST serialization-cleaner, but it requires renderer cooperation that `@tanstack/markdown` does not currently provide.

2. **`transformInline` gap in `@tanstack/markdown` 0.0.13**
   The documented `transformInline` hook is never called for extension-provided transforms in 0.0.13. This implementation therefore uses `transformDocument`, which works because it can traverse and mutate the fully parsed AST. Relying on `transformDocument` has a slight semantic cost (full-document walk instead of per-inline pass) but is the only reliable hook available today.

3. **Inline parsing order**
   Inline math must be processed after bold, italic, links, and code have already been parsed into typed nodes, so the walker skips typed nodes that should not contain math. A true inline transformer in the parser would achieve the same result more cleanly.

## License

MIT © 2026 Bertrand Gressier
