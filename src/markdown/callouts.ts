import type { MarkdownItAlertOptions } from '@mdit/plugin-alert'

const LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

/**
 * Options for @mdit/plugin-alert that emit our stable theme-contract markup:
 *   <div class="callout callout-<type>">
 *     <p class="callout-title"><Label></p>
 *     ...body...
 *   </div>
 *
 * Implementation note: @mdit/plugin-alert sets the alert_open token's class
 * attribute to "markdown-alert markdown-alert-<type>" (via attrJoin). We
 * extract the bare type from tokens[index].markup, which the plugin sets to
 * the lowercase alert name (e.g. "note", "tip"). This is more reliable than
 * parsing the class string.
 *
 * titleRender is set to return '' to suppress the default
 * <p class="markdown-alert-title"> element; openRender supplies the title
 * so all contract markup is produced in one place.
 */
export const calloutOptions: MarkdownItAlertOptions = {
  alertNames: ['note', 'tip', 'important', 'warning', 'caution'],
  openRender: (tokens, index) => {
    // tokens[index].markup is set by the plugin to the lowercase alert name
    const type = tokens[index].markup ?? 'note'
    const label = LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
    return `<div class="callout callout-${type}">\n<p class="callout-title">${label}</p>\n`
  },
  titleRender: () => '',
}
