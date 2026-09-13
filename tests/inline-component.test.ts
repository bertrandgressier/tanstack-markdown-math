import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@tanstack/markdown'
import { renderHtml } from '@tanstack/markdown'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@tanstack/markdown/react'
import {
  mathExtension,
  mathInlineExtension,
  protectMath,
} from '../src/index'
import { MathInline } from '../src/react'
import type { InlineNode, MarkdownDocument } from '@tanstack/markdown'

const inlineOpts = { output: 'component' } as const

function findInlineComponents(doc: MarkdownDocument): any[] {
  const out: any[] = []
  const walk = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if ((n as any).type === 'inlineComponent') out.push(n)
      const children = (n as any).children
      if (Array.isArray(children)) walk(children)
      if (Array.isArray((n as any).items)) {
        for (const item of (n as any).items) walkBlocks(item.children ?? [])
      }
    }
  }
  const walkBlocks = (blocks: any[]) => {
    for (const b of blocks) {
      if (b.children) walk(b.children)
      if (b.items) for (const it of b.items) walkBlocks(it.children ?? [])
      if (b.header) walk(b.header.map((c: any) => c.children).flat())
      if (b.rows) for (const r of b.rows) walk(r.map((c: any) => c.children).flat())
    }
  }
  walkBlocks(doc.children)
  return out
}

