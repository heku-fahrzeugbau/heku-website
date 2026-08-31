// Root-level static pages only. No npm dependencies. Run from any directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = 'https://heku-fahrzeugbau.de';
export function attributes(tag) {
  const result = {};
  for (const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return result;
}
export function exclusionReason(file, html) {
  if (/^(?:404|heku-conversion-block)\.html$/i.test(file) || /^google.*\.html$/i.test(file)) return 'technical file';
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  if (!/<html(?:\s[^>]*)?>/i.test(clean) || !/<\/html\s*>/i.test(clean)) return 'not an HTML document';
  const head = clean.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i)?.[1];
  if (!head || !/<title(?:\s[^>]*)?>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(head)) return 'missing title/head';
  for (const m of head.matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const a = attributes(m[0]);
    if (/^(robots|googlebot)$/i.test(a.name ?? '') && /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(a.content ?? '')) return 'noindex';
  }
  return null;
}
export function pages(root = ROOT) {
  return fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile() && /\.html$/i.test(e.name))
    .map(e=>e.name).sort().filter(file=>!exclusionReason(file,fs.readFileSync(path.join(root,file),'utf8')));
}
export function render(files, lastmod = () => '') {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + files.map(file=>{
    const loc = BASE + '/' + (file === 'index.html' ? '' : encodeURIComponent(file));
    const date = lastmod(file);
    return '  <url>\n    <loc>'+loc+'</loc>\n' + (/^\d{4}-\d{2}-\d{2}$/.test(date) ? '    <lastmod>'+date+'</lastmod>\n' : '') + '  </url>\n';
  }).join('') + '</urlset>\n';
}
export function generate(root = ROOT) {
  let repoRoot = '';
  try { repoRoot = execFileSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch {}
  const isOwnRepo = repoRoot && fs.realpathSync(repoRoot) === fs.realpathSync(root);
  const existing = fs.existsSync(path.join(root,'sitemap.xml')) ? fs.readFileSync(path.join(root,'sitemap.xml'),'utf8') : '';
  const oldDates = new Map();
  for (const m of existing.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>\s*<\/url>/g)) oldDates.set(m[1],m[2]);
  const xml = render(pages(root), file=>{
    if (isOwnRepo) {
      try { const date = execFileSync('git',['log','-1','--format=%cs','--',file],{cwd:root,encoding:'utf8'}).trim(); if(date) return date; } catch {}
    }
    // ZIP exports have no Git history. Preserve known dates instead of inventing today's date.
    return oldDates.get(BASE+'/'+(file==='index.html'?'':encodeURIComponent(file))) ?? '';
  });
  fs.writeFileSync(path.join(root,'sitemap.xml'),xml);
  return xml;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const xml = generate();
  console.log(`Sitemap: ${(xml.match(/<url>/g)||[]).length} URLs`);
}
