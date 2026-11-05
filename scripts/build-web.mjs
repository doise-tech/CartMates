// Builds the web preview. Writes two files to dist-web/:
//   cartmates.html          full page, open it anywhere
//   cartmates.fragment.html same page without doctype/head, for hosts that wrap it (artifacts)
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out = await build({
  entryPoints: ['web/main.js'], bundle: true, format: 'iife', target: 'es2020', minify: true, write: false,
  define: { __SUPABASE_URL__: '""', __SUPABASE_ANON_KEY__: '""' },
  logLevel: 'warning',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = (await readFile('ui/styles.css', 'utf8')) + '\n' + (await readFile('web/web.css', 'utf8'));
const shell = await readFile('web/shell.html', 'utf8');
const fragment = shell.replace('/*CSS*/', () => css).replace('/*JS*/', () => js);

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fragment.replace(/^<title>.*<\/title>\n/, (m) => m)}`.replace('<div class="pv">', '</head>\n<body>\n<div class="pv">') + '\n</body>\n</html>\n';

await mkdir('dist-web', { recursive: true });
await writeFile('dist-web/cartmates.fragment.html', fragment);
await writeFile('dist-web/cartmates.html', full);
console.log(`[cartmates] web preview built: ${(fragment.length / 1024).toFixed(0)} KB`);
