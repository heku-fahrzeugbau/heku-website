import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, BASE, attributes, generate, pages, render, urlForFile } from './generate-sitemap.mjs';
import { catalog, categories, filename, generateProducts, renderProduct } from './generate-product-pages.mjs';
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const all=catalog();
const schema=s=>JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
test('Robin confirmed prices: Art. 50214 = 75 EUR, Art. 50215 = 185 EUR',()=>{
 for(const [sku,price] of [['50214','75.00'],['50215','185.00']]) {
  const p=all.find(p=>p.sku===sku); assert.ok(p); assert.equal(p.price,price);
  assert.equal(p.priceText,Number(price).toLocaleString('de-DE',{minimumFractionDigits:2})+' €');
  const s=read(filename(p));
  assert.ok(s.includes(`<data value="${price}">${p.priceText}</data>`));
  assert.equal(schema(s)['@graph'][0].offers.price,price);
 }
});
test('Every product has a canonical page, truthful visible price and Product/Offer',()=>{
 const titles=new Set();
 for(const p of all) {
  const s=read(filename(p)), product=schema(s)['@graph'][0];
  assert.equal((s.match(/<h1\b/g)||[]).length,1);
  assert.ok(s.includes(`<link rel="canonical" href="${BASE}/${filename(p)}">`));
  titles.add(s.match(/<title>([^<]+)<\/title>/)[1]);
  assert.equal(product.name,p.name); assert.equal(product.sku,p.sku);
  assert.equal(product.offers.price,p.price); assert.equal(product.offers.priceCurrency,'EUR');
  assert.equal(product.offers.url,BASE+'/'+filename(p));
  assert.ok(s.includes(`<data value="${p.price}">${p.priceText}</data>`));
  assert.ok(!product.offers.availability&&!product.aggregateRating&&!product.gtin&&!product.mpn);
  if(p.image) assert.deepEqual(product.image,[BASE+'/'+p.image]);
  else { assert.equal(product.image,undefined); assert.match(s,/kein Produktfoto hinterlegt/); assert.doesNotMatch(s,/<figure class="detail-photo"/); }
  assert.match(s,/<body>\s*<!--\s*THESIS:/);
  assert.match(s,/FINISH: unreviewed and undocumented is unfinished/);
 }
 assert.equal(titles.size,all.length);
 assert.equal(fs.readdirSync(path.join(ROOT,'artikel')).filter(x=>/^\d+\.html$/.test(x)).length,all.length);
});
test('Shop and category link every product; CTA selects SKU without a second checkout',()=>{
 const shop=read('shop.html');
 for(const p of all) {
  const s=read(filename(p)), category=read(categories[p.category][0]);
  assert.ok(shop.includes(`href="${filename(p)}"`)); assert.ok(category.includes(`href="${filename(p)}"`));
  assert.ok(s.includes(`href="/shop.html?artikel=${p.sku}#shopContent"`));
  assert.doesNotMatch(s,/<form\b|function submitOrder|function addToCart/);
  assert.deepEqual(schema(s)['@graph'][1].itemListElement.map(x=>x.position),[1,2,3,4]);
 }
});
test('Product links, fragments and images resolve locally',()=>{
 for(const p of all) {
  const s=read(filename(p));
  for(const [,href] of s.matchAll(/href="([^"]+)"/g)) {
   const u=new URL(href,BASE+'/'+filename(p)); if(u.origin!==BASE) continue;
   const file=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname.slice(1));
   assert.ok(fs.existsSync(path.join(ROOT,file)),href);
   if(u.hash&&file.endsWith('.html')) assert.ok(read(file).includes(`id="${u.hash.slice(1)}"`),href);
  }
  for(const [tag] of s.matchAll(/<img\b[^>]*>/g)) { const a=attributes(tag); assert.ok(a.alt); assert.ok(fs.existsSync(path.join(ROOT,a.src))); }
 }
});
test('Product images live only in assets/produkte',()=>{
 const images=fs.readdirSync(path.join(ROOT,'assets/produkte')).filter(x=>/^produkt-\d+\.(jpg|jpeg|png|webp)$/i.test(x));
 assert.equal(images.length,all.length);
 assert.deepEqual(fs.readdirSync(ROOT).filter(x=>/^produkt-\d+\.(jpg|jpeg|png|webp)$/i.test(x)),[]);
 for(const p of all) assert.match(p.image??`assets/produkte/produkt-${p.id}.jpg`,/^assets\/produkte\/produkt-\d+\.(jpg|jpeg|png|webp)$/i);
});
test('Article query only recognizes catalog SKUs and never auto-orders',()=>{
 const code=read('shop.html').match(/  const requestedArticle = [\s\S]*?  \/\/ End product page selection\./)[0];
 for(const query of ['', '?artikel=50241','?artikel=50242','?artikel=999999','?artikel=%3Cscript%3E']) {
  const input={value:''}; let filtered=false;
  vm.runInNewContext(code,{URLSearchParams,window:{location:{search:query}},PRODUKTE:all.map(p=>({artnr:Number(p.sku)})),document:{getElementById:()=>input,querySelectorAll:()=>[{dataset:{cat:'alle'}}]},filterCat:el=>{assert.equal(el.dataset.cat,'alle');filtered=true;}});
  const sku=new URLSearchParams(query).get('artikel');
  assert.equal(filtered,all.some(p=>p.sku===sku)); assert.equal(input.value,filtered?sku:'');
 }
});
test('Catalog characters escaped in markup and JSON-LD',()=>{
 const p={...all[0],name:'Teil <script> & "Test"',desc:'</script><img src=x>'};
 const s=renderProduct(p,[p],read('scripts/templates/product-page.tpl'));
 assert.ok(s.includes('Teil &lt;script&gt; &amp; &quot;Test&quot;'));
 assert.equal(schema(s)['@graph'][0].name,p.name); assert.equal(schema(s)['@graph'][0].description,p.desc);
 assert.doesNotMatch(s,/<img src=x>/);
});
test('Generator idempotence, price update, lastmod and fail-closed invalid/removed articles',()=>{
 const root=fs.mkdtempSync(path.join(ROOT,'.product-test-'));
 try {
  fs.mkdirSync(path.join(root,'scripts/templates'),{recursive:true});
  fs.mkdirSync(path.join(root,'artikel'),{recursive:true});
  fs.mkdirSync(path.join(root,'assets/produkte'),{recursive:true});
  for(const f of ['shop.html','sitemap.xml','scripts/templates/product-page.tpl',...Object.values(categories).map(x=>x[0]),...all.map(filename)]) fs.copyFileSync(path.join(ROOT,f),path.join(root,f));
  for(const f of fs.readdirSync(path.join(ROOT,'assets/produkte')).filter(x=>/^produkt-\d+\.jpg$/.test(x))) fs.copyFileSync(path.join(ROOT,'assets/produkte',f),path.join(root,'assets/produkte',f));
  assert.deepEqual(generateProducts(root).changed,[]);
  const file=path.join(root,'shop.html'), old=fs.readFileSync(file,'utf8'), p=all[0];
  fs.writeFileSync(file,old.replace(`value="${p.price}">${p.priceText}`, 'value="299.00">299,00 €'));
  const result=generateProducts(root); assert.ok(result.changed.includes(filename(p)));
  assert.equal(schema(fs.readFileSync(path.join(root,filename(p)),'utf8'))['@graph'][0].offers.price,'299.00');
  const xml=generate(root,{modifiedFiles:new Set(result.changed),modifiedDate:'2026-08-31'});
  assert.ok(xml.includes(`<loc>${BASE}/${filename(p)}</loc>\n    <lastmod>2026-08-31</lastmod>`));
  assert.deepEqual(generateProducts(root).changed,[]);
  fs.writeFileSync(file,old.replace(`value="${p.price}">`,'value="1.00">'));
  assert.throws(()=>generateProducts(root),/widersprechen/);
  fs.writeFileSync(file,old.replace(/<article class="product-card"[^>]*>[\s\S]*?<\/article>/,''));
  assert.throws(()=>generateProducts(root),/Alte URLs zuerst/);
 } finally {
  if(path.dirname(root)!==ROOT||!path.basename(root).startsWith('.product-test-')) throw Error('Unsafe cleanup path');
  fs.rmSync(root,{recursive:true,force:true});
 }
});
test('Workflow builds/tests, commits managed pages, then explicitly requests Pages build',()=>{
 const w=read('.github/workflows/sitemap.yml');
 for(const s of ['pages: write','node scripts/build-site.mjs','scripts/test-products.mjs','artikel/','gh api --method POST','/pages/builds']) assert.ok(w.includes(s),s);
 assert.doesNotMatch(w,/git push --force/);
});

