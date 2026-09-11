import katex from 'katex'
import type {
  BlockNode,
  InlineNode,
  MarkdownDocument,
  MarkdownExtension,
} from '@tanstack/markdown'
import type {
  MathBlockOptions,
  MathInlineOptions,
  MathOptions,
} from './types.js'

const DEFAULT_KATEX_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  strict: false,
}

function defaultRenderer(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { ...DEFAULT_KATEX_OPTIONS, displayMode })
}

function getRenderer(
  opts: MathBlockOptions | MathInlineOptions | undefined,
): (tex: string, displayMode: boolean) => string {
  return opts?.render ?? defaultRenderer
}

function mathBlockNode(
  tex: string,
  render: (tex: string, displayMode: boolean) => string,
): BlockNode {
  return {
    type: 'html',
    value: render(tex, true),
  } as BlockNode
}

/**
 * Block math extension. Recognizes fenced `$$...$$` blocks (multi-line or
 * single-line) and emits a KaTeX-rendered `html` block node.
 *
 * @example
 * ```ts
 * import { mathBlockExtension } from 'tanstack-markdown-math'
 *
 * const extensions = [mathBlockExtension()]
 * ```
 */
export function mathBlockExtension(
  opts?: MathBlockOptions,
): MarkdownExtension {
  const render = getRenderer(opts)
  return {
    name: 'math-block',
    parseBlock(context) {
      const line = context.lines[context.index] ?? ''
      const open = line.match(/^\s*\$\$(.*)$/)
      if (!open) return undefined

      const singleLine = open[1].match(/^(.*?)\$\$\s*$/)
      if (singleLine) {
        context.consume(1)
        return mathBlockNode(singleLine[1], render)
      }

      let i = context.index + 1
      const content: string[] = []
      while (i < context.lines.length) {
        const l = context.lines[i] ?? ''
        i++
        if (/^\s*\$\$\s*$/.test(l)) {
          context.consume(i - context.index)
          return mathBlockNode(content.join('\n'), render)
        }
        content.push(l)
      }
      context.consume(i - context.index)
      return mathBlockNode(content.join('\n'), render)
    },
  }
}

function mathInlineNode(
  tex: string,
  render: (tex: string, displayMode: boolean) => string,
): InlineNode {
  return {
    type: 'inlineHtml',
    value: render(tex, false),
  } as InlineNode
}

function buildInlineMathRe(allowSpaces?: boolean): RegExp {
  if (allowSpaces) {
    return /\$([^$\n]+?)\$/g
  }
  return /\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g
}

function splitTextNode(
  value: string,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces?: boolean,
): InlineNode[] {
  const re = buildInlineMathRe(allowSpaces)
  const out: InlineNode[] = []
  let last = 0
  for (const m of value.matchAll(re)) {
    const idx = m.index ?? 0
    const tex = m[1] ?? ''
    if (idx > last) out.push({ type: 'text', value: value.slice(last, idx) })
    out.push(mathInlineNode(tex, render))
    last = idx + m[0].length
  }
  if (last < value.length) {
    out.push({ type: 'text', value: value.slice(last) })
  }
  return out
}

function mapInlines(
  inlines: InlineNode[],
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces?: boolean,
): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of inlines) {
    if (node?.type === 'text' && node.value.includes('$')) {
      out.push(...splitTextNode(node.value, render, allowSpaces))
    } else {
      const children = (node as { children?: InlineNode[] }).children
      if (Array.isArray(children)) {
        ;(node as { children: InlineNode[] }).children = mapInlines(
          children,
          render,
          allowSpaces,
        )
      }
      out.push(node)
    }
  }
  return out
}

const INLINE_CONTAINER_TYPES = new Set([
  'paragraph',
  'heading',
  'tableCell',
])

function walkNode(
  node: unknown,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces?: boolean,
): void {
  if (!node || typeof node !== 'object') return
  const n = node as Record<string, unknown>
  const type = n.type as string

  if (INLINE_CONTAINER_TYPES.has(type)) {
    if (Array.isArray(n.children)) {
      n.children = mapInlines(
        n.children as InlineNode[],
        render,
        allowSpaces,
      )
    }
    return
  }

  if (
    type === 'code' ||
    type === 'html' ||
    type === 'inlineCode' ||
    type === 'inlineHtml'
  ) {
    return
  }

  if (type === 'table') {
    if (Array.isArray(n.header)) {
      (n.header as unknown[]).forEach((child) =>
        walkNode(child, render, allowSpaces),
      )
    }
    if (Array.isArray(n.rows)) {
      for (const row of n.rows as unknown[]) {
        if (Array.isArray(row)) {
          row.forEach((cell) => walkNode(cell, render, allowSpaces))
        }
      }
    }
    return
  }

  if (type === 'list') {
    if (Array.isArray(n.items)) {
      (n.items as unknown[]).forEach((item) =>
        walkNode(item, render, allowSpaces),
      )
    }
    return
  }

  if (type === 'blockquote' || type === 'callout') {
    if (Array.isArray(n.children)) {
      (n.children as unknown[]).forEach((child) =>
        walkNode(child, render, allowSpaces),
      )
    }
    return
  }

  if (
    type === 'strong' ||
    type === 'emphasis' ||
    type === 'strike' ||
    type === 'link'
  ) {
    if (Array.isArray(n.children)) {
      n.children = mapInlines(
        n.children as InlineNode[],
        render,
        allowSpaces,
      )
    }
    return
  }

  if (Array.isArray(n.children)) {
    (n.children as unknown[]).forEach((child) =>
      walkNode(child, render, allowSpaces),
    )
  }
}

/**
 * Inline math extension. Walks the parsed document and converts every
 * balanced `$...$` pair into a KaTeX-rendered `inlineHtml` node.
 *
 * @remarks
 * In `@tanstack/markdown` 0.0.13 `transformInline` is never called for
 * extensions, so this extension uses `transformDocument` to mutate the
 * already-parsed AST.
 */
export function mathInlineExtension(
  opts?: MathInlineOptions,
): MarkdownExtension {
  const render = getRenderer(opts)
  const allowSpaces = opts?.allowSpaces
  return {
    name: 'math-inline',
    transformDocument(doc: MarkdownDocument) {
      ;(doc.children as unknown[]).forEach((child) =>
        walkNode(child, render, allowSpaces),
      )
      return doc
    },
  }
}

/**
 * Combined math extension. Convenience shorthand that returns both the block
 * and inline math extensions in the recommended order.
 *
 * @example
 * ```ts
 * import { mathExtension } from 'tanstack-markdown-math'
 * import { Markdown } from '@tanstack/markdown/react'
 *
 * <Markdown extensions={[mathExtension()]} allowHtml />
 * ```
 */
export function mathExtension(opts?: MathOptions): MarkdownExtension[] {
  return [mathBlockExtension(opts), mathInlineExtension(opts)]
}

export type { MathBlockOptions, MathInlineOptions, MathOptions }
