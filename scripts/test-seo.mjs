import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { ROOT, BASE, urlForFile, exclusionReason, pages, render, attributes } from './generate-sitemap.mjs';
import { applyBackOrderStarts, berlinAvailabilityStarts, committedAvailabilityStarts } from './availability-starts.mjs';
const doc = head => '<!doctype html><html><head><title>Test</title>'+head+'</head><body></body></html>';
const read = name => fs.readFileSync(path.join(ROOT,name),'utf8');
const shopCards = () => [...read('shop.html').matchAll(/<article class="product-card"([^>]+)>([\s\S]*?)<\/article>/g)];
const categoryPages = {
 'windenstaende-winden.html':'winden', 'stuetzraeder-bootsanhaenger.html':'stuetzraeder',
 'kielrollen-stuetzrollen.html':'rollen', 'auflagen-polsterkissen.html':'auflagen',
 'raeder-reifen-bootsanhaenger.html':'raeder', 'beleuchtung-bootsanhaenger.html':'beleuchtung',
 'weiteres-bootsanhaenger-zubehoer.html':'sonstiges'
};

test('Dealer finder uses local postcode data',()=>{
 const page=read('haendler.html');
 const postcodeData=JSON.parse(read('assets/de-postcode-centroids.json'));
 assert.equal((page.match(/class="dealer-pin"/g)||[]).length,9);
 assert.equal((page.match(/data-lat="/g)||[]).length,9);
 assert.equal((page.match(/data-lon="/g)||[]).length,9);
 assert.match(page,/id="dealerPostcode"/);
 assert.match(page,/assets\/de-postcode-centroids\.json/);
 assert.match(page,/slice\(0, 3\)/);
 assert.ok(Object.keys(postcodeData.postcodes).length>10000);
 assert.deepEqual(postcodeData.postcodes['33719'],[52.0107,8.5926]);
});

test('Each dealer contact card has an external website link with rel=noopener',()=>{
 const page=read('haendler.html');
 const expected={
  'dealer-gruendl-contact':'https://www.gruendl.de/',
  'dealer-sager-contact':'https://www.bootsbausager.de/',
  'dealer-fricke-dannhus-contact':'https://www.fricke-dannhus.de/',
  'dealer-edersee-contact':'https://www.yachtservice-edersee.com/',
  'dealer-aluforce-contact':'https://alu-force.de/',
  'dealer-fette-contact':'https://www.bootsservice-fette.de/',
  'dealer-bendix-contact':'https://bendix-pkw-anhaenger.de/',
  'dealer-kreusch-contact':'https://www.kreusch.de/',
  'dealer-sailart-contact':'https://www.sailart.de/',
 };
 const cards=[...page.matchAll(/<div class="dealer-contact-card" id="([^"]+)">([\s\S]*?)\n {6}<\/div>/g)];
 assert.deepEqual(cards.map(([,id])=>id),Object.keys(expected));
 for(const [,id,body] of cards){
  const websites=[...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter(([,attrs])=>/^https?:\/\//.test(attributes(attrs).href||''));
  assert.equal(websites.length,1,id);
  const attrs=attributes(websites[0][1]);
  assert.equal(attrs.href,expected[id],id);
  assert.equal(attrs.target,'_blank',id);
  assert.equal(attrs.rel,'noopener',id);
  assert.equal(websites[0][2].trim(),new URL(expected[id]).host,id);
 }
});

test('Local Bielefeld landing page is indexable, useful and internally linked',()=>{
 const file='bootsanhaenger-bielefeld.html', s=read(file);
 assert.match(s,/<title>Bootsanhänger Bielefeld &amp; OWL \| Direkt vom Hersteller \| HEKU<\/title>/);
 assert.ok(s.includes(`<link rel="canonical" href="${BASE}/${file}">`));
 assert.equal((s.match(/<h1\b/g)||[]).length,1);
 assert.ok((s.match(/<h2\b/g)||[]).length>=4);
 assert.match(s,/Bunzlauer Straße 6/);
 assert.match(s,/08:00–12:30 Uhr/);
 assert.match(s,/13:00–16:30 Uhr/);
 assert.match(s,/https:\/\/maps\.app\.goo\.gl\/PUWT9g3SxmCnEfsR7/);
 assert.equal(exclusionReason(file,s),null);
 assert.ok(pages().includes(file));
 const schemas=[...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 const local=schemas[0]['@graph'].find(x=>x['@type']==='LocalBusiness');
 assert.deepEqual(local.openingHoursSpecification.map(x=>[x.opens,x.closes]),[['08:00','12:30'],['13:00','16:30']]);
 assert.equal(schemas[1]['@type'],'FAQPage');
 assert.equal(schemas[1].mainEntity.length,4);
 for(const source of ['index.html','kontakt.html','bootstrailer.html']) assert.ok(read(source).includes(`href="${file}"`),source);
 for(const [,href] of s.matchAll(/href="([^"]+)"/g)) {
  if(/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;
  const localPath=decodeURIComponent(href.split(/[?#]/)[0]);
  assert.ok(fs.existsSync(path.join(ROOT,localPath)),`${file}: missing ${localPath}`);
 }
});

test('Replacement-parts hub is indexable, cautious and links every category',()=>{
 const file='ersatzteile-bootsanhaenger.html', s=read(file);
 assert.match(s,/<title>Ersatzteile für Bootsanhänger &amp; Bootstrailer \| HEKU<\/title>/);
 assert.ok(s.includes(`<link rel="canonical" href="${BASE}/${file}">`));
 assert.equal((s.match(/<h1\b/g)||[]).length,1);
 assert.ok((s.match(/<h2\b/g)||[]).length>=5);
 assert.match(s,/Eine allgemeine Passform für andere Hersteller kann nicht zugesagt werden/);
 const schema=JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.deepEqual(schema['@graph'].map(x=>x['@type']),['CollectionPage','ItemList','FAQPage','BreadcrumbList']);
 assert.equal(schema['@graph'][1].itemListElement.length,7);
 assert.equal(schema['@graph'][2].mainEntity.length,4);
 assert.doesNotMatch(JSON.stringify(schema),/"(?:Product|Offer|AggregateRating)"/);
 for(const category of Object.keys(categoryPages)) assert.ok(s.includes(`href="${category}"`),category);
 for(const source of ['shop.html','ratgeber-bootsanhaenger.html','produkte.html',...Object.keys(categoryPages)]) assert.ok(read(source).includes(`href="${file}"`),source);
 assert.equal(exclusionReason(file,s),null);
 assert.ok(pages().includes(file));
 for(const [,href] of s.matchAll(/href="([^"]+)"/g)) {
  if(/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;
  const localPath=decodeURIComponent(href.split(/[?#]/)[0]);
  assert.ok(fs.existsSync(path.join(ROOT,localPath)),`${file}: missing ${localPath}`);
 }
});

test('Published opening hours include the confirmed lunch break',()=>{
 for(const file of ['index.html','kontakt.html','bootstrailer.html','bootsanhaenger-nach-mass.html','jollenanhaenger.html','motorbootanhaenger.html','segelbootanhaenger.html','wasserdichte-radnabe.html']) {
  const s=read(file);
  assert.match(s,/"opens": "08:00",\s*"closes": "12:30"/);
  assert.match(s,/"opens": "13:00",\s*"closes": "16:30"/);
 }
 const contact=read('kontakt.html');
 assert.equal((contact.match(/08:00 – 12:30 Uhr · 13:00 – 16:30 Uhr/g)||[]).length,5);
});

test('Product overview and Bootstrailer money page have distinct search intents',()=>{
 const overview=read('produkte.html'), money=read('bootstrailer.html');
 assert.match(overview,/<title>Bootsanhänger kaufen vom Hersteller \| HEKU B-Serie<\/title>/);
 assert.doesNotMatch(overview.match(/<title>[\s\S]*?<\/title>/)[0],/Bootstrailer|1\.375/);
 assert.match(overview.match(/<meta name="description"[^>]+>/)[0],/Bootsanhänger kaufen vom Hersteller/);
 assert.match(overview.match(/<meta name="description"[^>]+>/)[0],/kleine Anhänger/);
 assert.match(overview,/<h1 class="page-title">Bootsanhänger kaufen<br>vom Hersteller<\/h1>/);
 assert.match(overview,/href="bootstrailer\.html"[^>]*>Bootsanhänger kaufen: Beratung &amp; Vorteile →<\/a>/);
 const introParas=[...overview.match(/<section class="intro">([\s\S]*?)<\/section>/)[1].matchAll(/<p(?: style="margin-top:18px")?>([\s\S]*?)<\/p>/g)].map(m=>m[1]).filter(x=>!x.includes('<a '));
 const words=introParas.join(' ').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean);
 assert.ok(words.length>=100 && words.length<=150, 'intro words '+words.length);
 assert.match(money,/<title>Bootstrailer kaufen vom Hersteller \| ab 1\.375 € \| HEKU<\/title>/);
 assert.match(money,/<h1 class="page-title">Bootstrailer kaufen<br>vom Hersteller<\/h1>/);
 assert.match(money,/Kleiner Bootstrailer und leichter Bootsanhänger/);
 assert.match(money,/Bootstrailer 350 kg/);
 assert.match(money,/href="jollenanhaenger\.html"/);
 assert.match(money,/href="motorbootanhaenger\.html"/);
 assert.match(money,/ca\. 2 Wochen/);
 assert.match(money,/href="produkte\.html" class="link-pill">&#8592; Technische Modellübersicht der B-Serie<\/a>/);
 for(const page of [overview,money]) assert.equal((page.match(/<h1\b/g)||[]).length,1);
 assert.notEqual(overview.match(/<title>([^<]+)/)[1], money.match(/<title>([^<]+)/)[1]);
});

test('Query-led pages state only catalog facts and link real accessory articles',()=>{
 const segel=read('segelbootanhaenger.html');
 assert.match(segel,/<title>Segelboot Anhänger kaufen \| Anhänger für Segelboot \| HEKU<\/title>/);
 assert.match(segel,/<h1 class="page-title">Segelboot Anhänger kaufen –<br>Anhänger für Segelboot<\/h1>/);
 assert.match(segel,/<h2 class="sec-title">Welcher Segelboot Anhänger passt zu Ihrem Boot\?<\/h2>/);
 assert.match(segel,/<h2 class="sec-title">Alle Anhänger für Segelboote im Überblick<\/h2>/);
 assert.equal((segel.match(/<h1\b/g)||[]).length,1);

 const custom=read('bootsanhaenger-nach-mass.html');
 assert.match(custom,/<title>Bootsanhänger nach Maß \| maßgeschneiderter Anhänger \| HEKU<\/title>/);
 assert.match(custom,/<h1 class="page-title">Bootsanhänger nach Maß –<br>maßgeschneiderter Anhänger<\/h1>/);
 assert.match(custom,/Umbau und Nachrüstung bestehender Trailer/);
 assert.match(custom,/Rollen statt Gummischiene/);
 assert.match(custom,/bessere Zentrierung/);
 assert.match(custom,/href="kontakt\.html"/);
 assert.match(custom,/href="kielrollen-stuetzrollen\.html"/);
 assert.equal((custom.match(/<h1\b/g)||[]).length,1);
 assert.doesNotMatch(custom.slice(custom.indexOf('Umbau und Nachrüstung'), custom.indexOf('TECHNISCHE BASIS')),/patentiert|seit 1959|65\+/i);

 const tempo=read('100kmh-regelung.html');
 assert.match(tempo,/<title>100-km\/h-Zulassung für Anhänger: Voraussetzungen \| HEKU<\/title>/);
 // Snippet (19.10.2026): Title <= 60, Description <= 155 Zeichen, HEKU-Fakten Tempo 100 korrekt.
 const tTitle=tempo.match(/<title>([^<]+)<\/title>/)[1], tDesc=tempo.match(/<meta name="description" content="([^"]+)">/)[1];
 assert.ok(tTitle.length<=60,tTitle); assert.ok(tDesc.length<=155,tDesc);
 assert.match(tDesc,/ungebremst Tempo 100 serienmäßig, gebremst optional \+140\/\+280 €/);
 assert.equal(tempo.match(/<meta property="og:title" content="([^"]+)">/)[1],tTitle);
 assert.equal(tempo.match(/<meta property="og:description" content="([^"]+)">/)[1],tDesc);
 assert.match(tempo,/id="kurzantwort"/);
 const box=tempo.slice(tempo.indexOf('id="kurzantwort"'), tempo.indexOf('class="lead-text"'));
 for(const fact of ['Tempo 80','Zeichen 330.1','Zeichen 331.1','Tempo-100-Plakette','Faktor 0,3','540 kg','Bußgeldkatalog']) assert.match(box, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.doesNotMatch(box,/\d+\s*€|Bußgeld von \d+/);
 const schemas=[...tempo.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 assert.equal(schemas.filter(x=>x['@type']==='FAQPage').length,1);
 const faq=schemas.find(x=>x['@type']==='FAQPage');
 const visible=[...tempo.matchAll(/<p style="font-weight:600;margin-bottom:6px;">([^<]+)<\/p><p class="section-text">([^<]+)<\/p>/g)];
 assert.deepEqual(faq.mainEntity.map(q=>q.name), visible.map(m=>m[1]));
 assert.deepEqual(faq.mainEntity.map(q=>q.acceptedAnswer.text), visible.map(m=>m[2]));

 const guides={
  'auflagen-polsterkissen.html':['Polsterbezug erneuern','artikel/50227.html'],
  'windenstaende-winden.html':['Welcher Windenstand passt','artikel/50201.html','artikel/50202.html','artikel/50203.html','artikel/50206.html'],
  'kielrollen-stuetzrollen.html':['Kielrollen mit Halter auswählen','artikel/50218.html'],
  'beleuchtung-bootsanhaenger.html':['artikel/85027.html'],
  'weiteres-bootsanhaenger-zubehoer.html':['artikel/50235.html']
 };
 for(const [file,needles] of Object.entries(guides)) {
  const html=read(file);
  for(const needle of needles) assert.ok(html.includes(needle), file+' '+needle);
  assert.doesNotMatch(html,/artikel\/50210\.html|artikel\/50238\.html|patentiert/i, file);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
 }
 const sitemap=read('sitemap.xml');
 for(const sku of ['50201','50202','50203','50206','50218','50227','50235','85027']) assert.match(sitemap, new RegExp('/artikel/'+sku+'\\.html'));
 assert.doesNotMatch(sitemap,/artikel\/50210\.html|artikel\/50238\.html/);
});

test('HU guide is indexable, sourced and corrects legacy trailer guidance',()=>{
 const file='tuev-bootsanhaenger.html', s=read(file);
 assert.match(s,/<title>TÜV für Bootsanhänger: HU-Fristen &amp; Kosten \| HEKU<\/title>/);
 assert.match(s,new RegExp(`<link rel="canonical" href="${BASE}/${file}">`));
 assert.equal((s.match(/<h1\b/g)||[]).length,1);
 assert.ok((s.match(/<h2\b/g)||[]).length>=7);
 assert.match(s,/bis 750 kg zGM oder ohne eigene Bremsanlage[\s\S]*?nach 36 Monaten[\s\S]*?alle 24 Monate/i);
 assert.match(s,/über 750 kg bis 3,5 t zGM[\s\S]*?nach 24 Monaten[\s\S]*?alle 24 Monate/i);
 for(const url of [
  'https://www.gesetze-im-internet.de/stvzo_2012/__29.html',
  'https://www.gesetze-im-internet.de/stvzo_2012/anlage_viii.html',
  'https://www.gesetze-im-internet.de/stvzo_2012/anlage_viiia.html',
  'https://www.gesetze-im-internet.de/bkatv_2013/anlage.html'
 ]) assert.ok(s.includes(`href="${url}"`),url);
 const schemas=[...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 assert.deepEqual(schemas.map(x=>x['@type']),['Article','FAQPage','BreadcrumbList']);
 assert.equal(schemas[1].mainEntity.length,5);
 assert.ok(pages().includes(file));
 for(const [,href] of s.matchAll(/href="([^"]+)"/g)) {
  if(/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;
  const local=decodeURIComponent(href.split(/[?#]/)[0]);
  assert.ok(fs.existsSync(path.join(ROOT,local)),`${file}: missing ${local}`);
 }
 for(const source of ['ratgeber-bootsanhaenger.html','zulassung.html','faq.html']) assert.ok(read(source).includes('href="tuev-bootsanhaenger.html"'),source);
 const corrected=['ratgeber-bootsanhaenger.html','zulassung.html','faq.html'].map(read).join('\n');
 for(const falseClaim of [/keine individuelle TÜV-Hauptuntersuchung/i,/benötigen aber kein eigenes Kennzeichen/i,/grünes Kennzeichen ist[^.]*nicht vorgesehen/i,/alle zugelassenen Bootsanhänger[^.]*steuerfrei/i]) assert.doesNotMatch(corrected,falseClaim);
});

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
  assert.equal(img.src,`assets/produkte/produkt-${id}.jpg`); assert.equal(img.loading,'lazy'); assert.ok(img.alt);
  assert.ok(fs.existsSync(path.join(ROOT,img.src)));
  assert.match(body,new RegExp('id="btn-'+id+'" onclick="addToCart\\('+id+'\\)"'));
 }
});
test('Shop checkout controls have labels and mobile input hints',()=>{
 const s=read('shop.html');
 for(const id of ['anrede','vorname','nachname','email','telefon','strasse','plz','ort','notiz']) assert.ok(s.includes(`for="co-${id}"`));
 assert.match(s,/id="co-plz"[^>]*autocomplete="shipping postal-code"/);
 assert.doesNotMatch(s,/id="co-plz"[^>]*inputmode="numeric"/);
 assert.match(s,/id="shopSearch" type="search"/);
 assert.match(s,/id="shopCategory"/);
 assert.match(s,/<noscript>[\s\S]*?HEKU kontaktieren/);
});
test('Shop displays the unchanged official EU legal-guarantee notice',()=>{
 const s=read('shop.html');
 const asset='assets/legal/eu-gewaehrleistung-de.svg';
 const bytes=fs.readFileSync(path.join(ROOT,asset));
 const normalized=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
 assert.equal(createHash('sha256').update(normalized).digest('hex'),'fd39364dbe42fa775ff55fb9b7aa80c377a5d04219929fef86a8522eed486b1a');
 assert.match(s,/class="info-item guarantee-trigger"[^>]+openGuaranteeNotice/);
 assert.match(s,new RegExp(`<img[^>]+src="${asset.replace(/[./]/g,'\\$&')}"`));
 assert.match(s,/class="guarantee-checkout"[^>]+openGuaranteeNotice/);
 assert.match(s,/https:\/\/europa\.eu\/youreurope\/citizens\/consumers\/shopping\/guarantees\/index_de\.htm/);
 assert.match(s,/dialog\.showModal\(\)/);
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
 assert.deepEqual(urls,pages().map(urlForFile));
 assert.equal(new Set(urls).size,urls.length);
});
test('Technical pinout page is indexable, internally linked and has both diagrams',()=>{
 const file='technik-bootsanhaenger.html', s=read(file);
 assert.match(s,/<title>Anhänger-Steckerbelegung: 7- &amp; 13-polig \| HEKU<\/title>/);
 assert.ok(s.includes(`<link rel="canonical" href="${BASE}/${file}">`));
 assert.equal((s.match(/<h1\b/g)||[]).length,1);
 assert.equal((s.match(/<figure class="diagram">/g)||[]).length,2);
 for(const image of ['assets/technik/steckerbelegung-7-polig.png','assets/technik/steckerbelegung-13-polig.png']) {
  assert.ok(s.includes(`src="${image}"`),image);
  assert.ok(fs.existsSync(path.join(ROOT,image)),image);
 }
 assert.ok(read('ratgeber-bootsanhaenger.html').includes(`href="${file}"`));
 const schemas=JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.deepEqual(schemas['@graph'].map(x=>x['@type']),['TechArticle','BreadcrumbList']);
 assert.equal(exclusionReason(file,s),null);
 assert.ok(pages().includes(file));
});
test('Every indexable page links to the technical data page',()=>{
 for(const file of pages()) {
  const href=file.startsWith('artikel/')?'/technik-bootsanhaenger.html':'technik-bootsanhaenger.html';
  assert.ok(read(file).includes(`href="${href}"`),file);
 }
 assert.ok(read('scripts/templates/product-page.tpl').includes('href="technik-bootsanhaenger.html"'));
});
test('Google verification preserved; conversion stub has no executable code',()=>{
 for(const file of ['google01302b5f976ee5dc.html','google16d7d28f72100acd.html']) assert.equal(read(file).trim(),'google-site-verification: '+file);
 const stub=read('heku-conversion-block.html');
 assert.match(stub,/<meta name="robots" content="noindex,follow">/);
 assert.doesNotMatch(stub,/<script\b|<form\b|<iframe\b/i);
});
test('No internal homepage href still uses index.html',()=>{
 for(const file of [...fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')), ...pages().filter(f=>f.startsWith('artikel/'))]) {
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
 assert.match(s,/tel:\+49521200066/);
});
test('HEKU phone matches Robin’s confirmation: 0521 200066',()=>{
 for(const file of [...fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')), ...pages().filter(f=>f.startsWith('artikel/'))]) {
  assert.doesNotMatch(read(file),/href=["']tel:\+4952120066["']/i,file);
  assert.doesNotMatch(read(file),/0521 20066(?!\d)/,file);
  assert.doesNotMatch(read(file),/20899840/,file);
 }
 for(const file of ['shop.html','kontakt.html','impressum.html']) assert.ok(read(file).includes('tel:+49521200066'),file);
});
test('Konfigurator CSS regression guards',()=>{
 const s=read('konfigurator.html');
 assert.match(s,/\.sidebar \{ position: relative; top: auto;/);
 assert.doesNotMatch(s,/\.main 100%|z-index:1;\}padding:|fill:var\(--rot\);\} 100%/);
});
test('Inline JavaScript compiles and JSON-LD parses on all pages',()=>{
 for(const file of [...fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')), ...pages().filter(f=>f.startsWith('artikel/'))]) {
  let i=0;
  for(const m of read(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
   i++; const a=attributes(m[1]);
   if(a.type==='application/ld+json') JSON.parse(m[2]);
   else if(!a.src && (!a.type || /^(text|application)\/javascript$/.test(a.type))) new vm.Script(m[2],{filename:file+':script'+i});
  }
 }
});

test('self-hosted fonts replace Google hosts and include valid local assets and licenses',()=>{
 const htmlFiles=[
  ...fs.readdirSync(ROOT).filter(file=>file.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT,'artikel')).filter(file=>file.endsWith('.html')).map(file=>`artikel/${file}`)
 ];
 const template='scripts/templates/product-page.tpl';
 const externalFontHost=/fonts\.(?:googleapis|gstatic)\.com/i;
 assert.match('<link href="https://fonts.googleapis.com/css2?family=DM+Sans">',externalFontHost,'positive control');

 let localStylesheetCount=0;
 for(const file of [...htmlFiles,template]) {
  const source=read(file);
  assert.doesNotMatch(source,externalFontHost,file);
  if(source.includes('href="/assets/css/fonts.css"')) localStylesheetCount++;
 }
 assert.ok(localStylesheetCount>=90,`only ${localStylesheetCount} local font stylesheet links found`);
 assert.match(read(template),/href="\/assets\/css\/fonts\.css"/);

 const fontCss=read('assets/css/fonts.css');
 assert.doesNotMatch(fontCss,/https?:\/\//);
 for(const family of ['Bebas Neue','Crimson Pro','DM Sans','DM Serif Display','IBM Plex Mono','Spectral']) {
  assert.ok(fontCss.includes(`font-family: '${family}'`),family);
 }
 const fontUrls=[...fontCss.matchAll(/url\('\.\.\/fonts\/([^']+\.woff2)'\)/g)].map(match=>match[1]);
 assert.equal(new Set(fontUrls).size,10);
 for(const filename of new Set(fontUrls)) {
  const fontPath=path.join(ROOT,'assets','fonts',filename);
  assert.ok(fs.statSync(fontPath).size>10_000,filename);
  assert.equal(fs.readFileSync(fontPath).subarray(0,4).toString('ascii'),'wOF2',filename);
 }
 for(const family of ['Bebas-Neue','Crimson-Pro','DM-Sans','DM-Serif-Display','IBM-Plex-Mono','Spectral']) {
  const license=read(`assets/fonts/OFL-${family}.txt`);
  assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/);
 }
});

test('GA4 basic consent blocks Google until opt-in and keeps every tracked page behind the manager',()=>{
 const htmlFiles=[
  ...fs.readdirSync(ROOT).filter(file=>file.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT,'artikel')).filter(file=>file.endsWith('.html')).map(file=>`artikel/${file}`)
 ];
 const template='scripts/templates/product-page.tpl';
 const googleTagHost=/https:\/\/www\.googletagmanager\.com\/gtag\/js/i;
 assert.match('<script src="https://www.googletagmanager.com/gtag/js?id=TEST"></script>',googleTagHost,'positive control');

 let managedPages=0;
 for(const file of [...htmlFiles,template]) {
  const source=read(file);
  assert.doesNotMatch(source,googleTagHost,file);
  assert.doesNotMatch(source,/gtag\(['"]config['"],\s*['"]G-W97K9YN3YJ['"]\)/,file);
  if(source.includes('src="/heku-consent-v2.js?v=20261009-ga4"')) managedPages++;
  if(/(?:window\.)?gtag\(['"]event['"]/.test(source)) {
   assert.ok(source.includes('src="/heku-consent-v2.js?v=20261009-ga4"'),`${file}: event tracking without consent manager`);
  }
 }
 // 94 bestehende Seiten + 13 generierte Modellseiten (bootsanhaenger-b*.html)
 assert.equal(managedPages,107);

 const privacy=read('datenschutz.html');
 assert.match(privacy,/Ohne Ihre Einwilligung wird das Google-Analytics-Skript nicht geladen/);
 assert.match(privacy,/keine Verbindung zu Google Fonts oder einem anderen Schriftanbieter/);
 assert.doesNotMatch(privacy,/Ohne Ihre Einwilligung wird Google Analytics im sogenannten Consent Mode betrieben/);

 const manager=read('heku-consent-v2.js');
 assert.equal((manager.match(googleTagHost)||[]).length,1);
 assert.match(manager,/analytics_storage: "denied"/);
 assert.match(manager,/analytics_storage: "granted"/);

 function consentHarness(stored) {
  const appended=[],listeners={},storage={};
  if(stored!==null) storage.heku_consent_v1=JSON.stringify({analytics:stored,ts:Date.now()});
  const element=tag=>({
   tagName:tag.toUpperCase(),style:{},className:'',innerHTML:'',async:false,src:'',
   classList:{add(){},remove(){}},setAttribute(name,value){this[name]=value;},
   getAttribute(name){return this[name]||null;},addEventListener(type,fn){listeners[type]=fn;}
  });
  const context=vm.createContext({
   window:{dataLayer:[]},
   document:{
    readyState:'complete',head:{appendChild(node){appended.push(node);}},
    body:{appendChild(node){appended.push(node);}},createElement:element,
    querySelectorAll(){return [];},querySelector(){return null;}
   },
   localStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>{storage[key]=value;},removeItem:key=>{delete storage[key];}},
   location:{reload(){}},requestAnimationFrame:fn=>fn(),Date,JSON,encodeURIComponent
  });
  vm.runInContext(manager,context,{filename:'heku-consent-v2.js'});
  return {context,appended,listeners,storage};
 }

 const undecided=consentHarness(null);
 assert.equal(undecided.appended.filter(node=>node.tagName==='SCRIPT').length,0);
 assert.equal(typeof undecided.context.window.gtag,'undefined');

 const denied=consentHarness(false);
 assert.equal(denied.appended.filter(node=>node.tagName==='SCRIPT').length,0);
 assert.equal(typeof denied.context.window.gtag,'undefined');

 const granted=consentHarness(true);
 const scripts=granted.appended.filter(node=>node.tagName==='SCRIPT');
 assert.equal(scripts.length,1);
 assert.equal(scripts[0].src,'https://www.googletagmanager.com/gtag/js?id=G-W97K9YN3YJ');
 assert.equal(typeof granted.context.window.gtag,'function');
 assert.deepEqual([...granted.context.window.dataLayer].map(args=>args[0]),['consent','js','config','consent']);

 const accepted=consentHarness(null);
 accepted.listeners.click({target:{closest(){return {getAttribute(){return 'allow';}};}}});
 assert.equal(accepted.appended.filter(node=>node.tagName==='SCRIPT').length,1);
 assert.equal(JSON.parse(accepted.storage.heku_consent_v1).analytics,true);
});

test('P0 traffic-law statements use the correct registration fields and complete Tempo-100 conditions',()=>{
 const guide=read('ratgeber-bootsanhaenger.html');
 const faq=read('faq.html');
 const custom=read('bootsanhaenger-nach-mass.html');
 const combined=[guide,faq,custom].join('\n');

 assert.match(guide,/Feld <strong>O\.2<\/strong>/);
 assert.match(guide,/Feld <strong>13<\/strong> nennt dagegen die Stützlast/);
 assert.doesNotMatch(combined,/Anhängelast[^<\n]{0,100}Feld 13/i);
 assert.doesNotMatch(combined,/Zugfahrzeug muss ebenfalls (?:für 100 km\/h mit Anhänger )?freigegeben/i);
 assert.doesNotMatch(combined,/Zugfahrzeug für 100 km\/h mit Anhänger zugelassen/i);

 for(const html of [guide,faq]) {
  assert.match(html,/ABS\/ABV/);
  assert.match(html,/sechs Jahre/);
  assert.match(html,/Masseverhältnis/);
  assert.match(html,/Stützlast/);
  assert.match(html,/Tempo-100-Plakette/);
  assert.match(html,/100kmh-regelung\.html/);
 }

 assert.doesNotMatch(guide,/>100 km\/h-Zulassung – (?:Einachsig|Tandem)</);
 assert.match(guide,/Radstoßdämpfer-Paket für Tempo-100-Konfiguration – Einachsig/);
 assert.match(custom,/Radstoßdämpfer-Paket: 280 €/);
 assert.match(custom,/Radstoßdämpfer-Paket: 140 € \(Einachser\)/);
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

// Checkout regressions: isolated mocks, no real requests.
// Actual checkout functions tested with isolated mocks: never makes network calls.
const source=fs.readFileSync(new URL('../shop.html',import.meta.url),'utf8');
const submit=source.match(/  async function submitOrder\(\) \{[\s\S]*?\n  \}/)[0];
const close=source.match(/  function closeCheckout\(\) \{[\s\S]*?\n  \}/)[0];
function harness({order='ok',mail='ok'}={}) {
 const nodes=new Map(),timers=new Map(),requests=[],pending=[];let n=0,clock=1000,syncCount=0;
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set(id==='modalOverlay'?['open']:[]);
   nodes.set(id,{value:'Test',checked:true,disabled:false,textContent:'',style:{},attrs:{},scrollTop:100,focus(){this.focused=true;},checkValidity:()=>true,setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];},getAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name)?this.attrs[name]:null;},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}});
  }return nodes.get(id);
 };
 node('co-email').value='qa@example.invalid';
 node('co-telefon').value='+49 521 200066';
 node('co-plz').value='33719';
 node('co-strasse').value='Teststraße 1';
 const fetch=async(url,options)=>{
  const isOrder=url.includes('formspree');const behavior=isOrder?order:mail;
  requests.push({type:isOrder?'order':'mail',body:JSON.parse(options.body)});
  if(behavior==='pending')return new Promise((resolve,reject)=>{pending.push({type:isOrder?'order':'mail',resolve});options.signal.addEventListener('abort',()=>reject(new Error('AbortError')),{once:true});});
  return {ok:behavior==='ok',status:behavior==='ok'?200:503,text:async()=> 'Mock error'};
 };
 const ctx=vm.createContext({document:{getElementById:node,querySelector:node},fetch,AbortController,console:{error(){}},Date:{now:()=>++clock},setTimeout:(fn,ms)=>{timers.set(++n,{fn,ms});return n;},clearTimeout:id=>timers.delete(id),syncShopDialog:()=>syncCount++,updateCartUI:()=>{},createHubSpotContact:()=>{},calcVersand:()=>10,fmt:n=>n.toFixed(2)+' €'});
 const api=vm.runInContext(`let cart=[{id:54,artnr:85027,name:'Testlampe',preis:20.25,qty:2}];let orderSubmitting=false;${submit}\n${close};({submitOrder,closeCheckout,state:()=>({cart,orderSubmitting}),setCart:x=>cart=x})`,ctx);
 return {api,node,requests,pending,timers,synced:()=>syncCount,tick:ms=>{for(const t of [...timers.values()])if(t.ms===ms)t.fn();}};
}
test('Accepted order and accepted mail show success; return-to-shop is unlocked',async()=>{
 const h=harness();await h.api.submitOrder();
 assert.equal(h.api.state().cart.length,0);assert.equal(h.api.state().orderSubmitting,false);
 assert.deepEqual(h.requests.map(x=>x.type),['order','mail']);
 assert.equal(h.requests[1].body.template_params.email,'qa@example.invalid');
 assert.match(h.node('orderMailStatus').textContent,/zum Versand angenommen/);
 assert.equal(h.node('checkoutForm').style.display,'none');assert.ok(h.node('orderSuccessTitle').focused);
 h.api.closeCheckout();assert.equal(h.node('modalOverlay').classList.contains('open'),false);assert.equal(h.synced(),1);assert.equal(h.timers.size,0);
});
test('Mail rejection does not undo accepted order or leave success dialog locked',async()=>{
 const h=harness({mail:'error'});await h.api.submitOrder();
 assert.equal(h.api.state().cart.length,0);assert.ok(h.node('orderSuccess').classList.contains('show'));
 assert.match(h.node('orderMailStatus').textContent,/E-Mail-Versand konnte nicht bestätigt/);
 h.api.closeCheckout();assert.equal(h.node('modalOverlay').classList.contains('open'),false);
});
test('Rejected order preserves cart, unlocks retry and never sends confirmation',async()=>{
 const h=harness({order:'error'});await h.api.submitOrder();
 assert.equal(h.api.state().cart.length,1);assert.equal(h.requests.length,1);assert.equal(h.node('orderBtn').disabled,false);
 assert.match(h.node('co-error').textContent,/vor einem erneuten Absenden/);assert.equal(h.api.state().orderSubmitting,false);
 h.api.closeCheckout();assert.equal(h.node('modalOverlay').classList.contains('open'),false);
});
test('Pending order blocks duplicate submit and closes only after timeout/failure',async()=>{
 const h=harness({order:'pending'});const p=h.api.submitOrder();await h.api.submitOrder();h.api.closeCheckout();
 assert.equal(h.requests.length,1);assert.equal(h.node('modalOverlay').classList.contains('open'),true);
 h.tick(20000);await p;assert.equal(h.api.state().orderSubmitting,false);assert.equal(h.api.state().cart.length,1);
 h.api.closeCheckout();assert.equal(h.node('modalOverlay').classList.contains('open'),false);assert.equal(h.timers.size,0);
});
test('Pending confirmation allows immediate exit; mail timeout shows honest warning',async()=>{
 const h=harness({mail:'pending'});const p=h.api.submitOrder();await new Promise(setImmediate);
 assert.equal(h.api.state().cart.length,0);h.api.closeCheckout();assert.equal(h.node('modalOverlay').classList.contains('open'),false);
 h.tick(15000);await p;assert.match(h.node('orderMailStatus').textContent,/E-Mail-Versand konnte nicht bestätigt/);assert.equal(h.timers.size,0);
});
test('Validation and empty cart prevent network calls',async()=>{
 for(const setting of ['missing','email','consent','empty','phone','phone-empty']){
  const h=harness();if(setting==='missing')h.node('co-vorname').value='';if(setting==='email')h.node('co-email').checkValidity=()=>false;
  if(setting==='consent')h.node('co-consent').checked=false;if(setting==='empty')h.api.setCart([]);
  if(setting==='phone')h.node('co-telefon').value='12345';if(setting==='phone-empty')h.node('co-telefon').value='';
  await h.api.submitOrder();assert.equal(h.requests.length,0,setting);
 }
});
test('Every toggleFaq page reveals the answer when the item is open',()=>{
 const files=fs.readdirSync(ROOT).filter(f=>f.endsWith('.html'));
 const broken=[];
 for(const file of files){
  const page=read(file);
  if(!page.includes('function toggleFaq') || !/\.faq-answer[^{]*\{[^}]*max-height:\s*0/.test(page)) continue;
  if(!/\.faq-item\.open \.faq-answer[^{]*\{[^}]*max-height:\s*[1-9]/.test(page)) broken.push(file);
 }
 assert.deepEqual(broken,[]);
});
test('Ruderbootanhänger FAQ reveals its answer and the video stays within native pixels',()=>{
 const page=read('ruderbootanhaenger.html');
 assert.match(page,/\.faq-answer\{max-height:0;overflow:hidden;/);
 assert.match(page,/\.faq-item\.open \.faq-answer\{max-height:800px;\}/);
 const questions=[...page.matchAll(/<button class="faq-question" onclick="toggleFaq\(this\)">/g)];
 const items=[...page.matchAll(/<div class="faq-item">/g)];
 assert.equal(questions.length, items.length);
 assert.ok(questions.length>=4);
 assert.match(page,/function toggleFaq\(btn\)/);
 assert.match(page,/width="576" height="1024"/);
 assert.match(page,/grid-template-columns:minmax\(0,1fr\) 320px/);
 assert.match(page,/max-width:576px/);
 assert.equal(page.match(/"duration": "PT19S"/g).length,1);
 const video=fs.statSync(path.join(ROOT,'assets/video/B1300_Mehrstock_Ruderboot.mp4'));
 assert.ok(video.size>4_000_000 && video.size<=6*1024*1024, `video ${video.size} bytes`);
 const jpeg=fs.readFileSync(path.join(ROOT,'assets/video/B1300_Mehrstock_Ruderboot_poster.jpg'));
 let i=2, size=null;
 while(i+8<jpeg.length && jpeg[i]===0xff){
  const marker=jpeg[i+1];
  if(marker===0xc0 || marker===0xc2){ size={h:jpeg.readUInt16BE(i+5), w:jpeg.readUInt16BE(i+7)}; break; }
  i+=2+jpeg.readUInt16BE(i+2);
 }
 assert.deepEqual(size,{w:576,h:1024});
});
test('VideoObject uploadDate has a timezone and offer availability is a schema.org URL',()=>{
 const itemAvailability=new Set([
  'https://schema.org/BackOrder','https://schema.org/Discontinued','https://schema.org/InStock',
  'https://schema.org/InStoreOnly','https://schema.org/LimitedAvailability','https://schema.org/MadeToOrder',
  'https://schema.org/OnlineOnly','https://schema.org/OutOfStock','https://schema.org/PreOrder',
  'https://schema.org/PreSale','https://schema.org/Reserved','https://schema.org/SoldOut'
 ]);
 const isoWithZone=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
 const trailers=new Set(['index.html','bootstrailer.html','motorbootanhaenger.html','segelbootanhaenger.html','jollenanhaenger.html','ruderbootanhaenger.html',...fs.readdirSync(ROOT).filter(file=>/^bootsanhaenger-b\d+\.html$/.test(file))]);
 const htmlFiles=[
  ...fs.readdirSync(ROOT).filter(file=>file.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT,'artikel')).filter(file=>file.endsWith('.html')).map(file=>`artikel/${file}`)
 ];
 let videos=0, offers=0;
 for(const file of [...htmlFiles,'scripts/templates/product-page.tpl','scripts/generate-product-pages.mjs','scripts/build-site.mjs','content/produkte/produkte.json','scripts/templates/model-page.tpl','scripts/generate-model-pages.mjs','content/modelle/modelle.json']) {
  assert.doesNotMatch(read(file),/"uploadDate"\s*:\s*"\d{4}-\d{2}-\d{2}"/,file);
  assert.doesNotMatch(read(file),/availability["']?\s*[:=]\s*["'](?!https:\/\/schema\.org\/)[A-Za-z]/,file);
 }
 for(const file of htmlFiles) {
  let pageOffers=0;
  for(const block of read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
   const data=JSON.parse(block[1]);
   const stack=[data];
   while(stack.length) {
    const node=stack.pop();
    if(!node||typeof node!=='object') continue;
    if(Array.isArray(node)) { stack.push(...node); continue; }
    if(node['@type']==='VideoObject') {
     videos++;
     assert.match(node.uploadDate,isoWithZone,`${file} uploadDate`);
    }
    if(typeof node.availability==='string') {
     offers++; pageOffers++;
     assert.ok(itemAvailability.has(node.availability),`${file}: ${node.availability}`);
     if(trailers.has(file)) assert.equal(node.availability,'https://schema.org/BackOrder',file);
     if(file.startsWith('artikel/')) assert.equal(node.availability,'https://schema.org/InStock',file);
    }
    for(const value of Object.values(node)) if(value&&typeof value==='object') stack.push(value);
   }
  }
  if(file.startsWith('artikel/') && exclusionReason(path.basename(file),read(file))!=='noindex') assert.equal(pageOffers,1,file);
 }
 assert.equal(videos,1);
 assert.equal((read('ruderbootanhaenger.html').match(/"uploadDate": "2026-10-09T12:00:00\+02:00"/g)||[]).length,1);
 assert.match(read('scripts/generate-product-pages.mjs'),/availability:'https:\/\/schema\.org\/InStock'/);
});
test('Every offer has availability and every product image is an absolute URL',()=>{
 const trailers=new Set(['index.html','bootstrailer.html','motorbootanhaenger.html','segelbootanhaenger.html','jollenanhaenger.html','ruderbootanhaenger.html','bootsanhaenger-nach-mass.html','produkte.html',...fs.readdirSync(ROOT).filter(file=>/^bootsanhaenger-b\d+\.html$/.test(file))]);
 const htmlFiles=[
  ...fs.readdirSync(ROOT).filter(file=>file.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT,'artikel')).filter(file=>file.endsWith('.html')).map(file=>`artikel/${file}`)
 ];
 let offers=0, products=0;
 const types=value=>[].concat(value||[]);
 for(const file of htmlFiles) {
  for(const block of read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
   const data=JSON.parse(block[1]);
   const stack=[data];
   while(stack.length) {
    const node=stack.pop();
    if(!node||typeof node!=='object') continue;
    if(Array.isArray(node)) { stack.push(...node); continue; }
    const kind=types(node['@type']);
    if(kind.includes('ItemList')) {
     const items=node.itemListElement;
     if(Array.isArray(items) && node.numberOfItems!=null) assert.equal(node.numberOfItems, items.length, file);
     if(['index.html','bootstrailer.html','jollenanhaenger.html','motorbootanhaenger.html','segelbootanhaenger.html'].includes(file)) {
      const productsInList=Array.isArray(items) && items.some(el=>el&&el.item&&types(el.item['@type']).includes('Product'));
      assert.equal(productsInList,false,`${file}: Kategorie-ItemList ohne Product`);
     }
     if(file==='jollenanhaenger.html' || file==='bootstrailer.html') assert.equal(node.numberOfItems,undefined,file);
    }
    if(kind.includes('Product')) {
     products++;
     const images=[].concat(node.image||[]);
     assert.ok(images.length,`${file}: Product image fehlt`);
     for(const image of images) assert.match(String(image),/^https:\/\/heku-fahrzeugbau\.de\//,`${file} image`);
    }
    if(kind.includes('Offer')||kind.includes('AggregateOffer')) {
     offers++;
     assert.equal(typeof node.availability,'string',`${file}: availability fehlt`);
     assert.match(node.availability,/^https:\/\/schema\.org\//,file);
     if(node.availability==='https://schema.org/BackOrder') assert.match(String(node.availabilityStarts),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,`${file}: BackOrder availabilityStarts`);
     if(trailers.has(file)) assert.equal(node.availability,'https://schema.org/BackOrder',file);
     if(file.startsWith('artikel/')) assert.equal(node.availability,'https://schema.org/InStock',file);
     assert.equal(node.priceValidUntil,undefined,`${file}: priceValidUntil`);
     assert.equal(node.validFrom,undefined,`${file}: validFrom`);
     if(trailers.has(file) && node.price!=null) {
      const place=node.availableAtOrFrom;
      assert.ok(place&&place.address,`${file}: availableAtOrFrom fehlt`);
      assert.equal(place.address.streetAddress,'Bunzlauer Straße 6',file);
      assert.equal(place.address.addressLocality,'Bielefeld',file);
      assert.equal(place.address.postalCode,'33719',file);
      assert.equal(place.address.addressRegion,'Nordrhein-Westfalen',file);
      assert.equal(place.address.addressCountry,'DE',file);
      const rp=node.hasMerchantReturnPolicy;
      assert.equal(rp&&rp.returnPolicyCategory,'https://schema.org/MerchantReturnNotPermitted',file);
      assert.equal(rp.applicableCountry,'DE',file);
      assert.equal(rp.merchantReturnLink,'https://heku-fahrzeugbau.de/agb.html#ausschluss-einzelanfertigung',file);
      // Anhänger: Abholung, kein Standardversand, kein (Gratis-)Versandpreis.
      assert.deepEqual(node.shippingDetails,{'@type':'OfferShippingDetails',shippingDestination:{'@type':'DefinedRegion',addressCountry:'DE'},doesNotShip:true},`${file}: shippingDetails`);
      assert.equal(node.availableDeliveryMethod,'http://purl.org/goodrelations/v1#DeliveryModePickUp',file);
      if(file==='index.html') {
       assert.notEqual(node.url,'https://heku-fahrzeugbau.de/');
       assert.notEqual(node.url,'https://heku-fahrzeugbau.de');
      }
     }
     if(trailers.has(file) && node.price==null) assert.equal(node.availableAtOrFrom,undefined,`${file}: Abholung nur an Angeboten mit Preis`);
    }
    for(const value of Object.values(node)) if(value&&typeof value==='object') stack.push(value);
   }
  }
 }
 assert.ok(products>=55);
 assert.ok(offers>=69);
 assert.match(read('agb.html'), /<p id="ausschluss-einzelanfertigung"><strong>Ausschluss des Widerrufsrechts:<\/strong>/);
 assert.match(read('scripts/generate-product-pages.mjs'),/p\.image\|\|p\.imagePath/);
});
test('Late mail response cannot overwrite status of a newer order',async()=>{
 const h=harness({mail:'pending'});const p1=h.api.submitOrder();await new Promise(setImmediate);
 h.api.setCart([{id:54,artnr:85027,name:'Test',preis:20.25,qty:1}]);const p2=h.api.submitOrder();await new Promise(setImmediate);
 const ref=h.node('orderRef').textContent;
 h.pending[1].resolve({ok:true,status:200});await p2;const status=h.node('orderMailStatus').textContent;
 h.pending[0].resolve({ok:false,status:503,text:async()=> 'Late mock error'});await p1;
 assert.equal(h.node('orderRef').textContent,ref);assert.equal(h.node('orderMailStatus').textContent,status);
});

test('Inquiry forms require phone and full address',()=>{
 const forms=[
  ['kontakt.html','telefon','strasse','plz','ort'],
  ['haendler.html','h-telefon','h-strasse','h-plz','h-ort'],
  ['konfigurator.html','telefon','strasse','plz','ort'],
  ['shop.html','co-telefon','co-strasse','co-plz','co-ort']
 ];
 const phonePattern='\\+?[0-9\\s\\/\\(\\)\\-]{6,30}';
 const plzPattern='[0-9A-Za-z \\-]{4,10}';
 for(const [file,phoneId,streetId,plzId,cityId] of forms){
  const html=read(file);
  for(const id of [phoneId,streetId,plzId,cityId]){
   const tag=html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>','i'));
   assert.ok(tag,file+' #'+id);
   assert.match(tag[0],/\brequired\b/,file+' #'+id+' required');
   assert.match(tag[0],/\bautocomplete="/,file+' #'+id+' autocomplete');
   const label=html.match(new RegExp('<label\\b[^>]*\\bfor="'+id+'"[^>]*>[\\s\\S]*?<\\/label>','i'));
   assert.ok(label,file+' label '+id);
   assert.match(label[0],/\*/,file+' label * '+id);
  }
  const phone=html.match(new RegExp('<input\\b[^>]*\\bid="'+phoneId+'"[^>]*>','i'))[0];
  assert.match(phone,/type="tel"/,file+' tel');
  const pattern=phone.match(/\bpattern="([^"]*)"/);
  assert.ok(pattern,file+' phone pattern');
  assert.equal(pattern[1],phonePattern,file+' phone pattern text');
  new RegExp('^(?:'+pattern[1]+')$','v');
  const plz=html.match(new RegExp('<input\\b[^>]*\\bid="'+plzId+'"[^>]*>','i'))[0];
  const plzPat=plz.match(/\bpattern="([^"]*)"/);
  assert.ok(plzPat,file+' plz pattern');
  assert.equal(plzPat[1],plzPattern,file+' plz pattern text');
  new RegExp('^(?:'+plzPat[1]+')$','v');
  assert.doesNotMatch(plz,/inputmode\s*=\s*["']numeric["']/i,file+' plz inputmode');
  for(const field of ['phone','address','zip','city']) assert.match(html,new RegExp("name:\\s*'"+field+"'"),file+' hubspot '+field);
  assert.match(html,/Für Rückfragen und ein passendes Angebot benötigen wir Ihre vollständige Anschrift und eine Telefonnummer\./);
 }
 const haendler=read('haendler.html');
 const region=haendler.match(/<input\b[^>]*\bid="h-region"[^>]*>/i)[0];
 assert.doesNotMatch(region,/\brequired\b/);
 assert.match(haendler,/Vertriebsgebiet \/ Region/);
 assert.match(haendler,/Firmenanschrift/);
 assert.match(haendler,/@media \(max-width: 600px\) \{[^}]*\.form-grid \{ grid-template-columns: 1fr; \}/);
 assert.doesNotMatch(read('konfigurator.html'),/subscriptionTypeId:\s*999/);
 assert.match(read('datenschutz.html'),/Anschrift \(Straße, PLZ, Ort\)/);
});
test('Dealer email subject omits empty parentheses and falls back to the city',()=>{
 const line=read('haendler.html').match(/formData\.append\('subject', ([\s\S]*?)\);/)[1];
 const subject=(firma,region,ort)=>vm.runInNewContext('('+line+')',{firma,region,ort});
 assert.equal(subject('Firma','Nord','Hamburg'),'Händleranfrage – Firma (Nord)');
 assert.equal(subject('Firma','','Hamburg'),'Händleranfrage – Firma (Hamburg)');
 assert.equal(subject('Firma','',''),'Händleranfrage – Firma');
});

// GSC Händlereinträge (19.10.2026): nur von Google unterstützte availability-Werte, Rückgabe und Versand an jedem Angebot mit Preis.
test('Merchant listings: Google-supported availability, image, return policy and shipping on every priced offer',()=>{
 const googleAvailability=new Set(['BackOrder','Discontinued','InStock','InStoreOnly','LimitedAvailability','OnlineOnly','OutOfStock','PreOrder','PreSale','SoldOut'].map(v=>'https://schema.org/'+v));
 const files=[...fs.readdirSync(ROOT).filter(f=>f.endsWith('.html')),...fs.readdirSync(path.join(ROOT,'artikel')).filter(f=>f.endsWith('.html')).map(f=>`artikel/${f}`)];
 let priced=0, trailers=0, accessories=0;
 for(const file of files){
  assert.doesNotMatch(read(file),/schema\.org\/MadeToOrder/,file);
  for(const block of read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
   const stack=[JSON.parse(block[1])];
   while(stack.length){
    const n=stack.pop();
    if(!n||typeof n!=='object') continue;
    if(Array.isArray(n)){stack.push(...n);continue;}
    const t=[].concat(n['@type']||[]);
    if(t.includes('Product')&&n.offers){
     assert.ok([].concat(n.image||[]).length,`${file}: ${n.name} ohne image`);
     for(const o of [].concat(n.offers)){
      if(o.price==null) continue;
      priced++;
      assert.ok(Number(o.price)>0,`${file}: Preis > 0`);
      assert.ok(googleAvailability.has(o.availability),`${file}: availability ${o.availability}`);
      assert.equal(o.priceValidUntil,undefined,`${file}: Preise ohne Ablaufdatum`);
      const rp=o.hasMerchantReturnPolicy; assert.ok(rp&&rp.applicableCountry==='DE',`${file}: Rückgabe fehlt`);
      const sd=o.shippingDetails; assert.ok(sd&&sd.shippingDestination&&sd.shippingDestination.addressCountry==='DE',`${file}: Versand fehlt`);
      if(file.startsWith('artikel/')){
       accessories++;
       assert.equal(o.availability,'https://schema.org/InStock',file);
       assert.equal(rp.returnPolicyCategory,'https://schema.org/MerchantReturnFiniteReturnWindow',file);
       assert.equal(rp.merchantReturnDays,14,file);
       assert.equal(rp.returnFees,'https://schema.org/ReturnFeesCustomerResponsibility',file);
       assert.ok(Number(sd.shippingRate.value)>0,`${file}: nie Gratisversand`);
       const d=sd.deliveryTime; assert.equal(d.handlingTime.minValue+d.transitTime.minValue,2,file); assert.equal(d.handlingTime.maxValue+d.transitTime.maxValue,5,file);
      } else {
       trailers++;
       assert.equal(o.availability,'https://schema.org/BackOrder',file);
       assert.match(String(o.availabilityStarts),/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,`${file}: BackOrder availabilityStarts`);
       assert.equal(rp.returnPolicyCategory,'https://schema.org/MerchantReturnNotPermitted',file);
       assert.equal(sd.doesNotShip,true,file); assert.equal(sd.shippingRate,undefined,file);
      }
     }
    }
    for(const v of Object.values(n)) if(v&&typeof v==='object') stack.push(v);
   }
  }
 }
 assert.equal(accessories,55); assert.equal(trailers,14); assert.equal(priced,69);
 // Organization-weite Rückgaberichtlinie hängt am selben Knoten wie das LocalBusiness (#organization).
 const org=[...read('index.html').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(b=>JSON.parse(b[1])).find(d=>d['@type']==='Organization');
 assert.equal(org['@id'],'https://heku-fahrzeugbau.de/#organization');
 assert.equal(org.hasMerchantReturnPolicy.merchantReturnDays,14);
});

test('Category pages list model URLs and do not repeat Product offers',()=>{
 const expected={
  'index.html':[
   ['Bootsanhänger ungebremst','https://heku-fahrzeugbau.de/bootsanhaenger-b350.html'],
   ['Motorbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b900.html'],
   ['Tandem-Bootstrailer','https://heku-fahrzeugbau.de/bootsanhaenger-b2000.html']
  ],
  'bootstrailer.html':[
   ['HEKU B 350 Bootstrailer','https://heku-fahrzeugbau.de/bootsanhaenger-b350.html'],
   ['HEKU B 1300 Bootsanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b1300.html'],
   ['HEKU B 3500 Tandem-Bootstrailer','https://heku-fahrzeugbau.de/bootsanhaenger-b3500.html']
  ],
  'jollenanhaenger.html':[
   ['HEKU B 350 Jollenanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b350.html'],
   ['HEKU B 500 Jollenanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b500.html']
  ],
  'motorbootanhaenger.html':[
   ['HEKU B 500 Motorbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b500.html'],
   ['HEKU B 1300 Motorbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b1300.html'],
   ['HEKU B 2000 Tandem-Motorbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b2000.html']
  ],
  'segelbootanhaenger.html':[
   ['HEKU B 350 Segelbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b350.html'],
   ['HEKU B 1100 Segelbootanhänger','https://heku-fahrzeugbau.de/bootsanhaenger-b1100.html'],
   ['HEKU B 2000 Tandem-Bootstrailer','https://heku-fahrzeugbau.de/bootsanhaenger-b2000.html']
  ]
 };
 for(const [file,rows] of Object.entries(expected)){
  const blocks=[...read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  const flat=JSON.stringify(blocks);
  assert.doesNotMatch(flat,/"(?:Product|Offer|AggregateOffer)"/,file);
  assert.doesNotMatch(flat,/bootsanhaenger\.jpg|konfigurator\.html/,file);
  const lists=[];
  const stack=[blocks];
  while(stack.length){
   const node=stack.pop();
   if(!node||typeof node!=='object') continue;
   if(Array.isArray(node)){ stack.push(...node); continue; }
   if([].concat(node['@type']||[]).includes('ItemList') && Array.isArray(node.itemListElement) && node.itemListElement.some(el=>el&&String(el.url||'').includes('bootsanhaenger-b'))) lists.push(node);
   for(const value of Object.values(node)) if(value&&typeof value==='object') stack.push(value);
  }
  assert.equal(lists.length,1,file);
  assert.deepEqual(lists[0].itemListElement.map(el=>[el.name,el.url]),rows,file);
  for(const el of lists[0].itemListElement){
   assert.equal(el['@type'],'ListItem',file);
   assert.equal(el.item,undefined,file);
   assert.match(el.url,/^https:\/\/heku-fahrzeugbau\.de\/bootsanhaenger-b\d+\.html$/);
  }
 }
});

test('BackOrder availabilityStarts is Berlin today plus 21 days and the Monday job commits it',()=>{
 assert.equal(berlinAvailabilityStarts(new Date('2026-10-26T10:00:00Z')),'2026-11-16T00:00:00+01:00');
 assert.equal(berlinAvailabilityStarts(new Date('2026-07-01T10:00:00Z')),'2026-07-22T00:00:00+02:00');
 assert.equal(berlinAvailabilityStarts(new Date('2026-03-28T23:30:00Z')),'2026-04-19T00:00:00+02:00');
 assert.equal(berlinAvailabilityStarts(new Date('2026-10-24T22:30:00Z')),'2026-11-15T00:00:00+01:00');
 const iso=committedAvailabilityStarts();
 assert.match(iso,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
 const sample='{"@type":"Offer","price":"8000.00","availability":"https://schema.org/BackOrder"}';
 const stamped=applyBackOrderStarts(sample,iso);
 assert.match(stamped,/"price":"8000\.00"/);
 assert.match(stamped,new RegExp('"availabilityStarts": "'+iso.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'));
 const moved=applyBackOrderStarts(stamped,'2026-12-01T00:00:00+01:00');
 assert.match(moved,/"price":"8000\.00"/);
 assert.match(moved,/2026-12-01T00:00:00\+01:00/);
 assert.doesNotMatch(moved,/2026-11-16T00:00:00/);
 assert.equal(applyBackOrderStarts(read('ruderbootanhaenger.html'),iso),read('ruderbootanhaenger.html'));
 const workflow=read('.github/workflows/availability-starts.yml');
 assert.match(workflow,/cron: '0 6 \* \* 1'/);
 assert.match(workflow,/node scripts\/update-availability-starts\.mjs/);
 assert.match(workflow,/contents: write/);
 assert.match(workflow,/git push/);
 assert.doesNotMatch(workflow,/git push --force/);
 assert.match(read('scripts/update-availability-starts.mjs'),/berlinAvailabilityStarts/);
 assert.match(read('scripts/generate-model-pages.mjs'),/availabilityStarts: committedAvailabilityStarts\(\)/);
});

test('Unknown produkte paths resolve to produkte.html, legacy slugs stay put',()=>{
 const blocks=[...read('404.html').matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(blocks.length,1);
 const cases={
  '/produkte/':'/produkte.html',
  '/produkte':'/produkte.html',
  '/Produkte':'/produkte.html',
  '/Produkte/':'/produkte.html',
  '/PRODUKTE.html':'/produkte.html',
  '/shop/':'/shop.html',
  '/Konfigurator/':'/konfigurator.html',
  '/segelbootanhaenger/':'/segelbootanhaenger.html',
  '/motorbootanhaenger/':'/motorbootanhaenger.html',
  '/jollenanhaenger/':'/jollenanhaenger.html',
  '/ruderbootanhaenger/':'/ruderbootanhaenger.html',
  '/dinghyanhaenger.html':'/jollenanhaenger.html',
  '/dinghyanhaenger/':'/jollenanhaenger.html',
  '/bootsanhaenger/':'/bootstrailer.html',
  '/Bootsanhaenger/':'/bootstrailer.html',
  '/anhaenger/':'/produkte.html',
  '/kontakt/':'/kontakt.html',
  '/wohnmobile/':'/wohnmobile.html',
  '/gibt-es-nicht':'',
  '/produkte.html':'',
  '/artikel/50238.html':'/weiteres-bootsanhaenger-zubehoer.html',
  '/Artikel/50238.HTML':'/weiteres-bootsanhaenger-zubehoer.html',
  '/artikel/50238.html/':'/weiteres-bootsanhaenger-zubehoer.html'
 };
 for(const [pathname,expected] of Object.entries(cases)){
  const replaced=[];
  vm.runInNewContext(blocks[0][1],{window:{location:{pathname,replace:url=>replaced.push(url)}}});
  assert.deepEqual(replaced, expected?[expected]:[], pathname);
 }
 const stub=read('produkte/index.html');
 assert.match(stub,/content="noindex"/);
 assert.match(stub,/rel="canonical" href="https:\/\/heku-fahrzeugbau\.de\/produkte\.html"/);
 assert.match(stub,/url=\/produkte\.html/);
 assert.equal(exclusionReason('index.html',stub),'noindex');
 const retired=read('artikel/50238.html');
 assert.match(retired,/content="noindex"/);
 assert.match(retired,/rel="canonical" href="https:\/\/heku-fahrzeugbau\.de\/weiteres-bootsanhaenger-zubehoer\.html"/);
 assert.match(retired,/url=\/weiteres-bootsanhaenger-zubehoer\.html/);
 assert.match(retired,/location\.replace\("\/weiteres-bootsanhaenger-zubehoer\.html"\)/);
 assert.equal(exclusionReason('50238.html',retired),'noindex');
 assert.equal(pages().includes('artikel/50238.html'),false);
 for(const file of pages()) assert.doesNotMatch(read(file),/artikel\/50238\.html/,file);
 for(const file of ['index.html','produkte.html']){
  const section=read(file).match(/id="bootstyp"[\s\S]*?<\/section>/)[0];
  for(const href of ['segelbootanhaenger.html','motorbootanhaenger.html','jollenanhaenger.html','ruderbootanhaenger.html','konfigurator.html']){
   assert.ok(section.includes(`href="${href}"`), `${file} ${href}`);
  }
  assert.match(section,/Seitenführungsrollen/);
  assert.match(section,/eigenentwickelt/);
  assert.match(section,/Ab 1\.375 €/);
  assert.match(section,/Ab 1\.575 €/);
  assert.match(section,/B 1300 ab 8\.000 €/);
  assert.doesNotMatch(section,/patentiert/i);
 }
 assert.equal((read('produkte.html').match(/<h1\b/g)||[]).length,1);
 assert.equal((read('index.html').match(/<h1\b/g)||[]).length,1);
});
