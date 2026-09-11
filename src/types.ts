export interface MathOptions {
  /**
   * Custom math renderer. Receives the raw TeX string and whether it should
   * be rendered in display mode. Defaults to `katex.renderToString` with
   * `throwOnError: false` and `strict: false`.
   */
  render?: (tex: string, displayMode: boolean) => string
  /**
   * Allow spaces immediately inside inline math delimiters.
   *
   * - `false` (default): matches `$x+y$` but keeps `$5 and $10` as literal
   *   text, following remark-math strict semantics.
   * - `true`: allows spaces, matching `\$([^$\n]+?)\$` — useful for legacy
   *   corpora where every dollar pair has been audited.
   */
  allowSpaces?: boolean
  /**
   * Output node type for block math.
   *
   * - `'html'` (default): emits a pre-rendered `html` node. Simplest, but
   *   renderers need `allowHtml: true`.
   * - `'component'`: emits a `component` node carrying the raw TeX in
   *   `properties.tex`. No `allowHtml` needed: the extension handles HTML
   *   rendering via its `renderHtml` hook, and React consumers pick the
   *   implementation through `components: { [tagName]: MathBlock }`.
   */
  output?: 'html' | 'component'
  /**
   * Tag name used for `output: 'component'`. Default `'MathBlock'`.
   * Map it to a component of your choice via the renderers' `components` map.
   */
  tagName?: string
}

export interface MathBlockOptions {
  render?: MathOptions['render']
  output?: MathOptions['output']
  tagName?: MathOptions['tagName']
}

export interface MathInlineOptions {
  render?: MathOptions['render']
  allowSpaces?: MathOptions['allowSpaces']
}

