import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, BASE, exclusionReason, pages, render, attributes } from './generate-sitemap.mjs';
const doc = head => '<!doctype html><html><head><title>Test</title>'+head+'</head><body></body></html>';
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
const shopCards = () => [...read('shop.html').matchAll(/<article class="product-card"([^>]+)>([\s\S]*?)<\/article>/g)];
const categoryPages = {
 'windenstaende-winden.html':'winden', 'stuetzraeder-bootsanhaenger.html':'stuetzraeder',
 'kielrollen-stuetzrollen.html':'rollen', 'auflagen-polsterkissen.html':'auflagen',
 'raeder-reifen-bootsanhaenger.html':'raeder', 'beleuchtung-bootsanhaenger.html':'beleuchtung',
 'weiteres-bootsanhaenger-zubehoer.html':'sonstiges'
};

test('Seven category guides have unique metadata, self canonicals and one H1',()=>{
 const titles=new Set(), descriptions=new Set();
 for(const file of Object.keys(categoryPages)) {
  const s=read(file), title=s.match(/<title>([^<]+)<\/title>/)?.[1];
  const description=s.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(title&&description); titles.add(title); descriptions.add(description);
  assert.equal((s.match(/<h1\b/g)||[]).length,1);
  assert.ok(s.includes(`<link rel="canonical" href="${BASE}/${file}">`));
  assert.ok(s.includes(`<meta property="og:url" content="${BASE}/${file}">`));
  assert.match(s,/<meta name="twitter:title"/);
  assert.equal(exclusionReason(file,s),null);
 }
 assert.equal(titles.size,7); assert.equal(descriptions.size,7);
});

test('Category schema describes guides and breadcrumbs, never invented Product/Offer data',()=>{
 for(const file of Object.keys(categoryPages)) {
  const s=read(file), schema=JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema['@graph'][0]['@type'],'CollectionPage');
  const crumb=schema['@graph'].find(x=>x['@type']==='BreadcrumbList');
  assert.deepEqual(crumb.itemListElement.map(x=>x.position),[1,2,3]);
  assert.equal(crumb.itemListElement[2].item,BASE+'/'+file);
  assert.doesNotMatch(JSON.stringify(schema),/"(?:Product|Offer|AggregateRating)"/);
  assert.doesNotMatch(s,/<article class="product-card"|<form\b|const PRODUKTE|\d+,\d{2}\s*€/);
 }
});

test('Shop and guide navigation contains real links to all seven categories',()=>{
 const shop=read('shop.html');
 for(const [file,key] of Object.entries(categoryPages)) {
  assert.ok(shop.includes(`<a href="${file}">`));
  const s=read(file);
  assert.ok(s.includes(`href="shop.html?kategorie=${key}#shopContent"`));
  assert.ok(shop.includes(`data-cat="${key}"`));
  for(const other of Object.keys(categoryPages).filter(x=>x!==file)) assert.ok(s.includes(`href="${other}"`));
 }
});

test('All category links and images resolve locally; guide controls have no dangling handlers',()=>{
 for(const file of Object.keys(categoryPages)) {
  const s=read(file);
  for(const [,href] of s.matchAll(/href="([^"]+)"/g)) {
   const u=new URL(href,BASE+'/'+file); if(u.origin!==BASE) continue;
   assert.ok(fs.existsSync(path.join(ROOT,u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1)))),file+': '+href);
  }
  for(const tag of s.matchAll(/<img\b[^>]*>/g)) {
   const {src,alt}=attributes(tag[0]); assert.ok(alt); if(!/^https?:/.test(src)) assert.ok(fs.existsSync(path.join(ROOT,src)));
  }
  const handlers=[...s.matchAll(/onclick="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(handlers,['toggleMenu()']);
  assert.match(s,/function toggleMenu\(\)/);
 }
});

test('Category query selects only a known filter and otherwise shows the full catalog',()=>{
 const s=read('shop.html');
 const code=s.match(/  const requestedCategory = [\s\S]*?else renderProducts\('alle'\);/)[0];
 for(const query of ['', '?kategorie=wrong','?kategorie=%3Cscript%3E', ...Object.values(categoryPages).map(k=>'?kategorie='+k)]) {
  let selected=null;
  vm.runInNewContext(code,{URLSearchParams,window:{location:{search:query}},document:{querySelectorAll:()=>Object.values(categoryPages).map(cat=>({dataset:{cat}}))},filterCat:el=>selected=el.dataset.cat,renderProducts:cat=>selected=cat});
  const value=new URLSearchParams(query).get('kategorie');
  assert.equal(selected,Object.values(categoryPages).includes(value)?value:'alle');
 }
});

function cartRuntime(storage, savedCart=[]) {
 const s=read('shop.html');
 const code=s.match(/  const CART_SESSION_KEY = [\s\S]*?  let cart = restoreCart\(\);/)[0];
 const product={id:54,preis:20.25,name:'Original',artnr:85027};
 return vm.runInNewContext(code+';({getCart:()=>cart,save:(items)=>{cart=items;saveCart();}})',{sessionStorage:storage,PRODUKTE:[product]});
}
test('Cart restore validates IDs and quantities, ignores duplicates and trusts only current catalog prices',()=>{
 const raw=[{id:54,qty:2,preis:0.01,name:'Injected'}, {id:54,qty:3}, {id:999,qty:1},null,{id:'54',qty:1},{id:54,qty:-1}];
 const r=cartRuntime({getItem:()=>JSON.stringify(raw)}).getCart();
 assert.equal(r.length,1); assert.equal(r[0].qty,2); assert.equal(r[0].preis,20.25); assert.equal(r[0].name,'Original');
 for(const value of ['bad','null','{}',JSON.stringify([{id:54,qty:1.5}]),JSON.stringify([{id:54,qty:-2}])]) assert.equal(cartRuntime({getItem:()=>value}).getCart().length,0);
 assert.equal(cartRuntime({getItem:()=>{throw new Error('Blocked');}}).getCart().length,0);
});

test('Session cart stores only IDs/quantities, removes empty cart and tolerates blocked storage',()=>{
 let saved=null,removed=false;
 const r=cartRuntime({getItem:()=>null,setItem:(k,v)=>{assert.equal(k,'heku-shop-cart-v1');saved=v;},removeItem:()=>removed=true});
 r.save([{id:54,qty:2,name:'Original',preis:20.25}]);
 assert.deepEqual(JSON.parse(saved),[{id:54,qty:2}]);
 r.save([]); assert.ok(removed);
 assert.doesNotThrow(()=>cartRuntime({getItem:()=>null,setItem:()=>{throw new Error('Blocked');},removeItem:()=>{throw new Error('Blocked');}}).save([{id:54,qty:1}]));
 assert.match(read('shop.html'),/function updateCartUI\(\) \{\s*saveCart\(\);/);
});

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
