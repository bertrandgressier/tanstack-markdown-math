import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '@tanstack/markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@tanstack/markdown/react'
import { createElement } from 'react'
import { mathBlockExtension, mathExtension } from '../src/index.js'
import { MathBlock, MathInline } from '../src/react.js'

const render = (tex: string, d: boolean) => `<m d="${d}">${tex}</m>`
const ext = () => mathExtension({ render })
const opts = (extra: object = {}) => ({ extensions: ext(), ...extra })

function collect(doc: unknown, types: string[]): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (types.includes(n.type)) out.push(n)
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v)
  }
  walk(doc)
  return out
}
const maths = (md: string, o: object = {}) =>
  collect(parseMarkdown(md, opts(o) as never), ['inlineHtml']).map((n) => n.value)

describe('escapes and currency', () => {
  it('keeps escaped dollars literal', () => {
    expect(maths('\\$5 and \\$10')).toEqual([])
    expect(maths('\\$a\\$')).toEqual([])
  })
  it('allows escaped dollar inside math', () => {
    expect(maths('$a \\$ b$')).toEqual(['<m d="false">a \\$ b</m>'])
  })
  it('does not treat currency pairs as math', () => {
    expect(maths('$5-$10 range')).toEqual([])
    // whitespace before the closing $ and a digit after it both reject
    expect(maths('$5 and $10')).toEqual([])
    // no digit after the closing $: still math
    expect(maths('$5+x$ and $y$')).toHaveLength(2)
  })
})

describe('math without protectMath', () => {
  it.each([
    ['$a*b*c$', 'a*b*c'],
    ['$x_{i}*y_{j}$', 'x_{i}*y_{j}'],
    ['$\\{a\\}\\\\ b$', '\\{a\\}\\\\ b'],
    ['$_2$ and _x_', '_2'],
  ])('%s', (md, tex) => {
    expect(maths(md)[0]).toBe(`<m d="false">${tex}</m>`)
  })
})

describe('structure', () => {
  it('handles math in headings (slug includes math source)', () => {
    const doc = parseMarkdown('# Title $x_1$ more', opts() as never)
    const h = collect(doc, ['heading'])[0]
    // The slug is derived from the heading's plain text; math nodes are not
    // text, so the math source does not appear in it.
    expect(h.id).toBe('title-more')
    expect(typeof h.id).toBe('string')
    expect(collect(h, ['inlineHtml'])).toHaveLength(1)
  })
  it('block math in list, blockquote, callout', async () => {
    const { calloutsExtension } = await import('@tanstack/markdown/extensions/callouts')
    const o = { extensions: [...ext(), calloutsExtension()] } as never
    const blockMath = (md: string) =>
      collect(parseMarkdown(md, o), ['html']).filter((n) => n.value.includes('<m d="true">'))
    expect(blockMath('- item\n\n  $$\n  x\n  $$\n')).toHaveLength(1)
    expect(blockMath('> $$\n> y\n> $$')).toHaveLength(1)
    expect(blockMath('> [!NOTE]\n> $$\n> z\n> $$')).toHaveLength(1)
  })
  it('component output inside lists and tables', () => {
    const e = mathExtension({ output: 'component' })
    const doc = parseMarkdown('- a $x_1$\n\n| a | b |\n|---|---|\n| $y$ | z |', { extensions: e })
    const comps = collect(doc, ['inlineComponent'])
    expect(comps.map((c) => c.properties.tex)).toEqual(['x_1', 'y'])
  })
  it('block html with inline tag still gets math (allowHtml), without mutation', () => {
    const o = { allowHtml: true, extensions: ext() } as never
    const doc = parseMarkdown('<u>$V_1$ : text</u>', o)
    const before = JSON.stringify(doc)
    expect(before).toContain('<m d=\\"false\\">V_1</m>')
  })
  it('parsing the same document twice gives identical results', () => {
    const md = '# H $a$\n\n- $b$\n\n<u>$c$</u>\n\n| a |\n|---|\n| $d$ |\n\n$$e$$'
    const e = ext()
    const a = JSON.stringify(parseMarkdown(md, { allowHtml: true, extensions: e }))
    const b = JSON.stringify(parseMarkdown(md, { allowHtml: true, extensions: e }))
    expect(a).toBe(b)
  })
  it('transformDocument does not mutate input nodes', () => {
    const inline = ext()[1]
    const html = { type: 'html', value: '<u>$a$</u>' }
    const doc = { type: 'document', children: [{ type: 'blockquote', children: [html] }] } as any
    const frozen = JSON.stringify(doc)
    const out = inline.transformDocument!(doc, { options: {} } as never) as any
    expect(JSON.stringify(doc)).toBe(frozen)
    expect(out).not.toBe(doc)
    expect(out.children[0].children[0].value).toContain('<m d="false">a</m>')
  })
})

