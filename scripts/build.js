// Bundles src/ into dist/bundle.js: one IIFE that is evaluated in Steam's SharedJSContext over CDP.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  // Only local identifiers are shortened; property names used by Steam and the injector stay intact.
  minify: !process.argv.includes('--debug'),
  format: 'iife',
  target: 'chrome126',
  outfile: 'dist/bundle.js',
  charset: 'utf8',
  define: { __FJK_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: `/*! frame-keyboard ${pkg.version} | MIT License */` },
  logLevel: 'info',
});
