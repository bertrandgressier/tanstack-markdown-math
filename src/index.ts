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
import { defaultRenderer } from './render.js'

export const MATH_UNDERSCORE_SUB = '\uE000'
export const MATH_ASTERISK_SUB = '\uE001'
export const MATH_BACKSLASH_SUB = '\uE002'

/**
 * @deprecated No longer needed with `@tanstack/markdown` >= 1.0: the inline
 * math parser runs before emphasis/escape handling. Kept for content that is
 * already pre-protected.
 *
 * Protects backslashes, underscores and asterisks inside math formulas (`$...$` and `$$...$$`)
 * before markdown parsing. This prevents markdown parsers from unescaping TeX commands (like `\{`, `\}`, `\\`)
 * or misinterpreting TeX subscripts/operators like `$_2$` or `*` as markdown emphasis (`*...*` or `_..._`).
 *
 * The math extensions automatically restore the original characters before rendering.
 */
export function protectMath(content: string): string {
  return content.replace(
    /(\$\$[\s\S]+?\$\$|\$(?:[^\s$]|\S[\s\S]*?\S)\$)/g,
    (match) => {
      return match
        .replaceAll('\\', MATH_BACKSLASH_SUB)
        .replaceAll('_', MATH_UNDERSCORE_SUB)
        .replaceAll('*', MATH_ASTERISK_SUB)
    },
  )
}

/**
 * @deprecated Only needed for pre-protected content (see `protectMath`).
 * Safe no-op otherwise.
 *
 * Restores protected characters inside extracted TeX.
 */
export function restoreMathChars(tex: string): string {
  return tex
    .replaceAll(MATH_UNDERSCORE_SUB, '_')
    .replaceAll(MATH_ASTERISK_SUB, '*')
    .replaceAll(MATH_BACKSLASH_SUB, '\\')
}

const RENDER_CACHE_LIMIT = 1000

/**
 * Wraps a render function in an LRU cache keyed by `(tex, displayMode)`.
 * Formulas are often repeated across a document; caching makes repeated
 * renders free and keeps streaming re-parses cheap. Only successful
 * results are cached; thrown errors propagate uncached.
 */
