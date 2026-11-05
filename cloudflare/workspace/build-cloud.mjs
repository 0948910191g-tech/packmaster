import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const output = join(here, 'public');
const vendorDir = join(output, 'vendor');
const cacheDir = join(here, '.build-cache');
const require = createRequire(import.meta.url);
const pinnedSha256 = {
  'babel.min.js': '56277886bae4e9cb597f987e756143f52ca865b8a6b93c98fd0295c70fdb8563',
  'react.min.js': 'd949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd',
  'react-dom.min.js': '35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d',
  'pdf.min.js': '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946',
  'pdf.worker.min.js': 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b',
  'html2canvas.min.js': 'e87e550794322e574a1fda0c1549a3c70dae5a93d9113417a429016838eab8cb',
  'jspdf.umd.min.js': '98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875'
};

const pinned = [
  ['babel.min.js', 'https://unpkg.com/@babel/standalone@7.27.7/babel.min.js', cacheDir],
  ['react.min.js', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js', vendorDir],
  ['react-dom.min.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', vendorDir],
  ['pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', vendorDir],
  ['pdf.worker.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', vendorDir],
  ['html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', vendorDir],
  ['jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', vendorDir]
];
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function downloadPinned([name, url, folder]) {
  const file = join(folder, name);
  if (!(await exists(file))) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.url.startsWith('https://')) {
      throw new Error('Dependency download failed: ' + name);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 10000 || bytes.length > 8000000) {
      throw new Error('Unexpected dependency size: ' + name);
    }
    await writeFile(file, bytes);
  }
  const data = await readFile(file);
  const digest = createHash('sha256').update(data).digest('hex');
  if (digest !== pinnedSha256[name]) throw new Error('Dependency SHA-256 mismatch: ' + name);
  return file;
}
await mkdir(output, { recursive: true });
await mkdir(vendorDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });
const cached = await Promise.all(pinned.map(downloadPinned));
const babel = require(cached[0]);
if (typeof babel.transform !== 'function') throw new Error('Babel compiler is unavailable');

let html = await readFile(join(root, 'index.html'), 'utf8');
const style = /<style>([\s\S]*?)<\/style>/.exec(html);
const jsx = /<script type="text\/babel">([\s\S]*?)<\/script>/.exec(html);
if (!style || !jsx) throw new Error('PackMaster source format changed: inspect before rebuilding');
let source = jsx[1].replace(
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  './vendor/pdf.worker.min.js'
);
const transformed = babel.transform(source, {
  presets: [['react', { runtime: 'classic' }]],
  sourceType: 'script', comments: false, compact: false
}).code;
await writeFile(join(output, 'app.js'), transformed, 'utf8');

const tailwindInput = join(cacheDir, 'tailwind.input.css');
const tailwindOutput = join(cacheDir, 'tailwind.generated.css');
await writeFile(tailwindInput, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
const cli = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const build = spawnSync(cli, [
  '--yes', 'tailwindcss@3.4.17',
  '--input', tailwindInput, '--output', tailwindOutput,
  '--content', join(root, 'index.html'), '--minify'
], {
  cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
  timeout: 120000
});
if (build.status !== 0) {
  throw new Error('Tailwind build failed: ' + (build.stderr || build.error?.message || 'Unknown error').slice(-1200));
}
const generatedCss = await readFile(tailwindOutput, 'utf8');
await writeFile(join(output, 'app.css'), generatedCss + '\n' + style[1], 'utf8');

const rewrites = [
  ['<script src="https://cdn.tailwindcss.com"></script>', ''],
  ['<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>', '<script src="./vendor/react.min.js"></script>'],
  ['<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>', '<script src="./vendor/react-dom.min.js"></script>'],
  ['<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>', ''],
  ['<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>', '<script src="./vendor/pdf.min.js"></script>'],
  ['<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>', '<script src="./vendor/html2canvas.min.js"></script>'],
  ['<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>', '<script src="./vendor/jspdf.umd.min.js"></script>']
];
for (const [before, after] of rewrites) {
  if (!html.includes(before)) throw new Error('Unexpected dependency change in index.html: ' + before);
  html = html.replace(before, after);
}
html = html.replace(/<link href="https:\/\/fonts\.googleapis\.com\/[^"]+" rel="stylesheet">/, '');
html = html.replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/, '');
html = html.replace(style[0], '<link href="./app.css" rel="stylesheet">');
html = html.replace(jsx[0], '');
html = html.replace('</body>', '  <script src="./cloud-bootstrap.js" defer></script>\n</body>');
if (/<script[^>]+src="https?:\/\//i.test(html) || /<script\s*>/i.test(html) ||
    /type="text\/babel"/.test(html)) {
  throw new Error('Cloud build contains remote or inline runtime scripts');
}
await writeFile(join(output, 'index.html'), html, 'utf8');

const firstParty = [...html.matchAll(/<script src="\.\/([^"]+\.js)"><\/script>/g)]
  .map(match => match[1])
  .filter(name => !name.startsWith('vendor/'));
for (const name of new Set(firstParty)) {
  await copyFile(join(root, name), join(output, name));
}
for (const [source, target] of [
  ['cloud-bootstrap.js','cloud-bootstrap.js'],
  ['cloud-login.js','cloud-login.js'],
  ['login.html','login.html']
]) {
  await copyFile(join(here, source), join(output, target));
}
for (const name of ['registry-sync.html','registry-sync-admin.js','packmaster-registry-sync.js']) {
  await copyFile(join(root, name), join(output, name));
}
const policy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://packmaster-registry.hakubaby2022.workers.dev",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ');
await writeFile(join(output, '_headers'),
  '/*\n  Content-Security-Policy: ' + policy +
  '\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n');
console.log('Cloud bundle created with first-party scripts and pinned libraries.');
console.log('Cloud HTML:', join(output, 'index.html'));
console.log('Cloud app JS:', transformed.length, 'bytes');
console.log('Cloud CSS:', generatedCss.length, 'bytes before custom CSS');
