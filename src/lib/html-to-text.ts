// Converts pasted HTML to readable text for the LLM.
// Headings become "#" lines, list items "- " lines, everything else plain lines.
// Ported from htmlToLines in references/recipe-to-obsidian.html.

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'FOOTER', 'HEADER', 'ASIDE', 'BUTTON',
  'FORM', 'SVG', 'IFRAME', 'SELECT', 'INPUT', 'TEMPLATE',
])
const BLOCK = /^(P|DIV|SECTION|ARTICLE|MAIN|LI|UL|OL|H[1-6]|TR|TD|TH|DT|DD|BR|BLOCKQUOTE|FIGCAPTION|TABLE|TBODY)$/

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  let cur = ''
  let prefix = ''

  const flush = () => {
    const t = cur.replace(/\s+/g, ' ').trim()
    if (t) out.push(prefix + t)
    cur = ''
    prefix = ''
  }

  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      cur += n.nodeValue ?? ''
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as Element
    const tag = el.tagName.toUpperCase()
    if (tag === 'INPUT') {
      // Steppers such as the servings count live in an <input>: keep short numeric values.
      const v = (el.getAttribute('value') ?? '').trim()
      if (/^\d+([.,]\d+)?$/.test(v)) cur += ` ${v} `
      return
    }
    if (SKIP_TAGS.has(tag) || tag === 'IMG') return

    const block = BLOCK.test(tag)
    if (block) flush()
    if (/^H[1-6]$/.test(tag)) prefix = '#'.repeat(Number(tag[1])) + ' '
    else if (tag === 'LI') prefix = '- '
    for (const c of Array.from(el.childNodes)) walk(c)
    if (tag === 'TD' || tag === 'TH') cur += ' '
    if (block) flush()
  }

  walk(doc.body)
  flush()
  return out.join('\n')
}

/** Normalises plain pasted text: trims lines, drops empty ones. */
export function plainToText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}
