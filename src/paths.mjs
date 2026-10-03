import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export function dependencyRoot(name) {
  try {return dirname(require.resolve(`${name}/package.json`));} catch {}
  let directory = dirname(require.resolve(name));
  while (true) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate installed dependency: ${name}`);
    directory = parent;
  }
}

// Build helpers receive only ordinary process settings, never ambient credentials.
export function buildEnvironment() {
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'];
  return Object.fromEntries(allowed.filter(key => process.env[key]).map(key => [key, process.env[key]]));
}
