/** JS the browser must load before the first render: ≤ 600 KB gzip (PERF-BUDGET). */
export const INITIAL_JS_BUDGET_BYTES = 600 * 1024;

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

/** URLs of `<script type="module" src>` and `<link rel="modulepreload" href>` in the built index.html. */
export function collectInitialJs(html: string): string[] {
  const urls: string[] = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const isModuleScript = tag.startsWith('<script') && attr(tag, 'type') === 'module';
    const isPreload = tag.startsWith('<link') && attr(tag, 'rel') === 'modulepreload';
    const url = isModuleScript ? attr(tag, 'src') : isPreload ? attr(tag, 'href') : undefined;
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

/** `/sales-quest/assets/x.js` → `assets/x.js` (its path inside dist/). */
export function toDistPath(url: string, basePath: string): string {
  if (!url.startsWith(basePath)) throw new Error(`${url} is outside the site base ${basePath}`);
  return url.slice(basePath.length);
}
