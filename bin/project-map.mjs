#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { mkdir, readdir, cp, access } from 'node:fs/promises';
import { packageRoot } from '../src/paths.mjs';
import { buildProjectMap } from '../src/build.mjs';
import { createDashboardServer } from '../src/server.mjs';

try {
  const {values,positionals} = parseArgs({allowPositionals:true, options:{
    root:{type:'string'},config:{type:'string'},out:{type:'string'},dir:{type:'string'},port:{type:'string'},help:{type:'boolean',short:'h'}
  }});
  const [command] = positionals;
  if (values.help || !command) {
    console.log(`Project Map 0.1.0
  project-map init --dir <empty-directory>
  project-map validate --root <workspace> [--config project-map.json]
  project-map build --root <workspace> [--config project-map.json] [--out dist/project-map]
  project-map serve --dir <built-directory> [--port 5191]
All project configuration paths are relative to their project.json directory.
Only explicitly listed models and status files are read. No repository scan or LLM runs at runtime.`);
  } else if (command==='init') {
    if (!values.dir) throw new Error('init requires --dir pointing to a new or empty directory');
    const target = resolve(values.dir);
    await mkdir(target,{recursive:true});
    if ((await readdir(target)).length) throw new Error('Refusing to initialize a non-empty directory');
    await cp(join(packageRoot,'examples/field-notes'),target,{recursive:true,filter:source=>!source.split(/[\\/]/).includes('dist')});
    console.log('Initialized a synthetic example. Replace its model and records with reviewed project facts.');
    console.log('Next: project-map validate --root <directory>, then project-map build --root <directory>');
  } else if (command==='build' || command==='validate') {
    if (positionals.length!==1) throw new Error('Unexpected positional arguments');
    const result = await buildProjectMap({root:resolve(values.root || '.'),config:values.config || 'project-map.json',out:values.out || 'dist/project-map',validateOnly:command==='validate'});
    console.log(`${command==='validate'?'Validated':'Built'} ${result.projects} project(s)${result.output ? ` → ${result.output}`:''}`);
  } else if (command==='serve') {
    if (!values.dir) throw new Error('serve requires --dir with a built static site');
    const directory = resolve(values.dir);
    await access(join(directory,'index.html'));
    const port=Number(values.port || 5191);
    if (!Number.isInteger(port)||port<1||port>65535) throw new Error('Port must be between 1 and 65535');
    const server=createDashboardServer(directory);
    server.on('error',error=>{console.error(error.message);process.exitCode=1;});
    server.listen(port,'127.0.0.1',()=>console.log(`Project Map: http://127.0.0.1:${port}/`));
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {console.error(`Project Map: ${error.message}`);process.exitCode=1;}
