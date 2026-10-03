import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, realpath, readdir, access, rename, lstat } from 'node:fs/promises';
import { resolve, dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { normalizeProject, unique, sourcePath } from './model.mjs';
import { packageRoot, dependencyRoot, buildEnvironment } from './paths.mjs';
import { renderStates, validateSvg } from './states.mjs';
import { technicalCsp } from './server.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const marker = '.project-map-output.json';
async function exists(path) {try {await access(path);return true;} catch {return false;}}

export async function assertModelDirectory(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) throw new Error('Model directory cannot contain symlinks');
    if (entry.isDirectory()) await assertModelDirectory(join(directory,entry.name));
  }
}

export function revisionFor(root) {
  try {
    const options = {cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']};
    const top=execFileSync('git',['rev-parse','--show-toplevel'],options).trim();
    if (resolve(top)!==resolve(root)) return 'Git revision not recorded';
    const revision=execFileSync('git',['rev-parse','--short','HEAD'],options).trim();
    const dirty=execFileSync('git',['status','--porcelain'],options).trim();
    return revision + (dirty ? ' + uncommitted changes' : '');
  } catch {return 'Git revision not recorded';}
}

function likec4(args, cwd) {
  try {
    execFileSync(process.execPath,[join(packageRoot,'src/run-likec4.mjs'),...args],{cwd,env:buildEnvironment(),stdio:'pipe',maxBuffer:32*1024*1024});
  } catch (error) {
    throw new Error(`LikeC4 failed: ${String(error.stderr || error.stdout || error.message).slice(-5000)}`);
  }
}

async function checkedOutput(root, out, inputs) {
  const path = resolve(root,out);
  if (path===root || !path.startsWith(root+sep)) throw new Error('Output must be a subdirectory inside the workspace');
  if (inputs.some(input=>input===path || input.startsWith(path+sep))) throw new Error('Output cannot contain input models or configuration');
  // Do not write through a symlink, including one in a not-yet-created path's ancestors.
  let ancestor=path;
  while (!(await exists(ancestor))) ancestor=dirname(ancestor);
  if (resolve(await realpath(ancestor))!==ancestor) throw new Error('Output symlinks are not allowed');
  if (await exists(path)) {
    const stat=await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output must be a real directory');
    if ((await readdir(path)).length) {
      try {
        const owner=JSON.parse(await readFile(join(path,marker),'utf8'));
        if (owner.tool!=='project-map-kit' || owner.schemaVersion!==1) throw new Error();
      } catch {throw new Error('Refusing to overwrite a non-empty directory not owned by Project Map');}
    }
  }
  return path;
}

export async function buildProjectMap({root,config='project-map.json',out='dist/project-map',validateOnly=false}) {
  root=await realpath(resolve(root));
  const manifestPath=sourcePath(root,config);
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if (!Array.isArray(manifest.projects)||!manifest.projects.length) throw new Error('Manifest requires at least one project');
  const inputs=[manifestPath];
  const entries=[];
  for (const path of manifest.projects) {
    const configPath=sourcePath(dirname(manifestPath),path);
    const projectRoot=dirname(configPath);
    const project=JSON.parse(await readFile(configPath,'utf8'));
    const modelDir=sourcePath(projectRoot,project.modelPath);
    await assertModelDirectory(modelDir);
    const statusPath=sourcePath(projectRoot,project.statusPath);
    inputs.push(configPath,modelDir,statusPath);
    for (const state of project.states || []) inputs.push(sourcePath(projectRoot,state.sourcePath || state.assetPath));
    entries.push({config:project,root:projectRoot,modelDir,statusPath});
  }
  unique(entries.map(entry=>entry.config),'projects');
  const destination=validateOnly ? null : await checkedOutput(root,out,inputs);
  const scratch=await mkdtemp(join(tmpdir(),'project-map-build-'));
  const site=join(scratch,'site');
  try {
    await mkdir(join(site,'states'),{recursive:true});
    await mkdir(join(site,'assets/icons'),{recursive:true});
    const builtAt=new Date().toISOString();
    const revision=revisionFor(root);
    const projects=[];
    const stateJobs=[];
    for (const entry of entries) {
      const exported=join(scratch,`${entry.config.id}.json`);
      // Validate identifiers before using them as filenames.
      if (!/^[a-z][a-z0-9-]*$/.test(entry.config.id)) throw new Error('Invalid project ID');
      const projectArgs=entry.config.likec4Project ? ['--project',entry.config.likec4Project] : [];
      likec4(['export','json',entry.modelDir,'-o',exported,'--pretty',...projectArgs],entry.root);
      const modelText=await readFile(exported,'utf8');
      const status=JSON.parse(await readFile(entry.statusPath,'utf8'));
      const project=normalizeProject(entry.config,JSON.parse(modelText),status,{root:entry.root,builtAt,revision,modelHash:sha(modelText)});
      projects.push(project);
      for (const module of project.modules) {
        for (const source of module.sources) inputs.push(sourcePath(entry.root,source.path));
        for (const evidence of module.status?.evidence || []) inputs.push(sourcePath(entry.root,evidence.path));
      }
      if (project.recentWork?.source) inputs.push(sourcePath(entry.root,project.recentWork.source.path));
      for (const state of entry.config.states || []) {
        const output=join(site,'states',`${project.id}-${state.id}.svg`);
        if (state.sourcePath) stateJobs.push({source:sourcePath(entry.root,state.sourcePath),output});
        else await writeFile(output,validateSvg(await readFile(sourcePath(entry.root,state.assetPath),'utf8')));
      }
      if (!validateOnly) {
        const technical=join(site,'technical',project.id);
        likec4(['build',entry.modelDir,'-o',technical,'--base','./','--use-hash-history','--title',project.name],entry.root);
        const htmlPath=join(technical,'index.html');
        const html=await readFile(htmlPath,'utf8');
        await writeFile(htmlPath,html.replace('<head>',`<head>\n<meta http-equiv="Content-Security-Policy" content="${technicalCsp}">`));
      }
    }
    await renderStates(stateJobs);
    if (validateOnly) return {projects:projects.length};
    const serialized=JSON.stringify({schemaVersion:1,projects}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    await writeFile(join(site,'data.js'),`window.PROJECT_MAP_DATA = ${serialized};\n`);
    const hashes={};
    const pageCopy = projects[0].locale === 'en'
      ? {PAGE_LANG:'en',PAGE_TITLE:'Project Map',SKIP_LINK:'Skip to main content',BOOT_TEXT:'Preparing project snapshot…',NOSCRIPT_TEXT:'Enable JavaScript to view this read-only project map.'}
      : {PAGE_LANG:'zh-CN',PAGE_TITLE:'项目地图',SKIP_LINK:'跳到主要内容',BOOT_TEXT:'正在整理项目快照…',NOSCRIPT_TEXT:'启用脚本后即可查看这份只读项目地图。'};
    for (const file of ['index.html','i18n.js','app.js','style.css']) {
      let contents=await readFile(join(packageRoot,'src/ui',file));
      if (file === 'index.html') contents=Buffer.from(contents.toString().replace(/__(PAGE_LANG|PAGE_TITLE|SKIP_LINK|BOOT_TEXT|NOSCRIPT_TEXT)__/g,(_,key)=>pageCopy[key]));
      await writeFile(join(site,file),contents);
      hashes[file]=sha(contents);
    }
    const icons=new Set(['squares-four','graph','kanban','magnifying-glass','arrow-right','arrow-up-right','x','caret-down','book-open','graduation-cap','plant','user-circle','cube','stack','check-circle','warning-circle','circle-dashed','clock','code','info','funnel','map-trifold','clipboard','files',...projects.flatMap(p=>p.domains.map(d=>d.icon))]);
    const iconsRoot=dependencyRoot('@phosphor-icons/core');
    for (const icon of icons) await copyFile(join(iconsRoot,'assets/regular',`${icon}.svg`),join(site,'assets/icons',`${icon}.svg`));
    await copyFile(join(iconsRoot,'LICENSE'),join(site,'assets/PHOSPHOR-LICENSE'));
    for (const file of ['LICENSE','THIRD_PARTY_NOTICES.md']) await copyFile(join(packageRoot,file),join(site,file));
    await writeFile(join(site,marker),JSON.stringify({tool:'project-map-kit',schemaVersion:1})+'\n');
    await writeFile(join(site,'build.json'),JSON.stringify({builtAt,revision,coreHashes:hashes,projects:projects.map(p=>({id:p.id,modelHash:p.snapshot.modelHash}))},null,2)+'\n');
    await mkdir(dirname(destination),{recursive:true});
    // Stage on the destination filesystem so the final swap does not cross devices.
    const {cp}=await import('node:fs/promises');
    const staging=await mkdtemp(join(dirname(destination),'.project-map-build-'));
    try {
      await cp(site,staging,{recursive:true});
      // Recheck ownership immediately before replacing only this tool's generated output.
      await checkedOutput(root,out,inputs);
      if (await exists(destination)) await rm(destination,{recursive:true});
      await rename(staging,destination);
    } finally {await rm(staging,{recursive:true,force:true});}
    return {projects:projects.length,output:destination};
  } finally {await rm(scratch,{recursive:true,force:true});}
}
