import { createElement } from 'react'

import katexRender from 'katex'

const DEFAULT_KATEX_OPTIONS: katexRender.KatexOptions = {
  throwOnError: false,
  strict: false,
}

export interface MathComponentProps {
  /** Raw TeX payload carried by the `component` node's `properties.tex`. */
  tex?: string
  /** Render in display mode. Defaults to `true` for block math. */
  displayMode?: boolean
}

/**
 * Ready-made React component for `mathBlockExtension({ output: 'component' })`.
 *
 * Map it through the renderers' `components` option so block math renders
 * without `allowHtml`:
 *
 * ```tsx
 * import { Markdown } from '@tanstack/markdown/react'
 * import { mathExtension } from 'tanstack-markdown-math'
 * import { MathBlock } from 'tanstack-markdown-math/react'
 *
 * <Markdown
 *   extensions={mathExtension({ output: 'component' })}
 *   components={{ MathBlock }}
 * >
 *   {'$$\\frac{1}{2}$$'}
 * </Markdown>
 * ```
 */
export function MathBlock({ tex, displayMode = true }: MathComponentProps) {
  const html = katexRender.renderToString(tex ?? '', {
    ...DEFAULT_KATEX_OPTIONS,
    displayMode,
  })
  return createElement('div', {
    className: 'math-block',
    dangerouslySetInnerHTML: { __html: html },
  })
}
