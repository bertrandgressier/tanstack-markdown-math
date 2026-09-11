# Math / LaTeX support (`$…$`, `$$…$$`) — community extension available, two extension API gaps

## Summary

`@tanstack/markdown` (0.0.13) has no math support, and math is a common need for technical/docs content. I built and published [`tanstack-markdown-math`](https://github.com/bertrandgressier/tanstack-markdown-math) ([npm](https://www.npmjs.com/package/tanstack-markdown-math)), a KaTeX extension built on the current extension API. It works today, and writing it surfaced two API gaps that force workarounds which a first-class design could remove.

This issue is half "show and tell", half design discussion: **would built-in math support — or the two API additions below — be welcome?**

## What the extension does

- Block `$$…$$` (multi-line and single-line) via `parseBlock`, emitted as an `html` node
- Inline `$…$` in paragraphs, headings, strong/emphasis/strike, links, blockquotes, callouts, list items (recursive), table cells (recursive)
- Strict-by-default inline matching (avoids `$5 and $10` false positives), opt-in permissive mode
- Streaming-safe: an unclosed `$$` block still produces a rendered partial node instead of crashing
- Pluggable renderer (`render` option), KaTeX by default
- Validated on a dense-math, 900+ page corpus through the streaming pipeline

```tsx
import { Markdown } from '@tanstack/markdown/react'
import { mathExtension } from 'tanstack-markdown-math'

<Markdown extensions={mathExtension()} allowHtml>
  {`The energy is $E = mc^2$.`}
</Markdown>
```

## What works well

- `parseBlock` runs before built-in block parsers (extensions are earlier in the array), so `$$` fences take precedence cleanly
- `transformInline` is called once per inline container with the container's top-level nodes, nested typed nodes included — enough to run a recursive inline pass during parsing
- The extension API covers this use case end-to-end; no forks or patches needed

## Gap 1: closed AST node unions force `html` injection

`BlockNode` / `InlineNode` are closed unions, so an extension cannot emit a semantic node — it must pre-render to a string and emit `html` / `inlineHtml`. Consequences:

- The AST is no longer serialization-clean (rendered KaTeX HTML embedded in it)
- React consumers get `dangerouslySetInnerHTML` instead of a real KaTeX component tree (no SSR-safe hydration, no CSS scoping choices)
- `allowHtml: true` becomes mandatory for math to appear at all, which loosens the document's security posture just to display math

A first-class `math` / `inlineMath` node type (raw TeX as payload), with renderers knowing how to draw it, would fix all three. That requires renderer cooperation, which the current API doesn't offer — hence gap 2.

## Gap 2: no renderer-level extension hook for React

`renderHtml` covers the HTML renderer, but the React renderer has no equivalent: an extension cannot influence how a node becomes React elements. Any extension that needs React semantics today has to inject HTML strings.

Something like a `renderReact?: (node, ctx) => ReactElement | undefined` hook (mirroring `renderHtml`) would let extensions participate in both renderers symmetrically — and would make a first-class math node trivial to render as a KaTeX component.

## Proposal

Either or both:

1. **Built-in math support** — I'm happy to contribute the parsing/delimiter logic upstream (MIT); the strict-by-default inline rules and streaming behavior are already battle-tested
2. **Extension API additions** — open the AST to extension-defined node types (or add `math`/`inlineMath`), and add a React renderer hook for extensions

Happy to split this into separate issues / PRs if that's easier to triage. Would love feedback on which direction fits the roadmap.

---

- Repo: https://github.com/bertrandgressier/tanstack-markdown-math
- npm: https://www.npmjs.com/package/tanstack-markdown-math
- Tested against: `@tanstack/markdown` 0.0.13
