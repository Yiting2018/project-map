import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'; frame-src 'self'";
export const technicalCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'";
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
export function createDashboardServer(directory) {
  const root = resolve(directory);
  return createServer(async (req,res) => {
    res.setHeader('Content-Security-Policy',csp);
    res.setHeader('X-Content-Type-Options','nosniff');
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405, {Allow:'GET, HEAD'}).end();return;}
    try {
      const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (path.includes('\\') || path.includes('\0')) {res.writeHead(403).end();return;}
      const file = resolve(root,`.${path.endsWith('/') ? path+'index.html' : path}`);
      if (!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
      if (!(await realpath(file)).startsWith((await realpath(root))+sep)) {res.writeHead(403).end();return;}
      const body = await readFile(file);
      const policy = path.split('/').slice(1, -1).includes('technical') ? technicalCsp : extname(file)==='.svg' ? "sandbox; default-src 'none'; connect-src 'none'; style-src 'unsafe-inline'" : csp;
      res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':body.byteLength,'Content-Security-Policy':policy,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:body);
    } catch {res.writeHead(404).end('Not found');}
  });
}
