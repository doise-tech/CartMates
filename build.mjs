import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');

async function loadEnv() {
  const env = { ...process.env };
  if (existsSync('.env')) {
    const text = await readFile('.env', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = await loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.warn('\n[cartmates] SUPABASE_URL or SUPABASE_ANON_KEY is missing. Copy .env.example to .env and fill both in.\n');
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/popup', { recursive: true });
await cp('manifest.json', 'dist/manifest.json');
await cp('popup/popup.html', 'dist/popup/popup.html');
await cp('ui/styles.css', 'dist/popup/popup.css');
await cp('confirmed', 'dist/confirmed', { recursive: true });

const options = {
  entryPoints: { 'popup/popup': 'popup/popup.js', content: 'content/drawer.js', background: 'background.js', 'confirmed/confirmed': 'confirmed/confirmed.js' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: {
    __SUPABASE_URL__: JSON.stringify(url || ''),
    __SUPABASE_ANON_KEY__: JSON.stringify(key || ''),
  },
  loader: { '.css': 'text' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[cartmates] watching for changes. Reload the extension in chrome://extensions after each build.');
} else {
  await build(options);
  console.log('[cartmates] built to ./dist. Load that folder in chrome://extensions (Developer mode).');
}
