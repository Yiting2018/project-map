import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { dependencyRoot, buildEnvironment } from './paths.mjs';

async function stateSource(path) {
  const source=await readFile(path,'utf8');
  if (!/^\s*stateDiagram(?:-v2)?\b/.test(source) || /%%\s*\{/.test(source)) throw new Error('State source must start with stateDiagram-v2 (no frontmatter or external initialization).');
  return source;
}

// Prebuilt assets use a conservative passive SVG subset. Rich state diagrams
// should use .mmd so they go through the isolated strict renderer below.
export function validateSvg(source) {
  if (!/<svg\b/.test(source) || /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<[\w-]+:|<(?:script|foreignObject|iframe|object|embed|style|a|image|feImage|animate\w*|set)\b|\bon\w+\s*=|\bstyle\s*=/i.test(source)) throw new Error('Prebuilt SVG must contain only passive SVG graphics; use a Mermaid source for rich diagrams');
  for (const match of source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']*)["']/gi)) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(match[1])) throw new Error('Prebuilt SVG cannot reference external resources');
  }
  if (/url\s*\(\s*(?!#[\w:.-]+\))|@import|\\/i.test(source)) throw new Error('Prebuilt SVG cannot load CSS resources');
  return source;
}

export async function renderStates(items) {
  if (!items.length) return;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      env: buildEnvironment(),
      ...(process.env.PROJECT_MAP_BROWSER_EXECUTABLE ? {executablePath: process.env.PROJECT_MAP_BROWSER_EXECUTABLE} : {})
    });
  } catch {
    throw new Error('Mermaid rendering needs Chromium. Run npm run browser:install in the toolkit, or set PROJECT_MAP_BROWSER_EXECUTABLE to an installed Chromium browser.');
  }
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="diagram"></div>');
    await page.addScriptTag({path: join(dependencyRoot('mermaid'), 'dist/mermaid.min.js')});
    for (const [index, item] of items.entries()) {
      const source = await stateSource(item.source);
      const svg = await page.evaluate(async ({source, index}) => {
        mermaid.initialize({startOnLoad:false, securityLevel:'strict', theme:'neutral', fontFamily:'system-ui', state:{useMaxWidth:false}});
        const result = await mermaid.render(`state${index}`, source);
        const host = document.querySelector('#diagram');
        host.innerHTML = result.svg;
        return new XMLSerializer().serializeToString(host.querySelector('svg'));
      }, {source, index});
      await writeFile(item.output, svg);
    }
  } finally { await browser.close(); }
}
