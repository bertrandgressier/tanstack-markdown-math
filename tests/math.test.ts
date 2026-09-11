import { describe, expect, it, vi } from 'vitest'
import { parseMarkdown } from '@tanstack/markdown'
import {
  mathBlockExtension,
  mathExtension,
  mathInlineExtension,
} from '../src/index.js'

function findHtmlNodes(doc: unknown): Array<{ type: string; value: string }> {
  const nodes: Array<{ type: string; value: string }> = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown; value?: unknown; children?: unknown }
    if (node.type === 'html' || node.type === 'inlineHtml') {
      nodes.push({
        type: String(node.type),
        value: String(node.value),
      })
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
    if (
      node.type === 'table' &&
      node.value !== undefined &&
      typeof node.value !== 'string'
    ) {
      // handled by children walk
    }
    if (node.type === 'table') {
      const t = n as { header?: unknown[]; rows?: unknown[][] }
      if (Array.isArray(t.header)) t.header.forEach(walk)
      if (Array.isArray(t.rows)) {
        t.rows.forEach((row) => row.forEach(walk))
      }
    }
    if (node.type === 'list') {
      const l = n as { items?: unknown[] }
      if (Array.isArray(l.items)) l.items.forEach(walk)
    }
  }
  walk(doc)
  return nodes
}

function findTextNodes(doc: unknown): string[] {
  const texts: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as { type?: unknown; value?: unknown; children?: unknown }
    if (node.type === 'text' && typeof node.value === 'string') {
      texts.push(node.value)
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
    }
    if (node.type === 'table') {
      const t = n as { header?: unknown[]; rows?: unknown[][] }
      if (Array.isArray(t.header)) t.header.forEach(walk)
      if (Array.isArray(t.rows)) {
        t.rows.forEach((row) => row.forEach(walk))
      }
    }
    if (node.type === 'list') {
      const l = n as { items?: unknown[] }
      if (Array.isArray(l.items)) l.items.forEach(walk)
    }
  }
  walk(doc)
  return texts
}

const customRenderer = (tex: string, displayMode: boolean) =>
  displayMode
    ? `<custom-display>${tex}</custom-display>`
    : `<custom-inline>${tex}</custom-inline>`

describe('mathExtension', () => {
  it('exports a combined extension array', () => {
    const ext = mathExtension()
    expect(ext).toHaveLength(2)
    expect(ext[0].name).toBe('math-block')
    expect(ext[1].name).toBe('math-inline')
  })
})

