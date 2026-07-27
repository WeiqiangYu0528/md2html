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

  const remapSvgIds = (svg, suffix) => {
    const idMap = new Map();
    const assignedIds = new Set();
    const svgElements = [svg, ...svg.querySelectorAll('*')];
    const elementsWithIds = svgElements.filter((element) => element.id);

    for (const element of elementsWithIds) {
      const oldId = element.id;
      const baseId = oldId + '--lightbox-' + suffix;
      let newId = baseId;
      let collision = 1;
      while (document.getElementById(newId) || assignedIds.has(newId)) {
        newId = baseId + '-' + collision++;
      }
      assignedIds.add(newId);
      idMap.set(oldId, newId);
      element.id = newId;
    }

    if (idMap.size === 0) return;

    const replaceLocalUrl = (value) => value.replace(
      /url\\(\\s*#([^\\s)]+)\\s*\\)/g,
      (reference, id) => idMap.has(id) ? 'url(#' + idMap.get(id) + ')' : reference,
    );
    const replaceLocalHref = (value) => {
      if (!value.startsWith('#')) return value;
      const id = value.slice(1);
      return idMap.has(id) ? '#' + idMap.get(id) : value;
    };

    const transformCss = (text, transformHash, transformUrl) => {
      let result = '';
      let quote = '';
      let bracketDepth = 0;
      for (let index = 0; index < text.length;) {
        const character = text[index];
        if (!quote && character === '/' && text[index + 1] === '*') {
          const end = text.indexOf('*/', index + 2);
          const next = end < 0 ? text.length : end + 2;
          result += text.slice(index, next);
          index = next;
          continue;
        }
        if (quote) {
          result += character;
          if (character === '\\\\') {
            result += text[index + 1] || '';
            index += 2;
            continue;
          }
          if (character === quote) quote = '';
          index++;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          result += character;
          index++;
          continue;
        }
        if (character === '[') bracketDepth++;
        if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        if (transformUrl && text.slice(index, index + 4).toLowerCase() === 'url(') {
          const match = text.slice(index).match(/^url\\(\\s*#([^\\s)]+)\\s*\\)/i);
          if (match && idMap.has(match[1])) {
            result += 'url(#' + idMap.get(match[1]) + ')';
            index += match[0].length;
            continue;
          }
        }
        if (!transformHash || character !== '#' || bracketDepth > 0) {
          result += character;
          index++;
          continue;
        }
        let end = index + 1;
        while (end < text.length && /[A-Za-z0-9_-]/.test(text[end])) end++;
        const id = text.slice(index + 1, end);
        result += idMap.has(id) ? '#' + idMap.get(id) : text.slice(index, end);
        index = end;
      }
      return result;
    };
    const findCssDelimiter = (css, start, delimiters) => {
      let quote = '';
      let parentheses = 0;
      for (let index = start; index < css.length; index++) {
        const character = css[index];
        if (!quote && character === '/' && css[index + 1] === '*') {
          const end = css.indexOf('*/', index + 2);
          if (end < 0) return css.length;
          index = end + 1;
          continue;
        }
        if (quote) {
          if (character === '\\\\') index++;
          else if (character === quote) quote = '';
          continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === '(') parentheses++;
        else if (character === ')') parentheses = Math.max(0, parentheses - 1);
        else if (parentheses === 0 && delimiters.includes(character)) return index;
      }
      return css.length;
    };
    const findClosingBrace = (css, open) => {
      let depth = 1;
      let quote = '';
      for (let index = open + 1; index < css.length; index++) {
        const character = css[index];
        if (!quote && character === '/' && css[index + 1] === '*') {
          const end = css.indexOf('*/', index + 2);
          if (end < 0) return css.length;
          index = end + 1;
          continue;
        }
        if (quote) {
          if (character === '\\\\') index++;
          else if (character === quote) quote = '';
          continue;
        }
        if (character === '"' || character === "'") quote = character;
        else if (character === '{') depth++;
        else if (character === '}' && --depth === 0) return index;
      }
      return css.length;
    };
    const classifyCssPrelude = (prelude) => {
      let index = 0;
      while (index < prelude.length) {
        while (index < prelude.length && /\\s/.test(prelude[index])) index++;
        if (prelude[index] !== '/' || prelude[index + 1] !== '*') break;
        const commentEnd = prelude.indexOf('*/', index + 2);
        if (commentEnd < 0) return '';
        index = commentEnd + 2;
      }
      return prelude.slice(index).toLowerCase();
    };
    const rewriteCssRules = (css, keyframes = false) => {
      let result = '';
      let cursor = 0;
      while (cursor < css.length) {
        const delimiter = findCssDelimiter(css, cursor, '{;');
        if (delimiter >= css.length) return result + css.slice(cursor);
        if (css[delimiter] === ';') {
          result += css.slice(cursor, delimiter + 1);
          cursor = delimiter + 1;
          continue;
        }
        const close = findClosingBrace(css, delimiter);
        if (close >= css.length) return result + css.slice(cursor);
        const prelude = css.slice(cursor, delimiter);
        const body = css.slice(delimiter + 1, close);
        const rule = classifyCssPrelude(prelude);
        if (rule.startsWith('@')) {
          const isKeyframes = /^@(?:-webkit-)?keyframes\\b/.test(rule);
          const isDeclarations = /^@(font-face|page|property|counter-style)\\b/.test(rule);
          const rewrittenBody = isDeclarations
            ? transformCss(body, false, true)
            : rewriteCssRules(body, isKeyframes);
          result += prelude + '{' + rewrittenBody + '}';
        } else {
          const rewrittenPrelude = keyframes ? prelude : transformCss(prelude, true, false);
          result += rewrittenPrelude + '{' + transformCss(body, false, true) + '}';
        }
        cursor = close + 1;
      }
      return result;
    };

    for (const style of svg.querySelectorAll('style')) {
      style.textContent = rewriteCssRules(style.textContent || '');
    }

    const urlAttributes = [
      'clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke'
    ];
    const hrefAttributes = ['href', 'xlink:href'];
    const idListAttributes = ['aria-labelledby', 'aria-describedby'];
    for (const element of svgElements) {
      for (const attribute of urlAttributes) {
        const value = element.getAttribute(attribute);
        if (value !== null) element.setAttribute(attribute, replaceLocalUrl(value));
      }
      for (const attribute of hrefAttributes) {
        const value = element.getAttribute(attribute);
        if (value !== null) element.setAttribute(attribute, replaceLocalHref(value));
      }
      for (const attribute of idListAttributes) {
        const value = element.getAttribute(attribute);
        if (value !== null) {
          element.setAttribute(attribute, value.replace(/\\S+/g, (id) => idMap.get(id) || id));
        }
      }
    }
  };

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

  const originalMediaSemantics = new WeakMap();
  let previousFocus = null;
  let svgCloneId = 0;

  const close = () => {
    lightbox.hidden = true;
    content.replaceChildren();
    previousFocus?.focus?.();
  };

  const open = (source) => {
    previousFocus = document.activeElement;
    const clone = source.cloneNode(true);
    if (clone instanceof SVGElement) {
      remapSvgIds(clone, ++svgCloneId);
    } else {
      clone.removeAttribute('id');
    }
    clone.removeAttribute('tabindex');
    clone.classList.remove('media-lightbox-trigger');
    const semantics = originalMediaSemantics.get(source);
    for (const attribute of ['role', 'aria-label']) {
      const value = semantics[attribute];
      if (value === null) clone.removeAttribute(attribute);
      else clone.setAttribute(attribute, value);
    }
    content.replaceChildren(clone);
    lightbox.hidden = false;
    closeButton.focus();
  };

  media.forEach((el) => {
    originalMediaSemantics.set(el, {
      role: el.getAttribute('role'),
      'aria-label': el.getAttribute('aria-label'),
    });
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
    if (lightbox.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus();
    }
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
