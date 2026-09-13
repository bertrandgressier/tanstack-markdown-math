import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseMarkdown, renderHtml } from '@tanstack/markdown'
import { Markdown, renderMarkdownReact } from '@tanstack/markdown/react'
import { mathBlockExtension, mathExtension, mathInlineExtension } from '../src/index.js'
import { MathBlock } from '../src/react.js'

interface FoundComponent {
  name: string
  tagName?: string
  properties: Record<string, string>
  childrenCount: number
}

function findComponentNodes(doc: unknown): FoundComponent[] {
  const found: FoundComponent[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as {
      type?: unknown
      name?: unknown
      tagName?: unknown
      properties?: unknown
      children?: unknown
    }
    if (node.type === 'component') {
      found.push({
        name: String(node.name),
        tagName: node.tagName === undefined ? undefined : String(node.tagName),
        properties:
          node.properties && typeof node.properties === 'object'
            ? (node.properties as Record<string, string>)
            : {},
        childrenCount: Array.isArray(node.children) ? node.children.length : -1,
      })
    }
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(doc)
  return found
}

const componentExt = mathBlockExtension({ output: 'component' })

describe('mathBlockExtension component output — parsing', () => {
  it('emits a component node for a multi-line block', () => {
    const doc = parseMarkdown('$$\n\\frac{1}{2}\n$$', {
      extensions: [componentExt],
    })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    expect(components[0].name).toBe('math')
    expect(components[0].tagName).toBe('MathBlock')
    expect(components[0].properties.tex).toBe('\\frac{1}{2}')
    expect(components[0].childrenCount).toBe(0)
  })

  it('emits a component node for a single-line block', () => {
    const doc = parseMarkdown('$$ x = 1 $$', { extensions: [componentExt] })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    expect(components[0].properties.tex).toBe(' x = 1 ')
  })

  it('supports a custom tagName', () => {
    const doc = parseMarkdown('$$a$$', {
      extensions: [
        mathBlockExtension({ output: 'component', tagName: 'DisplayMath' }),
      ],
    })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    expect(components[0].tagName).toBe('DisplayMath')
  })

  it('emits partial TeX for an unclosed block (streaming)', () => {
    const doc = parseMarkdown('$$\\frac{1}{', { extensions: [componentExt] })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    expect(components[0].properties.tex).toBe('\\frac{1}{')
  })

  it('keeps html output as the default (non-breaking)', () => {
    const doc = parseMarkdown('$$a$$', {
      extensions: [mathBlockExtension()],
    })
    expect(findComponentNodes(doc)).toHaveLength(0)
    const html = JSON.stringify(doc)
    expect(html).toContain('"type":"html"')
  })

  it('leaves plain paragraphs untouched', () => {
    const doc = parseMarkdown('No math here.', { extensions: [componentExt] })
    expect(findComponentNodes(doc)).toHaveLength(0)
  })

  it('composes with the inline extension via mathExtension', () => {
    const doc = parseMarkdown('Inline $x$ and\n\n$$block$$', {
      extensions: mathExtension({ output: 'component' }),
    })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    // Since 0.3.0, output: 'component' applies to inline math as well
    // (requires @tanstack/markdown >= 0.0.15 for inlineComponent nodes).
    const html = JSON.stringify(doc)
    expect(html).toContain('"type":"inlineComponent"')
    expect(html).toContain('"tagName":"MathInline"')
  })

  it('keeps inline output as inlineHtml when only the block extension uses component mode', () => {
    const doc = parseMarkdown('Inline $x$ and\n\n$$block$$', {
      extensions: [
        mathBlockExtension({ output: 'component' }),
        mathInlineExtension(),
      ],
    })
    const components = findComponentNodes(doc)
    expect(components).toHaveLength(1)
    const html = JSON.stringify(doc)
    expect(html).toContain('"type":"inlineHtml"')
  })
})

describe('mathBlockExtension component output — HTML renderer', () => {
  it('renders KaTeX HTML without allowHtml', () => {
    const html = renderHtml('$$\n\\frac{1}{2}\n$$', {
      extensions: [componentExt],
    })
    expect(html).toContain('katex')
    expect(html).toContain('\\frac{1}{2}')
  })

  it('does not require allowHtml and leaves regular content intact', () => {
    const html = renderHtml('Hello **world**.\n\n$$E$$\n\nBye.', {
      extensions: [componentExt],
    })
    expect(html).toContain('<strong>world</strong>')
    expect(html).toContain('katex')
    expect(html).toContain('Bye.')
  })

  it('uses the custom renderer for component output', () => {
    const ext = mathBlockExtension({
      output: 'component',
      render: (tex) => `<custom-display>${tex}</custom-display>`,
    })
    const html = renderHtml('$$\\pi$$', { extensions: [ext] })
    expect(html).toContain('<custom-display>\\pi</custom-display>')
  })

  it('survives a JSON round-trip of the AST', () => {
    const doc = parseMarkdown('$$\\sqrt{2}$$', { extensions: [componentExt] })
    const roundTripped = JSON.parse(JSON.stringify(doc))
    const html = renderHtml(roundTripped, { extensions: [componentExt] })
    expect(html).toContain('katex')
    expect(html).toContain('\\sqrt{2}')
  })
})

describe('MathBlock React component', () => {
  it('renders KaTeX HTML from raw TeX', () => {
    const html = renderToStaticMarkup(
      createElement(MathBlock, { tex: '\\frac{1}{2}' }),
    )
    expect(html).toContain('katex')
    expect(html).toMatch(/^<div class="math-block"/)
  })

  it('defaults to display mode', () => {
    const display = renderToStaticMarkup(createElement(MathBlock, { tex: 'x' }))
    const inline = renderToStaticMarkup(
      createElement(MathBlock, { tex: 'x', displayMode: false }),
    )
    expect(display).toContain('katex-display')
    expect(inline).not.toContain('katex-display')
  })

  it('renders an empty string safely when tex is missing', () => {
    const html = renderToStaticMarkup(createElement(MathBlock, {}))
    expect(html).toContain('math-block')
  })
})

describe('component output — React renderer', () => {
  function renderStatic(nodes: unknown): string {
    return renderToStaticMarkup(
      createElement('div', null, nodes as never),
    )
  }

  it('renders through the components map without allowHtml', () => {
    const html = renderMarkdownReact('$$\n\\frac{1}{4}\n$$', {
      extensions: [componentExt],
      components: { MathBlock },
    })
    const html_ = renderStatic(html)
    expect(html_).toContain('katex')
    expect(html_).toContain('math-block')
  })

  it('falls back to a plain tag when no component is mapped', () => {
    const html = renderMarkdownReact('$$a$$', { extensions: [componentExt] })
    const html_ = renderStatic(html)
    expect(html_).toContain('<MathBlock')
    expect(html_).toContain('tex="a"')
    expect(html_).not.toContain('katex')
  })

  it('works end-to-end with the Markdown component', () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        extensions: mathExtension({ output: 'component' }),
        components: { MathBlock },
        allowHtml: true,
        children: 'Energy $E = mc^2$.\n\n$$\nE = mc^2\n$$',
      }),
    )
    expect(html).toContain('katex')
    expect((html.match(/katex/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
