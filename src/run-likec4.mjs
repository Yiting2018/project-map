import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { dependencyRoot, buildEnvironment } from './paths.mjs';
const safeEnvironment = buildEnvironment();
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, safeEnvironment);
await import(pathToFileURL(join(dependencyRoot('likec4'), 'bin/likec4.mjs')).href);
