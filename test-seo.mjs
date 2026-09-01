import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, BASE, exclusionReason, pages, render, attributes } from './generate-sitemap.mjs';
const doc = head => '<!doctype html><html><head><title>Test</title>'+head+'</head><body></body></html>';
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
test('Technical files, snippets and missing titles excluded',()=>{
 for(const file of ['404.html','heku-conversion-block.html','google123.html']) assert.ok(exclusionReason(file,doc('')));
 assert.ok(exclusionReason('fragment.html','<div>Fragment</div>'));
 assert.ok(exclusionReason('empty.html','<html><head></head><body></body></html>'));
 assert.ok(exclusionReason('comment.html','<!-- '+doc('')+' -->'));
 assert.equal(exclusionReason('normal.html',doc('')),null);
});
test('Robots attributes, case, quoting, googlebot and none supported',()=>{
 for(const meta of ['<meta name="robots" content="noindex,follow">',"<META CONTENT='NOINDEX, FOLLOW' NAME='ROBOTS'>",'<meta content=noindex name=robots>','<meta name="googlebot" content="none">','<meta content="max-snippet:10, noindex" name="robots">']) assert.equal(exclusionReason('page.html',doc(meta)),'noindex');
 assert.equal(exclusionReason('page.html',doc('<!-- <meta name="robots" content="noindex"> -->')),null);
 assert.equal(exclusionReason('page.html',doc('<script>const x=\'<meta name="robots" content="noindex">\';</script>')),null);
});
test('Root canonical, URL escaping and no invented lastmod',()=>{
 const xml=render(['index.html','test&name.html']);
 assert.ok(xml.includes('<loc>'+BASE+'/</loc>'));
 assert.ok(xml.includes('test%26name.html'));
 assert.ok(!xml.includes('lastmod'));
 assert.ok(render(['index.html'],()=> '2026-08-31').includes('<lastmod>2026-08-31</lastmod>'));
 assert.ok(!render(['index.html'],()=> 'not a date').includes('lastmod'));
});
test('Sitemap exactly matches eligible pages, without duplicates',()=>{
 const urls=[...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 assert.deepEqual(urls,pages().map(f=>BASE+'/'+(f==='index.html'?'':encodeURIComponent(f))));
 assert.equal(new Set(urls).size,urls.length);
});
test('Google verification preserved; conversion stub has no executable code',()=>{
 for(const file of ['google01302b5f976ee5dc.html','google16d7d28f72100acd.html']) assert.equal(read(file).trim(),'google-site-verification: '+file);
 const stub=read('heku-conversion-block.html');
 assert.match(stub,/<meta name="robots" content="noindex,follow">/);
 assert.doesNotMatch(stub,/<script\b|<form\b|<iframe\b/i);
});
test('No internal homepage href still uses index.html',()=>{
 for(const file of fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'))) {
  for(const tag of read(file).matchAll(/<a\b[^>]*>/gi)) {
   const href=attributes(tag[0]).href; if(!href) continue;
   const url=new URL(href,BASE+'/'+file);
   if([new URL(BASE).host,'www.heku-fahrzeugbau.de'].includes(url.host)) assert.notEqual(url.pathname,'/index.html',file);
  }
 }
});
test('Konfigurator: one persistent H1, original step heading as H2',()=>{
 const s=read('konfigurator.html');
 assert.equal((s.match(/<h1\b/g)||[]).length,1);
 assert.match(s,/<h1[^>]*>Bootsanhänger Konfigurator<\/h1>/);
 assert.ok(s.indexOf('<h1')<s.indexOf('id="step1"'));
 assert.match(s,/<h2 class="step-title">Angaben zu Ihrem Boot<\/h2>/);
 for(const id of ['step1','step2','step3','step4','laenge','breite','gewicht']) assert.equal((s.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
});
test('Wohnmobile: primary CTA before contact, existing help preserved',()=>{
 const s=read('wohnmobile.html');
 assert.match(s,/<a class="assortment-cta" href="\/bootstrailer.html">Aktuelle Bootsanhänger entdecken<\/a>/);
 assert.ok(s.indexOf('<a class="assortment-cta"')<s.indexOf('>So erreichen Sie uns<'));
 assert.match(s,/Wenn Sie Fragen zu einem früheren HEKU Wohnmobil/);
 assert.match(s,/tel:\+4952120066/);
});
test('Known incorrect phone href removed from all pages',()=>{
 for(const file of fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'))) assert.doesNotMatch(read(file),/href=["']tel:\+49521200066["']/i,file);
});
test('Konfigurator CSS regression guards',()=>{
 const s=read('konfigurator.html');
 assert.match(s,/\.sidebar \{ position: relative; top: auto;/);
 assert.doesNotMatch(s,/\.main 100%|z-index:1;\}padding:|fill:var\(--rot\);\} 100%/);
});
test('Inline JavaScript compiles and JSON-LD parses on all pages',()=>{
 for(const file of fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'))) {
  let i=0;
  for(const m of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
   i++; const a=attributes(m[1]);
   if(a.type==='application/ld+json') JSON.parse(m[2]);
   else if(!a.src && (!a.type || /^(text|application)\/javascript$/.test(a.type))) new vm.Script(m[2],{filename:file+':script'+i});
  }
 }
});
