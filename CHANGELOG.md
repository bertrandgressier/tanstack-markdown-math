# Changelog

## 0.2.0

### Summary

New opt-in `component` output mode for block math that works **without `allowHtml`**, a React subpath with a ready-made `MathBlock` component, wider `@tanstack/markdown` peer range, and a streaming bug fix.

### Changes

- **`output: 'component'` for block math** — `mathBlockExtension({ output: 'component' })` emits a `ComponentNode` (`name: 'math'`, raw TeX in `properties.tex`) instead of a pre-rendered `html` node. The extension also registers a `renderHtml` hook, so the HTML renderer renders KaTeX with **zero config and no `allowHtml`**.
- **`tagName` option** (default `'MathBlock'`) — custom element/component name for the emitted node.
- **React subpath** — `import { MathBlock } from 'tanstack-markdown-math/react'` renders `tex` via KaTeX (`displayMode` defaults to `true`). Map it with `<Markdown components={{ MathBlock }}>` to render block math without `allowHtml`.
- **Peer range widened** — `@tanstack/markdown` is now `>=0.0.13 <0.1.0` (was `^0.0.13`, which excluded `0.0.14`).
- **Bug fix (streaming)** — an unclosed single-line `$$\frac{1}{` no longer drops the TeX after the opening `$$`; the partial content is rendered as before.

### Impact on existing users

**No action required.** All 0.1.x behavior is unchanged:

- Default output remains `html`/`inlineHtml` nodes.
- `allowHtml: true` is still required for the default mode (inline math in particular — see below).
- Public API signatures are additive only (`output`, `tagName` are optional).

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

### Known limitation

Inline math (`$...$`) still requires `allowHtml: true`. First-class inline component nodes are tracked upstream in [TanStack/markdown#9](https://github.com/TanStack/markdown/issues/9); this package will adopt them when available.

## 0.1.1

- Docs: correct the claim that `transformInline` is never called in `@tanstack/markdown` 0.0.13 — it is called once per inline container. No code changes.

## 0.1.0

- Initial release: `mathExtension`, `mathBlockExtension`, `mathInlineExtension` with KaTeX rendering, strict-by-default inline matching, streaming-safe parsing.
