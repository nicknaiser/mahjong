// Bundles everything into self-contained single files:
//   dist/index.html    — the full website (solo + online)
//   dist/artifact.html — the claude.ai preview page (solo only; no WebRTC there)
import { build } from 'esbuild';
import fs from 'fs';
const css = fs.readFileSync('src/styles.css', 'utf8');
const bundle = async define => {
  const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: ['es2020'], legalComments: 'none', define });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
};
fs.mkdirSync('dist', { recursive: true });
const site = fs.readFileSync('src/index.html', 'utf8').replace('/*CSS*/', () => css).replace('/*JS*/', () => '');
const js = await bundle({});
fs.writeFileSync('dist/index.html', site.replace('<script></script>', () => `<script>${js}</script>`));
const ajs = await bundle({ __ARTIFACT__: 'true' });
fs.writeFileSync('dist/artifact.html', `<title>Mahjong Night</title>\n<style>${css}</style>\n<div id="app" class="app"></div>\n<script>${ajs}</script>\n`);
fs.mkdirSync('docs', { recursive: true });
fs.copyFileSync('dist/index.html', 'docs/index.html');
fs.writeFileSync('docs/.nojekyll', '');
for (const f of ['index.html', 'artifact.html']) console.log('dist/' + f, (fs.statSync('dist/' + f).size / 1024).toFixed(0) + ' KB');