describe('block hardening', () => {
  it('does not steal 4-space indented code', () => {
    const doc = parseMarkdown('    $$\n    x\n    $$', opts() as never)
    expect(collect(doc, ['html']).filter((n) => n.value.includes('d="true"'))).toHaveLength(0)
  })
  it('unclosedBlock: false leaves unclosed $$ as text', () => {
    const o = { extensions: [mathBlockExtension({ render, unclosedBlock: false })] }
    expect(collect(parseMarkdown('$$\nx', o), ['html'])).toHaveLength(0)
    expect(collect(parseMarkdown('$$\nx\n$$', o), ['html'])).toHaveLength(1)
  })
  it('unclosedBlock defaults to true', () => {
    const o = { extensions: [mathBlockExtension({ render })] }
    expect(collect(parseMarkdown('$$\nx', o), ['html'])).toHaveLength(1)
  })
  it('trims tex in html and component block modes', () => {
    const h = collect(parseMarkdown('$$ x $$', { extensions: [mathBlockExtension({ render })] }), ['html'])
    expect(h[0].value).toBe('<m d="true">x</m>')
    const c = collect(
      parseMarkdown('$$ x $$', { extensions: [mathBlockExtension({ output: 'component' })] }),
      ['component'],
    )
    expect(c[0].properties.tex).toBe('x')
  })
})

describe('default renderer errors', () => {
  it('uses neutral english error output', () => {
    const doc = parseMarkdown('$\\badmacro{1}$\n\n$$\\badmacro{1}$$', {
      extensions: mathExtension(),
    })
    const html = collect(doc, ['html', 'inlineHtml']).map((n) => n.value).join('')
    expect(html).toContain('katex-error-badge')
    expect(html).toContain('katex-error-box')
    expect(html).toContain('KaTeX error')
  })
  it('React components share the same error output', () => {
    const out = renderToStaticMarkup(createElement(MathInline, { tex: '\\badmacro' }))
    expect(out).toContain('katex-error-badge')
    expect(renderToStaticMarkup(createElement(MathBlock, { tex: ' x ' }))).toContain('katex')
    const md = renderToStaticMarkup(
      createElement(Markdown, {
        extensions: mathExtension({ output: 'component' }),
        components: { MathBlock, MathInline },
        children: 'a $\\badmacro$',
      } as never),
    )
    expect(md).toContain('katex-error-badge')
  })
})

describe('robustness', () => {
  const corpus = [
    '# Title $x_1$ more',
    'Inline $a*b*c$ and $$\\frac{a}{b}$$ and \\$5 or $5-$10.',
    '- item $a_b$\n> quote $c_d$',
    '| a | b |\n|---|---|\n| $x_1$ | $y*z$ |',
    '$$\n\\begin{aligned}\nx &= 1\n\\end{aligned}\n$$',
    '> [!TIP]\n> Use $\\LaTeX$ here.',
    '<u>$V_1$ : text</u> and `$code$`',
  ].join('\n\n')

  it('parses every prefix of a math-heavy corpus without throwing', async () => {
    const { streamingMarkdownExtension } = await import('@tanstack/markdown/extensions/streaming')
    const { calloutsExtension } = await import('@tanstack/markdown/extensions/callouts')
    const extensions = [...mathExtension({ render }), calloutsExtension(), streamingMarkdownExtension()]
    for (let i = 0; i <= corpus.length; i++) {
      for (const allowHtml of [false, true]) {
        expect(() => parseMarkdown(corpus.slice(0, i), { allowHtml, extensions })).not.toThrow()
      }
    }
  })

  it.each(['$a ', '$$a ', '$', '\\$a ', '$a\n'])('pathological input %j completes quickly', (unit) => {
    const input = unit.repeat(20000)
    const t = performance.now()
    parseMarkdown(input, opts() as never)
    parseMarkdown(input, { allowHtml: true, extensions: ext() } as never)
    expect(performance.now() - t).toBeLessThan(5000)
  })
})