test('Nested article sitemap preserves path separators and excludes non-public directories',()=>{
 assert.equal(urlForFile('artikel/50241.html'),BASE+'/artikel/50241.html');
 assert.ok(render(['artikel/test & foto.html']).includes('/artikel/test%20%26%20foto.html'));
 const root=fs.mkdtempSync(path.join(ROOT,'.product-test-'));
 try {
  const doc='<html><head><title>Test</title></head><body></body></html>';
  for(const f of ['index.html','artikel/50241.html','artikel/404.html','artikel/google123.html','scripts/template.html','docs/private.html','backup/old.html']) {
   fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true}); fs.writeFileSync(path.join(root,f),doc);
  }
  fs.writeFileSync(path.join(root,'artikel/hidden.html'),doc.replace('</head>','<meta name="robots" content="noindex"></head>'));
  assert.deepEqual(pages(root),['artikel/50241.html','index.html']);
 } finally {
  if(path.dirname(root)!==ROOT||!path.basename(root).startsWith('.product-test-')) throw Error('Unsafe cleanup path');
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('Nested pages use root-anchored internal navigation, CSS, scripts and images',()=>{
 for(const p of all) for(const [,attr,url] of read(filename(p)).matchAll(/\b(href|src)="([^"]+)"/g)) {
  assert.ok(/^(\/|#|https?:|tel:|mailto:)/.test(url),`${filename(p)} ${attr}=${url}`);
 }
 const w=read('.github/workflows/sitemap.yml');
 const pr=w.match(/  check-pr:[\s\S]*?(?=  sitemap:)/)[0];
 assert.match(pr,/github.event_name == 'pull_request'/);
 assert.doesNotMatch(pr,/git push|git commit|gh api --method POST|ref: main/);
});
