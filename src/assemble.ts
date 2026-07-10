import type { Theme, TocMode } from './types'
import { escapeHtml } from './escape'

export interface AssembleInput {
  title: string
  bodyHtml: string
  theme: Theme
  /** Visible <h1> header; rendered only when present (from frontmatter title). */
  headerTitle?: string
  /** Inlined @font-face declarations (from --embed-fonts). */
  fontFaceCss?: string
  /** Inlined KaTeX stylesheet (only when the document contains math). */
  katexCss?: string
  /** Document language for the <html lang> attribute (default "en"). */
  lang?: string
  /** Table-of-contents nav HTML, injected after the header (default ""). */
  toc?: string
  /** TOC placement mode; adds a body-class hook for the theme (default "auto"). */
  tocMode?: TocMode
}

export function assembleDocument(input: AssembleInput): string {
  const { title, bodyHtml, theme, headerTitle, fontFaceCss = '', katexCss = '', lang = 'en', toc = '', tocMode = 'auto' } = input
  const header = headerTitle
    ? `<header class="md-header"><h1>${escapeHtml(headerTitle)}</h1></header>\n`
    : ''
  const content = header
    ? `${header}${toc}${bodyHtml}`
    : insertTocAfterLeadingH1(bodyHtml, toc)
  const scope = theme.scopeClass ?? theme.name
  const placementClass = tocMode === 'sidebar' ? ' toc-sidebar' : tocMode === 'topbar' ? ' toc-topbar' : ''
  const bodyClass = `theme-${scope}${placementClass}`
  const hasMediaLightbox = /<img\b/i.test(bodyHtml) || /<figure\b[^>]*class="[^"]*\bmermaid\b/i.test(bodyHtml)
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontFaceCss}${fontFaceCss ? '\n' : ''}${katexCss}${katexCss ? '\n' : ''}${theme.css}${hasMediaLightbox ? `\n${mediaLightboxCss}` : ''}
</style>
</head>
<body class="${bodyClass}">
<article class="md-content">
${content}
</article>
${hasMediaLightbox ? mediaLightboxScript : ''}${toc ? tocStateScript : ''}</body>
</html>
`
}

function insertTocAfterLeadingH1(bodyHtml: string, toc: string): string {
  if (!toc) return bodyHtml
  const leadingH1 = bodyHtml.match(/^(\s*<h1\b[^>]*>[\s\S]*?<\/h1>\n?)/)
  if (!leadingH1) return `${toc}${bodyHtml}`
  return `${leadingH1[1]}${toc}${bodyHtml.slice(leadingH1[1].length)}`
}

const mediaLightboxCss = `.media-lightbox-trigger { cursor: zoom-in; }
.media-lightbox-trigger:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }
.media-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.72);
}
.media-lightbox[hidden] { display: none; }
.media-lightbox-panel {
  position: relative;
  max-width: min(96vw, 1400px);
  max-height: 90vh;
  overflow: auto;
  border-radius: 12px;
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  padding: 1rem;
}
.media-lightbox-content img,
.media-lightbox-content svg {
  display: block;
  max-width: min(92vw, 1320px);
  max-height: 82vh;
  width: auto;
  height: auto;
}
.media-lightbox-content svg { min-width: min(92vw, 960px); }
.media-lightbox-close {
  position: absolute;
  top: 0.45rem;
  right: 0.55rem;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #111;
  font: 1.4rem/1 system-ui, sans-serif;
  cursor: pointer;
}`

const mediaLightboxScript = `<script>
(() => {
  const article = document.querySelector('.md-content');
  if (!article) return;
  const media = Array.from(article.querySelectorAll('img, figure.mermaid svg'))
    .filter((el) => !el.closest('a'));
  if (media.length === 0) return;

  const lightbox = document.createElement('div');
  lightbox.className = 'media-lightbox';
  lightbox.setAttribute('data-media-lightbox', '');
  lightbox.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'media-lightbox-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Expanded media');

  const closeButton = document.createElement('button');
  closeButton.className = 'media-lightbox-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close expanded media');
  closeButton.textContent = '×';

  const content = document.createElement('div');
  content.className = 'media-lightbox-content';

  panel.append(closeButton, content);
  lightbox.append(panel);
  document.body.appendChild(lightbox);

  let previousFocus = null;

  const close = () => {
    lightbox.hidden = true;
    content.replaceChildren();
    previousFocus?.focus?.();
  };

  const open = (source) => {
    previousFocus = document.activeElement;
    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    clone.classList.remove('media-lightbox-trigger');
    content.replaceChildren(clone);
    lightbox.hidden = false;
    closeButton.focus();
  };

  media.forEach((el) => {
    el.classList.add('media-lightbox-trigger');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', el instanceof HTMLImageElement ? 'Open image' + (el.alt ? ': ' + el.alt : '') : 'Open diagram');
    el.addEventListener('click', () => open(el));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(el);
      }
    });
  });

  closeButton.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });
  panel.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) close();
  });
})();
</script>
`

const tocStateScript = `<script>
(() => {
  const nav = document.querySelector('.toc');
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  if (links.length === 0) return;
  const entries = links
    .map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter((entry) => entry.target);
  let activeLink = null;
  // Keep the active link visible inside the TOC's own scroll box (the sticky
  // side-rail). Only nudges when the rail actually scrolls internally and the
  // link is out of view, so it never fights the page scroll on mobile.
  const reveal = (link) => {
    if (nav.scrollHeight <= nav.clientHeight + 1) return;
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    if (linkRect.top < navRect.top) {
      nav.scrollTop += linkRect.top - navRect.top - 8;
    } else if (linkRect.bottom > navRect.bottom) {
      nav.scrollTop += linkRect.bottom - navRect.bottom + 8;
    }
  };
  const activate = (entry) => {
    const link = entry?.link ?? null;
    if (link === activeLink) return;
    links.forEach((l) => l.removeAttribute('aria-current'));
    if (link) {
      link.setAttribute('aria-current', 'location');
      reveal(link);
    }
    activeLink = link;
  };
  const currentEntry = () => {
    let current = entries[0];
    for (const entry of entries) {
      if (entry.target.getBoundingClientRect().top <= 96) current = entry;
    }
    return current;
  };
  const update = () => activate(currentEntry());
  update();
  addEventListener('scroll', update, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(update));
})();
</script>
`
