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
}

export interface MathBlockOptions {
  render?: MathOptions['render']
}

export interface MathInlineOptions {
  render?: MathOptions['render']
  allowSpaces?: MathOptions['allowSpaces']
}