function createCachedRenderer(
  render: (tex: string, displayMode: boolean) => string,
  limit: number,
): (tex: string, displayMode: boolean) => string {
  const cache = new Map<string, string>()
  return (tex: string, displayMode: boolean): string => {
    const key = (displayMode ? '1' : '0') + tex
    const hit = cache.get(key)
    if (hit !== undefined) {
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
    const html = render(tex, displayMode)
    cache.set(key, html)
    if (cache.size > limit) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    return html
  }
}

function getRenderer(
  opts: MathBlockOptions | MathInlineOptions | undefined,
): (tex: string, displayMode: boolean) => string {
  const render = opts?.render ?? defaultRenderer
  const cache = opts?.cache
  if (cache === false) return render
  const limit = typeof cache === 'number' ? Math.max(1, Math.floor(cache)) : RENDER_CACHE_LIMIT
  return createCachedRenderer(render, limit)
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

function isMathInlineComponentNode(
  node: BlockNode | InlineNode,
): node is InlineNode & { properties?: { tex?: string } } {
  return (
    node.type === 'inlineComponent' &&
    (node as unknown as { name?: string }).name === MATH_COMPONENT_NAME
  )
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
  const unclosedBlock = opts?.unclosedBlock ?? true

  const emit = (tex: string): BlockNode =>
    output === 'component'
      ? mathComponentBlockNode(tex.trim(), tagName)
      : mathBlockNode(tex.trim(), render)

  return {
    name: 'math-block',
    parseBlock(context) {
      const line = context.lines[context.index] ?? ''
      const open = line.match(/^ {0,3}\$\$(.*)$/)
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
        const closeMatch = l.match(/^(.*?)\$\$\s*$/)
        if (closeMatch) {
          if (closeMatch[1].length > 0) {
            content.push(closeMatch[1])
          }
          context.consume(i - context.index)
          return emit(restoreMathChars(content.join('\n')))
        }
        content.push(l)
      }
      if (!unclosedBlock) return undefined
      context.consume(i - context.index)
      return emit(restoreMathChars(content.join('\n')))
    },
    renderHtml(node) {
      if (!isMathComponentNode(node)) return undefined
      return render(restoreMathChars(node.properties?.tex ?? '').trim(), true)
    },
  }
}

function mathInlineNode(
  tex: string,
  render: (tex: string, displayMode: boolean) => string,
  displayMode: boolean,
  inlineTag?: string,
): InlineNode {
  const trimmed = restoreMathChars(tex).trim()
  if (inlineTag) {
    return {
      type: 'inlineComponent',
      name: MATH_COMPONENT_NAME,
      attributes: {},
      tagName: inlineTag,
      properties: { tex: trimmed },
      children: [],
    } as InlineNode
  }
  return {
    type: 'inlineHtml',
    value: render(trimmed, displayMode),
  } as InlineNode
}

const WS = /\s/
const BLANK_LINE = /\n\s*\n/y
const DIGIT = /\d/

/**
 * Finds the math span starting at `s[i]` (which must be `$`). Linear in the
 * distance to the next unescaped `$`.
 */
function findClose(
  s: string,
  i: number,
  allowSpaces: boolean,
): { tex: string; length: number; display: boolean } | undefined {
  if (s.startsWith('$$', i)) {
    const c = s.indexOf('$$', i + 2)
    return c > i + 2
      ? { tex: s.slice(i + 2, c), length: c + 2 - i, display: true }
      : undefined
  }
  let j = i + 1
  if (j >= s.length) return undefined
  if (!allowSpaces && WS.test(s[j]!)) return undefined
  for (; j < s.length; j++) {
    const ch = s[j]
    if (ch === '\\') {
      j++
      continue
    }
    if (ch === '\n') {
      BLANK_LINE.lastIndex = j
      if (BLANK_LINE.test(s)) return undefined
      continue
    }
    if (ch === '$') {
      if (j === i + 1) return undefined
      if (!allowSpaces && WS.test(s[j - 1]!)) return undefined
      if (DIGIT.test(s[j + 1] ?? '')) return undefined
      return { tex: s.slice(i + 1, j), length: j + 1 - i, display: false }
    }
  }
  return undefined
}

const INLINE_HTML_BLOCK = /^<\s*(?:u|span|em|strong|b|i|font|small|sub|sup|mark)\b/i

/** Replaces math spans inside a raw block-html string. */
function replaceMathInString(
  html: string,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces: boolean,
): string {
  let out = ''
  let last = 0
  let i = html.indexOf('$')
  while (i !== -1) {
    const r = findClose(html, i, allowSpaces)
    if (r) {
      out += html.slice(last, i) + render(restoreMathChars(r.tex).trim(), false)
      last = i + r.length
      i = html.indexOf('$', last)
    } else {
      i = html.indexOf('$', i + (html.startsWith('$$', i) ? 2 : 1))
    }
  }
  return last === 0 ? html : out + html.slice(last)
}

/**
 * Copy-on-change walk over block nodes. Only block-level `html` nodes that
 * start with an inline-style tag are rewritten (e.g. `<u>$V_1$ ...</u>` with
 * `allowHtml`). Input nodes are never mutated.
 */
function transformBlocks<T>(
  node: T,
  render: (tex: string, displayMode: boolean) => string,
  allowSpaces: boolean,
): T {
  if (Array.isArray(node)) {
    let changed = false
    const next = node.map((c) => {
      const r = transformBlocks(c, render, allowSpaces)
      if (r !== c) changed = true
      return r
    })
    return (changed ? next : node) as T
  }
  if (!node || typeof node !== 'object') return node
  const n = node as Record<string, unknown>
  if (n.type === 'html') {
    const val = typeof n.value === 'string' ? n.value : ''
    if (
      val.includes('$') &&
      !val.includes('class="katex') &&
      INLINE_HTML_BLOCK.test(val)
    ) {
      const value = replaceMathInString(val, render, allowSpaces)
      if (value !== val) return { ...n, value } as T
    }
    return node
  }
  if (n.type === 'code') return node
  let copy: Record<string, unknown> | undefined
  for (const key of ['children', 'items', 'header', 'rows']) {
    const v = n[key]
    if (!Array.isArray(v)) continue
    const r = transformBlocks(v, render, allowSpaces)
    if (r !== v) (copy ??= { ...n })[key] = r
  }
  return (copy ?? node) as T
}

/**
 * Inline math extension. Uses the `@tanstack/markdown` 1.0 `inlineParser`
 * API to turn `$...$` / `$$...$$` spans into KaTeX-rendered `inlineHtml`
 * nodes, or `inlineComponent` nodes when `output: 'component'` is set.
 */
export function mathInlineExtension(
  opts?: MathInlineOptions,
): MarkdownExtension {
  const render = getRenderer(opts)
  const allowSpaces = opts?.allowSpaces ?? false
  const inlineTag =
    opts?.output === 'component' ? opts.inlineTagName ?? 'MathInline' : undefined
  return {
    name: 'math-inline',
    inlineParser: {
      markers: '$',
      parse({ source, index }) {
        const r = findClose(source, index, allowSpaces)
        if (!r) return undefined
        return {
          node: mathInlineNode(r.tex, render, false, inlineTag),
          length: r.length,
        }
      },
    },
    transformDocument(doc: MarkdownDocument) {
      const children = transformBlocks(doc.children, render, allowSpaces)
      return children === doc.children ? doc : { ...doc, children }
    },
    renderHtml(node) {
      if (!isMathInlineComponentNode(node)) return undefined
      return render(restoreMathChars(node.properties?.tex ?? '').trim(), false)
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

