import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, BASE, exclusionReason, pages, render, attributes } from './generate-sitemap.mjs';
const doc = head => '<!doctype html><html><head><title>Test</title>'+head+'</head><body></body></html>';
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
const shopCards = () => [...read('shop.html').matchAll(/<article class="product-card"([^>]+)>([\s\S]*?)<\/article>/g)];

test('Shop catalog is visible HTML, not a second JavaScript product array',()=>{
 const cards=shopCards(); assert.ok(cards.length>0);
 const ids=cards.map(([,a])=>attributes(a)['data-id']);
 assert.equal(new Set(ids).size,ids.length);
 assert.doesNotMatch(read('shop.html'),/const PRODUKTE = \[/);
 for(const [,a,b] of cards) {
  const attrs=attributes(a); assert.ok(Number(attrs['data-id'])>0); assert.ok(Number(attrs['data-artnr'])>0);
  assert.match(b,/<h2 class="product-name">[^<]+<\/h2>/);
  assert.match(b,/<p class="product-desc">[^<]*<\/p>/);
  assert.ok(['winden','stuetzraeder','rollen','auflagen','raeder','sonstiges','beleuchtung'].includes(attrs['data-cat']));
 }
});
test('Shop displayed price matches machine-readable price on every card',()=>{
 for(const [,,body] of shopCards()) {
  const price=body.match(/<data class="product-price" value="([^"]+)">([^<]+)<\/data>/);
  assert.ok(price); const value=Number(price[1]); assert.ok(Number.isFinite(value)&&value>0);
  assert.equal(price[2].replace(/\s/g,''),value.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+'€');
 }
});
test('Shop images exist, are lazy-loaded and product buttons match their IDs',()=>{
 for(const [,a,body] of shopCards()) {
  const id=attributes(a)['data-id'];
  const img=attributes(body.match(/<img\b[^>]*>/)[0]);
  assert.equal(img.src,`produkt-${id}.jpg`); assert.equal(img.loading,'lazy'); assert.ok(img.alt);
  assert.ok(fs.existsSync(path.join(ROOT,img.src)));
  assert.match(body,new RegExp('id="btn-'+id+'" onclick="addToCart\\('+id+'\\)"'));
 }
});
test('Shop checkout controls have labels and mobile input hints',()=>{
 const s=read('shop.html');
 for(const id of ['anrede','vorname','nachname','email','telefon','strasse','plz','ort','notiz']) assert.ok(s.includes(`for="co-${id}"`));
 assert.match(s,/id="co-plz" autocomplete="postal-code" inputmode="numeric"/);
 assert.match(s,/id="shopSearch" type="search"/);
 assert.match(s,/id="shopCategory"/);
 assert.match(s,/<noscript>[\s\S]*?HEKU kontaktieren/);
});
test('Shop shipping boundary checks preserve established rules',()=>{
 const s=read('shop.html');
 const src=s.match(/  function calcVersand\(cartItems\) \{[\s\S]*?\n  \}/)[0];
 const calc=vm.runInNewContext(src+';calcVersand');
 assert.equal(calc([]),0);
 const lamp={cat:'beleuchtung',artnr:85027,name:'Seitenmarkierungsleuchte LED gelb'};
 assert.equal(calc([{...lamp,qty:1}]),10); assert.equal(calc([{...lamp,qty:4}]),10); assert.equal(calc([{...lamp,qty:5}]),20);
 const cushion={cat:'auflagen',artnr:83011,name:'Polsterkissen'};
 assert.equal(calc([{...cushion,qty:4}]),10); assert.equal(calc([{...cushion,qty:5}]),20);
});
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

test('Reserverad article numbers are distinct and match Robin’s correction',()=>{
 const cards=shopCards();
 const articles=cards.map(([,a])=>attributes(a)['data-artnr']);
 assert.equal(new Set(articles).size,articles.length);
 for(const [id,artnr] of [['38','50241'],['55','50242']]) {
  const [,a,b]=cards.find(([,a])=>attributes(a)['data-id']===id);
  assert.equal(attributes(a)['data-artnr'],artnr);
  assert.ok(b.includes('Art. '+artnr+'</span>'));
  assert.ok(b.includes('Art. '+artnr+' in den Warenkorb'));
 }
});
