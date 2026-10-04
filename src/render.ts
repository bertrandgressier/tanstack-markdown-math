import katex from 'katex'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderError(tex: string, displayMode: boolean, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const title = escapeHtml(msg)
  const code = escapeHtml(tex)
  return displayMode
    ? `<div class="katex-error-box" title="${title}"><strong>KaTeX error:</strong> ${title}<pre>${code}</pre></div>`
    : `<span class="katex-error-badge" title="${title}"><code>${code}</code></span>`
}

/**
 * Default KaTeX renderer shared by the html output mode and the React
 * components. Invalid TeX yields a neutral, class-only error element
 * (`katex-error-badge` inline, `katex-error-box` in display mode).
 */
export function defaultRenderer(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: false,
    })
  } catch (err) {
    return renderError(tex, displayMode, err)
  }
}