describe('inline component mode — parsing', () => {
  it('emits an inlineComponent node with MathInline defaults', () => {
    const doc = parseMarkdown('Energy $E = mc^2$ here.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const comps = findInlineComponents(doc)
    expect(comps.length).toBe(1)
    expect(comps[0].type).toBe('inlineComponent')
    expect(comps[0].name).toBe('math')
    expect(comps[0].tagName).toBe('MathInline')
    expect(comps[0].properties.tex).toBe('E = mc^2')
    expect(comps[0].attributes).toEqual({})
    expect(comps[0].children).toEqual([])
  })

  it('supports a custom inlineTagName', () => {
    const doc = parseMarkdown('$x$', {
      extensions: [mathInlineExtension({ ...inlineOpts, inlineTagName: 'Tex' })],
    })
    const comps = findInlineComponents(doc)
    expect(comps[0].tagName).toBe('Tex')
  })

  it('renders several math expressions on one line as separate nodes', () => {
    const doc = parseMarkdown('From $a$ to $b$ via $c$.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual(['a', 'b', 'c'])
  })

  it('handles adjacent inline math', () => {
    const doc = parseMarkdown('$a$$b$', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual(['a', 'b'])
  })

  it('detects math inside strong, emphasis, links and headings', () => {
    const doc = parseMarkdown(
      '# Rule $n$ \\* 1\n\nSome **bold $x$ text**, *italic $y$ here*, and [link with $z$](http://a.com).',
      { extensions: [mathInlineExtension(inlineOpts)] },
    )
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual(['n', 'x', 'y', 'z'])
  })

  it('detects math inside table cells, list items and blockquotes', () => {
    const doc = parseMarkdown(
      '| name | value |\n|---|---|\n| force | $F = ma$ |\n\n- item with $q$\n- nested $r$\n\n> quote with $s$',
      { extensions: [mathInlineExtension(inlineOpts)] },
    )
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual(['F = ma', 'q', 'r', 's'])
  })

  it('keeps default html output unchanged (non-breaking)', () => {
    const doc = parseMarkdown('Energy $E$ here.', {
      extensions: [mathInlineExtension()],
    })
    expect(findInlineComponents(doc).length).toBe(0)
    const flat = JSON.stringify(doc)
    expect(flat).toContain('inlineHtml')
    expect(flat).toContain('katex')
  })
})

describe('inline component mode — medwiki corpus formulas', () => {
  const corpus: Array<[string, string]> = [
    ['$[\\text{A}^-]$', '[\\text{A}^-]'],
    ['$[\\text{H}_2\\text{O}] = 55{,}6\\text{ mol/L}$', '[\\text{H}_2\\text{O}] = 55{,}6\\text{ mol/L}'],
    ['$\\alpha \\ll 1$', '\\alpha \\ll 1'],
    ['$-$', '-'],
    ['$_2 \\rightleftarrows$', '_2 \\rightleftarrows'],
    ['$[\\text{H}_2\\text{PO}_4^-]$', '[\\text{H}_2\\text{PO}_4^-]'],
    ['$\\mathbf{\\Delta G = -nF\\ \\Delta E}$', '\\mathbf{\\Delta G = -nF\\ \\Delta E}'],
    ['$pH = pKa + \\log\\left(\\frac{[A^-]}{[AH]}\\right)$', 'pH = pKa + \\log\\left(\\frac{[A^-]}{[AH]}\\right)'],
  ]

  it.each(corpus)('extracts raw TeX from %s', (md, tex) => {
    const doc = parseMarkdown(`Phrase ${md} fin.`, {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const comps = findInlineComponents(doc)
    expect(comps.length).toBe(1)
    expect(comps[0].properties.tex).toBe(tex)
  })

  it('renders a dense multi-math sentence without mixing delimiters', () => {
    const md =
      'On forme 2 fois plus de protons $[\\text{H}_2\\text{O}] = 55{,}6$ et $K_d$ vaut $10^{-14}$ à 25 °C.'
    const doc = parseMarkdown(md, { extensions: [mathInlineExtension(inlineOpts)] })
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual([
      '[\\text{H}_2\\text{O}] = 55{,}6',
      'K_d',
      '10^{-14}',
    ])
  })

  it('keeps prose dollars with inner spaces as literal text (strict mode)', () => {
    const doc = parseMarkdown(
      'Le coût est de $ 5 et le double vaut $ 10 aujourd’hui.',
      { extensions: [mathInlineExtension(inlineOpts)] },
    )
    expect(findInlineComponents(doc).length).toBe(0)
  })

  it('keeps monetary dollars without matching pair as literal text', () => {
    const doc = parseMarkdown('This costs $5 and that costs $10 total.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    expect(findInlineComponents(doc).length).toBe(0)
  })

  it('leaves inline code and fenced code untouched', () => {
    const doc = parseMarkdown(
      'Run `$x$` in shell:\n\n```md\nNo math $x$ here.\n```\n\nAfter $y$.',
      { extensions: [mathInlineExtension(inlineOpts)] },
    )
    const comps = findInlineComponents(doc)
    expect(comps.map((c) => c.properties.tex)).toEqual(['y'])
  })

  it('supports allowSpaces mode for audited corpora', () => {
    const doc = parseMarkdown('Legacy $ x + y $ spacing.', {
      extensions: [mathInlineExtension({ ...inlineOpts, allowSpaces: true })],
    })
    const comps = findInlineComponents(doc)
    expect(comps[0].properties.tex).toBe('x + y')
  })

  it('restores protected characters (backslashes, underscores) in tex payload', () => {
    const protected_ = protectMath('Matrice $\\begin{pmatrix} a_1 & b_2 \\\\ c & d \\end{pmatrix}$ fin')
    const doc = parseMarkdown(protected_, {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const comps = findInlineComponents(doc)
    expect(comps[0].properties.tex).toBe(
      '\\begin{pmatrix} a_1 & b_2 \\\\ c & d \\end{pmatrix}',
    )
  })
})

describe('inline component mode — composition with blocks', () => {
  it('mathExtension(output: component) covers block and inline math', () => {
    const doc = parseMarkdown(
      'Inline $a$ then:\n\n$$\\int_0^1 x\\,dx$$\n\nand inline $b$ again.',
      { extensions: mathExtension({ output: 'component' }) },
    )
    const inline = findInlineComponents(doc).filter((n) => n.type === 'inlineComponent')
    expect(inline.map((c) => c.properties.tex)).toEqual(['a', 'b'])
    const block = doc.children.find(
      (n) => (n as { type?: string }).type === 'component',
    ) as unknown as { properties?: { tex?: string }; tagName?: string }
    expect(block?.properties?.tex).toBe('\\int_0^1 x\\,dx')
    expect(block?.tagName).toBe('MathBlock')
  })

  it('streaming: unclosed inline math stays literal until the closing dollar arrives', () => {
    const partial = parseMarkdown('Partial $x + y', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    expect(findInlineComponents(partial).length).toBe(0)
    const complete = parseMarkdown('Partial $x + y$ done.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    expect(findInlineComponents(complete)[0].properties.tex).toBe('x + y')
  })
})

describe('inline component mode — HTML renderer without allowHtml', () => {
  it('renders katex inline output with no allowHtml and no katex-display', () => {
    const doc = parseMarkdown('Force **$F$** equals $ma$.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const html = renderHtml(doc, { extensions: [mathInlineExtension(inlineOpts)] })
    expect(html).toContain('<span class="katex"')
    expect(html).not.toContain('katex-display')
    expect(html).toContain('<strong>')
  })

  it('honors a custom render function', () => {
    const ext = mathInlineExtension({
      ...inlineOpts,
      render: (tex) => `<custom-math>${tex}</custom-math>`,
    })
    const doc = parseMarkdown('Value $v$ end.', { extensions: [ext] })
    expect(renderHtml(doc, { extensions: [ext] })).toContain('<custom-math>v</custom-math>')
  })

  it('survives a JSON round-trip and re-renders identically', () => {
    const md = 'pH $pKa + \\log(x)$ et $K_d$.'
    const ext = mathInlineExtension(inlineOpts)
    const doc = parseMarkdown(md, { extensions: [ext] })
    const first = renderHtml(doc, { extensions: [ext] })
    const roundTripped = JSON.parse(JSON.stringify(doc)) as MarkdownDocument
    expect(renderHtml(roundTripped, { extensions: [ext] })).toBe(first)
    expect(first).toContain('katex')
  })
})

describe('inline component mode — React renderer', () => {
  it('passes tex to the mapped MathInline component without allowHtml', () => {
    const doc = parseMarkdown('Coef $k_b$ ok.', {
      extensions: [mathInlineExtension(inlineOpts)],
    })
    const element = createElement(
      ({ children }: any) => createElement('div', null, children),
      null,
      doc.children.map((node: any, i: number) =>
        node.type === 'paragraph'
          ? createElement(
              'p',
              { key: i },
              node.children.map((c: any, j: number) =>
                c.type === 'inlineComponent'
                  ? createElement(
                      (props: any) => createElement('span', null, `TEX:${props.tex}`),
                      { key: j, ...c.properties },
                    )
                  : createElement('span', { key: j }, c.value ?? ''),
              ),
            )
          : null,
      ),
    )
    expect(renderToStaticMarkup(element)).toContain('TEX:k_b')
  })

  it('MathInline renders inline katex (no display mode) by default', () => {
    const html = renderToStaticMarkup(createElement(MathInline, { tex: 'a^2' }))
    expect(html).toContain('katex')
    expect(html).not.toContain('katex-display')
  })

  it('MathInline renders display mode on demand', () => {
    const html = renderToStaticMarkup(
      createElement(MathInline, { tex: 'a^2', displayMode: true }),
    )
    expect(html).toContain('katex-display')
  })

  it('MathInline is safe without tex', () => {
    const html = renderToStaticMarkup(createElement(MathInline, {}))
    expect(html).toContain('class="math-inline"')
    expect(html).not.toContain('Erreur')
  })

  it('end-to-end <Markdown> with components map and no allowHtml', () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        extensions: [mathInlineExtension(inlineOpts)],
        components: {
          MathInline: (props: any) =>
            createElement('span', { className: 'probe' }, `(${props.tex})`),
        },
        children: 'Delta $\\Delta G$ end.',
      }),
    )
    expect(html).toContain('<span class="probe">(\\Delta G)</span>')
  })
})