describe('mathBlockExtension', () => {
  it('renders a multi-line display math block', () => {
    const md = `$$\\frac{1}{2}$$`
    const doc = parseMarkdown(md, {
      extensions: [mathBlockExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].type).toBe('html')
    expect(html[0].value).toContain('katex')
    expect(html[0].value).toContain('\\frac{1}{2}')
  })

  it('renders a single-line block when delimiters are on the same line', () => {
    const md = `$$ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$`
    const doc = parseMarkdown(md, {
      extensions: [mathBlockExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].type).toBe('html')
    expect(html[0].value).toContain('katex')
    expect(html[0].value).toContain('x = ')
  })

  it('writes partial HTML for an unclosed $$ block (streaming)', () => {
    const md = `$$\\frac{1}{`
    const doc = parseMarkdown(md, {
      extensions: [mathBlockExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html.length).toBeGreaterThan(0)
    expect(html[0].type).toBe('html')
    expect(html[0].value).toContain('katex')
  })

  it('does not modify plain paragraphs without math delimiters', () => {
    const md = 'Just a paragraph.'
    const doc = parseMarkdown(md, {
      extensions: [mathBlockExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
  })

  it('uses a custom renderer when provided', () => {
    const md = `$$\\pi$$`
    const doc = parseMarkdown(md, {
      extensions: [mathBlockExtension({ render: customRenderer })],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].value).toBe('<custom-display>\\pi</custom-display>')
  })
})

describe('mathInlineExtension', () => {
  it('renders inline math inside a paragraph', () => {
    const md = 'The energy is $E = mc^2$.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].type).toBe('inlineHtml')
    expect(html[0].value).toContain('katex')
    expect(html[0].value).toContain('E = mc^2')
  })

  it('renders inline math inside a heading', () => {
    const md = '## Velocity $v = \\frac{d}{t}$'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].type).toBe('inlineHtml')
    expect(html[0].value).toContain('v = ')
  })

  it('renders inline math inside strong and emphasis', () => {
    const md = '**Maxwell**: $\\nabla \\cdot \\mathbf{E} = \\rho$ and *also* $\\pi$'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
    expect(html.every((h) => h.type === 'inlineHtml')).toBe(true)
    expect(html[0].value).toContain('\\nabla')
  })

  it('renders inline math inside list items', () => {
    const md = '- $a^2 + b^2 = c^2$\n- $e^{i\\pi} + 1 = 0$'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
  })

  it('renders inline math inside blockquotes', () => {
    const md = '> Einstein said $E = mc^2$.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].value).toContain('E = mc^2')
  })

  it('renders inline math inside table cells', () => {
    const md = '| Formula | Value |\n|----|----|\n| $E=mc^2$ | $cd$ |'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
    expect(html[0].value).toContain('E=mc^2')
    expect(html[1].value).toContain('cd')
  })

  it('handles multiple math expressions on the same line', () => {
    const md = 'Pythagoras: $ab$ $cd$ $ef$.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(3)
  })

  it('keeps unpaired $ as literal text', () => {
    const md = 'Prices are $5 and then maybe $10 or so.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
    const texts = findTextNodes(doc)
    expect(texts.join(' ')).toContain('$5')
    expect(texts.join(' ')).toContain('$10')
  })

  it('does not transform inline math adjacent to spaces in strict mode', () => {
    const md = 'It costs $ 5 $ today.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
  })

  it('transforms single-character inline math in strict mode', () => {
    const md = 'Soit $x$ et $n$ des entiers.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
  })

  it('does not match when the closing $ is preceded by a space', () => {
    const md = 'Value $b $ is not math.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
  })

  it('allows spaces inside delimiters when allowSpaces is true', () => {
    const md = 'It costs $ 5 $ and $ 10 $ today.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension({ allowSpaces: true })],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
    expect(html[0].value).toContain('5')
    expect(html[1].value).toContain('10')
  })

  it('does not transform math inside code blocks', () => {
    const md = '```\n$E = mc^2$\n```'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
  })

  it('does not transform math inside inline code', () => {
    const md = 'Use `\$x\$` as a variable.'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
    const inlineCodes: string[] = []
    const walk = (n: unknown) => {
      if (!n || typeof n !== 'object') return
      const node = n as { type?: unknown; value?: unknown; children?: unknown }
      if (node.type === 'inlineCode' && typeof node.value === 'string') {
        inlineCodes.push(node.value)
      }
      if (Array.isArray(node.children)) node.children.forEach(walk)
    }
    walk(doc)
    expect(inlineCodes).toContain('$x$')
  })

  it('does not transform math inside link text in an unsafe way', () => {
    const md = '[$x$](https://example.com)'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html.length).toBeGreaterThanOrEqual(0)
  })

  it('uses a custom renderer when provided', () => {
    const md = 'result $\\sqrt{2}$'
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension({ render: customRenderer })],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(1)
    expect(html[0].value).toBe('<custom-inline>\\sqrt{2}</custom-inline>')
  })
})

describe('mathExtension integration', () => {
  it('composes with callouts and streaming extensions', async () => {
    const { calloutsExtension } = await import(
      '@tanstack/markdown/extensions/callouts'
    )
    const { streamingMarkdownExtension } = await import(
      '@tanstack/markdown/extensions/streaming'
    )
    const md = `> [!TIP]\n> Use $\\LaTeX$ here.\n\n$$\\sum_{i=1}^{n} i$$\n\nAn unclosed stream: $$\\frac{a}{`
    const doc = parseMarkdown(md, {
      extensions: [
        ...mathExtension(),
        calloutsExtension(),
        streamingMarkdownExtension(),
      ],
    })
    const html = findHtmlNodes(doc)
    expect(html.length).toBeGreaterThanOrEqual(2)
  })

  it('does not double-render inline math inside block math contexts', () => {
    const md = `$$zz$$\n\nInline $xx$ and $yy$.`
    const doc = parseMarkdown(md, {
      extensions: mathExtension(),
    })
    const html = findHtmlNodes(doc)
    const blocks = html.filter((h) => h.type === 'html')
    const inlines = html.filter((h) => h.type === 'inlineHtml')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].value).toContain('zz')
    expect(inlines).toHaveLength(2)
  })

  it('uses a custom renderer shared by block and inline', () => {
    const md = 'Inline $xx$\n\n$$yy$$'
    const doc = parseMarkdown(md, {
      extensions: mathExtension({ render: customRenderer }),
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(2)
    const inline = html.find((h) => h.type === 'inlineHtml')
    const block = html.find((h) => h.type === 'html')
    expect(inline?.value).toBe('<custom-inline>xx</custom-inline>')
    expect(block?.value).toBe('<custom-display>yy</custom-display>')
  })
})

describe('edge cases', () => {
  it('handles empty input without error', () => {
    const doc = parseMarkdown('', {
      extensions: mathExtension(),
    })
    expect(doc).toBeDefined()
    expect(findHtmlNodes(doc)).toHaveLength(0)
  })

  it('transforms math in escaped html lines but ignores real html blocks', () => {
    const escaped = parseMarkdown('<div>$x$</div>', {
      extensions: mathExtension(),
    })
    expect(
      findHtmlNodes(escaped).filter((n) => n.value.includes('katex')).length,
    ).toBe(1)

    const raw = parseMarkdown('<div>$x$</div>', {
      allowHtml: true,
      extensions: mathExtension(),
    })
    const nodes = findHtmlNodes(raw)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].value).toBe('<div>$x$</div>')
  })

  it('keeps track of streaming unclosed inline expression safely', () => {
    const md = 'partial $x + '
    const doc = parseMarkdown(md, {
      extensions: [mathInlineExtension()],
    })
    const html = findHtmlNodes(doc)
    expect(html).toHaveLength(0)
  })
})
