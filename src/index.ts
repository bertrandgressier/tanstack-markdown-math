import katex from 'katex'
import type {
  BlockNode,
  ComponentNode,
  InlineNode,
  MarkdownDocument,
  MarkdownExtension,
} from '@tanstack/markdown'
import type {
  MathBlockOptions,
  MathInlineOptions,
  MathOptions,
} from './types.js'

export const MATH_UNDERSCORE_SUB = '\uE000'
export const MATH_ASTERISK_SUB = '\uE001'

/**
 * Protects underscores and asterisks inside math formulas (`$...$` and `$$...$$`)
 * before markdown parsing. This prevents markdown parsers from misinterpreting
 * TeX subscripts like `$_2$` or `*` as markdown emphasis (`*...*` or `_..._`).
 *
 * The math extensions automatically restore the original characters before rendering.
 */
export function protectMath(content: string): string {
  return content.replace(
    /(\$\$[\s\S]+?\$\$|\$(?:[^\s$]|\S[\s\S]*?\S)\$)/g,
    (match) => {
      return match
        .replaceAll('_', MATH_UNDERSCORE_SUB)
        .replaceAll('*', MATH_ASTERISK_SUB)
    },
  )
}

/**
 * Restores protected characters inside extracted TeX.
 */
export function restoreMathChars(tex: string): string {
  return tex
    .replaceAll(MATH_UNDERSCORE_SUB, '_')
    .replaceAll(MATH_ASTERISK_SUB, '*')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DEFAULT_KATEX_OPTIONS: katex.KatexOptions = {
  throwOnError: false,
  strict: false,
}

function defaultRenderer(tex: string, displayMode: boolean): string {
  try {
    const html = katex.renderToString(tex, {
      ...DEFAULT_KATEX_OPTIONS,
      displayMode,
      throwOnError: false,
    })
    if (html.includes('class="katex-error"') || html.includes('#cc0000')) {
      const titleMatch = html.match(/title="([^"]*)"/)
      const errTitle = titleMatch ? titleMatch[1] : 'Erreur syntaxe LaTeX'
      if (displayMode) {
        return `<div class="katex-error-box my-2 p-2 rounded-lg text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900" title="${escapeHtml(errTitle)}"><span class="font-bold">⚠️ Erreur KaTeX:</span> ${escapeHtml(errTitle)}<pre class="mt-1 overflow-x-auto">${escapeHtml(tex)}</pre></div>`
      }
      return `<span class="katex-error-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900" title="${escapeHtml(errTitle)}">⚠️ <code class="text-[11px]">${escapeHtml(tex)}</code></span>`
    }
    return html
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (displayMode) {
      return `<div class="katex-error-box my-2 p-2 rounded-lg text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900" title="${escapeHtml(msg)}"><span class="font-bold">⚠️ Erreur KaTeX:</span> ${escapeHtml(msg)}<pre class="mt-1 overflow-x-auto">${escapeHtml(tex)}</pre></div>`
    }
    return `<span class="katex-error-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900" title="${escapeHtml(msg)}">⚠️ <code class="text-[11px]">${escapeHtml(tex)}</code></span>`
  }
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

const MATH_COMPONENT_NAME = 'math'
const DEFAULT_MATH_TAG_NAME = 'MathBlock'

function mathComponentBlockNode(tex: string, tagName: string): BlockNode {
  return {
    type: 'component',
    name: MATH_COMPONENT_NAME,
    attributes: {},
    tagName,
    properties: { tex },
    children: [],
  }
}

function isMathComponentNode(
  node: BlockNode | InlineNode,
): node is ComponentNode {
  return node.type === 'component' && node.name === MATH_COMPONENT_NAME
}

/**
 * Block math extension. Recognizes fenced `$$...$$` blocks (multi-line or
 * single-line).
 */
export function mathBlockExtension(
  opts?: MathBlockOptions,
): MarkdownExtension {
  const render = getRenderer(opts)
  const output = opts?.output ?? 'html'
  const tagName = opts?.tagName ?? DEFAULT_MATH_TAG_NAME

  const emit = (tex: string): BlockNode =>
    output === 'component'
      ? mathComponentBlockNode(tex, tagName)
      : mathBlockNode(tex, render)

  return {
    name: 'math-block',
    parseBlock(context) {
      const line = context.lines[context.index] ?? ''
      const open = line.match(/^\s*\$\$(.*)$/)
      if (!open) return undefined

      const after = open[1]
      // Check if closing $$ is on the same line followed by trailing text:
      // e.g. "$$\rightarrow$$ Identification des mécanismes"
      // This is inline math inside a paragraph, NOT a block fence.
      const closedInline = after.match(/^(.*?)\$\$(.*)$/)
      if (closedInline && closedInline[2].trim().length > 0) {
        return undefined
      }

      const singleLine = after.match(/^(.*?)\$\$\s*$/)
      if (singleLine) {
        context.consume(1)
        return emit(restoreMathChars(singleLine[1]))
      }

      let i = context.index + 1
      const content: string[] = open[1] ? [open[1]] : []
      while (i < context.lines.length) {
        const l = context.lines[i] ?? ''
        i++
        if (/^\s*\$\$\s*$/.test(l)) {
          context.consume(i - context.index)
          return emit(restoreMathChars(content.join('\n')))
        }
        content.push(l)
      }
      context.consume(i - context.index)
      return emit(restoreMathChars(content.join('\n')))
    },
    renderHtml(node) {
      if (!isMathComponentNode(node)) return undefined
      return render(restoreMathChars(node.properties?.tex ?? ''), true)
    },
  }
}

function mathInlineNode(
  tex: string,
  render: (tex: string, displayMode: boolean) => string,
  displayMode = false,
): InlineNode {
  return {
    type: 'inlineHtml',
    value: render(tex, displayMode),
  } as InlineNode
}

function replaceMathInHtml(
  html: string,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces?: boolean,
): string {
  const re = allowSpaces
    ? /\$\$([\s\S]+?)\$\$|\$((?:[^\n$]|\n(?!\s*\n))+?)\$/g
    : /\$\$([\s\S]+?)\$\$|\$([^\s$](?:(?:[^\n$]|\n(?!\s*\n))*?[^\s$])?)\$/g

  return html.replace(re, (_match, p1, p2) => {
    const rawTex = p1 ?? p2 ?? ''
    const tex = restoreMathChars(rawTex)
    return render(tex, false)
  })
}

function splitTextNode(
  value: string,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces?: boolean,
): InlineNode[] {
  const re = allowSpaces
    ? /\$\$([\s\S]+?)\$\$|\$((?:[^\n$]|\n(?!\s*\n))+?)\$/g
    : /\$\$([\s\S]+?)\$\$|\$([^\s$](?:(?:[^\n$]|\n(?!\s*\n))*?[^\s$])?)\$/g

  const out: InlineNode[] = []
  let last = 0
  for (const m of value.matchAll(re)) {
    const idx = m.index ?? 0
    const rawTex = m[1] ?? m[2] ?? ''
    const tex = restoreMathChars(rawTex)
    if (idx > last) out.push({ type: 'text', value: value.slice(last, idx) })
    out.push(mathInlineNode(tex, render, false))
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
    if (node?.type === 'text' && (node.value.includes('$') || node.value.includes(MATH_UNDERSCORE_SUB))) {
      out.push(...splitTextNode(node.value, render, allowSpaces))
    } else if (node?.type === 'inlineHtml' && (node as { value: string }).value.includes('$')) {
      ;(node as { value: string }).value = replaceMathInHtml(
        (node as { value: string }).value,
        render,
        allowSpaces,
      )
      out.push(node)
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
    type === 'inlineCode'
  ) {
    return
  }

  if (type === 'html') {
    const val = (n.value as string) ?? ''
    // Allow transforming math inside inline-style HTML blocks (e.g. <u>...</u> at start of line)
    // while leaving structural block HTML (e.g. <div>...</div>) untouched.
    if (
      /^<\s*(?:u|span|em|strong|b|i|font|small|sub|sup|mark)\b/i.test(val) &&
      val.includes('$')
    ) {
      ;(n as { value: string }).value = replaceMathInHtml(
        val,
        render,
        allowSpaces,
      )
    }
    return
  }

  if (type === 'inlineHtml') {
    const val = (n.value as string) ?? ''
    if (val.includes('$')) {
      ;(n as { value: string }).value = replaceMathInHtml(
        val,
        render,
        allowSpaces,
      )
    }
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
 * balanced `$...$` or `$$...$$` pair into a KaTeX-rendered `inlineHtml` node.
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
 */
export function mathExtension(opts?: MathOptions): MarkdownExtension[] {
  return [mathBlockExtension(opts), mathInlineExtension(opts)]
}

export type { MathBlockOptions, MathInlineOptions, MathOptions }

