# Mermaid CLI Rendering Design

## Goal

Make Mermaid diagrams render reliably in generated HTML without requiring users to run separate browser-install commands. The generated HTML should remain self-contained: successful diagrams are inlined SVG, and failed diagrams fall back to readable source blocks.

## Problem

The current Mermaid renderer launches Playwright directly and expects a Playwright-managed Chromium binary to already exist on the host. When that browser binary is missing, every Mermaid block silently becomes a fallback source block. That makes the CLI look successful even though diagrams did not render, and it forces users to understand Playwright browser cache details.

## Decision

Use `@mermaid-js/mermaid-cli` as the Mermaid rendering backend instead of hand-written Playwright rendering.

`@mermaid-js/mermaid-cli` should be a normal runtime dependency of `md2html`. Its Puppeteer/Chromium setup is handled by npm installation, so a normal `npm install` prepares the Mermaid renderer. `md2html` should invoke the local dependency, not a globally installed `mmdc`.

## Rendering behavior

For each Markdown fence whose info string is exactly `mermaid`:

1. Write the Mermaid source to a temporary `.mmd` file.
2. Invoke local Mermaid CLI to render that file to a temporary `.svg` file.
3. Read the SVG and inline it into the final document as:

```html
<figure class="mermaid">...svg...</figure>
```

4. If rendering that diagram fails, emit a fallback block for that diagram only:

```html
<figure class="mermaid-fallback"><pre><code>...</code></pre></figure>
```

5. Print a clear warning to stderr with the diagram index and Mermaid CLI error.

A bad Mermaid diagram should not prevent the rest of the document from rendering. Other valid diagrams in the same document should still render to SVG.

## Environment failure behavior

Environment failures should not be silent. If the local Mermaid CLI cannot be found, Chromium/Puppeteer is unavailable, or the renderer cannot start, `md2html` may still produce fallback blocks, but it must print a clear warning explaining that Mermaid rendering infrastructure failed and diagrams were shown as source.

The warning should point users toward reinstalling dependencies rather than installing Playwright manually. The expected fix is a normal dependency install for this package, not `playwright install chromium`.

## Dependency model

`md2html` should remove its direct Mermaid rendering dependency on Playwright. Mermaid rendering should go through `@mermaid-js/mermaid-cli`.

The package should not require:

- A globally installed `mmdc`.
- A globally installed Chrome.
- A manually run `playwright install chromium` command.

The package can rely on npm installing the dependencies and browser assets required by Mermaid CLI/Puppeteer.

## Theme integration

Theme Mermaid configuration should continue to work. Existing theme `mermaid` config from `theme.json` should be passed to Mermaid CLI through a temporary config file or equivalent CLI-supported mechanism.

The output SVG remains wrapped by the theme-owned `.mermaid` styles. Fallback blocks remain wrapped by `.mermaid-fallback` and continue using existing theme styles.

## CLI output

Successful Mermaid rendering should not add noisy output.

Fallbacks should produce warnings similar to:

```text
Warning: Mermaid diagram 2 failed to render; showing source fallback.
<renderer error>
```

Renderer infrastructure failure should produce a warning similar to:

```text
Warning: Mermaid renderer could not start; showing source fallback for 4 diagrams.
<renderer error>
```

The CLI should still print the final `Wrote <path>` line when the HTML file is produced.

## Testing

Tests should cover:

- A valid Mermaid diagram renders to `<figure class="mermaid"><svg ...` when the renderer succeeds.
- Multiple Mermaid diagrams preserve document order.
- A single invalid diagram becomes `.mermaid-fallback` while other valid diagrams render.
- Renderer infrastructure failure falls back for all Mermaid diagrams and reports a warning.
- Theme Mermaid config is passed to the renderer.
- Non-Mermaid code fences still go through Shiki.

Real Mermaid CLI integration tests may be gated or isolated because they depend on the installed browser assets. Unit tests should mock the renderer boundary so normal test runs do not require launching Chromium.

## Out of scope

- Client-side Mermaid runtime rendering in the browser.
- CDN-based Mermaid loading.
- Global `mmdc` discovery.
- Changing Markdown syntax or theme visual design.
