import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * `data/` as part of the site (DEP-2, D-33): the dev server answers `<base>data/*` from disk
 * without caching, and the build copies the folder into `dist/data`, so local and CI builds match.
 */
export function dataPlugin(dir = 'data'): Plugin {
  const root = resolve(dir);
  let base = '/';
  return {
    name: 'sales-quest-data',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${base}data/`;
        const url = req.url ?? '';
        if (!url.startsWith(prefix)) return next();
        const file = resolve(
          root,
          decodeURIComponent(url.slice(prefix.length).split('?')[0] ?? ''),
        );
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      if (!existsSync(root)) return;
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const full = join(entry.parentPath, entry.name);
        const path = relative(root, full).split(sep).join('/');
        this.emitFile({ type: 'asset', fileName: `data/${path}`, source: readFileSync(full) });
      }
    },
  };
}
